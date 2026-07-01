const path = require('path');
// Ensure youtube-dl-exec and ffmpeg run from the unpacked ASAR directory in production
const defaultBinDir = path.join(__dirname, '..', 'node_modules', 'youtube-dl-exec', 'bin');
process.env.YOUTUBE_DL_DIR = defaultBinDir.replace('app.asar', 'app.asar.unpacked');

const YTMusic = require('ytmusic-api');
const youtubedl = require('youtube-dl-exec');
const ffmpeg = require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked');
const fs = require('fs');
const os = require('os');
const https = require('https');
const crypto = require('crypto');
const { app } = require('electron');

const streamCache = new Map(); // videoId => { url, timestamp }
const CACHE_DURATION = 3 * 60 * 60 * 1000; // 3 hours

class Downloader {
  constructor(db) {
    this.db = db;
    this.ytmusic = new YTMusic();
    this.ytmusicInitialized = false;
    
    this.queue = [];
    this.activeDownloads = new Map();
    this.maxConcurrent = 2; // Limit concurrent downloads
    this.completed = [];
    this.searchCache = new Map(); // key = "type:query", value = { data, timestamp }
    
    // Will be set when a renderer connects to receive progress
    this.webContents = null;

    // Start local streaming proxy for audio chunking
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

    // Run silent background auto-update for yt-dlp on startup
    this.autoUpdateYtDlp();
  }

  autoUpdateYtDlp() {
    const ytDlpPath = path.join(process.env.YOUTUBE_DL_DIR, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');
    console.log('[Downloader] Checking for yt-dlp updates in the background...');
    const { execFile } = require('child_process');
    execFile(ytDlpPath, ['-U'], (error, stdout, stderr) => {
      if (error) {
        console.error('[Downloader] Failed to auto-update yt-dlp:', error);
      } else {
        console.log('[Downloader] yt-dlp auto-update check completed:', stdout.trim());
      }
    });
  }

  pipeStream(directUrl, req, res) {
    const https = require('https');
    const proxyOptions = {};
    if (req.headers.range) {
      proxyOptions.headers = {
        'Range': req.headers.range
      };
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
      if (!res.headersSent) {
        res.writeHead(502);
        res.end('Proxy error');
      }
    });

    req.on('close', () => {
      proxyReq.destroy();
    });
  }

  handleStreamProxy(req, res) {
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

    // Check Cache first
    const cached = streamCache.get(videoId);
    const now = Date.now();
    if (cached && (now - cached.timestamp < CACHE_DURATION)) {
      this.pipeStream(cached.url, req, res);
      return;
    }

    // First, resolve the direct URL using yt-dlp -g
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
    execFile(ytDlpPath, args, (error, stdout, stderr) => {
      if (error) {
        console.error('[Streaming Proxy] Failed to get URL:', error);
        if (!res.headersSent) {
          res.writeHead(500);
          res.end('Internal Server Error');
        }
        return;
      }

      const directUrl = stdout.trim();
      if (!directUrl || !directUrl.startsWith('http')) {
        if (!res.headersSent) {
          res.writeHead(500);
          res.end('Invalid URL from extractor');
        }
        return;
      }

      // Save to cache
      streamCache.set(videoId, { url: directUrl, timestamp: Date.now() });

      this.pipeStream(directUrl, req, res);
    });
  }

  setWebContents(contents) {
    this.webContents = contents;
  }

  async initYTMusic() {
    if (!this.ytmusicInitialized) {
      await this.ytmusic.initialize();
      this.ytmusicInitialized = true;
    }
  }

  async initYoutubeMusicApi() {
    if (!this.youtubeMusicApiPromise) {
      this.youtubeMusicApiPromise = (async () => {
        const YoutubeMusicApi = require('youtube-music-api');
        this.youtubeMusicApi = new YoutubeMusicApi();
        await this.youtubeMusicApi.initalize();
        return this.youtubeMusicApi;
      })();
    }
    return await this.youtubeMusicApiPromise;
  }

