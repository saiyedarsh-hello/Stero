import { useEffect, useState, useRef, useCallback } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useShallow } from 'zustand/react/shallow';
import { Play, Pause, Shuffle, Heart, MoreHorizontal, Music, Clock, Loader2, UserCheck, Disc } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const getMediaUrl = (path) => {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
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

const formatDuration = (seconds) => {
  if (!seconds) return '--:--';
  if (typeof seconds === 'string') {
    if (seconds.includes(':')) return seconds;
    seconds = Number(seconds);
  }
  if (isNaN(seconds)) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export default function ArtistPage() {
  const {
    selectedArtist,
    dominantColor,
    activeTrack,
    isPlaying,
    playTrack,
    togglePlay,
    followedArtists,
    toggleFollowArtist,
    viewYtAlbum,
  } = usePlayerStore(useShallow(state => ({
    selectedArtist: state.selectedArtist,
    dominantColor: state.dominantColor,
    activeTrack: state.activeTrack,
    isPlaying: state.isPlaying,
    playTrack: state.playTrack,
    togglePlay: state.togglePlay,
    followedArtists: state.followedArtists,
    toggleFollowArtist: state.toggleFollowArtist,
    viewYtAlbum: state.viewYtAlbum,
  })));

  const [songs, setSongs] = useState([]);
  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hoveredIdx, setHoveredIdx] = useState(null);
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const mainEl = document.querySelector('main');
    if (!mainEl) return;
    const handleScroll = (e) => {
      setScrollY(e.target.scrollTop);
    };
    mainEl.addEventListener('scroll', handleScroll);
    return () => mainEl.removeEventListener('scroll', handleScroll);
  }, []);

  const artist = selectedArtist;
  const isFollowed = followedArtists.some(a => 
    (a.name || '').toLowerCase() === (artist?.name || '').toLowerCase()
  );

  const accentH = dominantColor?.h ?? 260;
  const accentS = dominantColor?.s ?? 60;
  const accent = `hsl(${accentH}, ${Math.max(50, accentS)}%, 65%)`;
  const accentDim = `hsl(${accentH}, ${Math.max(40, accentS)}%, 45%)`;
  const accentGlow = `hsla(${accentH}, ${Math.max(60, accentS)}%, 60%, 0.25)`;

  useEffect(() => {
    if (!artist) return;
    setLoading(true);
    setSongs([]);
    setAlbums([]);
    setScrollY(0);
    const mainEl = document.querySelector('main');
    if (mainEl) mainEl.scrollTop = 0;

    const fetchArtistData = async () => {
      try {
        if (!window.electron) return;
        const id = artist.id || artist.browseId;
        let songResults = [];
        let albumResults = [];
        
        if (id && typeof window.electron.ytGetArtistSongs === 'function') {
          songResults = await window.electron.ytGetArtistSongs(id);
        }
        if (id && typeof window.electron.ytGetArtistAlbums === 'function') {
          albumResults = await window.electron.ytGetArtistAlbums(id);
        }
        
        if (!songResults || songResults.length === 0) {
          const query = artist.name;
          songResults = await window.electron.ytSearch(query);
        }

        if (songResults && songResults.length > 0) {
          setSongs(songResults.slice(0, 50));
        }
        if (albumResults && albumResults.length > 0) {
          setAlbums(albumResults);
        }
      } catch (err) {
        console.error('Failed to fetch artist data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchArtistData();
  }, [artist?.name, artist?.id, artist?.browseId]);

  const playAll = () => {
    if (!songs.length) return;
    playTrack(songs[0], songs);
  };

  const playShuffle = () => {
    if (!songs.length) return;
    const shuffled = [...songs].sort(() => Math.random() - 0.5);
    playTrack(shuffled[0], shuffled);
  };

  const isCurrentArtistPlaying = activeTrack &&
    (activeTrack.artist || '').toLowerCase().includes((artist?.name || '').toLowerCase());

  if (!artist) return null;

  const coverImg = getMediaUrl(getHighResUrl(artist.imageUrl || artist.thumbnail || ''));
  const headerOpacity = Math.max(0, 1 - scrollY / 200);
  const headerScale = Math.max(0.92, 1 - scrollY / 1200);

  return (
    <div className="relative w-full">
      {/* ── Hero Section ── */}
      <div className="relative h-[340px] flex-shrink-0 overflow-hidden">
        {/* Background blurred cover */}
        <div
          className="absolute inset-0 scale-110"
          style={{
            backgroundImage: coverImg ? `url(${coverImg})` : `linear-gradient(135deg, hsl(${accentH},${accentS}%,15%), hsl(${accentH+40},${accentS}%,8%))`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(32px) brightness(0.35) saturate(1.4)',
          }}
        />
        {/* Gradient fade */}
        <div className="absolute inset-0" style={{
          background: `linear-gradient(to bottom, transparent 0%, rgba(11,13,20,0.6) 70%, rgb(11,13,20) 100%)`
        }} />
        {/* Radial glow */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: `radial-gradient(ellipse at 30% 50%, ${accentGlow}, transparent 65%)`
        }} />

        {/* Hero content */}
        <div
          className="absolute inset-0 flex items-end px-8 pb-8 gap-7"
          style={{ opacity: headerOpacity, transform: `scale(${headerScale})`, transformOrigin: 'bottom left' }}
        >
          {/* Artist avatar */}
          <div
            className="relative flex-shrink-0"
            style={{
              filter: `drop-shadow(0 8px 32px ${accentGlow})`,
            }}
          >
            <div
              className="w-36 h-36 rounded-full overflow-hidden border-2"
              style={{ borderColor: `hsla(${accentH},${accentS}%,65%,0.35)` }}
            >
              {coverImg ? (
                <img src={coverImg} alt={artist.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center"
                  style={{ background: `linear-gradient(135deg, hsl(${accentH},${accentS}%,20%), hsl(${accentH+30},${accentS}%,12%))` }}>
                  <Music size={40} style={{ color: accent }} />
                </div>
              )}
            </div>
            {/* Animated ring */}
            {isCurrentArtistPlaying && isPlaying && (
              <div
                className="absolute inset-[-4px] rounded-full border-2 animate-pulse"
                style={{ borderColor: accent }}
              />
            )}
          </div>

          {/* Artist info */}
          <div className="flex flex-col gap-2 min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/40">Artist</span>
            <h1 className="text-4xl font-black tracking-tight leading-none text-white">
              {artist.name}
            </h1>
            {songs.length > 0 && (
              <span className="text-sm text-white/40 font-medium">{songs.length} songs</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Action Bar ── */}
      <div className="px-8 py-5 flex items-center gap-4 sticky top-0 z-20"
        style={{
          background: scrollY > 80
            ? `rgba(11,13,20,0.92)`
            : 'transparent',
          backdropFilter: scrollY > 80 ? 'blur(20px)' : 'none',
          borderBottom: scrollY > 80 ? '1px solid rgba(255,255,255,0.06)' : 'none',
          transition: 'background 0.3s, backdrop-filter 0.3s, border 0.3s'
        }}
      >
        {/* Play All */}
        <button
          onClick={isCurrentArtistPlaying ? togglePlay : playAll}
          disabled={loading || !songs.length}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full font-bold text-sm transition-all duration-300 active:scale-95 disabled:opacity-40"
          style={{
            background: accent,
            color: '#000',
            boxShadow: `0 4px 24px ${accentGlow}`,
          }}
        >
          {isCurrentArtistPlaying && isPlaying
            ? <><Pause size={15} fill="currentColor" /> Pause</>
            : <><Play size={15} fill="currentColor" /> Play All</>
          }
        </button>

        {/* Shuffle */}
        <button
          onClick={playShuffle}
          disabled={loading || !songs.length}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full border text-sm font-semibold transition-all duration-300 hover:border-white/20 hover:bg-white/5 active:scale-95 disabled:opacity-40 text-white/70 hover:text-white"
          style={{ borderColor: 'rgba(255,255,255,0.1)' }}
        >
          <Shuffle size={14} /> Shuffle
        </button>

        {/* Follow/Unfollow */}
        <button
          onClick={() => toggleFollowArtist && toggleFollowArtist(artist)}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-full border text-sm font-semibold transition-all duration-300 active:scale-95 ml-auto ${
            isFollowed
              ? 'text-white/60 border-white/10 hover:text-red-400 hover:border-red-400/30 hover:bg-red-500/5'
              : 'text-white/40 border-white/5 hover:border-white/10 hover:bg-white/5'
          }`}
        >
          <UserCheck size={14} />
          {isFollowed ? 'Unfollow' : 'Follow'}
        </button>
      </div>

      {/* ── Song List ── */}
      <div className="px-8 pb-40">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-white/30">
            <Loader2 size={28} className="animate-spin" style={{ color: accent }} />
            <span className="text-sm font-semibold">Loading songs…</span>
          </div>
        ) : songs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-white/30">
            <Music size={36} className="opacity-40" />
            <span className="text-sm font-semibold">No songs found</span>
          </div>
        ) : (
          <>
            {/* Header row */}
            <div className="flex items-center gap-4 px-4 pb-3 border-b border-white/5 mb-1">
              <span className="w-7 text-center text-[10px] font-bold text-white/25 uppercase tracking-widest">#</span>
              <span className="flex-1 text-[10px] font-bold text-white/25 uppercase tracking-widest">Title</span>
              <Clock size={12} className="text-white/25" />
            </div>

            <AnimatePresence>
              {songs.map((song, idx) => {
                const isActive = activeTrack &&
                  ((activeTrack.videoId && activeTrack.videoId === song.videoId) ||
                    (activeTrack.title === song.title && activeTrack.artist === song.artist));
                const isHovered = hoveredIdx === idx;
                const thumb = song.thumbnail || song.coverUrl || song.artwork_path;

                return (
                  <motion.div
                    key={song.videoId || idx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: idx * 0.03 }}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    onClick={() => isActive ? togglePlay() : playTrack(song, songs)}
                    className="flex items-center gap-4 px-4 py-2.5 rounded-xl cursor-pointer group transition-all duration-200"
                    style={{
                      background: isActive
                        ? `linear-gradient(90deg, hsla(${accentH},${accentS}%,45%,0.12), transparent)`
                        : isHovered
                          ? 'rgba(255,255,255,0.04)'
                          : 'transparent',
                    }}
                  >
                    {/* Track number / play icon */}
                    <div className="w-7 h-7 flex items-center justify-center flex-shrink-0">
                      {isHovered || (isActive && isPlaying) ? (
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center transition-all duration-200"
                          style={{ background: accent }}
                        >
                          {isActive && isPlaying
                            ? <Pause size={11} fill="#000" className="text-black" />
                            : <Play size={11} fill="#000" className="text-black ml-0.5" />
                          }
                        </div>
                      ) : (
                        <span
                          className="text-sm font-bold tabular-nums"
                          style={{ color: isActive ? accent : 'rgba(255,255,255,0.25)' }}
                        >
                          {idx + 1}
                        </span>
                      )}
                    </div>

                    {/* Thumbnail */}
                    <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-white/5">
                      {thumb ? (
                        <img src={getMediaUrl(thumb)} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Music size={14} className="text-white/20" />
                        </div>
                      )}
                    </div>

                    {/* Title + artist */}
                    <div className="flex-1 min-w-0">
                      <p
                        className="text-sm font-semibold truncate leading-tight"
                        style={{ color: isActive ? accent : 'rgba(255,255,255,0.9)' }}
                      >
                        {song.title}
                      </p>
                      <p className="text-xs text-white/35 truncate mt-0.5">{song.artist || artist.name}</p>
                    </div>

                    {/* Duration */}
                    <span className="text-xs text-white/30 tabular-nums font-medium flex-shrink-0">
                      {formatDuration(song.duration)}
                    </span>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </>
        )}

        {/* ── Albums Section ── */}
        {!loading && albums.length > 0 && (
          <div className="mt-12">
            <h2 className="text-xl font-bold text-white tracking-tight mb-6 px-4">Albums</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5 px-4">
              {albums.map((album, i) => (
                <div
                  key={album.id + '-' + i}
                  onClick={() => viewYtAlbum(album.id, album.title)}
                  className="bg-white/2 border border-white/10 hover:border-white/25 hover:bg-white/5 backdrop-blur-md rounded-2xl p-4 flex flex-col cursor-pointer transition-all duration-300 hover:-translate-y-1 shadow-lg group relative"
                >
                  <div className="w-full aspect-square rounded-xl bg-white/5 flex items-center justify-center mb-3.5 shadow-md overflow-hidden border border-white/5 relative">
                    {album.coverUrl ? (
                      <img
                        src={getHighResUrl(getMediaUrl(album.coverUrl))}
                        alt={album.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <Disc size={36} className="text-white/30" />
                    )}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                      <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-2xl transform scale-75 group-hover:scale-100 transition-transform duration-300">
                        <Play size={20} className="text-black ml-1" fill="currentColor" />
                      </div>
                    </div>
                  </div>
                  <h4 className="text-sm font-semibold tracking-wide text-white truncate">{album.title}</h4>
                  <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mt-1.5 block">
                    {album.year || 'Album'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
