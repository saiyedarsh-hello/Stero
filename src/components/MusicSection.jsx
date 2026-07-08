import { useState, useEffect, useRef } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useShallow } from 'zustand/react/shallow';
import { ChevronLeft, ChevronRight, Play, Heart, Disc, Plus, Check, CloudDownload, X } from 'lucide-react';
import LanguageModal from './LanguageModal';
import RetryImage from './RetryImage';

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
  // Match the width and height part (e.g. =w120-h120 or =w60-h60) and replace it
  // This preserves other flags like -p-l90-rj which might be required for some Google user content URLs.
  if (url.includes('googleusercontent.com') || url.includes('ggpht.com')) {
    if (url.includes('=')) {
      return url.replace(/=w\d+-h\d+/i, '=w1024-h1024');
    }
  }
  return url.replace(/=w\d+-h\d+/i, '=w1024-h1024');
};

const getMediumResUrl = (url) => {
  if (!url) return '';
  if (url.includes('googleusercontent.com') || url.includes('ggpht.com')) {
    if (url.includes('=')) {
      return url.replace(/=w\d+-h\d+/i, '=w600-h600');
    }
  }
  return url.replace(/=w\d+-h\d+/i, '=w600-h600');
};

const getThumbnailUrl = (url) => {
  if (!url) return '';
  if (url.includes('googleusercontent.com') || url.includes('ggpht.com')) {
    if (url.includes('=')) {
      return url.replace(/=w\d+-h\d+/i, '=w300-h300');
    }
  }
  return url.replace(/=w\d+-h\d+/i, '=w300-h300');
};

