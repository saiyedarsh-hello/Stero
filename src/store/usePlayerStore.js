import { create } from 'zustand';

// Mock data fallback for browser testing
const MOCK_SONGS = [
  {
    id: 1001,
    filepath: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    title: 'Neon Horizon',
    artist: 'Lazerhawk',
    album: 'Redline',
    duration: 372,
    genre: 'Synthwave',
    year: 2010,
    track_number: 1,
    has_artwork: 1,
    artwork_path: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&q=80',
    added_at: Date.now() - 86400000 * 2,
    play_count: 14,
    favorite: 1
  },
  {
    id: 1002,
    filepath: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    title: 'Stardust Drive',
    artist: 'Miami Nights 1984',
    album: 'Turbulence',
    duration: 425,
    genre: 'Synthwave',
    year: 2012,
    track_number: 3,
    has_artwork: 1,
    artwork_path: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=150&q=80',
    added_at: Date.now() - 86400000 * 5,
    play_count: 28,
    favorite: 1
  },
  {
    id: 1003,
    filepath: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    title: 'Aether Wave',
    artist: 'Antigravity',
    album: 'Deep Mind Resonance',
    duration: 344,
    genre: 'Ambient',
    year: 2026,
    track_number: 2,
    has_artwork: 1,
    artwork_path: 'https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?w=150&q=80',
    added_at: Date.now() - 86400000,
    play_count: 5,
    favorite: 0
  },
  {
    id: 1004,
    filepath: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
    title: 'Resonance',
    artist: 'Home',
    album: 'Odyssey',
    duration: 302,
    genre: 'Chillwave',
    year: 2014,
    track_number: 5,
    has_artwork: 1,
    artwork_path: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=150&q=80',
    added_at: Date.now() - 86400000 * 10,
    play_count: 42,
    favorite: 1
  }
];

const MOCK_PLAYLISTS = [
  { id: 101, name: 'Late Night Drives', created_at: Date.now(), songIds: [1001, 1002] },
  { id: 102, name: 'Coding Focus', created_at: Date.now(), songIds: [1003, 1004] }
];

const isSameTrack = (t1, t2) => {
  if (!t1 || !t2) return false;
  if (t1.id === t2.id) return true;
  
  const getVId = (t) => {
    if (t.videoId) return t.videoId;
    if (typeof t.id === 'string' && !t.id.includes('/') && t.id.length === 11) return t.id;
    if (t.filepath && t.filepath.startsWith('yt-stream://')) {
      return t.filepath.replace('yt-stream://', '');
    }
    return null;
  };
  
  const v1 = getVId(t1);
  const v2 = getVId(t2);
  return v1 && v2 && v1 === v2;
};

