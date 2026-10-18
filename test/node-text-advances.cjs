'use strict';

// Canvas text advances by unhinted, fractional widths and places glyphs on quarter pixels, as
// Chromium's canvas does on Linux (Electron included). Widths are from Chromium's measureText
// (testfont.ttf); whole-pixel advances, which only the old headless shell uses, shifted
// letters and word gaps by up to a pixel per glyph (Karryn's Prison's menus).
const assert = require('node:assert/strict');
const path = require('node:path');
const native = require(path.resolve(process.argv[2]));
native.initialize({ gameRoot: path.resolve(process.argv[3]), assetRoot: '', width: 64, height: 64,
  windowTitle: 'text advance test' });

const chromium = [[28, 'Please select a file slot.', 292.592], [28, 'File 12', 84.041],
  [28, 'Warden Level 51', 210.643], [28, 'iiii llll', 57.545], [28, 'WAVE', 79.338],
  [20, 'Please select a file slot.', 208.994], [20, 'File 12', 60.029], [20, 'Warden Level 51', 150.459],
  [20, 'iiii llll', 41.104], [20, 'WAVE', 56.67], [13, 'Please select a file slot.', 135.846],
  [13, 'File 12', 39.019], [13, 'Warden Level 51', 97.798], [13, 'iiii llll', 26.717], [13, 'WAVE', 36.835]];
for (const [size, text, width] of chromium) {
  const measured = native.canvas.measureText('testfont.ttf', text, size);
  // HarfBuzz positions are in 1/64 pixel; Chromium's are finer.
  assert.ok(Math.abs(measured - width) <= 1 / 16, `${size}px ${text}: ${measured}, Chromium ${width}`);
}

// Text drawn half a pixel right moves half a pixel, not a whole one.
function inkCentre(x) {
  const canvas = native.canvas.create(400, 60);
  native.canvas.drawText(canvas.handle, 'testfont.ttf', 'Please select a file slot.', x, 40, 28, 0xffffffff, 0);
  const pixels = native.canvas.readPixels(canvas.handle, 0, 0, 400, 60);
  native.canvas.release(canvas.handle);
  let ink = 0, moment = 0;
  for (let index = 3; index < pixels.length; index += 4) {
    ink += pixels[index];
    moment += pixels[index] * (((index - 3) / 4) % 400);
  }
  return moment / ink;
}
const shift = inkCentre(10.5) - inkCentre(10);
assert.ok(Math.abs(shift - 0.5) <= 0.1, `half-pixel shift moved the ink by ${shift}`);
console.log('text widths and placement match Chromium');
