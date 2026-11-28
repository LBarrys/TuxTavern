'use strict';
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const test = require('node:test');
const { temporaryDirectory } = require('./helpers/temp.cjs');
const { checksum, publishCatalog, readCatalog, retainedCatalogKeys, previousGenerations } = require('../runner/preparation-catalog.cjs');

const rawChecksum = value => crypto.createHash('sha256').update(value, 'utf8').digest('hex');

function fixture(root) {
  const key = 'a'.repeat(64);
  const binding = { processor: 'v1' };
  const payload = { keys: [key], summary: { installed: 1 }, maps: [], index: {}, entries: [{ directory: path.join(root, 'entries', key),
    descriptor: { pages: [], cells: [], sources: [{ snapshot: path.join(root, 'maps/sources', key+'.png') }] } }] };
  return { key, binding, payload };
}
function writeV2(file, binding, payload) {
  return fs.writeFile(file, JSON.stringify({ version: 2, binding: checksum(binding), checksum: checksum(payload), payload }));
}
function mutatePayloadString(stored, mutate) {
  const payload = JSON.parse(stored);
  mutate(payload);
  return JSON.stringify(payload);
}
// A version 4 file as the publisher writes it: the header, then the payload's JSON text.
function v4Text({ payload, ...header }, payloadText = JSON.stringify(payload)) {
  return JSON.stringify(header).slice(0, -1) + ',"payload":' + payloadText + '}';
}

test('catalog diagnostics distinguish first launch, changed binding and damaged cache', async () => {
  const root = temporaryDirectory('pmjs-catalog-diagnostics-');
  const { binding, payload } = fixture(root);
  const file = path.join(root, 'catalog.json'), reasons = [];
  const read = selected => readCatalog(file, selected, root, reason => reasons.push(reason));
  assert.equal(await read(binding), null);
  assert.deepEqual(reasons.splice(0), ['missing']);
  await publishCatalog(file, binding, root, payload);
  assert.deepEqual(await read(binding), payload);
  assert.deepEqual(reasons, []);
  assert.equal(await read({ processor: 'v2' }), null);
  assert.deepEqual(reasons.splice(0), ['binding-mismatch']);
  const stored = JSON.parse(await fs.readFile(file));
  stored.checksum = 'damaged';
  await fs.writeFile(file, v4Text(stored));
  assert.equal(await read(binding), null);
  assert.deepEqual(reasons.splice(0), ['integrity-mismatch']);
  await fs.writeFile(file, '{interrupted');
  assert.equal(await read(binding), null);
  assert.deepEqual(reasons, ['unreadable-or-invalid']);
});

test('catalog publication validates integrity, version, binding and cache paths', async () => {
  const root = temporaryDirectory('pmjs-catalog-');
  const { binding, payload } = fixture(root);
  const file = path.join(root, 'catalog.json');
  await publishCatalog(file, binding, root, payload);
  assert.equal(JSON.parse(await fs.readFile(file)).version, 4);
  assert.deepEqual(await readCatalog(file, binding, root), payload);
  assert.equal(await readCatalog(file, { processor: 'v2' }, root), null);
  const original = JSON.parse(await fs.readFile(file));
  const text = JSON.stringify(original.payload);
  for (const mutate of [c => { c.version++; }, c => { c.checksum = 'bad'; },
    c => { c.text = mutatePayloadString(c.text, p => { p.entries[0].directory = '../outside'; });
      c.checksum = rawChecksum(c.text); },
    c => { c.text = mutatePayloadString(c.text, p => { p.entries[0].descriptor.sources[0].snapshot = '/tmp/page.png'; });
      c.checksum = rawChecksum(c.text); },
    c => { c.text = text.replace('"keys"', ' "keys"'); }]) {
    const changed = { ...structuredClone(original), text }; mutate(changed);
    const { text: payloadText, ...stored } = changed;
    await fs.writeFile(file, v4Text(stored, payloadText));
    assert.equal(await readCatalog(file, binding, root), null);
  }
  await fs.writeFile(file+'.stage-'+process.pid, 'interrupted');
  await publishCatalog(file, binding, root, payload);
  assert.deepEqual(await readCatalog(file, binding, root), payload);
  assert.equal((await fs.readdir(root)).some(name => name.includes('.stage-')), false);
});

test('version 2 catalogs keep their fast path across the upgrade', async () => {
  const root = temporaryDirectory('pmjs-catalog-v2-');
  const { binding, payload } = fixture(root);
  const key = 'a'.repeat(64);
  // Version 2 files store root-relative paths, as the old publisher wrote them.
  const stored = structuredClone(payload);
  stored.entries[0].directory = 'entries/' + key;
  stored.entries[0].descriptor.sources[0].snapshot = 'maps/sources/' + key + '.png';
  const file = path.join(root, 'catalog.json');
  await writeV2(file, binding, stored);
  assert.deepEqual(await readCatalog(file, binding, root), payload);
  assert.equal(await readCatalog(file, { processor: 'v2' }, root), null);
  const original = JSON.parse(await fs.readFile(file));
  const changed = structuredClone(original);
  changed.payload.entries[0].directory = '../outside';
  changed.checksum = checksum(changed.payload);
  await fs.writeFile(file, JSON.stringify(changed));
  assert.equal(await readCatalog(file, binding, root), null);
});

