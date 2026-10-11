'use strict';

// Only CPU memory is reported to V8: counting textures made new images force full
// garbage collections (7 instead of 1 while 120 new frames played).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PerformanceObserver, constants } = require('node:perf_hooks');
const { png } = require('./helpers/png.cjs');
const { temporaryDirectory } = require('./helpers/temp.cjs');

const root = temporaryDirectory('external-memory-');
const size = 1024, count = 48;
const pixels = Buffer.alloc(size * size * 4);
for (let i = 0; i < pixels.length; i += 4) pixels.set([200, 40, 90, 255], i);
fs.writeFileSync(path.join(root, 'p0.png'), png(size, size, pixels));
for (let n = 1; n < count; n++) fs.copyFileSync(path.join(root, 'p0.png'), path.join(root, `p${n}.png`));
const native = require(path.resolve(process.argv[2]));
native.initialize({ gameRoot: root, assetRoot: '', width: 32, height: 24, windowTitle: 'pmjs external memory' });

let major = 0;
const observer = new PerformanceObserver(list => {
  for (const entry of list.getEntries()) if (entry.detail.kind === constants.NODE_PERFORMANCE_GC_MAJOR) major++;
});
observer.observe({ entryTypes: ['gc'] });
native.renderScene();
const images = [];
for (let n = 0; n < count; n++) {
  images.push(native.images.load(`p${n}.png`));
  native.renderScene();
}
assert.ok(native.images.memory(0).gpuBytes >= count * size * size * 4, 'the images are on the GPU');
setTimeout(() => {
  observer.disconnect();
  assert.equal(major, 0, `192 MB of textures caused ${major} full garbage collections`);
  for (const image of images) native.images.release(image.handle);
  console.log('external memory ok');
}, 100);
