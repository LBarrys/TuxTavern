'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { temporaryDirectory } = require('./helpers/temp.cjs');
const { preparationFiles } = require('../runner/preparation-files.cjs');

const FUSE = 0x65735546, EXT4 = 0xef53;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

// From upstream PMJS 2930620: games on sshfs or rclone mounts get new inode numbers per mount.
for (const scenario of [
  { name: 'FUSE inode drift', field: 'ino', type: FUSE, reused: true },
  { name: 'ordinary filesystem inode change', field: 'ino', type: EXT4 },
  { name: 'FUSE modification time change', field: 'mtimeNs', type: FUSE },
  { name: 'FUSE change time change', field: 'ctimeNs', type: FUSE },
  { name: 'FUSE birth time change', field: 'birthtimeNs', type: FUSE },
  { name: 'FUSE size change', field: 'size', type: FUSE },
  { name: 'FUSE device change', field: 'dev', type: FUSE },
  { name: 'FUSE full verification', field: 'ino', type: FUSE, verify: true },
  { name: 'unavailable filesystem type', field: 'ino', type: null },
  { name: 'malformed saved inode', field: 'ino', type: FUSE, malformed: true },
]) test('receipt reuse: ' + scenario.name, async t => {
  const root = temporaryDirectory('receipt-inode-'), state = path.join(root, 'state');
  const file = path.join(root, 'source'), bytes = Buffer.from('unchanged asset');
  fs.mkdirSync(state); fs.writeFileSync(file, bytes);
  const initial = await preparationFiles(state);
  await initial.inspect(file);
  await initial.save();
  const index = path.join(state, 'verified-files.json');
  if (scenario.malformed) {
    const saved = JSON.parse(fs.readFileSync(index, 'utf8'));
    const fields = saved.files[file].identity.split(':'); fields[1] = 'invalid';
    saved.files[file].identity = fields.join(':');
    saved.hash = hash(JSON.stringify(saved.files));
    fs.writeFileSync(index, JSON.stringify(saved) + '\n');
  }
  const before = fs.readFileSync(index, 'utf8');
  const stat = fs.lstatSync(file, { bigint: true });
  const changed = { ...stat, [scenario.field]: stat[scenario.field] + 1n, isFile: () => true };
  t.mock.method(fs.promises, 'lstat', async () => changed);
  t.mock.method(fs, 'statfsSync', () => {
    if (scenario.type === null) throw new Error('unavailable');
    return { type: scenario.type };
  });
  const files = await preparationFiles(state, scenario.verify);
  assert.equal((await files.inspect(file)).hash, hash(bytes));
  assert.equal(files.stats.hashedFiles, scenario.reused ? 0 : 1);
  assert.equal(files.stats.reusedFiles, scenario.reused ? 1 : 0);
  if (scenario.reused) {
    await files.save();
    assert.equal(fs.readFileSync(index, 'utf8'), before, 'inode drift must not rewrite the receipts');
  }
});