const cleanArtistName = (name) => {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

const isArtistMatch = (albumArtist, targetArtist) => {
  const target = cleanArtistName(targetArtist);
  if (!target) return false;
  
  const primaryArtists = albumArtist
    .split(/[,&]|\band\b/i)
    .map(x => cleanArtistName(x))
    .filter(Boolean);
    
  return primaryArtists.some(p => p === target);
};

export const usePlayerStore = create((set, get) => ({
  // Library Data
  songs: [],
  playlists: [],
  customAlbums: [],
  currentPlaylistSongs: [],
  
  sessionRestored: false,

  // App Settings
  appSettings: {},
  
  // Theming
  dominantColor: { h: 0, s: 0, l: 100 },
  setDominantColor: (color) => set({ dominantColor: color }),

  // Cached trending data so it only fetches once per session
  trendingArtists: [],
  trendingSongs: [],
  myTaste: [],
  setTrendingData: (artists, songs) => set({ trendingArtists: artists, trendingSongs: songs }),
  setMyTaste: (songs) => set({ myTaste: songs }),
  
  ytSearchResults: null,
  setYtSearchResults: (results) => set({ ytSearchResults: results }),
  
  ytArtistSearchResults: null,
  setYtArtistSearchResults: (results) => set({ ytArtistSearchResults: results }),
  
  ytAlbumSearchResults: null,
  setYtAlbumSearchResults: (results) => set({ ytAlbumSearchResults: results }),
  
  ytActiveAlbum: null,
  
  // Followed Artists
  followedArtists: [],
  followedArtistSongs: [],
  followedArtistAlbums: [],
  blacklistedSongs: JSON.parse(localStorage.getItem('stero-blacklisted-songs') || '[]'),
  
  // Navigation & View
  activeView: 'music', // 'songs', 'favorites', 'playlist-detail', 'album-detail', 'artist-detail'
  selectedPlaylistId: null,
  selectedAlbumName: null,
  selectedAlbumId: null,
  selectedArtist: null,
  searchQuery: '',

  viewHistory: [{
    activeView: 'music',
    selectedPlaylistId: null,
    selectedAlbumName: null,
    selectedAlbumId: null,
  }],
  historyIndex: 0,

  // Playback State
  activeTrack: null,
  isPlaying: false,
  volume: localStorage.getItem('stero-volume') !== null ? parseFloat(localStorage.getItem('stero-volume')) : 1,
  muted: localStorage.getItem('stero-muted') === 'true',
  progress: 0,
  duration: 0,
  queue: [],
  originalQueue: [],
  queueIndex: 0,
  shuffle: false,
  repeat: 'none', // none, all, one
  playHistory: [], // True history of played trackss as a loop counter
  repeatMode: 0, // functions as a loop counter
  cycleRepeatMode: () => set(state => ({ repeatMode: (state.repeatMode + 1) % 5 })),
  decrementRepeatMode: () => set(state => ({ repeatMode: Math.max(0, state.repeatMode - 1) })),
  activePlaylistId: null,

  // Session restore — position to seek to when audio is ready
  savedPosition: 0,
  clearSavedPosition: () => set({ savedPosition: 0 }),

  // Scanning Progress
  scanStatus: {
    current: 0,
    total: 0,
    status: 'idle', // idle, started, scanning, completed
  },

  // Track being edited (global modal trigger)
  editingSong: null,
  setEditingSong: (song) => set({ editingSong: song }),

  // Playlist being edited (global modal trigger)
  editingPlaylist: null,
  setEditingPlaylist: (playlist) => set({ editingPlaylist: playlist }),

  // Queue Sidebar State
  isQueueSidebarOpen: false,
  toggleQueueSidebar: () => set(state => ({ isQueueSidebarOpen: !state.isQueueSidebarOpen, isLyricsSidebarOpen: !state.isQueueSidebarOpen ? false : state.isLyricsSidebarOpen })),

  // Lyrics Sidebar State
  isLyricsSidebarOpen: false,
  toggleLyricsSidebar: () => {
    const { isLyricsSidebarOpen } = get();
    const nextOpen = !isLyricsSidebarOpen;
    set({ 
      isLyricsSidebarOpen: nextOpen,
      isQueueSidebarOpen: nextOpen ? false : get().isQueueSidebarOpen
    });
    // Do NOT re-fetch here — the sidebar itself handles fetching
  },

  // Lyrics cache — persists across sidebar open/close, cleared only on track change
  activeTrackLyrics: { loading: false, data: null, error: null },
  lyricsCache: {},

  fetchActiveTrackLyrics: async () => {
    const { activeTrack, lyricsCache } = get();
    if (!activeTrack) {
      set({ activeTrackLyrics: { loading: false, data: null, error: null } });
      return;
    }

    // Cache key — unique per track
    const cacheKey = activeTrack.id
      ? String(activeTrack.id)
      : `${activeTrack.title}|${activeTrack.artist}`;

    // ── Cache hit: serve instantly, no loading state ──
    if (lyricsCache[cacheKey]) {
      const cached = lyricsCache[cacheKey];
      // If we already have the correct data in activeTrackLyrics, skip the set()
      const current = get().activeTrackLyrics;
      if (!current.loading && current.data === cached.data) return;
      set({ activeTrackLyrics: { loading: false, data: cached.data, error: null } });
      return;
    }

    // ── Already fetching for this track — don't spawn a duplicate request ──
    const current = get().activeTrackLyrics;
    if (current.loading && current._fetchKey === cacheKey) return;

    set({ activeTrackLyrics: { loading: true, data: null, error: null, _fetchKey: cacheKey } });

    try {
      const title = activeTrack.title || '';
      const artist = activeTrack.artist || '';

      if (!window.electron) {
        setTimeout(() => {
          const data = {
            lyrics: `[00:02.00] This is a mock lyric line 1\n[00:06.00] This is a mock lyric line 2\n[00:10.00] This is a mock lyric line 3\n[00:14.00] Enjoy the music!`,
            isSynced: true
          };
          // Only apply if we're still on the same track
          if (get().activeTrack?.title === title) {
            set(state => ({
              activeTrackLyrics: { loading: false, data, error: null },
              lyricsCache: { ...state.lyricsCache, [cacheKey]: { data } }
            }));
          }
        }, 1000);
        return;
      }

      const res = await window.electron.ytGetLyrics(title, artist);

      // Guard: make sure we're still on the same track when the response arrives
      const stillSameTrack = (() => {
        const t = get().activeTrack;
        const key = t?.id ? String(t.id) : `${t?.title}|${t?.artist}`;
        return key === cacheKey;
      })();
      if (!stillSameTrack) return;

      if (res && res.lyrics) {
        const data = res;
        set(state => ({
          activeTrackLyrics: { loading: false, data, error: null },
          lyricsCache: { ...state.lyricsCache, [cacheKey]: { data } }
        }));
      } else {
        set({ activeTrackLyrics: { loading: false, data: null, error: 'Lyrics not found' } });
      }
    } catch (err) {
      console.error('Failed to fetch lyrics:', err);
      set({ activeTrackLyrics: { loading: false, data: null, error: 'Failed to load lyrics' } });
    }
  },

  // Downloads State
  downloadState: {
    active: [],
    queue: [],
    completed: []
  },
  
  initDownloadListener: () => {
    if (!window.electron) return;
    
    // Initial fetch
    window.electron.ytGetQueue().then(state => {
      set({ downloadState: state });
    });

    // Subscribe to progress
    window.electron.onDownloadProgress((state) => {
      set({ downloadState: state });
    });

    // Refresh library when a download successfully completes and inserts into DB
    window.electron.onDownloadCompleted(() => {
      get().fetchLibrary();
    });
  },

  startDownload: async (songMeta) => {
    if (!window.electron) return { success: false, message: 'Electron not available' };
    
    // Downloader expects videoId, but sometimes it is only under `id` for stream tracks
    const trackForDownload = { ...songMeta, videoId: songMeta.videoId || songMeta.id };

    let savedFolder = await window.electron.getSavedFolder();
    if (!savedFolder) {
      const folderPath = await window.electron.selectFolder();
      if (!folderPath) {
        return { success: false, message: 'Download cancelled. No folder selected.' };
      }
      // Save and set the folder
      await window.electron.scanFolder(folderPath);
    }

    return await window.electron.ytDownload(trackForDownload);
  },

  cancelDownload: async (videoId) => {
    if (!window.electron) return { success: false, message: 'Electron not available' };
    return await window.electron.ytCancelDownload(videoId);
  },

  clearCompletedDownload: async (videoId) => {
    if (!window.electron) return { success: false, message: 'Electron not available' };
    return await window.electron.ytClearCompletedDownload(videoId);
  },

  clearAllCompletedDownloads: async () => {
    if (!window.electron) return { success: false, message: 'Electron not available' };
    return await window.electron.ytClearAllCompletedDownloads();
  },

  deleteSong: async (songId) => {
    if (!window.electron) return;
    await window.electron.deleteSong(songId);
    get().fetchLibrary();
  },

  // Actions
  fetchTrendingSongs: async (language) => {
    if (!window.electron) return [];
    return await window.electron.ytSearchTrending(`top ${language} songs`, 'song');
  },

  fetchMyTaste: async (language) => {
    if (!window.electron) return [];
    const state = get();
    
    // Stopwords for title keyword matching
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'for', 'nor', 'so', 'yet',
      'at', 'by', 'from', 'in', 'into', 'of', 'off', 'on', 'onto', 'out', 'over', 'to', 'up', 'with',
      'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
      'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your',
      'his', 'its', 'our', 'their', 'this', 'that', 'these', 'those', 'song', 'music', 'video', 'audio',
      'official', 'lyrics', 'lyric', 'feat', 'ft', 'prod', 'remix', 'mix', 'cover', 'live'
    ]);

    // 1. Gather all local songs and statistics
    const localSongs = state.songs || [];
    const playHistory = state.playHistory || [];
    const followedArtists = state.followedArtists || [];

    // Helper to identify if a song is an online stream track
    const checkIsStream = (s) => {
      return !!(
        s.isStream || 
        s.videoId || 
        (s.filepath && s.filepath.startsWith('yt-stream://'))
      );
    };

    // Calculate preference score for each song
    const scoredSongs = localSongs.map(s => {
      const isStream = checkIsStream(s);
      
      // Base score = (favorite status * 20) + (play count * 5)
      let baseScore = (s.favorite === 1 ? 20 : 0) + (s.play_count || 0) * 5;
      
      // Triple the preference weight if the song is from online streaming history
      let songScore = isStream ? baseScore * 3.0 : baseScore;

      // Add small baseline score so we can still use it if it has positive indicators
      if (s.favorite === 1 || (s.play_count && s.play_count > 0)) {
        songScore += 1.0;
      }
      
      return { song: s, score: songScore, isStream };
    });

    // Boost scores based on recency in playHistory
    // Stream songs get 3x recency boost
    playHistory.forEach((track, index) => {
      const recencyWeight = (20 - index) * 0.75;
      const isStream = checkIsStream(track);
      const finalBoost = isStream ? recencyWeight * 3.0 : recencyWeight;

      const match = scoredSongs.find(entry => 
        entry.song.id === track.id || 
        (entry.song.videoId && track.videoId && entry.song.videoId === track.videoId)
      );

      if (match) {
        match.score += finalBoost;
      }
    });

    // 2. Build preferences profile: artist scores, genre scores, title keywords
    const artistScores = {};
    const genreScores = {};
    const titleKeywords = {};

    // Seed artists from followedArtists first (lower base score to prioritize actual play history)
    followedArtists.forEach(artist => {
      const name = (artist.name || artist).trim().toLowerCase();
      if (name) {
        artistScores[name] = (artistScores[name] || 0) + 4.0;
      }
    });

    scoredSongs.forEach(entry => {
      const { song, score } = entry;
      if (score <= 0) return;

      // Artist preferences
      if (song.artist && song.artist.toLowerCase() !== 'unknown' && song.artist.toLowerCase() !== 'unknown artist') {
        // Split by common delimiters (e.g. "Ed Sheeran, Taylor Swift" or "A & B")
        const artists = song.artist.split(/[,&;]|\bfeat\b|\bft\b/i);
        artists.forEach(a => {
          const name = a.trim().toLowerCase();
          if (name && name !== 'unknown' && name !== 'unknown artist') {
            artistScores[name] = (artistScores[name] || 0) + score;
          }
        });
      }

      // Genre preferences
      if (song.genre && song.genre.toLowerCase() !== 'unknown' && song.genre.toLowerCase() !== 'unknown genre') {
        const genres = song.genre.split(/[,&;/]/);
        genres.forEach(g => {
          const name = g.trim().toLowerCase();
          if (name && name !== 'unknown' && name !== 'unknown genre') {
            genreScores[name] = (genreScores[name] || 0) + score;
          }
        });
      }

      // Title keywords (only from high score tracks)
      if (score >= 5 && song.title) {
        const words = song.title.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/);
        words.forEach(w => {
          if (w.length > 2 && !stopWords.has(w)) {
            titleKeywords[w] = (titleKeywords[w] || 0) + 1.0;
          }
        });
      }
    });

    // Select Seeds
    // Sort songs, artists, genres by score descending
    const sortedScoredSongs = [...scoredSongs].sort((a, b) => b.score - a.score);
    const sortedArtists = Object.entries(artistScores).sort((a, b) => b[1] - a[1]);
    const sortedGenres = Object.entries(genreScores).sort((a, b) => b[1] - a[1]);

    const seedSongs = sortedScoredSongs.slice(0, 10).map(entry => entry.song);
    const seedArtists = sortedArtists.slice(0, 5).map(entry => entry[0]);
    const seedGenres = sortedGenres.slice(0, 5).map(entry => entry[0]);

    // Choose top 6 seed songs (biasing towards stream tracks)
    const streamSeeds = seedSongs.filter(checkIsStream);
    const localSeeds = seedSongs.filter(s => !checkIsStream(s));
    const chosenSeeds = [...streamSeeds, ...localSeeds].slice(0, 6);

    // 3. Multi-Channel Candidate Generation (parallel fetching)
    const candidatePool = [];
    const candidateIds = new Set();
    const fetchPromises = [];

    // Channel 1: Recommendations based on top seed songs
    chosenSeeds.forEach(seed => {
      const vId = seed.videoId || (seed.filepath && seed.filepath.startsWith('yt-stream://') ? seed.filepath.replace('yt-stream://', '') : null);
      if (vId && window.electron.ytGetRecommendations) {
        fetchPromises.push(
          window.electron.ytGetRecommendations(vId)
            .then(res => (res || []).map(track => ({ ...track, source: 'upnext', seedId: vId })))
            .catch(() => [])
        );
      } else if (seed.artist) {
        const primaryArtist = seed.artist.split(/[,&;]/)[0].trim();
        if (primaryArtist && primaryArtist.toLowerCase() !== 'unknown') {
          fetchPromises.push(
            window.electron.ytSearchTrending(`${primaryArtist} songs`, 'song')
              .then(res => (res || []).map(track => ({ ...track, source: 'artist_trending', seedArtist: primaryArtist })))
              .catch(() => [])
          );
        }
      }
    });

    // Channel 2: Search popular tracks for top 2 seed artists
    seedArtists.slice(0, 2).forEach(artist => {
      fetchPromises.push(
        window.electron.ytSearchTrending(`${artist} songs`, 'song')
          .then(res => (res || []).map(track => ({ ...track, source: 'artist_radio', seedArtist: artist })))
          .catch(() => [])
      );
    });

    // Channel 3: Search popular tracks for top 2 seed genres
    seedGenres.slice(0, 2).forEach(genre => {
      fetchPromises.push(
        window.electron.ytSearchTrending(`top ${genre} songs`, 'song')
          .then(res => (res || []).map(track => ({ ...track, source: 'genre_radio', seedGenre: genre })))
          .catch(() => [])
      );
    });

    // Run parallel fetches
    if (fetchPromises.length > 0) {
      try {
        const results = await Promise.all(fetchPromises);
        results.forEach(res => {
          if (Array.isArray(res)) {
            res.forEach(track => {
              const id = track.videoId || track.id;
              if (id && !candidateIds.has(id)) {
                candidatePool.push(track);
                candidateIds.add(id);
              }
            });
          }
        });
      } catch (err) {
        console.error('Failed fetching multi-channel recommendations:', err);
      }
    }

    // Channel 4: Fallback to general language hits if pool is empty or too small
    if (candidatePool.length < 15) {
      try {
        const query = `${language || 'popular'} hit songs`;
        const fallbacks = await window.electron.ytSearchTrending(query, 'song') || [];
        fallbacks.forEach(track => {
          const id = track.videoId || track.id;
          if (id && !candidateIds.has(id)) {
            candidatePool.push({ ...track, source: 'fallback' });
            candidateIds.add(id);
          }
        });
      } catch (err) {
        console.error('Failed fetching fallback recommendations:', err);
      }
    }

    // 4. Client-side Candidate Relevance Scoring
    const libraryVideoIds = new Set(
      localSongs
        .map(s => s.videoId || (s.filepath && s.filepath.startsWith('yt-stream://') ? s.filepath.replace('yt-stream://', '') : null))
        .filter(Boolean)
    );
    const librarySongKeys = new Set(
      localSongs.map(s => `${(s.title || '').trim().toLowerCase()}|${(s.artist || '').trim().toLowerCase()}`)
    );

    const scoredCandidates = candidatePool.map(c => {
      const vId = c.videoId || c.id;
      const title = (c.title || c.name || '').toLowerCase();
      const artistStr = (c.artist || '').toLowerCase();
      const matchKey = `${(c.title || c.name || '').trim().toLowerCase()}|${(c.artist || '').trim().toLowerCase()}`;

      // Exclude if already in local library to focus on discovery (unless it's played a lot and we specifically want to recommend it, but we handle familiar mix separately)
      if (libraryVideoIds.has(vId) || librarySongKeys.has(matchKey)) {
        return { track: c, relevanceScore: -9999 };
      }

      // Exclude regional non-preferred language matches to keep preferences to Hindi and English
      const regionalKeywords = ['tamil', 'telugu', 'bengali', 'malayalam', 'kannada', 'bhojpuri', 'marathi', 'gujarati', 'assamese', 'odia', 'aamaye biye', 'biye ki kari'];
      if (regionalKeywords.some(kw => title.includes(kw) || artistStr.includes(kw))) {
        return { track: c, relevanceScore: -9999 };
      }

      // Exclude blacklisted songs (do not recommend)
      const isBlacklisted = get().blacklistedSongs.some(b => {
        if (vId && b.videoId && vId === b.videoId) return true;
        const t = (c.title || c.name || '').trim().toLowerCase();
        const a = (c.artist || '').trim().toLowerCase();
        if (t && a && b.title && b.artist && 
            t === b.title.trim().toLowerCase() && 
            a === b.artist.trim().toLowerCase()) return true;
        return false;
      });
      if (isBlacklisted) {
        return { track: c, relevanceScore: -9999 };
      }

      let relevance = 0;

      // Match Artist preference
      const candArtists = artistStr.split(/[,&;]|\bfeat\b|\bft\b/i).map(a => a.trim());
      candArtists.forEach(candArt => {
        if (!candArt) return;
        
        // Exact match
        if (artistScores[candArt]) {
          relevance += artistScores[candArt] * 2.5;
        } else {
          // Partial matches
          Object.entries(artistScores).forEach(([userArt, userArtScore]) => {
            if (candArt.includes(userArt) || userArt.includes(candArt)) {
              relevance += userArtScore * 1.5;
            }
          });
        }
      });

      // Match Genre preference
      if (c.genre) {
        const candGenres = c.genre.split(/[,&;/]/).map(g => g.trim().toLowerCase());
        candGenres.forEach(candGen => {
          if (genreScores[candGen]) {
            relevance += genreScores[candGen] * 1.5;
          }
        });
      }

      // Title genre search
      Object.entries(genreScores).forEach(([userGen, userGenScore]) => {
        if (title.includes(userGen)) {
          relevance += userGenScore * 0.5;
        }
      });

      // Title Keywords overlap
      const titleWords = title.replace(/[^\w\s]/g, '').split(/\s+/);
      titleWords.forEach(word => {
        if (titleKeywords[word]) {
          relevance += titleKeywords[word] * 1.5;
        }
      });

      // Boost direct UpNext recommendations proportionally to the seed song's preference score!
      if (c.source === 'upnext' && c.seedId) {
        const seedEntry = scoredSongs.find(entry => 
          entry.song.id === c.seedId || 
          (entry.song.videoId && entry.song.videoId === c.seedId)
        );
        if (seedEntry) {
          relevance += seedEntry.score * 5.0; // Boost proportional to user plays/favorites
        } else {
          relevance += 12.0;
        }
      }

      // Duration verification
      if (c.duration) {
        if (c.duration < 90 || c.duration > 480) {
          relevance -= 15.0; // Penalize loops/effects
        }
      }

      // Noise keyword clean filter
      const noiseKeywords = ['remix', 'cover', 'live', 'lofi', 'lo-fi', 'instrumental', 'karaoke', 'slowed', 'reverb', 'speed up', 'sped up', '8d', 'tribute', 'parody'];
      if (noiseKeywords.some(kw => title.includes(kw))) {
        relevance -= 20.0;
      }

      return { track: c, relevanceScore: relevance };
    });

    // Filter valid discoveries and sort by relevance descending
    const discoveries = scoredCandidates
      .filter(entry => entry.relevanceScore > -100)
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .map(entry => {
        const t = entry.track;
        const vId = t.videoId || t.id;
        return {
          id: vId,
          videoId: vId,
          title: t.title || t.name,
          artist: t.artist,
          album: t.album || 'Recommended discovery',
          coverUrl: t.coverUrl || t.thumbnail,
          duration: t.duration || 0,
          isStream: true,
          filepath: `yt-stream://${vId}`,
          favorite: 0,
          play_count: 0
        };
      });

    // Helper to check if a track is blacklisted
    const isBlacklistedSong = (s) => {
      const vId = s.videoId || (s.filepath && s.filepath.startsWith('yt-stream://') ? s.filepath.replace('yt-stream://', '') : null) || s.id;
      return get().blacklistedSongs.some(b => {
        if (vId && b.videoId && vId === b.videoId) return true;
        const t = (s.title || '').trim().toLowerCase();
        const a = (s.artist || '').trim().toLowerCase();
        if (t && a && b.title && b.artist && 
            t === b.title.trim().toLowerCase() && 
            a === b.artist.trim().toLowerCase()) return true;
        return false;
      });
    };

    // 5. Select Familiar Favorites (strongly biasing towards stream history)
    const streamFavorites = scoredSongs
      .filter(entry => entry.isStream && entry.score > 1.0 && !isBlacklistedSong(entry.song))
      .map(entry => entry.song);

    const localFavorites = scoredSongs
      .filter(entry => !entry.isStream && entry.score > 1.0 && !isBlacklistedSong(entry.song))
      .map(entry => entry.song);

    // Combine favorites prioritizing stream history
    const allFavorites = [...streamFavorites, ...localFavorites];
    const familiarFavorites = allFavorites.slice(0, 12).sort(() => 0.5 - Math.random()).slice(0, 6);

    // 6. Select Forgotten Gems
    // Older tracks in library with moderate play counts (not the top 8)
    const candidatesForForgotten = localSongs
      .filter(s => {
        // Exclude the top active favorites to prevent repetitive recommendations
        const inTopFamiliar = familiarFavorites.some(f => f.id === s.id);
        if (inTopFamiliar) return false;
        
        // Exclude blacklisted
        if (isBlacklistedSong(s)) return false;
        
        return s.favorite === 1 || (s.play_count && s.play_count > 0);
      })
      // Sort by added_at (older first) or play_count ascending
      .sort((a, b) => (a.added_at || 0) - (b.added_at || 0));
    
    const forgottenGems = candidatesForForgotten.slice(0, 15).sort(() => 0.5 - Math.random()).slice(0, 4);

    // Map favorites and forgotten to standard structure
    const mapToStandard = (s) => {
      const vId = s.videoId || (s.filepath && s.filepath.startsWith('yt-stream://') ? s.filepath.replace('yt-stream://', '') : null) || s.id;
      return {
        id: s.id,
        videoId: vId,
        title: s.title,
        artist: s.artist,
        album: s.album || 'Library',
        coverUrl: s.artwork_path || null,
        duration: s.duration || 0,
        filepath: s.filepath,
        favorite: s.favorite || 0,
        play_count: s.play_count || 0,
        isStream: checkIsStream(s)
      };
    };

    const familiarMapped = familiarFavorites.map(mapToStandard);
    const forgottenMapped = forgottenGems.map(mapToStandard);

    // 7. Interleave Playlist Mix (20 discoveries + 6 familiar + 4 forgotten)
    const discoveryMix = discoveries.slice(0, 20);
    const finalPlaylist = [];
    
    let discIndex = 0;
    let famIndex = 0;
    let forgIndex = 0;

    // Sequence loop (max 30 tracks)
    for (let step = 0; step < 30; step++) {
      // 1. Familiar Favorite first hook, then every 5 tracks
      if ((step === 0 || step % 5 === 0) && famIndex < familiarMapped.length) {
        finalPlaylist.push(familiarMapped[famIndex++]);
      } 
      // 2. Forgotten Gem every 7 tracks
      else if (step % 7 === 0 && forgIndex < forgottenMapped.length) {
        finalPlaylist.push(forgottenMapped[forgIndex++]);
      } 
      // 3. Otherwise Discovery
      else if (discIndex < discoveryMix.length) {
        finalPlaylist.push(discoveryMix[discIndex++]);
      } 
      // Fallback in case arrays empty
      else if (famIndex < familiarMapped.length) {
        finalPlaylist.push(familiarMapped[famIndex++]);
      } else if (forgIndex < forgottenMapped.length) {
        finalPlaylist.push(forgottenMapped[forgIndex++]);
      } else {
        break;
      }
    }

    console.log(`[My Taste] Playlist generated with ${finalPlaylist.length} tracks (Discoveries: ${discIndex}, Familiar: ${famIndex}, Forgotten: ${forgIndex})`);
    
    return finalPlaylist;
  },

  fetchTrendingArtists: async (language) => {
    if (!window.electron) return [];
    const results = await window.electron.ytSearchTrending(`top monthly ${language} artist`, 'artist');
    return results || [];
  },

  fetchFollowedArtistsSongs: async (artists) => {
    if (!window.electron || !artists || artists.length === 0) {
      set({ followedArtistSongs: [] });
      return;
    }
    try {
      const promises = artists.map(async (artist) => {
        const id = artist.id || artist.browseId;
        let songs = [];
        if (id && typeof window.electron.ytGetArtistSongs === 'function') {
          songs = await window.electron.ytGetArtistSongs(id) || [];
        } else {
          songs = await window.electron.ytSearch(`${artist.name} songs`) || [];
        }
        
        return songs.filter(s => isArtistMatch(s.artist || '', artist.name));
      });
      const results = await Promise.all(promises);
      
      let combined = [];
      results.forEach(res => {
         if (res && res.length > 0) {
            combined = combined.concat(res);
         }
      });
      
      combined.sort(() => Math.random() - 0.5);
      set({ followedArtistSongs: combined });
    } catch (err) {
      console.error("Failed to fetch followed artist songs", err);
    }
  },

  fetchFollowedArtistsAlbums: async (artists) => {
    if (!window.electron || !artists || artists.length === 0) {
      set({ followedArtistAlbums: [] });
      return;
    }
    
    try {
      const promises = artists.map(async (artist) => {
        const id = artist.id || artist.browseId;
        let albums = [];
        if (id && typeof window.electron.ytGetArtistAlbums === 'function') {
          albums = await window.electron.ytGetArtistAlbums(id) || [];
        } else {
          albums = await window.electron.ytSearchAlbums(artist.name) || [];
        }
        
        return albums.filter(a => isArtistMatch(a.artist || '', artist.name)).slice(0, 10);
      });
      const results = await Promise.all(promises);
      
      let combined = [];
      results.forEach((res, index) => {
         if (res && res.length > 0) {
            combined = combined.concat(res);
         }
      });
      
      // Shuffle albums so it's not all from one artist
      combined.sort(() => Math.random() - 0.5);
      set({ followedArtistAlbums: combined });
    } catch (err) {
      console.error("Failed to fetch followed artist albums", err);
    }
  },

  toggleFollowArtist: (artist) => {
    const { followedArtists } = get();
    const isFollowed = followedArtists.some(a => 
      ((a.id || a.browseId) && (a.id || a.browseId) === (artist.id || artist.browseId)) ||
      (a.name && a.name.toLowerCase() === artist.name.toLowerCase())
    );
    let newFollowed;
    
    if (isFollowed) {
      newFollowed = followedArtists.filter(a => 
        !(((a.id || a.browseId) && (a.id || a.browseId) === (artist.id || artist.browseId)) ||
        (a.name && a.name.toLowerCase() === artist.name.toLowerCase()))
      );
    } else {
      newFollowed = [...followedArtists, artist];
    }
    
    set({ followedArtists: newFollowed });
    localStorage.setItem('stero-followed-artists', JSON.stringify(newFollowed));
    
    get().fetchFollowedArtistsSongs(newFollowed);
    get().fetchFollowedArtistsAlbums(newFollowed);
  },

  viewYtAlbum: async (albumId, albumName) => {
    // Navigate to album-detail and clear active album while loading
    get().setActiveView('album-detail', { albumId, albumName });
    set({ 
      ytActiveAlbum: { loading: true, tracks: [] }
    });
    
    if (!window.electron) return;
    
    try {
      const albumData = await window.electron.ytGetAlbum(albumId);
      if (albumData) {
        set({ ytActiveAlbum: { loading: false, data: albumData, tracks: albumData.tracks } });
      } else {
        set({ ytActiveAlbum: { loading: false, error: 'Failed to load album', tracks: [] } });
      }
    } catch (e) {
      console.error('Failed to view YT album', e);
      set({ ytActiveAlbum: { loading: false, error: e.message, tracks: [] } });
    }
  },

  addYtAlbumToLibrary: async (albumData, tracks) => {
    if (!window.electron) return;
    try {
      const songIds = [];
      const currentSongs = get().songs;
      for (const track of tracks) {
        const vId = track.videoId || track.id;
        // check if already in db
        const existing = currentSongs.find(s => s.filepath === `yt-stream://${vId}`);
        if (existing && existing.id) {
          songIds.push(existing.id);
        } else {
          // Add to DB
          const savedTrack = await window.electron.addStreamSongToDb({
            videoId: vId,
            title: track.title,
            artist: track.artist,
            album: track.album || albumData.title,
            artwork_path: track.coverUrl || track.thumbnail,
            has_artwork: !!(track.coverUrl || track.thumbnail),
            duration: track.duration,
            filepath: `yt-stream://${vId}`,
            favorite: 0,
            isStream: true
          });
          if (savedTrack && savedTrack.id) {
            songIds.push(savedTrack.id);
            set(state => ({ songs: [...state.songs, savedTrack] }));
          }
        }
      }
      
      if (songIds.length > 0) {
        await get().createCustomAlbum(albumData.title, albumData.coverUrl || '', songIds);
        await get().fetchLibrary();
      }
    } catch (err) {
      console.error('Failed to add YT album to library', err);
    }
  },

  fetchLibrary: async () => {
    if (!window.electron) {
      console.warn('window.electron is undefined. Running in mock/browser mode.');
      set({ songs: MOCK_SONGS, playlists: MOCK_PLAYLISTS, customAlbums: [] });
      return;
    }

    let loadedSongs = [];
    try {
      loadedSongs = await window.electron.getSongs() || [];
      set(state => {
        // Only update the library songs. We deliberately do not touch queue, activeTrack, or isPlaying 
        // to ensure that adding or deleting library songs doesn't interrupt the active playback session.
        return { 
          songs: loadedSongs
        };
      });
    } catch (err) {
      console.error('Failed to fetch songs:', err);
    }

    try {
      const playlists = await window.electron.getPlaylists() || [];
      set({ playlists });
    } catch (err) {
      console.error('Failed to fetch playlists:', err);
    }

    try {
      const customAlbums = await window.electron.getCustomAlbums() || [];
      set({ customAlbums });
    } catch (err) {
      console.error('Failed to fetch custom albums:', err);
    }

    try {
      const appSettings = await window.electron.getSettings() || {};
      set({ appSettings });
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    }

    // Restore last session after songs are loaded
    if (!get().sessionRestored) {
      get().restoreSession(loadedSongs || []);
      set({ sessionRestored: true });
    }
  },

  updateAppSetting: async (key, value) => {
    if (!window.electron) {
      set(state => ({
        appSettings: { ...state.appSettings, [key]: value }
      }));
      return;
    }
    try {
      const newSettings = await window.electron.updateSetting(key, value);
      set({ appSettings: newSettings });
    } catch (err) {
      console.error('Failed to update setting', err);
    }
  },

  restoreSession: (songs) => {
    try {
      const followed = localStorage.getItem('stero-followed-artists');
      if (followed) {
        const parsed = JSON.parse(followed);
        set({ followedArtists: parsed });
        get().fetchFollowedArtistsSongs(parsed);
        get().fetchFollowedArtistsAlbums(parsed);
      }
    } catch (e) {
      console.warn('Failed to restore followed artists:', e);
    }
  },

  addToBlacklist: (song) => {
    const vId = song.videoId || song.id;
    if (!vId) return;
    set(state => {
      const exists = state.blacklistedSongs.some(b => b.videoId === vId || b.id === vId);
      if (exists) return state;

      const newBlacklist = [...state.blacklistedSongs, {
        id: vId,
        videoId: vId,
        title: song.title,
        artist: song.artist
      }];
      localStorage.setItem('stero-blacklisted-songs', JSON.stringify(newBlacklist));
      
      const newMyTaste = state.myTaste.filter(s => (s.videoId || s.id) !== vId);
      
      return { 
        blacklistedSongs: newBlacklist,
        myTaste: newMyTaste
      };
    });
  },

  setSearchQuery: (query) => set({ searchQuery: query }),
  
  setActiveView: (view, extra = {}) => {
    const newState = {
      activeView: view,
      selectedPlaylistId: extra.playlistId || null,
      selectedAlbumName: extra.albumName || null,
      selectedAlbumId: extra.albumId || null,
      selectedArtist: extra.artist || null,
    };

    set(state => {
      // Don't add duplicate of current view to history
      const current = state.viewHistory[state.historyIndex];
      if (
        current &&
        current.activeView === newState.activeView &&
        current.selectedPlaylistId === newState.selectedPlaylistId &&
        current.selectedAlbumName === newState.selectedAlbumName &&
        current.selectedAlbumId === newState.selectedAlbumId
      ) {
        return newState;
      }

      const newHistory = state.viewHistory.slice(0, state.historyIndex + 1);
      newHistory.push(newState);
      
      if (newHistory.length > 50) newHistory.shift();

      return {
        ...newState,
        viewHistory: newHistory,
        historyIndex: newHistory.length - 1
      };
    });
    
    if (view === 'playlist-detail' && extra.playlistId) {
      get().fetchPlaylistSongs(extra.playlistId);
    }
  },

  goBackView: () => {
    set(state => {
      if (state.historyIndex > 0) {
        const prevIndex = state.historyIndex - 1;
        const prevState = state.viewHistory[prevIndex];
        return {
          ...prevState,
          historyIndex: prevIndex
        };
      }
      return {};
    });
  },

  goForwardView: () => {
    set(state => {
      if (state.historyIndex < state.viewHistory.length - 1) {
        const nextIndex = state.historyIndex + 1;
        const nextState = state.viewHistory[nextIndex];
        return {
          ...nextState,
          historyIndex: nextIndex
        };
      }
      return {};
    });
  },


  // Custom Album Actions
  fetchCustomAlbums: async () => {
    if (!window.electron) return;
    try {
      const customAlbums = await window.electron.getCustomAlbums();
      set({ customAlbums });
    } catch (err) {
      console.error('Failed to fetch custom albums:', err);
    }
  },

  createCustomAlbum: async (name, coverPath, songIds) => {
    try {
      if (window.electron) {
        await window.electron.createCustomAlbum(name, coverPath, songIds);
        const customAlbums = await window.electron.getCustomAlbums() || [];
        set({ customAlbums });
        get().fetchLibrary(); // refresh songs map as well
      } else {
        // mock mode
        const newAlbum = { id: Date.now(), name, cover_path: coverPath, created_at: Date.now(), songs: [] };
        set(state => ({ customAlbums: [...state.customAlbums, newAlbum] }));
      }
    } catch (err) {
      console.error('Failed to create custom album:', err);
    }
  },

  updateCustomAlbum: async (albumId, name, coverPath, songIds) => {
    try {
      if (songIds.length === 0) {
        await get().deleteCustomAlbum(albumId);
        return null;
      }

      if (window.electron && window.electron.updateCustomAlbum) {
        await window.electron.updateCustomAlbum(albumId, name, coverPath, songIds);
        const customAlbums = await window.electron.getCustomAlbums() || [];
        set({ customAlbums });
        get().fetchLibrary(); // refresh songs map
      } else {
        set(state => ({
          customAlbums: state.customAlbums.map(album => 
            album.id === albumId ? { ...album, name, cover_path: coverPath } : album
          )
        }));
      }
    } catch (err) {
      console.error('Failed to update album:', err);
    }
  },

  addSongToCustomAlbum: async (albumId, song) => {
    try {
      const album = get().customAlbums.find(a => a.id === albumId);
      if (!album) return;
      
      let trackIdToSave = song.id || song.videoId;
      
      if (window.electron && typeof trackIdToSave === 'string') {
        const newDbSong = await window.electron.addStreamSongToDb(song);
        if (newDbSong && newDbSong.id) {
          trackIdToSave = newDbSong.id;
        }
      }

      const currentSongIds = (album.songs || []).map(s => s.id);
      if (currentSongIds.includes(trackIdToSave)) return; // Already exists

      const newSongIds = [...currentSongIds, trackIdToSave];
      await get().updateCustomAlbum(albumId, album.name, album.cover_path, newSongIds);
    } catch (err) {
      console.error('Failed to add song to custom album:', err);
    }
  },

  deleteCustomAlbum: async (albumId) => {
    try {
      const deletedAlbum = get().customAlbums.find(a => a.id === albumId);
      const deletedName = deletedAlbum ? deletedAlbum.name : '';

      if (window.electron) {
        await window.electron.deleteCustomAlbum(albumId);
      }
      set(state => {
        const cleanSong = (s) => s.album === deletedName ? { ...s, album: 'Unknown' } : s;
        return {
          customAlbums: state.customAlbums.filter(a => a.id !== albumId),
          songs: state.songs.map(cleanSong),
          queue: state.queue.map(cleanSong),
          activeTrack: state.activeTrack && state.activeTrack.album === deletedName
            ? { ...state.activeTrack, album: 'Unknown' }
            : state.activeTrack,
          activeView: state.activeView === 'album-detail' && state.selectedAlbumId === albumId
            ? 'albums' : state.activeView
        };
      });
    } catch (err) {
      console.error('Failed to delete album:', err);
    }
  },

  // Scanning Folder (first time — opens picker, saves the path)
  scanFolder: async () => {
    try {
      if (!window.electron) {
        alert('Scanning requires running inside the Stero Electron application.');
        return;
      }
      set({ scanStatus: { current: 0, total: 0, status: 'started' } });
      const folderPath = await window.electron.selectFolder();
      if (!folderPath) {
        set({ scanStatus: { current: 0, total: 0, status: 'idle' } });
        return;
      }
      
      const songs = await window.electron.scanFolder(folderPath);
      set({ songs });
    } catch (err) {
      console.error('Error scanning folder:', err);
      set({ scanStatus: { current: 0, total: 0, status: 'idle' } });
    }
  },

  // Resync — reuse previously saved folder path (no picker dialog)
  resyncFolder: async () => {
    try {
      if (!window.electron) return;

      const savedFolder = await window.electron.getSavedFolder();
      if (!savedFolder) {
        // No folder saved yet — fall back to folder picker
        await get().scanFolder();
        return;
      }
      
      set({ scanStatus: { current: 0, total: 0, status: 'started' } });
      const songs = await window.electron.scanFolder(savedFolder);
      set({ songs });
    } catch (err) {
      console.error('Error resyncing folder:', err);
      set({ scanStatus: { current: 0, total: 0, status: 'idle' } });
    }
  },

  setScanStatus: (status) => set({ scanStatus: status }),

  updateSongMeta: async (songId, meta) => {
    // Optimistic update — apply immediately from form data so UI reflects change at once
    const applyPatch = (data) => {
      const patch = (s) => s.id === songId ? { ...s, ...data } : s;
      set(state => ({
        songs: state.songs.map(patch),
        queue: state.queue.map(patch),
        currentPlaylistSongs: state.currentPlaylistSongs.map(patch),
        customAlbums: state.customAlbums.map(album => ({
          ...album,
          songs: (album.songs || []).map(patch)
        })),
        activeTrack: state.activeTrack?.id === songId
          ? { ...state.activeTrack, ...data }
          : state.activeTrack,
        // Keep editingSong in sync so the modal shows fresh data
        editingSong: state.editingSong?.id === songId
          ? { ...state.editingSong, ...data }
          : state.editingSong
      }));
    };

    // Apply optimistic patch right away
    applyPatch(meta);

    // Persist to DB (Electron) and re-patch with canonical DB row if returned
    if (window.electron) {
      try {
        const dbRow = await window.electron.updateSong(songId, meta);
        if (dbRow) {
          applyPatch(dbRow);
          // Reload the library so custom playlist mappings (customAlbums) are refreshed from SQLite
          await get().fetchLibrary();
        }
      } catch (err) {
        console.error('Failed to persist song meta to DB:', err);
      }
    }
  },

  // Playback Actions
  streamTrack: async (songMeta, trackList = []) => {
    if (!window.electron) return;
    
    // Map the incoming youtube track list to standard track objects so the queue and visualizer work perfectly
    const mappedList = trackList.map(t => {
      const vId = t.videoId || (typeof t.id === 'string' ? t.id : null);
      const isYtStream = !!vId || (t.filepath && typeof t.filepath === 'string' && t.filepath.startsWith('yt-stream://'));
      
      let isFav = t.favorite;
      if (isFav === undefined && vId) {
        const dbMatch = get().songs.find(s => s.filepath === `yt-stream://${vId}`);
        if (dbMatch) isFav = dbMatch.favorite;
      }

      return {
        ...t,
        id: vId || t.id,
        videoId: vId,
        title: t.title,
        artist: t.artist,
        album: t.album,
        artwork_path: t.coverUrl || t.thumbnail || t.artwork_path,
        has_artwork: !!(t.coverUrl || t.thumbnail || t.artwork_path || t.has_artwork),
        isStream: isYtStream,
        filepath: (t.filepath && t.filepath.startsWith('http')) ? t.filepath : (isYtStream ? `yt-stream://${vId}` : (t.filepath || '')),
        duration: t.duration || 0,
        favorite: isFav
      };
    });

    // Find the current track in the mapped list, or fallback to standalone
    let tempTrack = mappedList.find(t => t.id === (songMeta.videoId || songMeta.id) || t.videoId === (songMeta.videoId || songMeta.id)) || {
      ...songMeta,
      id: songMeta.videoId || songMeta.id,
      title: songMeta.title,
      artist: songMeta.artist,
      album: songMeta.album,
      artwork_path: songMeta.coverUrl || songMeta.thumbnail || songMeta.artwork_path,
      has_artwork: !!(songMeta.coverUrl || songMeta.thumbnail || songMeta.artwork_path || songMeta.has_artwork),
      isStream: true,
      filepath: (songMeta.filepath && songMeta.filepath.startsWith('http')) ? songMeta.filepath : `yt-stream://${songMeta.videoId || songMeta.id}`,
      duration: songMeta.duration || 0,
      favorite: songMeta.favorite !== undefined ? songMeta.favorite : (() => {
        const vId = songMeta.videoId || (typeof songMeta.id === 'string' ? songMeta.id : null);
        if (vId) {
          const dbMatch = get().songs.find(s => s.filepath === `yt-stream://${vId}`);
          return dbMatch ? dbMatch.favorite : 0;
        }
        return 0;
      })()
    };
    
    // Auto-save the stream to DB so we can track plays and favorites
    if (window.electron && (!tempTrack.id || typeof tempTrack.id === 'string')) {
      try {
        const savedTrack = await window.electron.addStreamSongToDb(tempTrack);
        if (savedTrack && savedTrack.id) {
          tempTrack = { ...tempTrack, id: savedTrack.id };
          set(state => {
             const exists = state.songs.find(s => s.id === savedTrack.id);
             return exists ? state : { songs: [...state.songs, savedTrack] };
          });
        }
      } catch (err) {
        console.error('Failed to auto-save stream song', err);
      }
    }

    get().addToHistory(tempTrack);

    // Play immediately to show UI (will be silent/buffering until URL is fetched)
    get().playTrack(tempTrack, mappedList.length > 0 ? mappedList : [tempTrack]);
  },

  addToHistory: (track) => {
    set((state) => {
      // Remove duplicate if it exists, then prepend to top
      const filtered = state.playHistory.filter(t => (t.videoId || t.id) !== (track.videoId || track.id));
      const newHistory = [track, ...filtered].slice(0, 20); // Keep last 20
      return { playHistory: newHistory };
    });
  },

  fetchRecommendationsForTrack: async (track) => {
    let videoId = track.videoId;
    if (!videoId && typeof track.id === 'string' && track.id.length === 11 && !track.id.includes('/')) {
      videoId = track.id;
    }
    if (!videoId && track.filepath && track.filepath.startsWith('yt-stream://')) {
      videoId = track.filepath.replace('yt-stream://', '');
    }
    if (!videoId || !window.electron || !window.electron.ytGetRecommendations) return;
    
    try {
      const recommendations = await window.electron.ytGetRecommendations(videoId);
      if (recommendations && recommendations.length > 0) {
        const mappedRecs = recommendations.map(r => {
          const vId = r.videoId || r.id;
          return {
            ...r,
            id: vId,
            videoId: vId,
            isStream: true,
            filepath: `yt-stream://${vId}`,
            favorite: (() => {
              const dbMatch = get().songs.find(s => s.filepath === `yt-stream://${vId}`);
              return dbMatch ? dbMatch.favorite : 0;
            })()
          };
        });

        const regionalKeywords = ['tamil', 'telugu', 'bengali', 'malayalam', 'kannada', 'bhojpuri', 'marathi', 'gujarati', 'assamese', 'odia', 'aamaye biye', 'biye ki kari'];
        const filteredRecs = mappedRecs.filter(r => {
          const t = (r.title || '').toLowerCase();
          const a = (r.artist || '').toLowerCase();
          if (regionalKeywords.some(kw => t.includes(kw) || a.includes(kw))) return false;

          // Exclude blacklisted songs
          const isBlacklisted = get().blacklistedSongs.some(b => {
            const vId = r.videoId || r.id;
            if (vId && b.videoId && vId === b.videoId) return true;
            const rt = (r.title || '').trim().toLowerCase();
            const ra = (r.artist || '').trim().toLowerCase();
            if (rt && ra && b.title && b.artist && 
                rt === b.title.trim().toLowerCase() && 
                ra === b.artist.trim().toLowerCase()) return true;
            return false;
          });
          return !isBlacklisted;
        });
        
        const playingArtist = (track.artist || '').toLowerCase().trim();
        const followed = get().followedArtists.map(a => (a.name || a).toLowerCase().trim());
        
        const rankedRecs = filteredRecs.map(r => {
          let score = 0;
          const rArtist = (r.artist || '').toLowerCase().trim();
          
          // Boost same artist
          if (playingArtist && (rArtist.includes(playingArtist) || playingArtist.includes(rArtist))) {
            score += 100;
          }
          
          // Boost followed artists
          if (followed.some(f => rArtist.includes(f) || f.includes(rArtist))) {
            score += 50;
          }
          
          return { track: r, score };
        })
        .sort((a, b) => b.score - a.score)
        .map(entry => entry.track);
        
        const currentActive = get().activeTrack;
        if (currentActive && isSameTrack(currentActive, track)) {
          set({
            queue: [currentActive, ...rankedRecs],
            originalQueue: [currentActive, ...rankedRecs],
            queueIndex: 0
          });
          console.log(`[Queue] Populated queue with ${rankedRecs.length} ranked recommendations for: ${currentActive.title}`);
        }
      }
    } catch (err) {
      console.error('Failed to fetch recommendations for queue:', err);
    }
  },

  playTrack: (track, trackList = [], playlistId = undefined) => {
    get().addToHistory(track);
    
    // Route YouTube search results to streamTrack to get saved to DB first
    const isUnsavedYoutube = !!track.videoId && (!track.id || typeof track.id === 'string');
    if (isUnsavedYoutube) {
      get().streamTrack(track, trackList);
      return;
    }

    let list = trackList.length > 0 ? trackList : [track];
    let index = list.findIndex(t => t.id === track.id || (t.videoId || t.id) === (track.videoId || track.id));
    
    let resolvedPlaylistId = null;
    if (playlistId !== undefined) {
      resolvedPlaylistId = playlistId;
    } else {
      const state = get();
      if (state.activeView === 'album-detail' || state.activeView === 'playlist-detail') {
        resolvedPlaylistId = state.selectedAlbumId || state.selectedPlaylistId;
      }
    }

    // 1. Context Detection & Filtering
    const state = get();
    const isStream = track.isStream || !!track.videoId || track.filepath?.startsWith('yt-stream://') || track.filepath?.startsWith('http');
    const isMusicView = state.activeView === 'music';

    // 2. Instant Playback (Zero-Latency Start)
    if (isStream && (isMusicView || state.activeView === 'visualizer') && !resolvedPlaylistId) {
       // Isolate the song and set active queue to just [track]
       list = [track];
       index = 0;
       
       // 3. Background Recommendation Fetching
       setTimeout(() => {
         get().fetchRecommendationsForTrack(track);
       }, 50);
    }

    set({
      activeTrack: track,
      queue: list,
      originalQueue: list,
      queueIndex: index !== -1 ? index : 0,
      isPlaying: true,
      activePlaylistId: resolvedPlaylistId,
      currentRepeatCount: 0,
      savedPosition: 0,
      // Clear stale lyrics immediately so sidebar shows loading state for new track
      activeTrackLyrics: { loading: false, data: null, error: null }
    });

    // Increment play count in DB and update state
    if (window.electron) {
      window.electron.incrementPlayCount(track.id);
    }
    set(state => {
      const isMatch = (s) => s.id === track.id || (s.videoId && track.videoId && s.videoId === track.videoId) || (s.videoId && typeof track.id === 'string' && s.videoId === track.id);
      return {
        songs: state.songs.map(s => isMatch(s) ? { ...s, play_count: (s.play_count || 0) + 1 } : s),
        ytSearchResults: state.ytSearchResults ? state.ytSearchResults.map(s => isMatch(s) ? { ...s, play_count: (s.play_count || 0) + 1 } : s) : null,
        trendingSongs: state.trendingSongs.map(s => isMatch(s) ? { ...s, play_count: (s.play_count || 0) + 1 } : s)
      };
    });

    setTimeout(() => {
      get().preloadNextTrack();
    }, 1000);

    // Pre-fetch lyrics in background so they're ready when lyrics sidebar is opened
    setTimeout(() => {
      get().fetchActiveTrackLyrics();
    }, 300);
  },

  preloadNextTrack: async () => {
    const { queue, queueIndex, shuffle } = get();
    if (queue.length <= 1) return;

    let nextIndex;
    if (shuffle) {
      nextIndex = (queueIndex + 1) % queue.length;
    } else {
      nextIndex = queueIndex + 1;
    }

    if (nextIndex < queue.length) {
      const nextTrack = queue[nextIndex];
      if (nextTrack && nextTrack.isStream && !nextTrack.filepath && window.electron) {
        console.log(`[Preload] Resolving stream URL in background for next track: ${nextTrack.title}`);
        window.electron.ytGetStreamUrl(nextTrack.videoId || nextTrack.id).then(result => {
          if (result && result.success && result.url) {
            set(state => {
              const updatedQueue = state.queue.map((t, idx) => 
                idx === nextIndex ? { ...t, filepath: result.url } : t
              );
              return { 
                queue: updatedQueue,
                activeTrack: state.activeTrack?.id === nextTrack.id && !state.activeTrack.filepath
                  ? { ...state.activeTrack, filepath: result.url }
                  : state.activeTrack
              };
            });
            console.log(`[Preload] Successfully preloaded stream URL for: ${nextTrack.title}`);
          }
        }).catch(err => console.warn('[Preload] Failed to preload:', err));
      }
    }
  },

  preloadTrack: async (track) => {
    if (!track || !window.electron) return;
    const videoId = track.videoId || track.id;
    if (typeof videoId !== 'string' || videoId.length !== 11) return;
    
    if (track.filepath && track.filepath.startsWith('http')) return;

    window.electron.ytGetStreamUrl(videoId).then(result => {
      if (result && result.success && result.url) {
        console.log(`[Preload] Pre-resolved successfully for hover: ${track.title}`);
        set(state => {
          const updateSong = (s) => (s.videoId === videoId || s.id === videoId) ? { ...s, filepath: result.url } : s;
          return {
            songs: state.songs.map(updateSong),
            queue: state.queue.map(updateSong),
            ytSearchResults: state.ytSearchResults ? state.ytSearchResults.map(updateSong) : null,
            trendingSongs: state.trendingSongs.map(updateSong)
          };
        });
      }
    }).catch(err => console.warn('[Preload] Hover preload failed:', err));
  },

  togglePlay: () => {
    const { activeTrack, songs } = get();
    if (!activeTrack && songs.length > 0) {
      // Play first song in list if nothing is active
      get().playTrack(songs[0], songs);
      return;
    }
    set(state => ({ isPlaying: !state.isPlaying }));
  },

  nextTrack: () => {
    const { queue, queueIndex } = get();
    if (queue.length === 0) return;

    let nextIndex = queueIndex + 1;
    if (nextIndex >= queue.length) {
      // End of queue and no repeat-all
      set({ isPlaying: false });
      return;
    }

    const nextTrack = queue[nextIndex];
    if (nextTrack) {
      set({ activeTrack: nextTrack, queueIndex: nextIndex, isPlaying: true, currentRepeatCount: 0 });
      if (window.electron) {
        window.electron.incrementPlayCount(nextTrack.id);
      }
      set(state => ({
        songs: state.songs.map(s => s.id === nextTrack.id ? { ...s, play_count: (s.play_count || 0) + 1 } : s)
      }));

      if (nextTrack.isStream && !nextTrack.filepath && window.electron) {
        window.electron.ytGetStreamUrl(nextTrack.videoId || nextTrack.id).then(result => {
           if (result && result.success && result.url) {
             set(state => ({
               activeTrack: state.activeTrack?.id === nextTrack.id 
                 ? { ...state.activeTrack, filepath: result.url } 
                 : state.activeTrack
             }));
           }
        }).catch(err => console.error("Failed to fetch stream for next track:", err));
      }

      setTimeout(() => {
        get().preloadNextTrack();
      }, 1000);
    }
  },

  prevTrack: () => {
    const { queue, queueIndex } = get();
    if (queue.length === 0) return;

    let prevIndex = queueIndex - 1;
    if (prevIndex < 0) {
      // Stay at the first song
      prevIndex = 0;
    }

    const prevTrack = queue[prevIndex];
    if (prevTrack) {
      set({ activeTrack: prevTrack, queueIndex: prevIndex, isPlaying: true, currentRepeatCount: 0 });

      if (prevTrack.isStream && !prevTrack.filepath && window.electron) {
        window.electron.ytGetStreamUrl(prevTrack.videoId || prevTrack.id).then(result => {
           if (result && result.success && result.url) {
             set(state => ({
               activeTrack: state.activeTrack?.id === prevTrack.id 
                 ? { ...state.activeTrack, filepath: result.url } 
                 : state.activeTrack
             }));
           }
        }).catch(err => console.error("Failed to fetch stream for prev track:", err));
      }

      setTimeout(() => {
        get().preloadNextTrack();
      }, 1000);
    }
  },

  setVolume: (vol) => {
    set({ volume: vol });
    localStorage.setItem('stero-volume', vol);
  },
  setMuted: (isMuted) => {
    set({ muted: isMuted });
    localStorage.setItem('stero-muted', isMuted);
  },
  setShuffle: (shuf) => set((state) => {
    const originalQ = state.originalQueue || state.queue || [];
    if (shuf) {
      const activeTrack = state.activeTrack;
      if (!activeTrack || originalQ.length === 0) return { shuffle: true };
      
      const shuffled = [...originalQ];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      
      const currentIndex = shuffled.findIndex(t => t.id === activeTrack.id || (t.videoId && t.videoId === activeTrack.videoId));
      if (currentIndex !== -1) {
        shuffled.splice(currentIndex, 1);
        shuffled.unshift(activeTrack);
      }
      
      return { shuffle: true, queue: shuffled, originalQueue: originalQ, queueIndex: 0 };
    } else {
      const activeTrack = state.activeTrack;
      let newIndex = 0;
      if (activeTrack && originalQ.length > 0) {
        newIndex = originalQ.findIndex(t => t.id === activeTrack.id || (t.videoId && t.videoId === activeTrack.videoId));
        if (newIndex === -1) newIndex = 0;
      }
      return { shuffle: false, queue: originalQ, originalQueue: originalQ, queueIndex: newIndex };
    }
  }),
  setRepeatMode: (mode) => set({ repeatMode: mode }),
  incrementRepeatCount: () => set(state => ({ currentRepeatCount: state.currentRepeatCount + 1 })),
  resetRepeatCount: () => set({ currentRepeatCount: 0 }),

  // Favorites Operations
  toggleFavorite: async (songId, favoriteStatus, trackObj = null) => {
    if (!window.electron) return;

    if (favoriteStatus === undefined) {
      if (typeof songId === 'string') {
        const dbMatch = get().songs.find(s => s.filepath === `yt-stream://${songId}`);
        favoriteStatus = dbMatch?.favorite === 1 ? 0 : 1;
      } else {
        const dbMatch = get().songs.find(s => s.id === songId);
        favoriteStatus = dbMatch?.favorite === 1 ? 0 : 1;
      }
    }

    // If it has a string ID but is actually already in the DB, switch to its numeric ID
    if (typeof songId === 'string') {
      const dbMatch = get().songs.find(s => s.filepath === `yt-stream://${songId}`);
      if (dbMatch) {
        songId = dbMatch.id;
      }
    }

    // Handle ephemeral streaming tracks that aren't in the DB yet
    if (typeof songId === 'string') {
      const trackMeta = trackObj || (get().activeTrack?.id === songId ? get().activeTrack : null) || (get().activeTrack?.videoId === songId ? get().activeTrack : null);
      if (!trackMeta) return;

      try {
        const newDbSong = await window.electron.addStreamSongToDb(trackMeta);
        await window.electron.toggleFavorite(newDbSong.id, favoriteStatus);
        
        const updateQueueSong = (s) => (s.id === songId || s.videoId === songId) ? { ...s, id: songId, favorite: favoriteStatus } : s; // Keep string ID in queue so playback indexing stays robust, just update favorite
        
        // Update active track and optimistically add to songs list without fetching library to prevent flicker
        const songWithFav = { ...newDbSong, favorite: favoriteStatus };
        if (get().activeTrack?.id === songId || get().activeTrack?.videoId === songId) {
          set(state => ({ 
            songs: [...state.songs, songWithFav],
            activeTrack: { ...state.activeTrack, favorite: favoriteStatus },
            queue: state.queue.map(updateQueueSong),
            currentPlaylistSongs: state.currentPlaylistSongs.map(updateQueueSong)
          }));
        } else {
          set(state => ({ 
            songs: [...state.songs, songWithFav],
            queue: state.queue.map(updateQueueSong),
            currentPlaylistSongs: state.currentPlaylistSongs.map(updateQueueSong)
          }));
        }

      } catch (err) {
        console.error("Failed to favorite stream track:", err);
      }
      return;
    }

    try {
      await window.electron.toggleFavorite(songId, favoriteStatus);
      
      const dbMatch = get().songs.find(s => s.id === songId);
      const videoIdMatch = dbMatch?.filepath?.startsWith('yt-stream://') ? dbMatch.filepath.replace('yt-stream://', '') : null;
      
      // Update local state arrays
      const updateSong = (s) => (s.id === songId || (videoIdMatch && s.videoId === videoIdMatch)) ? { ...s, favorite: favoriteStatus } : s;
      
      set(state => ({
        songs: state.songs.map(updateSong),
        queue: state.queue.map(updateSong),
        currentPlaylistSongs: state.currentPlaylistSongs.map(updateSong),
        activeTrack: (state.activeTrack && (state.activeTrack.id === songId || (videoIdMatch && state.activeTrack.videoId === videoIdMatch)))
          ? { ...state.activeTrack, favorite: favoriteStatus } 
          : state.activeTrack
      }));
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  },

  // Playlists Operations
  createPlaylist: async (name) => {
    if (!name.trim()) return;
    try {
      if (window.electron) {
        const newPlaylist = await window.electron.createPlaylist(name);
        if (newPlaylist) {
          const playlists = await window.electron.getPlaylists();
          set({ playlists });
        }
      } else {
        const newId = MOCK_PLAYLISTS.length + 101;
        MOCK_PLAYLISTS.push({ id: newId, name, created_at: Date.now(), songIds: [] });
        set({ playlists: [...MOCK_PLAYLISTS] });
      }
    } catch (err) {
      console.error('Failed to create playlist:', err);
    }
  },

  deletePlaylist: async (playlistId) => {
    try {
      if (window.electron) {
        const updatedPlaylists = await window.electron.deletePlaylist(playlistId);
        set({ playlists: updatedPlaylists });
      } else {
        const idx = MOCK_PLAYLISTS.findIndex(p => p.id === playlistId);
        if (idx !== -1) MOCK_PLAYLISTS.splice(idx, 1);
        set({ playlists: [...MOCK_PLAYLISTS] });
      }
      
      // If we are currently viewing the deleted playlist, redirect to dashboard
      const { activeView, selectedPlaylistId } = get();
      if (activeView === 'playlist-detail' && selectedPlaylistId === playlistId) {
        set({ activeView: 'dashboard', selectedPlaylistId: null });
      }
    } catch (err) {
      console.error('Failed to delete playlist:', err);
    }
  },

  addSongToPlaylist: async (playlistId, songId) => {
    try {
      if (window.electron) {
        const updatedSongs = await window.electron.addSongToPlaylist(playlistId, songId);
        
        // If we are currently viewing this playlist, update the songs list
        const { activeView, selectedPlaylistId } = get();
        if (activeView === 'playlist-detail' && selectedPlaylistId === playlistId) {
          set({ currentPlaylistSongs: updatedSongs });
        }
      } else {
        const playlist = MOCK_PLAYLISTS.find(p => p.id === playlistId);
        if (playlist && !playlist.songIds.includes(songId)) {
          playlist.songIds.push(songId);
          get().fetchPlaylistSongs(playlistId);
        }
      }
    } catch (err) {
      console.error('Failed to add song to playlist:', err);
    }
  },

  removeSongFromPlaylist: async (playlistId, songId) => {
    try {
      if (window.electron) {
        const updatedSongs = await window.electron.removeSongFromPlaylist(playlistId, songId);
        
        if (updatedSongs && updatedSongs.length === 0) {
          await get().deletePlaylist(playlistId);
        } else {
          // If we are currently viewing this playlist, update the songs list
          const { activeView, selectedPlaylistId } = get();
          if (activeView === 'playlist-detail' && selectedPlaylistId === playlistId) {
            set({ currentPlaylistSongs: updatedSongs });
          }
        }
      } else {
        const playlist = MOCK_PLAYLISTS.find(p => p.id === playlistId);
        if (playlist) {
          playlist.songIds = playlist.songIds.filter(id => id !== songId);
          if (playlist.songIds.length === 0) {
            get().deletePlaylist(playlistId);
          } else {
            get().fetchPlaylistSongs(playlistId);
          }
        }
      }
    } catch (err) {
      console.error('Failed to remove song from playlist:', err);
    }
  },

  fetchPlaylistSongs: async (playlistId) => {
    try {
      if (window.electron) {
        const songs = await window.electron.getPlaylistSongs(playlistId);
        set({ currentPlaylistSongs: songs });
      } else {
        const playlist = MOCK_PLAYLISTS.find(p => p.id === playlistId);
        if (playlist) {
          const list = playlist.songIds
            .map(id => MOCK_SONGS.find(s => s.id === id))
            .filter(Boolean);
          set({ currentPlaylistSongs: list });
        } else {
          set({ currentPlaylistSongs: [] });
        }
      }
    } catch (err) {
      console.error('Failed to fetch playlist songs:', err);
    }
  }
}));
