'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

// Native tests are listed by name in CMakeLists.txt, so a new one can be forgotten and never run.
test('every test/node-*.cjs is registered with CTest or run by another test', () => {
  const dir = __dirname;
  const cmake = fs.readFileSync(path.join(dir, '../CMakeLists.txt'), 'utf8');
  const tests = fs.readdirSync(dir).filter(name => /^node-.*\.cjs$/.test(name));
  const sources = tests.map(name => fs.readFileSync(path.join(dir, name), 'utf8'));
  const unregistered = tests.filter(name => {
    const base = name.slice(0, -4);
    return !new RegExp(`(^|[\\s/"])${base}([\\s.)"]|$)`, 'm').test(cmake) &&
      !sources.some(source => source.includes(`'${name}'`));
  });
  assert.deepEqual(unregistered, []);
});
