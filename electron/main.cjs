const { app, BrowserWindow, ipcMain, dialog, protocol, net, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const db = require('./db.cjs');
const Downloader = require('./downloader.cjs');

// Initialize downloader
const downloader = new Downloader(db);

// Set app name and AppUserModelId so Windows SMTC media widget shows "Stero" instead of "Unknown app"
app.name = 'Stero';
if (process.platform === 'win32') {
  app.setAppUserModelId('Stero');
}

// Register media protocol before app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: {
      standard: true,
      bypassCSP: true,
      stream: true,
      secure: true,
      corsEnabled: true,
      supportFetchAPI: true
    }
  }
]);

let mainWindow = null;
let musicMetadata = null;

// Dynamically import music-metadata (which is ESM-only)
async function getMusicMetadata() {
  if (!musicMetadata) {
    musicMetadata = await import('music-metadata');
  }
  return musicMetadata;
}

function createWindow() {
  Menu.setApplicationMenu(null);
  
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    title: 'Stero',
    icon: path.join(__dirname, '../public/icon.ico'),
    transparent: false,
    backgroundColor: '#0B0D14', // matching app background
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false // Disabled to allow Web Audio API and Canvas to process cross-origin YouTube streams without muting
    }
  });

  downloader.setWebContents(mainWindow.webContents);

  // If in development, load Vite Dev Server
  // Otherwise, load built React assets
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('maximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window-state-changed', { isMaximized: true });
    }
  });

  mainWindow.on('unmaximize', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('window-state-changed', { isMaximized: false });
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Register media protocol handler to stream music files and cover art safely
app.whenReady().then(async () => {
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.mp3': return 'audio/mpeg';
    case '.m4a': return 'audio/mp4';
    case '.ogg':
    case '.oga': return 'audio/ogg';
    case '.wav': return 'audio/wav';
    case '.webm': return 'audio/webm';
    case '.flac': return 'audio/flac';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.png': return 'image/png';
    case '.webp': return 'image/webp';
    default: return 'application/octet-stream';
  }
}

  protocol.handle('media', async (request) => {
    try {
      const urlObj = new URL(request.url);
      
      if (urlObj.host === 'remote') {
        const remoteUrl = urlObj.searchParams.get('url');
        if (!remoteUrl) {
          return new Response('URL parameter missing', { status: 400 });
        }
        
        // Hash the URL to get a unique filename
        const hash = crypto.createHash('md5').update(remoteUrl).digest('hex');
        const cacheDir = db.getArtworkDir();
        const cachePath = path.join(cacheDir, `cache-${hash}.jpg`);
        
        // If cached file exists, serve it immediately!
        if (fs.existsSync(cachePath)) {
          const fileUrl = pathToFileURL(cachePath).toString();
          const response = await net.fetch(fileUrl, { bypassCustomProtocolHandlers: true });
          const responseHeaders = new Headers(response.headers);
          responseHeaders.set('Access-Control-Allow-Origin', '*');
          responseHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders
          });
        }
        
        // Otherwise, fetch from remote server
        const response = await net.fetch(remoteUrl);
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          // Write to cache asynchronously to avoid blocking the response
          fs.promises.writeFile(cachePath, Buffer.from(buffer)).catch(err => {
            console.error('Failed to write image cache:', err);
          });
          
          const responseHeaders = new Headers();
          responseHeaders.set('Access-Control-Allow-Origin', '*');
          responseHeaders.set('Content-Type', response.headers.get('Content-Type') || 'image/jpeg');
          responseHeaders.set('Cache-Control', 'public, max-age=31536000, immutable');
          
          return new Response(buffer, {
            status: 200,
            headers: responseHeaders
          });
        } else {
          return new Response('Failed to fetch remote resource', { status: response.status });
        }
      }
      
      // Handle local files
      let filePath = urlObj.searchParams.get('path');
      if (!filePath) {
        // Fallback for old style URL
        try {
          const rawUrl = request.url.slice('media://'.length);
          const decoded = decodeURIComponent(rawUrl);
          if (decoded.startsWith('local/?path=')) {
            filePath = decoded.slice('local/?path='.length);
          } else {
            filePath = decoded;
          }
        } catch (err) {
          console.error('[Media Protocol] Fallback parse failed:', err.message);
        }
      }
      
      if (!filePath) {
        return new Response('Path parameter missing', { status: 400 });
      }

      // Map fonts/ to temp fonts directory
      if (filePath.startsWith('fonts/')) {
        const fontName = filePath.split('fonts/')[1];
        filePath = path.join(app.getPath('temp'), 'stero_fonts', fontName);
      }

      // On Windows, fix paths starting with a slash, e.g. /C:/path -> C:/path
      if (filePath.startsWith('/') && filePath[2] === ':') {
        filePath = filePath.slice(1);
      }
      
      // Use pathToFileURL to format it as a valid file:// URL
      const fileUrl = pathToFileURL(filePath).toString();
      
      // Fetch file using Electron's native net.fetch (fully asynchronous & optimized)
      const response = await net.fetch(fileUrl, {
        bypassCustomProtocolHandlers: true
      });
      
      // Clone response and append CORS/range headers
      const responseHeaders = new Headers(response.headers);
      responseHeaders.set('Access-Control-Allow-Origin', '*');
      responseHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      responseHeaders.set('Access-Control-Allow-Headers', '*');
      
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders
      });
    } catch (err) {
      console.error('[Media Protocol] Error:', err);
      return new Response('Error loading resource', { status: 500 });
    }
  });

  // Extract fonts from app.asar to temp directory for media protocol serving
  const tempFontsDir = path.join(app.getPath('temp'), 'stero_fonts');
  async function extractFonts() {
    try {
      if (!fs.existsSync(tempFontsDir)) {
        fs.mkdirSync(tempFontsDir, { recursive: true });
      }
      const publicFontsDir = app.isPackaged 
        ? path.join(process.resourcesPath, 'app.asar', 'public', 'fonts')
        : path.join(__dirname, '..', 'public', 'fonts');

      if (fs.existsSync(publicFontsDir)) {
        const fonts = fs.readdirSync(publicFontsDir);
        for (const font of fonts) {
          const src = path.join(publicFontsDir, font);
          const dest = path.join(tempFontsDir, font);
          if (!fs.existsSync(dest)) {
            fs.copyFileSync(src, dest);
          }
        }
      }
    } catch (err) {
      console.error('Error extracting fonts:', err);
    }
  }

  await extractFonts();

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC HANDLERS ---

