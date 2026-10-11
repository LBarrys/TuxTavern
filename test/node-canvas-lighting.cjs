'use strict';

// Lighting plugins (Terrax) redraw a screen-sized mask every frame: an opaque fill, additive
// radial lights and an additive tint. Each took tens of ms on the CPU canvas (3 fps maps).
const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { createHostContext } = require('./helpers/mz-host-context.cjs');

const native = require(path.resolve(process.argv[2]));
native.initialize({ gameRoot: path.resolve(process.argv[3]), width: 32, height: 24, windowTitle: 'Canvas lighting' });
const ctx = createHostContext(native, { graphics: false });
const W = 836, H = 624;
const median = work => {
  const times = [];
  for (let run = 0; run < 7; run++) {
    const started = performance.now();
    work();
    times.push(performance.now() - started);
  }
  return times.sort((a, b) => a - b)[3];
};

// A composite fill touches exactly the pixels whose centres it covers, blended as before.
const seed = new Uint8Array(16 * 8 * 4);
for (let i = 0; i < seed.length; i += 4) {
  const alpha = (i * 37) % 256;
  seed.set([(i * 13) % (alpha + 1), (i * 7) % (alpha + 1), (i * 3) % (alpha + 1), alpha], i);
}
for (const operation of ['lighter', 'multiply', 'screen', 'source-atop', 'destination-over', 'xor']) {
  const expected = native.canvas.create(16, 8), actual = native.canvas.create(16, 8);
  native.canvas.writePremultipliedPixels(expected.handle, 0, 0, 16, 8, seed);
  native.canvas.writePremultipliedPixels(actual.handle, 0, 0, 16, 8, seed);
  const color = Uint8Array.of(147, 62, 113, 160), pixels = new Uint8Array(16 * 8 * 4);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) {
    if (x + 0.5 >= 2.5 && x + 0.5 <= 11.7 && y + 0.5 >= 1.4 && y + 0.5 <= 6.7) {
      pixels.set(color.map((c, i) => i === 3 ? c : Math.floor((c * 160 + 127) / 255)), (y * 16 + x) * 4);
    }
  }
  native.canvas.compositePixels(expected.handle, 0, 0, 16, 8, pixels, new Uint8Array(16 * 8).fill(255), operation, 1);
  ctx.handle = actual.handle;
  vm.runInContext(`(function() {
    var canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 8;
    canvas._nativeCanvas = { handle: handle, width: 16, height: 8 };
    var drawing = canvas.getContext('2d');
    drawing.globalCompositeOperation = '${operation}';
    drawing.fillStyle = 'rgba(147, 62, 113, ${160 / 255})';
    drawing.fillRect(2.5, 1.4, 9.2, 5.3);
    drawing.fillRect(NaN, 0, 4, 4);
    drawing.fillRect(-3e9, 0, 6e9, 0);
  })()`, ctx);
  assert.deepEqual(Array.from(native.canvas.readPremultipliedPixels(actual.handle, 0, 0, 16, 8)),
    Array.from(native.canvas.readPremultipliedPixels(expected.handle, 0, 0, 16, 8)), operation);
}

const mask = native.canvas.create(W, H);
ctx.handle = mask.handle;
const tint = vm.runInContext(`(function() {
  var canvas = document.createElement('canvas'); canvas.width = ${W}; canvas.height = ${H};
  canvas._nativeCanvas = { handle: handle, width: ${W}, height: ${H} };
  var drawing = canvas.getContext('2d');
  return function() {
    drawing.globalCompositeOperation = 'lighter';
    drawing.fillStyle = '#333344';
    drawing.fillRect(0, 0, ${W}, ${H});
  };
})()`, ctx);
native.canvas.fillRect(mask.handle, 0, 0, W, H, 0x000000ff);
tint();
assert.equal(native.canvas.pixel(mask.handle, 400, 300) >>> 0, 0x333344ff, 'the tint adds to black');
const tintMs = median(tint);
assert.ok(tintMs < 10, `a screen-sized 'lighter' fill takes ${tintMs.toFixed(1)} ms, not under 10 ms`);

const opaqueMs = median(() => {
  native.canvas.fillRect(mask.handle, 0, 0, W, H, 0x000000ff);
  native.canvas.pixel(mask.handle, 0, 0);
});
assert.equal(native.canvas.pixel(mask.handle, 400, 300) >>> 0, 0x000000ff, 'opaque fill replaces');
assert.ok(opaqueMs < 3, `a screen-sized opaque fill takes ${opaqueMs.toFixed(1)} ms, not under 3 ms`);

const lightsMs = median(() => {
  for (let i = 0; i < 8; i++) native.canvas.fillRadialGradient(mask.handle, i * 70 - 50, 150, 300, 300,
    100 + i * 70, 300, 0, 150, [0, 0.3, 1], [0xffffffff, 0xffcc88ff, 0x000000ff], true);
});
assert.equal(native.canvas.pixel(mask.handle, 400, 300) >>> 0, 0xffffffff, 'lights add up');
assert.ok(lightsMs < 16, `8 lights of 300x300 take ${lightsMs.toFixed(1)} ms, not under 16 ms`);

const ramp = native.canvas.create(64, 1);
native.canvas.fillRadialGradient(ramp.handle, 0, 0, 64, 1, 0, 0.5, 0, 64, [0, 1], [0xffffffff, 0x000000ff], false);
const reds = Array.from(native.canvas.readPixels(ramp.handle, 0, 0, 64, 1)).filter((_, i) => i % 4 === 0);
reds.forEach((red, x) => assert.ok(Math.abs(red - 255 * (1 - (x + 0.5) / 64)) <= 1, `gradient at ${x} is ${red}`));
console.log(`canvas lighting ok: tint ${tintMs.toFixed(1)} ms, opaque ${opaqueMs.toFixed(1)} ms, lights ${lightsMs.toFixed(1)} ms`);