export default function MusicSection() {
  const { 
    appSettings, 
    activeTrack,
    fetchTrendingSongs, 
    fetchTrendingArtists, 
    playTrack,
    preloadTrack,
    viewHistory,
    activeView,
    trendingArtists: artists,
    trendingSongs,
    ytSearchResults,
    ytArtistSearchResults,
    setTrendingData,
    myTaste,
    setMyTaste,
    fetchMyTaste,
    toggleFavorite,
    playHistory,
    songs: allSongs, // Need this to check if a stream is already in the DB favorites
    followedArtists,
    followedArtistSongs,
    followedArtistAlbums,
    toggleFollowArtist,
    downloadState,
    startDownload,
    setActiveView,
    viewYtAlbum,
    ytAlbumSearchResults,
    addToBlacklist
  } = usePlayerStore(useShallow(state => ({
    appSettings: state.appSettings,
    activeTrack: state.activeTrack,
    fetchTrendingSongs: state.fetchTrendingSongs,
    fetchTrendingArtists: state.fetchTrendingArtists,
    playTrack: state.playTrack,
    preloadTrack: state.preloadTrack,
    viewHistory: state.viewHistory,
    activeView: state.activeView,
    trendingArtists: state.trendingArtists,
    trendingSongs: state.trendingSongs,
    ytSearchResults: state.ytSearchResults,
    ytArtistSearchResults: state.ytArtistSearchResults,
    setTrendingData: state.setTrendingData,
    myTaste: state.myTaste,
    setMyTaste: state.setMyTaste,
    fetchMyTaste: state.fetchMyTaste,
    toggleFavorite: state.toggleFavorite,
    playHistory: state.playHistory,
    songs: state.songs,
    followedArtists: state.followedArtists,
    followedArtistSongs: state.followedArtistSongs,
    followedArtistAlbums: state.followedArtistAlbums,
    toggleFollowArtist: state.toggleFollowArtist,
    downloadState: state.downloadState,
    startDownload: state.startDownload,
    setActiveView: state.setActiveView,
    viewYtAlbum: state.viewYtAlbum,
    ytAlbumSearchResults: state.ytAlbumSearchResults,
    addToBlacklist: state.addToBlacklist
  })));

  const [showLanguageModal, setShowLanguageModal] = useState(false);
  // Hardcoded to english only for now
  const [languageString, setLanguageString] = useState('english');
  const [loading, setLoading] = useState(false);

  const artistScrollRef = useRef(null);
  const myTasteScrollRef = useRef(null);
  const songScrollRef = useRef(null);
  const recentScrollRef = useRef(null);
  const followedScrollRef = useRef(null);
  const followedAlbumScrollRef = useRef(null);
  const searchAlbumScrollRef = useRef(null);

  const scrollContainer = (ref, direction) => {
    if (ref.current) {
      const amount = direction === 'left' ? -400 : 400;
      ref.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };

  // Derive "Recently Played" from the view history or just local songs
  // For the sake of the layout, we'll grab some recent unique tracks from the store queue/history
  const recentlyPlayed = playHistory.slice(0, 4);

  useEffect(() => {
    let isMounted = true;
    if (languageString) {
      const fetchAll = async () => {
        setLoading(true);
        try {
          let [newArtists, newSongs, myTasteSongs] = await Promise.all([
            fetchTrendingArtists(languageString),
            fetchTrendingSongs(languageString),
            fetchMyTaste(languageString)
          ]);
          
          let unfollowed = (newArtists || []).filter(artist => 
            !followedArtists.some(f => (f.id || f.browseId) === (artist.id || artist.browseId))
          );
          
          if (unfollowed.length < 20 && window.electron) {
            try {
              const extraArtists = await window.electron.ytSearchTrending("popular global artists", "artist");
              if (extraArtists && extraArtists.length > 0) {
                const combined = [...(newArtists || []), ...extraArtists];
                const unique = Array.from(new Map(combined.map(a => [a.id || a.browseId || a.name, a])).values());
                newArtists = unique;
              }
            } catch (err) {
              console.warn("Failed to fetch extra artists:", err);
            }
          }
          
          if (isMounted) {
            setTrendingData(newArtists || [], newSongs || []);
            setMyTaste(myTasteSongs || []);
          }
        } catch (err) {
          console.error("Failed to fetch trending music:", err);
        } finally {
          if (isMounted) setLoading(false);
        }
      };
      


      if (activeView === 'music') {
        if (trendingSongs.length === 0 || artists.length < 20) {
          fetchAll();
        } else {
          // Dynamic update of My Taste when coming back to the Music view
          const refreshTaste = async () => {
            try {
              const myTasteSongs = await fetchMyTaste(languageString);
              if (isMounted) {
                setMyTaste(myTasteSongs || []);
              }
            } catch (err) {
              console.error("Failed to refresh My Taste:", err);
            }
          };
          refreshTaste();
        }
      }
      
      // Force fetch followed artists albums to ensure they populate
      const followed = usePlayerStore.getState().followedArtists;
      if (followed && followed.length > 0) {
        usePlayerStore.getState().fetchFollowedArtistsAlbums(followed);
      }
    }
    return () => { isMounted = false; };
  }, [languageString, fetchTrendingArtists, fetchTrendingSongs, fetchMyTaste, activeView, trendingSongs.length, artists.length, setTrendingData, setMyTaste, followedArtists]);
  
  let displayArtists = [];
  if (ytArtistSearchResults) {
    displayArtists = [...ytArtistSearchResults];
  } else {
    // Only show artists that are NOT currently followed
    displayArtists = artists.filter(artist => {
      const isFollowed = followedArtists.some(f => (f.id || f.browseId) === (artist.id || artist.browseId));
      return !isFollowed;
    });
  }

  // Reset scroll positions ONLY when search results or trending data content actually changes
  const prevFirstArtistId = useRef(null);
  const prevFirstSongId = useRef(null);

  useEffect(() => {
    const currentFirstArtistId = displayArtists[0]?.id || displayArtists[0]?.browseId || null;
    const currentFirstSongId = (ytSearchResults || trendingSongs)[0]?.videoId || null;

    if (currentFirstArtistId !== prevFirstArtistId.current) {
      if (artistScrollRef.current) {
        artistScrollRef.current.scrollTo({ left: 0, behavior: 'smooth' });
      }
      prevFirstArtistId.current = currentFirstArtistId;
    }
    if (currentFirstSongId !== prevFirstSongId.current) {
      if (songScrollRef.current) {
        songScrollRef.current.scrollTo({ left: 0, behavior: 'smooth' });
      }
      prevFirstSongId.current = currentFirstSongId;
    }
  }, [displayArtists, ytSearchResults, trendingSongs]);

  return (
    <div className="flex flex-col gap-10 select-none animate-fade-in pb-10">



      {/* 1. Popular Artist Row */}
      {((ytArtistSearchResults && ytArtistSearchResults.length > 0) || (!ytSearchResults && !ytArtistSearchResults && displayArtists.length > 0)) && (
        <section className="order-0 w-full mb-2" style={{ contentVisibility: 'auto', containIntrinsicSize: '0 160px' }}>
          <div className="flex items-center justify-between mb-4 px-4">
            <h2 className="text-sm font-bold text-white/50 uppercase tracking-widest">
              {ytArtistSearchResults ? 'Search Results (Artists)' : 'Artists to Explore'}
            </h2>
            <div className="flex items-center gap-2">
              <button onClick={() => scrollContainer(artistScrollRef, 'left')} className="w-6 h-6 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors">
                <ChevronLeft size={14} />
              </button>
              <button onClick={() => scrollContainer(artistScrollRef, 'right')} className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-transform active:scale-95">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
          <div ref={artistScrollRef} className="flex overflow-x-auto gap-6 pb-4 pt-4 px-4 -mt-4 hide-scrollbar">
            {displayArtists.length === 0 ? (
              loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <div key={`artist-skel-${i}`} className="flex flex-col items-center gap-3 flex-shrink-0">
                    <div className="w-24 h-24 rounded-full bg-white/5 animate-pulse" />
                    <div className="w-16 h-3 bg-white/5 rounded animate-pulse" />
                  </div>
                ))
              ) : (
                ytArtistSearchResults ? (
                  <div className="text-sm text-gray-500 px-4 py-4 w-full">No matching artists found.</div>
                ) : null
              )
            ) : (
              displayArtists.slice(0, 20).map((artist) => (
                <div 
                  key={artist.id || artist.browseId} 
                  className="flex flex-col items-center gap-3 cursor-pointer group flex-shrink-0 relative hover:z-10 w-24 text-center"
                  onClick={async () => {
                    if (activeTrack && activeTrack.artist && activeTrack.artist.toLowerCase().includes(artist.name.toLowerCase())) {
                      return;
                    }
                    try {
                      const results = await window.electron.ytSearch(`${artist.name} songs`);
                      if (results && results.length > 0) {
                        playTrack(results[0], results);
                      }
                    } catch (err) {
                      console.error('Failed to play artist songs:', err);
                    }
                  }}
                >
                  <div className="w-24 h-24 rounded-full overflow-hidden border border-white/5 shadow-lg group-hover:scale-105 group-active:scale-95 transition-all duration-300 relative isolate will-change-transform">
                    {artist.imageUrl || artist.thumbnail ? (
                      <RetryImage src={getArtworkUrl(getThumbnailUrl(artist.imageUrl || artist.thumbnail))} alt={artist.name} loading="lazy" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-white/10 flex items-center justify-center">
                        <Disc size={30} className="text-white/40" />
                      </div>
                    )}
                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-300">
                       <Play size={24} className="text-white ml-1" fill="currentColor" />
                    </div>
                  </div>
                  
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFollowArtist(artist);
                    }}
                    className={`absolute top-16 right-0 w-7 h-7 rounded-full flex items-center justify-center shadow-lg transition-all duration-300 z-10 border border-white/10 ${
                      followedArtists.some(a => (a.id || a.browseId) === (artist.id || artist.browseId))
                        ? 'bg-white/20 text-white scale-100'
                        : 'bg-[#18181b] text-white/50 hover:bg-white/10 hover:text-white opacity-0 group-hover:opacity-100'
                    }`}
                    title={followedArtists.some(a => (a.id || a.browseId) === (artist.id || artist.browseId)) ? "Unfollow artist" : "Follow artist"}
                  >
                    {followedArtists.some(a => (a.id || a.browseId) === (artist.id || artist.browseId)) ? (
                      <Check size={14} className="animate-in zoom-in duration-200" strokeWidth={3} />
                    ) : (
                      <Plus size={14} className="animate-in zoom-in duration-200" />
                    )}
                  </button>

                  <span className="text-xs font-semibold text-gray-300 group-hover:text-white truncate w-full transition-colors">{artist.name}</span>
                </div>
              ))
            )}
          </div>
        </section>
      )}

      {/* 0.5 My Taste Row */}
      {myTaste && myTaste.length > 0 && !ytSearchResults && !ytArtistSearchResults && (
        <section className="order-1 w-full mb-2" style={{ contentVisibility: 'auto', containIntrinsicSize: '0 360px' }}>
          <div className="flex items-center justify-between mb-3 px-4">
            <h2 className="text-sm font-bold text-white/50 uppercase tracking-widest">
              Recommended
            </h2>
            <div className="flex items-center gap-2">
              <button onClick={() => scrollContainer(myTasteScrollRef, 'left')} className="w-6 h-6 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors">
                <ChevronLeft size={14} />
              </button>
              <button onClick={() => scrollContainer(myTasteScrollRef, 'right')} className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-transform active:scale-95">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
          <div ref={myTasteScrollRef} className="flex overflow-x-auto gap-6 pb-4 px-4 hide-scrollbar snap-x snap-mandatory">
            {Array.from({ length: Math.ceil(myTaste.slice(0, 24).length / 3) }).map((_, colIndex) => {
              const colSongs = myTaste.slice(colIndex * 3, colIndex * 3 + 3);
              return (
                <div key={colIndex} className="flex flex-col gap-4 flex-shrink-0 w-80 md:w-96 snap-start">
                  {colSongs.map((song) => {
                    const dbSong = allSongs?.find(s => s.filepath === `yt-stream://${song.videoId}`);
                    const isFav = dbSong?.favorite === 1;
                    const isDownloaded = allSongs?.some(s => 
                      s.filepath && 
                      !s.filepath.startsWith('yt-stream://') && 
                      s.title?.toLowerCase() === song.title?.toLowerCase() &&
                      s.artist?.toLowerCase() === song.artist?.toLowerCase()
                    );
                    const isDownloading = downloadState?.active?.some(job => job.videoId === song.videoId) || 
                                          downloadState?.queue?.some(job => job.videoId === song.videoId);

                    return (
                      <div 
                        key={song.videoId} 
                        onClick={() => playTrack(song, myTaste)}
                        onMouseEnter={() => preloadTrack(song)}
                        className="w-full h-24 rounded-2xl overflow-hidden cursor-pointer group relative shadow-md border border-white/5 bg-white/5 hover:bg-white/10 transition-all duration-300 flex will-change-[background-color]"
                      >
                        {/* Backdrop artwork blur */}
                        <div className="absolute inset-0 z-0 opacity-20 group-hover:opacity-30 transition-opacity">
                           <RetryImage src={getArtworkUrl(getMediumResUrl(song.coverUrl || song.thumbnail))} fallbackSrc={song.coverUrl || song.thumbnail} alt={song.title} className="w-full h-full object-cover blur-xl scale-125" />
                        </div>
                        
                        {/* Left Side: Artwork */}
                        <div className="w-24 h-24 relative z-10 flex-shrink-0 shadow-[4px_0_15px_rgba(0,0,0,0.5)] bg-black/20">
                          {(song.coverUrl || song.thumbnail) ? (
                            <RetryImage src={getArtworkUrl(getMediumResUrl(song.coverUrl || song.thumbnail))} fallbackSrc={song.coverUrl || song.thumbnail} alt={song.title} loading="lazy" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-white/10 to-transparent flex items-center justify-center">
                              <Disc size={20} className="text-white/20" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Play size={20} className="text-white ml-1" fill="currentColor" />
                          </div>
                        </div>

                        {/* Right Side: Info & Actions */}
                        <div className="flex-1 p-3 flex flex-col justify-center min-w-0 z-10 relative">
                          <span className="text-sm font-bold text-white truncate group-hover:text-blue-400 transition-colors">{song.title}</span>
                          <span className="text-xs text-gray-300 truncate mt-0.5">{song.artist}</span>
                          
                          <div className="mt-2 flex items-center gap-4">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleFavorite(dbSong ? dbSong.id : song.videoId, isFav ? 0 : 1, song);
                                }}
                                className={`hover:scale-110 active:scale-95 transition-all ${
                                  isFav ? 'text-red-500' : 'text-white/40 hover:text-white'
                                }`}
                                title={isFav ? "Remove from favorites" : "Add to favorites"}
                              >
                                <Heart size={13} fill={isFav ? "currentColor" : "none"} />
                              </button>

                              {isDownloaded ? (
                                <span className="text-[10px] text-green-400 font-semibold flex items-center gap-0.5">
                                  <Check size={10} strokeWidth={3} /> Saved
                                </span>
                              ) : isDownloading ? (
                                <span className="text-[10px] text-blue-400 font-semibold flex items-center gap-0.5 animate-pulse">
                                  <CloudDownload size={10} /> Saving...
                                </span>
                              ) : (
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    startDownload(song);
                                  }}
                                  className="text-white/40 hover:text-white hover:scale-110 active:scale-95 transition-all"
                                  title="Download to library"
                                >
                                  <CloudDownload size={12} />
                                </button>
                              )}

                              {/* Do Not Recommend (Blacklist) */}
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  addToBlacklist(song);
                                }}
                                className="text-white/30 hover:text-red-500 hover:scale-110 active:scale-95 transition-all ml-auto"
                                title="Do not recommend this song again"
                              >
                                <X size={12} strokeWidth={2.5} />
                              </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </section>
      )}



      {/* Your Songs and Your Albums removed to For You view */}

      {/* 2. Trendy Songs Row */}
      <section className={ytSearchResults ? 'order-2' : 'order-4'} style={{ contentVisibility: 'auto', containIntrinsicSize: '0 300px' }}>
        <div className="flex items-center justify-between mb-4 px-4">
          <h2 className="text-xl font-bold text-white tracking-tight">
            {ytSearchResults ? 'Search Results' : 'Trendy Songs'}
          </h2>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <button onClick={() => scrollContainer(songScrollRef, 'left')} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors">
                <ChevronLeft size={16} />
              </button>
              <button onClick={() => scrollContainer(songScrollRef, 'right')} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-transform active:scale-95">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
        <div ref={songScrollRef} className="flex overflow-x-auto gap-6 pb-4 pt-4 px-4 -mt-4 hide-scrollbar">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={`trend-skel-${i}`} className="flex flex-col gap-3 flex-shrink-0 w-44">
                <div className="w-44 h-56 rounded-2xl bg-white/5 animate-pulse" />
                <div className="flex flex-col gap-2 px-1">
                  <div className="w-3/4 h-4 bg-white/5 rounded animate-pulse" />
                  <div className="w-1/2 h-3 bg-white/5 rounded animate-pulse" />
                </div>
              </div>
            ))
          ) : ytSearchResults && ytSearchResults.length === 0 ? (
            <div className="text-sm text-gray-500 px-4 py-4 w-full">No matching songs found.</div>
          ) : (
            (ytSearchResults || trendingSongs).map((song) => {
              const dbSong = allSongs?.find(s => s.filepath === `yt-stream://${song.videoId}`);
              const isFav = dbSong?.favorite === 1;
              const isDownloaded = allSongs?.some(s => 
                s.filepath && 
                !s.filepath.startsWith('yt-stream://') && 
                s.title?.toLowerCase() === song.title?.toLowerCase() &&
                s.artist?.toLowerCase() === song.artist?.toLowerCase()
              );
              const isDownloading = downloadState?.active?.some(job => job.videoId === song.videoId) || 
                                    downloadState?.queue?.some(job => job.videoId === song.videoId);

              return (
                <div 
                  key={song.videoId} 
                  onClick={() => playTrack(song, ytSearchResults || trendingSongs)}
                  onMouseEnter={() => preloadTrack(song)}
                  className="flex flex-col gap-3 flex-shrink-0 w-44 cursor-pointer group hover:z-10"
                >
                  <div className="w-44 h-56 rounded-2xl overflow-hidden border border-white/10 shadow-xl relative transition-transform duration-300 group-hover:-translate-y-2 group-active:scale-95 isolate will-change-transform">
                    {(song.coverUrl || song.thumbnail) ? (
                      <RetryImage src={getArtworkUrl(getMediumResUrl(song.coverUrl || song.thumbnail))} fallbackSrc={song.coverUrl || song.thumbnail} alt={song.title} loading="lazy" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-white/10 to-transparent flex items-center justify-center">
                        <Disc size={40} className="text-white/20" />
                      </div>
                    )}
                    {/* Hover Overlay Buttons & Play */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                      <div className="absolute top-2 right-2 flex items-center gap-1.5 z-20">
                        {isDownloaded ? (
                          <div className="w-7 h-7 rounded-full bg-black/85 flex items-center justify-center text-green-400 shadow-lg border border-white/10" title="Downloaded">
                            <Check size={12} strokeWidth={3} />
                          </div>
                        ) : isDownloading ? (
                          <div className="w-7 h-7 rounded-full bg-black/85 flex items-center justify-center text-blue-400 shadow-lg border border-white/10" title="Downloading...">
                            <CloudDownload size={12} className="animate-pulse" />
                          </div>
                        ) : (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              startDownload(song);
                            }}
                            className="w-7 h-7 rounded-full bg-black/80 hover:bg-black/95 flex items-center justify-center text-white/80 hover:text-white hover:scale-110 active:scale-95 transition-all shadow-lg border border-white/10"
                            title="Download to library"
                          >
                            <CloudDownload size={12} />
                          </button>
                        )}

                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(dbSong ? dbSong.id : song.videoId, isFav ? 0 : 1, song);
                          }}
                          className={`w-7 h-7 rounded-full bg-black/80 hover:bg-black/95 flex items-center justify-center hover:scale-115 active:scale-95 transition-all shadow-lg border border-white/10 ${
                            isFav ? 'text-red-500' : 'text-white/80 hover:text-white'
                          }`}
                          title={isFav ? "Remove from favorites" : "Add to favorites"}
                        >
                          <Heart size={12} fill={isFav ? "currentColor" : "none"} />
                        </button>
                      </div>
                      <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-2xl transform scale-75 group-hover:scale-100 transition-transform duration-300">
                        <Play size={20} className="text-black ml-1" fill="currentColor" />
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col min-w-0 px-1">
                    <span className="text-sm font-bold text-white truncate">{song.title}</span>
                    <span className="text-xs text-gray-400 truncate">{song.artist}</span>
                  </div>
                </div>
              );
            }))}
        </div>
      </section>

      {ytAlbumSearchResults && (
        <section className="order-3" style={{ contentVisibility: 'auto', containIntrinsicSize: '0 260px' }}>
          <div className="flex items-center justify-between mb-4 px-4 mt-6">
            <h2 className="text-xl font-bold text-white tracking-tight">
              Albums
            </h2>
            <div className="flex items-center gap-2">
              <button onClick={() => scrollContainer(searchAlbumScrollRef, 'left')} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors">
                <ChevronLeft size={16} />
              </button>
              <button onClick={() => scrollContainer(searchAlbumScrollRef, 'right')} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-transform active:scale-95">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <div ref={searchAlbumScrollRef} className="flex overflow-x-auto gap-6 pb-4 pt-4 px-4 -mt-4 hide-scrollbar">
            {ytAlbumSearchResults.length === 0 ? (
              loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={`album-skel-${i}`} className="flex flex-col gap-3 flex-shrink-0 w-44">
                    <div className="w-44 h-44 rounded-2xl bg-white/5 animate-pulse" />
                    <div className="flex flex-col gap-2 px-1">
                      <div className="w-3/4 h-4 bg-white/5 rounded animate-pulse" />
                      <div className="w-1/2 h-3 bg-white/5 rounded animate-pulse" />
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-gray-500 px-4 py-4 w-full">No matching albums found.</div>
              )
            ) : (
              ytAlbumSearchResults.map((album, i) => (
              <div 
                key={album.id + '-' + i} 
                onClick={() => viewYtAlbum(album.id, album.title)}
                className="flex flex-col gap-3 flex-shrink-0 w-44 cursor-pointer group hover:z-10"
              >
                <div className="w-44 h-44 rounded-2xl overflow-hidden border border-white/10 shadow-xl relative transition-transform duration-300 group-hover:-translate-y-2 group-active:scale-95 isolate will-change-transform">
                  {album.coverUrl ? (
                    <RetryImage src={getArtworkUrl(getMediumResUrl(album.coverUrl))} alt={album.title} loading="lazy" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-white/10 to-transparent flex items-center justify-center">
                      <Disc size={40} className="text-white/20" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                    <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center shadow-2xl transform scale-75 group-hover:scale-100 transition-transform duration-300">
                      <Play size={20} className="text-black ml-1" fill="currentColor" />
                    </div>
                  </div>
                </div>
                <div className="flex flex-col min-w-0 px-1">
                  <span className="text-sm font-bold text-white truncate">{album.title}</span>
                  <span className="text-xs text-gray-400 truncate">{album.artist} {album.year ? `• ${album.year}` : ''}</span>
                </div>
              </div>
            )))}
          </div>
        </section>
      )}

      {/* 3. Recently Played */}
      {!ytSearchResults && (
        <section className="order-7" style={{ contentVisibility: 'auto', containIntrinsicSize: '0 300px' }}>
          <div className="flex items-center justify-between mb-4 px-4">
            <h2 className="text-xl font-bold text-white tracking-tight">Recently Played</h2>
            <div className="flex items-center gap-2">
              <button className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors">
                <ChevronLeft size={16} />
              </button>
              <button className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          
          {recentlyPlayed.length > 0 ? (
            <div className="flex flex-col md:flex-row gap-6 px-4">
              {/* Main Featured Card */}
              <div 
                onClick={() => playTrack(recentlyPlayed[0], recentlyPlayed)}
                className="flex-shrink-0 w-full md:w-64 h-64 rounded-3xl overflow-hidden relative group cursor-pointer border border-white/10 shadow-2xl transition-transform duration-300 hover:scale-[1.02] will-change-transform"
              >
                 <RetryImage src={recentlyPlayed[0].isStream ? getHighResUrl(recentlyPlayed[0].artwork_path || recentlyPlayed[0].coverUrl) : getMediaUrl(recentlyPlayed[0].artwork_path)} fallbackSrc={recentlyPlayed[0].artwork_path || recentlyPlayed[0].coverUrl} alt={recentlyPlayed[0].title} className="w-full h-full object-cover" />
                 <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-6">
                    <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mb-4 text-white group-hover:scale-110 transition-transform">
                     <Play size={20} className="ml-1" fill="currentColor" />
                   </div>
                   <span className="text-lg font-bold text-white truncate">{recentlyPlayed[0].title}</span>
                   <span className="text-sm text-gray-300 truncate">{recentlyPlayed[0].artist}</span>
                 </div>
              </div>
  
              {/* List Cards */}
              <div className="flex-1 flex flex-col gap-3">
                {recentlyPlayed.slice(1, 4).map((song) => (
                  <div 
                    key={song.id || song.videoId} 
                    onClick={() => playTrack(song, recentlyPlayed)}
                    className="bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl p-3 flex items-center gap-4 transition-colors cursor-pointer group"
                  >
                    <div className="w-14 h-14 rounded-full overflow-hidden flex-shrink-0 relative">
                      <RetryImage src={song.isStream ? getHighResUrl(song.artwork_path || song.coverUrl) : getMediaUrl(song.artwork_path)} fallbackSrc={song.artwork_path || song.coverUrl} alt={song.title} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <Play size={16} className="text-white ml-0.5" fill="currentColor" />
                      </div>
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col">
                      <span className="text-xs text-gray-400 truncate">{song.artist}</span>
                      <span className="text-sm font-bold text-white truncate">{song.title}</span>
                    </div>
                    <button className="w-10 h-10 flex items-center justify-center text-white/50 hover:text-white transition-colors transform active:scale-95 ml-4">
                      <Play size={20} className="ml-0.5" fill="currentColor" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-sm text-gray-500 px-4">No recently played tracks found.</div>
          )}
        </section>
      )}

    </div>
  );
}