  async getRecommendations(videoId) {
    try {
      await this.initYTMusic();
      const res = await this.ytmusic.getUpNexts(videoId);

      const mapped = (res || []).map(r => {
        let thumb = r.thumbnail || null;
        if (r.thumbnails && r.thumbnails.length > 0) {
          thumb = r.thumbnails[r.thumbnails.length - 1].url;
        }

        let artistVal = 'Unknown Artist';
        const rawArtist = r.artist || r.artists;
        if (rawArtist) {
          if (typeof rawArtist === 'string') {
            artistVal = rawArtist;
          } else if (Array.isArray(rawArtist)) {
            artistVal = rawArtist.map(a => typeof a === 'string' ? a : (a.name || 'Unknown')).join(', ');
          } else if (typeof rawArtist === 'object') {
            artistVal = rawArtist.name || 'Unknown Artist';
          }
        }

        const totalSeconds = typeof r.duration === 'number' ? Math.floor(r.duration) : 0;

        return {
          videoId: r.videoId,
          title: r.name || r.title || 'Unknown Title',
          artist: artistVal,
          album: 'Recommended',
          duration: totalSeconds,
          coverUrl: thumb,
          thumbnail: thumb
        };
      }).filter(r => {
        if (!r.videoId) return false;
        const title = r.title.toLowerCase();
        const artist = r.artist.toLowerCase();
        const excludeKeywords = ['remix', 'cover', 'live', 'lofi', 'lo-fi', 'instrumental', 'karaoke', 'slowed', 'reverb', 'speed up', 'sped up', '8d', 'tribute', 'parody', 'tribute band', 'cover band', 'karaoke version', 'orchestra version', 'aamaye biye', 'biye ki kari', 'tamil', 'telugu', 'bengali', 'malayalam', 'kannada', 'bhojpuri', 'marathi', 'gujarati', 'assamese', 'odia'];
        return !excludeKeywords.some(keyword => title.includes(keyword) || artist.includes(keyword));
      });

      console.log(`[Recommendations] Fetched ${mapped.length} tracks for videoId: ${videoId}`);
      if (mapped.length === 0) throw new Error("Empty recommendations");
      return mapped;
    } catch (err) {
      console.error('[Recommendations] Error for videoId:', videoId, err);
      // Fallback: search for songs by the same artist/title to build a queue
      try {
        const songData = await this.ytmusic.getSong(videoId);
        const artistName = songData?.artist?.name || songData?.artists?.[0]?.name || '';
        const fallbackRes = await this.ytmusic.searchSongs(`${artistName} songs`);
        const items = fallbackRes ? fallbackRes.slice(0, 30) : [];
        
        const mappedFallback = items.map(r => {
          let thumb = r.thumbnail || null;
          if (r.thumbnails && r.thumbnails.length > 0) thumb = r.thumbnails[r.thumbnails.length - 1].url;
          
          let artistVal = 'Unknown Artist';
          const rawArtist = r.artist || r.artists;
          if (rawArtist) {
            if (typeof rawArtist === 'string') {
              artistVal = rawArtist;
            } else if (Array.isArray(rawArtist)) {
              artistVal = rawArtist.map(a => typeof a === 'string' ? a : (a.name || 'Unknown')).join(', ');
            } else if (typeof rawArtist === 'object') {
              artistVal = rawArtist.name || 'Unknown Artist';
            }
          }

          return {
            videoId: r.videoId,
            title: r.name || r.title || 'Unknown Title',
            artist: artistVal,
            album: 'Recommended (Fallback)',
            duration: r.duration ? Math.floor(r.duration / 1000) : 0,
            coverUrl: thumb,
            thumbnail: thumb
          };
        }).filter(r => {
          if (!r.videoId || r.videoId === videoId) return false;
          const title = r.title.toLowerCase();
          const artist = r.artist.toLowerCase();
          const excludeKeywords = ['remix', 'cover', 'live', 'lofi', 'lo-fi', 'instrumental', 'karaoke', 'slowed', 'reverb', 'speed up', 'sped up', '8d', 'tribute', 'parody', 'tribute band', 'cover band', 'karaoke version', 'orchestra version', 'aamaye biye', 'biye ki kari', 'tamil', 'telugu', 'bengali', 'malayalam', 'kannada', 'bhojpuri', 'marathi', 'gujarati', 'assamese', 'odia'];
          return !excludeKeywords.some(keyword => title.includes(keyword) || artist.includes(keyword));
        });
        
        return mappedFallback;
      } catch (fallbackErr) {
        return [];
      }
    }
  }

  async getAlbum(browseId) {
    try {
      await this.initYTMusic();
      const res = await this.ytmusic.getAlbum(browseId);
      if (!res) return null;

      let albumThumb = null;
      if (res.thumbnails && res.thumbnails.length > 0) {
        albumThumb = res.thumbnails[res.thumbnails.length - 1].url;
      }

      const tracks = (res.songs || res.tracks || []).filter(t => t.videoId).map(t => {
        let tThumb = albumThumb;
        if (t.thumbnails && t.thumbnails.length > 0) {
          tThumb = t.thumbnails[t.thumbnails.length - 1].url;
        }
        
        let artistVal = res.artist?.name || 'Unknown Artist';
        if (t.artist) {
          artistVal = Array.isArray(t.artist) ? t.artist.map(a => a.name).join(', ') : (t.artist.name || artistVal);
        }

        return {
          videoId: t.videoId,
          title: t.name || t.title || 'Unknown Title',
          artist: artistVal,
          album: res.name || res.title || 'Unknown Album',
          duration: t.duration ? Math.floor(t.duration) : 0,
          coverUrl: tThumb,
          thumbnail: tThumb
        };
      });

      return {
        id: browseId,
        title: res.name || res.title || 'Unknown Album',
        artist: res.artist?.name || 'Unknown Artist',
        year: res.year,
        coverUrl: albumThumb,
        tracks
      };
    } catch (err) {
      console.error('[YT Album] Error fetching album:', err);
      return null;
    }
  }

