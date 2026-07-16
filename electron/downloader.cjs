const path = require('path');
// Ensure youtube-dl-exec and ffmpeg run from the unpacked ASAR directory in production
const defaultBinDir = path.join(__dirname, '..', 'node_modules', 'youtube-dl-exec', 'bin');
process.env.YOUTUBE_DL_DIR = defaultBinDir.replace('app.asar', 'app.asar.unpacked');

const youtubedl = require('youtube-dl-exec');
const ffmpeg = require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked');
const fs = require('fs');
const os = require('os');
const https = require('https');
const crypto = require('crypto');
const { app } = require('electron');

const streamCache = new Map(); // videoId => { url, timestamp }
const CACHE_DURATION = 3 * 60 * 60 * 1000; // 3 hours

// ─── youtubei.js Innertube singleton ────────────────────────────────────────
// We load it lazily because it's an ESM module
let _innertube = null;
let _innertubePromise = null;

async function getInnertube() {
  if (_innertube) return _innertube;
  if (_innertubePromise) return _innertubePromise;

  _innertubePromise = (async () => {
    // youtubei.js is ESM-only so we use dynamic import
    const { Innertube, UniversalCache } = await import('youtubei.js');
    _innertube = await Innertube.create({
      // Use local session generation — zero centralised server needed
      generate_session_locally: true,
      // Cache is optional but speeds up repeated calls
      cache: new UniversalCache(false),
    });
    console.log('[Innertube] Initialized successfully');
    return _innertube;
  })();

  return _innertubePromise;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract the highest-resolution thumbnail URL from a youtubei.js thumbnail array.
 */
function bestThumb(thumbnails) {
  if (!thumbnails || !thumbnails.length) return null;
  // Already sorted smallest→largest by the library
  return thumbnails[thumbnails.length - 1].url;
}

/**
 * Normalise an artist value that can be a string, object {name} or array.
 */
function normalizeArtist(raw) {
  if (!raw) return 'Unknown Artist';
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) {
    return raw.map(a => (typeof a === 'string' ? a : a?.name || 'Unknown')).join(', ');
  }
  if (typeof raw === 'object') return raw.name || 'Unknown Artist';
  return String(raw);
}

function cleanArtistName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isArtistMatch(albumArtist, targetArtist) {
  const target = cleanArtistName(targetArtist);
  if (!target) return false;
  
  const primaryArtists = albumArtist
    .split(/[,&]|\band\b/i)
    .map(x => cleanArtistName(x))
    .filter(Boolean);
    
  return primaryArtists.some(p => p === target);
}

/**
 * Parse a "m:ss" or "h:mm:ss" string into total seconds.
 */
