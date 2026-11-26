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

// A file written through writeVerified is hashed as it is written (upstream 0a1ec50).
const receipts = root => JSON.parse(fs.readFileSync(path.join(root, 'verified-files.json'))).files;
test('verified writes hash streamed bytes once, keep an owned header and are reused', async () => {
  const root = temporaryDirectory('verified-write-'), file = path.join(root, 'output');
  const files = await preparationFiles(root), chunk = Buffer.alloc(300 * 1024, 73);
  const expected = Buffer.concat([chunk, Buffer.alloc(chunk.length, 84)]);
  async function* chunks() { yield chunk; chunk.fill(84); yield chunk; chunk.fill(0); }
  const checked = await files.writeVerified(file, chunks(), { expectedSize: expected.length });
  assert.equal(checked.hash, hash(expected));
  assert.deepEqual(fs.readFileSync(file), expected);
  assert.deepEqual(checked.header, Buffer.alloc(32, 73));
  assert.equal((await files.inspect(file)).reused, true);
  assert.equal(files.stats.hashedBytes, expected.length);
  fs.appendFileSync(file, 'changed');
  assert.notEqual(await files.hash(file), checked.hash);
});

for (const mode of ['producer', 'size', 'close', 'replacement'])
test('a verified write refuses a ' + mode + ' failure without leaving a file or receipt', async t => {
  const root = temporaryDirectory('failed-verified-write-'), file = path.join(root, 'output');
  const files = await preparationFiles(root), open = fs.promises.open;
  if (mode === 'close' || mode === 'replacement') t.mock.method(fs.promises, 'open', async (...args) => {
    const handle = await open(...args);
    if (args[0] !== file || args[1] !== 'wx') return handle;
    if (mode === 'close') {
      const close = handle.close.bind(handle);
      let fail = true;
      handle.close = async () => { await close(); if (fail) { fail = false; throw new Error('close interrupted'); } };
    } else {
      const write = handle.writeFile.bind(handle);
      handle.writeFile = async (...values) => {
        await write(...values);
        fs.writeFileSync(file + '.replacement', 'replacement');
        fs.renameSync(file + '.replacement', file);
      };
    }
    return handle;
  });
  async function* chunks() {
    yield Buffer.from('original');
    if (mode === 'producer') throw new Error('producer interrupted');
  }
  await assert.rejects(files.writeVerified(file, chunks(), { expectedSize: mode === 'size' ? 7 : 8 }),
    /interrupted|differs|changed/);
  assert.equal(fs.existsSync(file), false);
  await files.save();
  assert.equal(receipts(root)[file], undefined);
});

test('a verified write keeps an existing destination', async () => {
  const root = temporaryDirectory('existing-verified-write-'), file = path.join(root, 'output');
  fs.writeFileSync(file, 'original');
  const files = await preparationFiles(root);
  await assert.rejects(files.writeVerified(file, [Buffer.from('replacement')]), /EEXIST/);
  assert.equal(fs.readFileSync(file, 'utf8'), 'original');
});

// Files are hashed through one reused 256 KiB buffer (upstream 7782821).
test('a file is hashed in 256 KiB reads, and concurrent hashes keep their own buffers and headers', async t => {
  const root = temporaryDirectory('concurrent-verification-'), files = await preparationFiles(root);
  const sources = [73, 84, 105].map((value, index) => {
    const name = path.join(root, String(index)), bytes = Buffer.alloc(700 * 1024, value);
    bytes[0] = index;
    fs.writeFileSync(name, bytes);
    return { name, bytes };
  });
  const open = fs.promises.open, reads = [];
  t.mock.method(fs.promises, 'open', async (...args) => {
    const handle = await open(...args), read = handle.read.bind(handle);
    handle.read = async (...values) => { const r = await read(...values); reads.push(r.bytesRead); return r; };
    return handle;
  });
  const checked = await Promise.all(sources.slice(0, 2).map(source => files.inspect(source.name)));
  await files.inspect(sources[2].name);
  checked.forEach((result, index) => {
    assert.equal(result.hash, hash(sources[index].bytes));
    assert.deepEqual(result.header, sources[index].bytes.subarray(0, 32));
  });
  assert.equal(reads.length, 3 * 4, 'each 700 KiB file takes three full reads and an empty one');
});

test('a failed read leaves no receipt and the next verification succeeds', async t => {
  const root = temporaryDirectory('failed-verification-'), source = path.join(root, 'source');
  const bytes = Buffer.alloc(700 * 1024, 73);
  fs.writeFileSync(source, bytes);
  const files = await preparationFiles(root), open = fs.promises.open;
  let interrupt = true;
  t.mock.method(fs.promises, 'open', async (...args) => {
    const handle = await open(...args), read = handle.read.bind(handle);
    handle.read = async (...values) => {
      if (interrupt) { interrupt = false; throw new Error('read interrupted'); }
      return read(...values);
    };
    return handle;
  });
  await assert.rejects(files.inspect(source), /read interrupted/);
  await files.save();
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'verified-files.json'))).files[source], undefined);
  assert.equal((await files.inspect(source)).hash, hash(bytes));
});

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
