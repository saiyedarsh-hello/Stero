import { useState, useEffect, useRef, useMemo, useDeferredValue, forwardRef } from 'react';
import { TableVirtuoso } from 'react-virtuoso';
import HoldToDeleteButton from './HoldToDeleteButton';
import { usePlayerStore } from '../store/usePlayerStore';
import { useShallow } from 'zustand/react/shallow';
import {
  Play,
  Pause,
  Heart,
  MoreVertical,
  Music,
  Clock,
  ChevronUp,
  ChevronDown,
  Pencil,
  Image as ImageIcon,
  Disc,
  CloudDownload,
  ListMusic,
  Search,
  Plus
} from 'lucide-react';
import EditHeroModal from './EditHeroModal';
import RetryImage from './RetryImage';


const formatDuration = (seconds) => {
  if (typeof seconds === 'string' && seconds.includes(':')) return seconds;
  if (!seconds || isNaN(seconds) || seconds === 0) return '-';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

const getMediaUrl = (path) => {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `media://local/?path=${encodeURIComponent(path)}`;
};

const getArtworkUrl = (path) => {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return `media://remote/?url=${encodeURIComponent(path)}`;
  }
  return `media://local/?path=${encodeURIComponent(path)}`;
};

const getHighResUrl = (url) => {
  if (!url) return '';
  if (url.includes('googleusercontent.com') || url.includes('ggpht.com')) {
    if (url.includes('=')) {
      return url.replace(/=w\d+-h\d+/i, '=w1024-h1024');
    }
  }
  return url.replace(/=w\d+-h\d+/i, '=w1024-h1024');
};

const getThumbnailUrl = (url) => {
  if (!url) return '';
  if (url.includes('googleusercontent.com') || url.includes('ggpht.com')) {
    if (url.includes('=')) {
      return url.replace(/=w\d+-h\d+/i, '=w300-h300');
    }
  }
  return url.replace(/=w\d+-h\d+/i, '=w300-h300');
};

