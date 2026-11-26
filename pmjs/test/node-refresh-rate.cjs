'use strict';

// The window state reports the display's refresh rate and whether vsync took, which the runner
// paces drawing by: auto (or unset) asks for vsync at any rate (no vsync on a screen above 60 Hz
// let Karryn's Prison's title take a whole core).
const assert = require('node:assert/strict');
const path = require('node:path');
process.env.PMJS_SWAP_INTERVAL = 'auto';
const native = require(path.resolve(process.argv[2]));
native.initialize({ gameRoot: path.resolve(process.argv[3]), assetRoot: '', width: 64, height: 64,
  windowTitle: 'refresh rate test' });
const { refreshRate, vsync } = native.runtime.windowState();
assert.equal(vsync, true, 'auto asks for vsync');
assert.equal(typeof refreshRate, 'number');
assert.ok(refreshRate >= 0, 'refresh rate is 0 when unknown');
console.log(`auto swap interval accepted; display refresh rate ${refreshRate}`);
