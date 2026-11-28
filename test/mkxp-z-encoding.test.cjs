'use strict';

// mkxp-z converts Game.ini and mkxp.json text from the charset uchardet guesses; musl's iconv knows
// fewer charsets than glibc's, and an unknown one crashed (as upstream 9b03e4c, it is kept as is).
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const cxx = ['c++', 'g++', 'clang++'].find(name => spawnSync(name, ['--version']).status === 0);

test('a string in a charset iconv does not know is kept as it is', { skip: !cxx && 'no C++ compiler' }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tt-encoding-'));
  try {
    const header = fs.readFileSync(path.join(__dirname, '../mkxp-z/src/util/encoding.h'), 'utf8')
      .replace('#include "util/encoding.h"', '');
    fs.writeFileSync(path.join(dir, 'encoding.h'), header);
    fs.writeFileSync(path.join(dir, 'uchardet.h'), `typedef void* uchardet_t;
static inline uchardet_t uchardet_new() { return nullptr; }
static inline int uchardet_handle_data(uchardet_t, const char*, unsigned long) { return 0; }
static inline void uchardet_data_end(uchardet_t) {}
static inline const char* uchardet_get_charset(uchardet_t) { return ""; }
static inline void uchardet_delete(uchardet_t) {}
`);
    fs.writeFileSync(path.join(dir, 'test.cpp'), `
struct Exception { enum Type { MKXPError }; Exception(Type, const char*, ...) {} };
#include "encoding.h"
int main() {
  std::string text = "\\xff\\xfeTitle";
  try { return Encoding::convertString(text, "NO-SUCH-CHARSET") == text ? 0 : 3; }
  catch (const Exception&) { return 4; }
}
`);
    execFileSync(cxx, ['-std=c++17', '-I', dir, '-o', path.join(dir, 'test'), path.join(dir, 'test.cpp')]);
    const run = spawnSync(path.join(dir, 'test'));
    assert.equal(run.signal, null, `crashed with ${run.signal}`);
    assert.equal(run.status, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
