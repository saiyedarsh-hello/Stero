import { usePlayerStore } from '../store/usePlayerStore';
import { useShallow } from 'zustand/react/shallow';
import { Disc, ChevronRight } from 'lucide-react';
import React from 'react';

const getMediaUrl = (path) => {
  if (!path) return '';
  if (path.startsWith('yt-stream://')) {
    return `http://127.0.0.1:8998/stream?videoId=${path.replace('yt-stream://', '')}`;
  }
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `media://local/?path=${encodeURIComponent(path)}`;
};

export default function QueueSidebar() {
  const {
    isQueueSidebarOpen,
    toggleQueueSidebar,
    queue,
    activeTrack,
    playHistory,
    playTrack,
    dominantColor
  } = usePlayerStore(useShallow(state => ({
    isQueueSidebarOpen: state.isQueueSidebarOpen,
    toggleQueueSidebar: state.toggleQueueSidebar,
    queue: state.queue,
    activeTrack: state.activeTrack,
    playHistory: state.playHistory,
    playTrack: state.playTrack,
    dominantColor: state.dominantColor
  })));

  let upcomingTracks = [];
  if (queue && queue.length > 0) {
    const queueActiveIndex = queue.findIndex(t => t.id === activeTrack?.id);
    let start = queueActiveIndex !== -1 ? queueActiveIndex : 0;
    upcomingTracks = queue.slice(start);
  } else if (playHistory?.length > 0) {
    upcomingTracks = playHistory.slice(0, 10);
  }

  if (upcomingTracks.length === 0) {
    upcomingTracks.push({ title: 'No track playing', artist: 'Add songs to queue', coverUrl: null });
  }

  return (
    <aside 
      className={`bg-transparent flex flex-col justify-start select-none relative z-30 transition-all overflow-hidden will-change-[width,opacity] flex-shrink-0 ${
        !isQueueSidebarOpen ? 'w-0 opacity-0 pointer-events-none' : 'w-72 opacity-100'
      }`}
    >
      <div 
        className={`absolute left-0 top-0 bottom-0 w-[1px] bg-white/8 transition-opacity duration-300 z-10 ${!isQueueSidebarOpen ? 'opacity-0' : 'opacity-100'}`} 
      />

      <div className={`w-72 h-full flex flex-col justify-start p-4 pt-8 flex-shrink-0 transition-all will-change-[transform,opacity] overflow-y-auto hide-scrollbar ${
          !isQueueSidebarOpen ? 'opacity-0 translate-x-8 scale-95' : 'opacity-100 translate-x-0 scale-100'
        }`}
      >
        <div className="flex justify-between items-center mb-6 px-1">
          <span className="text-[10px] uppercase tracking-wider text-white/50 font-bold drop-shadow">Queue</span>
          <button 
            onClick={toggleQueueSidebar}
            className="text-gray-400 hover:text-white p-1.5 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10 transition-all duration-300 active:scale-95 flex items-center justify-center group"
            title="Hide Queue"
          >
            <ChevronRight size={16} className="transition-transform duration-300 group-hover:translate-x-0.5" />
          </button>
        </div>

        <div className="flex flex-col gap-2 pb-48">
          {upcomingTracks.map((track, i) => {
            const isPlayingThis = activeTrack?.id === track.id;
            let actualIndex = (i + 1).toString().padStart(2, '0');
            if (queue && queue.length > 0 && track.id) {
               const tIndex = queue.findIndex(t => t.id === track.id);
               if (tIndex !== -1) actualIndex = (tIndex + 1).toString().padStart(2, '0');
            }
            
            return (
              <div 
                key={track.id || i}
                className={`flex items-center group ${track.id ? 'cursor-pointer hover:bg-white/5' : ''} p-2 rounded-xl transition-colors ${isPlayingThis ? 'bg-white/5' : ''}`}
                onClick={() => {
                  if (track.id) playTrack(track, queue);
                }}
                style={{ '--theme-color': dominantColor ? `hsl(${dominantColor.h}, ${dominantColor.s}%, 65%)` : '#00F0FF' }}
              >
                <span className={`text-[10px] font-semibold w-6 text-center transition-colors ${isPlayingThis ? 'text-[var(--theme-color)]' : 'text-white/40 group-hover:text-white/80'}`}>{actualIndex}</span>
                
                <div className="w-10 h-10 rounded-lg overflow-hidden bg-white/10 flex-shrink-0 relative shadow-sm">
                  {track.coverUrl || track.artwork_path || track.thumbnail ? (
                    <img src={getMediaUrl(track.coverUrl || track.artwork_path || track.thumbnail)} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center"><Disc size={14} className="text-white/40" /></div>
                  )}
                  {isPlayingThis && (
                    <div className="absolute inset-0 ring-1 ring-inset ring-[var(--theme-color)] rounded-lg" />
                  )}
                </div>
                
                <div className="flex flex-col ml-3 flex-1 min-w-0">
                  <span className={`text-xs font-semibold truncate transition-colors ${isPlayingThis ? 'text-[var(--theme-color)]' : 'text-white group-hover:text-[var(--theme-color)]'}`}>{track.title}</span>
                  <span className="text-[10px] text-white/50 truncate mt-0.5">{track.artist}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
