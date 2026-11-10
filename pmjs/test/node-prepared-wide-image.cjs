'use strict';
// TuxTavern: Netorare God V0.11's side-view battlers are 14175x3864 (9x6 frames), past the 8192 px
// PMJS took and, at 219 MB as RGBA, past the 128 MiB a prepared image could be. Limits are 16384 px as
// upstream (0c3c7a0), and a prepared image may be as large as a Chromium canvas; its pages draw it.
// This sheet is 14175x2400, 136 MB.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { temporaryDirectory } = require('./helpers/temp.cjs');
const zlib = require('node:zlib');
const { spritePacket, drawPacket } = require('./helpers/sparse-palette.cjs');
const native = require(path.resolve(process.argv[2]));
const root = temporaryDirectory('prepared-wide-');
const width = 14175, height = 2400, frameWidth = width / 9, frameHeight = height / 6;
// Flat per frame, with a coarse ramp: the PNG stays small, as game art does (PMJS opens up to 64 MiB).
const pixels = Buffer.alloc(width * height * 4);
for (let row = 0; row < 6; row++) {
  const line = Buffer.alloc(width * 4);
  for (let x = 0; x < width; x++) line.set([(x / frameWidth | 0) * 25, row * 40, x >> 6 & 255, 255], x * 4);
  for (let y = row * frameHeight; y < (row + 1) * frameHeight; y++) line.copy(pixels, y * width * 4);
}
// helpers/png.cjs copies the whole image for each row: minutes at this size, so a row-wise encoder.
function png(w, h, rgba) {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]); let crc = 0xffffffff;
    for (const byte of body) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    const out = Buffer.alloc(body.length + 8); out.writeUInt32BE(data.length); body.copy(out, 4);
    out.writeUInt32BE((crc ^ 0xffffffff) >>> 0, out.length - 4); return out;
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(w); header.writeUInt32BE(h, 4); header[8] = 8; header[9] = 6;
  const rows = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) rgba.copy(rows, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
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
