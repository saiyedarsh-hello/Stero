import React, { useEffect, useRef, useMemo } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useShallow } from 'zustand/react/shallow';
import { ChevronRight, Music, Loader2 } from 'lucide-react';

const parseLyrics = (lyricsText) => {
  if (!lyricsText) return [];
  const lines = lyricsText.split('\n');
  const parsed = [];
  
  const timeRegex = /\[(\d{2}):(\d{2})[.:](\d{2,3})\]/;
  const timeRegexSimple = /\[(\d{2}):(\d{2})\]/;
  
  lines.forEach(line => {
    const trimmedLine = line.trim();
    if (!trimmedLine) return;
    
    // Skip LRC metadata tags like [ar: Artist], [al: Album], etc.
    if (trimmedLine.match(/^\[(ar|al|ti|by|length|offset|re|ve):/i)) {
      return;
    }

    let match = trimmedLine.match(timeRegex);
    let time = null;
    let text = trimmedLine;
    
    if (match) {
      const minutes = parseInt(match[1]);
      const seconds = parseInt(match[2]);
      const milliseconds = parseInt(match[3]);
      time = minutes * 60 + seconds + (milliseconds / (match[3].length === 3 ? 1000 : 100));
      text = trimmedLine.replace(timeRegex, '').trim();
    } else {
      match = trimmedLine.match(timeRegexSimple);
      if (match) {
        const minutes = parseInt(match[1]);
        const seconds = parseInt(match[2]);
        time = minutes * 60 + seconds;
        text = trimmedLine.replace(timeRegexSimple, '').trim();
      }
    }
    
    if (text) {
      parsed.push({ time, text });
    }
  });
  
  const hasTime = parsed.some(x => x.time !== null);
  if (!hasTime) return parsed;

  return parsed.sort((a, b) => {
    if (a.time === null && b.time === null) return 0;
    if (a.time === null) return 1;
    if (b.time === null) return -1;
    return a.time - b.time;
  });
};

export default function LyricsSidebar() {
  const {
    isLyricsSidebarOpen,
    toggleLyricsSidebar,
    activeTrack,
    activeTrackLyrics,
    fetchActiveTrackLyrics,
    progress,
    dominantColor
  } = usePlayerStore(useShallow(state => ({
    isLyricsSidebarOpen: state.isLyricsSidebarOpen,
    toggleLyricsSidebar: state.toggleLyricsSidebar,
    activeTrack: state.activeTrack,
    activeTrackLyrics: state.activeTrackLyrics,
    fetchActiveTrackLyrics: state.fetchActiveTrackLyrics,
    progress: state.progress,
    dominantColor: state.dominantColor
  })));

  const listRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const lastActiveIndexRef = useRef(-1);

  // Single fetch trigger: fetch when sidebar is open and data is missing for the current track.
  // The lyricsCache in the store means this is instant (no loading) for already-fetched tracks.
  useEffect(() => {
    if (activeTrack?.id && !activeTrackLyrics.data && !activeTrackLyrics.loading) {
      fetchActiveTrackLyrics();
    }
  }, [activeTrack?.id, isLyricsSidebarOpen]);

  const { parsedLyrics, isSynced } = useMemo(() => {
    const rawText = activeTrackLyrics?.data?.lyrics || '';
    const synced = activeTrackLyrics?.data?.isSynced || false;
    return {
      parsedLyrics: parseLyrics(rawText),
      isSynced: synced
    };
  }, [activeTrackLyrics]);

  // When lyrics load: if progress > 0, the activeLineIndex effect handles scrolling.
  // If progress is near 0, scroll to top.
  useEffect(() => {
    if (parsedLyrics.length === 0 || !scrollContainerRef.current) return;
    lastActiveIndexRef.current = -1; // reset so scroll fires on next render
    if (progress < 2) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [parsedLyrics]);

  // 350ms look-ahead: highlight the lyric just as you start to hear it
  const SYNC_OFFSET = 0.35;

  const activeLineIndex = useMemo(() => {
    if (!parsedLyrics || parsedLyrics.length === 0 || !isSynced) return -1;
    
    const effectiveProgress = progress + SYNC_OFFSET;
    let index = -1;
    for (let i = 0; i < parsedLyrics.length; i++) {
      if (parsedLyrics[i].time !== null && parsedLyrics[i].time <= effectiveProgress) {
        index = i;
      } else {
        break;
      }
    }
    return index;
  }, [parsedLyrics, progress, isSynced]);

  // Smooth scroll to keep active lyric centered within the scroll container
  useEffect(() => {
    if (
      activeLineIndex === -1 ||
      activeLineIndex === lastActiveIndexRef.current ||
      !listRef.current ||
      !scrollContainerRef.current
    ) return;

    lastActiveIndexRef.current = activeLineIndex;

    const activeEl = listRef.current.children[activeLineIndex];
    if (!activeEl) return;

    const container = scrollContainerRef.current;
    const list = listRef.current;

    // activeEl.offsetTop is relative to listRef (position:relative)
    // list.offsetTop is relative to the scroll container (also position:relative)
    const elTop = list.offsetTop + activeEl.offsetTop;
    const elHeight = activeEl.offsetHeight;
    const containerHeight = container.clientHeight;

    const targetScrollTop = elTop - (containerHeight / 2) + (elHeight / 2);

    container.scrollTo({
      top: Math.max(0, targetScrollTop),
      behavior: 'smooth'
    });
  }, [activeLineIndex]);

  const sidebarBg = useMemo(() => {
    if (!dominantColor) return 'rgba(15, 12, 25, 0.45)';
    return `radial-gradient(circle at top right, hsla(${dominantColor.h}, ${dominantColor.s}%, 15%, 0.55), transparent 85%), 
            radial-gradient(circle at bottom left, hsla(${dominantColor.h}, ${dominantColor.s}%, 5%, 0.75), transparent 85%),
            rgba(15, 12, 25, 0.65)`;
  }, [dominantColor]);

  const activeLineColor = useMemo(() => {
    if (!dominantColor) return 'hsl(180, 100%, 65%)';
    return `hsl(${dominantColor.h}, ${Math.max(50, dominantColor.s)}%, ${Math.max(60, dominantColor.l)}%)`;
  }, [dominantColor]);

  return (
    <aside 
      className={`flex flex-col justify-start select-none relative z-30 transition-all duration-500 overflow-hidden will-change-[width,opacity] flex-shrink-0 h-full ${
        !isLyricsSidebarOpen ? 'w-0 opacity-0 pointer-events-none' : 'w-80 opacity-100'
      }`}
      style={{
        background: sidebarBg,
        backdropFilter: 'blur(40px)',
        borderLeft: '1px solid rgba(255, 255, 255, 0.08)'
      }}
    >
      <div className={`w-80 h-full flex flex-col justify-start p-6 pt-8 flex-shrink-0 transition-all duration-500 will-change-[transform,opacity] ${
          !isLyricsSidebarOpen ? 'opacity-0 translate-x-8 scale-95' : 'opacity-100 translate-x-0 scale-100'
        }`}
      >
        <div className="flex justify-between items-center mb-6 px-1">
          <button 
            onClick={toggleLyricsSidebar}
            className="text-gray-400 hover:text-white p-1.5 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10 transition-all duration-300 active:scale-95 flex items-center justify-center group"
            title="Hide Lyrics"
          >
            <ChevronRight size={16} className="transition-transform duration-300 group-hover:translate-x-0.5" />
          </button>
          <span className="text-[10px] uppercase tracking-[0.2em] text-white/50 font-bold drop-shadow">Lyrics</span>
        </div>

        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto hide-scrollbar"
          style={{ overscrollBehavior: 'contain', position: 'relative' }}
        >
          {activeTrackLyrics.loading ? (
            <div className="flex flex-col items-center justify-center h-64 text-white/40 gap-3">
              <Loader2 className="animate-spin text-white/60" size={24} />
              <span className="text-xs font-semibold tracking-wide">Getting lyrics</span>
            </div>
          ) : activeTrackLyrics.error ? (
            <div className="flex flex-col items-center justify-center h-64 text-white/40 text-center px-4 gap-2">
              <Music size={32} className="opacity-50" />
              <span className="text-sm font-semibold">{activeTrackLyrics.error}</span>
              <span className="text-[10px] text-gray-500 max-w-[180px]">We couldn't find the lyrics for this song.</span>
            </div>
          ) : parsedLyrics.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-white/40 text-center px-4 gap-2">
              <Music size={32} className="opacity-50" />
              <span className="text-sm font-semibold">No Lyrics Available</span>
            </div>
          ) : (
            <div 
              ref={listRef} 
              className="flex flex-col gap-6 px-1 py-12 transition-all duration-300"
              style={{ position: 'relative' }}
            >
              {parsedLyrics.map((line, idx) => {
                const isActive = idx === activeLineIndex;
                const isPassed = isSynced && idx < activeLineIndex;
                return (
                  <p
                    key={idx}
                    className="text-base md:text-lg font-bold tracking-normal transition-all duration-500 text-left origin-left will-change-[transform,opacity,color]"
                    style={{
                      lineHeight: '2.0',
                      color: isActive 
                        ? activeLineColor 
                        : (isPassed ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.22)'),
                      transform: isActive ? 'scale(1.04)' : 'scale(1.0)',
                      textShadow: isActive ? `0 0 15px hsla(${dominantColor?.h || 180}, 95%, 60%, 0.3)` : 'none',
                      filter: isActive ? 'blur(0px)' : (isSynced ? 'blur(0.2px)' : 'none')
                    }}
                  >
                    {line.text}
                  </p>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
