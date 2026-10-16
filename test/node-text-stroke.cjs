'use strict';

// strokeText outlines the glyph path, half the line width on each side, as Chromium does.
// Coverage totals are from Chromium's canvas (testfont.ttf, 28px, lineWidth 4, round joins);
// the mask-dilation outline was 5-9% short (Karryn's Prison's window text looked thin).
const assert = require('node:assert/strict');
const path = require('node:path');
const native = require(path.resolve(process.argv[2]));
native.initialize({ gameRoot: path.resolve(process.argv[3]), assetRoot: '', width: 64, height: 64,
  windowTitle: 'text stroke test' });

const chromium = { O: 339, V: 274, g: 347, s: 246 };
for (const [glyph, expected] of Object.entries(chromium)) {
  const canvas = native.canvas.create(100, 60);
  native.canvas.drawText(canvas.handle, 'testfont.ttf', glyph, 20, 40, 28, 0xffffffff, 4);
  const pixels = native.canvas.readPixels(canvas.handle, 0, 0, 100, 60);
  let coverage = 0;
  for (let index = 3; index < pixels.length; index += 4) coverage += pixels[index];
  coverage /= 255;
  assert.ok(Math.abs(coverage - expected) <= expected * 0.03,
    `${glyph}: outline coverage ${coverage.toFixed(1)} differs from Chromium's ${expected} by more than 3%`);
  native.canvas.release(canvas.handle);
}
console.log('text outlines match Chromium coverage');
