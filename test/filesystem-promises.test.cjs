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
  const context = vm.createContext({ Buffer, Promise, performance, __pmjsBuiltinRequire: require,
    NativeHost: { storage }, PMJS: { config: {} } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/pmjs-web/scheduler.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/pmjs-web/filesystem.js'), 'utf8'), context);
  fixture.tasks = context.PMJS.tasks;
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

// ImageReplacer bundles fast-glob, which extends fs.Dirent and walks with lstat and callback readdir.
test('fs.Dirent can be extended; lstat, realpath, access and callback readdir match Node', async () => {
  const guest = fixture();
  guest.mkdirSync('/save/img');
  guest.writeFileSync('/save/img/a.png', 'x');
  const DirentFromStats = new Function('Dirent', `return class extends Dirent {
    constructor(name, stats, path) { super(name, null, path); this.stats = stats; }
    isDirectory() { return this.stats.isDirectory(); } }`)(guest.Dirent);
  const entry = new DirentFromStats('img', guest.lstatSync('/save/img'), '/save');
  assert.equal(entry.isDirectory(), true);
  assert.equal(entry.isSymbolicLink(), false);
  const [file] = guest.readdirSync('/save/img', { withFileTypes: true });
  assert.ok(file instanceof guest.Dirent);
  assert.equal(file.isFile(), true);
  assert.equal(file.parentPath, '/save/img');
  assert.ok(guest.statSync('/save/img') instanceof guest.Stats);
  assert.equal(guest.realpathSync('/save/img/../img/a.png'), '/save/img/a.png');
  assert.equal(await guest.promises.realpath('/save/img'), '/save/img');
  const listed = await new Promise((resolve, reject) => {
    guest.readdir('/save/img', (error, names) => error ? reject(error) : resolve(names));
    fixture.tasks.drain();
  });
  assert.deepEqual(Array.from(listed), ['a.png']);
  await assert.rejects(guest.promises.lstat('/save/none'), error => error.code === 'ENOENT');
});
