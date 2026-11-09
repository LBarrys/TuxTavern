'use strict';

// Many separate sprites under one colour filter: merging their regions was cubic
// (1000 sprites took 0.6 s a frame). Past a cap the filter uses its bounding rectangle.
const assert = require('node:assert/strict');
const path = require('node:path');

const native = require(path.resolve(process.argv[2]));
native.initialize({ gameRoot: path.resolve(process.argv[3]), assetRoot: '', width: 816, height: 624, windowTitle: 'filter regions' });
const stride = native.scene.schema.valueStride;
const image = native.images.load('fixture.png');
const HALVE = [0.5, 0, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0, 1, 0, 1];
const record = (metadata, values) => ({ metadata: Uint32Array.from(metadata), values });
const base = () => { const values = new Float32Array(stride); values.set([1, 0, 0, 1, 0, 0, 1]); return values; };
const records = [];
const begin = base(); begin.set(HALVE.slice(0, 10), 7); begin.set(HALVE.slice(10), 22); begin[33] = 1;
records.push(record([6, 0xffffffff, 0, 0xffffff, 25, 0, 0], begin));
for (let i = 0; i < 1000; i++) {
  const values = base();
  values[4] = (i % 200) * 4; values[5] = Math.floor(i / 200) * 4;
  values.set([0, 0, 2, 2], 9); values.set([2, 2], 13);
  records.push(record([1, 0xffffffff, image.handle, 0xffffff, 0, 0, 0], values));
}
records.push(record([7, 0xffffffff, 0, 0xffffff, 0, 0, 0], base()));
const metadata = new Uint32Array(records.length * 7), values = new Float32Array(records.length * stride);
records.forEach((item, index) => { metadata.set(item.metadata, index * 7); values.set(item.values, index * stride); });

const times = [];
for (let frame = 0; frame < 5; frame++) {
  native.beginFrame();
  native.render.setClearColor(0, 0, 0, 0);
  assert.equal(native.scene.submit(native.scene.packetVersion, metadata, values, records.length), undefined);
  const started = performance.now();
  native.renderScene();
  times.push(performance.now() - started);
}
times.sort((a, b) => a - b);
assert.ok(times[2] < 250, `1000 filtered sprites render in ${times[2].toFixed(0)} ms, not under 250 ms`);
const frame = native.canvas.captureScene();
assert.notEqual(native.canvas.pixel(frame.handle, 0, 0) & 0xff, 0, 'the filtered sprites still draw');
assert.equal(native.canvas.pixel(frame.handle, 2, 2) & 0xff, 0, 'gaps between them stay clear');
native.canvas.release(frame.handle);
console.log('filter region cap ok');
