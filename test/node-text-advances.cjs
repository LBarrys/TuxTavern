'use strict';

// Canvas text advances by hinted, whole-pixel widths, as Chromium's canvas does. Widths are
// from Chromium's measureText (testfont.ttf); unhinted advances drifted by up to a pixel,
// shifting letters and word gaps (Karryn's Prison's menus).
const assert = require('node:assert/strict');
const path = require('node:path');
const native = require(path.resolve(process.argv[2]));
native.initialize({ gameRoot: path.resolve(process.argv[3]), assetRoot: '', width: 64, height: 64,
  windowTitle: 'text advance test' });

const chromium = [[28, 'Please select a file slot.', 292], [28, 'File 12', 84], [28, 'Warden Level 51', 210],
  [28, 'iiii llll', 56], [28, 'WAVE', 79], [20, 'Please select a file slot.', 213], [20, 'File 12', 60],
  [20, 'Warden Level 51', 151], [20, 'iiii llll', 38], [20, 'WAVE', 57],
  [13, 'Please select a file slot.', 139], [13, 'File 12', 39], [13, 'Warden Level 51', 99],
  [13, 'iiii llll', 28], [13, 'WAVE', 37]];
for (const [size, text, width] of chromium) {
  assert.equal(native.canvas.measureText('testfont.ttf', text, size), width, `${size}px ${text}`);
}
console.log('text widths match Chromium');
