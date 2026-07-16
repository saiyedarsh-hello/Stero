import { usePlayerStore } from '../store/usePlayerStore';
import { useShallow } from 'zustand/react/shallow';
import { Disc, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

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

const getTrackDuration = (track) => {
  if (!track) return '';
  if (typeof track.duration === 'string') return track.duration;
  if (typeof track.duration === 'number') return formatTime(track.duration);
  return '3:45';
};

const getAestheticGenres = (track) => {
  if (!track) return 'INDIE, ALTERNATIVE, POP';
  const artist = String(track.artist || '').toLowerCase();
  if (artist.includes('tame impala')) {
    return 'PSYCHEDELIC POP, ROCK, DISCO, SYNTH-POP';
  }
  if (artist.includes('daft punk')) {
    return 'ELECTRONIC, HOUSE, DISCO, FUNK';
  }
  if (artist.includes('weeknd')) {
    return 'R&B, SYNTH-POP, POP, DANCE';
  }
  if (artist.includes('billie eilish')) {
    return 'ALTERNATIVE, POP, DARKPOP, INDIE';
  }
  return 'ALTERNATIVE, INDIE, SYNTH-POP';
};

export default function QueueSidebar() {
  const {
    isQueueSidebarOpen,
    toggleQueueSidebar,
    queue,
    activeTrack,
    isPlaying,
    playTrack
  } = usePlayerStore(useShallow(state => ({
    isQueueSidebarOpen: state.isQueueSidebarOpen,
    toggleQueueSidebar: state.toggleQueueSidebar,
    queue: state.queue,
    activeTrack: state.activeTrack,
    isPlaying: state.isPlaying,
    playTrack: state.playTrack
  })));

  const circleRef = useRef(null);
  const dotRef = useRef(null);
  const timeTextRef = useRef(null);
  const [displayTracksLimit, setDisplayTracksLimit] = useState(8);

  // Sync animation frames for progress circle, dot, and time text
  useEffect(() => {
    if (!isQueueSidebarOpen) return;

    let rafId;
    const updateProgress = () => {
      const audio = window.aetherAudioElement;
      if (audio) {
        const ct = audio.currentTime;
        let dur = audio.duration;
        if (!dur || !isFinite(dur)) dur = activeTrack?.duration || 0;

        const progress = dur > 0 ? Math.min(Math.max(ct / dur, 0), 1) : 0;

        // Circumference of radius 185 is 2 * PI * 185 = 1162.39
        const circ = 1162.39;
        if (circleRef.current) {
          circleRef.current.style.strokeDashoffset = String(circ * (1 - progress));
        }

        if (dotRef.current) {
          const angle = progress * 2 * Math.PI - Math.PI / 2;
          const x = 200 + 185 * Math.cos(angle);
          const y = 200 + 185 * Math.sin(angle);
          dotRef.current.setAttribute('cx', String(x));
          dotRef.current.setAttribute('cy', String(y));
        }

        if (timeTextRef.current) {
          timeTextRef.current.innerText = `${formatTime(ct)} / ${formatTime(dur)}`;
        }
      }
      rafId = requestAnimationFrame(updateProgress);
    };

    rafId = requestAnimationFrame(updateProgress);
    return () => cancelAnimationFrame(rafId);
  }, [isQueueSidebarOpen, activeTrack]);

  // Keyboard escape to close queue screen overlay
  useEffect(() => {
    if (!isQueueSidebarOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') toggleQueueSidebar();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isQueueSidebarOpen, toggleQueueSidebar]);

  if (!isQueueSidebarOpen) return null;

  const currentTrackIndex = queue ? queue.findIndex(t => t.id === activeTrack?.id) : -1;
  const currentSongNum = currentTrackIndex !== -1 ? (currentTrackIndex + 1).toString().padStart(2, '0') : '01';



  const artistName = activeTrack?.artist || 'No Artist';
  let artistFontSizeClass = "text-[42px] sm:text-[54px] md:text-[68px] lg:text-[76px]";
  if (artistName.length > 24) {
    artistFontSizeClass = "text-[24px] sm:text-[28px] md:text-[36px] lg:text-[42px]";
  } else if (artistName.length > 12) {
    artistFontSizeClass = "text-[32px] sm:text-[38px] md:text-[48px] lg:text-[56px]";
  }

  const visibleTracks = queue ? queue.slice(0, displayTracksLimit) : [];

  return (
    <div 
      className="fixed inset-0 z-[100] bg-[#F5F5F3] text-[#111111] flex flex-col md:flex-row overflow-hidden font-sans select-none"
      style={{
        animation: 'fade-in 0.4s cubic-bezier(0.22, 1, 0.36, 1) forwards'
      }}
    >
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: scale(1.02); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes rotate-vinyl {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes bounce-bar {
          0%, 100% { height: 4px; }
          50% { height: 12px; }
        }
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>

      {/* Global Close Button */}
      <button 
        onClick={toggleQueueSidebar}
        className="absolute top-16 right-8 text-[#111111]/40 hover:text-[#111111] p-2.5 rounded-full border border-black/10 hover:bg-black/5 transition-all duration-300 active:scale-95 flex items-center justify-center z-[110]"
        title="Close Queue"
      >
        <X size={18} />
      </button>

      {/* Left Panel: revolving Vinyl Disk & Progress Circle */}
      <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 relative border-b md:border-b-0 md:border-r border-black/5 bg-[#F5F5F3]">
        
        {/* Large Circular Record Deck Container */}
        <div className="relative w-[350px] h-[350px] md:w-[460px] md:h-[460px] flex items-center justify-center">
          
          {/* Concentric Progress Track Circle Ring */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 400 400">
            {/* Background path */}
            <circle 
              cx="200" 
              cy="200" 
              r="185" 
              fill="none" 
              stroke="#E2E2DF" 
              strokeWidth="1.2" 
            />
            {/* Play progress path */}
            <circle 
              ref={circleRef}
              cx="200" 
              cy="200" 
              r="185" 
              fill="none" 
              stroke="#cf3c3c" 
              strokeWidth="1.8" 
              strokeDasharray="1162.39"
              strokeDashoffset="1162.39"
              transform="rotate(-90 200 200)"
              strokeLinecap="round"
              className="transition-[stroke-dashoffset] duration-75 ease-out"
            />
            {/* Playhead indicator dot */}
            <circle 
              ref={dotRef}
              cx="200" 
              cy="15" 
              r="6" 
              fill="#E23E3E" 
              stroke="#F5F5F3" 
              strokeWidth="1.5"
              className="shadow-sm transition-[cx,cy] duration-75 ease-out"
            />
          </svg>

          {/* High Fidelity Vinyl Disc */}
          <div 
            className="w-[305px] h-[305px] md:w-[400px] md:h-[400px] rounded-full shadow-[0_20px_50px_rgba(0,0,0,0.3)] flex items-center justify-center select-none relative overflow-hidden"
            style={{
              background: 'radial-gradient(circle, #2a2a2a 0%, #0d0d0d 6%, #1a1a1a 8%, #0a0a0a 12%, #1e1e1e 16%, #0b0b0b 22%, #1c1c1c 28%, #0c0c0c 34%, #202020 40%, #0f0f0f 46%, #1c1c1c 52%, #0e0e0e 58%, #222222 65%, #0a0a0a 72%, #1a1a1a 80%, #050505 100%)',
              animation: 'rotate-vinyl 14s linear infinite',
              animationPlayState: isPlaying ? 'running' : 'paused',
              transformStyle: 'preserve-3d'
            }}
          >
            {/* Vinyl record light highlight reflex overlay */}
            <div className="absolute inset-0 pointer-events-none opacity-[0.06] bg-[linear-gradient(45deg,transparent_45%,#fff_50%,transparent_55%)]" />

            {/* Inner Center Label */}
            <div className="w-[115px] h-[115px] md:w-[150px] md:h-[150px] rounded-full bg-[#F5F5F3] flex items-center justify-center relative shadow-inner border border-black/5">
              
              {/* Circular SVG Text curved along the label */}
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 120 120">
                <defs>
                  {/* Semicircular text path wrapping the top of the label */}
                  <path id="vinyl-label-path" d="M 16,60 A 44,44 0 1,1 104,60" fill="none" />
                </defs>
                <text className="fill-black/60 font-sans text-[8px] md:text-[8.5px] font-black tracking-[0.16em] uppercase">
                  <textPath href="#vinyl-label-path" startOffset="50%" textAnchor="middle">
                    {currentSongNum}. {activeTrack?.title || 'No Track'}
                  </textPath>
                </text>
              </svg>

              {/* Center Spindle Hole */}
              <div className="w-9 h-9 md:w-12 md:h-12 rounded-full bg-[#111111] flex items-center justify-center relative z-10 shadow-inner">
                {/* Bouncing visualizer inside spindle hole */}
                <div className="flex items-end justify-center gap-0.5 md:gap-1 h-4 md:h-5 w-7 md:w-9">
                  <div className="w-0.5 md:w-[3px] bg-[#E23E3E] rounded-full transition-all" style={{ animation: isPlaying ? 'bounce-bar 0.7s infinite 0.1s' : undefined, height: isPlaying ? undefined : '4px' }} />
                  <div className="w-0.5 md:w-[3px] bg-[#E23E3E] rounded-full transition-all" style={{ animation: isPlaying ? 'bounce-bar 0.5s infinite 0.3s' : undefined, height: isPlaying ? undefined : '8px' }} />
                  <div className="w-0.5 md:w-[3px] bg-[#E23E3E] rounded-full transition-all" style={{ animation: isPlaying ? 'bounce-bar 0.6s infinite 0.2s' : undefined, height: isPlaying ? undefined : '6px' }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Playback Time Indicator */}
        <span 
          ref={timeTextRef}
          className="mt-8 font-mono text-[11.5px] font-bold tracking-wider text-black/55 bg-black/5 px-4 py-1.5 rounded-full"
        >
          0:00 / 0:00
        </span>
      </div>

      {/* Right Panel: Editorial Track Details and Queue List */}
      <div className="flex-1 flex flex-col justify-start pt-6 px-6 pb-24 md:pt-10 md:px-10 md:pb-28 lg:pt-12 lg:px-12 lg:pb-32 overflow-hidden bg-[#F5F5F3]">
        


        {/* Mid Section: Artist & Dynamic Subtitle */}
        <div className="flex flex-col mb-6 select-text flex-shrink-0">
          <h1 className={`font-serif ${artistFontSizeClass} font-black uppercase leading-tight tracking-tight text-black select-text`}>
            {artistName}
          </h1>
          <p className="font-mono text-[9px] md:text-[10px] font-black tracking-[0.25em] text-[#E23E3E] uppercase mt-2">
            {getAestheticGenres(activeTrack)}
          </p>
        </div>

        {/* Bottom Section: Popular / Upcoming Queue List */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          <h3 className="font-serif text-sm font-bold uppercase tracking-[0.1em] text-black/80 mb-4 pb-2 border-b border-black/10 flex-shrink-0">
            POPULAR
          </h3>
          
          <div className="flex-1 flex flex-col gap-2.5 overflow-y-auto pr-1 hide-scrollbar">
            {visibleTracks.map((track, i) => {
              const isPlayingThis = activeTrack?.id === track.id;
              
              let actualIndex = (i + 1).toString().padStart(2, '0');
              if (queue && queue.length > 0 && track.id) {
                const tIndex = queue.findIndex(t => t.id === track.id);
                if (tIndex !== -1) actualIndex = (tIndex + 1).toString().padStart(2, '0');
              }

              const trackArt = track.coverUrl || track.artwork_path || track.thumbnail;

              return (
                <div 
                  key={track.id || i}
                  className={`flex items-center justify-between p-2.5 rounded-2xl hover:bg-black/5 transition-colors cursor-pointer group ${isPlayingThis ? 'bg-black/[0.03]' : ''}`}
                  onClick={() => {
                    if (track.id) playTrack(track, queue);
                  }}
                >
                  <div className="flex items-center min-w-0 flex-1">
                    {/* Active Track Highlight Indicator (Red dot next to index) */}
                    <div className="w-5 flex items-center justify-center flex-shrink-0">
                      {isPlayingThis ? (
                        <div className="w-1.5 h-1.5 rounded-full bg-[#E23E3E]" />
                      ) : (
                        <span className="text-[10px] font-mono font-bold text-black/35 group-hover:text-black/75 transition-colors">
                          {actualIndex}
                        </span>
                      )}
                    </div>

                    {/* Album Art Cover */}
                    <div className="w-11 h-11 rounded-xl overflow-hidden bg-black/5 flex-shrink-0 border border-black/5 ml-2 shadow-sm">
                      {trackArt ? (
                        <img 
                          src={getMediaUrl(trackArt)} 
                          alt={track.title} 
                          className="w-full h-full object-cover" 
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-black/10">
                          <Disc size={16} className="text-black/20 animate-spin" style={{ animationDuration: '10s' }} />
                        </div>
                      )}
                    </div>

                    {/* Title and details */}
                    <div className="flex flex-col ml-3.5 min-w-0 flex-1">
                      <span className={`text-[11.5px] font-black uppercase truncate tracking-wide ${isPlayingThis ? 'text-[#E23E3E]' : 'text-black group-hover:text-[#E23E3E]'} transition-colors`}>
                        {track.title || 'No Title'}
                      </span>
                      <span className="text-[9.5px] font-semibold text-black/45 truncate mt-1">
                        {track.artist || 'Unknown Artist'}
                      </span>
                    </div>
                  </div>

                  {/* Track Duration */}
                  <span className="text-[10.5px] font-mono font-bold text-black/45 pl-4 flex-shrink-0">
                    {getTrackDuration(track)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* View More Button */}
          {queue && queue.length > displayTracksLimit && (
            <div className="flex justify-end mt-4">
              <button 
                onClick={() => setDisplayTracksLimit(prev => Math.min(prev + 8, queue.length))}
                className="font-mono text-[10.5px] font-black tracking-widest text-[#E23E3E] hover:text-[#111111] transition-colors border-b border-[#E23E3E] hover:border-black pb-0.5 uppercase"
              >
                VIEW MORE
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
