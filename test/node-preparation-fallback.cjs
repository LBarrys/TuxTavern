'use strict';
// Images the ordinary loader reads but preparation cannot (upstream PMJS dfe20ae) are recorded as
// unsupported, so preparation keeps the fallback instead of failing the file on every boot.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { temporaryDirectory } = require('./helpers/temp.cjs');
const native = require(path.resolve(process.argv[2]));
const root = temporaryDirectory('preparation-fallback-');
const { png } = require('./helpers/png.cjs');
const pixels = Buffer.alloc(64 * 64 * 4);
for (let i = 0; i < pixels.length; i += 4) pixels.set([i % 251, i % 241, i % 239, 255], i);
const image = png(64, 64, pixels);
// A flipped IDAT byte with a fixed-up CRC: libpng's strict preparation decoder rejects it, the
// ordinary loader recovers the rows it can.
const recovered = Buffer.from(image);
for (let offset = 8; offset < recovered.length;) {
  const length = recovered.readUInt32BE(offset);
  if (recovered.toString('ascii', offset + 4, offset + 8) === 'IDAT') {
    recovered[offset + 8 + length - 1] ^= 1;
    let crc = 0xffffffff;
    for (const byte of recovered.subarray(offset + 4, offset + 8 + length)) {
      crc ^= byte;
      for (let bit = 0; bit < 8; ++bit) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    recovered.writeUInt32BE((crc ^ 0xffffffff) >>> 0, offset + 8 + length);
  }
  offset += length + 12;
}
fs.writeFileSync(path.join(root, 'recovered.png'), recovered);
fs.writeFileSync(path.join(root, 'broken.png'), Buffer.concat([image.subarray(0, 33), Buffer.alloc(64)]));
native.initialize({ gameRoot: root, width: 32, height: 32, windowTitle: 'Preparation fallback' });

(async () => {
  try {
    const prepare = name => {
      const directory = path.join(root, 'prepared-' + name); fs.mkdirSync(directory);
      return native.assets.processImage(name, directory, { grid: [1, 1] }, path.join(root, name), null, {});
    };
    assert.equal(await prepare('recovered.png'), null, 'a recoverable PNG falls back to ordinary loading');
    await assert.rejects(prepare('broken.png'), 'an image nothing can decode still fails');
    const loaded = native.images.load('recovered.png');
    assert.ok(loaded.width > 0 && loaded.height > 0);
    native.images.release(loaded.handle);
  } finally {
    native.runtime.quit(); fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
