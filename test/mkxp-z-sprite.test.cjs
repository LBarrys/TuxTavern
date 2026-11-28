'use strict';

// With bitmapSmoothScaling on in mkxp.json, a sprite with a tone, colour, flash or opacity is
// scaled bilinearly too, not dropped to nearest neighbour (as upstream f049c4b).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

test('sprites drawn with a shader keep bilinear scaling', () => {
  const sprite = fs.readFileSync(path.join(__dirname, '../mkxp-z/src/display/sprite.cpp'), 'utf8');
  const fallbacks = sprite.match(/if \(scalingMethod [^)]*\)\n\s*\{\n[^\n]*\n\s*scalingMethod = \w+;/g);
  assert.equal(fallbacks.length, 2, 'the effect and opacity shaders');
  for (const fallback of fallbacks) {
    assert.match(fallback, /if \(scalingMethod > Bilinear\)/);
    assert.match(fallback, /scalingMethod = Bilinear;/);
  }
});
