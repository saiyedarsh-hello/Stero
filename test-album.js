const ytmusic = require('ytmusic-api');
const api = new ytmusic();
api.initalize()
  .then(() => api.searchAlbums('Dua Lipa'))
  .then(res => {
    console.log("Album ID:", res[0].albumId);
    return api.getAlbum(res[0].albumId);
  })
  .then(album => {
    console.log("Album Title:", album.name || album.title);
    console.log("Tracks:", album.songs ? album.songs.length : (album.tracks ? album.tracks.length : 0));
  })
  .catch(console.error);
