const ytmusic = require('ytmusic-api');
const fs = require('fs');
const api = new ytmusic();
const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(api));
fs.writeFileSync('c:/Users/saiye/Desktop/Stero update/Stero/methods.txt', methods.join('\n'));
