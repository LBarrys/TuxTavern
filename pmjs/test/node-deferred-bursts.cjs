'use strict';

// By default only a burst of loads is deferred: an ordinary load decodes on a worker
// thread, so a new scene does not stall decoding its images on the first frame.
delete process.env.PMJS_DEFER_IMAGES;

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { png } = require('./helpers/png.cjs');
const { temporaryDirectory } = require('./helpers/temp.cjs');

const root = temporaryDirectory('deferred-bursts-');
const red = [255, 0, 0, 255];
fs.writeFileSync(path.join(root, 'hinted.png'), png(2, 1, Buffer.from([...red, ...red])));
for (let i = 0; i < 200; i++) fs.writeFileSync(path.join(root, `p${i}.png`), png(2, 1, Buffer.from([...red, ...red])));
const native = require(path.resolve(process.argv[2]));
native.initialize({ gameRoot: root, assetRoot: '', width: 32, height: 24, windowTitle: 'pmjs deferred bursts' });
const gpuBytes = () => native.images.memory(0).gpuBytes;

async function main() {
  gpuBytes(); // The first report allocates the fallback image.
  const empty = gpuBytes();
  const single = await native.images.loadAsync('p0.png');
  const perImage = gpuBytes() - empty;
  assert.ok(perImage > 0, 'a single load is decoded and uploaded on load');

  const burst = await Promise.all(Array.from({ length: 199 }, (_, i) => native.images.loadAsync(`p${i + 1}.png`)));
  const deferred = 199 - (gpuBytes() - empty - perImage) / perImage;
  assert.ok(deferred >= 100, `most of a 199-image burst waits for its first use, not ${deferred}`);
  assert.ok(deferred < 199, 'the start of the burst still decodes on load');
  for (const image of [single, ...burst]) native.images.release(image.handle);

  // The page marks a burst it queued at once, though it hands them over a few per frame.
  const before = gpuBytes();
  const hinted = await native.images.loadAsync('hinted.png', false, '', true);
  assert.equal(gpuBytes(), before, 'a load the page marks as part of a burst waits for its first use');
  native.images.release(hinted.handle);
}

main().then(() => process.exit(0), error => { console.error(error); process.exit(1); });
