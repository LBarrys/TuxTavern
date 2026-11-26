'use strict';
// Prepared PNG pages are written with libpng's fast setting (upstream ef9f41a): unfiltered rows at
// a low compression level, so a game's first launch spends less time encoding pages it reads back
// at once. The pixels are the same.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { temporaryDirectory } = require('./helpers/temp.cjs');
const { png } = require('./helpers/png.cjs');
const native = require(path.resolve(process.argv[2]));
const root = temporaryDirectory('prepared-page-encoding-');
const width = 96, height = 64, pixels = Buffer.alloc(width * height * 4);
// A smooth gradient: libpng's default filtering picks Sub, Up or Paeth for rows like these.
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) pixels.set([x * 2, y * 3, (x + y) & 255, 255], (y * width + x) * 4);
const source = 'img/pictures/gradient.png';
fs.mkdirSync(path.join(root, 'img/pictures'), { recursive: true });
fs.writeFileSync(path.join(root, source), png(width, height, pixels));
native.initialize({ gameRoot: root, width: 96, height: 80, windowTitle: 'Prepared page encoding', imageWarmCacheBytes: 0 });

function rows(file) {
  const bytes = fs.readFileSync(file), idat = [];
  let w, h, colorType;
  for (let at = 8; at < bytes.length;) {
    const length = bytes.readUInt32BE(at), type = bytes.toString('ascii', at + 4, at + 8), data = bytes.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); colorType = data[9]; }
    if (type === 'IDAT') idat.push(data);
    at += length + 12;
  }
  const channels = { 6: 4, 2: 3, 0: 1, 4: 2, 3: 1 }[colorType], stride = w * channels + 1;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  return Array.from({ length: h }, (_, y) => raw[y * stride]);
}

(async () => {
  try {
    const directory = path.join(root, 'prepared'); fs.mkdirSync(directory);
    const descriptor = await native.assets.processImage(source, directory, { grid: [2, 2] }, path.join(root, source), null, { pageCodec: 'png' });
    const pages = descriptor.pages.filter(page => /\.png$/i.test(page.path));
    assert.ok(pages.length > 0, 'a PNG page was written');
    for (const page of pages) {
      const filters = rows(path.join(directory, page.path));
      assert.deepEqual([...new Set(filters)], [0], page.path + ' rows are written unfiltered');
    }
    assert.equal(native.assets.installPrepared([{ source, directory, descriptor,
      sourceIdentity: native.assets.sourceIdentity(source) }]), 1);
    const image = await native.images.loadAsync(source), canvas = native.canvas.create(width, height);
    try {
      native.canvas.drawImage(canvas.handle, image.handle, 0, 0, width, height, 0, 0, width, height, 1);
      assert.deepEqual(Buffer.from(native.canvas.readPixels(canvas.handle, 0, 0, width, height)), pixels,
        'the prepared pixels are unchanged');
    } finally { native.canvas.release(canvas.handle); native.images.release(image.handle); }
    console.log('prepared PNG pages are written unfiltered, with the same pixels');
  } finally {
    native.runtime.quit();
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
