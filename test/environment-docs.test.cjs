'use strict';
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('every PMJS_* variable the runtime reads is listed in DEVELOPING.md', () => {
  const files = childProcess.execFileSync('git', ['ls-files', 'src', 'js', 'runner', 'tools/pmjs.sh'],
    { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
  const read = /(?:getenv|environmentFlag|env|Env)\(["'](PMJS_[A-Z0-9_]+)|(?:process\.env|source)\.(PMJS_[A-Z0-9_]+)|\$\{(PMJS_[A-Z0-9_]+):-/g;
  const names = new Set();
  for (const file of files) {
    for (const match of fs.readFileSync(path.join(root, file), 'utf8').matchAll(read)) {
      names.add(match[1] || match[2] || match[3]);
    }
  }
  const docs = fs.readFileSync(path.join(root, 'DEVELOPING.md'), 'utf8');
  assert.ok(names.has('PMJS_RENDER_HZ'));
  assert.deepEqual([...names].filter(name => !docs.includes('`' + name)).sort(), []);
});
