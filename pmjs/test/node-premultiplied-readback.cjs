'use strict';

// A Pixi sprite samples premultiplied texels. Reading the straight texture back from
// the GPU to make them stalls it; decoded pixels make them instead, and an opaque
// image needs none.
process.env.PMJS_DEFER_IMAGES = '1';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { png } = require('./helpers/png.cjs');
const { temporaryDirectory } = require('./helpers/temp.cjs');

const root = temporaryDirectory('premultiplied-readback-');
const fill = (rgba) => { const pixels = Buffer.alloc(4 * 4 * 4); for (let i = 0; i < pixels.length; i += 4) pixels.set(rgba, i); return pixels; };
fs.writeFileSync(path.join(root, 'opaque.png'), png(4, 4, fill([200, 40, 90, 255])));
fs.writeFileSync(path.join(root, 'translucent.png'), png(4, 4, fill([200, 40, 90, 128])));
const native = require(path.resolve(process.argv[2]));
native.initialize({ gameRoot: root, assetRoot: '', width: 8, height: 8, windowTitle: 'pmjs premultiplied readback' });
const stride = native.scene.schema.valueStride;

function drawSprite(image) {
  const values = new Float32Array(stride);
  values.set([1, 0, 0, 1, 0, 0, 1]); values.set([0, 0, 4, 4], 9); values.set([4, 4], 13);
  native.beginFrame();
  native.render.setClearColor(0, 0, 0, 0);
  assert.equal(native.scene.submit(native.scene.packetVersion,
    Uint32Array.of(1, 0xffffffff, image.handle, 0xffffff, 0, 0, 0), values, 1), undefined);
  native.renderScene();
  return Array.from(native.canvas.captureSceneRawPremultiplied().slice(0, 4));
}

async function main() {
  const readbacks = () => native.images.memory(0).textureReadbacks;
  readbacks(); // The first report allocates the fallback image.
  const opaque = native.images.load('opaque.png');
  const gpu = native.images.memory(0).gpuBytes;
  assert.deepEqual(drawSprite(opaque), [200, 40, 90, 255]);
  assert.equal(readbacks(), 0, 'an opaque image is drawn without a readback');
  assert.equal(native.images.memory(0).gpuBytes, gpu, 'and without a second texture');

  const translucent = await native.images.loadAsync('translucent.png');
  assert.deepEqual(drawSprite(translucent), [100, 20, 45, 128], 'premultiplied from the decoded pixels');
  assert.equal(readbacks(), 0, 'a deferred image is premultiplied when decoded');
  for (const image of [opaque, translucent]) native.images.release(image.handle);
}

main().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
