import { useEffect, useState, useRef, useCallback, lazy, Suspense } from 'react';
import { usePlayerStore } from './store/usePlayerStore';
import { useShallow } from 'zustand/react/shallow';
import Lenis from 'lenis';
import Sidebar from './components/Sidebar';
import PlayerBar from './components/PlayerBar';
import WindowControls from './components/WindowControls';
import MusicSection from './components/MusicSection';
import { Search, ChevronLeft, ChevronRight, RefreshCw, Menu, FolderSearch, X, Clock, Home } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import ColorWorker from './workers/colorWorker.js?worker&inline';

// ===== TOAST NOTIFICATION SYSTEM =====
let toastId = 0;
const TOAST_DURATION = 1500;
const TOAST_EXIT_MS = 300;

const getMediaUrl = (path) => {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `media://local/?path=${encodeURIComponent(path)}`;
};

const Visualizer = lazy(() => import('./components/Visualizer'));
const SongList = lazy(() => import('./components/SongList'));
const AlbumGrid = lazy(() => import('./components/AlbumGrid'));
const EditTrackModal = lazy(() => import('./components/EditTrackModal'));
const EditPlaylistModal = lazy(() => import('./components/EditPlaylistModal'));
// Global helper to initialize/resume the audio context inside user gestures
if (typeof window !== 'undefined') {
  window.ensureAetherAudioContext = () => {
    const audio = window.aetherAudioElement;
    if (!audio) {
      console.warn('ensureAetherAudioContext: window.aetherAudioElement not found');
      return null;
    }

    if (!window.aetherVisualizerData) {
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        const audioCtx = new AudioContextClass();
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;

        const source = audioCtx.createMediaElementSource(audio);
        source.connect(analyser);
        analyser.connect(audioCtx.destination);

        window.aetherVisualizerData = {
          audioCtx,
          analyser
        };
        console.log('ensureAetherAudioContext: Created and connected AudioContext successfully.');
      } catch (err) {
        console.error('ensureAetherAudioContext: Failed to initialize AudioContext:', err);
      }
    }

    if (window.aetherVisualizerData && window.aetherVisualizerData.audioCtx) {
      const audioCtx = window.aetherVisualizerData.audioCtx;
      if (audioCtx.state === 'suspended') {
        audioCtx.resume()
          .then(() => console.log('ensureAetherAudioContext: Resumed AudioContext successfully.'))
          .catch((err) => console.warn('ensureAetherAudioContext: Failed to resume AudioContext:', err));
      }
    }

    return window.aetherVisualizerData;
  };
}

