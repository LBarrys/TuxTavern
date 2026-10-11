'use strict';

// A scaled drawImage is filtered bilinearly, as in a browser, unless smoothing is off.
// MV stretches its 96x96 window background this way; nearest sampling made it blocky.
const assert = require('node:assert/strict');
const path = require('node:path');

const native = require(path.resolve(process.argv[2]));
native.initialize({ gameRoot: path.resolve(process.argv[3]), width: 16, height: 16, windowTitle: 'scaled drawImage' });

const source = native.canvas.create(2, 1);
native.canvas.writePixels(source.handle, 0, 0, 2, 1, Uint8Array.of(0, 0, 0, 255, 255, 255, 255, 255));
const red = handle => Array.from(native.canvas.readPixels(handle, 0, 0, 8, 1)).filter((_, i) => i % 4 === 0);

const smooth = native.canvas.create(8, 1);
native.canvas.drawImage(smooth.handle, source.handle, 0, 0, 2, 1, 0, 0, 8, 1, 1, true);
assert.deepEqual(red(smooth.handle), [0, 0, 32, 96, 159, 223, 255, 255], 'bilinear ramp between texel centres');

const sharp = native.canvas.create(8, 1);
native.canvas.drawImage(sharp.handle, source.handle, 0, 0, 2, 1, 0, 0, 8, 1, 1, false);
assert.deepEqual(red(sharp.handle), [0, 0, 0, 0, 255, 255, 255, 255], 'imageSmoothingEnabled = false keeps whole texels');

const cropped = native.canvas.create(8, 1);
native.canvas.drawImage(cropped.handle, source.handle, 0, 0, 1, 1, 0, 0, 8, 1, 1, true);
assert.deepEqual(Array.from(native.canvas.readPixels(cropped.handle, 0, 0, 8, 1)),
  Array(8).fill([0, 0, 0, 255]).flat(), 'filtering stays inside the source rectangle');

console.log('scaled drawImage ok');
