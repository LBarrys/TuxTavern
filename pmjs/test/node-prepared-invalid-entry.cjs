'use strict';
// TuxTavern: in Netorare God V0.11, one image whose prepared layout was out of range (then 8192 px)
// failed installPrepared for all 2829 images. Such an entry is now left to ordinary loading while
// the others install.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { temporaryDirectory } = require('./helpers/temp.cjs');
const { png } = require('./helpers/png.cjs');
const native = require(path.resolve(process.argv[2]));
const root = temporaryDirectory('prepared-invalid-entry-');
const pixels = Buffer.alloc(64 * 64 * 4);
for (let i = 0; i < pixels.length; i += 4) pixels.set([i % 251, i % 241, i % 239, 255], i);
for (const name of ['good.png', 'tall.png']) fs.writeFileSync(path.join(root, name), png(64, 64, pixels));
native.initialize({ gameRoot: root, width: 32, height: 32, windowTitle: 'Prepared invalid entry' });

(async () => {
  try {
    const entries = [];
    for (const source of ['good.png', 'tall.png']) {
      const directory = path.join(root, 'prepared-' + source); fs.mkdirSync(directory);
      const descriptor = await native.assets.processImage(source, directory, { grid: [2, 2] },
        path.join(root, source), null, {});
      assert.ok(descriptor && Array.isArray(descriptor.cells) && descriptor.cells.length, source);
      entries.push({ source, directory, descriptor, sourceIdentity: native.assets.sourceIdentity(source) });
    }
    entries[1].descriptor.cells[0].rect = [0, 0, 32, 20000];
    assert.equal(native.assets.installPrepared(entries), 1, 'the valid image still installs');
    const loaded = native.images.load('tall.png');
    assert.ok(loaded.width === 64 && loaded.height === 64, 'the skipped image loads the ordinary way');
    native.images.release(loaded.handle);
  } finally {
    native.runtime.quit(); fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
