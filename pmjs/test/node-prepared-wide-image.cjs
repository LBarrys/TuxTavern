'use strict';
// TuxTavern: Netorare God V0.11's side-view battlers are 14175 px wide (9 frames of 1575 px), past
// the 8192 px PMJS took, so they loaded neither prepared nor ordinarily. Limits are 16384 as upstream
// (0c3c7a0); its texture artifacts are not ported, and prepared pages draw these.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { temporaryDirectory } = require('./helpers/temp.cjs');
const { png } = require('./helpers/png.cjs');
const { spritePacket, drawPacket } = require('./helpers/sparse-palette.cjs');
const native = require(path.resolve(process.argv[2]));
const root = temporaryDirectory('prepared-wide-');
const width = 14175, height = 384, frameWidth = width / 9, frameHeight = height / 6;
const pixels = Buffer.alloc(width * height * 4);
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++)
  pixels.set([x % 251, y * 3 % 256, (x + y) % 253, 255], (y * width + x) * 4);
const source = 'img/sv_actors/wide.png';
fs.mkdirSync(path.join(root, 'img/sv_actors'), { recursive: true });
fs.writeFileSync(path.join(root, source), png(width, height, pixels));
native.initialize({ gameRoot: root, width: 96, height: 80, windowTitle: 'Wide prepared image', imageWarmCacheBytes: 0 });

(async () => {
  let image;
  try {
    const directory = path.join(root, 'prepared'); fs.mkdirSync(directory);
    const descriptor = await native.assets.processImage(source, directory, { grid: [9, 6] },
      path.join(root, source), null, { pageCodec: 'lz4' });
    assert.equal(descriptor.width, width);
    assert.ok(descriptor.pages.every(page => page.width <= 2048 && page.height <= 2048));
    assert.equal(native.assets.installPrepared([{ source, directory, descriptor,
      sourceIdentity: native.assets.sourceIdentity(source) }]), 1);
    image = await native.images.loadAsync(source);
    assert.equal(image.width, width);
    for (const [column, row] of [[0, 0], [7, 2], [8, 5]]) {
      const reference = native.canvas.create(frameWidth, frameHeight), frame = Buffer.alloc(frameWidth * frameHeight * 4);
      for (let y = 0; y < frameHeight; y++) {
        const start = ((row * frameHeight + y) * width + column * frameWidth) * 4;
        pixels.copy(frame, y * frameWidth * 4, start, start + frameWidth * 4);
      }
      native.canvas.writePixels(reference.handle, 0, 0, frameWidth, frameHeight, frame);
      try {
        const expected = drawPacket(native, spritePacket(native, reference,
          { crop: [0, 0, frameWidth, frameHeight], nearest: true, scale: 0.05, premultiplied: true }));
        const actual = drawPacket(native, spritePacket(native, image,
          { crop: [column * frameWidth, row * frameHeight, frameWidth, frameHeight], nearest: true, scale: 0.05 }));
        let maximum = 0;
        for (let i = 0; i < actual.length; i++) maximum = Math.max(maximum, Math.abs(actual[i] - expected[i]));
        assert.ok(maximum <= 2, `frame ${column},${row}: delta ${maximum}`);
      } finally { native.canvas.release(reference.handle); }
    }
    const canvas = native.canvas.create(frameWidth, 4);
    try {
      native.canvas.drawImage(canvas.handle, image.handle, 8 * frameWidth, 0, frameWidth, 4, 0, 0, frameWidth, 4, 1);
      const read = Buffer.from(native.canvas.readPixels(canvas.handle, 0, 0, frameWidth, 4));
      for (let y = 0; y < 4; y++) assert.deepEqual(read.subarray(y * frameWidth * 4, (y + 1) * frameWidth * 4),
        pixels.subarray((y * width + 8 * frameWidth) * 4, (y * width + width) * 4), 'the last column reads back exactly');
    } finally { native.canvas.release(canvas.handle); }
  } finally {
    if (image) native.images.release(image.handle);
    native.runtime.quit(); fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
