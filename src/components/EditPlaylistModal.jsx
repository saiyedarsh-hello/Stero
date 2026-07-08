import { useState, useEffect, useRef } from 'react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useShallow } from 'zustand/react/shallow';
import { X, Search, Check } from 'lucide-react';

export default function EditPlaylistModal({ playlist, onClose }) {
  const { songs, updateCustomAlbum } = usePlayerStore(useShallow(state => ({
    songs: state.songs,
    updateCustomAlbum: state.updateCustomAlbum
  })));

  const [name, setName] = useState(playlist?.name || '');
  const [coverPath, setCoverPath] = useState(playlist?.cover_path || '');
  const [selectedSongIds, setSelectedSongIds] = useState(() => {
    return playlist?.songs?.map(s => s.id) || [];
  });
  const [searchQuery, setSearchQuery] = useState('');

  const listWrapperRef = useRef(null);
  const listContentRef = useRef(null);


  // Lenis smooth scroll removed for performance optimization

  const toggleSong = (songId) => {
    setSelectedSongIds(prev =>
      prev.includes(songId) ? prev.filter(id => id !== songId) : [...prev, songId]
    );
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    await updateCustomAlbum(playlist.id, name.trim(), coverPath.trim(), selectedSongIds);
    onClose();
  };

  const filteredSongs = songs.filter(song =>
    song.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    song.artist?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center animate-fade-in px-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="bg-white/[0.02] backdrop-blur-[35px] border border-white/8 shadow-[15px_15px_40px_rgba(0,0,0,0.3)] rounded-2xl w-full max-w-2xl relative z-10 flex flex-col overflow-hidden max-h-[75vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
          <h2 className="text-lg font-bold text-white">Edit Playlist</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white p-1 rounded-md hover:bg-white/5 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-6 custom-scrollbar">

          {/* Metadata Fields */}
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Playlist Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white font-medium focus:outline-none focus:border-white/50 focus:bg-white/10 transition-all"
                placeholder="Name your playlist..."
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wider">Cover Image URL (Optional)</label>
              <input
                type="text"
                value={coverPath}
                onChange={(e) => setCoverPath(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white font-medium focus:outline-none focus:border-white/50 focus:bg-white/10 transition-all"
                placeholder="https://..."
              />
            </div>
          </div>

          <div className="w-full h-px bg-white/5 my-2"></div>

          {/* Song Selection */}
          <div className="flex flex-col gap-3 flex-1 min-h-[150px]">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-medium text-gray-400 uppercase tracking-wider">Manage Tracks</label>
              <span className="text-xs text-white/70 font-medium bg-white/10 px-2 py-0.5 rounded-full">
                {selectedSongIds.length} Selected
              </span>
            </div>

            {/* Search Bar for Songs */}
            <div className="relative">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-black/20 border border-white/5 rounded-xl pl-9 pr-4 py-2 text-sm text-white font-medium focus:outline-none focus:border-white/20 transition-all"
                placeholder="Search library to add/remove..."
              />
            </div>

            {/* Scrollable Song List */}
            <div
              ref={listWrapperRef}
              className="flex-1 overflow-y-auto bg-black/10 rounded-xl border border-white/5 p-1.5 custom-scrollbar"
            >
              <div ref={listContentRef} className="flex flex-col gap-1.5">
                {filteredSongs.map(song => {
                  const isSelected = selectedSongIds.includes(song.id);
                  return (
                    <div
                      key={song.id}
                      onClick={() => toggleSong(song.id)}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all ${isSelected ? 'bg-white/10 hover:bg-white/15' : 'hover:bg-white/5'
                        }`}
                    >
                      <div className={`w-4 h-4 rounded-[4px] border flex items-center justify-center transition-colors flex-shrink-0 ${isSelected ? 'bg-white border-white text-black' : 'border-white/20'
                        }`}>
                        {isSelected && <Check size={10} strokeWidth={3} />}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className={`text-sm truncate font-medium ${isSelected ? 'text-white' : 'text-gray-300'}`}>
                          {song.title}
                        </span>
                        <span className="text-[10px] text-gray-500 truncate">
                          {song.artist}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {filteredSongs.length === 0 && (
                  <div className="text-center py-8 text-xs text-gray-500">
                    No songs found.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-white/5 bg-white/[0.02] flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-xs font-bold text-gray-400 hover:text-white hover:bg-white/5 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-white text-black hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 shadow-lg"
          >
            Save Playlist
          </button>
        </div>
      </div>
    </div>
  );
}
