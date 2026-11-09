'use strict';

// A character no game font has is drawn from a system font, as Chromium asks fontconfig for one
// (Karryn's Prison's help text uses arrows its font lacks). System fonts are those under the XDG
// data directories.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { temporaryDirectory } = require('./helpers/temp.cjs');

const assets = path.resolve(process.argv[3]);
const share = temporaryDirectory('pmjs-text-fallback-');
fs.mkdirSync(path.join(share, 'data', 'fonts', 'nested'), { recursive: true });
fs.mkdirSync(path.join(share, 'home'));
fs.copyFileSync(path.join(assets, 'text-shaping.ttf'), path.join(share, 'data', 'fonts', 'nested', 'TestSans.ttf'));
// The preferred face lacks the character, so the next one with it is used.
fs.copyFileSync(path.join(assets, 'testfont.ttf'), path.join(share, 'data', 'fonts', 'DejaVuSans.ttf'));
process.env.XDG_DATA_HOME = path.join(share, 'home');
process.env.XDG_DATA_DIRS = path.join(share, 'data');

const native = require(path.resolve(process.argv[2]));
native.initialize({ gameRoot: assets, assetRoot: '', width: 64, height: 64, windowTitle: 'text fallback test' });
try {
  const text = 'A♥B';
  const fallback = native.canvas.measureText('testfont.ttf', text, 20);
  const listed = native.canvas.measureText(['testfont.ttf', 'text-shaping.ttf'], text, 20);
  assert.equal(fallback, listed, 'the heart comes from the system font, as if the game had listed it');
  assert.notEqual(native.canvas.measureText('testfont.ttf', 'A❤B', 20), 0);
  const missing = native.canvas.measureText('testfont.ttf', 'A一B', 20);
  assert.ok(missing > native.canvas.measureText('testfont.ttf', 'AB', 20), 'a character no font has keeps a box');
  console.log('missing characters fall back to system fonts');
} finally {
  fs.rmSync(share, { recursive: true, force: true });
}
