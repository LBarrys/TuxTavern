'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function load() {
  const hits = [];
  const context = { PMJS: { compat: { hit: (area, what) => hits.push(what) } },
    nativeSceneMetadataStride: 7, nativeSceneValueStride: 41 };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/pmjs-pixi4/scene-packet.js'), 'utf8'), context);
  return { context, hits };
}

function packet(kinds) {
  const metadata = new Uint32Array(kinds.length * 7);
  const values = new Float32Array(kinds.length * 41);
  kinds.forEach((kind, index) => {
    metadata[index * 7] = kind;
    values.set([1, 0, 0, 1, 10, 20, 1], index * 41);
  });
  return { count: kinds.length, metadata, values };
}

test('a sprite at x = NaN is hidden instead of failing the frame', () => {
  const { context, hits } = load();
  const p = packet([0, 1, 1]);
  p.values[41 + 4] = NaN;
  assert.equal(context.hideNonFiniteSceneRecords(p), 1);
  assert.deepEqual(Array.from(p.values.subarray(41, 48)), [1, 0, 0, 1, 0, 20, 0]);
  assert.deepEqual(Array.from(p.values.subarray(82, 89)), [1, 0, 0, 1, 10, 20, 1], 'others untouched');
  assert.deepEqual(hits, ['non-finite-record']);
});

test('filter records get their non-finite numbers zeroed but keep their alpha slot', () => {
  const { context } = load();
  const p = packet([6]);
  p.values[10] = Infinity;
  assert.equal(context.hideNonFiniteSceneRecords(p), 1);
  assert.equal(p.values[10], 0);
  assert.equal(p.values[6], 1);
});

test('a finite frame is left alone', () => {
  const { context, hits } = load();
  const p = packet([0, 1]);
  const before = Array.from(p.values);
  assert.equal(context.hideNonFiniteSceneRecords(p), 0);
  assert.deepEqual(Array.from(p.values), before);
  assert.deepEqual(hits, []);
});
