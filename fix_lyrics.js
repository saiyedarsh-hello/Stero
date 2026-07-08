const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'electron', 'downloader.cjs');
let content = fs.readFileSync(filePath, 'utf8');

// Normalize to LF for processing
content = content.replace(/\r\n/g, '\n');

// Find the getLyrics function boundaries
const startMarker = '  // ═══════════════════════════════════════════════════════════════════════════\n  // GET LYRICS (uses lrclib.net — free, open, no API key needed)\n  // ═══════════════════════════════════════════════════════════════════════════\n\n  async getLyrics(title, artist) {';

const idx = content.indexOf('  async getLyrics(title, artist) {');
if (idx === -1) {
  console.error('Could not find getLyrics function!');
  process.exit(1);
}

// Find the comment block before it
const commentIdx = content.lastIndexOf('  // ═══', idx);

// Find the end of the function by counting braces
let depth = 0;
let started = false;
let endIdx = idx;
for (let i = idx; i < content.length; i++) {
  if (content[i] === '{') { depth++; started = true; }
  if (content[i] === '}') { depth--; }
  if (started && depth === 0) {
    endIdx = i + 1;
    break;
  }
}

console.log(`Found getLyrics at char ${idx}, ends at ${endIdx}`);
console.log(`Block length: ${endIdx - commentIdx} chars`);

const newFunction = `  // ═══════════════════════════════════════════════════════════════════════════
  // GET LYRICS (multi-source: lrclib.net → lyrics.ovh)
  // ═══════════════════════════════════════════════════════════════════════════

  async getLyrics(title, artist) {
    const makeRequest = (url) => new Promise((resolve, reject) => {
      const mod = url.startsWith('https') ? https : require('http');
      mod.get(url, { headers: { 'User-Agent': 'SteroMusicPlayer/1.0' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          makeRequest(res.headers.location).then(resolve).catch(reject);
          return;
        }
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => resolve({ statusCode: res.statusCode, data }));
      }).on('error', reject);
    });

    // Light clean: removes YouTube suffixes only, does NOT strip feat/ft from artist
    const cleanTitle = (str) => {
      if (!str) return '';
      return str
        .replace(/\\s*[\\(\\[](official\\s*(music\\s*)?video|audio|lyric(s)?|hd|hq|mv|visualizer|4k)[^\\)\\]]*[\\)\\]]/gi, '')
        .replace(/\\s*-\\s*(official\\s*(music\\s*)?video|audio|lyric(s)?|hd|hq|mv|visualizer|4k)\\s*$/gi, '')
        .replace(/\\s+/g, ' ').trim();
    };

    const cleanArtist = (str) => {
      if (!str) return '';
      return str.split(/\\s*[,&]\\s*|\\s+feat\\.?\\s+|\\s+ft\\.?\\s+/i)[0].replace(/\\s+/g, ' ').trim();
    };

    if (!title) return null;

    const rawTitle = cleanTitle(title);
    const rawArtist = cleanArtist(artist || '');

    // Strategy 1: lrclib.net exact GET (synced lyrics preferred)
    try {
      const url = \`https://lrclib.net/api/get?artist_name=\${encodeURIComponent(rawArtist)}&track_name=\${encodeURIComponent(rawTitle)}\`;
      const res = await makeRequest(url);
      if (res.statusCode === 200) {
        const parsed = JSON.parse(res.data);
        if (parsed.syncedLyrics || parsed.plainLyrics) {
          console.log(\`[getLyrics] lrclib exact hit: \${rawTitle}\`);
          return { lyrics: parsed.syncedLyrics || parsed.plainLyrics, isSynced: !!parsed.syncedLyrics };
        }
      }
    } catch (e) { /* try next */ }

    // Strategy 2: lrclib.net search "artist title"
    try {
      const q = \`\${rawArtist} \${rawTitle}\`.trim();
      const res = await makeRequest(\`https://lrclib.net/api/search?q=\${encodeURIComponent(q)}\`);
      if (res.statusCode === 200) {
        const results = JSON.parse(res.data);
        if (Array.isArray(results) && results.length > 0) {
          const match = results.find(r => r.syncedLyrics) || results.find(r => r.plainLyrics);
          if (match) {
            console.log(\`[getLyrics] lrclib search hit (artist+title): \${rawTitle}\`);
            return { lyrics: match.syncedLyrics || match.plainLyrics, isSynced: !!match.syncedLyrics };
          }
        }
      }
    } catch (e) { /* try next */ }

    // Strategy 3: lrclib.net search title only (helps when artist format differs)
    try {
      const res = await makeRequest(\`https://lrclib.net/api/search?q=\${encodeURIComponent(rawTitle)}\`);
      if (res.statusCode === 200) {
        const results = JSON.parse(res.data);
        if (Array.isArray(results) && results.length > 0) {
          const match = results.find(r => r.syncedLyrics) || results.find(r => r.plainLyrics);
          if (match) {
            console.log(\`[getLyrics] lrclib search hit (title only): \${rawTitle}\`);
            return { lyrics: match.syncedLyrics || match.plainLyrics, isSynced: !!match.syncedLyrics };
          }
        }
      }
    } catch (e) { /* try next */ }

    // Strategy 4: lyrics.ovh — good for pop, Bollywood, K-pop, Punjabi
    try {
      const artistEnc = encodeURIComponent(rawArtist || 'unknown');
      const titleEnc = encodeURIComponent(rawTitle);
      const res = await makeRequest(\`https://api.lyrics.ovh/v1/\${artistEnc}/\${titleEnc}\`);
      if (res.statusCode === 200) {
        const parsed = JSON.parse(res.data);
        if (parsed.lyrics && parsed.lyrics.trim().length > 20) {
          console.log(\`[getLyrics] lyrics.ovh hit: \${rawTitle}\`);
          return { lyrics: parsed.lyrics.trim(), isSynced: false };
        }
      }
    } catch (e) { /* try next */ }

    // Strategy 5: lyrics.ovh with original uncleaned title
    const origTitle = (title || '').trim();
    if (origTitle && origTitle !== rawTitle) {
      try {
        const artistEnc = encodeURIComponent(rawArtist || 'unknown');
        const titleEnc = encodeURIComponent(origTitle);
        const res = await makeRequest(\`https://api.lyrics.ovh/v1/\${artistEnc}/\${titleEnc}\`);
        if (res.statusCode === 200) {
          const parsed = JSON.parse(res.data);
          if (parsed.lyrics && parsed.lyrics.trim().length > 20) {
            console.log(\`[getLyrics] lyrics.ovh hit (orig title): \${origTitle}\`);
            return { lyrics: parsed.lyrics.trim(), isSynced: false };
          }
        }
      } catch (e) { /* give up */ }
    }

    console.log(\`[getLyrics] Not found for: "\${rawTitle}" by "\${rawArtist}"\`);
    return null;
  }`;

const before = content.slice(0, commentIdx);
const after = content.slice(endIdx);

const newContent = (before + newFunction + after).replace(/\n/g, '\r\n');
fs.writeFileSync(filePath, newContent, 'utf8');
console.log('SUCCESS: getLyrics replaced with multi-source implementation!');