// 1. Select Folder Dialog
ipcMain.handle('select-folder', async () => {
  if (!mainWindow) return null;
  
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  
  if (result.canceled) {
    return null;
  }
  return result.filePaths[0];
});

// Recursive audio files search
async function findAudioFiles(dirPath, filesList = []) {
  try {
    const files = await fs.promises.readdir(dirPath, { withFileTypes: true });
    for (const file of files) {
      const resPath = path.join(dirPath, file.name);
      if (file.isDirectory()) {
        await findAudioFiles(resPath, filesList);
      } else {
        const ext = path.extname(file.name).toLowerCase();
        if (['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac'].includes(ext)) {
          filesList.push(resPath);
        }
      }
    }
  } catch (err) {
    console.error('Error scanning folder:', dirPath, err.message);
  }
  return filesList;
}

// 2. Scan folder for music files & extract metadata
ipcMain.handle('scan-folder', async (event, folderPath) => {
  console.log('Scanning folder:', folderPath);
  
  // Save the folder path so we can resync later without re-picking
  db.setSavedFolderPath(folderPath);
  
  const filePaths = await findAudioFiles(folderPath);
  console.log(`Found ${filePaths.length} audio files. Starting metadata extraction...`);
  
  const total = filePaths.length;
  let processed = 0;
  const batchSize = 10;
  let currentBatch = [];
  
  const mm = await getMusicMetadata();
  const artworkFolder = db.getArtworkDir();

  // Inform renderer about scanning start
  event.sender.send('scan-progress', { current: 0, total, status: 'started' });

  for (const filePath of filePaths) {
    try {
      let stats;
      try {
        stats = await fs.promises.stat(filePath);
      } catch (e) {
        stats = { mtimeMs: Date.now() };
      }
      
      const metadata = await mm.parseFile(filePath).catch(() => null);
      
      let title = path.basename(filePath, path.extname(filePath));
      let artist = 'Unknown Artist';
      let album = 'Unknown Album';
      let duration = 0;
      let genre = 'Unknown Genre';
      let year = null;
      let trackNumber = null;
      let hasArtwork = 0;
      let artworkPath = '';

      if (metadata) {
        title = metadata.common.title || title;
        artist = metadata.common.artist || artist;
        album = metadata.common.album || album;
        duration = metadata.format.duration || 0;
        
        if (metadata.common.genre && metadata.common.genre.length > 0) {
          genre = metadata.common.genre.join(', ');
        }
        year = metadata.common.year || null;
        trackNumber = metadata.common.track?.no || null;
        
        // Handle artwork extraction
        if (metadata.common.picture && metadata.common.picture.length > 0) {
          const pic = metadata.common.picture[0];
          try {
            const hash = crypto.createHash('md5').update(pic.data).digest('hex');
            const artworkFileName = `art-${hash}.jpg`;
            const fullArtPath = path.join(artworkFolder, artworkFileName);
            
            if (!fs.existsSync(fullArtPath)) {
              await fs.promises.writeFile(fullArtPath, pic.data);
            }
            hasArtwork = 1;
            artworkPath = fullArtPath;
          } catch (artErr) {
            console.error('Error saving artwork for:', filePath, artErr.message);
          }
        }
      }

      // Clean title: remove leading track numbers or file prefixes (e.g., "01. Title" -> "Title")
      title = title.trim().replace(/^\d+[\s.\-_]*/, '');

      currentBatch.push({
        filepath: filePath,
        title,
        artist,
        album,
        duration,
        genre,
        year,
        track_number: trackNumber,
        has_artwork: hasArtwork,
        artwork_path: artworkPath,
        added_at: Math.floor(stats.mtimeMs)
      });
      
    } catch (err) {
      console.error('Failed to parse file:', filePath, err.message);
    }
    
    processed++;
    
    // Periodically save batch and notify renderer
    if (currentBatch.length >= batchSize || processed === total) {
      db.insertSongs(currentBatch);
      currentBatch = [];
      event.sender.send('scan-progress', { current: processed, total, status: 'scanning' });
    }
  }
  
  // Remove missing songs that are no longer present in the scanned directory
  db.removeMissingSongs(filePaths, folderPath);
  
  event.sender.send('scan-progress', { current: total, total, status: 'completed' });
  return db.getAllSongs();
});

