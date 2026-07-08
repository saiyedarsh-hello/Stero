import { useState, useEffect, useRef } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useShallow } from 'zustand/react/shallow';
import { X, Disc, Play, Pause, SkipBack, SkipForward, Music } from 'lucide-react';

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

export default function Visualizer() {
  const { 
    activeTrack, 
    activeView, 
    isPlaying,
    queue,
    songs: storeSongs,
    playTrack,
    activePlaylistId,
    dominantColor,
    goBackView,
    togglePlay,
    nextTrack,
    prevTrack
  } = usePlayerStore(useShallow(state => ({
    activeTrack: state.activeTrack,
    activeView: state.activeView,
    isPlaying: state.isPlaying,
    queue: state.queue,
    songs: state.songs,
    playTrack: state.playTrack,
    activePlaylistId: state.activePlaylistId,
    dominantColor: state.dominantColor,
    goBackView: state.goBackView,
    togglePlay: state.togglePlay,
    nextTrack: state.nextTrack,
    prevTrack: state.prevTrack
  })));

  const [discClicks, setDiscClicks] = useState(0);

  const isActive = activeView === 'visualizer';

  // Handle Close
  const handleClose = () => {
    goBackView();
    setTimeout(() => setDiscClicks(0), 700); // reset after fade out
  };

  // Keyboard escape
  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, handleClose]);

  // Ambient Glass Dust Particle Field (HTML5 Canvas for performance)
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let animationFrameId;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Initialize 40 particles representing glass dust sparkles
    const particleCount = 40;
    const particles = [];
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.45,
        vy: (Math.random() - 0.5) * 0.45,
        size: Math.random() * 2.2 + 0.6, // 0.6px to 2.8px sparkles
        opacity: Math.random() * 0.35 + 0.1, // Soft baseline visibility
        pulseSpeed: Math.random() * 0.02 + 0.005,
        pulseValue: Math.random() * Math.PI
      });
    }

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Determine dynamic fill color based on song's extracted HSL color
      const pColor = dominantColor
        ? `hsl(${dominantColor.h}, ${Math.min(dominantColor.s, 100)}%, 75%)`
        : '#ffffff';

      ctx.fillStyle = pColor;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Sparkle cycle (oscillating opacity via sine wave)
        p.pulseValue += p.pulseSpeed;
        const currentOpacity = p.opacity + Math.sin(p.pulseValue) * 0.07;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.globalAlpha = Math.max(0.02, Math.min(0.6, currentOpacity));

        // Soft glass reflection glow effect
        ctx.shadowBlur = p.size * 2.5;
        ctx.shadowColor = pColor;
        ctx.fill();

        // Slow down movement when song is paused, float smoothly when playing
        const speedMultiplier = isPlaying ? 1.0 : 0.12;
        p.x += p.vx * speedMultiplier;
        p.y += p.vy * speedMultiplier;

        // Wrap particles around borders
        if (p.x < -10) p.x = canvas.width + 10;
        if (p.x > canvas.width + 10) p.x = -10;
        if (p.y < -10) p.y = canvas.height + 10;
        if (p.y > canvas.height + 10) p.y = -10;
      }

      ctx.shadowBlur = 0; // Reset canvas shadows
      animationFrameId = requestAnimationFrame(render);
    };
    render();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animationFrameId);
    };
  }, [isPlaying, dominantColor]);

  if (!activeTrack) return null;

  // Derive tracks to display in the bottom dock
  let upcomingTracks = [];
  if (queue && queue.length > 0) {
    const regionalKeywords = ['tamil', 'telugu', 'bengali', 'malayalam', 'kannada', 'bhojpuri', 'marathi', 'gujarati', 'assamese', 'odia'];
    const cleanQueue = queue.filter(track => {
      const t = (track.title || '').toLowerCase();
      const a = (track.artist || '').toLowerCase();
      return !regionalKeywords.some(kw => t.includes(kw) || a.includes(kw));
    });

    const queueActiveIndex = cleanQueue.findIndex(t => (t.id || t.videoId) === (activeTrack?.id || activeTrack?.videoId));
    
    // We want a slice of about 7 songs centered around the active track for the dock
    if (cleanQueue.length <= 7) {
      upcomingTracks = [...cleanQueue];
    } else {
      let start = queueActiveIndex !== -1 ? queueActiveIndex - 3 : 0;
      if (start < 0) start = 0;
      if (start + 7 > cleanQueue.length) {
        start = Math.max(0, cleanQueue.length - 7);
      }
      upcomingTracks = cleanQueue.slice(start, start + 7);
    }
  }
  if (upcomingTracks.length === 0 && storeSongs) {
    upcomingTracks = storeSongs.slice(0, 7);
  }

  const artistName = String(activeTrack?.artist || "UNKNOWN ARTIST");
  const title = String(activeTrack?.title || "NO TRACK");
  const imgUrl = activeTrack?.artwork_path || activeTrack?.coverUrl || activeTrack?.thumbnail;
  const highResImgUrl = getTrackArtwork(imgUrl);

  const isGoldenBall = discClicks >= 10;
  const accentColor = isGoldenBall
    ? '#ffe066'
    : dominantColor 
      ? `hsl(${dominantColor.h}, ${Math.min(dominantColor.s + 15, 100)}%, 55%)` 
      : '#00f0ff';

  const accentGlowColor = isGoldenBall
    ? 'rgba(212, 175, 55, 0.45)'
    : dominantColor
      ? `hsla(${dominantColor.h}, ${dominantColor.s}%, 50%, 0.45)`
      : 'rgba(0, 240, 255, 0.35)';

  return (
    <div 
      className={`absolute inset-0 z-50 flex flex-col items-center justify-between overflow-hidden font-sans transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] p-8 ${
        isActive ? 'opacity-100 pointer-events-auto scale-100' : 'opacity-0 pointer-events-none scale-98'
      }`}
      style={{ 
        backgroundColor: '#050508'
      }}
    >
      {/* Ambient background blur derived from active track artwork */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 select-none opacity-50">
        {highResImgUrl ? (
          <img 
            src={highResImgUrl} 
            alt="background-artwork-mesh" 
            className="w-full h-full object-cover scale-[1.35] blur-[120px] saturate-[180%] select-none pointer-events-none transition-all duration-1000 ease-in-out animate-mesh-drift"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[#1c1a26] to-[#0a0a0c] opacity-60" />
        )}
      </div>

      {/* Noise overlay */}
      <div className="visualizer-noise" />

      {/* Dynamic Ambient Glass Dust Sparkle Field Canvas */}
      <canvas 
        ref={canvasRef}
        className="absolute inset-0 z-0 pointer-events-none w-full h-full select-none"
      />



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

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-8 z-10 pointer-events-none transform -translate-y-12">
        
        {/* Title & Artist Block */}
        <div className="flex flex-col items-center pointer-events-none select-none px-4 text-center max-w-lg">
          <h1 
            className="text-2xl sm:text-3xl md:text-4xl font-black uppercase tracking-wider text-white drop-shadow-[0_4px_12px_rgba(0,0,0,0.6)] line-clamp-2 leading-tight"
            style={{ textShadow: `0 0 25px ${accentGlowColor}` }}
          >
            {title}
          </h1>
          <p className="text-xs sm:text-sm font-bold tracking-[0.22em] text-white/60 uppercase mt-3 tracking-wide truncate max-w-sm">
            {artistName}
          </p>
        </div>

        {/* 3D Glass Ball (Interaction enabled) */}
        <div 
          onClick={() => {
            setDiscClicks(prev => prev + 1);
            togglePlay();
          }}
          className="relative w-[280px] h-[280px] sm:w-[350px] sm:h-[350px] md:w-[400px] md:h-[400px] rounded-full overflow-hidden shadow-[0_30px_90px_-15px_rgba(0,0,0,0.95)] border border-white/20 select-none pointer-events-auto cursor-pointer group transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{
            boxShadow: `0 30px 90px -15px rgba(0,0,0,0.95), 0 0 100px -10px ${accentGlowColor}`
          }}
        >
          {/* Cover Art Image */}
          {highResImgUrl ? (
            <img 
              src={highResImgUrl} 
              alt={title}
              className={`w-full h-full object-cover transition-all duration-[4000ms] ease-in-out scale-[1.15] ${
                isGoldenBall ? 'sepia-[50%] saturate-[200%] hue-rotate-[15deg] brightness-[90%]' : ''
              }`}
            />
          ) : (
            <div className="w-full h-full bg-[#111] flex items-center justify-center">
              <Disc size={80} className="text-white/10" />
            </div>
          )}

          {/* 3D Glass Ball Sphere Shader (Radial shadow & inner depth) */}
          <div 
            className="absolute inset-0 rounded-full mix-blend-multiply pointer-events-none"
            style={{
              background: 'radial-gradient(circle at 35% 35%, transparent 35%, rgba(0, 0, 0, 0.45) 65%, rgba(0, 0, 0, 0.88) 100%)'
            }}
          />

          {/* Ambient Color Fresnel Refraction Overlay */}
          <div 
            className="absolute inset-0 rounded-full pointer-events-none mix-blend-color-dodge"
            style={{
              background: isGoldenBall
                ? 'radial-gradient(circle at 65% 65%, rgba(0,0,0,0) 35%, rgba(212, 175, 55, 0.25) 75%, rgba(212, 175, 55, 0.6) 100%)'
                : dominantColor
                  ? `radial-gradient(circle at 65% 65%, rgba(0,0,0,0) 35%, hsla(${dominantColor.h}, ${dominantColor.s}%, 50%, 0.15) 75%, hsla(${dominantColor.h}, ${dominantColor.s}%, 50%, 0.5) 100%)`
                  : 'radial-gradient(circle at 65% 65%, rgba(0, 0, 0, 0.15) 75%, rgba(0, 240, 255, 0.4) 100%)'
            }}
          />

          {/* Inner Highlight Refraction Rim */}
          <div 
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background: 'radial-gradient(circle at center, transparent 70%, rgba(255, 255, 255, 0.2) 95%, rgba(255, 255, 255, 0.55) 100%)'
            }}
          />

          {/* Gloss Hotspot Light Reflection Shape */}
          <div 
            className="absolute w-[52%] h-[32%] bg-gradient-to-b from-white/35 via-white/10 to-white/0 rounded-full top-[6%] left-[10%] blur-[1.5px] pointer-events-none"
            style={{
              transform: 'rotate(-28deg)'
            }}
          />

          {/* Gloss bottom secondary reflection */}
          <div 
            className="absolute w-[35%] h-[20%] bg-gradient-to-t from-white/15 to-white/0 rounded-full bottom-[8%] right-[15%] blur-[2px] pointer-events-none"
            style={{
              transform: 'rotate(-28deg)'
            }}
          />

          {/* Dynamic Wave Ring Overlay (Pulsates slightly with music if active) */}
          {isPlaying && (
            <div className="absolute inset-0 rounded-full border-[1.5px] border-white/20 animate-pulse pointer-events-none mix-blend-overlay" />
          )}
        </div>

      </div>

      {/* Floating Taskbar / Mac OS-style Controls + Queue Dock */}
      <div 
        className="flex items-center gap-6 px-6 py-3.5 bg-white/[0.03] border border-white/10 backdrop-blur-2xl rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.6)] z-30 select-none max-w-[95vw] sm:max-w-[85vw] md:max-w-[70vw] relative mb-4 transition-all duration-300 hover:border-white/15 hover:bg-white/[0.05]"
        style={{
          boxShadow: `0 20px 50px rgba(0,0,0,0.6), 0 0 30px -10px ${accentGlowColor}`
        }}
      >
        
        {/* Compact Playback Controls */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <button 
            onClick={prevTrack} 
            className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 active:scale-95 transition-all text-white/80 hover:text-white flex items-center justify-center"
            title="Previous"
          >
            <SkipBack size={15} />
          </button>
          <button 
            onClick={togglePlay} 
            className="w-10 h-10 rounded-full bg-white text-black hover:scale-105 active:scale-95 transition-all flex items-center justify-center shadow-lg"
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" className="ml-0.5" />}
          </button>
          <button 
            onClick={nextTrack} 
            className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 active:scale-95 transition-all text-white/80 hover:text-white flex items-center justify-center"
            title="Next"
          >
            <SkipForward size={15} />
          </button>
        </div>

        {/* Divider */}
        <div className="h-6 w-[1px] bg-white/15 flex-shrink-0" />

        {/* Queue Dock Items */}
        <div className="flex items-center gap-3.5 flex-shrink-0 overflow-visible pr-2">
          {upcomingTracks.map((track) => {
            const trackIdentifier = track.id || track.videoId;
            const isPlayingThis = (activeTrack?.id || activeTrack?.videoId) === trackIdentifier;
            const trackImgUrl = track.artwork_path || track.coverUrl || track.thumbnail;
            
            return (
              <div 
                key={trackIdentifier || Math.random()} 
                className="relative flex flex-col items-center group cursor-pointer"
                onClick={() => playTrack(track, queue, activePlaylistId)}
              >
                {/* Floating Tooltip */}
                <div className="absolute bottom-[62px] bg-black/95 border border-white/15 text-white text-[10px] font-bold px-3 py-1.5 rounded-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-all duration-300 translate-y-2 group-hover:translate-y-0 shadow-2xl z-50 flex flex-col items-center">
                  <span className="font-extrabold max-w-[140px] truncate">{track.title}</span>
                  <span className="text-[8px] text-white/50 max-w-[140px] truncate mt-0.5">{track.artist}</span>
                  <div className="absolute top-full w-2 h-2 bg-black border-r border-b border-white/15 rotate-45 -mt-1" />
                </div>

                {/* Cover Art Icon */}
                <div className={`w-11 h-11 rounded-xl overflow-hidden border transition-all duration-300 group-hover:scale-120 group-hover:-translate-y-1.5 group-active:scale-95 bg-white/5 flex-shrink-0 ${
                  isPlayingThis 
                    ? 'border-cyan-400 shadow-[0_0_12px_rgba(34,211,238,0.5)] scale-105' 
                    : 'border-white/10 group-hover:border-white/20'
                }`}
                style={isPlayingThis ? { borderColor: accentColor, boxShadow: `0 0 12px ${accentGlowColor}` } : {}}
                >
                  {trackImgUrl ? (
                    <img src={getTrackArtwork(trackImgUrl)} alt={track.title} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-[#111]">
                      <Music size={16} className="text-white/20" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

      </div>

    </div>
  );
}