export default function SongList() {
  const {
    songs,
    customAlbums,
    activeView,
    selectedAlbumName,
    selectedAlbumId,
    selectedArtistName,
    searchQuery,
    activeTrack,
    isPlaying,
    playTrack,
    preloadTrack,
    togglePlay,
    toggleFavorite,
    setActiveView,
    setEditingSong,
    setEditingPlaylist,
    deleteSong,
    appSettings,
    dominantColor,
    ytActiveAlbum,
    addYtAlbumToLibrary
  } = usePlayerStore(useShallow(state => ({
    songs: state.songs,
    customAlbums: state.customAlbums,
    activeView: state.activeView,
    selectedAlbumName: state.selectedAlbumName,
    selectedAlbumId: state.selectedAlbumId,
    selectedArtistName: state.selectedArtistName,
    searchQuery: state.searchQuery,
    activeTrack: state.activeTrack,
    isPlaying: state.isPlaying,
    playTrack: state.playTrack,
    preloadTrack: state.preloadTrack,
    togglePlay: state.togglePlay,
    toggleFavorite: state.toggleFavorite,
    setActiveView: state.setActiveView,
    setEditingSong: state.setEditingSong,
    setEditingPlaylist: state.setEditingPlaylist,
    deleteSong: state.deleteSong,
    appSettings: state.appSettings,
    dominantColor: state.dominantColor,
    ytActiveAlbum: state.ytActiveAlbum,
    addYtAlbumToLibrary: state.addYtAlbumToLibrary
  })));

  const [activeMenuSongId, setActiveMenuSongId] = useState(null);
  const [sortField, setSortField] = useState(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [isEditingHero, setIsEditingHero] = useState(false);
  const [scrollParent, setScrollParent] = useState(null);

  const dropdownRef = useRef(null);
  const isPlaylistMode = activeView === 'album-detail' || activeView === 'playlist-detail';

  useEffect(() => {
    // Find the nearest scrollable parent which is the main tag in App.jsx
    setTimeout(() => {
      setScrollParent(document.querySelector('main'));
    }, 0);
  }, []);

  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setActiveMenuSongId(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const { rawSongsList, viewTitle, viewSubtitle } = useMemo(() => {
    let rawSongsList = [];
    let viewTitle = 'All Songs';
    let viewSubtitle = 'Library';

    if (activeView === 'songs') {
      rawSongsList = songs.filter(s => s.filepath && !s.filepath.startsWith('yt-stream://'));
      viewTitle = appSettings?.dashboard_title || 'music';
      viewSubtitle = 'Library';
    } else if (activeView === 'favorites') {
      rawSongsList = songs.filter(s => s.favorite === 1);
      viewTitle = 'Favorites';
      viewSubtitle = 'Collection';
    } else if (activeView === 'album-detail') {
      const albumMatch = customAlbums.find(a => a.id === selectedAlbumId);
      if (albumMatch) {
        rawSongsList = albumMatch.songs || [];
        viewTitle = albumMatch.name;
      } else if (ytActiveAlbum && ytActiveAlbum.data && ytActiveAlbum.data.id === selectedAlbumId) {
        rawSongsList = ytActiveAlbum.tracks || [];
        viewTitle = ytActiveAlbum.data.title;
      } else {
        rawSongsList = songs.filter(s => s.album === selectedAlbumName);
        viewTitle = selectedAlbumName || 'Unknown Playlist';
      }
      viewSubtitle = ytActiveAlbum && ytActiveAlbum.data && ytActiveAlbum.data.id === selectedAlbumId ? 'Album' : 'Playlist';
    }

    return { rawSongsList, viewTitle, viewSubtitle };
  }, [activeView, songs, appSettings?.dashboard_title, customAlbums, selectedAlbumId, selectedAlbumName, ytActiveAlbum]);

  let viewArtwork = null;
  const firstWithArt = rawSongsList.find(s => s.has_artwork && s.artwork_path);
  // For album-detail, prefer the custom album's cover image
  const customAlbum = activeView === 'album-detail' && selectedAlbumId
    ? customAlbums.find(a => a.id === selectedAlbumId)
    : null;

  if (activeView === 'songs' && appSettings?.dashboard_cover_path) {
    viewArtwork = getArtworkUrl(appSettings.dashboard_cover_path);
  } else if (customAlbum && customAlbum.cover_path) {
    viewArtwork = getArtworkUrl(customAlbum.cover_path);
  } else if (ytActiveAlbum && ytActiveAlbum.data && ytActiveAlbum.data.id === selectedAlbumId && ytActiveAlbum.data.coverUrl) {
    viewArtwork = getArtworkUrl(getHighResUrl(ytActiveAlbum.data.coverUrl));
  } else if (firstWithArt) {
    viewArtwork = getArtworkUrl(getHighResUrl(firstWithArt.artwork_path));
  }

  const totalPlaylistDuration = useMemo(() => rawSongsList.reduce((sum, s) => {
    let dur = s.duration || 0;
    if (typeof dur === 'string' && dur.includes(':')) {
      const parts = dur.split(':').map(Number);
      if (parts.length === 2) dur = parts[0] * 60 + parts[1];
      else if (parts.length === 3) dur = parts[0] * 3600 + parts[1] * 60 + parts[2];
      else dur = parseFloat(dur) || 0;
    } else {
      dur = parseFloat(dur) || 0;
    }
    return sum + dur;
  }, 0), [rawSongsList]);
  const totalMins = Math.floor(totalPlaylistDuration / 60);
  const totalSecs = Math.floor(totalPlaylistDuration % 60);
  const playlistStatsStr = `${rawSongsList.length} track${rawSongsList.length !== 1 ? 's' : ''} • ${totalMins}m ${totalSecs}s`;

  const deferredSearchQuery = useDeferredValue(searchQuery);

  const filtered = useMemo(() => {
    const query = deferredSearchQuery.toLowerCase().trim();
    if (!query) return rawSongsList;

    const searchStopWords = new Set(['song', 'songs', 'music', 'track', 'tracks', 'video', 'audio', 'official', 'lyrics', 'lyric']);
    let queryTerms = query.split(/\s+/).filter(term => !searchStopWords.has(term));
    if (queryTerms.length === 0) {
      queryTerms = query.split(/\s+/);
    }

    return rawSongsList.map(song => {
      const title = (song.title || '').toLowerCase();
      const artist = (song.artist || '').toLowerCase();
      const album = (song.album || '').toLowerCase();

      // Original quality check helpers
      const isOriginalArtist = (artistName) => {
        if (!artistName) return false;
        const name = artistName.toLowerCase();
        const unoriginalKeywords = [
          'tribute', 'cover', 'covers', 'karaoke', 'instrumental', 'piano', 'lullaby',
          'kids', 'tunes', 'orchestra', 'singalong', 'hits band', 'tribute band',
          'originally performed', 'in the style of', 'tribute project', 'fanmade', 'fan-made'
        ];
        return !unoriginalKeywords.some(kw => name.includes(kw));
      };

      const isOriginalSong = (songTitle) => {
        if (!songTitle) return false;
        const t = songTitle.toLowerCase();
        const unoriginalKeywords = [
          'tribute', 'karaoke', 'originally performed', 'in the style of', 'karaoke version',
          'tribute version', 'piano cover', 'acoustic cover', 'instrumental cover'
        ];
        return !unoriginalKeywords.some(kw => t.includes(kw));
      };

      if (!isOriginalArtist(artist) || !isOriginalSong(title)) {
        return { song, score: -9999, matches: false };
      }

      // Check how terms map to artist vs title/album
      const normalizeHindiPhonetics = (str) => {
        if (!str) return '';
        return str.toLowerCase()
          .replace(/aa/g, 'a')
          .replace(/ee/g, 'i')
          .replace(/oo/g, 'u')
          .replace(/y/g, 'i')
          .replace(/ae/g, 'e')
          .replace(/h/g, '')
          .replace(/[^a-z0-9]/g, '');
      };

      const normArtist = normalizeHindiPhonetics(artist);
      const normTitle = normalizeHindiPhonetics(title);
      const normAlbum = normalizeHindiPhonetics(album);

      const normQueryTerms = queryTerms.map(t => normalizeHindiPhonetics(t));
      const matchingTerms = normQueryTerms.filter(term =>
        normArtist.includes(term) || normTitle.includes(term) || normAlbum.includes(term)
      );

      const matchRatio = matchingTerms.length / normQueryTerms.length;
      let matches = false;
      if (normQueryTerms.length <= 2) {
        matches = (matchRatio >= 0.99);
      } else {
        matches = (matchRatio >= 0.60);
      }

      let score = 0;
      if (matches) {

        // Exact artist match bonus
        if (queryTerms.every(term => normArtist.includes(normalizeHindiPhonetics(term)))) {
          score += 200;
        }
        // Exact title match bonus
        if (queryTerms.every(term => normTitle.includes(normalizeHindiPhonetics(term)))) {
          score += 150;
        }

        // Standard scoring for order ranking
        queryTerms.forEach(term => {
          const normTerm = normalizeHindiPhonetics(term);
          if (normTitle === normTerm) score += 100;
          else if (normTitle.startsWith(normTerm)) score += 50;
          else if (normTitle.includes(normTerm)) score += 10;

          if (normArtist === normTerm) score += 80;
          else if (normArtist.startsWith(normTerm)) score += 40;
          else if (normArtist.includes(normTerm)) score += 8;

          if (normAlbum === normTerm) score += 60;
          else if (normAlbum.startsWith(normTerm)) score += 30;
          else if (normAlbum.includes(normTerm)) score += 6;
        });
      }

      return { song, score, matches };
    })
      .filter(item => item.matches)
      .sort((a, b) => b.score - a.score)
      .map(item => item.song);
  }, [rawSongsList, deferredSearchQuery]);

  const handleSort = (field) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const sortedSongs = useMemo(() => [...filtered].sort((a, b) => {
    if (!sortField) return 0;
    let valA = a[sortField];
    let valB = b[sortField];

    if (typeof valA === 'string') {
      valA = valA.toLowerCase();
      valB = (valB || '').toLowerCase();
      return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
    } else {
      valA = valA || 0;
      valB = valB || 0;
      return sortAsc ? valA - valB : valB - valA;
    }
  }), [filtered, sortField, sortAsc]);

  const handleRowClick = (song) => {
    if (activeTrack && activeTrack.id === song.id) {
      togglePlay();
    } else {
      if (searchQuery && activeView === 'songs') {
        // Smart Local Queue: play the clicked song, then songs by the same artist, then same album, then random
        const sameArtist = songs.filter(s => s.id !== song.id && s.artist === song.artist);
        const sameAlbum = songs.filter(s => s.id !== song.id && s.album === song.album && s.artist !== song.artist);
        const others = songs.filter(s => s.id !== song.id && s.artist !== song.artist && s.album !== song.album);

        const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);

        const recommendedQueue = [
          song,
          ...shuffle(sameArtist),
          ...shuffle(sameAlbum),
          ...shuffle(others)
        ].slice(0, 100);

        playTrack(song, recommendedQueue);
      } else {
        playTrack(song, rawSongsList, activeView === 'album-detail' ? selectedAlbumId : undefined);
      }
    }
  };

  const renderSortIndicator = (field) => {
    if (sortField !== field) return null;
    return sortAsc ? (
      <ChevronUp size={12} className="inline ml-1 text-white" />
    ) : (
      <ChevronDown size={12} className="inline ml-1 text-white" />
    );
  };

  const isCurrentViewPlaying = isPlaying && activeTrack && rawSongsList.some(s => s.id === activeTrack.id);

  const handlePlayList = () => {
    if (rawSongsList.length === 0) return;
    if (isCurrentViewPlaying) {
      togglePlay();
    } else {
      const resumeTrack = activeTrack && rawSongsList.find(s => s.id === activeTrack.id);
      playTrack(resumeTrack || rawSongsList[0], rawSongsList, activeView === 'album-detail' ? selectedAlbumId : undefined);
    }
  };

  // Determine active background styles for Dashboard Hero
  let heroBgStyle = { backgroundColor: 'rgba(28, 26, 38, 0.4)' };
  if (activeView === 'songs' && dominantColor) {
    heroBgStyle = { backgroundColor: `hsla(${dominantColor.h}, ${dominantColor.s}%, ${Math.max(15, dominantColor.l - 40)}%, 0.4)` };
  }

  const isYtAlbumView = activeView === 'album-detail' && ytActiveAlbum && ytActiveAlbum.data && ytActiveAlbum.data.id === selectedAlbumId;
  const isAlreadySaved = isYtAlbumView && customAlbums.some(a => a.name === ytActiveAlbum.data.title);

  const handleAddToPlaylist = async () => {
    if (isYtAlbumView && !isAlreadySaved) {
      await addYtAlbumToLibrary(ytActiveAlbum.data, ytActiveAlbum.tracks);
    }
  };

  return (
    <div className={`flex flex-row gap-6 lg:gap-8 select-none animate-fade-in relative ${sortedSongs.length === 0 ? 'items-stretch' : 'items-start'}`}>
      {/* Merged Header Info Panel */}
      <div
        className="relative w-[35%] max-w-[320px] min-w-[220px] sticky top-0 overflow-hidden rounded-3xl bg-[#131219]/85 border border-white/10 shadow-2xl p-5 lg:p-6 flex flex-col items-start gap-5 lg:gap-6 group transition-all duration-500 z-20"
        style={heroBgStyle}
      >

        {/* Glow ambient background elements for 'songs' view */}
        {activeView === 'songs' && (
          <>
            <div className="absolute top-0 right-0 w-80 h-80 rounded-full blur-[100px] pointer-events-none" style={{ backgroundColor: dominantColor ? `hsla(${dominantColor.h}, ${dominantColor.s}%, 60%, 0.2)` : 'rgba(168, 85, 247, 0.1)' }} />
            <div className="absolute bottom-0 left-0 w-80 h-80 rounded-full blur-[100px] pointer-events-none" style={{ backgroundColor: dominantColor ? `hsla(${(dominantColor.h + 60) % 360}, ${dominantColor.s}%, 50%, 0.15)` : 'rgba(6, 182, 212, 0.05)' }} />
          </>
        )}

        <div
          onClick={handlePlayList}
          className="relative z-10 w-full aspect-square rounded-2xl bg-[#131219]/60 border border-white/10 shadow-2xl flex items-center justify-center overflow-hidden flex-shrink-0 group/art cursor-pointer"
        >
          {viewArtwork ? (
            <img src={viewArtwork} alt={viewTitle} className="w-full h-full object-cover transition-transform duration-500 group-hover/art:scale-105" />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center group-hover/art:scale-105 transition-transform duration-700 relative overflow-hidden bg-gradient-to-br from-white/[0.08] to-transparent shadow-inner">
              {/* Dynamic Icon based on View */}
              <div className="relative z-10 drop-shadow-xl transform transition-transform duration-500 group-hover/art:scale-110">
                {activeView === 'favorites' ? (
                  <Heart size={64} className="text-white/40" strokeWidth={1.5} />
                ) : activeView === 'songs' ? (
                  <ListMusic size={64} className="text-white/40" strokeWidth={1.5} />
                ) : activeView === 'album-detail' ? (
                  <Disc size={64} className="text-white/40" strokeWidth={1.5} />
                ) : (
                  <Music size={64} className="text-white/40" strokeWidth={1.5} />
                )}
              </div>
            </div>
          )}
          {rawSongsList.length > 0 && (
            <div className={`absolute inset-0 bg-black/70 flex items-center justify-center transition-all duration-300 ${isCurrentViewPlaying ? 'opacity-100' : 'opacity-0 group-hover/art:opacity-100'
              }`}>
              <div className="w-14 h-14 rounded-full bg-white text-black flex items-center justify-center shadow-2xl transition-all duration-300 transform hover:scale-105 active:scale-95">
                {isCurrentViewPlaying ? (
                  <Pause size={20} fill="currentColor" className="text-[#141416]" />
                ) : (
                  <Play size={20} fill="currentColor" className="ml-1 text-[#141416]" />
                )}
              </div>
            </div>
          )}
        </div>

        <div className="relative z-10 flex flex-col justify-end text-left w-full mb-1 flex-1">
          <span className="text-[10px] uppercase font-medium tracking-widest text-white/60">{viewSubtitle}</span>
          <h2 className="text-2xl lg:text-3xl font-display font-bold text-white tracking-tight mt-1 mb-2 leading-tight line-clamp-2 break-words">{viewTitle}</h2>

          <div className="flex flex-col gap-4 mt-4 w-full">
            <span className="text-sm text-gray-400 font-medium">{playlistStatsStr}</span>
            <div className="flex flex-wrap justify-start gap-2 w-full">
              {rawSongsList.length > 0 && (
                <button
                  onClick={handlePlayList}
                  className="flex items-center gap-2 bg-white text-[#141416] hover:bg-white/95 px-6 py-2.5 rounded-full text-xs font-bold shadow-lg transition-all duration-300 active:scale-95 cursor-pointer"
                >
                  {isCurrentViewPlaying ? (
                    <>
                      <Pause size={12} fill="currentColor" />
                      <span>Pause</span>
                    </>
                  ) : (
                    <>
                      <Play size={12} fill="currentColor" className="ml-0.5" />
                      <span>Play</span>
                    </>
                  )}
                </button>
              )}
              {activeView === 'songs' && (
                <button
                  onClick={() => setIsEditingHero(true)}
                  className="flex items-center gap-2 bg-white/10 text-white hover:bg-white/20 px-4 py-2 rounded-full text-xs font-bold border border-white/10 shadow-lg transition-all duration-300 active:scale-95 cursor-pointer"
                >
                  <ImageIcon size={12} />
                  <span>Edit Banner</span>
                </button>
              )}
              {activeView === 'album-detail' && customAlbum && (
                <button
                  onClick={() => setEditingPlaylist(customAlbum)}
                  className="flex items-center gap-2 bg-white/10 text-white hover:bg-white/20 px-4 py-2 rounded-full text-xs font-bold border border-white/10 shadow-lg transition-all duration-300 active:scale-95 cursor-pointer"
                >
                  <Pencil size={12} />
                  <span>Edit</span>
                </button>
              )}
              {isYtAlbumView && !isAlreadySaved && (
                <button
                  onClick={handleAddToPlaylist}
                  className="flex items-center gap-2 bg-white/10 text-white hover:bg-white/20 px-4 py-2 rounded-full text-xs font-bold border border-white/10 shadow-lg transition-all duration-300 active:scale-95 cursor-pointer"
                >
                  <Plus size={12} />
                  <span>Add to Playlist</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Track List Table */}
      <div className="w-full flex-1 rounded-2xl border border-white/10 bg-[#131219]/65 overflow-hidden min-w-[300px]">
        {sortedSongs.length === 0 ? (
          <div className="w-full py-28 lg:py-36 flex flex-col items-center justify-center px-8 relative overflow-hidden group">

            <Search size={42} className="text-white/20 mb-6" />

            <h3 className="relative z-10 text-2xl lg:text-3xl font-display font-bold text-white mb-4 text-center tracking-tight">
              {searchQuery
                ? 'No tracks found'
                : activeView === 'favorites'
                  ? 'No favorites yet'
                  : activeView === 'album-detail' || activeView === 'playlist-detail'
                    ? 'Let\'s build your playlist'
                    : 'Your library is empty'}
            </h3>

            <p className="relative z-10 text-sm lg:text-base text-gray-400 font-medium max-w-[400px] text-center leading-relaxed">
              {searchQuery
                ? `We couldn't find anything matching "${searchQuery}". Try a different search term.`
                : activeView === 'favorites'
                  ? 'Tap the heart icon on any track to add it to your favorites collection.'
                  : activeView === 'album-detail' || activeView === 'playlist-detail'
                    ? 'Search for your favorite artists and songs to add them to this playlist.'
                    : 'Search for your favorite artists and songs to start building your collection.'}
            </p>
          </div>
        ) : (
          scrollParent && (
            <TableVirtuoso
              customScrollParent={scrollParent}
              data={sortedSongs}
              components={{
                Table: ({ style, ...props }) => <table {...props} style={{ ...style, width: '100%', borderCollapse: 'separate', borderSpacing: 0 }} className="text-left text-sm text-gray-300" />,
                TableRow: ({ item, ...props }) => {
                  const isActive = activeTrack && item && (
                    (item.id && activeTrack.id === item.id) ||
                    (item.videoId && (activeTrack.videoId === item.videoId || activeTrack.id === item.videoId))
                  );
                  return (
                    <tr {...props}
                      onMouseEnter={() => {
                        if (item && (item.isStream || (item.filepath && item.filepath.startsWith('yt-stream://')))) {
                          preloadTrack(item);
                        }
                      }}
                      className={`group transition-all duration-300 ${isActive ? 'text-white relative z-10' : 'hover:bg-white/5 text-gray-300'}`}
                      style={{
                        borderRadius: '12px',
                        overflow: 'hidden',
                        backgroundColor: isActive
                          ? (dominantColor ? `hsla(${dominantColor.h}, ${dominantColor.s}%, ${dominantColor.l}%, 0.15)` : 'rgba(255, 255, 255, 0.1)')
                          : undefined,
                        boxShadow: isActive
                          ? (dominantColor ? `inset 3px 0 0 hsla(${dominantColor.h}, ${dominantColor.s}%, ${dominantColor.l}%, 1)` : 'inset 3px 0 0 #fff')
                          : undefined
                      }}
                    />
                  );
                },
                TableHead: forwardRef((props, ref) => <thead {...props} ref={ref} />),
                TableBody: forwardRef((props, ref) => <tbody {...props} ref={ref} />),
                Footer: () => <div className="h-28 w-full" />
              }}
              fixedHeaderContent={() => (
                <tr className="border-b border-white/5 text-[10px] uppercase font-medium tracking-widest text-gray-500 bg-[#1c1a26]">
                  <th className="py-3.5 px-4 w-12 text-center"></th>
                  <th className="py-3.5 px-4 cursor-pointer hover:text-white" onClick={() => handleSort('title')}>
                    Title {renderSortIndicator('title')}
                  </th>
                  <th className="py-3.5 px-4 cursor-pointer hover:text-white hidden md:table-cell" onClick={() => handleSort('artist')}>
                    Artist {renderSortIndicator('artist')}
                  </th>
                  <th className="py-3.5 px-4 cursor-pointer hover:text-white hidden lg:table-cell" onClick={() => handleSort('album')}>
                    Playlist {renderSortIndicator('album')}
                  </th>
                  <th className="py-3.5 px-4 w-20 text-center cursor-pointer hover:text-white hidden sm:table-cell" onClick={() => handleSort('play_count')}>
                    Plays {renderSortIndicator('play_count')}
                  </th>
                  {!isPlaylistMode && (
                    <th className="py-3.5 px-4 w-20 text-center cursor-pointer hover:text-white hidden sm:table-cell" onClick={() => handleSort('duration')}>
                      <Clock size={12} className="inline mr-1" />
                      {renderSortIndicator('duration')}
                    </th>
                  )}
                  <th className="py-3.5 px-4 w-20 text-right"></th>
                </tr>
              )}
              itemContent={(index, song) => {
                const isCurrent = activeTrack && (
                  activeTrack.id === song.id ||
                  (activeTrack.videoId && song.filepath === `yt-stream://${activeTrack.videoId}`) ||
                  (song.filepath && song.filepath.startsWith('yt-stream://') && activeTrack.filepath === song.filepath)
                );
                const isCurrentPlaying = isCurrent && isPlaying;

                return (
                  <>
                    {/* Index or visualizer waves */}
                    <td className={`py-3 px-4 font-display text-xs text-center border-b border-white/0 transition-all cursor-pointer rounded-l-xl group-hover:text-white ${isCurrent ? 'text-white' : 'text-gray-400'}`} onClick={(e) => { e.stopPropagation(); handleRowClick(song); }}>
                      {isCurrentPlaying ? (
                        <div className="flex gap-[2px] justify-center items-end h-3 w-4 mx-auto">
                          <span className="w-[2px] h-full bg-white animate-float"></span>
                          <span className="w-[2px] h-[60%] bg-white/80 animate-float [animation-delay:0.2s]"></span>
                          <span className="w-[2px] h-[80%] bg-white/60 animate-float [animation-delay:0.4s]"></span>
                        </div>
                      ) : (
                        <div className="relative w-4 h-4 mx-auto flex items-center justify-center">
                          {isCurrent ? (
                            <Play size={10} fill="currentColor" className="mx-auto" />
                          ) : (
                            <Play size={10} fill="currentColor" className="opacity-0 group-[&:hover]:opacity-100 group-[&:hover]:scale-125 transition-all duration-300 text-white mx-auto" />
                          )}
                        </div>
                      )}
                    </td>

                    {/* Title */}
                    <td className={`py-3 px-4 border-b border-white/0 cursor-pointer ${isCurrent ? 'text-white' : ''}`} onClick={() => handleRowClick(song)}>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-md bg-white/5 border border-white/5 flex items-center justify-center overflow-hidden flex-shrink-0">
                          {(song.has_artwork || !!(song.artwork_path || song.coverUrl || song.thumbnail)) && (song.artwork_path || song.coverUrl || song.thumbnail) ? (
                            <RetryImage
                              src={getArtworkUrl(getThumbnailUrl(song.artwork_path || song.coverUrl || song.thumbnail))}
                              alt={song.title}
                              className="w-full h-full"
                            />
                          ) : (
                            <Disc size={16} className={isCurrent ? 'text-white/60' : 'text-white/20'} />
                          )}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className={`text-[13px] font-bold truncate group-hover:text-white transition-colors ${isCurrent ? 'text-white' : 'text-gray-100'}`}>{song.title}</span>
                          <span className={`text-[11px] truncate mt-0.5 ${isCurrent ? 'text-white/80' : 'text-gray-400'}`}>{song.artist}</span>
                        </div>
                      </div>
                    </td>

                    {/* Artist */}
                    <td className={`py-3 px-4 text-xs font-medium truncate max-w-[100px] md:max-w-[150px] border-b border-white/0 cursor-pointer hidden md:table-cell ${isCurrent ? 'text-white' : 'text-gray-300'}`} onClick={() => handleRowClick(song)}>
                      {song.artist}
                    </td>

                    {/* Playlist */}
                    <td className={`py-3 px-4 text-xs font-normal truncate max-w-[100px] md:max-w-[150px] border-b border-white/0 cursor-pointer hidden lg:table-cell ${isCurrent ? 'text-white' : 'text-gray-300'}`} onClick={() => handleRowClick(song)}>
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveView('album-detail', { albumName: song.album });
                        }}
                        className="hover:underline hover:text-white"
                      >
                        {song.album}
                      </span>
                    </td>

                    {/* Plays */}
                    <td className={`py-3 px-4 font-display text-xs text-center font-medium border-b border-white/0 cursor-pointer hidden sm:table-cell ${isCurrent ? 'text-white' : 'text-gray-400'}`} onClick={() => handleRowClick(song)}>
                      {song.play_count > 0 ? song.play_count : '-'}
                    </td>

                    {/* Duration */}
                    {!isPlaylistMode && (
                      <td className={`py-3 px-4 font-display text-xs text-center font-medium border-b border-white/0 cursor-pointer hidden sm:table-cell ${isCurrent ? 'text-white' : 'text-gray-400'}`} onClick={() => handleRowClick(song)}>
                        {formatDuration(song.duration)}
                      </td>
                    )}

                    {/* Favorite & Context action dropdown */}
                    <td className={`py-3 px-4 text-right border-b border-white/0 rounded-r-xl ${isCurrent ? 'text-white' : ''}`} onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-3">
                        {!isPlaylistMode && (
                          <button
                            onClick={() => toggleFavorite(song.id || song.videoId, undefined, song)}
                            className={`hover:scale-105 active:scale-95 transition-all ${song.favorite ? (isCurrent ? 'text-white' : '') : (isCurrent ? 'text-white/60 hover:text-white' : 'text-gray-500 hover:text-white')
                              }`}
                            style={song.favorite && !isCurrent ? { color: dominantColor ? `hsl(${dominantColor.h}, ${dominantColor.s}%, ${Math.max(40, dominantColor.l - 5)}%)` : '#FF4F6E' } : {}}
                          >
                            <Heart size={14} fill={song.favorite ? 'currentColor' : 'none'} />
                          </button>
                        )}

                        <HoldToDeleteButton onComplete={() => deleteSong(song.id)} />

                        <div className="relative">
                          <button
                            onClick={() => setActiveMenuSongId(activeMenuSongId === song.id ? null : song.id)}
                            className="text-gray-500 hover:text-white p-0.5 rounded-md hover:bg-white/5 transition-all"
                          >
                            <MoreVertical size={14} />
                          </button>

                          {activeMenuSongId === song.id && (
                            <div
                              ref={dropdownRef}
                              className={`absolute right-0 ${index < 3 && sortedSongs.length > 5 ? 'top-full mt-1' : 'bottom-full mb-1'} bg-[#1a1a1f] border border-white/15 rounded-2xl w-44 py-2 z-[300] shadow-2xl flex flex-col items-stretch text-left animate-fade-in`}
                            >
                              <button
                                onClick={() => {
                                  setEditingSong(song);
                                  setActiveMenuSongId(null);
                                }}
                                className="px-3.5 py-1.5 text-xs text-gray-300 hover:bg-white/5 hover:text-white transition-all text-left flex items-center gap-2"
                              >
                                <Pencil size={11} />
                                <span>Edit track info</span>
                              </button>
                              {song.filepath && song.filepath.startsWith('yt-stream://') && (
                                <button
                                  onClick={() => {
                                    const videoId = song.filepath.replace('yt-stream://', '');
                                    usePlayerStore.getState().startDownload({ ...song, videoId });
                                    setActiveMenuSongId(null);
                                  }}
                                  className="px-3.5 py-1.5 text-xs text-gray-300 hover:bg-white/5 hover:text-white transition-all text-left flex items-center gap-2"
                                >
                                  <CloudDownload size={11} />
                                  <span>Download to library</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </>
                );
              }}
            />
          )
        )}
      </div>

      {isEditingHero && (
        <EditHeroModal onClose={() => setIsEditingHero(false)} />
      )}
    </div>
  );
}
