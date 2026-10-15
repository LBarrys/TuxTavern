'use strict';
// NW.js gives pages fs.promises; Karryn's Prison's logger and mod manager use it.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { createStorage } = require('../runner/storage.cjs');
const { temporaryDirectory } = require('./helpers/temp.cjs');

function fixture() {
  const storage = createStorage(temporaryDirectory('pmjs-promises-'));
  const context = vm.createContext({ Buffer, Promise, __pmjsBuiltinRequire: require,
    NativeHost: { storage }, PMJS: { config: {} } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/pmjs-web/filesystem.js'), 'utf8'), context);
  return context.fsModule;
}

test('fs.promises reads, writes and lists through the same paths as the sync calls', async () => {
  const guest = fixture();
  await guest.promises.mkdir('/save/mods');
  await guest.promises.writeFile('/save/mods/a.json', '{"a":1}');
  assert.equal(await guest.promises.readFile('/save/mods/a.json', 'utf8'), '{"a":1}');
  assert.deepEqual(Array.from(await guest.promises.readdir('/save/mods')), ['a.json']);
  const [entry] = await guest.promises.readdir('/save', { withFileTypes: true });
  assert.equal(entry.name, 'mods');
  assert.equal(entry.isDirectory(), true);
  assert.equal((await guest.promises.stat('/save/mods/a.json')).isFile(), true);
  await guest.promises.access('/save/mods/a.json');
  await assert.rejects(guest.promises.readdir('/save/missing'), error => error.code === 'ENOENT');
  await assert.rejects(guest.promises.access('/save/missing'), error => error.code === 'ENOENT');
});
