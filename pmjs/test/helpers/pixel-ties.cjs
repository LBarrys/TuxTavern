'use strict';

// A linearly filtered sample exactly between two 1/256 weight steps (scale 2, quarter- and
// half-texel offsets, as these tests use) goes either way by one level per axis, depending on how
// the driver rounds interpolated coordinates. Mesa 26 (BusyLinux) breaks those ties differently
// from the older Mesa the expected values came from; away from ties the results are exact.
const assert = require('node:assert/strict');

function filteredPixelsMatch(actual, expected, tolerance = 2) {
  if (actual.length !== expected.length) return false;
  for (let i = 0; i < actual.length; ++i) if (Math.abs(actual[i] - expected[i]) > tolerance) return false;
  return true;
}

function assertFilteredPixels(actual, expected, message, tolerance = 2) {
  assert.equal(actual.length, expected.length, message);
  for (let i = 0; i < actual.length; ++i) {
    if (Math.abs(actual[i] - expected[i]) > tolerance) {
      assert.fail(`${message || 'filtered pixels differ'}: byte ${i} (pixel ${i >> 2}, channel ${i & 3}) ` +
        `is ${actual[i]}, expected ${expected[i]} within ${tolerance}`);
    }
  }
}

module.exports = { filteredPixelsMatch, assertFilteredPixels };
