const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const userDataPath = app.getPath('userData');
const dbPath = path.join(userDataPath, 'library.db');
const jsonDbPath = path.join(userDataPath, 'library.json');
const artworkDir = path.join(userDataPath, 'artwork');

// Ensure artwork directory exists
if (!fs.existsSync(artworkDir)) {
  fs.mkdirSync(artworkDir, { recursive: true });
}

let db = null;
let useJsonFallback = false;
let jsonData = { songs: [], playlists: [], customAlbums: [], settings: {} };

// Initialize Database
try {
  const Database = require('better-sqlite3');
  db = new Database(dbPath);
  
  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS songs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filepath TEXT UNIQUE NOT NULL,
      title TEXT,
      artist TEXT,
      album TEXT,
      duration REAL,
      genre TEXT,
      year INTEGER,
      track_number INTEGER,
      has_artwork INTEGER DEFAULT 0,
      artwork_path TEXT,
      added_at INTEGER,
      play_count INTEGER DEFAULT 0,
      favorite INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS playlist_songs (
      playlist_id INTEGER,
      song_id INTEGER,
      display_order INTEGER,
      PRIMARY KEY (playlist_id, song_id),
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
      FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_songs_filepath ON songs(filepath);
    CREATE INDEX IF NOT EXISTS idx_songs_favorite ON songs(favorite);
    CREATE INDEX IF NOT EXISTS idx_songs_album ON songs(album);
    CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist);

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS custom_albums (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      cover_path TEXT DEFAULT '',
      created_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS album_songs (
      album_id INTEGER,
      song_id INTEGER,
      display_order INTEGER DEFAULT 0,
      PRIMARY KEY (album_id, song_id),
      FOREIGN KEY (album_id) REFERENCES custom_albums(id) ON DELETE CASCADE,
      FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
    );
  `);
  
  // Cleanup corrupted stream records caused by previous bug
  try {
    db.prepare("DELETE FROM songs WHERE filepath = 'yt-stream://undefined'").run();
    db.prepare("DELETE FROM songs WHERE filepath LIKE 'yt-stream://%' AND has_artwork = 0").run();
  } catch (e) {
    console.warn('Failed to cleanup corrupted records', e);
  }

  console.log('Database initialized successfully with better-sqlite3 at:', dbPath);
} catch (err) {
  console.warn('better-sqlite3 failed to load, falling back to JSON database:', err.message);
  useJsonFallback = true;
  
  // Load JSON database
  if (fs.existsSync(jsonDbPath)) {
    try {
      jsonData = JSON.parse(fs.readFileSync(jsonDbPath, 'utf8'));
      if (!jsonData.songs) jsonData.songs = [];
      if (!jsonData.playlists) jsonData.playlists = [];
      if (!jsonData.customAlbums) jsonData.customAlbums = [];
      if (!jsonData.settings) jsonData.settings = {};
      
      // Cleanup corrupted stream records
      const originalLength = jsonData.songs.length;
      jsonData.songs = jsonData.songs.filter(s => {
        if (s.filepath === 'yt-stream://undefined') return false;
        if (s.filepath && s.filepath.startsWith('yt-stream://') && !s.has_artwork) return false;
        return true;
      });
      if (jsonData.songs.length !== originalLength) saveJsonDb();
    } catch (readErr) {
      console.error('Error reading JSON database, initializing empty', readErr);
    }
  } else {
    saveJsonDb();
  }
}

let saveTimeout = null;
function saveJsonDb() {
  if (!useJsonFallback) return;
  if (saveTimeout) clearTimeout(saveTimeout);
  
  saveTimeout = setTimeout(() => {
    fs.writeFile(jsonDbPath, JSON.stringify(jsonData, null, 2), 'utf8', (err) => {
      if (err) console.error('Failed to save JSON database:', err);
    });
  }, 150); // 150ms debounce
}

// Helper: Get artwork directory path
function getArtworkDir() {
  return artworkDir;
}

// Clean titles post-processing helpers
function cleanTitle(title) {
  if (!title) return '';
  return title.trim().replace(/^\d+[\s.\-_]*/, '');
}

function cleanSong(song) {
  if (!song) return song;
  return {
    ...song,
    title: cleanTitle(song.title)
  };
}

function cleanSongs(songsList) {
  if (!songsList) return [];
  if (Array.isArray(songsList)) {
    return songsList.map(cleanSong);
  }
  return cleanSong(songsList);
}

// --- SONG OPERATIONS ---

function getAllSongs() {
  if (!useJsonFallback) {
    return cleanSongs(db.prepare('SELECT * FROM songs ORDER BY title ASC').all());
  } else {
    return cleanSongs([...jsonData.songs].sort((a, b) => (a.title || '').localeCompare(b.title || '')));
  }
}

function insertSongs(songsList) {
  if (!useJsonFallback) {
    const insert = db.prepare(`
      INSERT INTO songs 
      (filepath, title, artist, album, duration, genre, year, track_number, has_artwork, artwork_path, added_at, play_count, favorite)
      VALUES 
      (@filepath, @title, @artist, @album, @duration, @genre, @year, @track_number, @has_artwork, @artwork_path, @added_at, 0, 0)
      ON CONFLICT(filepath) DO UPDATE SET
        duration = excluded.duration,
        genre = excluded.genre,
        year = excluded.year,
        track_number = excluded.track_number,
        added_at = excluded.added_at
    `);
    
    const transaction = db.transaction((songs) => {
      for (const song of songs) insert.run(song);
    });
    
    transaction(songsList);
    return getAllSongs();
  } else {
    for (const newSong of songsList) {
      const idx = jsonData.songs.findIndex(s => s.filepath === newSong.filepath);
      if (idx !== -1) {
        // Preserve user metadata manual changes, play_count, and favorite
        const existing = jsonData.songs[idx];
        jsonData.songs[idx] = {
          ...newSong,
          id: existing.id,
          title: existing.title ?? newSong.title,
          artist: existing.artist ?? newSong.artist,
          album: existing.album ?? newSong.album,
          has_artwork: existing.has_artwork ?? newSong.has_artwork,
          artwork_path: existing.artwork_path ?? newSong.artwork_path,
          play_count: existing.play_count || 0,
          favorite: existing.favorite || 0
        };
      } else {
        const newId = jsonData.songs.length > 0 ? Math.max(...jsonData.songs.map(s => s.id)) + 1 : 1;
        jsonData.songs.push({
          ...newSong,
          id: newId,
          play_count: 0,
          favorite: 0
        });
      }
    }
    saveJsonDb();
    return getAllSongs();
  }
}

function addStreamSong(meta) {
  const filepath = `yt-stream://${meta.videoId || meta.id}`;
  const coverUrl = meta.coverUrl || meta.thumbnail || meta.artwork_path || '';
  
  if (!useJsonFallback) {
    const existing = db.prepare('SELECT * FROM songs WHERE filepath = ?').get(filepath);
    if (existing) return cleanSongs(existing);
    
    const info = db.prepare(`
      INSERT INTO songs (filepath, title, artist, album, duration, has_artwork, artwork_path, added_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      filepath, 
      meta.title, 
      meta.artist, 
      meta.album || 'YouTube Music', 
      meta.duration || 0,
      coverUrl ? 1 : 0, 
      coverUrl, 
      Date.now()
    );
    return cleanSongs(db.prepare('SELECT * FROM songs WHERE id = ?').get(info.lastInsertRowid));
  } else {
    let existing = jsonData.songs.find(s => s.filepath === filepath);
    if (existing) return cleanSongs(existing);
    
    const newId = jsonData.songs.length > 0 ? Math.max(...jsonData.songs.map(s => s.id)) + 1 : 1;
    const newSong = {
      id: newId,
      filepath,
      title: meta.title,
      artist: meta.artist,
      album: meta.album || 'YouTube Music',
      duration: meta.duration || 0,
      has_artwork: coverUrl ? 1 : 0,
      artwork_path: coverUrl,
      added_at: Date.now(),
      play_count: 0,
      favorite: 0
    };
    jsonData.songs.push(newSong);
    saveJsonDb();
    return cleanSongs(newSong);
  }
}

function toggleFavorite(songId, favoriteStatus) {
  const isFav = favoriteStatus ? 1 : 0;
  if (!useJsonFallback) {
    db.prepare('UPDATE songs SET favorite = ? WHERE id = ?').run(isFav, songId);
    return cleanSongs(db.prepare('SELECT * FROM songs WHERE id = ?').get(songId));
  } else {
    const song = jsonData.songs.find(s => s.id === songId);
    if (song) {
      song.favorite = isFav;
      saveJsonDb();
    }
    return cleanSongs(song);
  }
}

function incrementPlayCount(songId) {
  if (!useJsonFallback) {
    db.prepare('UPDATE songs SET play_count = play_count + 1 WHERE id = ?').run(songId);
  } else {
    const song = jsonData.songs.find(s => s.id === songId);
    if (song) {
      song.play_count = (song.play_count || 0) + 1;
      saveJsonDb();
    }
  }
}

function updateSongMeta(songId, { title, album, artwork_path, has_artwork }) {
  if (!useJsonFallback) {
    db.prepare(
      'UPDATE songs SET title = ?, album = ?, artwork_path = ?, has_artwork = ? WHERE id = ?'
    ).run(title, album, artwork_path, has_artwork ? 1 : 0, songId);

    // Synchronize custom albums mapping (album_songs)
    if (album && album.trim()) {
      const cleanAlbumName = album.trim();
      // Find if custom album exists
      let albumRow = db.prepare('SELECT id FROM custom_albums WHERE name = ?').get(cleanAlbumName);
      if (!albumRow) {
        // Create custom album
        const timestamp = Date.now();
        const info = db.prepare('INSERT INTO custom_albums (name, created_at) VALUES (?, ?)').run(cleanAlbumName, timestamp);
        albumRow = { id: info.lastInsertRowid };
      }
      
      // Delete old mapping for this song
      db.prepare('DELETE FROM album_songs WHERE song_id = ?').run(songId);
      
      // Insert new mapping
      db.prepare('INSERT OR IGNORE INTO album_songs (album_id, song_id) VALUES (?, ?)').run(albumRow.id, songId);
    } else {
      // Remove mapping if album name is empty
      db.prepare('DELETE FROM album_songs WHERE song_id = ?').run(songId);
    }

    return cleanSongs(db.prepare('SELECT * FROM songs WHERE id = ?').get(songId));
  } else {
    // JSON Fallback
    const song = jsonData.songs.find(s => s.id === songId);
    if (song) {
      song.title = title;
      song.album = album;
      song.artwork_path = artwork_path;
      song.has_artwork = has_artwork ? 1 : 0;

      // Synchronize custom albums mapping
      if (album && album.trim()) {
        const cleanAlbumName = album.trim();
        let albumObj = (jsonData.customAlbums || []).find(a => a.name.toLowerCase() === cleanAlbumName.toLowerCase());
        if (!albumObj) {
          const newId = (jsonData.customAlbums || []).length > 0
            ? Math.max(...jsonData.customAlbums.map(a => a.id)) + 1 : 1;
          albumObj = { id: newId, name: cleanAlbumName, cover_path: '', created_at: Date.now(), songIds: [] };
          if (!jsonData.customAlbums) jsonData.customAlbums = [];
          jsonData.customAlbums.push(albumObj);
        }
        
        // Remove songId from other albums
        (jsonData.customAlbums || []).forEach(a => {
          if (a.songIds) a.songIds = a.songIds.filter(id => id !== songId);
        });

        // Add to cleanAlbumName album
        if (!albumObj.songIds) albumObj.songIds = [];
        if (!albumObj.songIds.includes(songId)) albumObj.songIds.push(songId);
      } else {
        (jsonData.customAlbums || []).forEach(a => {
          if (a.songIds) a.songIds = a.songIds.filter(id => id !== songId);
        });
      }

      saveJsonDb();
    }
    return cleanSongs(song);
  }
}

function deleteSong(songId) {
  if (!useJsonFallback) {
    const song = db.prepare('SELECT filepath FROM songs WHERE id = ?').get(songId);
    if (!song) return false;
    
    // Delete file
    try {
      if (fs.existsSync(song.filepath)) {
        fs.unlinkSync(song.filepath);
      }
    } catch (err) {
      console.error(`Could not delete file ${song.filepath}:`, err);
    }
    
    // Delete from db
    db.prepare('DELETE FROM songs WHERE id = ?').run(songId);
    // Cleanup playlists_songs references
    try {
      db.prepare('DELETE FROM playlist_songs WHERE song_id = ?').run(songId);
    } catch(e) {}
    
    return true;
  } else {
    const songIdx = jsonData.songs.findIndex(s => s.id === songId);
    if (songIdx === -1) return false;
    const song = jsonData.songs[songIdx];

    // Delete file
    try {
      if (fs.existsSync(song.filepath)) {
        fs.unlinkSync(song.filepath);
      }
    } catch (err) {
      console.error(`Could not delete file ${song.filepath}:`, err);
    }

    // Delete from array
    jsonData.songs.splice(songIdx, 1);

    // Clean up playlists and albums references
    (jsonData.playlists || []).forEach(p => {
      if (p.songIds) p.songIds = p.songIds.filter(id => id !== songId);
    });
    (jsonData.customAlbums || []).forEach(a => {
      if (a.songIds) a.songIds = a.songIds.filter(id => id !== songId);
    });

    saveJsonDb();
    return true;
  }
}

// --- PLAYLIST OPERATIONS ---

function getPlaylists() {
  if (!useJsonFallback) {
    return db.prepare('SELECT * FROM playlists ORDER BY name ASC').all();
  } else {
    return [...jsonData.playlists].sort((a, b) => a.name.localeCompare(b.name));
  }
}

function createPlaylist(name) {
  const timestamp = Date.now();
  if (!useJsonFallback) {
    try {
      const info = db.prepare('INSERT INTO playlists (name, created_at) VALUES (?, ?)').run(name, timestamp);
      return { id: info.lastInsertRowid, name, created_at: timestamp };
    } catch (err) {
      console.error('Failed to create playlist:', err);
      return null;
    }
  } else {
    if (jsonData.playlists.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      return null;
    }
    const newId = jsonData.playlists.length > 0 ? Math.max(...jsonData.playlists.map(p => p.id)) + 1 : 1;
    const newPlaylist = { id: newId, name, created_at: timestamp, songIds: [] };
    jsonData.playlists.push(newPlaylist);
    saveJsonDb();
    return newPlaylist;
  }
}

function deletePlaylist(playlistId) {
  if (!useJsonFallback) {
    db.prepare('DELETE FROM playlists WHERE id = ?').run(playlistId);
    db.prepare('DELETE FROM playlist_songs WHERE playlist_id = ?').run(playlistId);
  } else {
    jsonData.playlists = jsonData.playlists.filter(p => p.id !== playlistId);
    saveJsonDb();
  }
}

function addSongToPlaylist(playlistId, songId) {
  if (!useJsonFallback) {
    try {
      // Get current max display_order
      const maxOrderRow = db.prepare('SELECT MAX(display_order) as max_order FROM playlist_songs WHERE playlist_id = ?').get(playlistId);
      const nextOrder = (maxOrderRow?.max_order || 0) + 1;
      
      db.prepare('INSERT OR IGNORE INTO playlist_songs (playlist_id, song_id, display_order) VALUES (?, ?, ?)')
        .run(playlistId, songId, nextOrder);
    } catch (err) {
      console.error('Failed to add song to playlist:', err);
    }
  } else {
    const playlist = jsonData.playlists.find(p => p.id === playlistId);
    if (playlist) {
      if (!playlist.songIds) playlist.songIds = [];
      if (!playlist.songIds.includes(songId)) {
        playlist.songIds.push(songId);
        saveJsonDb();
      }
    }
  }
  return getPlaylistSongs(playlistId);
}

function removeSongFromPlaylist(playlistId, songId) {
  if (!useJsonFallback) {
    db.prepare('DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?').run(playlistId, songId);
  } else {
    const playlist = jsonData.playlists.find(p => p.id === playlistId);
    if (playlist) {
      if (playlist.songIds) {
        playlist.songIds = playlist.songIds.filter(id => id !== songId);
        saveJsonDb();
      }
    }
  }
  return getPlaylistSongs(playlistId);
}

function getPlaylistSongs(playlistId) {
  if (!useJsonFallback) {
    return cleanSongs(db.prepare(`
      SELECT s.* FROM songs s
      JOIN playlist_songs ps ON s.id = ps.song_id
      WHERE ps.playlist_id = ?
      ORDER BY ps.display_order ASC
    `).all(playlistId));
  } else {
    const playlist = jsonData.playlists.find(p => p.id === playlistId);
    if (!playlist || !playlist.songIds) return [];
    
    // Maintain the order in songIds array
    return cleanSongs(playlist.songIds
      .map(id => jsonData.songs.find(s => s.id === id))
      .filter(Boolean));
  }
}

// --- CUSTOM ALBUM OPERATIONS ---

function getCustomAlbums() {
  if (!useJsonFallback) {
    const albums = db.prepare('SELECT * FROM custom_albums ORDER BY created_at DESC').all();
    return albums.map(a => ({
      ...a,
      songs: cleanSongs(db.prepare(`
        SELECT s.* FROM songs s
        JOIN album_songs als ON s.id = als.song_id
        WHERE als.album_id = ?
        ORDER BY als.display_order ASC
      `).all(a.id))
    }));
  } else {
    return (jsonData.customAlbums || []).map(a => ({
      ...a,
      songs: cleanSongs((a.songIds || []).map(id => jsonData.songs.find(s => s.id === id)).filter(Boolean))
    }));
  }
}

function createCustomAlbum(name, coverPath, songIds) {
  const timestamp = Date.now();
  if (!useJsonFallback) {
    const info = db.prepare('INSERT INTO custom_albums (name, cover_path, created_at) VALUES (?, ?, ?)').run(name, coverPath || '', timestamp);
    const albumId = info.lastInsertRowid;
    // Insert songs and update their album field
    const insertSong = db.prepare('INSERT OR IGNORE INTO album_songs (album_id, song_id, display_order) VALUES (?, ?, ?)');
    const updateAlbum = db.prepare('UPDATE songs SET album = ? WHERE id = ?');
    const tx = db.transaction(() => {
      songIds.forEach((songId, i) => {
        insertSong.run(albumId, songId, i);
        updateAlbum.run(name, songId);
      });
    });
    tx();
    return db.prepare('SELECT * FROM custom_albums WHERE id = ?').get(albumId);
  } else {
    const newId = (jsonData.customAlbums || []).length > 0
      ? Math.max(...jsonData.customAlbums.map(a => a.id)) + 1 : 1;
    if (!jsonData.customAlbums) jsonData.customAlbums = [];
    const album = { id: newId, name, cover_path: coverPath || '', created_at: timestamp, songIds: [...songIds] };
    jsonData.customAlbums.push(album);
    // Update song album fields
    songIds.forEach(id => {
      const song = jsonData.songs.find(s => s.id === id);
      if (song) song.album = name;
    });
    saveJsonDb();
    return album;
  }
}

function updateCustomAlbum(albumId, name, coverPath, songIds) {
  if (!useJsonFallback) {
    const oldAlbumRow = db.prepare('SELECT name FROM custom_albums WHERE id = ?').get(albumId);
    const oldName = oldAlbumRow ? oldAlbumRow.name : null;
    
    if (oldName) {
      // Set all songs with this old album name to 'Unknown'
      db.prepare('UPDATE songs SET album = ? WHERE album = ?').run('Unknown', oldName);
    }
    
    db.prepare('UPDATE custom_albums SET name = ?, cover_path = ? WHERE id = ?').run(name, coverPath || '', albumId);
    db.prepare('DELETE FROM album_songs WHERE album_id = ?').run(albumId);

    const insertSong = db.prepare('INSERT OR IGNORE INTO album_songs (album_id, song_id, display_order) VALUES (?, ?, ?)');
    const updateAlbum = db.prepare('UPDATE songs SET album = ? WHERE id = ?');
    
    const tx = db.transaction(() => {
      songIds.forEach((songId, i) => {
        insertSong.run(albumId, songId, i);
        updateAlbum.run(name, songId);
      });
    });
    tx();
    return db.prepare('SELECT * FROM custom_albums WHERE id = ?').get(albumId);
  } else {
    const album = (jsonData.customAlbums || []).find(a => a.id === albumId);
    if (album) {
      const oldName = album.name;
      album.name = name;
      album.cover_path = coverPath || '';
      album.songIds = [...songIds];
      
      jsonData.songs.forEach(s => {
        if (s.album === oldName && !songIds.includes(s.id)) s.album = 'Unknown';
      });
      songIds.forEach(id => {
        const song = jsonData.songs.find(s => s.id === id);
        if (song) song.album = name;
      });
      
      saveJsonDb();
      return album;
    }
    return null;
  }
}

function deleteCustomAlbum(albumId) {
  if (!useJsonFallback) {
    const album = db.prepare('SELECT name FROM custom_albums WHERE id = ?').get(albumId);
    if (album) {
      db.prepare('UPDATE songs SET album = ? WHERE album = ?').run('Unknown', album.name);
    }
    db.prepare('DELETE FROM custom_albums WHERE id = ?').run(albumId);
  } else {
    const album = (jsonData.customAlbums || []).find(a => a.id === albumId);
    if (album) {
      jsonData.songs.forEach(s => {
        if (s.album === album.name) {
          s.album = 'Unknown';
        }
      });
    }
    jsonData.customAlbums = (jsonData.customAlbums || []).filter(a => a.id !== albumId);
    saveJsonDb();
  }
}

function getAlbumSongs(albumId) {
  if (!useJsonFallback) {
    return cleanSongs(db.prepare(`
      SELECT s.* FROM songs s
      JOIN album_songs als ON s.id = als.song_id
      WHERE als.album_id = ?
      ORDER BY als.display_order ASC
    `).all(albumId));
  } else {
    const album = (jsonData.customAlbums || []).find(a => a.id === albumId);
    if (!album) return [];
    return cleanSongs((album.songIds || []).map(id => jsonData.songs.find(s => s.id === id)).filter(Boolean));
  }
}

// --- SETTINGS OPERATIONS ---

function getSavedFolderPath() {
  if (!useJsonFallback) {
    const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get('music_folder');
    return row ? row.value : null;
  } else {
    return jsonData.settings.music_folder || null;
  }
}

function getSettings() {
  if (!useJsonFallback) {
    const rows = db.prepare('SELECT * FROM app_settings').all();
    const settings = {};
    rows.forEach(r => settings[r.key] = r.value);
    return settings;
  } else {
    return jsonData.settings || {};
  }
}

function updateSetting(key, value) {
  if (!useJsonFallback) {
    db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?').run(key, value, value);
    return getSettings();
  } else {
    if (!jsonData.settings) jsonData.settings = {};
    jsonData.settings[key] = value;
    saveJsonDb();
    return jsonData.settings;
  }
}



function setSavedFolderPath(folderPath) {
  if (!useJsonFallback) {
    db.prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)').run('music_folder', folderPath);
  } else {
    jsonData.settings.music_folder = folderPath;
    saveJsonDb();
  }
}

function removeMissingSongs(presentFilePaths, folderPath) {
  const presentSet = new Set(presentFilePaths.map(p => path.resolve(p).toLowerCase()));
  const normFolder = path.resolve(folderPath).toLowerCase();

  if (!useJsonFallback) {
    // Get all songs from the SQLite database
    const allSongs = db.prepare('SELECT id, filepath, has_artwork, artwork_path FROM songs').all();
    const songsToDelete = allSongs.filter(song => {
      const songPath = path.resolve(song.filepath).toLowerCase();
      const isUnderFolder = songPath === normFolder || songPath.startsWith(normFolder + path.sep);
      return isUnderFolder && !presentSet.has(songPath);
    });

    if (songsToDelete.length > 0) {
      db.pragma('foreign_keys = ON');
      const deleteStmt = db.prepare('DELETE FROM songs WHERE id = ?');
      const transaction = db.transaction((songs) => {
        for (const song of songs) {
          deleteStmt.run(song.id);
          // Delete physical artwork file if it is no longer used by any other song
          if (song.has_artwork && song.artwork_path) {
            try {
              const countRow = db.prepare('SELECT COUNT(*) as count FROM songs WHERE artwork_path = ? AND id != ?').get(song.artwork_path, song.id);
              if (!countRow || countRow.count === 0) {
                if (fs.existsSync(song.artwork_path)) {
                  fs.unlinkSync(song.artwork_path);
                }
              }
            } catch (err) {
              console.error('Failed to clean up artwork file during removal:', err.message);
            }
          }
        }
      });
      transaction(songsToDelete);
      console.log(`Removed ${songsToDelete.length} missing songs from database.`);
    }
  } else {
    // JSON Fallback
    const songsToDelete = jsonData.songs.filter(song => {
      const songPath = path.resolve(song.filepath).toLowerCase();
      const isUnderFolder = songPath === normFolder || songPath.startsWith(normFolder + path.sep);
      return isUnderFolder && !presentSet.has(songPath);
    });

    if (songsToDelete.length > 0) {
      const deleteIds = new Set(songsToDelete.map(s => s.id));
      
      // Filter songs
      jsonData.songs = jsonData.songs.filter(s => !deleteIds.has(s.id));

      // Clean up playlists
      if (jsonData.playlists) {
        jsonData.playlists.forEach(playlist => {
          if (playlist.songIds) {
            playlist.songIds = playlist.songIds.filter(id => !deleteIds.has(id));
          }
        });
      }

      // Clean up custom albums
      if (jsonData.customAlbums) {
        jsonData.customAlbums.forEach(album => {
          if (album.songIds) {
            album.songIds = album.songIds.filter(id => !deleteIds.has(id));
          }
        });
      }

      // Delete physical artwork file if it is no longer used by any other song in JSON
      songsToDelete.forEach(song => {
        if (song.has_artwork && song.artwork_path) {
          const count = jsonData.songs.filter(s => s.artwork_path === song.artwork_path).length;
          if (count === 0) {
            try {
              if (fs.existsSync(song.artwork_path)) {
                fs.unlinkSync(song.artwork_path);
              }
            } catch (err) {
              console.error('Failed to clean up artwork file during removal (JSON):', err.message);
            }
          }
        }
      });

      saveJsonDb();
      console.log(`Removed ${songsToDelete.length} missing songs from JSON database.`);
    }
  }
}

module.exports = {
  getArtworkDir,
  getAllSongs,
  insertSongs,
  toggleFavorite,
  incrementPlayCount,
  updateSongMeta,
  getPlaylists,
  createPlaylist,
  deletePlaylist,
  addSongToPlaylist,
  removeSongFromPlaylist,
  getPlaylistSongs,
  getCustomAlbums,
  createCustomAlbum,
  updateCustomAlbum,
  deleteCustomAlbum,
  getAlbumSongs,
  deleteSong,
  getSavedFolderPath,
  setSavedFolderPath,
  removeMissingSongs,
  getSettings,
  updateSetting,
  addStreamSong
};
