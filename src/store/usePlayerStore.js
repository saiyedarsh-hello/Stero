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
  
  // Navigation & View
  activeView: 'music', // 'songs', 'favorites', 'playlist-detail', 'album-detail', 'downloads'
  selectedPlaylistId: null,
  selectedAlbumName: null,
  selectedAlbumId: null,
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
    
    // 1. Gather all songs, and find frequently played / favorite ones
    const localSongs = state.songs || [];
    const frequentSongs = localSongs
      .filter(s => s.play_count && s.play_count > 0)
      .sort((a, b) => (b.play_count || 0) - (a.play_count || 0));
    
    const favoriteSongs = localSongs.filter(s => s.favorite === 1);
    
    // Combine to get seed tracks (favorites first, then top played)
    const seedTracks = [];
    const seedIds = new Set();
    
    favoriteSongs.forEach(s => {
      const id = s.videoId || (s.filepath && s.filepath.startsWith('yt-stream://') ? s.filepath.replace('yt-stream://', '') : null) || s.id;
      if (id && !seedIds.has(id)) {
        seedTracks.push(s);
        seedIds.add(id);
      }
    });

    frequentSongs.forEach(s => {
      const id = s.videoId || (s.filepath && s.filepath.startsWith('yt-stream://') ? s.filepath.replace('yt-stream://', '') : null) || s.id;
      if (id && !seedIds.has(id)) {
        seedTracks.push(s);
        seedIds.add(id);
      }
    });

    // Select up to 4 seed tracks randomly from the top 10
    const chosenSeeds = seedTracks.slice(0, 10).sort(() => 0.5 - Math.random()).slice(0, 4);
    
    let recommendationSongs = [];
    
    // 2. Fetch recommendations for these seeds
    if (chosenSeeds.length > 0) {
      try {
        const promises = chosenSeeds.map(async (track) => {
          const vId = track.videoId || (track.filepath && track.filepath.startsWith('yt-stream://') ? track.filepath.replace('yt-stream://', '') : null);
          if (vId && window.electron.ytGetRecommendations) {
            // High-precision recommendations based on a YouTube stream
            return await window.electron.ytGetRecommendations(vId);
          } else if (track.artist) {
            // Fallback: search for trending songs by this artist
            const primaryArtist = track.artist.split(',')[0].trim();
            if (primaryArtist && primaryArtist.toLowerCase() !== 'unknown' && primaryArtist.toLowerCase() !== 'unknown artist') {
              return await window.electron.ytSearchTrending(`${primaryArtist} songs`, 'song');
            }
          }
          return [];
        });
        
        const results = await Promise.all(promises);
        results.forEach(res => {
          if (Array.isArray(res)) {
            recommendationSongs = recommendationSongs.concat(res);
          }
        });
      } catch (err) {
        console.error('Failed to fetch high-precision recommendations for My Taste:', err);
      }
    }

    // 3. Fallback to general hits if we got nothing
    if (recommendationSongs.length === 0) {
      try {
        const query = `${language} hit songs`;
        recommendationSongs = await window.electron.ytSearchTrending(query, 'song') || [];
      } catch (err) {
        console.error('Failed to fetch fallback trending songs:', err);
      }
    }

    // 4. Client-side original song filter (double safety check)
    const excludeKeywords = ['remix', 'cover', 'live', 'lofi', 'lo-fi', 'instrumental', 'karaoke', 'slowed', 'reverb', 'speed up', 'sped up', '8d', 'tribute', 'parody'];
    const filteredRecs = recommendationSongs.filter(r => {
      const title = (r.title || r.name || '').toLowerCase();
      return !excludeKeywords.some(keyword => title.includes(keyword));
    });

    // Remove duplicates
    const uniqueRecommendations = Array.from(
      new Map(filteredRecs.map(s => [s.videoId || s.id, s])).values()
    );

    // 5. Mix in user's frequently played tracks
    const frequentMix = frequentSongs.slice(0, 10).map(s => {
      const vId = s.videoId || (s.filepath && s.filepath.startsWith('yt-stream://') ? s.filepath.replace('yt-stream://', '') : null);
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
        play_count: s.play_count || 0
      };
    });

    // 6. Combine and shuffle
    const combined = [...frequentMix, ...uniqueRecommendations];
    const shuffled = combined.sort(() => 0.5 - Math.random());
    
    return shuffled.slice(0, 30);
  },

  fetchTrendingArtists: async (language) => {
    if (!window.electron) return [];
    const results = await window.electron.ytSearchTrending(`top 10 monthly ${language} artist`, 'artist');
    // Ensure we only return top 10
    return results.slice(0, 10);
  },

  fetchFollowedArtistsSongs: async (artists) => {
    if (!window.electron || !artists || artists.length === 0) {
      set({ followedArtistSongs: [] });
      return;
    }
    
    try {
      const promises = artists.map(artist => window.electron.ytSearch(`${artist.name} songs`));
      const results = await Promise.all(promises);
      
      let combined = [];
      results.forEach(res => {
         if (res && res.length > 0) {
            combined = combined.concat(res.slice(0, 10));
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
      const promises = artists.map(artist => window.electron.ytGetArtistAlbums(artist.id || artist.browseId));
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
    const isFollowed = followedArtists.some(a => (a.id || a.browseId) === (artist.id || artist.browseId));
    let newFollowed;
    
    if (isFollowed) {
      newFollowed = followedArtists.filter(a => (a.id || a.browseId) !== (artist.id || artist.browseId));
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

  setSearchQuery: (query) => set({ searchQuery: query }),
  
  setActiveView: (view, extra = {}) => {
    const newState = {
      activeView: view,
      selectedPlaylistId: extra.playlistId || null,
      selectedAlbumName: extra.albumName || null,
      selectedAlbumId: extra.albumId || null,
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
    const videoId = track.videoId || track.id;
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
        
        const currentActive = get().activeTrack;
        if (currentActive && (currentActive.videoId === videoId || currentActive.id === videoId)) {
          set({
            queue: [currentActive, ...mappedRecs],
            originalQueue: [currentActive, ...mappedRecs],
            queueIndex: 0
          });
          console.log(`[Queue] Populated queue with ${mappedRecs.length} recommendations for: ${currentActive.title}`);
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
    if (isStream && isMusicView && !resolvedPlaylistId) {
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
      savedPosition: 0
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
        window.electron.ytGetStreamUrl(nextTrack.id).then(result => {
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
        window.electron.ytGetStreamUrl(nextTrack.id).then(result => {
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
        window.electron.ytGetStreamUrl(prevTrack.id).then(result => {
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
