import { useState, useEffect, useRef } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useShallow } from 'zustand/react/shallow';
import { X, Disc, Play, Pause, SkipBack, SkipForward, Music, Shuffle, Repeat, Volume2, VolumeX } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const formatTime = (seconds) => {
  if (isNaN(seconds) || seconds === null) return '0:00';
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

const getTrackArtwork = (imgUrl) => {
  if (!imgUrl) return '';
  return imgUrl.startsWith('http') 
    ? getArtworkUrl(getHighResUrl(imgUrl)) 
    : getMediaUrl(imgUrl);
};

// Static waveform heights for the integrated seek bar
const waveHeights = [25, 45, 30, 55, 75, 60, 40, 50, 75, 95, 80, 65, 45, 65, 85, 70, 50, 40, 60, 75, 55, 30, 45, 20];

export default function Visualizer() {
  const { 
    activeTrack, 
    activeView, 
    isPlaying,
    queue,
    playTrack,
    activePlaylistId,
    dominantColor,
    goBackView,
    togglePlay,
    nextTrack,
    prevTrack,
    shuffle,
    setShuffle,
    repeatMode,
    cycleRepeatMode,
    volume,
    setVolume,
    muted,
    setMuted
  } = usePlayerStore(useShallow(state => ({
    activeTrack: state.activeTrack,
    activeView: state.activeView,
    isPlaying: state.isPlaying,
    queue: state.queue,
    playTrack: state.playTrack,
    activePlaylistId: state.activePlaylistId,
    dominantColor: state.dominantColor,
    goBackView: state.goBackView,
    togglePlay: state.togglePlay,
    nextTrack: state.nextTrack,
    prevTrack: state.prevTrack,
    shuffle: state.shuffle,
    setShuffle: state.setShuffle,
    repeatMode: state.repeatMode,
    cycleRepeatMode: state.cycleRepeatMode,
    volume: state.volume,
    setVolume: state.setVolume,
    muted: state.muted,
    setMuted: state.setMuted
  })));

  const [isSeeking, setIsSeeking] = useState(false);
  const [duration, setDuration] = useState(0);

  const progressBarFillRef = useRef(null);
  const timeTextRef = useRef(null);
  const durationTextRef = useRef(null);

  const isActive = activeView === 'visualizer';

  // Handle Close
  const handleClose = () => {
    goBackView();
  };

  // Keyboard escape
  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive]);

  // Audio metadata listener to sync duration
  useEffect(() => {
    const audio = window.aetherAudioElement;
    if (!audio) return;

    let dur = audio.duration;
    if (!dur || !isFinite(dur)) dur = activeTrack?.duration || 0;
    setDuration(dur);

    const handleLoadedMetadata = () => {
      let d = audio.duration;
      if (!d || !isFinite(d)) d = activeTrack?.duration || 0;
      setDuration(d);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [activeTrack]);

  // Fast progress animation update loop
  useEffect(() => {
    let rafId;
    const updateProgress = () => {
      const audio = window.aetherAudioElement;
      if (audio && !isSeeking) {
        const ct = audio.currentTime;
        let dur = audio.duration;
        if (!dur || !isFinite(dur)) dur = activeTrack?.duration || 0;

        if (timeTextRef.current) {
          timeTextRef.current.innerText = formatTime(ct);
        }
        if (durationTextRef.current && dur > 0) {
          durationTextRef.current.innerText = formatTime(dur);
        }
        if (progressBarFillRef.current && dur > 0) {
          const percent = (ct / dur) * 100;
          progressBarFillRef.current.style.width = `${percent}%`;
        }
      }
      rafId = requestAnimationFrame(updateProgress);
    };

    if (isPlaying) {
      rafId = requestAnimationFrame(updateProgress);
    } else {
      updateProgress();
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [isPlaying, activeTrack, isSeeking]);

  // Seek click handler
  const handleProgressClick = (e) => {
    const audio = window.aetherAudioElement;
    if (!audio) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const percentage = Math.max(0, Math.min(1, clickX / rect.width));
    let dur = audio.duration;
    if (!dur || !isFinite(dur)) dur = activeTrack?.duration || 0;
    if (dur > 0) {
      audio.currentTime = percentage * dur;
    }
  };



  if (!activeTrack) return null;

  // Filter regional keywords from queue just like original code
  let coverflowTracks = [];
  if (queue && queue.length > 0) {
    const regionalKeywords = ['tamil', 'telugu', 'bengali', 'malayalam', 'kannada', 'bhojpuri', 'marathi', 'gujarati', 'assamese', 'odia'];
    coverflowTracks = queue.filter(track => {
      const t = (track.title || '').toLowerCase();
      const a = (track.artist || '').toLowerCase();
      return !regionalKeywords.some(kw => t.includes(kw) || a.includes(kw));
    });
  }

  if (coverflowTracks.length === 0 && activeTrack) {
    coverflowTracks = [activeTrack];
  }

  let activeIndex = coverflowTracks.findIndex(t => (t.id || t.videoId) === (activeTrack?.id || activeTrack?.videoId));
  if (activeIndex === -1) {
    coverflowTracks.unshift(activeTrack);
    activeIndex = 0;
  }

  const artistName = String(activeTrack?.artist || "UNKNOWN ARTIST");
  const title = String(activeTrack?.title || "NO TRACK");
  const imgUrl = activeTrack?.artwork_path || activeTrack?.coverUrl || activeTrack?.thumbnail;
  const highResImgUrl = getTrackArtwork(imgUrl);

  const accentColor = dominantColor 
    ? `hsl(${dominantColor.h}, ${Math.min(dominantColor.s + 15, 100)}%, 55%)` 
    : '#00f0ff';

  const accentGlowColor = dominantColor
    ? `hsla(${dominantColor.h}, ${dominantColor.s}%, 50%, 0.45)`
    : 'rgba(0, 240, 255, 0.35)';

  // 3D placement configurations based on offset from activeIndex
  const getCardStyles = (offset) => {
    switch (offset) {
      case -2:
        return {
          x: '-80%',
          scale: 0.72,
          rotateY: 55,
          z: -140,
          opacity: 0.4,
          zIndex: 10,
          pointerEvents: 'auto',
        };
      case -1:
        return {
          x: '-45%',
          scale: 0.88,
          rotateY: 35,
          z: -50,
          opacity: 0.75,
          zIndex: 20,
          pointerEvents: 'auto',
        };
      case 0:
        return {
          x: '0%',
          scale: 1.05,
          rotateY: 0,
          z: 100,
          opacity: 1,
          zIndex: 30,
          pointerEvents: 'auto',
        };
      case 1:
        return {
          x: '45%',
          scale: 0.88,
          rotateY: -35,
          z: -50,
          opacity: 0.75,
          zIndex: 20,
          pointerEvents: 'auto',
        };
      case 2:
        return {
          x: '80%',
          scale: 0.72,
          rotateY: -55,
          z: -140,
          opacity: 0.4,
          zIndex: 10,
          pointerEvents: 'auto',
        };
      default:
        // Render hidden offscreen
        return {
          x: offset < 0 ? '-140%' : '140%',
          scale: 0.5,
          rotateY: offset < 0 ? 60 : -60,
          z: -300,
          opacity: 0,
          zIndex: 0,
          pointerEvents: 'none',
        };
    }
  };

  // Boost color richness & prevent gray/flat backgrounds on low-saturation covers (like black & white covers)
  const adjustedS = dominantColor ? Math.max(dominantColor.s, 22) : 28; 
  const adjustedH = dominantColor ? dominantColor.h : 22; 
  const adjustedL = dominantColor ? Math.min(Math.max(dominantColor.l, 9), 16) : 10; 

  const bgStyle = {
    background: `radial-gradient(circle at center, 
      hsl(${adjustedH}, ${adjustedS}%, ${adjustedL}%) 0%, 
      hsl(${adjustedH}, ${Math.max(adjustedS - 8, 12)}%, 3%) 100%)`
  };

  return (
    <div 
      className={`absolute inset-0 z-50 flex flex-col items-center justify-between overflow-hidden font-sans transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] p-8 ${
        isActive ? 'opacity-100 pointer-events-auto scale-100' : 'opacity-0 pointer-events-none scale-98'
      }`}
      style={bgStyle}
    >
      <style>{`
        @keyframes bounce-bar {
          0%, 100% { height: 4px; }
          50% { height: 16px; }
        }
      `}</style>

      {/* Ambient background blur derived from active track artwork (softer blend & opacity for buttery smoothness) */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 select-none opacity-25 mix-blend-normal">
        {highResImgUrl ? (
          <img 
            src={highResImgUrl} 
            alt="background-artwork-mesh" 
            className="w-full h-full object-cover scale-[1.35] blur-[120px] saturate-[180%] select-none pointer-events-none transition-all duration-[1500ms] ease-in-out animate-mesh-drift"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[#1c1a26] to-[#0a0a0c] opacity-60" />
        )}
      </div>

      {/* Deep smooth vignette layer to eliminate gradient banding */}
      <div 
        className="absolute inset-0 pointer-events-none z-0 opacity-80"
        style={{
          background: 'radial-gradient(circle at center, transparent 35%, rgba(0, 0, 0, 0.75) 100%)'
        }}
      />

      {/* Noise overlay (Preserved from old visualizer) */}
      <div className="visualizer-noise" />

      {/* Top Bar: Close button */}
      <div className="w-full flex items-center justify-end relative z-20 mt-4 px-4">
        <button 
          onClick={handleClose} 
          className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center bg-white/5 hover:bg-white/10 hover:scale-105 active:scale-95 transition-all text-white/80 hover:text-white"
          title="Exit Visualizer"
        >
          <X size={18} />
        </button>
      </div>

      {/* 3D Coverflow Container */}
      <div 
        className="relative w-full flex-1 flex items-center justify-center pointer-events-auto"
        style={{ perspective: 1200, transformStyle: 'preserve-3d' }}
      >
        <AnimatePresence initial={false}>
          {coverflowTracks.map((track, idx) => {
            const offset = idx - activeIndex;
            if (Math.abs(offset) > 2) return null; // Render max 5 cards

            const isCenter = offset === 0;
            const trackArt = track.artwork_path || track.coverUrl || track.thumbnail;

            return (
              <motion.div
                key={track.id || track.videoId || idx}
                className="absolute w-[240px] sm:w-[280px] md:w-[320px] rounded-3xl overflow-hidden shadow-[0_30px_90px_-15px_rgba(0,0,0,0.85)] border border-white/10 flex flex-col bg-[#16151a]/95 backdrop-blur-2xl cursor-pointer"
                style={{ 
                  transformStyle: 'preserve-3d',
                  boxShadow: isCenter ? '0 35px 100px -15px rgba(0,0,0,0.9)' : '0 30px 90px -15px rgba(0,0,0,0.85)'
                }}
                animate={getCardStyles(offset)}
                transition={{ type: 'spring', stiffness: 220, damping: 26 }}
                onClick={() => {
                  if (isCenter) {
                    togglePlay();
                  } else {
                    playTrack(track, queue, activePlaylistId);
                  }
                }}
              >
                {/* Artwork */}
                <div className="aspect-square w-full relative overflow-hidden bg-black/40">
                  {trackArt ? (
                    <img
                      src={getTrackArtwork(trackArt)}
                      alt={track.title}
                      className="w-full h-full object-cover pointer-events-none select-none"
                    />
                  ) : (
                    <div className="w-full h-full bg-[#111] flex items-center justify-center">
                      <Disc size={80} className="text-white/10 animate-spin" style={{ animationDuration: isPlaying && isCenter ? '8s' : '0s' }} />
                    </div>
                  )}
                  {/* Subtle shadows & fresnel reflection overlay on artwork */}
                  <div 
                    className="absolute inset-0 mix-blend-multiply pointer-events-none"
                    style={{
                      background: 'radial-gradient(circle at 35% 35%, transparent 45%, rgba(0, 0, 0, 0.25) 75%, rgba(0, 0, 0, 0.5) 100%)'
                    }}
                  />
                  <div 
                    className="absolute inset-0 pointer-events-none mix-blend-color-dodge opacity-25"
                    style={{
                      background: dominantColor
                        ? `radial-gradient(circle at 65% 65%, rgba(0,0,0,0) 45%, hsla(${dominantColor.h}, ${dominantColor.s}%, 50%, 0.4) 100%)`
                        : 'radial-gradient(circle at 65% 65%, rgba(0, 0, 0, 0.15) 75%, rgba(0, 240, 255, 0.3) 100%)'
                    }}
                  />
                </div>

                {/* Bottom detail text area */}
                <div className="px-5 py-5 flex flex-col justify-center bg-gradient-to-b from-[#111014]/65 to-[#0b0a0d]/80 border-t border-white/5">
                  <span className="text-sm font-extrabold text-white text-center truncate max-w-full tracking-wide Satoshi font-display">
                    {track.artist || 'Unknown Artist'}
                  </span>
                  <span className="text-[10.5px] text-white/50 text-center truncate max-w-full mt-2 font-bold uppercase tracking-[0.08em] Satoshi">
                    {track.title || 'Unknown Title'}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Floating Glassmorphic Control Bar */}
      <div 
        className="flex items-center justify-between gap-6 px-7 py-4 bg-white/[0.03] border border-white/10 backdrop-blur-3xl rounded-[32px] shadow-[0_20px_50px_rgba(0,0,0,0.6)] z-30 select-none w-full max-w-[820px] relative mb-6"
        style={{
          boxShadow: '0 20px 50px rgba(0,0,0,0.6)'
        }}
      >
        {/* Left Section: Compact Playback Controls */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <button 
            onClick={prevTrack} 
            disabled={!queue || queue.length <= 1}
            className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 active:scale-95 transition-all text-white/80 hover:text-white flex items-center justify-center border border-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Previous"
          >
            <SkipBack size={15} fill="currentColor" />
          </button>
          <button 
            onClick={togglePlay} 
            className="w-11 h-11 rounded-full bg-white text-black hover:scale-105 active:scale-95 transition-all flex items-center justify-center shadow-lg"
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" className="ml-0.5" />}
          </button>
          <button 
            onClick={nextTrack} 
            disabled={!queue || queue.length <= 1}
            className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 active:scale-95 transition-all text-white/80 hover:text-white flex items-center justify-center border border-white/5 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Next"
          >
            <SkipForward size={15} fill="currentColor" />
          </button>
        </div>

        {/* Center Section: Dark pill with metadata, waveform & seek bar */}
        <div className="bg-black/55 border border-white/5 rounded-2xl px-3.5 py-2.5 flex items-center justify-between gap-4 w-[330px] relative overflow-hidden h-[56px] flex-shrink-0 select-none shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]">
          
          {/* Mini album cover */}
          <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 bg-white/5 border border-white/10 select-none">
            {imgUrl ? (
              <img src={getTrackArtwork(imgUrl)} alt={title} className="w-full h-full object-cover select-none pointer-events-none" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-[#111] select-none text-white/40">
                <Music size={14} />
              </div>
            )}
          </div>

          {/* Details & Waveform visualizer seek bar */}
          <div className="flex-1 flex items-center justify-between min-w-0 gap-3">
            {/* Title / Artist details */}
            <div className="flex flex-col min-w-0 pr-1 flex-1 justify-center">
              <span className="text-[10.5px] font-extrabold text-white truncate max-w-[130px] Satoshi font-display leading-tight">
                {artistName}
              </span>
              <span className="text-[9px] text-white/50 truncate max-w-[130px] font-bold mt-0.5 Satoshi leading-tight">
                {title}
              </span>
            </div>

            {/* Waveform Seek Bar */}
            <div 
              className="relative h-6 flex items-center cursor-pointer select-none group/wave w-[115px] flex-shrink-0"
              onClick={handleProgressClick}
            >
              {/* Gray Background Waveform */}
              <div className="absolute inset-0 flex items-center justify-between pointer-events-none select-none">
                {waveHeights.map((h, i) => (
                  <div 
                    key={i} 
                    className="w-[2.5px] rounded-full bg-white/25"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>

              {/* Active Colored Waveform */}
              <div 
                ref={progressBarFillRef}
                className="absolute inset-y-0 left-0 overflow-hidden flex items-center pointer-events-none select-none transition-all duration-75"
                style={{ width: '0%' }}
              >
                <div className="flex items-center justify-between w-[115px] h-full flex-shrink-0">
                  {waveHeights.map((h, i) => (
                    <div 
                      key={i} 
                      className="w-[2.5px] rounded-full"
                      style={{ 
                        height: `${h}%`, 
                        backgroundColor: accentColor 
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Section: Shuffle, Repeat, Volume Control */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            onClick={() => setShuffle(!shuffle)}
            className={`w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10 transition-all active:scale-95 ${
              shuffle ? 'text-white bg-white/10' : 'text-white/60 hover:text-white'
            }`}
            title="Shuffle"
          >
            <Shuffle size={14} />
          </button>
          <button
            onClick={cycleRepeatMode}
            className={`w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10 transition-all active:scale-95 relative ${
              repeatMode > 0 ? 'text-white bg-white/10' : 'text-white/60 hover:text-white'
            }`}
            title="Repeat"
          >
            <Repeat size={14} />
            {repeatMode > 0 && (
              <span className="absolute -bottom-0.5 -right-0.5 text-[8px] font-extrabold text-white bg-black border border-white/20 rounded-full w-3.5 h-3.5 flex items-center justify-center">
                {repeatMode}
              </span>
            )}
          </button>
          
          {/* Volume control integration */}
          <div className="flex items-center gap-2 pl-1 border-l border-white/10">
            <button
              onClick={() => setMuted(!muted)}
              className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-white/10 text-white/60 hover:text-white transition-all"
              title={muted ? "Unmute" : "Mute"}
            >
              {muted || volume === 0 ? <VolumeX size={14} /> : <Volume2 size={14} />}
            </button>
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.01" 
              value={muted ? 0 : volume} 
              onChange={(e) => {
                setVolume(parseFloat(e.target.value));
                if (muted) setMuted(false);
              }}
              className="w-16 h-1 bg-white/20 rounded-full appearance-none cursor-pointer accent-white" 
              title="Volume"
            />
          </div>
        </div>

      </div>

    </div>
  );
}
