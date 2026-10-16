'use strict';
// An MV screen tone (seen on a Karryn's Prison-like map) draws the map's tiles into a filter
// target and composites it back; the composite must sample texel centres across an 816x624
// screen, or tile edges blur into their neighbours toward the bottom-right.
const assert = require('node:assert/strict');
const path = require('node:path');
const { temporaryDirectory } = require('./helpers/temp.cjs');
const native = require(path.resolve(process.argv[2]));
const width = 816, height = 624;
native.initialize({ gameRoot: temporaryDirectory('pmjs-filter-tile-'), assetRoot: '', width, height,
  windowTitle: 'Filter tile precision' });

const sheet = native.canvas.create(32, 32), pixels = new Uint8ClampedArray(32 * 32 * 4);
for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
  pixels.set((x + y) % 3 === 0 ? [255, 255, 255, 255] : [40, 100, 230, 255], (y * 32 + x) * 4);
}
native.canvas.writePixels(sheet.handle, 0, 0, 32, 32, pixels);
const tileX = 520, tileY = 380;
const layer = native.render.createTileLayer(new Float32Array([8, 8, tileX, tileY, 16, 16, 0, 0, 0]),
  [sheet.handle]);

// Packets as the scene encoder writes them: [root, tiles] and [root, filter, group, tiles, end].
function record(kind, parent, resource, blendOrFilter, flags) {
  return { metadata: [kind, parent, resource, 0xffffff, blendOrFilter, flags, 0],
    values: Object.assign(new Array(41).fill(0), [1, 0, 0, 1, 0, 0, 1]) };
}
function draw(filtered) {
  const records = [record(0, 0xffffffff, 0, 0, 0)];
  if (filtered) {
    const filter = record(6, 0, 0, 25, 0);
    // A blue screen tone: the identity matrix plus 0.08 blue, alpha 1.
    filter.values.splice(7, 10, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0);
    filter.values.splice(22, 13, 0, 0, 1, 0, 0.08, 0, 0, 0, 1, 0, 1, 1, 0);
    records.push(filter, record(0, 0, 0, 0, 0), record(4, 2, layer, 0, 8), record(7, 0, 0, 0, 0));
  } else {
    records.push(record(4, 0, layer, 0, 8));
  }
  const metadata = new Uint32Array(records.flatMap(entry => entry.metadata));
  const values = new Float32Array(records.flatMap(entry => entry.values));
  native.beginFrame();
  native.scene.submit(native.scene.schema.version, metadata, values, records.length);
  native.renderScene();
  const frame = native.canvas.captureScene();
  const result = native.canvas.readPixels(frame.handle, 0, 0, width, height);
  native.canvas.release(frame.handle);
  return result;
}

const plain = draw(false), toned = draw(true);
let differing = 0;
for (let y = tileY - 2; y < tileY + 18; y++) for (let x = tileX - 2; x < tileX + 18; x++) {
  const i = (y * width + x) * 4;
  // The tone adds blue only; red and green must match the untoned frame.
  if (Math.abs(plain[i] - toned[i]) > 2 || Math.abs(plain[i + 1] - toned[i + 1]) > 2) differing++;
}
assert.equal(differing, 0, 'toned tiles keep their edges');
const blue = (tileY * width + tileX + 1) * 4;
assert.ok(toned[blue + 2] > plain[blue + 2], 'the tone applies');
console.log('node-filter-tile-precision ok');
