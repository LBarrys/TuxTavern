'use strict';

// Decoded pixels kept for canvas drawing outlive a second, so a menu opened again soon
// does not read its IconSet back from the GPU (or decode it) once more.
process.env.PMJS_DEFER_IMAGES = '0';

const assert = require('node:assert/strict');
const path = require('node:path');

const native = require(path.resolve(process.argv[2]));
native.initialize({ gameRoot: path.resolve(process.argv[3]), assetRoot: '', width: 8, height: 8, windowTitle: 'pmjs image CPU cache' });
const canvas = native.canvas.create(2, 2);
const image = native.images.load('fixture.png');
const readbacks = () => native.images.memory(0).textureReadbacks;
const blt = () => {
  native.canvas.drawImage(canvas.handle, image.handle, 0, 0, 2, 2, 0, 0, 2, 2, 1);
  native.canvas.readPixels(canvas.handle, 0, 0, 1, 1); // Queued canvas drawing runs when read.
};

blt();
const first = readbacks();
assert.equal(first, 1, 'the first canvas draw reads the image once');
for (let frame = 0; frame < 120; frame++) native.beginFrame();
blt();
assert.equal(readbacks(), first, 'two seconds later its pixels are still kept');
for (let frame = 0; frame < 605; frame++) native.beginFrame();
blt();
assert.equal(readbacks(), first + 1, 'unused pixels are released after about ten seconds');
native.images.release(image.handle);
native.canvas.release(canvas.handle);
console.log('image CPU cache ok');
