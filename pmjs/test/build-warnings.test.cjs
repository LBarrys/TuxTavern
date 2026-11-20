'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('the native build stays free of the GCC 15 warnings it used to print', () => {
  // -Wdeprecated-declarations: C++20 deprecates the shared_ptr overloads of these.
  for (const file of ['src/platform/vfs.cpp', 'src/platform/vfs.hpp'])
    assert.doesNotMatch(read(file), /std::atomic_(load|store)\(/, file);
  // -Wmaybe-uninitialized: a RenderCommand copied before every member is set.
  const command = read('src/graphics/renderer.hpp').match(/struct RenderCommand \{([\s\S]*?)\n\};/)[1];
  const bare = command.split('\n').filter(line => /^\s+std::array<[^>]+>\s+\w+;/.test(line));
  assert.deepEqual(bare, []);
  // Third-party Effekseer warnings are not TuxTavern's to fix.
  const effekseer = read('cmake/Effekseer.cmake');
  for (const target of ['Effekseer', 'EffekseerRendererGL'])
    assert.match(effekseer, new RegExp('target_compile_options\\(' + target + ' PRIVATE -w\\)'), target);
});
