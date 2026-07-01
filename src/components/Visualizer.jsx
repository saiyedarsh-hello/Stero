import { useState, useEffect } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useShallow } from 'zustand/react/shallow';
import { X, Disc, Play } from 'lucide-react';

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
    setActiveView,
    isPlaying,
    queue,
    songs: storeSongs,
    playTrack,
    activePlaylistId,
    dominantColor,
    goBackView,
    togglePlay
  } = usePlayerStore(useShallow(state => ({
    activeTrack: state.activeTrack,
    activeView: state.activeView,
    setActiveView: state.setActiveView,
    isPlaying: state.isPlaying,
    queue: state.queue,
    songs: state.songs,
    playTrack: state.playTrack,
    activePlaylistId: state.activePlaylistId,
    dominantColor: state.dominantColor,
    goBackView: state.goBackView,
    togglePlay: state.togglePlay
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

  if (!activeTrack) return null;

  // Derive tracks to display on the right (up to 5)
  let upcomingTracks = [];
  if (queue && queue.length > 0) {
    // Filter queue to exclude regional languages in real-time UI sifting
    const regionalKeywords = ['tamil', 'telugu', 'bengali', 'malayalam', 'kannada', 'bhojpuri', 'marathi', 'gujarati', 'assamese', 'odia', 'aamaye biye', 'biye ki kari'];
    const cleanQueue = queue.filter(track => {
      const t = (track.title || '').toLowerCase();
      const a = (track.artist || '').toLowerCase();
      return !regionalKeywords.some(kw => t.includes(kw) || a.includes(kw));
    });

    const queueActiveIndex = cleanQueue.findIndex(t => (t.id || t.videoId) === (activeTrack?.id || activeTrack?.videoId));
    if (cleanQueue.length <= 5) {
      upcomingTracks = [...cleanQueue];
    } else {
      let start = queueActiveIndex !== -1 ? queueActiveIndex - 2 : 0;
      if (start < 0) start = 0;
      if (start + 5 > cleanQueue.length) {
        start = Math.max(0, cleanQueue.length - 5);
      }
      upcomingTracks = cleanQueue.slice(start, start + 5);
    }
  }
  if (upcomingTracks.length === 0 && storeSongs) {
    upcomingTracks = storeSongs.slice(0, 5);
  }

  // Formatting artist and title for big text
  const artistName = String(activeTrack?.artist || "UNKNOWN ARTIST");
  const title = String(activeTrack?.title || "NO TRACK");
  const trackIndex = ((queue || []).findIndex(t => (t.id || t.videoId) === (activeTrack?.id || activeTrack?.videoId)) + 1).toString().padStart(2, '0');
  const imgUrl = activeTrack?.artwork_path || activeTrack?.coverUrl || activeTrack?.thumbnail;
  const highResImgUrl = getTrackArtwork(imgUrl);

  // Hardcode genres or extract if possible (usually not available in simple metadata, using placeholder matching aesthetic)
  const genresText = "PSYCHEDELIC POP, ROCK, DISCO, SYNTH-POP";

  // Calculate artist font size dynamically
  const words = artistName.split(/\s+/);
  const longestWord = Math.max(...words.map(w => w.length), 0);
  const totalLen = artistName.length;
  
  let artistFontSize = 'clamp(4rem, 7vw, 7rem)';
  if (totalLen > 30 || longestWord > 12) {
    artistFontSize = 'clamp(2rem, 3.5vw, 3.5rem)';
  } else if (totalLen > 18 || longestWord > 8) {
    artistFontSize = 'clamp(3rem, 5vw, 5rem)';
  }

  const accentColor = dominantColor 
    ? `hsl(${dominantColor.h}, ${Math.min(dominantColor.s + 15, 100)}%, 55%)` 
    : '#ff4d4d';

  return (
    <div 
      className={`absolute inset-0 z-50 flex items-center justify-center overflow-hidden font-sans transition-all duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        isActive ? 'opacity-100 pointer-events-auto scale-100' : 'opacity-0 pointer-events-none scale-98'
      }`}
      style={{ 
        backgroundColor: '#050508'
      }}
    >
      {/* Dynamic noisy mesh gradient background derived from active track artwork */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 select-none opacity-45">
        {highResImgUrl ? (
          <img 
            src={highResImgUrl} 
            alt="background-artwork-mesh" 
            className="w-full h-full object-cover scale-[1.3] blur-[110px] saturate-[180%] select-none pointer-events-none transition-all duration-1000 ease-in-out animate-mesh-drift"
          />
        ) : (
          <div 
            className="w-full h-full bg-gradient-to-br from-[#1c1a26] to-[#0a0a0c] opacity-60" 
          />
        )}
      </div>

      {/* Noise overlay */}
      <div className="visualizer-noise" />
      
      {/* Top Right Header Nav */}
      <div className="absolute top-10 right-12 flex items-center gap-8 z-20 text-[11px] font-bold tracking-[0.15em] text-white">
        <button onClick={handleClose} className="ml-6 w-9 h-9 rounded-full border border-white/15 flex items-center justify-center hover:bg-white/5 hover:scale-105 active:scale-95 transition-all text-white relative z-30">
          <X size={15} />
        </button>
      </div>

      {/* Main Grid Layout */}
      <div className="w-full h-full flex items-center justify-between pl-0 pr-12 lg:pr-32 relative z-10">
        
        {/* Left Side: Massive Vinyl */}
        <div className="relative w-[55vw] h-[55vw] min-w-[700px] min-h-[700px] flex items-center justify-center -ml-[25vw] pointer-events-none select-none">
          {/* Outer Thin Orbital Ring */}
          <div className="absolute inset-[-4%] rounded-full border-[1.5px] border-white/10 flex items-center justify-end pr-[2%]">
             {/* Small Red Dot */}
             <div className="w-3 h-3 rounded-full bg-[#a33333] absolute right-[-6px] shadow-[0_0_0_4px_rgba(255,255,255,0.05),0_0_0_6px_rgba(255,255,255,0.1)]" />
             {/* Tiny red orbital trail piece */}
             <svg className="absolute w-full h-full rotate-45 opacity-40" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="49" fill="none" stroke="#a33333" strokeWidth="0.3" strokeDasharray="10 100" />
             </svg>
          </div>

          {/* Vinyl Record */}
          <div 
            onClick={() => {
              setDiscClicks(prev => prev + 1);
              togglePlay();
            }}
            className={`relative w-full h-full rounded-full shadow-[25px_0_70px_rgba(0,0,0,0.4)] overflow-hidden cursor-pointer transition-all duration-1000 active:scale-[0.98] pointer-events-auto ${isPlaying ? 'animate-spin-slow' : ''} ${discClicks >= 10 ? 'bg-[#3b2a09]' : 'bg-[#111]'}`} 
            style={{ animationDuration: '8s', animationTimingFunction: 'linear' }}
          >
            {/* Vinyl Grooves */}
            <div className="absolute inset-0 rounded-full transition-all duration-1000" style={{
              background: discClicks >= 10 
                ? 'repeating-radial-gradient(circle at center, rgba(133, 96, 20, 0.8), rgba(133, 96, 20, 0.8) 2px, rgba(43, 30, 3, 0.9) 3px, rgba(133, 96, 20, 0.8) 4px)'
                : 'repeating-radial-gradient(circle at center, #111, #111 2px, #181818 3px, #111 4px)'
            }} />
            
            {/* Inner Golden Ring Detail */}
            {discClicks >= 10 && (
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[38%] h-[38%] rounded-full border border-[#ffe066]/30 shadow-[0_0_10px_rgba(200,150,30,0.5)] pointer-events-none transition-opacity duration-1000 opacity-100 animate-pulse" />
            )}

            {/* Light reflection sheen */}
            <div className={`absolute inset-0 rounded-full mix-blend-screen transition-opacity duration-1000 ${discClicks >= 10 ? 'opacity-50' : 'opacity-35'}`} style={{
              background: 'conic-gradient(from 45deg, transparent 0deg, rgba(255,255,255,0.4) 45deg, transparent 90deg, rgba(255,255,255,0.4) 135deg, transparent 180deg, rgba(255,255,255,0.4) 225deg, transparent 270deg, rgba(255,255,255,0.4) 315deg, transparent 360deg)'
            }} />
            
            {/* Center Label */}
            <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[35%] h-[35%] rounded-full shadow-[inset_0_0_25px_rgba(0,0,0,0.2)] flex items-center justify-center transition-colors duration-1000 ${discClicks >= 10 ? 'bg-[#33260d]' : 'bg-[#f4f4f2]'}`}>
              {/* Spindle hole */}
              <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full shadow-[inset_0_2px_4px_rgba(0,0,0,0.8)] border-[3px] transition-colors duration-1000 ${discClicks >= 10 ? 'bg-[#33260d] border-[#d4af37]' : 'bg-[#f4f4f2] border-[#e0e0e0]'}`} />
              
              {/* Minimal Logo on left side of label */}
              <div className="absolute left-[15%] top-1/2 -translate-y-1/2 flex items-end gap-[3px]">
                <div className={`w-[3px] h-4 transition-colors duration-1000 ${discClicks >= 10 ? 'bg-[#d4af37]' : 'bg-[#a33333]'}`} />
                <div className={`w-[3px] h-7 transition-colors duration-1000 ${discClicks >= 10 ? 'bg-[#d4af37]' : 'bg-[#a33333]'}`} />
                <div className={`w-[3px] h-5 transition-colors duration-1000 ${discClicks >= 10 ? 'bg-[#d4af37]' : 'bg-[#a33333]'}`} />
                <div className={`w-[3px] h-3 transition-colors duration-1000 ${discClicks >= 10 ? 'bg-[#d4af37]' : 'bg-[#a33333]'}`} />
              </div>

              {/* Track Info on right side of label */}
              <div className="absolute right-[12%] top-1/2 -translate-y-1/2 text-right select-none">
                <span className={`text-[11px] font-bold tracking-[0.1em] uppercase block max-w-[140px] truncate transition-colors duration-1000 ${discClicks >= 10 ? 'text-[#d4af37]' : 'text-[#111]'}`}>
                  {trackIndex}. {title}
                </span>
              </div>
            </div>
          </div>
          
        </div>

        {/* Right Side: Typography and Queue */}
        <div className="flex-1 flex flex-col justify-center max-w-xl 2xl:max-w-2xl ml-16 mt-10 relative z-20">
          
          {/* Massive Artist Text */}
          <div className="flex flex-col mb-4 max-h-[40vh] overflow-hidden">
            <h1 
              className="font-black tracking-tighter text-white uppercase leading-[0.9] break-normal transition-all duration-300"
              style={{ fontSize: artistFontSize }}
            >
              {artistName}
            </h1>
          </div>

          {/* Genre / Subtitle */}
          <p className="text-[11px] font-bold tracking-[0.2em] text-white/50 uppercase mb-16 pl-2">
            {genresText}
          </p>

          {/* "POPULAR" Section Title */}
          <h3 
            className="text-[12px] font-bold tracking-[0.15em] mb-6 pl-2 transition-colors duration-1000"
            style={{ color: accentColor }}
          >
            POPULAR
          </h3>

          {/* Track List */}
          <div className="flex flex-col gap-5 pl-2">
            {upcomingTracks.map((track) => {
              const trackIdentifier = track.id || track.videoId;
              let tIndex = queue?.findIndex(t => (t.id || t.videoId) === trackIdentifier);
              if (tIndex === -1 || tIndex === undefined) tIndex = upcomingTracks.indexOf(track);
              const actualIndex = (tIndex + 1).toString().padStart(2, '0');
              const isPlayingThis = isPlaying && (activeTrack?.id || activeTrack?.videoId) === trackIdentifier;
              
              const imgUrl = track.artwork_path || track.coverUrl || track.thumbnail;
              
              return (
                <div 
                  key={trackIdentifier || Math.random()} 
                  className="flex items-center group cursor-pointer"
                  onClick={() => playTrack(track, queue, activePlaylistId)}
                >
                  <span 
                    className="text-[11px] font-black w-8 transition-colors duration-300"
                    style={{ color: isPlayingThis ? accentColor : 'rgba(255, 255, 255, 0.3)' }}
                  >
                    {actualIndex}
                  </span>
                  
                  <div className="w-[42px] h-[42px] bg-white/5 ml-2 flex-shrink-0 overflow-hidden shadow-sm relative border border-white/5 rounded">
                    {imgUrl ? (
                      <img src={getTrackArtwork(imgUrl)} alt={track.title} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-[#111]" />
                    )}
                    <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-10 transition-opacity" />
                  </div>
                  
                  <div className="flex flex-col ml-5 flex-1 min-w-0 pt-0.5">
                    <span 
                      className="text-[12px] font-black uppercase tracking-wide truncate transition-colors duration-300"
                      style={{ color: isPlayingThis ? accentColor : 'rgba(255, 255, 255, 0.8)' }}
                    >
                      {track.title}
                    </span>
                  </div>
                  
                </div>
              );
            })}
          </div>

          {/* View More Link */}
          <div className="w-full text-right mt-16 pr-2">
            <button 
              onClick={handleClose}
              className="text-[11px] font-black tracking-[0.15em] text-white uppercase border-b-2 border-white pb-1 hover:text-white/80 transition-colors"
              style={{ 
                borderColor: accentColor,
                color: accentColor 
              }}
            >
              VIEW MORE
            </button>
          </div>
        </div>
        
      </div>
    </div>
  );
}
