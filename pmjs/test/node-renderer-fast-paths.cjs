'use strict';

// A sprite with only a colour tone or blend colour, and a displacement filter, use their own
// small programs (upstream 5d57b18, c3e6767, 9ff8901) and draw what the general programs drew.
process.env.PMJS_GRAPHICS_DIAGNOSTICS = '1';

const assert = require('node:assert/strict');
const path = require('node:path');

const native = require(path.resolve(process.argv[2]));
const size = 16;
native.initialize({
  gameRoot: path.resolve(process.argv[3]),
  assetRoot: '',
  width: size,
  height: size,
  windowTitle: 'pmjs renderer fast paths',
});
native.render.setClearColor(0, 0, 0, 0);

const schema = native.scene.schema;
const noParent = 0xffffffff;
const hasSpriteColor = 1 << 4;

function canvas(rgba) {
  const image = native.canvas.create(size, size);
  const pixels = new Uint8Array(size * size * 4);
  for (let offset = 0; offset < pixels.length; offset += 4) pixels.set(rgba, offset);
  native.canvas.writePixels(image.handle, 0, 0, size, size, pixels);
  return image;
}

function record(kind, resource = 0, blend = 0, flags = 0) {
  const values = new Float32Array(schema.valueStride);
  values.set([1, 0, 0, 1, 0, 0, 1]);
  return { metadata: [kind, noParent, resource, 0xffffff, blend, flags, 0], values };
}

function sprite(image, tone, blendColor) {
  const entry = record(1, image.handle, 0, tone ? hasSpriteColor : 0);
  entry.values.set([0, 0, size, size], 9);
  entry.values.set([size, size], 13);
  if (tone) {
    entry.values.set(tone, 33);
    entry.values.set(blendColor, 37);
  }
  return entry;
}

function render(entries) {
  const metadata = new Uint32Array(entries.length * schema.metadataStride);
  const values = new Float32Array(entries.length * schema.valueStride);
  entries.forEach((entry, index) => {
    metadata.set(entry.metadata, index * schema.metadataStride);
    values.set(entry.values, index * schema.valueStride);
  });
  const before = native.render.stats();
  native.beginFrame();
  native.scene.submit(schema.version, metadata, values, entries.length);
  native.renderFrame();
  const capture = native.canvas.captureScene();
  let pixels;
  try {
    pixels = Uint8Array.from(native.canvas.readPixels(capture.handle, 0, 0, size, size));
  } finally {
    native.canvas.release(capture.handle);
  }
  const after = native.render.stats();
  const center = (8 * size + 8) * 4;
  return {
    pixel: Array.from(pixels.subarray(center, center + 4)),
    directColor: after.directSpriteColorDrawCalls - before.directSpriteColorDrawCalls,
    displacement: after.displacementProgramApplications - before.displacementProgramApplications,
  };
}

function near(actual, expected, label) {
  actual.forEach((value, channel) =>
    assert.ok(Math.abs(value - expected[channel]) <= 2, `${label}: ${JSON.stringify(actual)} vs ${JSON.stringify(expected)}`));
}

const gray = canvas([100, 100, 100, 255]);
const map = canvas([128, 128, 128, 255]);
try {
  const toned = render([sprite(gray, [0.2, 0, 0, 0], [0, 0, 0, 0])]);
  near(toned.pixel, [151, 100, 100, 255], 'colour tone');
  assert.equal(toned.directColor, 1, 'a toned sprite uses the sprite-colour program');

  const blended = render([sprite(gray, [0, 0, 0, 0], [1, 0, 0, 0.5])]);
  near(blended.pixel, [178, 50, 50, 255], 'blend colour');
  assert.equal(blended.directColor, 1, 'a blended sprite uses the sprite-colour program');

  const plain = render([sprite(gray)]);
  near(plain.pixel, [100, 100, 100, 255], 'plain sprite');
  assert.equal(plain.directColor, 0, 'a sprite without colour keeps the direct program');

  // Bounds 0,0 16x16 and no scale: displacement leaves the picture where it was.
  const begin = record(6, map.handle, 1);
  begin.values.set([0, 0, size, size, 0, 0], 7);
  begin.values[33] = 1;
  const displaced = render([begin, sprite(gray), record(7)]);
  near(displaced.pixel, [100, 100, 100, 255], 'displacement');
  assert.equal(displaced.displacement, 1, 'displacement uses its own program');
} finally {
  native.canvas.release(gray.handle);
  native.canvas.release(map.handle);
}
console.log('renderer fast paths draw as the general programs did');
