'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { gamePackage } = require('../runner/index.cjs');
const { temporaryDirectory } = require('./helpers/temp.cjs');

function guestFilesystem(runtime) {
  const files = new Map([['data/System.json', '{}'], ['save/file1.rpgsave', 'save']]);
  const written = [];
  const fsHost = {
    exists: name => (name = name.replace(/\/$/, ''), files.has(name) || name === '.' ||
      [...files.keys()].some(key => key.startsWith(name + '/'))),
    readBytes: name => files.has(name) ? Buffer.from(files.get(name)) : null,
    writeBytes(name, bytes) { written.push(name); files.set(name, Buffer.from(bytes).toString()); },
  };
  const context = vm.createContext({ Buffer, __pmjsBuiltinRequire: require,
    NativeHost: { fs: fsHost, runtime }, PMJS: { config: {} } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/pmjs-web/filesystem.js'), 'utf8'), context);
  return { guest: context.fsModule, written };
}

test('MV games run from the folder above www, like NW.js', () => {
  const root = temporaryDirectory('pmjs-nw-cwd-');
  const www = path.join(root, 'www');
  fs.mkdirSync(www);
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"above"}');
  assert.deepEqual(gamePackage(www), { manifest: { name: 'above' }, subdirectory: 'www' });
  fs.writeFileSync(path.join(www, 'package.json'), '{"name":"inside"}');
  assert.deepEqual(gamePackage(www), { manifest: { name: 'inside' }, subdirectory: 'www' });
  fs.rmSync(path.join(root, 'package.json'));
  assert.deepEqual(gamePackage(www), { manifest: { name: 'inside' }, subdirectory: null });
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"above"}');
  assert.deepEqual(gamePackage(root), { manifest: { name: 'above' }, subdirectory: null });
});

test('Satisfy Him save naming reaches www/data and www/save relative to the package folder', () => {
  const { guest, written } = guestFilesystem({ gameSubdirectory: 'www' });
  assert.equal(guest.existsSync('./www/save/'), true);
  assert.equal(guest.existsSync('./www/save/file1.rpgsave'), true);
  assert.equal(guest.readFileSync('WWW/data/System.json', 'utf8'), '{}');
  guest.writeFileSync('www/data/SaveFileInfo.json', '{"entries":[]}');
  assert.deepEqual(written, ['data/SaveFileInfo.json']);
  assert.equal(guest.readFileSync('./data/SaveFileInfo.json', 'utf8'), '{"entries":[]}');
  assert.equal(guest.existsSync('wwwx/data/System.json'), false);
});

test('games without a package folder above keep www/ as an ordinary folder', () => {
  const { guest } = guestFilesystem({});
  assert.equal(guest.existsSync('./www/save/file1.rpgsave'), false);
  assert.equal(guest.existsSync('./save/file1.rpgsave'), true);
});