// 2b. Get previously saved folder path (or derive from existing songs)
ipcMain.handle('get-saved-folder', () => {
  const saved = db.getSavedFolderPath();
  if (saved) return saved;

  // No saved folder — derive from existing songs in the DB
  const songs = db.getAllSongs();
  if (songs && songs.length > 0) {
    // Find the common parent directory of all songs
    const firstDir = path.dirname(songs[0].filepath);
    // Walk up to find the shallowest common ancestor
    let commonDir = firstDir;
    for (const song of songs) {
      const songDir = path.dirname(song.filepath);
      while (
        songDir.toLowerCase() !== commonDir.toLowerCase() &&
        !songDir.toLowerCase().startsWith(commonDir.toLowerCase() + path.sep)
      ) {
        commonDir = path.dirname(commonDir);
      }
    }
    // Save it for future use
    db.setSavedFolderPath(commonDir);
    return commonDir;
  }

  return null;
});

// Window State
ipcMain.handle('is-maximized', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow.isMaximized();
  }
  return false;
});

ipcMain.handle('window-minimize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
});

ipcMain.handle('window-maximize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize();
    } else {
      mainWindow.maximize();
    }
  }
});

ipcMain.handle('window-close', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
});

// 3. Database operations
ipcMain.handle('get-settings', () => {
  return db.getSettings();
});

ipcMain.handle('update-setting', (event, key, value) => {
  return db.updateSetting(key, value);
});

// Downloader IPCs
ipcMain.handle('yt-search', async (event, query) => {
  return await downloader.search(query);
});

ipcMain.handle('yt-search-trending', async (event, query, type) => {
  return await downloader.searchTrending(query, type);
});

ipcMain.handle('yt-search-albums', async (event, query) => {
  return await downloader.searchAlbums(query);
});

