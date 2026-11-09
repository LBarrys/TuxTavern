'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const root = path.resolve(__dirname, '..');

test('every licence REUSE.toml names has its text in LICENSES/, and every text there is named', () => {
  const reuse = fs.readFileSync(path.join(root, 'REUSE.toml'), 'utf8');
  const named = new Set();
  for (const [, expression] of reuse.matchAll(/SPDX-License-Identifier = "([^"]+)"/g))
    for (const id of expression.split(/\s+(?:AND|OR|WITH)\s+|[()]/)) if (id.trim()) named.add(id.trim());
  const texts = new Set(fs.readdirSync(path.join(root, 'LICENSES')).map(file => file.replace(/\.txt$/, '')));
  for (const id of named) assert.ok(texts.has(id), `LICENSES/${id}.txt is missing`);
  // FTL: the FreeType notice in pmjs/THIRD_PARTY_NOTICES.md (PMJS links the system's FreeType).
  for (const id of texts) assert.ok(named.has(id) || id === 'FTL', `LICENSES/${id}.txt is not used`);
});

test('every path REUSE.toml names exists', () => {
  const reuse = fs.readFileSync(path.join(root, 'REUSE.toml'), 'utf8');
  for (const [, list] of reuse.matchAll(/^path = \[([^\]]+)\]/gm))
    for (const [, name] of list.matchAll(/"([^"]+)"/g))
      assert.ok(fs.existsSync(path.join(root, name.replace(/\/?\*.*$/, ''))), name);
});

test('the root LICENSE is the GPL-3.0 text, the licence of the whole', () => {
  assert.equal(fs.readFileSync(path.join(root, 'LICENSE'), 'utf8'),
    fs.readFileSync(path.join(root, 'LICENSES/GPL-3.0-only.txt'), 'utf8'));
});