  isOriginalArtist(artistName) {
    if (!artistName) return false;
    const name = artistName.toLowerCase();
    const unoriginalKeywords = [
      'tribute', 'cover', 'covers', 'karaoke', 'instrumental', 'piano', 'lullaby', 
      'kids', 'tunes', 'orchestra', 'singalong', 'hits band', 'tribute band', 
      'originally performed', 'in the style of', 'tribute project', 'fanmade', 'fan-made',
      'various artists', 'various artist', 'various', 'compilation', 'soundtrack', 'soundtracks'
    ];
    return !unoriginalKeywords.some(kw => name.includes(kw));
  }

  isOriginalTitle(titleStr) {
    if (!titleStr) return false;
    const title = titleStr.toLowerCase();
    const unoriginalKeywords = [
      'tribute', 'karaoke', 'originally performed', 'in the style of', 'karaoke version',
      'tribute version', 'piano cover', 'acoustic cover', 'instrumental cover', 'various artists',
      'hits compilation', 'greatest hits compilation'
    ];
    return !unoriginalKeywords.some(kw => title.includes(kw));
  }

  normalizeHindiPhonetics(str) {
    if (!str) return '';
    return str.toLowerCase()
      .replace(/aa/g, 'a')
      .replace(/ee/g, 'i')
      .replace(/oo/g, 'u')
      .replace(/y/g, 'i')
      .replace(/ae/g, 'e')
      .replace(/h/g, '') // removes silent h
      .replace(/[^a-z0-9]/g, '');
  }

  async search(query) {
    try {
      const cacheKey = `song:${query.trim().toLowerCase()}`;
      const cached = this.searchCache?.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp < 15 * 60 * 1000)) { // 15 min cache
        return cached.data;
      }

      await this.initYTMusic();
      const [songsRes, videosRes] = await Promise.all([
        this.ytmusic.searchSongs(query).catch(e => {
          console.warn('searchSongs failed:', e);
          return [];
        }),
        this.ytmusic.searchVideos(query).catch(e => {
          console.warn('searchVideos failed:', e);
          return [];
        })
      ]);

      const items = [];
      const seenVideoIds = new Set();
      const addItems = (list) => {
        if (!Array.isArray(list)) return;
        list.forEach(item => {
          if (item && item.videoId && !seenVideoIds.has(item.videoId)) {
            seenVideoIds.add(item.videoId);
            items.push(item);
          }
        });
      };

      addItems(songsRes);
      addItems(videosRes);
      
      const queryLower = query.toLowerCase().trim();
      const searchStopWords = new Set(['song', 'songs', 'music', 'track', 'tracks', 'video', 'audio', 'official', 'lyrics', 'lyric']);
      let queryTerms = queryLower.split(/\s+/).filter(term => !searchStopWords.has(term));
      if (queryTerms.length === 0) {
        queryTerms = queryLower.split(/\s+/);
      }

      const filtered = items.filter(r => {
        if (!r.videoId) return false;
        
        const title = (r.name || r.title || '').toLowerCase();
        let artist = 'Unknown Artist';
        const rawArtist = r.artist || r.artists;
        if (rawArtist) {
          if (Array.isArray(rawArtist)) {
            artist = rawArtist.map(a => typeof a === 'string' ? a : (a.name || 'Unknown')).join(', ').toLowerCase();
          } else if (typeof rawArtist === 'object') {
            artist = (rawArtist.name || 'Unknown').toLowerCase();
          } else if (typeof rawArtist === 'string') {
            artist = rawArtist.toLowerCase();
          }
        }

        // 1. Basic original quality check
        if (!this.isOriginalArtist(artist) || !this.isOriginalTitle(title)) {
          return false;
        }

        // 2. Fuzzy match ratio algorithm with phonetic normalization:
        const normArtist = this.normalizeHindiPhonetics(artist);
        const normTitle = this.normalizeHindiPhonetics(title);
        
        const normQueryTerms = queryTerms.map(t => this.normalizeHindiPhonetics(t));
        const matchingTerms = normQueryTerms.filter(term => 
          normArtist.includes(term) || normTitle.includes(term)
        );

        const matchRatio = matchingTerms.length / normQueryTerms.length;
        let matches = false;
        if (normQueryTerms.length <= 2) {
          matches = (matchRatio >= 0.99);
        } else {
          matches = (matchRatio >= 0.60);
        }

        return matches;
      });

      const mapped = filtered.slice(0, 20).map(r => {
        const totalSeconds = Math.floor(r.duration || 0);
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        const durationStr = `${mins}:${secs.toString().padStart(2, '0')}`;
        
        let thumb = null;
        if (r.thumbnails && r.thumbnails.length > 0) {
           thumb = r.thumbnails[r.thumbnails.length - 1].url;
        }

        return {
          videoId: r.videoId,
          title: r.name || r.title,
          artist: (() => {
            const rawArtist = r.artist || r.artists;
            if (!rawArtist) return 'Unknown Artist';
            if (Array.isArray(rawArtist)) {
              return rawArtist.map(a => typeof a === 'string' ? a : (a.name || 'Unknown')).join(', ');
            }
            if (typeof rawArtist === 'object') {
              return rawArtist.name || 'Unknown Artist';
            }
            return String(rawArtist);
          })(),
          album: r.album ? (r.album.name || r.album) : 'YouTube Music',
          duration: durationStr,
          thumbnail: thumb
        };
      });