ipcMain.handle('yt-get-artist-albums', async (event, artistId) => {
  return await downloader.getArtistAlbums(artistId);
});

ipcMain.handle('yt-get-album', async (event, browseId) => {
  return await downloader.getAlbum(browseId);
});


ipcMain.handle('yt-get-stream-url', async (event, videoId) => {
  return await downloader.getStreamUrl(videoId);
});

ipcMain.handle('yt-get-recommendations', async (event, videoId) => {
  return await downloader.getRecommendations(videoId);
});

ipcMain.handle('yt-download', async (event, songMeta) => {
  return await downloader.addDownload(songMeta);
});

ipcMain.handle('yt-get-queue', () => {
  return downloader.getQueueState();
});

ipcMain.handle('yt-cancel-download', (event, videoId) => {
  downloader.cancelDownload(videoId);
  return true;
});

ipcMain.handle('yt-clear-completed-download', (event, videoId) => {
  downloader.completed = downloader.completed.filter(c => c.videoId !== videoId);
  downloader.broadcastState();
  return true;
});

ipcMain.handle('yt-clear-all-completed-downloads', () => {
  downloader.completed = [];
  downloader.broadcastState();
  return true;
});

ipcMain.handle('db-get-songs', () => {
  return db.getAllSongs();
});

ipcMain.handle('db-delete-song', (event, songId) => {
  db.deleteSong(songId);
  return db.getAllSongs();
});

ipcMain.handle('db-toggle-favorite', (event, songId, favoriteStatus) => {
  return db.toggleFavorite(songId, favoriteStatus);
});

ipcMain.handle('db-increment-play-count', (event, songId) => {
  db.incrementPlayCount(songId);
});

ipcMain.handle('db-get-playlists', () => {
  return db.getPlaylists();
});

ipcMain.handle('db-create-playlist', (event, name) => {
  return db.createPlaylist(name);
});

ipcMain.handle('db-delete-playlist', (event, playlistId) => {
  db.deletePlaylist(playlistId);
  return db.getPlaylists();
});

ipcMain.handle('db-add-song-to-playlist', (event, playlistId, songId) => {
  return db.addSongToPlaylist(playlistId, songId);
});

ipcMain.handle('db-add-stream-song', (event, meta) => {
  return db.addStreamSong(meta);
});

ipcMain.handle('db-remove-song-from-playlist', (event, playlistId, songId) => {
  return db.removeSongFromPlaylist(playlistId, songId);
});

ipcMain.handle('db-get-playlist-songs', (event, playlistId) => {
  return db.getPlaylistSongs(playlistId);
});

// Select image file dialog
ipcMain.handle('select-image-file', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
  });
  if (result.canceled || result.filePaths.length === 0) return null;

  // Copy the chosen image into the artwork folder with a unique name
  const srcPath = result.filePaths[0];
  const artworkFolder = db.getArtworkDir();
  const ext = path.extname(srcPath).toLowerCase();
  const hash = crypto.createHash('md5').update(srcPath + Date.now()).digest('hex');
  const destName = `custom-art-${hash}${ext}`;
  const destPath = path.join(artworkFolder, destName);
  fs.copyFileSync(srcPath, destPath);
  return destPath;
});

// Update song metadata
ipcMain.handle('db-update-song', (event, songId, meta) => {
  return db.updateSongMeta(songId, meta);
});

// Custom Albums
ipcMain.handle('db-get-custom-albums', () => {
  return db.getCustomAlbums();
});

ipcMain.handle('db-create-custom-album', (event, name, coverPath, songIds) => {
  return db.createCustomAlbum(name, coverPath, songIds);
});

ipcMain.handle('db-update-custom-album', (event, albumId, name, coverPath, songIds) => {
  return db.updateCustomAlbum(albumId, name, coverPath, songIds);
});

ipcMain.handle('db-delete-custom-album', (event, albumId) => {
  db.deleteCustomAlbum(albumId);
  return db.getCustomAlbums();
});

ipcMain.handle('db-get-album-songs', (event, albumId) => {
  return db.getAlbumSongs(albumId);
});

ipcMain.handle('set-fullscreen', (event, isFullscreen) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    if (isFullscreen) {
      win.setFullScreen(true);
    } else {
      win.setFullScreen(false);
      win.center();
    }
  }
});

