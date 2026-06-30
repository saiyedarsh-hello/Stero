import { useState } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useShallow } from 'zustand/react/shallow';
import { FolderHeart, Plus, Trash2, Music, Play, Pause } from 'lucide-react';
import CreateAlbumModal from './CreateAlbumModal';
import HoldToDeleteButton from './HoldToDeleteButton';

const getMediaUrl = (path) => {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `media://local/?path=${encodeURIComponent(path)}`;
};

const getHighResUrl = (url) => {
  if (!url) return '';
  if (url.includes('googleusercontent.com') || url.includes('ggpht.com')) {
    if (url.includes('=')) {
      return url.replace(/=w\d+-h\d+/i, '=w512-h512');
    }
  }
  return url.replace(/=w\d+-h\d+/i, '=w512-h512');
};

export default function AlbumGrid() {
  const { 
    customAlbums, 
    searchQuery, 
    setActiveView, 
    deleteCustomAlbum,
    isPlaying,
    activeTrack,
    playTrack,
    togglePlay
  } = usePlayerStore(useShallow(state => ({
    customAlbums: state.customAlbums,
    searchQuery: state.searchQuery,
    setActiveView: state.setActiveView,
    deleteCustomAlbum: state.deleteCustomAlbum,
    isPlaying: state.isPlaying,
    activeTrack: state.activeTrack,
    playTrack: state.playTrack,
    togglePlay: state.togglePlay
  })));
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const filtered = customAlbums.filter(album => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    
    const searchTerms = q.split(/\s+/);
    const albumName = album.name.toLowerCase();
    
    return searchTerms.every(term => albumName.includes(term));
  });

  const handleAlbumClick = (album) => {
    setActiveView('album-detail', { albumName: album.name, albumId: album.id });
  };

  const handlePlayAlbum = (e, album) => {
    e.stopPropagation();
    if (!album.songs || album.songs.length === 0) return;

    const isCurrentAlbum = activeTrack && album.songs.some(s => s.id === activeTrack.id);
    if (isCurrentAlbum) {
      togglePlay();
    } else {
      playTrack(album.songs[0], album.songs, album.id);
    }
  };

  const handleDelete = async (e, albumId) => {
    if (e) e.stopPropagation();
    setDeletingId(albumId);
    await deleteCustomAlbum(albumId);
    setDeletingId(null);
  };

  return (
    <>
      <div className="flex flex-col gap-6 select-none animate-fade-in">

        {/* Header row */}
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest block mb-1">Your Collection</span>
            <h2 className="text-2xl font-extrabold text-white tracking-wide">Playlists</h2>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold text-white transition-all active:scale-95 bg-white/5 backdrop-blur-md border border-white/20 hover:bg-white/10"
          >
            <Plus size={16} strokeWidth={2.5} />
            <span>Create Playlist</span>
          </button>
        </div>

        {/* Album grid or empty state */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-6">
            <div className="w-20 h-20 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center text-white/20">
              <FolderHeart size={40} />
            </div>
            <div>
              <p className="text-white font-semibold text-base mb-1">
                {searchQuery ? 'No playlists match your search' : 'No playlists yet'}
              </p>
              <p className="text-gray-500 text-sm max-w-xs">
                {searchQuery ? 'Try a different search term.' : 'Create your first playlist by clicking "Create Playlist" above. Assign songs and give it a cover.'}
              </p>
            </div>
            {!searchQuery && (
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 bg-white/10 hover:bg-white/15 border border-white/15 text-white px-6 py-2.5 rounded-full text-xs font-bold transition-all active:scale-95"
              >
                <Plus size={13} />
                <span>Create your first playlist</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-5">
            {filtered.map(album => {
              const isCurrentAlbumPlaying = isPlaying && activeTrack && (album.songs || []).some(s => s.id === activeTrack.id);
              return (
                <div
                  key={album.id}
                  onClick={() => handleAlbumClick(album)}
                  className="bg-white/2 border border-white/10 hover:border-white/25 hover:bg-white/5 backdrop-blur-md rounded-2xl p-4 flex flex-col cursor-pointer transition-all duration-300 hover:-translate-y-1 shadow-lg group relative"
                >
                  {/* Album cover */}
                  <div className="w-full aspect-square rounded-xl bg-white/5 flex items-center justify-center mb-3.5 shadow-md overflow-hidden border border-white/5 relative">
                    {album.cover_path ? (
                      <img
                        src={getHighResUrl(getMediaUrl(album.cover_path))}
                        alt={album.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : album.songs && album.songs[0]?.has_artwork && album.songs[0]?.artwork_path ? (
                      <img
                        src={getHighResUrl(getMediaUrl(album.songs[0].artwork_path))}
                        alt={album.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <Music size={36} className="text-white/30" />
                    )}

                    {/* Floating Play Button */}
                    {album.songs && album.songs.length > 0 && (
                      <button
                        onClick={(e) => handlePlayAlbum(e, album)}
                        className={`absolute bottom-2.5 right-2.5 w-10 h-10 rounded-full bg-white hover:bg-white/95 text-[#141416] flex items-center justify-center shadow-2xl transition-all duration-300 transform cursor-pointer z-10 ${
                          isCurrentAlbumPlaying
                            ? 'opacity-100 scale-100'
                            : 'opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 scale-90 hover:scale-105 active:scale-95'
                        }`}
                        title={isCurrentAlbumPlaying ? 'Pause Playlist' : 'Play Playlist'}
                      >
                        {isCurrentAlbumPlaying ? (
                          <Pause size={14} fill="currentColor" />
                        ) : (
                          <Play size={14} fill="currentColor" className="ml-0.5" />
                        )}
                      </button>
                    )}
                  </div>

                  <h4 className="text-sm font-semibold tracking-wide text-white truncate">{album.name}</h4>
                  <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mt-1.5 block">
                    {(album.songs || []).length} track{(album.songs || []).length !== 1 ? 's' : ''}
                  </span>

                  {/* Delete button */}
                  <div 
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-all duration-200 z-20"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <HoldToDeleteButton onComplete={() => handleDelete(null, album.id)} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showCreateModal && (
        <CreateAlbumModal onClose={() => setShowCreateModal(false)} />
      )}
    </>
  );
}