      if (mapped.length > 0) {
        this.searchCache.set(cacheKey, { data: mapped, timestamp: Date.now() });
      }
      return mapped;
    } catch (err) {
      console.error('ytmusic-api error:', err);
      return [];
    }
  }

  async searchAlbums(query) {
    try {
      const cacheKey = `album:${query.trim().toLowerCase()}`;
      const cached = this.searchCache?.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp < 15 * 60 * 1000)) {
        return cached.data;
      }

      await this.initYTMusic();

      const queryLower = query.toLowerCase().trim();
      const searchStopWords = new Set(['song', 'songs', 'music', 'track', 'tracks', 'video', 'audio', 'official', 'lyrics', 'lyric']);
      let queryTerms = queryLower.split(/\s+/).filter(term => !searchStopWords.has(term));
      if (queryTerms.length === 0) {
        queryTerms = queryLower.split(/\s+/);
      }

      // 1. Fetch matching songs to extract their original albums
      let songAlbums = [];
      try {
        const songs = await this.ytmusic.searchSongs(query);
        if (songs && songs.length > 0) {
          songs.slice(0, 10).forEach(s => {
            if (s.album && s.album.albumId) {
              const albumTitle = s.album.name || '';
              let albumArtist = 'Unknown Artist';
              const rawSongArtist = s.artist || s.artists;
              if (rawSongArtist) {
                if (Array.isArray(rawSongArtist) && rawSongArtist.length > 0) {
                  albumArtist = rawSongArtist[0].name || 'Unknown Artist';
                } else if (typeof rawSongArtist === 'object') {
                  albumArtist = rawSongArtist.name || 'Unknown Artist';
                } else if (typeof rawSongArtist === 'string') {
                  albumArtist = rawSongArtist;
                }
              }

              if (this.isOriginalArtist(albumArtist) && this.isOriginalTitle(albumTitle)) {
                const normArtist = this.normalizeHindiPhonetics(albumArtist);
                const normTitle = this.normalizeHindiPhonetics(albumTitle);
                
                const normQueryTerms = queryTerms.map(t => this.normalizeHindiPhonetics(t));
                const matchingTerms = normQueryTerms.filter(term => 
                  normArtist.includes(term) || normTitle.includes(term)
                );
                const matchRatio = matchingTerms.length / normQueryTerms.length;
                let matches = false;
                if (normQueryTerms.length <= 2) {
                  matches = (matchRatio >= 0.99);
                } else {
                  matches = (matchRatio >= 0.60);
                }

                if (matches) {
                  songAlbums.push({
                    id: s.album.albumId,
                    browseId: s.album.albumId,
                    title: albumTitle,
                    artist: albumArtist,
                    year: '',
                    coverUrl: Array.isArray(s.thumbnails) && s.thumbnails.length > 0
                              ? s.thumbnails[s.thumbnails.length - 1].url
                              : null,
                    type: 'album'
                  });
                }
              }
            }
          });
        }
      } catch (songErr) {
        console.warn('Failed to extract albums from song search:', songErr);
      }

      // 2. Fetch standard album results
      const res = await this.ytmusic.searchAlbums(query);
      const items = res ? res.slice(0, 40) : [];
      
      const filtered = items.filter(r => {
        if (!r.albumId) return false;
        
        const title = (r.name || '').toLowerCase();
        let artist = 'Unknown Artist';
        const rawArtist = r.artist || r.artists;
        if (rawArtist) {
          if (Array.isArray(rawArtist)) {
            artist = rawArtist.map(a => typeof a === 'string' ? a : (a.name || 'Unknown')).join(', ').toLowerCase();
          } else if (typeof rawArtist === 'object') {
            artist = (rawArtist.name || 'Unknown').toLowerCase();
          } else if (typeof rawArtist === 'string') {
            artist = rawArtist.toLowerCase();
          }
        }

        if (!this.isOriginalArtist(artist) || !this.isOriginalTitle(title)) {
          return false;
        }

        const normArtist = this.normalizeHindiPhonetics(artist);
        const normTitle = this.normalizeHindiPhonetics(title);

        const normQueryTerms = queryTerms.map(t => this.normalizeHindiPhonetics(t));
        const matchingTerms = normQueryTerms.filter(term => 
          normArtist.includes(term) || normTitle.includes(term)
        );
        const matchRatio = matchingTerms.length / normQueryTerms.length;
        let matches = false;
        if (normQueryTerms.length <= 2) {
          matches = (matchRatio >= 0.99);
        } else {
          matches = (matchRatio >= 0.60);
        }

        return matches;
      });

      const mapped = filtered.slice(0, 20).map(r => ({
        id: r.albumId,
        browseId: r.albumId,
        title: r.name,
        artist: (() => {
          const rawArtist = r.artist || r.artists;
          if (!rawArtist) return 'Unknown Artist';
          if (Array.isArray(rawArtist)) {
            return rawArtist.map(a => typeof a === 'string' ? a : (a.name || 'Unknown')).join(', ');
          }
          if (typeof rawArtist === 'object') {
            return rawArtist.name || 'Unknown Artist';
          }
          return String(rawArtist);
        })(),
        year: r.year || '',
        coverUrl: Array.isArray(r.thumbnails) && r.thumbnails.length > 0
                  ? r.thumbnails[r.thumbnails.length - 1].url
                  : null,
        type: 'album'
      }));

      const combined = [...songAlbums, ...mapped];
      const unique = Array.from(new Map(combined.map(a => [a.id, a])).values());

      if (unique.length > 0) {
        this.searchCache.set(cacheKey, { data: unique, timestamp: Date.now() });
      }
      return unique;
    } catch (err) {
      console.error('searchAlbums error:', err);
      return [];
    }
  }

  async getArtistAlbums(artistId) {
    try {
      if (!artistId) return [];
      await this.initYTMusic();
      
      // Fetch raw browse response from Innertube
      const rawData = await this.ytmusic.constructRequest("browse", { browseId: artistId });
      
      // Helper traversal functions
      const traverseString = (obj, ...keys) => {
        let current = obj;
        for (const key of keys) {
          if (current && typeof current === 'object' && key in current) {
            current = current[key];
          } else {
            return '';
          }
        }
        return typeof current === 'string' ? current : '';
      };

      const traverseList = (obj, ...keys) => {
        let current = obj;
        for (const key of keys) {
          if (current && typeof current === 'object' && key in current) {
            current = current[key];
          } else {
            return [];
          }
        }
        return Array.isArray(current) ? current : [];
      };

      // Find all carousel shelves recursively
      const carousels = [];
      const traverseCarousels = (node) => {
        if (!node || typeof node !== 'object') return;
        if (node.musicCarouselShelfRenderer) {
          carousels.push(node.musicCarouselShelfRenderer);
          return;
        }
        for (const key of Object.keys(node)) {
          traverseCarousels(node[key]);
        }
      };
      traverseCarousels(rawData);

      // Find the specific Albums shelf dynamically by checking header text
      let albumsShelf = null;
      for (const carousel of carousels) {
        const titleText = carousel.header?.musicCarouselShelfBasicHeaderRenderer?.title?.runs?.[0]?.text || '';
        const lowerTitle = titleText.toLowerCase();
        
        // Match only shelves representing albums (avoiding 'singles', 'videos', 'featured on', etc.)
        if ((lowerTitle.includes('album') || lowerTitle.includes('alben') || lowerTitle.includes('álbum')) && 
            !lowerTitle.includes('single') && !lowerTitle.includes('video') && !lowerTitle.includes('feature')) {
          albumsShelf = carousel;
          break;
        }
      }

      // If we couldn't find an Albums shelf, fall back to the first carousel
      if (!albumsShelf && carousels.length > 0) {
        albumsShelf = carousels[0];
      }

      if (!albumsShelf || !albumsShelf.contents) return [];

      // Extract target artist name from header to double check matches
      let targetArtistName = traverseString(rawData, "header", "musicImmersiveHeaderRenderer", "title", "text") || 
                           traverseString(rawData, "header", "musicVisualHeaderRenderer", "title", "text") || '';
      
      if (!targetArtistName && rawData.header) {
        // Fallback title extraction
        const headerObj = rawData.header.musicImmersiveHeaderRenderer || rawData.header.musicVisualHeaderRenderer || rawData.header;
        targetArtistName = headerObj.title?.runs?.[0]?.text || '';
      }
      
      const targetArtist = targetArtistName.toLowerCase().trim();

      const mappedAlbums = albumsShelf.contents
        .map(item => {
          const albumObj = item.musicTwoRowItemRenderer;
          if (!albumObj) return null;

          const title = albumObj.title?.runs?.[0]?.text || albumObj.title?.text || '';
          const albumId = albumObj.navigationEndpoint?.browseEndpoint?.browseId ||
                          albumObj.title?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId || '';
          
          let year = '';
          const subtitleRuns = albumObj.subtitle?.runs || [];
          const lastRunText = subtitleRuns.length > 0 ? subtitleRuns[subtitleRuns.length - 1].text.trim() : '';
          if (/^\d{4}$/.test(lastRunText)) {
            year = lastRunText;
          }

          let artistName = '';
          if (subtitleRuns.length > 0) {
            // Find runs that represent the artist (avoiding bullet characters, years, and type tags)
            const artistRun = subtitleRuns.find(run => {
              const text = run.text.trim();
              return text !== '•' && !/^\d{4}$/.test(text) && text.toLowerCase() !== 'album' && text.toLowerCase() !== 'single' && text.toLowerCase() !== 'ep';
            });
            if (artistRun) {
              artistName = artistRun.text.trim();
            }
          }

          let thumb = null;
          let thumbObj = albumObj.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
                         albumObj.thumbnail?.thumbnails ||
                         albumObj.thumbnails;
          if (Array.isArray(thumbObj) && thumbObj.length > 0) {
            thumb = thumbObj[thumbObj.length - 1].url;
          }

          return {
            id: albumId,
            browseId: albumId,
            title,
            year,
            coverUrl: thumb,
            artist: artistName || targetArtistName || 'Unknown Artist',
            type: 'album'
          };
        })
        .filter(r => r && r.id);

      // Filter albums strictly to keep only original albums made by the artist itself
      const filtered = mappedAlbums.filter(r => {
        const albumName = r.title.toLowerCase();
        const albumArtist = r.artist.toLowerCase();
        const target = targetArtist;

        // 1. Exclude cover/remix/tribute/compilation/soundtrack keywords
        const excludeKeywords = [
          'remix', 'cover', 'tribute', 'instrumental', 'karaoke', 'lofi', 'lo-fi', 'parody', 'various artists',
          'bhajan', 'bhakti', 'mantra', 'devotional', 'best of', 'evergreen', 'hits', 'collection', 'soundtrack', 
          'original motion picture', 'ost', 'ghazal', 'qawwali', 'compilation', 'selection', 'selections', 'greatest', 
          'classics', 'vol.', 'vol ', 'volume', 'series', 'anniversary'
        ];
        const hasExclude = excludeKeywords.some(keyword => albumName.includes(keyword) || albumArtist.includes(keyword));
        if (hasExclude) return false;

        // 2. Strict primary artist check: The first listed artist must be exactly the followed artist
        if (albumArtist && target) {
          const primaryArtist = albumArtist.split(/[,&]/)[0].trim();
          if (primaryArtist !== target) return false;
        }

        return true;
      });

      return filtered.slice(0, 8);
    } catch (err) {
      console.error('getArtistAlbums raw error for artist:', artistId, err);
      return [];
    }
  }

  async getAlbum(browseId) {
    try {
      if (!browseId) return null;
      await this.initYTMusic();
      const res = await this.ytmusic.getAlbum(browseId);
      if (res) {
        return {
          id: browseId,
          title: res.name || res.title,
          artist: (res.artist && res.artist.name) || 'Unknown Artist',
          year: res.year || '',
          coverUrl: Array.isArray(res.thumbnails) && res.thumbnails.length > 0
                    ? res.thumbnails[res.thumbnails.length - 1].url
                    : null,
          tracks: Array.isArray(res.songs) ? res.songs.map((t, i) => ({
            videoId: t.videoId,
            title: t.name || t.title,
            artist: (t.artist && t.artist.name) || (res.artist && res.artist.name) || 'Unknown Artist',
            album: (t.album && t.album.name) || res.name || res.title,
            duration: t.duration || 0,
            trackNumber: t.trackNumber || i + 1,
            coverUrl: Array.isArray(t.thumbnails) && t.thumbnails.length > 0
                    ? t.thumbnails[t.thumbnails.length - 1].url
                    : (Array.isArray(res.thumbnails) && res.thumbnails.length > 0 ? res.thumbnails[res.thumbnails.length - 1].url : null)
          })) : []
        };
      }
      return null;
    } catch (err) {
      console.error('getAlbum error for browseId:', browseId, err);
      return null;
    }
  }

  async searchTrending(query, type) {
    try {
      const api = await this.initYoutubeMusicApi();
      
      if (type === 'song') {
        const [res1, res2, res3] = await Promise.all([
          api.search(`${query} top 50`, 'song'),
          api.search(`${query} billboard`, 'song'),
          api.search(`${query} global`, 'song')
        ]);
        
        const allItems = [...(res1.content||[]), ...(res2.content||[]), ...(res3.content||[])];
        
        // Strictly filter to ensure no albums or podcasts (pure songs only) and only original songs
        const validSongs = allItems.filter(r => {
          const hasArtist = Array.isArray(r.artist) ? r.artist.length > 0 : !!r.artist;
          const isSongLength = r.duration > 0 && r.duration < 600000; // less than 10 mins
          const isSong = r.type === 'song' || r.type === 'video';
          
          const title = (r.name || r.title || '').toLowerCase();
          const excludeKeywords = ['remix', 'cover', 'live', 'lofi', 'lo-fi', 'instrumental', 'karaoke', 'slowed', 'reverb', 'speed up', 'sped up', '8d', 'tribute', 'parody'];
          const isOriginal = !excludeKeywords.some(keyword => title.includes(keyword));

          return r.videoId && isSong && hasArtist && isSongLength && isOriginal;
        });
        const uniqueItems = Array.from(new Map(validSongs.map(r => [r.videoId, r])).values());
        
        // Take exactly top 30 as requested
        const items = uniqueItems.slice(0, 30);
        
        return items.map(r => {
          return {
            id: r.videoId,
            videoId: r.videoId,
            title: r.name,
            artist: Array.isArray(r.artist) ? r.artist.map(a => a.name).join(', ') : (r.artist?.name || 'Unknown'),
            coverUrl: Array.isArray(r.thumbnails) && r.thumbnails.length > 0 
                      ? r.thumbnails[r.thumbnails.length - 1].url 
                      : null,
            duration: r.duration ? Math.floor(r.duration / 1000) : 0,
            album: r.album?.name || 'Single',
          };
        });
      }
      
      if (type === 'artist') {
        const cacheKey = `artist:${query.trim().toLowerCase()}`;
        const cached = this.searchCache?.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp < 15 * 60 * 1000)) {
          return cached.data;
        }

        await this.initYTMusic();

        // 1. Extract artists from matching songs
        let songArtists = [];
        try {
          const songs = await this.ytmusic.searchSongs(query);
          if (songs && songs.length > 0) {
            songs.slice(0, 5).forEach(s => {
              if (s.artist && s.artist.artistId) {
                songArtists.push({
                  id: s.artist.artistId,
                  browseId: s.artist.artistId,
                  name: s.artist.name,
                  imageUrl: Array.isArray(s.thumbnails) && s.thumbnails.length > 0
                            ? s.thumbnails[s.thumbnails.length - 1].url
                            : null
                });
              }
            });
          }
        } catch (songErr) {
          console.warn('Failed to extract artists from song search:', songErr);
        }

        // 2. Fetch matching artists directly using the more accurate searchArtists API
        const res = await this.ytmusic.searchArtists(query);
        const items = res ? res.slice(0, 20) : [];

        const filtered = items.filter(r => {
          if (!r.name) return false;
          const name = r.name.toLowerCase();
          const excludeKeywords = ['tribute', 'cover band', 'lofi', 'lo-fi', 'instrumental', 'orchestra', 'karaoke'];
          return !excludeKeywords.some(keyword => name.includes(keyword));
        });

        const mapped = filtered.map(r => {
          let thumb = null;
          if (r.thumbnails && r.thumbnails.length > 0) {
             thumb = r.thumbnails[r.thumbnails.length - 1].url;
          }
          return {
            id: r.artistId,
            browseId: r.artistId,
            name: r.name,
            imageUrl: thumb
          };
        });

        // 3. Merge: place song-extracted artists at the top, then standard ones, removing duplicates
        const combined = [...songArtists, ...mapped];
        const unique = Array.from(new Map(combined.map(a => [a.id || a.name, a])).values());

        if (unique.length > 0) {
          this.searchCache.set(cacheKey, { data: unique, timestamp: Date.now() });
        }
        return unique;
      }
      
      const res = await api.search(query, type);
      const items = res.content ? res.content.slice(0, 50) : [];
      
      return items.filter(r => r.videoId).map(r => {
        const totalSeconds = Math.floor((r.duration || 0) / 1000);
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        const durationStr = `${mins}:${secs.toString().padStart(2, '0')}`;
        
        let thumb = null;
        if (r.thumbnails && r.thumbnails.length > 0) {
           thumb = r.thumbnails[r.thumbnails.length - 1].url;
        }

        return {
          videoId: r.videoId,
          title: r.name,
          artist: r.artist ? (Array.isArray(r.artist) ? r.artist.map(a => a.name).join(', ') : r.artist.name) : 'Unknown Artist',
          album: r.album ? r.album.name : 'YouTube Music',
          duration: durationStr,
          thumbnail: thumb,
          coverUrl: thumb
        };
      });
    } catch (err) {
      console.error('searchTrending error:', err);
      return [];
    }
  }



  async getStreamUrl(videoId) {
    // Return the local streaming proxy URL instead of raw YouTube URL
    // This allows adaptive-like chunking and prevents 403 Forbidden errors
    return { success: true, url: `http://127.0.0.1:${this.proxyPort}/stream?videoId=${videoId}` };
  }

  async addDownload(songMeta) {
    // Check if already in queue or downloading
    if (this.queue.find(q => q.videoId === songMeta.videoId) || this.activeDownloads.has(songMeta.videoId)) {
      return { success: false, message: 'Already in queue' };
    }

    const job = {
      ...songMeta,
      status: 'queued',
      progress: 0,
      addedAt: Date.now()
    };
    
    this.queue.push(job);
    this.broadcastState();
    this.processQueue();
    
    return { success: true, jobId: job.videoId };
  }

  async processQueue() {
    if (this.queue.length === 0 || this.activeDownloads.size >= this.maxConcurrent) {
      return;
    }

    const job = this.queue.shift();
    job.status = 'downloading';
    this.activeDownloads.set(job.videoId, job);
    this.broadcastState();

    let musicFolder = this.db.getSavedFolderPath();
    
    // Ensure the folder exists if it was retrieved from DB
    if (musicFolder && !fs.existsSync(musicFolder)) {
      try {
        fs.mkdirSync(musicFolder, { recursive: true });
      } catch (err) {
        console.warn('Failed to create saved music folder, falling back to default', err);
        musicFolder = null;
      }
    }

    if (!musicFolder) {
      try {
        musicFolder = app.getPath('music');
      } catch (e) {
        musicFolder = path.join(os.homedir(), 'Music');
      }
      
      // If still fails or doesn't exist, use Downloads
      if (!fs.existsSync(musicFolder)) {
        try {
          fs.mkdirSync(musicFolder, { recursive: true });
        } catch(e) {
          musicFolder = path.join(os.homedir(), 'Downloads');
        }
      }
    }

    // Clean title for filename
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
        '--extract-audio',
        '--audio-format', 'mp3',
        '--output', outputPath,
        '--ffmpeg-location', ffmpeg,
        '--js-runtimes', 'node',
        '--no-check-certificates',
        '--no-warnings',
        '--add-header', 'referer:youtube.com',
        '--add-header', 'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      ];

      const subprocess = spawn(ytDlpPath, args, { windowsHide: true });
      job.subprocess = subprocess;

      // Simple progress tracking by parsing stdout
      subprocess.stdout.on('data', (data) => {
        const text = data.toString();
        
        // Progress parsing
        const progressMatch = text.match(/\[download\]\s+(\d+\.\d+)%/);
        if (progressMatch && progressMatch[1]) {
          job.progress = parseFloat(progressMatch[1]);
          // Cap it at 99% during download, 100% is set when ffmpeg finishes
          if (job.progress > 99) job.progress = 99;
          this.broadcastState();
        } else if (text.includes('Destination:') && text.includes('.mp3')) {
          // This usually indicates ffmpeg audio extraction started
          job.progress = 99; 
          this.broadcastState();
        }
      });

      subprocess.stderr.on('data', (data) => {
        console.warn('yt-dlp stderr:', data.toString());
      });

      await new Promise((resolve, reject) => {
        subprocess.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Download process exited with code ${code}`));
        });
        subprocess.on('error', (err) => reject(err));
      });

      job.status = 'completed';
      job.progress = 100;
      job.localPath = outputPath;
      
      // Auto-scan file into library manually
      try {
        let artworkPath = '';
        let hasArtwork = 0;
        
        const artUrl = job.thumbnail || job.coverUrl || job.artwork_path;
        if (artUrl) {
          const hash = crypto.createHash('md5').update(job.videoId).digest('hex');
          const artworkFileName = `art-yt-${hash}.jpg`;
          const fullArtPath = path.join(this.db.getArtworkDir(), artworkFileName);
          
          await new Promise((resolve) => {
            https.get(artUrl, (res) => {
              if (res.statusCode === 200) {
                const fileStream = fs.createWriteStream(fullArtPath);
                res.pipe(fileStream);
                fileStream.on('finish', () => {
                  fileStream.close();
                  hasArtwork = 1;
                  artworkPath = fullArtPath;
                  resolve();
                });
                fileStream.on('error', () => resolve());
              } else {
                resolve();
              }
            }).on('error', () => resolve());
          });
        }

        let parsedDuration = 0;
        if (typeof job.duration === 'number') {
          parsedDuration = job.duration;
        } else if (typeof job.duration === 'string') {
          const parts = job.duration.split(':').map(Number);
          if (parts.length === 2) {
            parsedDuration = parts[0] * 60 + parts[1];
          } else if (parts.length === 3) {
            parsedDuration = parts[0] * 3600 + parts[1] * 60 + parts[2];
          }
        }

        const stats = fs.statSync(outputPath);
        const newSong = {
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
          added_at: Math.floor(stats.mtimeMs)
        };
        
        this.db.insertSongs([newSong]);
        
        if (this.webContents) {
          // Tell frontend to refresh the library
          this.webContents.send('download-completed');
          this.webContents.send('download-queue-updated', this.getQueueState());
        }
      } catch (err) {
        console.error('Error auto-adding downloaded file to db:', err);
      }

    } catch (err) {
      console.error('Download failed:', err);
      job.status = 'error';
      job.error = err.message;
    }

    this.finishJob(job);
  }

  finishJob(job) {
    if (job.subprocess) {
      delete job.subprocess;
    }
    this.activeDownloads.delete(job.videoId);
    this.completed.unshift(job); // Add to front of completed list
    // Keep completed list from growing infinitely
    if (this.completed.length > 50) this.completed.pop();
    
    this.broadcastState();
    // Start next download if any
    this.processQueue();
  }

  cancelDownload(videoId) {
    if (this.activeDownloads.has(videoId)) {
      const job = this.activeDownloads.get(videoId);
      if (job.subprocess) {
        try {
          job.subprocess.kill('SIGTERM');
        } catch(e) {}
      }
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
    const safeActive = Array.from(this.activeDownloads.values()).map(job => {
      const { subprocess, ...safeJob } = job;
      return safeJob;
    });
    return {
      active: safeActive,
      queue: this.queue,
      completed: this.completed
    };
  }

  broadcastState() {
    if (this.webContents) {
      this.webContents.send('download-queue-updated', this.getQueueState());
    }
  }
}

module.exports = Downloader;
