'use strict';

// A sprite whose canvas was released draws nothing, as in a browser; the frame and
// the sprite's children still draw (Unholy Maiden's shop failed every frame).
const assert = require('node:assert/strict');
const path = require('node:path');
const native = require(path.resolve(process.argv[2]));
const size = 8;
native.initialize({ gameRoot: path.resolve(process.argv[3]), assetRoot: '',
  width: size, height: size, windowTitle: 'released sprite image' });
native.render.setClearColor(0, 0, 1, 1);
const schema = native.scene.schema;

function sprite(handle, parent = 0xffffffff, flags = 0) {
  const values = new Float32Array(schema.valueStride);
  values.set([1, 0, 0, 1, 0, 0, 1]);
  values.set([0, 0, size, size], 9);
  values.set([size, size], 13);
  return { metadata: [1, parent, handle, 0xffffff, 0, flags, 0], values };
}
// Flags a sprite may carry and a container may not (premultiplied texture, round pixels).
const spriteOnly = (1 << 10) | (1 << 8);

const released = native.canvas.create(size, size);
native.canvas.fillRect(released.handle, 0, 0, size, size, 0x00ff00ff);
native.canvas.release(released.handle);
const red = native.canvas.create(size, size);
native.canvas.fillRect(red.handle, 0, 0, size, size, 0xff0000ff);

const entries = [sprite(released.handle, 0xffffffff, spriteOnly), sprite(red.handle, 0)];
const metadata = new Uint32Array(entries.length * schema.metadataStride);
const values = new Float32Array(entries.length * schema.valueStride);
entries.forEach((entry, index) => {
  metadata.set(entry.metadata, index * schema.metadataStride);
  values.set(entry.values, index * schema.valueStride);
});
native.beginFrame();
native.scene.submit(schema.version, metadata, values, entries.length);
native.renderScene();
assert.deepEqual(Array.from(native.canvas.captureSceneRawPremultiplied().slice(0, 4)), [255, 0, 0, 255],
  'the frame draws, with the child of the sprite that lost its image');
native.canvas.release(red.handle);