function parseDurationString(str) {
  if (!str) return 0;
  const parts = String(str).split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

/**
 * Format seconds into "m:ss".
 */
function formatDuration(seconds) {
  const s = Math.floor(seconds || 0);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

// ─── Quality / originality filters ───────────────────────────────────────────

const EXCLUDE_TITLE_KEYWORDS = [
  'remix', 'cover', 'live', 'lofi', 'lo-fi', 'instrumental', 'karaoke',
  'slowed', 'reverb', 'speed up', 'sped up', '8d', 'tribute', 'parody',
  'piano cover', 'acoustic cover', 'tribute version', 'originally performed',
];
const EXCLUDE_ARTIST_KEYWORDS = [
  'tribute', 'cover band', 'lofi', 'lo-fi', 'instrumental', 'orchestra', 'karaoke',
];

function isOriginalTitle(title) {
  if (!title) return false;
  const t = title.toLowerCase();
  return !EXCLUDE_TITLE_KEYWORDS.some(k => t.includes(k));
}

function isOriginalArtist(artist) {
  if (!artist) return false;
  const a = artist.toLowerCase();
  return !EXCLUDE_ARTIST_KEYWORDS.some(k => a.includes(k));
}

// ─── Phonetic normalization for Hindi/mixed queries ──────────────────────────

function normalizePhonetics(str) {
  if (!str) return '';
  return str.toLowerCase()
    .replace(/aa/g, 'a').replace(/ee/g, 'i').replace(/oo/g, 'u')
    .replace(/y/g, 'i').replace(/ae/g, 'e').replace(/h/g, '')
    .replace(/[^a-z0-9]/g, '');
}

const SEARCH_STOP_WORDS = new Set([
  'song', 'songs', 'music', 'track', 'tracks', 'video', 'audio',
  'official', 'lyrics', 'lyric',
]);

/**
 * Returns true if the result matches the search query terms well enough.
 */
function matchesQuery(queryTerms, title, artist) {
  const normArtist = normalizePhonetics(artist);
  const normTitle = normalizePhonetics(title);
  const normTerms = queryTerms.map(t => normalizePhonetics(t));
  const matching = normTerms.filter(t => normArtist.includes(t) || normTitle.includes(t));
  const ratio = matching.length / normTerms.length;
  return normTerms.length <= 2 ? ratio >= 0.99 : ratio >= 0.60;
}

// ─── Main Downloader class ────────────────────────────────────────────────────

class Downloader {
  constructor(db) {
    this.db = db;
    this.queue = [];
    this.activeDownloads = new Map();
    this.maxConcurrent = 2;
    this.completed = [];
    this.searchCache = new Map(); // key => { data, timestamp }
    this.webContents = null;
    this.activeResolutions = new Map(); // videoId => Promise<directUrl>

    // Start local streaming proxy for audio chunking (yt-dlp based, unchanged)
    this.proxyPort = 8998;
    this.proxyServer = require('http').createServer((req, res) => this.handleStreamProxy(req, res));
    this.proxyServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`[Streaming Proxy] Port ${this.proxyPort} in use, trying ${this.proxyPort + 1}`);
        this.proxyPort++;
        this.proxyServer.listen(this.proxyPort, '127.0.0.1');
      }
    });
    this.proxyServer.listen(this.proxyPort, '127.0.0.1', () => {
      console.log(`[Streaming Proxy] Listening on http://127.0.0.1:${this.proxyPort}`);
    });

    // Pre-warm Innertube in the background so the first search is fast
    getInnertube().catch(err => console.error('[Innertube] Pre-warm failed:', err));

    // Run silent background auto-update for yt-dlp on startup
    this.autoUpdateYtDlp();
  }

  // ── yt-dlp auto-update (unchanged) ─────────────────────────────────────────

  autoUpdateYtDlp() {
    const ytDlpPath = path.join(process.env.YOUTUBE_DL_DIR, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
    console.log('[Downloader] Checking for yt-dlp updates in the background...');
    const { execFile } = require('child_process');
    execFile(ytDlpPath, ['-U'], (error, stdout) => {
      if (error) {
        console.error('[Downloader] Failed to auto-update yt-dlp:', error);
      } else {
        console.log('[Downloader] yt-dlp auto-update check completed:', stdout.trim());
      }
    });
  }

  // ── Streaming proxy (unchanged) ─────────────────────────────────────────────

  pipeStream(directUrl, req, res) {
    const proxyOptions = {};
    if (req.headers.range) {
      proxyOptions.headers = { 'Range': req.headers.range };
    }

    const proxyReq = https.get(directUrl, proxyOptions, (proxyRes) => {
      if (proxyRes.statusCode !== 200 && proxyRes.statusCode !== 206) {
        console.error('[Streaming Proxy] Upstream returned:', proxyRes.statusCode);
        if (!res.headersSent) {
          res.writeHead(proxyRes.statusCode || 502);
          res.end('Upstream error');
        }
        return;
      }

      const headers = {
        'Access-Control-Allow-Origin': '*',
        'Accept-Ranges': 'bytes',
        'Connection': 'close'
      };
      if (proxyRes.headers['content-type']) headers['Content-Type'] = proxyRes.headers['content-type'];
      if (proxyRes.headers['content-length']) headers['Content-Length'] = proxyRes.headers['content-length'];
      if (proxyRes.headers['content-range']) headers['Content-Range'] = proxyRes.headers['content-range'];

      res.writeHead(proxyRes.statusCode, headers);
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error('[Streaming Proxy] Pipe error:', err);
      if (!res.headersSent) { res.writeHead(502); res.end('Proxy error'); }
    });
    req.on('close', () => proxyReq.destroy());
  }

  async resolveStreamingUrl(videoId) {
    // 1. Check cache first
    const cached = streamCache.get(videoId);
    const now = Date.now();
    if (cached && (now - cached.timestamp < CACHE_DURATION)) {
      return cached.url;
    }

    // 2. Check if there is already an active resolution for this videoId
    if (this.activeResolutions.has(videoId)) {
      return this.activeResolutions.get(videoId);
    }

    // 3. Start resolution
    const resolvePromise = (async () => {
      // Try Innertube first
      try {
        console.log(`[Streaming Proxy] Resolving stream URL natively with Innertube for: ${videoId}`);
        const yt = await getInnertube();
        const info = await yt.getBasicInfo(videoId);
        const format = info.chooseFormat({ type: 'audio', quality: 'best' });
        if (format) {
          let directUrl = format.url;
          if (!directUrl && format.decipher) {
            directUrl = format.decipher(yt.session.signature_timestamp);
          }
          if (directUrl && directUrl.startsWith('http')) {
            streamCache.set(videoId, { url: directUrl, timestamp: Date.now() });
            console.log(`[Streaming Proxy] Innertube resolved stream URL successfully for: ${videoId}`);
            return directUrl;
          }
        }
      } catch (err) {
        console.warn(`[Streaming Proxy] Innertube failed for ${videoId}, falling back to yt-dlp:`, err);
      }

      // Fallback to yt-dlp
      return new Promise((resolve, reject) => {
        console.log(`[Streaming Proxy] Spawning yt-dlp fallback for: ${videoId}`);
        const ytDlpPath = path.join(process.env.YOUTUBE_DL_DIR, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
        const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const args = [
          targetUrl,
          '--format', '140/m4a/bestaudio/18/best',
          '-g',
          '--js-runtimes', 'node',
          '--no-warnings',
          '--no-playlist',
          '--no-check-formats',
          '--no-check-certificates'
        ];

        const { execFile } = require('child_process');
        execFile(ytDlpPath, args, (error, stdout) => {
          if (error) {
            console.error('[Streaming Proxy] yt-dlp fallback failed:', error);
            return reject(error);
          }

          const directUrl = stdout.trim();
          if (!directUrl || !directUrl.startsWith('http')) {
            return reject(new Error('Invalid URL from yt-dlp'));
          }

          streamCache.set(videoId, { url: directUrl, timestamp: Date.now() });
          console.log(`[Streaming Proxy] yt-dlp fallback resolved stream URL successfully for: ${videoId}`);
          resolve(directUrl);
        });
      });
    })();

    // Store in activeResolutions
    this.activeResolutions.set(videoId, resolvePromise);

    try {
      const resultUrl = await resolvePromise;
      return resultUrl;
    } finally {
      // Clean up activeResolutions once finished
      this.activeResolutions.delete(videoId);
    }
  }

  async handleStreamProxy(req, res) {
    const urlParts = new URL(req.url, `http://${req.headers.host}`);
    if (urlParts.pathname !== '/stream') {
      res.writeHead(404);
      return res.end();
    }

    const videoId = urlParts.searchParams.get('videoId');
    if (!videoId) {
      res.writeHead(400);
      return res.end('Missing videoId');
    }

    try {
      const directUrl = await this.resolveStreamingUrl(videoId);
      this.pipeStream(directUrl, req, res);
    } catch (err) {
      console.error('[Streaming Proxy] Failed to resolve stream URL:', err);
      if (!res.headersSent) {
        res.writeHead(500);
        res.end('Internal Server Error');
      }
    }
  }

  setWebContents(contents) {
    this.webContents = contents;
  }

  // ── getStreamUrl (returns local proxy URL and warms cache) ──────────────────

  async getStreamUrl(videoId) {
    // Proactively resolve the stream URL in the background to warm the cache
    this.resolveStreamingUrl(videoId).catch(err => {
      console.warn(`[Streaming Proxy] Background cache warm failed for ${videoId}:`, err);
    });

    return { success: true, url: `http://127.0.0.1:${this.proxyPort}/stream?videoId=${videoId}` };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SEARCH — songs + videos combined
  // ═══════════════════════════════════════════════════════════════════════════

  async search(query) {
    try {
      const cacheKey = `song:${query.trim().toLowerCase()}`;
      const cached = this.searchCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp < 15 * 60 * 1000)) {
        return cached.data;
      }

      const yt = await getInnertube();

      // Search songs and videos in parallel
      const [songsRes, videosRes] = await Promise.all([
        yt.music.search(query, { type: 'song' }).catch(e => { console.warn('[Search] songs failed:', e); return null; }),
        yt.music.search(query, { type: 'video' }).catch(e => { console.warn('[Search] videos failed:', e); return null; }),
      ]);

      const seen = new Set();
      const items = [];

      const addSection = (res) => {
        if (!res) return;
        for (const section of (res.contents || [])) {
          const contents = section?.contents || section?.songs || [];
          for (const item of contents) {
            const videoId = item?.id || item?.videoId;
            if (!videoId || seen.has(videoId)) continue;
            seen.add(videoId);
            items.push(item);
          }
        }
      };

      addSection(songsRes);
      addSection(videosRes);

      // Build query terms
      const queryLower = query.toLowerCase().trim();
      let queryTerms = queryLower.split(/\s+/).filter(t => !SEARCH_STOP_WORDS.has(t));
      if (queryTerms.length === 0) queryTerms = queryLower.split(/\s+/);

      const filtered = items.filter(item => {
        const videoId = item?.id || item?.videoId;
        if (!videoId) return false;

        const title = (item?.title?.toString() || item?.name || '').toLowerCase();
        const artist = normalizeArtist(item?.author || item?.artists || item?.artist).toLowerCase();

        if (!isOriginalArtist(artist) || !isOriginalTitle(title)) return false;
         
        const dur = item?.duration?.seconds || parseDurationString(item?.duration) || 0;
        if (dur > 600 || (dur > 0 && dur < 30)) return false;

        return matchesQuery(queryTerms, title, artist);
      });

      const mapped = filtered.slice(0, 20).map(item => {
        const videoId = item?.id || item?.videoId;
        const title = item?.title?.toString() || item?.name || 'Unknown Title';
        const artist = normalizeArtist(item?.author || item?.artists || item?.artist);
        const thumbs = item?.thumbnails || item?.thumbnail?.contents || item?.thumbnail;
        const thumb = bestThumb(Array.isArray(thumbs) ? thumbs : null);
        const dur = item?.duration?.seconds || item?.duration || 0;

        return {
          videoId,
          title,
          artist,
          album: item?.album?.name || item?.album || 'YouTube Music',
          duration: formatDuration(dur),
          thumbnail: thumb,
          coverUrl: thumb,
        };
      });

      if (mapped.length > 0) {
        this.searchCache.set(cacheKey, { data: mapped, timestamp: Date.now() });
      }
      return mapped;
    } catch (err) {
      console.error('[search] Error:', err);
      return [];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SEARCH ALBUMS
  // ═══════════════════════════════════════════════════════════════════════════

  async searchAlbums(query) {
    try {
      const cacheKey = `album:${query.trim().toLowerCase()}`;
      const cached = this.searchCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp < 15 * 60 * 1000)) return cached.data;

      const yt = await getInnertube();
      const res = await yt.music.search(query, { type: 'album' });

      const queryLower = query.toLowerCase().trim();
      let queryTerms = queryLower.split(/\s+/).filter(t => !SEARCH_STOP_WORDS.has(t));
      if (queryTerms.length === 0) queryTerms = queryLower.split(/\s+/);

      const seen = new Set();
      const mapped = [];

      for (const section of (res?.contents || [])) {
        const contents = section?.contents || section?.albums || [];
        for (const item of contents) {
          const browseId = item?.id || item?.browseId || item?.playlist_id;
          if (!browseId || seen.has(browseId)) continue;

          const title = item?.title?.toString() || item?.name || '';
          const artist = normalizeArtist(item?.author || item?.artist || item?.artists);

          if (!isOriginalArtist(artist) || !isOriginalTitle(title)) continue;
          if (!matchesQuery(queryTerms, title, artist)) continue;

          seen.add(browseId);
          const thumbs = item?.thumbnails || item?.thumbnail?.contents;
          mapped.push({
            id: browseId,
            browseId,
            title,
            artist,
            year: item?.year || item?.subtitle || '',
            coverUrl: bestThumb(Array.isArray(thumbs) ? thumbs : null),
            type: 'album',
          });
        }
      }

      if (mapped.length > 0) {
        this.searchCache.set(cacheKey, { data: mapped, timestamp: Date.now() });
      }
      return mapped;
    } catch (err) {
      console.error('[searchAlbums] Error:', err);
      return [];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SEARCH TRENDING (home page, artists)
  // ═══════════════════════════════════════════════════════════════════════════

  async searchTrending(query, type) {
    try {
      if (type === 'artist') {
        return await this._searchArtists(query);
      }

      // For 'song' type: search with trending/top queries
      const cacheKey = `trending:${type}:${query.trim().toLowerCase()}`;
      const cached = this.searchCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp < 15 * 60 * 1000)) return cached.data;

      const yt = await getInnertube();

      // Search in parallel with slightly different queries to get variety
      const queries = [`${query} top songs`, `${query} hits`, `${query} best songs`];
      const results = await Promise.all(
        queries.map(q => yt.music.search(q, { type: 'song' }).catch(() => null))
      );

      const seen = new Set();
      const items = [];
      for (const res of results) {
        if (!res) continue;
        for (const section of (res.contents || [])) {
          for (const item of (section?.contents || [])) {
            const videoId = item?.id || item?.videoId;
            if (!videoId || seen.has(videoId)) continue;

            const title = (item?.title?.toString() || item?.name || '').toLowerCase();
            if (EXCLUDE_TITLE_KEYWORDS.some(k => title.includes(k))) continue;

            const dur = item?.duration?.seconds || 0;
            if (dur > 600) continue; // skip > 10 min

            seen.add(videoId);
            items.push(item);
          }
        }
      }

      const mapped = items.slice(0, 30).map(item => {
        const videoId = item?.id || item?.videoId;
        const thumbs = item?.thumbnails || item?.thumbnail?.contents;
        const dur = item?.duration?.seconds || 0;
        return {
          id: videoId,
          videoId,
          title: item?.title?.toString() || item?.name || 'Unknown Title',
          artist: normalizeArtist(item?.author || item?.artists || item?.artist),
          coverUrl: bestThumb(Array.isArray(thumbs) ? thumbs : null),
          duration: dur,
          album: item?.album?.name || 'Single',
        };
      });

      if (mapped.length > 0) {
        this.searchCache.set(cacheKey, { data: mapped, timestamp: Date.now() });
      }
      return mapped;
    } catch (err) {
      console.error('[searchTrending] Error:', err);
      return [];
    }
  }

  async _searchArtists(query) {
    try {
      const cacheKey = `artist:${query.trim().toLowerCase()}`;
      const cached = this.searchCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp < 15 * 60 * 1000)) return cached.data;

      const yt = await getInnertube();
      const res = await yt.music.search(query, { type: 'artist' });

      const seen = new Set();
      const mapped = [];

      for (const section of (res?.contents || [])) {
        for (const item of (section?.contents || [])) {
          const id = item?.id || item?.browseId || item?.channelId;
          if (!id || seen.has(id)) continue;
          const name = item?.name || item?.title?.toString() || '';
          if (EXCLUDE_ARTIST_KEYWORDS.some(k => name.toLowerCase().includes(k))) continue;
          seen.add(id);
          const thumbs = item?.thumbnails || item?.thumbnail?.contents;
          mapped.push({
            id,
            browseId: id,
            name,
            imageUrl: bestThumb(Array.isArray(thumbs) ? thumbs : null),
          });
        }
      }

      if (mapped.length > 0) {
        this.searchCache.set(cacheKey, { data: mapped, timestamp: Date.now() });
      }
      return mapped;
    } catch (err) {
      console.error('[_searchArtists] Error:', err);
      return [];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET ALBUM DETAIL
  // ═══════════════════════════════════════════════════════════════════════════

  async getAlbum(browseId) {
    try {
      if (!browseId) return null;
      const yt = await getInnertube();
      const res = await yt.music.getAlbum(browseId);
      if (!res) return null;

      const albumThumbs = res.thumbnails || res.header?.thumbnail?.contents || [];
      const albumThumb = bestThumb(Array.isArray(albumThumbs) ? albumThumbs : null);

      const artistName = normalizeArtist(
        res.author || res.artist || res.artists ||
        res.header?.author?.name || res.header?.subtitle?.runs?.[0]?.text
      );

      const tracks = (res.songs?.contents || res.contents || [])
        .filter(t => t?.id || t?.videoId)
        .map((t, i) => {
          const trackThumbs = t?.thumbnails || t?.thumbnail?.contents;
          const trackThumb = bestThumb(Array.isArray(trackThumbs) ? trackThumbs : null) || albumThumb;
          const dur = t?.duration?.seconds || t?.duration || 0;
          return {
            videoId: t?.id || t?.videoId,
            title: t?.title?.toString() || t?.name || 'Unknown Title',
            artist: normalizeArtist(t?.author || t?.artist || t?.artists) || artistName,
            album: res.title?.toString() || res.name || 'Unknown Album',
            duration: dur,
            trackNumber: t?.index || i + 1,
            coverUrl: trackThumb,
            thumbnail: trackThumb,
          };
        });

      return {
        id: browseId,
        title: res.title?.toString() || res.name || 'Unknown Album',
        artist: artistName,
        year: res.year || res.header?.year || '',
        coverUrl: albumThumb,
        tracks,
      };
    } catch (err) {
      console.error('[getAlbum] Error for browseId:', browseId, err);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET ARTIST ALBUMS
  // ═══════════════════════════════════════════════════════════════════════════

  async getArtistAlbums(artistId) {
    let artistName = '';
    try {
      if (!artistId) return [];
      const yt = await getInnertube();
      const artist = await yt.music.getArtist(artistId);

      artistName = artist?.name || artist?.header?.title?.toString() || '';

      // Find the albums section
      const sections = artist?.sections || artist?.contents || [];
      let albumItems = [];

      for (const section of sections) {
        const title = (section?.title?.toString() || section?.header?.title?.toString() || '').toLowerCase();
        if (title.includes('album') && !title.includes('single') && !title.includes('video')) {
          const contents = section?.contents || section?.items || [];
          albumItems = contents;
          break;
        }
      }

      // Fallback: use the first section if no dedicated albums section found
      if (albumItems.length === 0 && sections.length > 0) {
        albumItems = sections[0]?.contents || sections[0]?.items || [];
      }

      const ALBUM_EXCLUDE = [
        'remix', 'cover', 'tribute', 'instrumental', 'karaoke', 'lofi', 'lo-fi',
        'parody', 'various artists', 'bhajan', 'bhakti', 'mantra', 'devotional',
        'best of', 'evergreen', 'hits', 'collection', 'soundtrack', 'ost',
        'ghazal', 'qawwali', 'compilation', 'greatest', 'classics', 'anniversary',
      ];

      const mapped = albumItems
        .map(item => {
          const browseId = item?.id || item?.browseId || item?.playlist_id;
          if (!browseId) return null;
          const title = item?.title?.toString() || item?.name || '';
          const thumbs = item?.thumbnails || item?.thumbnail?.contents;
          const albumArtist = normalizeArtist(item?.author || item?.artist) || artistName;
          const year = item?.year || item?.subtitle || '';

          const hasExclude = ALBUM_EXCLUDE.some(k => title.toLowerCase().includes(k) || albumArtist.toLowerCase().includes(k));
          if (hasExclude) return null;

          // Make sure the listed artists include this artist
          if (!isArtistMatch(albumArtist, artistName)) return null;

          return {
            id: browseId,
            browseId,
            title,
            artist: albumArtist || artistName,
            year,
            coverUrl: bestThumb(Array.isArray(thumbs) ? thumbs : null),
            type: 'album',
          };
        })
        .filter(Boolean);

      let finalAlbums = [...mapped];
      if (finalAlbums.length < 10 && artistName) {
        try {
          const searchResults = await this.searchAlbums(artistName) || [];
          const filteredSearch = searchResults.filter(album => isArtistMatch(album.artist || '', artistName));
          for (const sa of filteredSearch) {
            if (!finalAlbums.some(a => a.browseId === sa.browseId)) {
              finalAlbums.push(sa);
            }
          }
        } catch (searchErr) {
          console.error('[getArtistAlbums] Supplemental search failed:', searchErr);
        }
      }
      return finalAlbums.slice(0, 10);
    } catch (err) {
      console.error('[getArtistAlbums] Error for artist:', artistId, err);
    }

    if (artistName) {
      try {
        console.warn(`[getArtistAlbums] Falling back to search for albums of "${artistName}"`);
        const searchResults = await this.searchAlbums(artistName) || [];
        return searchResults.filter(album => isArtistMatch(album.artist || '', artistName)).slice(0, 10);
      } catch (searchErr) {
        console.error('[getArtistAlbums] Fallback search failed:', searchErr);
      }
    }
    return [];
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET ARTIST SONGS
  // ═══════════════════════════════════════════════════════════════════════════

  async getArtistSongs(artistId) {
    let artistName = '';
    let mapped = [];
    try {
      if (!artistId) return [];
      const yt = await getInnertube();
      const artist = await yt.music.getArtist(artistId);
      artistName = artist?.name || artist?.header?.title?.toString() || '';

      // Find the songs/tracks section
      const sections = artist?.sections || artist?.contents || [];
      let songItems = [];
      let songsSection = null;

      for (const section of sections) {
        const title = (section?.title?.toString() || section?.header?.title?.toString() || '').toLowerCase();
        if (
          (title.includes('song') || title.includes('track') || title.includes('popular')) &&
          !title.includes('album') && !title.includes('video') && !title.includes('playlist')
        ) {
          songsSection = section;
          break;
        }
      }

      if (!songsSection && sections.length > 0) {
        songsSection = sections[0];
      }

      if (songsSection) {
        songItems = songsSection?.contents || songsSection?.items || [];

        // If the section has a "See all" endpoint, try to fetch more songs
        try {
          const endpoint = songsSection?.endpoint || songsSection?.header?.more_content_button?.endpoint;
          if (endpoint) {
            const more = await artist.getAllSongs?.() || null;
            if (more && more.songs?.contents?.length > 0) {
              songItems = more.songs.contents;
            }
          }
        } catch (e) {
          // Silent fail; keep initial items
        }
      }

      const SONG_EXCLUDE = [
        'tribute', 'cover', 'instrumental', 'karaoke', 'lofi', 'lo-fi',
        'parody', 'originally performed', 'in the style of', 'soundtrack', 'ost',
      ];

      const seen = new Set();
      mapped = songItems
        .map(item => {
          const videoId = item?.id || item?.videoId;
          if (!videoId || seen.has(videoId)) return null;
          seen.add(videoId);

          const title = item?.title?.toString() || item?.name || '';
          const itemArtist = normalizeArtist(item?.author || item?.artist || item?.artists) || artistName;
          const titleLower = title.toLowerCase();
          const artistLower = itemArtist.toLowerCase();
          if (SONG_EXCLUDE.some(k => titleLower.includes(k) || artistLower.includes(k))) return null;

          const thumbs = item?.thumbnails || item?.thumbnail?.contents;
          const dur = item?.duration?.seconds || 0;

          return {
            videoId,
            id: videoId,
            title,
            artist: itemArtist,
            coverUrl: bestThumb(Array.isArray(thumbs) ? thumbs : null),
            thumbnail: bestThumb(Array.isArray(thumbs) ? thumbs : null),
            duration: dur,
            type: 'song',
          };
        })
        .filter(Boolean);
    } catch (err) {
      console.error('[getArtistSongs] Error for artist:', artistId, err);
    }

    if (artistName) {
      try {
        const searchResults = await this.search(`${artistName} songs`) || [];
        const combined = [...mapped];
        const seenIds = new Set(mapped.map(s => s.videoId));
        const mainArtist = artistName.toLowerCase();
        
        searchResults.forEach(song => {
          const songArtist = (song.artist || '').toLowerCase();
          const isMatch = songArtist.includes(mainArtist) || mainArtist.includes(songArtist);
          
          if (isMatch && !seenIds.has(song.videoId)) {
            combined.push({
              videoId: song.videoId,
              id: song.videoId,
              title: song.title,
              artist: song.artist,
              coverUrl: song.coverUrl || song.thumbnail,
              thumbnail: song.coverUrl || song.thumbnail,
              duration: parseDurationString(song.duration),
              type: 'song',
            });
            seenIds.add(song.videoId);
          }
        });
        return combined;
      } catch (searchErr) {
        console.error('[getArtistSongs] Fallback search failed:', searchErr);
      }
    }

    return mapped;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET RECOMMENDATIONS / UP NEXT
  // ═══════════════════════════════════════════════════════════════════════════

  async getRecommendations(videoId) {
    try {
      const yt = await getInnertube();
      const info = await yt.music.getUpNext(videoId);

      const playlist = info?.playlist?.contents || info?.contents || [];

      const mapped = playlist
        .map(item => {
          const vid = item?.id || item?.videoId;
          if (!vid || vid === videoId) return null;
          const title = (item?.title?.toString() || item?.name || '').toLowerCase();
          if (EXCLUDE_TITLE_KEYWORDS.some(k => title.includes(k))) return null;

          const thumbs = item?.thumbnails || item?.thumbnail?.contents;
          const dur = item?.duration?.seconds || 0;

          return {
            videoId: vid,
            title: item?.title?.toString() || item?.name || 'Unknown Title',
            artist: normalizeArtist(item?.author || item?.artists || item?.artist),
            album: 'Recommended',
            duration: dur,
            coverUrl: bestThumb(Array.isArray(thumbs) ? thumbs : null),
            thumbnail: bestThumb(Array.isArray(thumbs) ? thumbs : null),
          };
        })
        .filter(Boolean);

      if (mapped.length === 0) throw new Error('Empty recommendations');
      console.log(`[Recommendations] Fetched ${mapped.length} tracks for videoId: ${videoId}`);
      return mapped;
    } catch (err) {
      console.error('[getRecommendations] Error for videoId:', videoId, err);

      // Fallback: search by the playing song's artist
      try {
        const yt = await getInnertube();
        const info = await yt.music.getInfo(videoId);
        const artistName = normalizeArtist(
          info?.basic_info?.author || info?.basic_info?.channel?.name
        );
        if (artistName && artistName !== 'Unknown Artist') {
          const fallback = await this.search(`${artistName} songs`);
          return fallback
            .filter(s => s.videoId !== videoId)
            .map(s => ({ ...s, album: 'Recommended (Fallback)' }));
        }
      } catch (fallbackErr) {
        console.error('[getRecommendations] Fallback also failed:', fallbackErr);
      }
      return [];
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GET LYRICS (multi-source: lrclib.net → lyrics.ovh)
  // ═══════════════════════════════════════════════════════════════════════════

  async getLyrics(title, artist) {
    const makeRequest = (url) => new Promise((resolve, reject) => {
      const mod = url.startsWith('https') ? https : require('http');
      mod.get(url, { headers: { 'User-Agent': 'SteroMusicPlayer/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          makeRequest(res.headers.location).then(resolve).catch(reject);
          return;
        }
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => resolve({ statusCode: res.statusCode, data }));
      }).on('error', reject);
    });

    // Light clean: removes YouTube-style suffixes only
    const cleanTitle = (str) => {
      if (!str) return '';
      return str
        .replace(/\s*[\(\[](official\s*(music\s*)?video|audio|lyric(s)?|hd|hq|mv|visualizer|4k)[^\)\]]*[\)\]]/gi, '')
        .replace(/\s*-\s*(official\s*(music\s*)?video|audio|lyric(s)?|hd|hq|mv|visualizer|4k)\s*$/gi, '')
        .replace(/\s+/g, ' ').trim();
    };

    const cleanArtist = (str) => {
      if (!str) return '';
      return str.split(/\s*[,&]\s*|\s+feat\.?\s+|\s+ft\.?\s+/i)[0].replace(/\s+/g, ' ').trim();
    };

    if (!title) return null;

    const rawTitle = cleanTitle(title);
    const rawArtist = cleanArtist(artist || '');

    // ── Helper: score how well a lrclib result matches the query (0–1) ──
    // Prevents lrclib from returning unrelated songs that partially match the query.
    const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9\u0080-\uffff\s]/g, '').replace(/\s+/g, ' ').trim();
    const wordSimilarity = (a, b) => {
      a = normalize(a); b = normalize(b);
      if (!a || !b) return 0;
      if (a === b) return 1;
      if (a.includes(b) || b.includes(a)) return 0.85;
      const setA = new Set(a.split(' ').filter(w => w.length > 1));
      const arrB = b.split(' ').filter(w => w.length > 1);
      if (!setA.size || !arrB.length) return 0;
      return arrB.filter(w => setA.has(w)).length / Math.max(setA.size, arrB.length);
    };
    const pickBestLrcResult = (results, titleQ, artistQ) => {
      if (!Array.isArray(results) || !results.length) return null;
      const scored = results
        .filter(r => r.syncedLyrics || r.plainLyrics)
        .map(r => {
          const ts = wordSimilarity(r.trackName, titleQ);
          const as = wordSimilarity(r.artistName, artistQ);
          return { r, score: ts * 0.65 + as * 0.35 + (r.syncedLyrics ? 0.05 : 0), ts };
        })
        .sort((a, b) => b.score - a.score);
      // Only accept if the title has at least 40% similarity — rejects wrong songs
      if (scored.length && scored[0].ts >= 0.4) return scored[0].r;
      return null;
    };

    // Strategy 1: lrclib.net exact GET (synced lyrics preferred)
    try {
      const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(rawArtist)}&track_name=${encodeURIComponent(rawTitle)}`;
      const res = await makeRequest(url);
      if (res.statusCode === 200) {
        const parsed = JSON.parse(res.data);
        if (parsed.syncedLyrics || parsed.plainLyrics) {
          console.log(`[getLyrics] lrclib exact hit: ${rawTitle}`);
          return { lyrics: parsed.syncedLyrics || parsed.plainLyrics, isSynced: !!parsed.syncedLyrics };
        }
      }
    } catch (e) { /* try next */ }

    // Strategy 2: lrclib.net search "artist title" — with similarity filter
    try {
      const q = `${rawArtist} ${rawTitle}`.trim();
      const res = await makeRequest(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`);
      if (res.statusCode === 200) {
        const results = JSON.parse(res.data);
        const match = pickBestLrcResult(results, rawTitle, rawArtist);
        if (match) {
          console.log(`[getLyrics] lrclib search hit (artist+title): ${rawTitle}`);
          return { lyrics: match.syncedLyrics || match.plainLyrics, isSynced: !!match.syncedLyrics };
        }
      }
    } catch (e) { /* try next */ }

    // Strategy 3: lrclib.net search title only — with similarity filter
    try {
      const res = await makeRequest(`https://lrclib.net/api/search?q=${encodeURIComponent(rawTitle)}`);
      if (res.statusCode === 200) {
        const results = JSON.parse(res.data);
        const match = pickBestLrcResult(results, rawTitle, rawArtist);
        if (match) {
          console.log(`[getLyrics] lrclib search hit (title only): ${rawTitle}`);
          return { lyrics: match.syncedLyrics || match.plainLyrics, isSynced: !!match.syncedLyrics };
        }
      }
    } catch (e) { /* try next */ }

    // Strategy 4: lyrics.ovh — good coverage for pop, Bollywood, K-pop, Punjabi
    try {
      const artistEnc = encodeURIComponent(rawArtist || 'unknown');
      const titleEnc = encodeURIComponent(rawTitle);
      const res = await makeRequest(`https://api.lyrics.ovh/v1/${artistEnc}/${titleEnc}`);
      if (res.statusCode === 200) {
        const parsed = JSON.parse(res.data);
        if (parsed.lyrics && parsed.lyrics.trim().length > 20) {
          console.log(`[getLyrics] lyrics.ovh hit: ${rawTitle}`);
          return { lyrics: parsed.lyrics.trim(), isSynced: false };
        }
      }
    } catch (e) { /* try next */ }

    // Strategy 5: lyrics.ovh with original uncleaned title
    const origTitle = (title || '').trim();
    if (origTitle && origTitle !== rawTitle) {
      try {
        const artistEnc = encodeURIComponent(rawArtist || 'unknown');
        const titleEnc = encodeURIComponent(origTitle);
        const res = await makeRequest(`https://api.lyrics.ovh/v1/${artistEnc}/${titleEnc}`);
        if (res.statusCode === 200) {
          const parsed = JSON.parse(res.data);
          if (parsed.lyrics && parsed.lyrics.trim().length > 20) {
            console.log(`[getLyrics] lyrics.ovh hit (orig title): ${origTitle}`);
            return { lyrics: parsed.lyrics.trim(), isSynced: false };
          }
        }
      } catch (e) { /* give up */ }
    }

    console.log(`[getLyrics] Not found for: "${rawTitle}" by "${rawArtist}"`);
    return null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DOWNLOAD QUEUE (unchanged logic)
  // ═══════════════════════════════════════════════════════════════════════════

  async addDownload(songMeta) {
    if (this.queue.find(q => q.videoId === songMeta.videoId) || this.activeDownloads.has(songMeta.videoId)) {
      return { success: false, message: 'Already in queue' };
    }

    const job = { ...songMeta, status: 'queued', progress: 0, addedAt: Date.now() };
    this.queue.push(job);
    this.broadcastState();
    this.processQueue();
    return { success: true, jobId: job.videoId };
  }

  async processQueue() {
    if (this.queue.length === 0 || this.activeDownloads.size >= this.maxConcurrent) return;

    const job = this.queue.shift();
    job.status = 'downloading';
    this.activeDownloads.set(job.videoId, job);
    this.broadcastState();

    let musicFolder = this.db.getSavedFolderPath();

    if (musicFolder && !fs.existsSync(musicFolder)) {
      try { fs.mkdirSync(musicFolder, { recursive: true }); }
      catch { musicFolder = null; }
    }

    if (!musicFolder) {
      try { musicFolder = app.getPath('music'); } catch { musicFolder = path.join(os.homedir(), 'Music'); }
      if (!fs.existsSync(musicFolder)) {
        try { fs.mkdirSync(musicFolder, { recursive: true }); } catch { musicFolder = path.join(os.homedir(), 'Downloads'); }
      }
    }

    const safeTitle = job.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const safeArtist = job.artist.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const outputFilename = `${safeArtist} - ${safeTitle}.mp3`;
    const outputPath = path.join(musicFolder, outputFilename);

    const { spawn } = require('child_process');
    const ytDlpPath = path.join(process.env.YOUTUBE_DL_DIR, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
    const url = `https://www.youtube.com/watch?v=${job.videoId}`;

    try {
      const args = [
        url,
        '--extract-audio', '--audio-format', 'mp3',
        '--output', outputPath,
        '--ffmpeg-location', ffmpeg,
        '--js-runtimes', 'node',
        '--no-check-certificates', '--no-warnings',
        '--add-header', 'referer:youtube.com',
        '--add-header', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      ];

      const subprocess = spawn(ytDlpPath, args, { windowsHide: true });
      job.subprocess = subprocess;

      subprocess.stdout.on('data', (data) => {
        const text = data.toString();
        const progressMatch = text.match(/\[download\]\s+(\d+\.\d+)%/);
        if (progressMatch) {
          job.progress = Math.min(parseFloat(progressMatch[1]), 99);
          this.broadcastState();
        } else if (text.includes('Destination:') && text.includes('.mp3')) {
          job.progress = 99;
          this.broadcastState();
        }
      });

      subprocess.stderr.on('data', (data) => console.warn('yt-dlp stderr:', data.toString()));

      await new Promise((resolve, reject) => {
        subprocess.on('close', code => code === 0 ? resolve() : reject(new Error(`Exit code ${code}`)));
        subprocess.on('error', reject);
      });

      job.status = 'completed';
      job.progress = 100;
      job.localPath = outputPath;

      // Auto-add downloaded file to library
      try {
        let artworkPath = '';
        let hasArtwork = 0;
        const artUrl = job.thumbnail || job.coverUrl || job.artwork_path;

        if (artUrl) {
          const hash = crypto.createHash('md5').update(job.videoId).digest('hex');
          const artworkFileName = `art-yt-${hash}.jpg`;
          const fullArtPath = path.join(this.db.getArtworkDir(), artworkFileName);

          await new Promise(resolve => {
            https.get(artUrl, (res) => {
              if (res.statusCode === 200) {
                const fileStream = fs.createWriteStream(fullArtPath);
                res.pipe(fileStream);
                fileStream.on('finish', () => { fileStream.close(); hasArtwork = 1; artworkPath = fullArtPath; resolve(); });
                fileStream.on('error', resolve);
              } else { resolve(); }
            }).on('error', resolve);
          });
        }

        let parsedDuration = 0;
        if (typeof job.duration === 'number') {
          parsedDuration = job.duration;
        } else if (typeof job.duration === 'string') {
          parsedDuration = parseDurationString(job.duration);
        }

        const stats = fs.statSync(outputPath);
        this.db.insertSongs([{
          filepath: outputPath,
          title: job.title.trim().replace(/^\d+[\s.\-_]*/, ''),
          artist: job.artist || 'Unknown Artist',
          album: 'Downloads',
          duration: parsedDuration,
          genre: 'YouTube',
          year: new Date().getFullYear(),
          track_number: null,
          has_artwork: hasArtwork,
          artwork_path: artworkPath,
          added_at: Math.floor(stats.mtimeMs),
        }]);

        if (this.webContents) {
          this.webContents.send('download-completed');
          this.webContents.send('download-queue-updated', this.getQueueState());
        }
      } catch (err) {
        console.error('[addDownload] Error auto-adding to db:', err);
      }
    } catch (err) {
      console.error('[addDownload] Download failed:', err);
      job.status = 'error';
      job.error = err.message;
    }

    this.finishJob(job);
  }

  finishJob(job) {
    if (job.subprocess) delete job.subprocess;
    this.activeDownloads.delete(job.videoId);
    this.completed.unshift(job);
    if (this.completed.length > 50) this.completed.pop();
    this.broadcastState();
    this.processQueue();
  }

  cancelDownload(videoId) {
    if (this.activeDownloads.has(videoId)) {
      const job = this.activeDownloads.get(videoId);
      if (job.subprocess) { try { job.subprocess.kill('SIGTERM'); } catch (e) {} }
      job.status = 'cancelled';
      job.progress = 0;
      this.finishJob(job);
    } else {
      const qIndex = this.queue.findIndex(q => q.videoId === videoId);
      if (qIndex !== -1) {
        const job = this.queue.splice(qIndex, 1)[0];
        job.status = 'cancelled';
        job.progress = 0;
        this.completed.unshift(job);
        if (this.completed.length > 50) this.completed.pop();
        this.broadcastState();
      }
    }
  }

  getQueueState() {
    const safeActive = Array.from(this.activeDownloads.values()).map(({ subprocess, ...rest }) => rest);
    return { active: safeActive, queue: this.queue, completed: this.completed };
  }

  broadcastState() {
    if (this.webContents) {
      this.webContents.send('download-queue-updated', this.getQueueState());
    }
  }
}

module.exports = Downloader;