test('version 4 is parsed once, stays JSON for older readers, and version 3 still reads', async () => {
  const root = temporaryDirectory('pmjs-catalog-v4-');
  const { key, binding, payload } = fixture(root);
  const file = path.join(root, 'catalog.json');
  await publishCatalog(file, binding, root, payload);
  // An older TuxTavern parses the whole file, misses on the version, and its cache cleanup still
  // keeps every key the catalog names.
  const whole = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(typeof whole.payload, 'object');
  assert.deepEqual(retainedCatalogKeys(whole), [key]);
  const stored = structuredClone(payload);
  stored.entries[0].directory = 'entries/' + key;
  stored.entries[0].descriptor.sources[0].snapshot = 'maps/sources/' + key + '.png';
  assert.deepEqual(whole.payload, stored, 'paths are stored relative to the cache');
  const v3 = JSON.stringify(stored);
  await fs.writeFile(file, JSON.stringify({ version: 3, binding: whole.binding, fields: whole.fields, checksum: rawChecksum(v3), payload: v3 }));
  const legacy = await readCatalog(file, binding, root);
  assert.deepEqual(legacy, payload);
  assert.equal(legacy.storedVersion, 3, 'the caller learns it is an older version, to rewrite it');
  await publishCatalog(file, binding, root, legacy);
  const rewritten = await readCatalog(file, binding, root);
  assert.deepEqual(rewritten, payload);
  assert.equal(rewritten.storedVersion, 4);
  await fs.rm(root, { recursive: true, force: true });
});

test('a path that is not in stored form is still resolved and checked', async () => {
  const root = temporaryDirectory('pmjs-catalog-forms-');
  const { key, binding, payload } = fixture(root);
  const file = path.join(root, 'catalog.json');
  await publishCatalog(file, binding, root, payload);
  const whole = JSON.parse(await fs.readFile(file, 'utf8'));
  for (const [directory, accepted] of [['entries/' + key + '/../' + key, true], ['./entries/' + key, true],
    ['entries/' + key + '/..', false], ['entries/' + key + '/.', true], ['maps/../entries/' + key, true]]) {
    const changed = structuredClone(whole);
    changed.payload.entries[0].directory = directory;
    const text = JSON.stringify(changed.payload);
    changed.checksum = rawChecksum(text);
    await fs.writeFile(file, v4Text(changed, text));
    const read = await readCatalog(file, binding, root);
    assert.equal(read ? read.entries[0].directory : null, accepted ? path.join(root, 'entries', key) : null, directory);
  }
  await fs.rm(root, { recursive: true, force: true });
});

test('retention understands version 2, version 3 and legacy index records', async () => {
  const key = 'b'.repeat(64), other = 'c'.repeat(64);
  assert.deepEqual(retainedCatalogKeys({ keys: [key], snapshots: [other] }), [key, other]);
  assert.deepEqual(retainedCatalogKeys({ payload: { keys: [key] } }), [key]);
  assert.deepEqual(retainedCatalogKeys({ payload: JSON.stringify({ keys: [key] }) }), [key]);
  assert.deepEqual(retainedCatalogKeys({ payload: '{damaged' }), []);
  assert.deepEqual(retainedCatalogKeys(null), []);
  assert.deepEqual(retainedCatalogKeys({ payload: { keys: ['nope'] } }), []);
});

test('an index keeps one other runtime version, and none for unversioned indexes (upstream issue #16)', () => {
  const a = 'a'.repeat(64), b = 'b'.repeat(64), c = 'c'.repeat(64);
  assert.deepEqual(previousGenerations({ keys: [a] }, 'v2'), []);
  assert.deepEqual(previousGenerations({ generation: 'v2', keys: [b], previous: [{ generation: 'v1', keys: [a] }] }, 'v2'),
    [{ generation: 'v1', keys: [a] }]);
  const previous = previousGenerations({ generation: 'v2', keys: [b], snapshots: [c], previous: [{ generation: 'v1', keys: [a] }] }, 'v3');
  assert.deepEqual(previous, [{ generation: 'v2', keys: [b], snapshots: [c] }]);
  assert.deepEqual(retainedCatalogKeys({ keys: [a], previous }), [a, b, c]);
  assert.deepEqual(retainedCatalogKeys({ previous: [null, { keys: ['nope'] }] }), []);
});

// Upstream 2a47b85: a changed binding names what changed, so cache invalidations can be explained.
test('a binding mismatch names the changed parts', async () => {
  const root = temporaryDirectory('pmjs-catalog-changed-');
  const { payload } = fixture(root);
  const file = path.join(root, 'catalog.json'), misses = [];
  const binding = { processor: 'v1', recipes: [], width: 816 };
  await publishCatalog(file, binding, root, payload);
  assert.equal(await readCatalog(file, { processor: 'v1', recipes: [{ source: 'a.png' }], height: 624 }, root,
    (reason, changed) => misses.push([reason, changed])), null);
  assert.deepEqual(misses, [['binding-mismatch', ['height', 'recipes', 'width']]]);
  await fs.rm(root, { recursive: true, force: true });
});
