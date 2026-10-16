'use strict';

// With no draw rate set, the runner passes PMJS_SWAP_INTERVAL=auto and paces drawing by the
// display's refresh rate (uncapped above 60 Hz for Karryn's Prison on a 165 Hz screen).
const assert = require('node:assert/strict');
const path = require('node:path');
process.env.PMJS_SWAP_INTERVAL = 'auto';
const native = require(path.resolve(process.argv[2]));
native.initialize({ gameRoot: path.resolve(process.argv[3]), assetRoot: '', width: 64, height: 64,
  windowTitle: 'refresh rate test' });
const { refreshRate } = native.runtime.windowState();
assert.equal(typeof refreshRate, 'number');
assert.ok(refreshRate >= 0, 'refresh rate is 0 when unknown');
console.log(`auto swap interval accepted; display refresh rate ${refreshRate}`);
