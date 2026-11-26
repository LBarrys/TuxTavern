'use strict';
// createTileLayer refuses a texture index that is not a whole number within the handles given
// (NaN, infinities, negatives and fractions were cast to an index), and an array whose element
// getter throws passes that error on instead of reading garbage (upstream 1b1671b).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { temporaryDirectory } = require('./helpers/temp.cjs');
const { png } = require('./helpers/png.cjs');
const native = require(path.resolve(process.argv[2]));
const root = temporaryDirectory('tile-layer-arguments-');
fs.writeFileSync(path.join(root, 'fixture.png'), png(4, 4, Buffer.alloc(64, 255)));
native.initialize({ gameRoot: root, width: 16, height: 16, windowTitle: 'Tile layer arguments' });
try {
  const image = native.images.load('fixture.png');
  for (const index of [NaN, Infinity, -Infinity, -1, 0.5, 1, 1e30]) {
    assert.throws(() => native.render.createTileLayer([0, 0, 0, 0, 4, 4, 0, 0, index], [image.handle]),
      /invalid texture index/, String(index));
  }
  for (const position of ['points', 'handles']) {
    const error = new Error('array getter');
    const values = [0];
    Object.defineProperty(values, 0, { get() { throw error; } });
    assert.throws(() => native.render.createTileLayer(position === 'points' ? values : [],
      position === 'handles' ? values : []), caught => caught === error, position);
  }
  const layer = native.render.createTileLayer([0, 0, 0, 0, 4, 4, 0, 0, 0], [image.handle]);
  assert.ok(layer > 0, 'a valid index still makes a layer');
  native.render.releaseTileLayer(layer);
  native.images.release(image.handle);
  console.log('tile layer arguments are checked');
} finally {
  native.runtime.quit();
  fs.rmSync(root, { recursive: true, force: true });
}
