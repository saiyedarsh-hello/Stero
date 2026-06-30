const ytmusic = require('ytmusic-api');
const fs = require('fs');
const api = new ytmusic();
api.initalize()
  .then(() => api.searchAlbums('Dua Lipa'))
  .then(res => {
    return api.getAlbum(res[0].albumId);
  })
  .then(album => {
    fs.writeFileSync('c:/Users/saiye/Desktop/Stero update/Stero/test-album-output.txt', JSON.stringify(album, null, 2));
  })
  .catch(err => {
    fs.writeFileSync('c:/Users/saiye/Desktop/Stero update/Stero/test-album-output.txt', 'Error: ' + err.message + '\n' + err.stack);
  });
