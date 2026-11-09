'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');

test('every moved upstream path maps to a file that exists here', () => {
  const lines = fs.readFileSync(path.join(root, 'tools/upstream-paths.txt'), 'utf8').split('\n')
    .filter(line => line && !line.startsWith('#'));
  assert.ok(lines.length > 0);
  for (const line of lines) {
    const [from, to, extra] = line.split(' ');
    assert.ok(to && !extra, line);
    assert.ok(fs.existsSync(path.join(root, to)), to);
    assert.ok(!fs.existsSync(path.join(root, from)), from);
  }
});
