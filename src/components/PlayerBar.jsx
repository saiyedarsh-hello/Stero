import { useEffect, useRef, useState, useCallback } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useShallow } from 'zustand/react/shallow';
import RetryImage from './RetryImage';

import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Shuffle,
  Repeat,
  Volume2,
  VolumeX,
  Heart,
  Maximize2,
  Disc,
  Pencil,
  CloudDownload,
  ListPlus,
  Check,
  ListMusic,
  AlignLeft
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

const formatTime = (seconds) => {
  if (isNaN(seconds) || seconds === null) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

const getMediaUrl = (path) => {
  if (!path) return '';
  if (path.startsWith('yt-stream://')) {
    return `http://127.0.0.1:8998/stream?videoId=${path.replace('yt-stream://', '')}`;
  }
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


const getClientX = (e) => {
  if (e.clientX !== undefined) return e.clientX;
  if (e.touches && e.touches.length > 0) return e.touches[0].clientX;
  if (e.changedTouches && e.changedTouches.length > 0) return e.changedTouches[0].clientX;
  return 0;
};

export default function PlayerBar() {
  const {
    activeTrack,
    isPlaying,
    volume,
    muted,
    shuffle,
    repeatMode,
    activeView,
    songs,
    queue,
    savedPosition,
    clearSavedPosition,
    togglePlay,
    nextTrack,
    prevTrack,
    setVolume,
    setMuted,
    setShuffle,
    cycleRepeatMode,
    toggleFavorite,
    setActiveView,
    goBackView,
    setEditingSong,
    activePlaylistId,
    dominantColor,
    customAlbums,
    addSongToCustomAlbum,
    isQueueSidebarOpen,
    toggleQueueSidebar,
    isLyricsSidebarOpen,
    toggleLyricsSidebar
  } = usePlayerStore(useShallow(state => ({
    activeTrack: state.activeTrack,
    isPlaying: state.isPlaying,
    volume: state.volume,
    muted: state.muted,
    shuffle: state.shuffle,
    repeatMode: state.repeatMode,
    activeView: state.activeView,
    songs: state.songs,
    queue: state.queue,
    savedPosition: state.savedPosition,
    clearSavedPosition: state.clearSavedPosition,
    togglePlay: state.togglePlay,
    nextTrack: state.nextTrack,
    prevTrack: state.prevTrack,
    setVolume: state.setVolume,
    setMuted: state.setMuted,
    setShuffle: state.setShuffle,
    cycleRepeatMode: state.cycleRepeatMode,
    toggleFavorite: state.toggleFavorite,
    goBackView: state.goBackView,
    setActiveView: state.setActiveView,
    setEditingSong: state.setEditingSong,
    activePlaylistId: state.activePlaylistId,
    dominantColor: state.dominantColor,
    customAlbums: state.customAlbums,
    addSongToCustomAlbum: state.addSongToCustomAlbum,
    isQueueSidebarOpen: state.isQueueSidebarOpen,
    toggleQueueSidebar: state.toggleQueueSidebar,
    isLyricsSidebarOpen: state.isLyricsSidebarOpen,
    toggleLyricsSidebar: state.toggleLyricsSidebar
  })));

  const currentSong = activeTrack || {
    title: 'Not Playing',
    artist: 'Select a track to start listening',
    has_artwork: false,
    artwork_path: ''
  };

  const audioRef = useRef(null);
  const progressBarRef = useRef(null);
  const volumeBarRef = useRef(null);
  const dragTimeRef = useRef(0);
  const lastFilepathRef = useRef('');
  const lastSaveRef = useRef(0); // timestamp of last session save
  const lastProgressUpdateRef = useRef(0); // timestamp of last progress state update

  const [duration, setDuration] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [isDraggingVolume, setIsDraggingVolume] = useState(false);
  const [isIdle, setIsIdle] = useState(false);
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [addedPlaylistId, setAddedPlaylistId] = useState(null);
  const isHoveringBarRef = useRef(false);
  const playlistMenuRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (playlistMenuRef.current && !playlistMenuRef.current.contains(event.target)) {
        setShowPlaylistMenu(false);
      }
    };
    if (showPlaylistMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showPlaylistMenu]);

  const handleAddToPlaylist = async (albumId) => {
    if (!activeTrack) return;
    await addSongToCustomAlbum(albumId, activeTrack);
    setAddedPlaylistId(albumId);
    setTimeout(() => {
      setAddedPlaylistId(null);
      setShowPlaylistMenu(false);
    }, 1500);
  };

  // Refs for direct DOM updates to bypass React re-rendering
  const timeTextRef = useRef(null);
  const progressBarFillRef = useRef(null);
  const progressThumbRef = useRef(null);
  const progressGlowRef = useRef(null);
  const rafRef = useRef(null);

  // Auto-hide when mouse is idle
  useEffect(() => {
    let timeout;
    const handleMouseMove = () => {
      setIsIdle(false);
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        if (!isHoveringBarRef.current) {
          setIsIdle(true);
        }
      }, 3000);
    };

    window.addEventListener('mousemove', handleMouseMove);
    handleMouseMove();

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      clearTimeout(timeout);
    };
  }, []);

  // Handle active track change and play/pause synchronization
  useEffect(() => {
    if (!audioRef.current) return;

    if (activeTrack) {
      const trackSrc = getMediaUrl(activeTrack.filepath);
      // Only change src if the track has actually changed
      if (lastFilepathRef.current !== activeTrack.filepath) {
        audioRef.current.src = trackSrc;
        // Explicitly reset current time when switching to a new track
        // (If there's a saved session position, handleLoadedMetadata will seek to it shortly after)
        audioRef.current.currentTime = 0;
        if (timeTextRef.current) timeTextRef.current.innerText = '0:00';
        if (progressBarFillRef.current) progressBarFillRef.current.style.width = '0%';
        if (progressThumbRef.current) progressThumbRef.current.style.left = '0%';
        lastFilepathRef.current = activeTrack.filepath;
      }

      if (isPlaying) {
        audioRef.current.play().catch((err) => {
          console.warn("Playback failed on play():", err);
          if ((activeTrack.isStream || activeTrack.filepath?.startsWith('yt-stream://')) && window.electron) {
            console.log("Attempting to refresh expired stream URL on play failure...");
            window.electron.ytGetStreamUrl(activeTrack.videoId || activeTrack.id).then(result => {
              if (result && result.success && result.url) {
                const currentPos = audioRef.current.currentTime || 0;
                usePlayerStore.setState(state => ({
                  activeTrack: { ...state.activeTrack, filepath: result.url }
                }));
                setTimeout(() => {
                  if (audioRef.current) {
                    audioRef.current.currentTime = currentPos;
                    audioRef.current.play().catch(e => console.error("Retry failed:", e));
                  }
                }, 100);
              }
            }).catch(e => console.error("Failed to refresh stream URL:", e));
          }
        });
      } else {
        audioRef.current.pause();
      }

      // Update OS media widget (SMTC on Windows)
      if ('mediaSession' in navigator) {
        const coverImg = activeTrack.artwork_path || activeTrack.coverUrl || activeTrack.thumbnail;
        navigator.mediaSession.metadata = new MediaMetadata({
          title: activeTrack.title || 'Unknown Title',
          artist: activeTrack.artist || 'Unknown Artist',
          album: activeTrack.album || 'Single',
          artwork: coverImg ? [
            { src: getMediaUrl(coverImg), sizes: '512x512', type: 'image/jpeg' },
            { src: getMediaUrl(coverImg), sizes: '512x512', type: 'image/png' }
          ] : []
        });

        navigator.mediaSession.setActionHandler('play', () => usePlayerStore.getState().togglePlay());
        navigator.mediaSession.setActionHandler('pause', () => usePlayerStore.getState().togglePlay());
        navigator.mediaSession.setActionHandler('previoustrack', () => usePlayerStore.getState().prevTrack());
        navigator.mediaSession.setActionHandler('nexttrack', () => usePlayerStore.getState().nextTrack());
      }
    } else {
      audioRef.current.src = '';
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = null;
      }
      lastFilepathRef.current = '';
      setTimeout(() => {
        setDuration(0);
        if (timeTextRef.current) timeTextRef.current.innerText = '0:00';
        if (progressBarFillRef.current) progressBarFillRef.current.style.width = '0%';
        if (progressThumbRef.current) progressThumbRef.current.style.left = '0%';
      }, 0);
    }
  }, [activeTrack, isPlaying]);

  // Sync volume and mute state
  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.volume = volume;
    audioRef.current.muted = muted;
  }, [volume, muted]);

  // Persist current session to localStorage
  const saveSession = useCallback((currentTimeSec) => {
    // If we are currently restoring a session, do not overwrite it with 0
    if (usePlayerStore.getState().savedPosition > 0) return;

    // Disabled session persistence as per user request to always start fresh
    // and prevent the same song from auto-loading on startup.
  }, []);

  // Save session whenever key playback state changes
  useEffect(() => {
    saveSession(audioRef.current?.currentTime ?? 0);
  }, [activeTrack, isPlaying, saveSession]);

  // Save session on window close / reload
  useEffect(() => {
    const handleBeforeUnload = () => {
      saveSession(audioRef.current?.currentTime ?? 0);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveSession]);

  // Expose audio ref globally
  useEffect(() => {
    if (audioRef.current) {
      window.aetherAudioElement = audioRef.current;
    }
  }, []);

  // Fast path animation loop for progress bar
  useEffect(() => {
    const updateProgress = () => {
      if (audioRef.current && !isSeeking) {
        const ct = audioRef.current.currentTime;
        let dur = duration || audioRef.current.duration;
        if (!dur || !isFinite(dur)) dur = usePlayerStore.getState().activeTrack?.duration || 0;

        if (timeTextRef.current) {
          timeTextRef.current.innerText = formatTime(ct);
        }

        if (progressBarFillRef.current && dur > 0) {
          const percent = (ct / dur) * 100;
          progressBarFillRef.current.style.width = `${percent}%`;
          if (progressThumbRef.current) {
            progressThumbRef.current.style.left = `${percent}%`;
          }
          if (progressGlowRef.current) {
            progressGlowRef.current.style.width = `${percent}%`;
          }
        }

        // Update Zustand progress state (throttled to 80ms for accurate lyrics sync)
        const progressNow = Date.now();
        if (progressNow - lastProgressUpdateRef.current > 80) {
          lastProgressUpdateRef.current = progressNow;
          usePlayerStore.setState({ progress: ct });
        }

        // Save session logic (throttled to 5 seconds)
        const now = Date.now();
        if (now - lastSaveRef.current > 5000 && activeTrack) {
          lastSaveRef.current = now;
          saveSession(ct);
        }
      }
      rafRef.current = requestAnimationFrame(updateProgress);
    };

    if (isPlaying) {
      rafRef.current = requestAnimationFrame(updateProgress);
    } else {
      // Run once when paused to sync
      updateProgress();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, isSeeking, duration, activeTrack, saveSession]);

  const handleTimeUpdate = () => {
    // Left empty, updates are handled by requestAnimationFrame now
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      let d = audioRef.current.duration;
      if (!d || !isFinite(d)) d = usePlayerStore.getState().activeTrack?.duration || 0;
      setDuration(d);
      // Seek to saved position after restore
      if (savedPosition && savedPosition > 0) {
        audioRef.current.currentTime = savedPosition;
        clearSavedPosition();
      }
    }
  };

  const handleEnded = () => {
    const state = usePlayerStore.getState();
    const { repeatMode, decrementRepeatMode, nextTrack } = state;

    if (repeatMode > 0) {
      decrementRepeatMode();
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch((err) => console.error(err));
      }
    } else {
      nextTrack();
    }
  };

  // --- Smooth Drag-to-Seek Logic ---
  const updateSeekPosition = (clientX, updateAudio = false) => {
    let dur = duration || audioRef.current?.duration;
    if (!dur || !isFinite(dur)) dur = usePlayerStore.getState().activeTrack?.duration || 0;
    if (!progressBarRef.current || !dur) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const width = rect.width;
    const percentage = Math.max(0, Math.min(1, clickX / width));
    const newTime = percentage * dur;

    if (timeTextRef.current) timeTextRef.current.innerText = formatTime(newTime);
    if (progressBarFillRef.current) progressBarFillRef.current.style.width = `${percentage * 100}%`;
    if (progressThumbRef.current) progressThumbRef.current.style.left = `${percentage * 100}%`;
    if (progressGlowRef.current) progressGlowRef.current.style.width = `${percentage * 100}%`;

    dragTimeRef.current = newTime;

    if (updateAudio && audioRef.current && !isNaN(newTime)) {
      try {
        audioRef.current.currentTime = newTime;
      } catch (err) {
        console.warn('Seek error:', err);
      }
    }
  };

  const handleSeekMouseDown = (e) => {
    let dur = duration || audioRef.current?.duration;
    if (!dur || !isFinite(dur)) dur = usePlayerStore.getState().activeTrack?.duration || 0;
    if (!audioRef.current || !dur) return;
    e.preventDefault();
    setIsSeeking(true);

    const clientX = getClientX(e);
    updateSeekPosition(clientX, false); // Seek visually only

    const handleMouseMove = (moveEvent) => {
      updateSeekPosition(getClientX(moveEvent), false); // Seek visually only
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleMouseMove);
      document.removeEventListener('touchend', handleMouseUp);

      try {
        if (audioRef.current && !isNaN(dragTimeRef.current)) {
          audioRef.current.currentTime = dragTimeRef.current;
        }
      } catch (err) {
        console.warn('Seek error on mouse up:', err);
      } finally {
        setIsSeeking(false);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchmove', handleMouseMove, { passive: true });
    document.addEventListener('touchend', handleMouseUp, { passive: true });
  };

  // --- Smooth Drag-to-Volume Logic ---
  const updateVolumePosition = (clientX) => {
    if (!volumeBarRef.current) return;
    const rect = volumeBarRef.current.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const width = rect.width;
    const vol = Math.max(0, Math.min(1, clickX / width));
    setVolume(vol);
    if (muted) setMuted(false);
  };

  const handleVolumeMouseDown = (e) => {
    e.preventDefault();
    setIsDraggingVolume(true);

    const clientX = getClientX(e);
    updateVolumePosition(clientX);

    const handleMouseMove = (moveEvent) => {
      updateVolumePosition(getClientX(moveEvent));
    };

    const handleMouseUp = () => {
      setIsDraggingVolume(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleMouseMove);
      document.removeEventListener('touchend', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchmove', handleMouseMove, { passive: true });
    document.addEventListener('touchend', handleMouseUp, { passive: true });
  };



  const toggleVisualizer = () => {
    if (activeView === 'visualizer') {
      goBackView();
    } else {
      setActiveView('visualizer');
      // Create/Resume AudioContext inside the user gesture stack
      if (window.ensureAetherAudioContext) {
        window.ensureAetherAudioContext();
      }
    }
  };

  const progressPercent = 0; // Updated exclusively by requestAnimationFrame

  const lastErrorRef = useRef(0);

  const handleError = (e) => {
    const state = usePlayerStore.getState();
    // If there is no active track, ignore any audio element source errors on mount
    if (!state.activeTrack) return;

    console.error('Audio playback error:', e);

    const isStream = state.activeTrack.isStream || state.activeTrack.filepath?.startsWith('yt-stream://');

    if (isStream && window.electron) {
      console.log("Attempting to refresh expired stream URL on error event...");
      window.electron.ytGetStreamUrl(state.activeTrack.id || state.activeTrack.videoId).then(result => {
        if (result && result.success && result.url) {
          const currentPos = audioRef.current.currentTime || 0;
          usePlayerStore.setState(s => ({
            activeTrack: { ...s.activeTrack, filepath: result.url }
          }));
          setTimeout(() => {
            if (audioRef.current) {
              audioRef.current.currentTime = currentPos;
              if (usePlayerStore.getState().isPlaying) {
                audioRef.current.play().catch(err => console.error("Retry play failed:", err));
              }
            }
          }, 100);
        } else {
          state.nextTrack();
        }
      });
      return;
    }

    // Debounce: prevent rapid auto-skipping if multiple tracks fail in a row
    const now = Date.now();
    if (now - lastErrorRef.current < 3000) {
      console.warn('Playback error throttled — stopping to prevent infinite skip loop');
      state.togglePlay(); // Just stop playback
      return;
    }
    lastErrorRef.current = now;

    // Gracefully skip to the next track if the current track file becomes unavailable (e.g. deleted)
    if (state.queue && state.queue.length > 1) {
      state.nextTrack();
    } else {
      state.togglePlay();
    }
  };

  return (
    <div
      onMouseEnter={() => isHoveringBarRef.current = true}
      onMouseLeave={() => isHoveringBarRef.current = false}
      className={`absolute bottom-0 left-0 right-0 w-full rounded-t-3xl px-6 md:px-8 py-3.5 flex items-center justify-between gap-4 md:gap-6 z-50 select-none transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${activeView === 'visualizer' ? 'opacity-0 pointer-events-none translate-y-12 scale-95' :
          isIdle ? 'opacity-0 pointer-events-none translate-y-full scale-95' : 'opacity-100 translate-y-0 scale-100'
        }`}
      style={{ backgroundColor: dominantColor ? `hsl(${dominantColor.h}, ${dominantColor.s}%, ${Math.max(40, dominantColor.l - 5)}%)` : '#FF4F6E' }}>
      <audio
        ref={audioRef}
        preload="auto"
        crossOrigin="anonymous"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        onError={handleError}
      />

      {/* Left section: Artwork + Song info + Favorite */}
      <div className="flex items-center gap-4 w-1/4 min-w-[220px]">
        <div
          onClick={toggleVisualizer}
          className="w-14 h-14 rounded-xl bg-white/5 border border-white/10 flex-shrink-0 cursor-pointer overflow-hidden relative group/art"
          title="Toggle Canvas Visualizer"
        >
          {currentSong.artwork_path || currentSong.coverUrl || currentSong.thumbnail ? (
            <RetryImage
              src={getArtworkUrl(getHighResUrl(currentSong.artwork_path || currentSong.coverUrl || currentSong.thumbnail))}
              alt={currentSong.title}
              className="w-full h-full transition-transform duration-500 group-hover/art:scale-105"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-white/40">
              <Disc size={20} />
            </div>
          )}
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-bold text-white truncate max-w-[150px]">{currentSong.title}</span>
          <span className="text-xs text-gray-400 truncate max-w-[150px] mt-0.5">{currentSong.artist}</span>
        </div>
        <div className="flex items-center gap-1 text-white/80 ml-2 flex-shrink-0">
          <button
            onClick={() => activeTrack && toggleFavorite(activeTrack.id || activeTrack.videoId, undefined, activeTrack)}
            disabled={!activeTrack}
            className={`w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/20 hover:scale-105 active:scale-95 transition-all ${activeTrack?.favorite ? 'text-white' : 'text-white/80 hover:text-white'
              } disabled:opacity-30 disabled:cursor-not-allowed`}
            title="Favorite"
          >
            <Heart size={15} fill={activeTrack?.favorite ? 'currentColor' : 'none'} />
          </button>

          {activeTrack?.isStream && (
            <button
              onClick={() => usePlayerStore.getState().startDownload(activeTrack)}
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/20 text-white/80 hover:text-white transition-all active:scale-95"
              title="Download to library"
            >
              <CloudDownload size={14} />
            </button>
          )}
          <button
            onClick={toggleQueueSidebar}
            className={`w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/20 transition-all active:scale-95 ${isQueueSidebarOpen ? 'text-white bg-white/20' : 'text-white/80 hover:text-white'
              }`}
            title="Queue"
          >
            <ListMusic size={14} />
          </button>
        </div>
      </div>

      {/* Center section: Playback controls + Seek timeline */}
      <div className="flex-1 max-w-xl flex flex-col items-center gap-2">
        {/* Playback buttons */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShuffle(!shuffle)}
            className={`w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/20 transition-all ${shuffle ? 'text-white' : 'text-white/80 hover:text-white'
              }`}
            title="Shuffle"
          >
            <Shuffle size={14} />
          </button>

          <button
            onClick={prevTrack}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/20 text-white/80 hover:text-white transition-all active:scale-90"
            disabled={!queue || queue.length <= 1}
            title="Previous"
          >
            <SkipBack size={16} fill="currentColor" />
          </button>

          <button
            onClick={togglePlay}
            className="w-10 h-10 rounded-full border border-white text-white hover:bg-white/10 flex items-center justify-center transition-all"
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause size={16} fill="currentColor" />
            ) : (
              <Play size={16} fill="currentColor" className="ml-0.5" />
            )}
          </button>

          <button
            onClick={nextTrack}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/20 text-white/80 hover:text-white transition-all active:scale-90"
            disabled={!queue || queue.length <= 1}
            title="Next"
          >
            <SkipForward size={16} fill="currentColor" />
          </button>

          <button
            onClick={cycleRepeatMode}
            className={`w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/20 transition-all relative ${repeatMode > 0 ? 'text-white' : 'text-white/80 hover:text-white'
              }`}
            title="Repeat"
          >
            <Repeat size={14} />
            {repeatMode > 0 && (
              <span className="absolute -bottom-1 -right-1 text-[8px] font-extrabold text-white bg-[#141416] rounded-full w-3 h-3 flex items-center justify-center border border-white/10">
                {repeatMode}
              </span>
            )}
          </button>
        </div>

        {/* Timeline Seek bar */}
        <div className="flex items-center gap-3 w-full">
          <span ref={timeTextRef} className="font-display text-[10px] text-white/70 font-bold w-8 text-left">0:00</span>
          <div
            ref={progressBarRef}
            onMouseDown={handleSeekMouseDown}
            onTouchStart={handleSeekMouseDown}
            className="flex-1 h-6 flex items-center cursor-pointer group/seek"
          >
            <div className="w-full h-1 bg-white/10 group-hover/seek:bg-white/20 transition-colors rounded-full relative">
              {/* Soft diffused glow layer under the progress fill */}
              <div
                ref={progressGlowRef}
                className="progress-glow"
                style={{
                  backgroundColor: dominantColor
                    ? `hsl(${dominantColor.h}, ${Math.min(80, dominantColor.s + 10)}%, ${Math.max(50, dominantColor.l + 15)}%)`
                    : 'rgba(255, 255, 255, 0.5)',
                }}
              />
              <div
                ref={progressBarFillRef}
                className="h-full bg-white/85 rounded-full absolute top-0 left-0"
              />
              <div
                ref={progressThumbRef}
                className={`w-2.5 h-2.5 rounded-full bg-white absolute top-1/2 transition-all duration-150 ${isSeeking ? 'opacity-100 scale-110' : 'opacity-0 group-hover/seek:opacity-100'
                  }`}
                style={{
                  transform: 'translate(-50%, -50%)',
                  boxShadow: dominantColor
                    ? `0 0 8px 2px hsla(${dominantColor.h}, ${dominantColor.s}%, ${Math.max(50, dominantColor.l + 10)}%, 0.4)`
                    : '0 0 8px 2px rgba(255, 255, 255, 0.3)',
                }}
              />
            </div>
          </div>
          <span className="font-display text-[10px] text-white/70 font-bold w-8 text-right">{formatTime(duration)}</span>
        </div>
      </div>

      {/* Right section: Volume + Visualizer Toggle */}
      <div className="w-1/4 min-w-[220px] flex items-center justify-end gap-4">
        {/* Lyrics Button */}
        <button
          onClick={toggleLyricsSidebar}
          disabled={!activeTrack}
          className={`w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/20 hover:scale-110 active:scale-95 transition-all ${isLyricsSidebarOpen ? 'bg-white/20 text-white' : 'text-white/80 hover:text-white'
            } disabled:opacity-30 disabled:cursor-not-allowed`}
          title="Lyrics"
        >
          <AlignLeft size={15} />
        </button>

        {/* Playlist Menu Button & Popover */}
        <div className="relative flex items-center" ref={playlistMenuRef}>
          <button
            onClick={() => setShowPlaylistMenu(!showPlaylistMenu)}
            disabled={!activeTrack}
            className={`w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/20 hover:scale-110 active:scale-95 transition-all ${showPlaylistMenu ? 'bg-white/20 text-white' : 'text-white/80 hover:text-white'
              } disabled:opacity-30 disabled:cursor-not-allowed`}
            title="Add to Playlist"
          >
            <ListPlus size={15} />
          </button>

          <AnimatePresence>
            {showPlaylistMenu && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute bottom-12 right-0 md:left-1/2 md:-translate-x-1/2 w-56 max-h-[16rem] bg-black/60 backdrop-blur-3xl border border-white/10 rounded-2xl shadow-[0_20px_40px_rgba(0,0,0,0.5)] flex flex-col overflow-hidden z-[100]"
              >
                <div className="px-4 py-3 border-b border-white/10 bg-white/[0.02] flex items-center justify-between">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Add to Playlist</span>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-1.5 flex flex-col gap-0.5 max-h-40">
                  {customAlbums.length === 0 ? (
                    <div className="text-xs text-gray-500 text-center py-4">No playlists yet</div>
                  ) : (
                    customAlbums.map(album => (
                      <button
                        key={album.id}
                        onClick={() => handleAddToPlaylist(album.id)}
                        className="flex items-center justify-between w-full text-left px-3 py-2 rounded-xl hover:bg-white/10 transition-colors group"
                      >
                        <span className="text-sm font-medium text-gray-300 group-hover:text-white truncate pr-2">{album.name}</span>
                        {addedPlaylistId === album.id ? (
                          <Check size={14} className="text-green-400 flex-shrink-0" />
                        ) : null}
                      </button>
                    ))
                  )}
                </div>
                <div className="p-2 border-t border-white/10 bg-white/[0.02]">
                  <button
                    onClick={() => {
                      setShowPlaylistMenu(false);
                      setActiveView('albums');
                    }}
                    className="w-full py-2 rounded-xl text-xs font-bold text-white bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 transition-all shadow-sm"
                  >
                    Manage Playlists
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <button
          onClick={toggleVisualizer}
          className={`w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/20 hover:scale-105 active:scale-95 transition-all ${activeView === 'visualizer' ? 'text-white' : 'text-white/80 hover:text-white'
            }`}
          title="Canvas Visualizer"
        >
          <Maximize2 size={15} />
        </button>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setMuted(!muted)}
            className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/20 text-white/80 hover:text-white transition-all active:scale-95"
            title={muted ? "Unmute" : "Mute"}
          >
            {muted || volume === 0 ? <VolumeX size={15} /> : <Volume2 size={15} />}
          </button>
          <div
            ref={volumeBarRef}
            onMouseDown={handleVolumeMouseDown}
            onTouchStart={handleVolumeMouseDown}
            className="w-20 h-6 flex items-center cursor-pointer group/vol"
          >
            <div className="w-full h-1 bg-white/10 group-hover/vol:bg-white/20 transition-colors rounded-full relative">
              <div
                className="h-full bg-white/80 rounded-full absolute top-0 left-0"
                style={{ width: `${muted ? 0 : volume * 100}%` }}
              />
              <div
                className={`w-2.5 h-2.5 rounded-full bg-white shadow-md absolute top-1/2 transition-all duration-150 ${isDraggingVolume ? 'opacity-100 scale-110' : 'opacity-0 group-hover/vol:opacity-100'
                  }`}
                style={{ left: `${muted ? 0 : volume * 100}%`, transform: 'translate(-50%, -50%)' }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
