'use strict';

// By default PNGs and JPEGs are decoded and uploaded on first use, not on load.
delete process.env.PMJS_DEFER_IMAGES;

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { png } = require('./helpers/png.cjs');
const { temporaryDirectory } = require('./helpers/temp.cjs');

const root = temporaryDirectory('deferred-images-');
const red = [255, 0, 0, 255], blue = [0, 0, 255, 255];
function write(name, color) {
  // Replaced atomically, as the game filesystem does.
  fs.writeFileSync(path.join(root, name + '.tmp'), png(2, 1, Buffer.from([...color, ...color])));
  fs.renameSync(path.join(root, name + '.tmp'), path.join(root, name));
}
write('frame.png', red);
write('pending.png', red);
write('retained.png', blue);
// A progressive JPEG with an Exif block, named .png as some games ship their frames.
fs.writeFileSync(path.join(root, 'photo.png'), Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/4QBCRXhpZgAASUkqAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/bAEMAAgEBAQEBAgEBAQICAgICBAMCAgICBQQEAwQGBQYGBgUGBgYHCQgGBwkHBgYICwgJCgoKCgoGCAsMCwoMCQoKCv/bAEMBAgICAgICBQMDBQoHBgcKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCv/CABEIABAAGAMBIgACEQEDEQH/xAAVAAEBAAAAAAAAAAAAAAAAAAAACP/EABYBAQEBAAAAAAAAAAAAAAAAAAAGCP/aAAwDAQACEAMQAAABjkb+lQP/xAAUEAEAAAAAAAAAAAAAAAAAAAAg/9oACAEBAAEFAl//xAAUEQEAAAAAAAAAAAAAAAAAAAAQ/9oACAEDAQE/AT//xAAUEQEAAAAAAAAAAAAAAAAAAAAQ/9oACAECAQE/AT//xAAUEAEAAAAAAAAAAAAAAAAAAAAg/9oACAEBAAY/Al//xAAUEAEAAAAAAAAAAAAAAAAAAAAg/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEAAP/8QAFBEBAAAAAAAAAAAAAAAAAAAAEP/aAAgBAwEBPxA//8QAFBEBAAAAAAAAAAAAAAAAAAAAEP/aAAgBAgEBPxA//8QAFBABAAAAAAAAAAAAAAAAAAAAIP/aAAgBAQABPxBf/9k=', 'base64'));
for (let i = 0; i < 1100; i++) write(`many-${i}.png`, i === 1099 ? blue : red);
const native = require(path.resolve(process.argv[2]));
native.initialize({ gameRoot: root, assetRoot: '', width: 32, height: 24, windowTitle: 'pmjs deferred images' });
const entry = image => native.images.memory(50).largest.find(item => item.handle === image.handle);
function canvasPixel(image) {
  const canvas = native.canvas.create(image.width, image.height);
  try {
    native.canvas.drawImage(canvas.handle, image.handle, 0, 0, image.width, image.height,
      0, 0, image.width, image.height, 1);
    return Array.from(native.canvas.readPixels(canvas.handle, 0, 0, 1, 1));
  } finally { native.canvas.release(canvas.handle); }
}
function gpuPixel(image) {
  native.beginFrame();
  native.render.setClearColor(0, 0, 0, 0);
  native.render.image(image.handle, 1, 0, 0, 1, 0, 0, 0, 0, 2, 1, 1, 0xffffff, 0);
  native.renderScene();
  return Array.from(native.canvas.captureSceneRawPremultiplied().slice(0, 4));
}

async function main() {
  const frame = await native.images.loadAsync('frame.png');
  assert.deepEqual([frame.width, frame.height], [2, 1]);
  assert.equal(entry(frame).gpuBytes, 0, 'a loaded PNG must wait for its first use');
  assert.deepEqual(canvasPixel(frame), red, 'canvas drawing decodes a deferred PNG');
  assert.equal(entry(frame).gpuBytes, 0, 'canvas drawing needs no texture');
  assert.deepEqual(gpuPixel(frame), red, 'the first draw decodes and uploads it');
  assert.ok(entry(frame).gpuBytes > 0);
  native.images.release(frame.handle);

  const photo = await native.images.loadAsync('photo.png');
  assert.deepEqual([photo.width, photo.height, entry(photo).gpuBytes], [24, 16, 0], 'a JPEG is sized from its header');
  const [r, g, b] = gpuPixel(photo);
  assert.ok(r < 16 && g < 16 && b > 239, `the JPEG draws blue, not ${[r, g, b]}`);
  native.images.release(photo.handle);

  const pending = native.images.loadAsync('pending.png');
  write('pending.png', blue);
  const old = await pending;
  assert.deepEqual(gpuPixel(old), red, 'a deferred PNG keeps the version that was loaded');
  native.images.release(old.handle);

  const retained = await native.images.loadAsync('retained.png', true);
  assert.ok(entry(retained).cpuBytes > 0, 'CPU pixels are still decoded on load');
  assert.deepEqual(canvasPixel(retained), blue);
  native.images.release(retained.handle);

  const openFiles = () => fs.readdirSync('/proc/self/fd').length;
  const before = openFiles(), gpuBytes = native.images.memory(0).gpuBytes;
  const many = await Promise.all(Array.from({ length: 1100 }, (_, i) => native.images.loadAsync(`many-${i}.png`)));
  assert.equal(native.images.memory(0).gpuBytes, gpuBytes, 'all 1100 wait for their first use');
  assert.ok(openFiles() - before <= 256, `at most 256 deferred files stay open, not ${openFiles() - before}`);
  assert.deepEqual(gpuPixel(many[1099]), blue, 'one past the open-file limit is reopened by path');
  for (const image of many) native.images.release(image.handle);
}

main().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
