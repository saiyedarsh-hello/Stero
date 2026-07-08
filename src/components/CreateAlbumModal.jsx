import { useState, useEffect, useRef } from 'react';
import { X, Upload, Music, Check, Loader2, Search, Plus, Play } from 'lucide-react';
import { usePlayerStore } from '../store/usePlayerStore';
import { useShallow } from 'zustand/react/shallow';

const getMediaUrl = (path) => {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  return `media://local/?path=${encodeURIComponent(path)}`;
};

export default function CreateAlbumModal({ onClose }) {
  const { songs, createCustomAlbum, streamTrack } = usePlayerStore(useShallow(state => ({
    songs: state.songs,
    createCustomAlbum: state.createCustomAlbum,
    streamTrack: state.streamTrack
  })));

  const [name, setName] = useState('');
  const [coverPath, setCoverPath] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [songSearch, setSongSearch] = useState('');
  const [ytResults, setYtResults] = useState([]);
  const [isSearchingYt, setIsSearchingYt] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pickingImage, setPickingImage] = useState(false);
  const [error, setError] = useState('');
  const overlayRef = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleOverlayClick = (e) => {
    if (e.target === overlayRef.current) onClose();
  };

  const handlePickImage = async () => {
    if (pickingImage) return;
    setPickingImage(true);
    try {
      if (window.electron) {
        const newPath = await window.electron.selectImageFile();
        if (newPath) { setCoverPath(newPath); setPreviewUrl(getMediaUrl(newPath)); }
      } else {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = 'image/*';
        input.onchange = () => {
          const file = input.files[0];
          if (file) { setPreviewUrl(URL.createObjectURL(file)); setCoverPath(file.name); }
        };
        input.click();
      }
    } finally { setPickingImage(false); }
  };

  const toggleSong = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  useEffect(() => {
    if (!songSearch.trim()) {
      setYtResults([]);
      return;
    }
    const delayDebounceFn = setTimeout(async () => {
      setIsSearchingYt(true);
      try {
        if (window.electron && window.electron.ytSearch) {
          const results = await window.electron.ytSearch(`${songSearch} songs`);
          if (results) {
            const mapped = results.map(r => ({
              ...r,
              duration: r.duration?.seconds || r.duration || r.length || 0
            }));
            setYtResults(mapped);
          }
        }
      } catch (err) {
        console.error("YT search failed", err);
      } finally {
        setIsSearchingYt(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [songSearch]);

  const localFiltered = songs.filter(s => {
    if (!songSearch.trim()) {
      return s.favorite === 1 || s.favorite === true;
    }
    const q = songSearch.toLowerCase();
    return (s.title || '').toLowerCase().includes(q) || (s.artist || '').toLowerCase().includes(q);
  });

  const localIds = new Set(localFiltered.map(s => s.filepath?.replace('yt-stream://', '')).filter(Boolean));
  const uniqueYt = ytResults.filter(y => !localIds.has(y.videoId));
  const combinedSongs = [...localFiltered, ...uniqueYt];

  const handleCreate = async () => {
    if (!name.trim()) { setError('Please enter a playlist name.'); return; }
    if (selectedIds.size === 0) { setError('Please select at least one song.'); return; }
    setError('');
    setSaving(true);

    const finalSongIds = [];
    for (const id of selectedIds) {
      if (typeof id === 'string') {
        const trackMeta = ytResults.find(y => y.videoId === id);
        if (trackMeta && window.electron) {
          try {
            const newDbSong = await window.electron.addStreamSongToDb(trackMeta);
            finalSongIds.push(newDbSong.id);
          } catch (e) {
            console.error(e);
          }
        }
      } else {
        finalSongIds.push(id);
      }
    }

    await createCustomAlbum(name.trim(), coverPath, finalSongIds);
    if (usePlayerStore.getState().fetchLibrary) {
      usePlayerStore.getState().fetchLibrary();
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => { setSaved(false); onClose(); }, 700);
  };

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center animate-fade-in px-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="bg-white/[0.02] backdrop-blur-[35px] border border-white/8 shadow-[15px_15px_40px_rgba(0,0,0,0.3)] rounded-2xl w-full max-w-2xl relative z-10 flex flex-col overflow-hidden max-h-[75vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
          <h2 className="text-lg font-bold text-white">Create Playlist</h2>
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
                onChange={(e) => { setName(e.target.value); setError(''); }}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white font-medium focus:outline-none focus:border-white/50 focus:bg-white/10 transition-all"
                placeholder="Name your playlist..."
                autoFocus
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
                {selectedIds.size} Selected
              </span>
            </div>

            {/* Search Bar for Songs */}
            <div className="relative">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={songSearch}
                onChange={(e) => setSongSearch(e.target.value)}
                className="w-full bg-black/20 border border-white/5 rounded-xl pl-9 pr-4 py-2 text-sm text-white font-medium focus:outline-none focus:border-white/20 transition-all"
                placeholder="Search library to add/remove..."
              />
            </div>

            {/* Scrollable Song List */}
            <div className="flex-1 overflow-y-auto bg-black/10 rounded-xl border border-white/5 p-1.5 custom-scrollbar">
              <div className="flex flex-col gap-1.5">
                {isSearchingYt ? (
                  <div className="text-center py-8 text-xs text-gray-500">
                    Searching...
                  </div>
                ) : combinedSongs.length === 0 ? (
                  <div className="text-center py-8 text-xs text-gray-500">
                    No songs found.
                  </div>
                ) : combinedSongs.map(song => {
                  const sId = song.id || song.videoId;
                  const isSelected = selectedIds.has(sId);
                  return (
                    <div
                      key={sId}
                      onClick={() => toggleSong(sId)}
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
              </div>
            </div>
            {error && <p className="text-xs text-rose-400 font-medium text-center">{error}</p>}
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
            onClick={handleCreate}
            disabled={saving || saved || !name.trim()}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-white text-black hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 shadow-lg flex items-center gap-2"
          >
            {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Playlist'}
          </button>
        </div>
      </div>
    </div>
  );
}
