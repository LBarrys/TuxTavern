'use strict';

// mkxp-z/ builds (tools/apk.sh -m or -r) without warnings on GCC 15, Meson 1.10 and CMake 4.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const read = file => fs.readFileSync(path.join(__dirname, '../mkxp-z', file), 'utf8');

test('mkxp-z sources keep the fixes for the warnings GCC 15 printed', () => {
  const bitmap = read('src/display/bitmap.cpp');
  assert.doesNotMatch(bitmap, /\(destLen > 0 == sourceLen > 0\)/, '-Wparentheses');
  assert.match(bitmap, /KGL_SUBTRACT:\n.*\n    \}\n    return \(float\)opacity \/ 255\.0f;/, '-Wreturn-type');
  assert.doesNotMatch(bitmap, /if \(charLimit != fixed\.size\(\)\)/, '-Wsign-compare');
  assert.doesNotMatch(read('src/input/input.cpp'), /memset\(states, 0/, '-Wclass-memaccess');
  assert.match(read('src/audio/audiostream.cpp'), /stream\.stop\(\);\n\t+break;\n\t+default :/, '-Wswitch');
  assert.match(read('src/display/gl/transform.h'), /static inline FloatRect rotate_rect\(/, '-Wunused-function');
  assert.match(read('src/util/encoding.h'), /static inline std::string convertString\(std::string &str\) \{/, '-Wunused-function');
  assert.doesNotMatch(read('binding/binding-mri.cpp'), /for \(int [rc] = 0; [rc] < doc\.Get/, '-Wsign-compare');
  const font = read('src/display/font.cpp');
  assert.doesNotMatch(font, /for \(int i=0; i < iter->second\.size\(\)/, '-Wsign-compare');
  assert.doesNotMatch(font, /if\(offset == -1\)/, '-Wsign-compare');
});

test('mkxp-z build files keep the fixes for Meson\'s and CMake\'s warnings', () => {
  const meson = read('meson.build');
  // The C compiler warns about C++-only options.
  assert.doesNotMatch(meson, /global_args \+= \[[^\]]*-Wno-(non-virtual-dtor|reorder)/);
  assert.match(meson, /global_cpp_args \+= \['-Wno-non-virtual-dtor', '-Wno-reorder'\]/);
  // An executable with only a header as its source.
  assert.equal(meson.match(/files\('src\/executable\.cpp'\)/g).length, 2);
  assert.ok(fs.existsSync(path.join(__dirname, '../mkxp-z/src/executable.cpp')));
  // Meson counts a feature in ?: as needed by every version; in an if block it does not.
  assert.doesNotMatch(read('subprojects/common/meson.build'), /\? find_program\('\w+'\)\.cmd_array\(\)/);
  // SDL_sound's CMakeLists leaves CMP0156 unset.
  assert.match(read('src/meson.build'), /'CMAKE_POLICY_DEFAULT_CMP0156': 'OLD'/);
});
