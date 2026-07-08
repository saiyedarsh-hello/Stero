import { usePlayerStore } from '../store/usePlayerStore';
import { useShallow } from 'zustand/react/shallow';
import { useState, useEffect, useRef } from 'react';

import {
  Radio,
  Library,
  ListMusic,
  Heart,
  ChevronLeft,
  ChevronRight,
  CloudDownload,
  ArrowDownToLine,
  X,
  Disc,
  Headphones,
  Flame,
  MoreHorizontal,
  Check,
  AlertCircle,
  Home,
  Sparkles
} from 'lucide-react';

const getMediaUrl = (path) => {
  if (!path) return '';
  if (path.startsWith('yt-stream://')) {
    return `http://127.0.0.1:8998/stream?videoId=${path.replace('yt-stream://', '')}`;
  }
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `media://local/?path=${encodeURIComponent(path)}`;
};

export default function Sidebar({ isCollapsed, onToggleCollapse }) {
  const [isDownloadsOpen, setIsDownloadsOpen] = useState(false);
  const {
    activeView,
    setActiveView,
    downloadState,
    cancelDownload,
    clearCompletedDownload,
    clearAllCompletedDownloads,
    dominantColor,
    activeTrack,
    queue,
    songs,
    playHistory,
    playTrack,
    nextTrack,
    prevTrack,
    isPlaying,
    selectedAlbumId,
    followedArtists
  } = usePlayerStore(useShallow(state => ({
    activeView: state.activeView,
    setActiveView: state.setActiveView,
    downloadState: state.downloadState,
    cancelDownload: state.cancelDownload,
    clearCompletedDownload: state.clearCompletedDownload,
    clearAllCompletedDownloads: state.clearAllCompletedDownloads,
    dominantColor: state.dominantColor,
    activeTrack: state.activeTrack,
    queue: state.queue,
    songs: state.songs,
    playHistory: state.playHistory,
    playTrack: state.playTrack,
    nextTrack: state.nextTrack,
    prevTrack: state.prevTrack,
    isPlaying: state.isPlaying,
    selectedAlbumId: state.selectedAlbumId,
    followedArtists: state.followedArtists
  })));

  const sidebarScrollRef = useRef(null);
  const sidebarContentRef = useRef(null);

  // Lenis removed from Sidebar to prevent scroll hijacking of clicks.
  // We rely on native CSS scroll behavior for the sidebar instead.

  const menuItems = [
    { id: 'music', label: 'Discover', icon: Radio },
    { id: 'for-you', label: 'For You', icon: Sparkles },
    { id: 'songs', label: 'My Library', icon: Library },
    { id: 'albums', label: 'Playlists', icon: ListMusic }
  ];

  // Removed Now Playing logic

  return (
    <aside
      className={`bg-transparent flex flex-col justify-between select-none relative z-30 transition-all duration-500 overflow-hidden will-change-[width] flex-shrink-0 ${isCollapsed ? 'w-20' : 'w-48'
        }`}
    >
      {/* Custom right border */}
      <div
        className={`absolute right-0 top-0 bottom-0 w-[1px] bg-white/8 transition-opacity duration-300 z-10 ${isCollapsed ? 'opacity-0' : 'opacity-100'}`}
      />

      <div
        ref={sidebarScrollRef}
        className={`h-full flex flex-col justify-start p-4 pt-8 flex-shrink-0 transition-all duration-500 overflow-y-auto hide-scrollbar ${isCollapsed ? 'w-20' : 'w-48'
          }`}
      >
        <div ref={sidebarContentRef} className="flex flex-col w-full min-h-full pb-48">
          {/* Top: Header Controls & Logo */}
          <div>
            {/* Sidebar Header Controls */}
            <div className={`flex items-center mb-4 transition-all duration-300 ${isCollapsed ? 'flex-col justify-center gap-4' : 'justify-between px-1'}`}>
              <button
                onClick={() => {
                  if (isCollapsed) onToggleCollapse(); // Auto-expand to show downloads
                  setIsDownloadsOpen(!isDownloadsOpen);
                }}
                className={`relative text-gray-400 hover:text-white p-1.5 rounded-xl hover:bg-white/5 border transition-all duration-300 flex items-center justify-center ${isDownloadsOpen ? 'border-white/10 bg-white/5 text-white shadow-[0_0_15px_rgba(255,255,255,0.05)]' : 'border-transparent'}`}
                title="Downloads"
              >
                <ArrowDownToLine size={16} className={`transition-transform duration-300 ${isDownloadsOpen ? 'scale-110' : ''}`} />
                {downloadState?.active?.length > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-blue-500 rounded-full border border-[#141416] shadow-[0_0_8px_rgba(59,130,246,0.8)] animate-pulse"></span>
                )}
              </button>
              <button
                onClick={onToggleCollapse}
                className="text-gray-400 hover:text-white p-1.5 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10 transition-all duration-300 active:scale-95 flex items-center justify-center group/collapse"
                title={isCollapsed ? "Expand Sidebar" : "Hide Sidebar"}
              >
                <ChevronLeft size={16} className={`transition-transform duration-300 group-hover/collapse:-translate-x-0.5 ${isCollapsed ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {/* Download Section (Toggleable) */}
            <div
              className={`transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden will-change-[max-height,opacity,margin] ${isDownloadsOpen ? 'max-h-[400px] opacity-100 mb-4' : 'max-h-0 opacity-0 mb-0 pointer-events-none'
                }`}
            >
              <div className={`bg-white/[0.05] border border-white/10 rounded-xl p-3 relative z-50 backdrop-blur-2xl transition-transform duration-500 ${isDownloadsOpen ? 'translate-y-0 scale-100' : '-translate-y-4 scale-95'}`}>
                <div className="flex justify-between items-center mb-2 px-1">
                  <span className="text-[9px] uppercase tracking-[0.15em] text-white/40 font-bold">Downloads</span>
                  {downloadState?.completed?.length > 0 && (
                    <button
                      onClick={clearAllCompletedDownloads}
                      className="text-[9px] text-gray-500 hover:text-white transition-colors font-semibold uppercase tracking-wider cursor-pointer"
                    >
                      Clear All
                    </button>
                  )}
                </div>
                {(downloadState?.active?.length > 0 || downloadState?.completed?.length > 0) ? (
                  <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1 hide-scrollbar">
                    {/* Active Downloads */}
                    {downloadState.active.map(job => {
                      const coverImg = job.thumbnail || job.coverUrl || job.artwork_path;
                      return (
                        <div key={job.videoId} className="flex items-center gap-2 mb-1 bg-black/20 p-2 rounded-lg border border-white/5">
                          {coverImg ? (
                            <img src={getMediaUrl(coverImg)} alt="" className="w-8 h-8 rounded object-cover" />
                          ) : (
                            <div className="w-8 h-8 rounded bg-white/10 flex items-center justify-center">
                              <CloudDownload size={14} className="text-gray-400" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-semibold text-white truncate">{job.title}</p>
                            <div className="flex justify-between items-center mt-0.5">
                              <p className="text-[9px] text-gray-400 truncate max-w-[70%]">{job.artist}</p>
                              <span className="text-[9px] text-blue-400 font-semibold">{Math.round(job.progress)}%</span>
                            </div>
                          </div>
                          <button
                            onClick={() => cancelDownload(job.videoId)}
                            className="p-1 text-gray-500 hover:text-red-400 hover:bg-white/10 rounded transition-colors cursor-pointer"
                            title="Cancel Download"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      );
                    })}

                    {/* Completed / Failed Downloads */}
                    {downloadState.completed?.map(job => {
                      const coverImg = job.thumbnail || job.coverUrl || job.artwork_path;
                      const isSuccess = job.status === 'completed';
                      return (
                        <div key={job.videoId} className="flex items-center gap-2 mb-1 bg-black/20 p-2 rounded-lg border border-white/5">
                          {coverImg ? (
                            <img src={getMediaUrl(coverImg)} alt="" className="w-8 h-8 rounded object-cover animate-fade-in" />
                          ) : (
                            <div className="w-8 h-8 rounded bg-white/10 flex items-center justify-center">
                              <CloudDownload size={14} className="text-gray-400" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-semibold text-white/70 truncate">{job.title}</p>
                            <div className="flex justify-between items-center mt-0.5">
                              <p className="text-[9px] text-gray-500 truncate max-w-[70%]">{job.artist}</p>
                              <span className={`text-[9px] font-semibold flex items-center gap-0.5 ${isSuccess ? 'text-green-400' : 'text-red-400'}`}>
                                {isSuccess ? (
                                  <>
                                    <Check size={10} strokeWidth={3} /> Done
                                  </>
                                ) : (
                                  <>
                                    <AlertCircle size={10} /> Failed
                                  </>
                                )}
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => clearCompletedDownload(job.videoId)}
                            className="p-1 text-gray-600 hover:text-white hover:bg-white/5 rounded transition-colors cursor-pointer"
                            title="Dismiss"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      );
                    })}

                    {downloadState.queue?.length > 0 && (
                      <div className="text-center text-[10px] text-gray-500 mt-1 font-medium">
                        +{downloadState.queue.length} in queue
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center text-[10px] text-gray-500 py-4 font-medium">
                    No downloads
                  </div>
                )}
              </div>
            </div>

            {/* Section: Menu */}
            <div className="mb-4">
              <span className={`text-[9px] uppercase tracking-[0.15em] text-white/40 font-bold block mb-2 px-3 transition-opacity duration-300 ${isCollapsed ? 'opacity-0 hidden' : 'opacity-100'}`}>Menu</span>
              <nav className="flex flex-col gap-1">
                {menuItems.map((item) => {
                  const Icon = item.icon;
                  const isYtAlbum = typeof selectedAlbumId === 'string';
                  const isActive = activeView === item.id ||
                    (item.id === 'dashboard' && activeView === 'visualizer') ||
                    (item.id === 'music' && activeView === 'album-detail' && isYtAlbum) ||
                    (item.id === 'for-you' && activeView === 'album-detail' && isYtAlbum) ||
                    (item.id === 'albums' && ((activeView === 'album-detail' && !isYtAlbum) || activeView === 'playlist-detail'));
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveView(item.id)}
                      className={`flex items-center ${isCollapsed ? 'justify-center p-2' : 'justify-start px-3 py-2'} rounded-xl text-sm font-medium transition-all duration-300 relative border group cursor-pointer ${isActive
                          ? 'border-transparent shadow-none'
                          : 'text-gray-400 border-transparent hover:text-white hover:bg-white/5 hover:translate-x-1'
                        }`}
                      style={isActive ? {
                        color: dominantColor ? `hsl(${dominantColor.h}, ${dominantColor.s}%, ${Math.max(60, dominantColor.l)}%)` : '#FF4F6E',
                        backgroundColor: dominantColor ? `hsla(${dominantColor.h}, ${dominantColor.s}%, ${Math.max(60, dominantColor.l)}%, 0.1)` : 'rgba(255, 79, 110, 0.1)'
                      } : {}}
                    >
                      <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'}`}>
                        <div className={`flex items-center justify-center flex-shrink-0 w-7 h-7 rounded-lg transition-transform duration-300 group-hover:scale-110 ${!isActive ? 'bg-transparent group-hover:bg-white/5' : 'bg-transparent'}`}>
                          <Icon size={14} strokeWidth={2.5} className={!isActive ? 'text-gray-400 group-hover:text-gray-200' : ''} style={isActive ? { color: dominantColor ? `hsl(${dominantColor.h}, ${dominantColor.s}%, ${Math.max(60, dominantColor.l)}%)` : '#FF4F6E' } : {}} />
                        </div>
                        {!isCollapsed && <span className="tracking-wide font-semibold whitespace-nowrap">{item.label}</span>}
                      </div>
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Section: Followed Artists */}
            {followedArtists && followedArtists.length > 0 && (
              <div className="mb-4">
                <span className={`text-[9px] uppercase tracking-[0.15em] text-white/40 font-bold block mb-2 px-3 transition-opacity duration-300 ${isCollapsed ? 'opacity-0 hidden' : 'opacity-100'}`}>Followed</span>
                <div className="flex flex-col gap-1">
                  {followedArtists.map((artist) => (
                    <button
                      key={artist.id || artist.browseId || artist.name}
                      onClick={() => {
                        setActiveView('artist-detail', { artist });
                      }}
                      className={`flex items-center ${isCollapsed ? 'justify-center p-2' : 'justify-start px-3 py-1.5'} rounded-xl hover:bg-white/5 cursor-pointer group transition-all duration-300 w-full ${activeView === 'artist-detail' ? '' : ''}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center flex-shrink-0 w-7 h-7 rounded-full overflow-hidden border border-white/10 transition-transform duration-300 group-hover:scale-110 bg-white/10">
                          {artist.imageUrl || artist.thumbnail ? (
                            <img src={getMediaUrl(artist.imageUrl || artist.thumbnail)} alt={artist.name} className="w-full h-full object-cover" />
                          ) : (
                            <Disc size={12} className="text-white/40" />
                          )}
                        </div>
                        {!isCollapsed && <span className="text-xs font-semibold text-gray-300 group-hover:text-white truncate max-w-[100px] whitespace-nowrap">{artist.name}</span>}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* Bottom: Widgets Stack */}
          <div className="mt-auto flex flex-col gap-4">
            {/* Widgets removed as per request */}

            {/* Invisible spacer to guarantee scroll clearance above the music player */}
            <div className="h-32 flex-shrink-0 pointer-events-none" />
          </div>
        </div>
      </div>
    </aside>
  );
}