export default function App() {
  const {
    activeView,
    activeTrack,
    dominantColor,
    setDominantColor,
    searchQuery,
    setSearchQuery,
    fetchLibrary,
    setScanStatus,
    resyncFolder,
    scanFolder,
    scanStatus,
    editingSong,
    setEditingSong,
    editingPlaylist,
    setEditingPlaylist,
    nextTrack,
    prevTrack,
    volume,
    setVolume,
    muted,
    setMuted,
    togglePlay,
    historyIndex,
    viewHistory,
    goBackView,
    goForwardView,
    initDownloadListener,
    setActiveView
  } = usePlayerStore(useShallow(state => ({
    activeView: state.activeView,
    setActiveView: state.setActiveView,
    activeTrack: state.activeTrack,
    dominantColor: state.dominantColor,
    setDominantColor: state.setDominantColor,
    searchQuery: state.searchQuery,
    setSearchQuery: state.setSearchQuery,
    fetchLibrary: state.fetchLibrary,
    setScanStatus: state.setScanStatus,
    resyncFolder: state.resyncFolder,
    scanFolder: state.scanFolder,
    scanStatus: state.scanStatus,
    editingSong: state.editingSong,
    setEditingSong: state.setEditingSong,
    editingPlaylist: state.editingPlaylist,
    setEditingPlaylist: state.setEditingPlaylist,
    nextTrack: state.nextTrack,
    prevTrack: state.prevTrack,
    volume: state.volume,
    setVolume: state.setVolume,
    muted: state.muted,
    setMuted: state.setMuted,
    togglePlay: state.togglePlay,
    historyIndex: state.historyIndex,
    viewHistory: state.viewHistory,
    goBackView: state.goBackView,
    goForwardView: state.goForwardView,
    initDownloadListener: state.initDownloadListener
  })));

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const scrollWrapperRef = useRef(null);
  const scrollContentRef = useRef(null);

  // ===== TOAST STATE =====
  const [toasts, setToasts] = useState([]);
  const toastTimersRef = useRef({});

  const showToast = useCallback((icon, message) => {
    const id = ++toastId;
    setToasts((prev) => {
      // Keep only last 2 toasts to avoid stacking too many
      const trimmed = prev.length >= 2 ? prev.slice(-1) : prev;
      return [...trimmed, { id, icon, message, exiting: false }];
    });

    // Start exit animation after TOAST_DURATION
    toastTimersRef.current[id] = setTimeout(() => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
      );
      // Remove from DOM after exit animation completes
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        delete toastTimersRef.current[id];
      }, TOAST_EXIT_MS);
    }, TOAST_DURATION);
  }, []);

  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [searchHistory, setSearchHistory] = useState(() => {
    try {
      const saved = localStorage.getItem('stero_search_history');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const addToHistory = (query) => {
    if (!query || !query.trim()) return;
    const trimmed = query.trim();
    setSearchHistory(prev => {
      const filtered = prev.filter(item => item.toLowerCase() !== trimmed.toLowerCase());
      const updated = [trimmed, ...filtered].slice(0, 10);
      localStorage.setItem('stero_search_history', JSON.stringify(updated));
      return updated;
    });
  };

  const removeFromHistory = (query) => {
    setSearchHistory(prev => {
      const updated = prev.filter(item => item !== query);
      localStorage.setItem('stero_search_history', JSON.stringify(updated));
      return updated;
    });
  };

  const clearAllHistory = () => {
    setSearchHistory([]);
    localStorage.removeItem('stero_search_history');
  };

  // Global dominant color extraction via Web Worker to prevent UI blocking
  const colorWorkerRef = useRef(null);


  useEffect(() => {
    try {
      colorWorkerRef.current = new ColorWorker();
    } catch (e) {
      console.warn('Failed to initialize inline ColorWorker, falling back to standard worker:', e);
      try {
        colorWorkerRef.current = new Worker(new URL('./workers/colorWorker.js', import.meta.url), { type: 'module' });
      } catch (err) {
        console.error('Failed to initialize standard ColorWorker:', err);
      }
    }
    return () => {
      colorWorkerRef.current?.terminate();
    };
  }, []);

  useEffect(() => {
    const activeCover = activeTrack?.artwork_path || activeTrack?.coverUrl || activeTrack?.thumbnail;
    if (!activeTrack || !activeCover) {
      setDominantColor({ h: 260, s: 40, l: 8 });
      return;
    }

    const url = getMediaUrl(activeCover);
    if (colorWorkerRef.current) {
      colorWorkerRef.current.onmessage = (e) => {
        if (e.data.error) {
          console.error('Failed to extract dominant color in worker:', e.data.error);
          setDominantColor({ h: 260, s: 40, l: 8 });
        } else {
          setDominantColor(e.data);
        }
      };
      colorWorkerRef.current.postMessage({ url });
    }
  }, [activeTrack, setDominantColor]);

  // Initialize Lenis for premium smooth momentum scrolling
  useEffect(() => {
    if (!scrollWrapperRef.current || !scrollContentRef.current) return;

    const lenis = new Lenis({
      wrapper: scrollWrapperRef.current,
      content: scrollContentRef.current,
      lerp: 0.08,
      duration: 1.2,
      smoothWheel: true,
      wheelMultiplier: 1.2,
    });

    let rafId;
    function raf(time) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }

    rafId = requestAnimationFrame(raf);

    return () => {
      lenis.destroy();
      cancelAnimationFrame(rafId);
    };
  }, []);

  // Global keyboard shortcuts for playback and volume controls
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Prevent shortcut conflicts when focus is on text inputs/textareas
      if (
        e.target.tagName === 'INPUT' ||
        e.target.tagName === 'TEXTAREA' ||
        e.target.isContentEditable
      ) {
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevTrack();
        showToast('⏮', 'Previous track');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextTrack();
        showToast('⏭', 'Next track');
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const newVol = Math.min(1, volume + 0.05);
        setVolume(newVol);
        if (muted) setMuted(false);
        showToast('🔊', `Volume ${Math.round(newVol * 100)}%`);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const newVol = Math.max(0, volume - 0.05);
        setVolume(newVol);
        if (muted) setMuted(false);
        showToast('🔉', `Volume ${Math.round(newVol * 100)}%`);
      } else if (e.key === ' ') {
        e.preventDefault();
        const wasPlaying = usePlayerStore.getState().isPlaying;
        togglePlay();
        showToast(wasPlaying ? '⏸' : '▶', wasPlaying ? 'Paused' : 'Playing');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [nextTrack, prevTrack, volume, muted, setVolume, setMuted, togglePlay, showToast]);

  useEffect(() => {
    // Initial fetch of library data (songs and playlists)
    fetchLibrary();
    initDownloadListener();

    // Auto-resync the saved music folder on every app launch
    resyncFolder();

    if (!window.electron) return;

    // Register electron IPC listener for directory scans
    const unsubscribe = window.electron.onScanProgress((progress) => {
      setScanStatus(progress);

      // If completed, fetch the fresh list of songs
      if (progress.status === 'completed') {
        fetchLibrary();
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [fetchLibrary, setScanStatus, resyncFolder]);

  // Clear search query when changing views
  useEffect(() => {
    setSearchQuery('');
  }, [activeView, setSearchQuery]);

  // Determine active component in main view panel
  const renderActiveView = () => {
    switch (activeView) {
      case 'music':
        return <MusicSection />;
      case 'songs':
      case 'favorites':
      case 'playlist-detail':
      case 'album-detail':
        return <SongList />;
      case 'albums':
        return <AlbumGrid />;
      case 'visualizer':
        return <SongList />;
      default:
        return <SongList />;
    }
  };

  const getSearchPlaceholder = () => {
    if (activeView === 'albums') return 'Search playlists...';
    return 'Search songs, playlists...';
  };

  const appBgStyle = {
    backgroundColor: '#0B0D14', // Deep dark navy matching the design
  };

  // Live Search for YouTube Music View
  useEffect(() => {
    if (activeView !== 'music') return;

    if (!searchQuery.trim()) {
      usePlayerStore.getState().setYtSearchResults(null);
      usePlayerStore.getState().setYtArtistSearchResults(null);
      usePlayerStore.getState().setYtAlbumSearchResults(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        if (!window.electron) return;

        const [results, artistResults, albumResults] = await Promise.all([
          window.electron.ytSearch(searchQuery),
          window.electron.ytSearchTrending(searchQuery, 'artist'),
          window.electron.ytSearchAlbums(searchQuery)
        ]);

        if (results && results.length > 0) {
          const mappedResults = results.map(r => ({
            videoId: r.videoId,
            title: r.title,
            artist: r.artist,
            album: r.album,
            coverUrl: r.thumbnail,
            duration: r.duration?.seconds || r.duration || r.length || 0
          }));
          usePlayerStore.getState().setYtSearchResults(mappedResults);
        } else {
          usePlayerStore.getState().setYtSearchResults([]);
        }

        if (artistResults && artistResults.length > 0) {
          usePlayerStore.getState().setYtArtistSearchResults(artistResults);
        } else {
          usePlayerStore.getState().setYtArtistSearchResults([]);
        }

        if (albumResults && albumResults.length > 0) {
          usePlayerStore.getState().setYtAlbumSearchResults(albumResults);
        } else {
          usePlayerStore.getState().setYtAlbumSearchResults([]);
        }
      } catch (err) {
        console.error('Live search failed:', err);
      }
    }, 400); // 400ms debounce

    return () => clearTimeout(timer);
  }, [searchQuery, activeView]);

  const handleSearchKeyDown = async (e) => {
    if (e.key === 'Enter') {
      const queryToAdd = searchQuery;

      // Close dropdown with animation first
      setIsSearchFocused(false);
      e.currentTarget.blur();

      // Add to history after the exit animation completes (250ms)
      setTimeout(() => {
        if (queryToAdd.trim()) {
          addToHistory(queryToAdd);
        }
      }, 250);
    }
  };

  return (
    <div className="h-screen w-screen text-white flex flex-col justify-between overflow-hidden relative select-none font-sans transition-colors duration-1000 ease-in-out transform-gpu rounded-none border-none" style={appBgStyle}>
      {activeView !== 'visualizer' && (
        <>

          {/* Custom Window Controls */}
          <WindowControls />
        </>
      )}

      {/* Blurred Album Art Background */}
      <div
        className="absolute inset-0 bg-cover bg-center transition-all duration-1000 ease-in-out pointer-events-none opacity-40"
        style={{
          backgroundImage: (activeTrack?.artwork_path || activeTrack?.coverUrl || activeTrack?.thumbnail) ? `url("${getMediaUrl(activeTrack.artwork_path || activeTrack.coverUrl || activeTrack.thumbnail)}")` : 'none',
          filter: 'blur(65px) saturate(150%)',
          transform: 'scale(1.2) translate3d(0, 0, 0)',
          willChange: 'transform, opacity',
          zIndex: 0
        }}
      />



      {/* Upper Workspace Panel */}
      <div className="flex flex-1 w-full overflow-hidden relative z-10">

        {/* Collapsible Sidebar */}
        <div className="transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]">
          <Sidebar
            isCollapsed={isSidebarCollapsed}
            onToggleCollapse={() => setIsSidebarCollapsed(true)}
          />
        </div>

        {/* Center Workspace */}
        <div className={`flex-1 flex flex-col overflow-hidden bg-white/[0.02] transition-all duration-500`}>

          {/* Header Bar */}
          <header className="grid grid-cols-3 items-center pt-8 pb-4 pl-8 pr-[160px] border-b border-white/5 select-none flex-shrink-0 relative z-40">
            {/* Thin drag strip at the very top of the header for window dragging */}
            <div className="absolute top-0 left-0 right-0 h-6 window-drag" />
            {/* Left aligned: navigation controls */}
            <div className="flex items-center gap-6 justify-start">
              {/* Sidebar Expand Button (visible only when collapsed) */}
              {isSidebarCollapsed && (
                <button
                  onClick={() => setIsSidebarCollapsed(false)}
                  className="text-gray-400 hover:text-white p-2 rounded-lg hover:bg-white/10 flex items-center justify-center transition-all active:scale-95 animate-fade-in"
                  title="Expand Sidebar"
                >
                  <Menu size={20} />
                </button>
              )}

              {/* Chevrons Navigation Indicators */}
              <div className="flex gap-1.5">
                <button
                  onClick={goBackView}
                  disabled={historyIndex <= 0}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${historyIndex > 0
                    ? 'bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white cursor-pointer'
                    : 'bg-transparent text-gray-600 cursor-not-allowed'
                    }`}
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={goForwardView}
                  disabled={!viewHistory || historyIndex >= viewHistory.length - 1}
                  className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${viewHistory && historyIndex < viewHistory.length - 1
                    ? 'bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white cursor-pointer'
                    : 'bg-transparent text-gray-600 cursor-not-allowed'
                    }`}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            {/* Center aligned: Search field */}
            <div className="flex justify-center items-center gap-4 relative">
              {activeView !== 'visualizer' && (
                <>
                  <button
                    onClick={() => setActiveView('music')}
                    className={`p-2.5 rounded-full border border-white/10 transition-all duration-300 backdrop-blur-xl ${activeView === 'music' ? 'bg-white/10 text-white shadow-[0_0_15px_rgba(255,255,255,0.05)]' : 'bg-white/[0.03] text-gray-400 hover:bg-white/[0.08] hover:text-white'}`}
                    title="Home"
                  >
                    <Home size={18} strokeWidth={2.5} />
                  </button>
                  <div className="group flex items-center gap-3 bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 rounded-full px-6 py-2.5 w-[300px] xl:w-[400px] focus-within:!w-[550px] focus-within:border-white/30 focus-within:bg-white/[0.08] focus-within:shadow-[0_0_35px_rgba(168,85,247,0.15),0_0_15px_rgba(255,255,255,0.05)] transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] backdrop-blur-xl">
                    <Search size={18} className="text-gray-400 group-focus-within:text-white transition-colors duration-300" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onFocus={() => setIsSearchFocused(true)}
                      onBlur={() => {
                        setTimeout(() => setIsSearchFocused(false), 200);
                      }}
                      onKeyDown={handleSearchKeyDown}
                      placeholder={getSearchPlaceholder()}
                      className="select-text bg-transparent border-none outline-none w-full text-white placeholder-white/30 text-sm tracking-wide"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="text-gray-400 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Recent Searches Dropdown */}
                  <AnimatePresence>
                    {isSearchFocused && searchHistory.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: -10, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.96 }}
                        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                        className="absolute top-full mt-2 w-[300px] xl:w-[400px] group-focus-within:w-[550px] bg-black/22 border border-white/10 rounded-2xl overflow-hidden z-50 p-4 shadow-none"
                        style={{
                          width: 'var(--search-width, 100%)',
                          minWidth: '300px',
                          maxWidth: '550px',
                          backdropFilter: 'blur(22px)',
                          WebkitBackdropFilter: 'blur(20px)'
                        }}
                      >
                        <div className="flex items-center justify-between pb-3 border-b border-white/5 mb-2 px-1">
                          <div className="flex items-center gap-2 text-white/40">
                            <Clock size={12} />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Recent Searches</span>
                          </div>
                          <button
                            onMouseDown={(e) => {
                              e.preventDefault();
                            }}
                            onClick={clearAllHistory}
                            className="text-[10px] font-semibold text-gray-400 hover:text-white px-2.5 py-1 rounded-full border border-white/5 hover:border-white/10 bg-white/5 hover:bg-white/10 transition-all active:scale-95 cursor-pointer"
                          >
                            Clear all
                          </button>
                        </div>
                        <div className="flex flex-col gap-0.5 max-h-[240px] overflow-y-auto pr-1">
                          {searchHistory.map((item, idx) => (
                            <div
                              key={idx}
                              onMouseDown={(e) => {
                                e.preventDefault();
                              }}
                              className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-white/[0.04] transition-all group/item cursor-pointer"
                              onClick={() => {
                                setSearchQuery(item);
                                addToHistory(item);
                                setIsSearchFocused(false);
                              }}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <Search size={13} className="text-gray-500 group-hover/item:text-white/80 transition-colors" />
                                <span className="text-sm text-gray-300 group-hover/item:text-white truncate transition-all group-hover/item:translate-x-0.5">{item}</span>
                              </div>
                              <button
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeFromHistory(item);
                                }}
                                className="text-gray-500 hover:text-red-400 p-1 rounded-full hover:bg-white/10 transition-all opacity-0 group-hover/item:opacity-100"
                                title="Remove search"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </>
              )}
            </div>

            {/* Right aligned: Resync button */}
            <div className="flex justify-end gap-3">
              {activeView === 'songs' && (
                <>
                  <button
                    onClick={scanFolder}
                    disabled={scanStatus.status === 'scanning' || scanStatus.status === 'started'}
                    title="Change Music Folder"
                    className={`flex items-center justify-center w-8 h-8 rounded-full border transition-all duration-300 active:scale-95 ${scanStatus.status === 'scanning' || scanStatus.status === 'started'
                      ? 'bg-white/5 border-white/10 text-gray-500 cursor-not-allowed'
                      : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:border-white/25 hover:text-white shadow-sm'
                      }`}
                  >
                    <FolderSearch size={16} />
                  </button>

                  <button
                    id="resync-library-btn"
                    onClick={resyncFolder}
                    disabled={scanStatus.status === 'scanning' || scanStatus.status === 'started'}
                    title="Resync music library — scan folder for new files"
                    className={`flex items-center justify-center w-8 h-8 rounded-full border transition-all duration-300 active:scale-95 ${scanStatus.status === 'scanning' || scanStatus.status === 'started'
                      ? 'bg-white/5 border-white/10 text-gray-500 cursor-not-allowed'
                      : 'bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:border-white/25 hover:text-white shadow-sm'
                      }`}
                  >
                    <RefreshCw
                      size={16}
                      className={scanStatus.status === 'scanning' || scanStatus.status === 'started' ? 'animate-spin' : ''}
                    />
                  </button>
                </>
              )}
            </div>
          </header>

          {/* Invisible backdrop to dismiss search on click */}
          {isSearchFocused && (
            <div
              className="absolute inset-0 z-20 cursor-default"
              onMouseDown={() => {
                setIsSearchFocused(false);
                document.activeElement?.blur();
              }}
            />
          )}

          {/* Scrollable Main Content */}
          <main
            ref={scrollWrapperRef}
            className="flex-1 overflow-y-auto px-8 py-6 pb-36 relative z-10 transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
          >
            <div ref={scrollContentRef} className="w-full min-h-full relative">
              <Suspense fallback={
                <div className="flex flex-col gap-10 w-full min-h-[50vh] animate-fade-in p-4 pt-2">
                  <section>
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-48 h-6 bg-white/5 rounded animate-pulse" />
                      <div className="flex gap-2">
                        <div className="w-8 h-8 rounded-full bg-white/5 animate-pulse" />
                        <div className="w-8 h-8 rounded-full bg-white/5 animate-pulse" />
                      </div>
                    </div>
                    <div className="flex gap-6 overflow-hidden">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <div key={`skel-1-${i}`} className="flex flex-col gap-3 flex-shrink-0 w-44">
                          <div className="w-44 h-56 rounded-2xl bg-white/5 animate-pulse" />
                          <div className="flex flex-col gap-2 px-1">
                            <div className="w-3/4 h-4 bg-white/5 rounded animate-pulse" />
                            <div className="w-1/2 h-3 bg-white/5 rounded animate-pulse" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                  <section>
                    <div className="flex items-center justify-between mb-4 mt-4">
                      <div className="w-32 h-6 bg-white/5 rounded animate-pulse" />
                    </div>
                    <div className="flex flex-col gap-3">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={`skel-2-${i}`} className="w-full h-16 bg-white/5 rounded-2xl animate-pulse" />
                      ))}
                    </div>
                  </section>
                </div>
              }>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeView}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -15 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    className="w-full min-h-full"
                  >
                    {renderActiveView()}
                  </motion.div>
                </AnimatePresence>
              </Suspense>
            </div>
          </main>
        </div>

      </div>

      {/* Canvas Realtime Visualizer Screen Overlay */}
      {activeView === 'visualizer' && (
        <Suspense fallback={null}>
          <Visualizer />
        </Suspense>
      )}

      {/* Bottom Gradient Mask to fill space behind the floating player */}
      <div
        className="absolute bottom-0 left-0 right-0 h-40 pointer-events-none z-40 transition-colors duration-1000 ease-in-out"
        style={{
          background: dominantColor
            ? `linear-gradient(to top, hsl(${dominantColor.h}, ${dominantColor.s}%, ${Math.max(2, dominantColor.l - 8)}%) 0%, transparent 100%)`
            : 'linear-gradient(to top, #000 0%, transparent 100%)'
        }}
      />

      {/* Floating Capsule Player Controls */}
      <div className={`transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${isSearchFocused ? 'blur-[4px] opacity-40 pointer-events-none' : ''}`}>
        <PlayerBar />
      </div>

      {/* Global Edit Track Modal */}
      {editingSong && (
        <Suspense fallback={null}>
          <EditTrackModal
            song={editingSong}
            onClose={() => setEditingSong(null)}
          />
        </Suspense>
      )}

      {/* Global Edit Playlist Modal */}
      {editingPlaylist && (
        <Suspense fallback={null}>
          <EditPlaylistModal
            playlist={editingPlaylist}
            onClose={() => setEditingPlaylist(null)}
          />
        </Suspense>
      )}

      {/* Toast Notifications */}
      {toasts.length > 0 && (
        <div className="toast-container">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`toast-item ${toast.exiting ? 'toast-exit' : ''}`}
            >
              <span className="toast-icon">{toast.icon}</span>
              <span>{toast.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
