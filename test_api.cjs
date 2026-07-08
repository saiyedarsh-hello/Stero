// test_api.cjs — Quick verification that youtubei.js works locally in Node.js

async function run() {
  console.log('Loading youtubei.js...');
  const { Innertube, UniversalCache } = await import('youtubei.js');

  console.log('Creating Innertube instance (local session, no centralized server)...');
  const yt = await Innertube.create({
    generate_session_locally: true,
    cache: new UniversalCache(false),
  });

  console.log('✅ Innertube initialized successfully\n');

  // --- Test 1: Search songs ---
  console.log('Test 1: Searching songs for "Blinding Lights"...');
  try {
    const res = await yt.music.search('Blinding Lights', { type: 'song' });
    const firstSection = res?.contents?.[0];
    const items = firstSection?.contents || [];
    if (items.length > 0) {
      const first = items[0];
      console.log(`  ✅ Got ${items.length} songs. First: "${first?.title}" by "${first?.author?.name || first?.author}"`);
    } else {
      console.log('  ⚠️  No items found in first section. Full response keys:', Object.keys(res || {}));
    }
  } catch (e) {
    console.error('  ❌ Search failed:', e.message);
  }

  // --- Test 2: Search albums ---
  console.log('\nTest 2: Searching albums for "Taylor Swift"...');
  try {
    const res = await yt.music.search('Taylor Swift', { type: 'album' });
    const firstSection = res?.contents?.[0];
    const items = firstSection?.contents || [];
    if (items.length > 0) {
      const first = items[0];
      console.log(`  ✅ Got ${items.length} albums. First: "${first?.title}"`);
    } else {
      console.log('  ⚠️  No albums found. Full response keys:', Object.keys(res || {}));
    }
  } catch (e) {
    console.error('  ❌ Album search failed:', e.message);
  }

  // --- Test 3: Artist page ---
  console.log('\nTest 3: Getting artist page for Taylor Swift (UCqECaJBUxxagA870qwy5aFQ)...');
  try {
    const artist = await yt.music.getArtist('UCqECaJBUxxagA870qwy5aFQ');
    const sections = artist?.sections || artist?.contents || [];
    console.log(`  ✅ Got artist "${artist?.name}". Sections: ${sections.length}`);
    for (const sec of sections) {
      const title = sec?.title?.toString() || sec?.header?.title?.toString() || '(no title)';
      const count = (sec?.contents || sec?.items || []).length;
      console.log(`    - Section: "${title}" with ${count} items`);
    }
  } catch (e) {
    console.error('  ❌ Artist page failed:', e.message);
  }

  // --- Test 4: Up Next / Recommendations ---
  console.log('\nTest 4: Getting Up Next for videoId "dQw4w9WgXcQ"...');
  try {
    const info = await yt.music.getUpNext('dQw4w9WgXcQ');
    const contents = info?.playlist?.contents || info?.contents || [];
    if (contents.length > 0) {
      const first = contents[0];
      console.log(`  ✅ Got ${contents.length} Up Next items. First: "${first?.title}"`);
    } else {
      console.log('  ⚠️  No Up Next items. Keys:', Object.keys(info || {}));
    }
  } catch (e) {
    console.error('  ❌ Up Next failed:', e.message);
  }

  console.log('\n--- All tests done ---');
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
