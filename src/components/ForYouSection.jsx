import { useState, useEffect, useRef } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useShallow } from 'zustand/react/shallow';
import { ChevronLeft, ChevronRight, Play, Heart, Disc, CloudDownload, Check } from 'lucide-react';
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

const getMediumResUrl = (url) => {
  if (!url) return '';
  if (url.includes('googleusercontent.com') || url.includes('ggpht.com')) {
    if (url.includes('=')) {
      return url.replace(/=w\d+-h\d+/i, '=w600-h600');
    }
  }
  return url.replace(/=w\d+-h\d+/i, '=w600-h600');
};

export default function ForYouSection() {
  const {
    activeTrack,
    playTrack,
    preloadTrack,
    songs: allSongs,
    followedArtists,
    followedArtistSongs,
    followedArtistAlbums,
    customAlbums,
    toggleFavorite,
    downloadState,
    startDownload,
    viewYtAlbum,
    setActiveView
  } = usePlayerStore(useShallow(state => ({
    activeTrack: state.activeTrack,
    playTrack: state.playTrack,
    preloadTrack: state.preloadTrack,
    songs: state.songs,
    followedArtists: state.followedArtists,
    followedArtistSongs: state.followedArtistSongs,
    followedArtistAlbums: state.followedArtistAlbums,
    customAlbums: state.customAlbums,
    toggleFavorite: state.toggleFavorite,
    downloadState: state.downloadState,
    startDownload: state.startDownload,
    viewYtAlbum: state.viewYtAlbum,
    setActiveView: state.setActiveView
  })));

  const followedScrollRef = useRef(null);
  const followedAlbumScrollRef = useRef(null);
  const customAlbumsScrollRef = useRef(null);
  const likedScrollRef = useRef(null);

  const scrollContainer = (ref, direction) => {
    if (ref.current) {
      const amount = direction === 'left' ? -400 : 400;
      ref.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };

  useEffect(() => {
    if (followedArtists && followedArtists.length > 0) {
      usePlayerStore.getState().fetchFollowedArtistsSongs(followedArtists);
      usePlayerStore.getState().fetchFollowedArtistsAlbums(followedArtists);
    }
  }, [followedArtists]);

  const likedSongs = allSongs ? allSongs.filter(s => s.favorite === 1) : [];
  const hasContent = (followedArtistSongs && followedArtistSongs.length > 0) || 
                      (followedArtistAlbums && followedArtistAlbums.length > 0) || 
                      (likedSongs.length > 0);

  // Group songs into 3 rows for horizontal layout
  const rowsCount = Math.min(3, (followedArtistSongs || []).length);
  const rowSongsList = Array.from({ length: rowsCount }).map((_, rowIndex) => {
    return (followedArtistSongs || []).filter((_, idx) => idx % rowsCount === rowIndex);
  });

  // Group liked songs into 2 rows for horizontal layout
  const likedRowsCount = Math.min(2, (likedSongs || []).length);
  const rowLikedSongsList = Array.from({ length: likedRowsCount }).map((_, rowIndex) => {
    return (likedSongs || []).filter((_, idx) => idx % likedRowsCount === rowIndex);
  });

  return (
    <div className="flex flex-col gap-10 select-none animate-fade-in pb-10">
      <div className="px-4 mt-2 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight">For You</h1>
          <p className="text-sm text-gray-400 mt-1">Personalized songs, albums, and your favorite tracks.</p>
        </div>
      </div>

      {!hasContent ? (
        <div className="flex flex-col items-center justify-center py-20 text-center px-4 bg-white/2 border border-white/5 rounded-3xl mx-4">
          <Disc size={48} className="text-white/25 mb-4 animate-pulse" />
          <h3 className="text-lg font-bold text-white mb-1">Your personalized feed is empty</h3>
          <p className="text-sm text-gray-400 max-w-xs mb-6">Follow your favorite artists to update the page with personalized songs and albums.</p>
          <button
            onClick={() => setActiveView('music')}
            className="px-6 py-2.5 bg-white text-black font-bold text-xs rounded-full hover:bg-white/95 active:scale-95 transition-all"
          >
            Find Artists to Follow
          </button>
        </div>
      ) : (
        <>
          {/* Made For You dashboard card */}
          <div className="mx-4 p-8 rounded-3xl relative overflow-hidden bg-gradient-to-br from-emerald-950/30 via-cyan-950/20 to-black border border-cyan-500/15 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="absolute -top-24 -left-24 w-48 h-48 rounded-full bg-emerald-500/15 blur-[80px]" />
            <div className="absolute -bottom-24 -right-24 w-48 h-48 rounded-full bg-cyan-500/15 blur-[80px]" />
            
            <div className="flex items-center gap-6 z-10">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-black shadow-lg shadow-emerald-500/25">
                <Heart size={28} fill="currentColor" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-white tracking-tight leading-none mb-2">Made For You</h2>
                <p className="text-sm text-gray-400 max-w-md">Your daily mix of music, updated dynamically based on your followed artists and play history.</p>
              </div>
            </div>
            
            <div className="flex gap-4 z-10 bg-cyan-950/30 backdrop-blur-md p-4 rounded-2xl border border-cyan-500/10 self-stretch md:self-auto justify-around">
              <div className="text-center px-4">
                <span className="text-xl font-black text-white">{followedArtists.length}</span>
                <span className="text-[10px] text-gray-400 block uppercase font-bold tracking-widest mt-1">Artists</span>
              </div>
              <div className="w-[1px] bg-white/10 self-stretch" />
              <div className="text-center px-4">
                <span className="text-xl font-black text-white">{likedSongs.length}</span>
                <span className="text-[10px] text-gray-400 block uppercase font-bold tracking-widest mt-1">Favorites</span>
              </div>
              <div className="w-[1px] bg-white/10 self-stretch" />
              <div className="text-center px-4">
                <span className="text-xl font-black text-white">{customAlbums.length}</span>
                <span className="text-[10px] text-gray-400 block uppercase font-bold tracking-widest mt-1">Playlists</span>
              </div>
            </div>
          </div>

          {(!followedArtists || followedArtists.length === 0) && (
            <div className="mx-4 p-6 rounded-2xl bg-white/5 border border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-white mb-1">Follow artists to personalize your feed</h3>
                <p className="text-sm text-gray-400">Follow artists to update this page with their latest songs and albums.</p>
              </div>
              <button
                onClick={() => setActiveView('music')}
                className="px-5 py-2.5 bg-white text-black font-bold text-xs rounded-full hover:bg-white/95 active:scale-95 transition-all self-start md:self-auto"
              >
                Find Artists
              </button>
            </div>
          )}

          {/* Your Songs Row */}
          {followedArtistSongs && followedArtistSongs.length > 0 && (
            <section className="w-full" style={{ contentVisibility: 'auto', containIntrinsicSize: '0 360px' }}>
              <div className="flex items-center justify-between mb-4 px-4">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">Your Songs</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Quick picks based on your followed artists.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => scrollContainer(followedScrollRef, 'left')} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors">
                    <ChevronLeft size={16} />
                  </button>
                  <button onClick={() => scrollContainer(followedScrollRef, 'right')} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-transform active:scale-95">
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
              
              <div ref={followedScrollRef} className="flex flex-col gap-4 overflow-x-auto pb-4 pt-4 px-4 -mt-4 hide-scrollbar">
                {rowSongsList.map((rowSongs, rowIndex) => (
                  <div key={rowIndex} className="flex gap-4 flex-shrink-0">
                    {rowSongs.map((song, i) => {
                      const dbSong = allSongs?.find(s => s.filepath === `yt-stream://${song.videoId}`);
                      const isFav = dbSong?.favorite === 1;
                      const isActive = activeTrack && activeTrack.videoId === song.videoId;
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
                          key={song.videoId + '-' + i}
                          onClick={() => playTrack(song, followedArtistSongs)}
                          onMouseEnter={() => preloadTrack(song)}
                          className={`flex items-center gap-4 p-3 rounded-2xl cursor-pointer transition-all duration-300 w-[300px] flex-shrink-0 ${
                            isActive 
                              ? 'bg-white/10 border-white/20 shadow-md shadow-green-500/5' 
                              : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.06] hover:border-white/10 hover:shadow-lg'
                          } border backdrop-blur-md group`}
                        >
                          <div className="relative w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 shadow-md bg-white/5">
                            {(song.coverUrl || song.thumbnail) ? (
                              <RetryImage src={getArtworkUrl(getMediumResUrl(song.coverUrl || song.thumbnail))} fallbackSrc={song.coverUrl || song.thumbnail} alt={song.title} loading="lazy" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-white/5 flex items-center justify-center">
                                <Disc size={20} className="text-white/20" />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                              <Play size={14} fill="currentColor" className="text-white ml-0.5" />
                            </div>
                          </div>

                          <div className="flex-1 min-w-0">
                            <h4 className={`text-sm font-bold truncate ${isActive ? 'text-green-400 animate-pulse' : 'text-white'}`}>{song.title}</h4>
                            <p className="text-xs text-gray-400 truncate mt-0.5">{song.artist}</p>
                          </div>

                          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                            {isDownloaded ? (
                              <span className="text-green-400" title="Downloaded"><Check size={12} strokeWidth={3} /></span>
                            ) : isDownloading ? (
                              <CloudDownload size={12} className="text-blue-400 animate-pulse" />
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startDownload(song);
                                }}
                                className="p-1 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                                title="Download"
                              >
                                <CloudDownload size={12} />
                              </button>
                            )}

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleFavorite(dbSong?.id || song.videoId, isFav ? 0 : 1, song);
                              }}
                              className={`p-1 rounded-full hover:bg-white/10 transition-colors ${
                                isFav ? 'text-red-500' : 'text-white/60 hover:text-white'
                              }`}
                              title={isFav ? "Remove from favorites" : "Add to favorites"}
                            >
                              <Heart size={12} fill={isFav ? "currentColor" : "none"} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Your Custom Albums (Playlists) Row */}
          {customAlbums && customAlbums.length > 0 && (
            <section className="w-full" style={{ contentVisibility: 'auto', containIntrinsicSize: '0 300px' }}>
              <div className="flex items-center justify-between mb-4 px-4">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">Your Playlists</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Your created custom playlists.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => scrollContainer(customAlbumsScrollRef, 'left')} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors">
                    <ChevronLeft size={16} />
                  </button>
                  <button onClick={() => scrollContainer(customAlbumsScrollRef, 'right')} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-transform active:scale-95">
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
              <div ref={customAlbumsScrollRef} className="flex overflow-x-auto gap-6 pb-4 pt-4 px-4 -mt-4 hide-scrollbar snap-x snap-mandatory">
                {customAlbums.map((album, i) => (
                  <div
                    key={album.id + '-' + i}
                    onClick={() => setActiveView('album-detail', { albumId: album.id, albumName: album.name })}
                    className="flex flex-col gap-2 w-44 flex-shrink-0 cursor-pointer group hover:z-10 snap-start"
                  >
                    <div className="w-44 h-44 rounded-2xl overflow-hidden border border-white/10 shadow-xl relative transition-transform duration-300 group-hover:-translate-y-1.5 group-active:scale-95 isolate will-change-transform bg-white/5">
                      {album.cover_path ? (
                        <RetryImage src={getArtworkUrl(getMediumResUrl(album.cover_path))} alt={album.name} loading="lazy" className="w-full h-full object-cover" />
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
                      <span className="text-sm font-bold text-white truncate group-hover:text-green-400 transition-colors">{album.name}</span>
                      <span className="text-xs text-gray-400 truncate">{album.songs?.length || 0} tracks</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Your Artist Albums Row */}
          {followedArtistAlbums && followedArtistAlbums.length > 0 && (
            <section className="w-full" style={{ contentVisibility: 'auto', containIntrinsicSize: '0 300px' }}>
              <div className="flex items-center justify-between mb-4 px-4">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">Your Albums</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Albums from the artists you follow.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => scrollContainer(followedAlbumScrollRef, 'left')} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors">
                    <ChevronLeft size={16} />
                  </button>
                  <button onClick={() => scrollContainer(followedAlbumScrollRef, 'right')} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-transform active:scale-95">
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
              <div ref={followedAlbumScrollRef} className="flex overflow-x-auto gap-6 pb-4 pt-4 px-4 -mt-4 hide-scrollbar snap-x snap-mandatory">
                {followedArtistAlbums.map((album, i) => (
                  <div
                    key={album.id + '-' + i}
                    onClick={() => viewYtAlbum(album.id, album.title)}
                    className="flex flex-col gap-2 w-44 flex-shrink-0 cursor-pointer group hover:z-10 snap-start"
                  >
                    <div className="w-44 h-44 rounded-2xl overflow-hidden border border-white/10 shadow-xl relative transition-all duration-300 group-hover:-translate-y-1.5 group-hover:border-white/20 group-active:scale-95 isolate will-change-transform bg-white/5">
                      {album.coverUrl ? (
                        <RetryImage src={getArtworkUrl(getMediumResUrl(album.coverUrl))} alt={album.title} loading="lazy" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
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
                      <span className="text-sm font-bold text-white truncate group-hover:text-green-400 transition-colors">{album.title}</span>
                      <span className="text-xs text-gray-400 truncate">{album.artist} {album.year ? `• ${album.year}` : ''}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Liked Songs Row */}
          {likedSongs && likedSongs.length > 0 && (
            <section className="w-full" style={{ contentVisibility: 'auto', containIntrinsicSize: '0 300px' }}>
              <div className="flex items-center justify-between mb-4 px-4">
                <div>
                  <h2 className="text-xl font-bold text-white tracking-tight">Liked Songs</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Your favorite tracks stored in the library.</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => scrollContainer(likedScrollRef, 'left')} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors">
                    <ChevronLeft size={16} />
                  </button>
                  <button onClick={() => scrollContainer(likedScrollRef, 'right')} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-transform active:scale-95">
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
              
              <div ref={likedScrollRef} className="flex flex-col gap-4 overflow-x-auto pb-4 pt-4 px-4 -mt-4 hide-scrollbar">
                {rowLikedSongsList.map((rowSongs, rowIndex) => (
                  <div key={rowIndex} className="flex gap-4 flex-shrink-0">
                    {rowSongs.map((song, i) => {
                      const dbSong = allSongs?.find(s => s.id === song.id || s.filepath === song.filepath);
                      const isFav = true;
                      const isDownloaded = allSongs?.some(s =>
                        s.filepath &&
                        !s.filepath.startsWith('yt-stream://') &&
                        s.title?.toLowerCase() === song.title?.toLowerCase() &&
                        s.artist?.toLowerCase() === song.artist?.toLowerCase()
                      );
                      const isDownloading = downloadState?.active?.some(job => job.videoId === song.videoId || job.videoId === song.id) ||
                                            downloadState?.queue?.some(job => job.videoId === song.videoId || job.videoId === song.id);

                      const trackObj = {
                        ...song,
                        videoId: song.videoId || (song.filepath?.startsWith('yt-stream://') ? song.filepath.replace('yt-stream://', '') : null)
                      };
                      const isActive = activeTrack && activeTrack.videoId === trackObj.videoId;

                      return (
                        <div
                          key={song.id || song.videoId || i}
                          onClick={() => playTrack(trackObj, likedSongs)}
                          onMouseEnter={() => preloadTrack(trackObj)}
                          className={`flex items-center gap-4 p-3 rounded-2xl cursor-pointer transition-all duration-300 w-[300px] flex-shrink-0 ${
                            isActive 
                              ? 'bg-white/10 border-white/20 shadow-md shadow-green-500/5' 
                              : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.06] hover:border-white/10 hover:shadow-lg'
                          } border backdrop-blur-md group`}
                        >
                          <div className="relative w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 shadow-md bg-white/5">
                            {(song.coverUrl || song.thumbnail || song.artwork_path) ? (
                              <RetryImage src={getArtworkUrl(song.artwork_path || getMediumResUrl(song.coverUrl || song.thumbnail))} fallbackSrc={song.coverUrl || song.thumbnail} alt={song.title} loading="lazy" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-white/5 flex items-center justify-center">
                                <Disc size={20} className="text-white/20" />
                              </div>
                            )}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                              <Play size={14} fill="currentColor" className="text-white ml-0.5" />
                            </div>
                          </div>

                          <div className="flex-1 min-w-0">
                            <h4 className={`text-sm font-bold truncate ${isActive ? 'text-green-400 animate-pulse' : 'text-white'}`}>{song.title}</h4>
                            <p className="text-xs text-gray-400 truncate mt-0.5">{song.artist}</p>
                          </div>

                          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                            {isDownloaded ? (
                              <span className="text-green-400" title="Downloaded"><Check size={12} strokeWidth={3} /></span>
                            ) : isDownloading ? (
                              <CloudDownload size={12} className="text-blue-400 animate-pulse" />
                            ) : song.filepath?.startsWith('yt-stream://') ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startDownload(trackObj);
                                }}
                                className="p-1 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors"
                                title="Download"
                              >
                                <CloudDownload size={12} />
                              </button>
                            ) : null}

                            <button
                              onClick={(e) => {
                                  e.stopPropagation();
                                  toggleFavorite(song.id || song.videoId, 0, trackObj);
                              }}
                              className="p-1 rounded-full hover:bg-white/10 text-red-500 transition-colors"
                              title="Remove from favorites"
                            >
                              <Heart size={12} fill="currentColor" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
