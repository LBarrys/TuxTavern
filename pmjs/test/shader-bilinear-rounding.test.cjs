'use strict';

// TuxTavern: palette and channel-block images are filtered in the shader. As upstream 0c3c7a0, the
// two horizontal blends stay unrounded and only the result is rounded, as GPU texture units do: on
// a Radeon (radeonsi, Mesa 26) palette and RGBA drawing then differ in 19% fewer bytes. Rounding each
// row first is what llvmpipe does, so the pixel tests that run on it allow for either.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const shaders = fs.readFileSync(path.join(__dirname, '../src/renderer_shaders.hpp'), 'utf8');

test('shader bilinear filtering rounds once, after both axes', () => {
  const rows = [...shaders.matchAll(/ivec4 top = ([^;]*);\s*(?:highp )?ivec4 bottom = ([^;]*);\s*[^;]*?\(top \* \(256 - (\w+)\.y\) \+ bottom \* \3\.y([^)]*)\)/g)];
  assert.equal(rows.length, 5, 'every manual bilinear sampler is found');
  for (const [, top, bottom, , last] of rows) {
    assert.doesNotMatch(top, /\+ 128\) \/ 256/, 'the top row is not rounded on its own');
    assert.doesNotMatch(bottom, /\+ 128\) \/ 256/, 'the bottom row is not rounded on its own');
    assert.match(last, /^ \+ 32768$/, 'the result is rounded once');
  }
});
