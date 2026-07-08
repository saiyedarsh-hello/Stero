const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  // File Scanning & Dialogs
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  scanFolder: (folderPath) => ipcRenderer.invoke('scan-folder', folderPath),
  getSavedFolder: () => ipcRenderer.invoke('get-saved-folder'),
  onScanProgress: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('scan-progress', subscription);
    return () => {
      ipcRenderer.removeListener('scan-progress', subscription);
    };
  },

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  updateSetting: (key, value) => ipcRenderer.invoke('update-setting', key, value),

  // Songs Operations
  getSongs: () => ipcRenderer.invoke('db-get-songs'),
  deleteSong: (songId) => ipcRenderer.invoke('db-delete-song', songId),
  toggleFavorite: (songId, favoriteStatus) => ipcRenderer.invoke('db-toggle-favorite', songId, favoriteStatus),
  incrementPlayCount: (songId) => ipcRenderer.invoke('db-increment-play-count', songId),
  addStreamSongToDb: (meta) => ipcRenderer.invoke('db-add-stream-song', meta),

  // Playlists Operations
  getPlaylists: () => ipcRenderer.invoke('db-get-playlists'),
  createPlaylist: (name) => ipcRenderer.invoke('db-create-playlist', name),
  deletePlaylist: (playlistId) => ipcRenderer.invoke('db-delete-playlist', playlistId),
  addSongToPlaylist: (playlistId, songId) => ipcRenderer.invoke('db-add-song-to-playlist', playlistId, songId),
  removeSongFromPlaylist: (playlistId, songId) => ipcRenderer.invoke('db-remove-song-from-playlist', playlistId, songId),
  getPlaylistSongs: (playlistId) => ipcRenderer.invoke('db-get-playlist-songs', playlistId),

  // Track metadata editing
  selectImageFile: () => ipcRenderer.invoke('select-image-file'),
  updateSong: (songId, meta) => ipcRenderer.invoke('db-update-song', songId, meta),

  // Custom Albums
  getCustomAlbums: () => ipcRenderer.invoke('db-get-custom-albums'),
  createCustomAlbum: (name, coverPath, songIds) => ipcRenderer.invoke('db-create-custom-album', name, coverPath, songIds),
  updateCustomAlbum: (albumId, name, coverPath, songIds) => ipcRenderer.invoke('db-update-custom-album', albumId, name, coverPath, songIds),
  deleteCustomAlbum: (albumId) => ipcRenderer.invoke('db-delete-custom-album', albumId),
  getAlbumSongs: (albumId) => ipcRenderer.invoke('db-get-album-songs', albumId),

  // Downloads
  ytSearch: (query) => ipcRenderer.invoke('yt-search', query),
  ytSearchTrending: (query, type) => ipcRenderer.invoke('yt-search-trending', query, type),
  ytSearchAlbums: (query) => ipcRenderer.invoke('yt-search-albums', query),
  ytGetArtistAlbums: (artistId) => ipcRenderer.invoke('yt-get-artist-albums', artistId),
  ytGetArtistSongs: (artistId) => ipcRenderer.invoke('yt-get-artist-songs', artistId),
  ytGetLyrics: (title, artist) => ipcRenderer.invoke('yt-get-lyrics', title, artist),
  ytGetAlbum: (browseId) => ipcRenderer.invoke('yt-get-album', browseId),
  ytGetStreamUrl: (videoId) => ipcRenderer.invoke('yt-get-stream-url', videoId),
  ytGetRecommendations: (videoId) => ipcRenderer.invoke('yt-get-recommendations', videoId),
  ytDownload: (songMeta) => ipcRenderer.invoke('yt-download', songMeta),
  ytGetQueue: () => ipcRenderer.invoke('yt-get-queue'),
  ytCancelDownload: (videoId) => ipcRenderer.invoke('yt-cancel-download', videoId),
  ytClearCompletedDownload: (videoId) => ipcRenderer.invoke('yt-clear-completed-download', videoId),
  ytClearAllCompletedDownloads: () => ipcRenderer.invoke('yt-clear-all-completed-downloads'),
  onDownloadProgress: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('download-queue-updated', subscription);
    return () => {
      ipcRenderer.removeListener('download-queue-updated', subscription);
    };
  },
  onDownloadCompleted: (callback) => {
    const subscription = () => callback();
    ipcRenderer.on('download-completed', subscription);
    return () => {
      ipcRenderer.removeListener('download-completed', subscription);
    };
  },
  
  // Window Management
  setFullscreen: (isFullscreen) => ipcRenderer.invoke('set-fullscreen', isFullscreen),
  isMaximized: () => ipcRenderer.invoke('is-maximized'),
  minimize: () => ipcRenderer.invoke('window-minimize'),
  maximize: () => ipcRenderer.invoke('window-maximize'),
  close: () => ipcRenderer.invoke('window-close'),
  onWindowStateChanged: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('window-state-changed', subscription);
    return () => ipcRenderer.removeListener('window-state-changed', subscription);
  },
});
