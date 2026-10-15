'use strict';
// Karryn's Prison's FastCutIns turns poses into sprite sheets in workers: a canvas handed to a
// canvas worker gets ImageBitmaps drawn into it, then a crop comes back as a PNG stream.
// SelectiveRendering's worker assigns onmessage in strict mode and loads chunks with importScripts.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { temporaryDirectory } = require('./helpers/temp.cjs');
const native = require(path.resolve(process.argv[2]));

const game = temporaryDirectory('pmjs-workers-');
fs.mkdirSync(path.join(game, 'mods/Fast/workers'), { recursive: true });
fs.writeFileSync(path.join(game, 'mods/Fast/workers/canvas.worker.js'), `"use strict";
const canvases = new Map();
onmessage = async (message) => {
  const { op, id, request } = message.data;
  if (op === 'create') canvases.set(request.canvasId, request.canvas);
  if (op === 'draw') canvases.get(request.canvasId).getContext('2d').drawImage(request.bitmap, request.x, request.y);
  if (op === 'get') {
    const cropped = new OffscreenCanvas(request.width, request.height);
    cropped.getContext('2d').drawImage(canvases.get(request.canvasId), 0, 0, request.width, request.height,
      0, 0, request.width, request.height);
    const blob = await cropped.convertToBlob();
    return postMessage({ id, result: blob.stream() });
  }
  postMessage({ id, result: { self: self === globalThis, location: String(location) } });
};`);
fs.writeFileSync(path.join(game, 'mods/Fast/workers/chunk.js'), 'self.chunkLoaded = (self.chunkLoaded || 0) + 1;');
fs.writeFileSync(path.join(game, 'mods/Fast/workers/text.worker.js'), `"use strict";
importScripts('chunk.js');
const encoder = new TextEncoder();
// Set after startup promises, as webpack workers do once their chunks resolve.
Promise.resolve().then(() => Promise.resolve()).then(() => {
  onmessage = function (event) { postMessage({ bytes: encoder.encode(event.data).length, chunks: self.chunkLoaded }); };
});`);

native.initialize({ gameRoot: game, assetRoot: '', width: 64, height: 48, windowTitle: 'Workers' });
const realm = vm.createContext({ console, Buffer, URL, Blob, TextEncoder, TextDecoder, ReadableStream, DOMException,
  performance, __pmjsBuiltinRequire: require, pmjsGameConfig: {},
  nativeWindowState: { focused: true, visible: true }, PMJS: { config: {} },
  location: { href: 'file:///game/index.html' },
  NativeHost: { canvas: native.canvas, images: native.images, fs: native.fs, runtime: { env: () => '' } } });
for (const file of ['js/pmjs-web/scheduler.js', 'js/pmjs-web/events.js', 'js/pmjs-web/filesystem.js',
    'js/pmjs-web/canvas.js', ...require('./helpers/web-element-sources.cjs').elementSources,
    'js/pmjs-web/workers.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), realm, { filename: file });
}
realm.PMJS.images = { shouldRetainPixels: () => false, loadCompleted() {}, preparedTileSet: '' };

async function settle(done) {
  for (let round = 0; round < 200 && !done(); round++) {
    realm.PMJS.tasks.drain();
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.ok(done(), 'worker work finished');
}
function request(worker, data) {
  let reply;
  worker.onmessage = event => { reply = event.data; };
  worker.postMessage(data);
  return settle(() => reply).then(() => reply);
}
async function pixel(bitmapOrCanvas, x, y) {
  return Array.from(bitmapOrCanvas.getContext('2d').getImageData(x, y, 1, 1).data);
}

(async () => {
  const red = new Uint8ClampedArray(4 * 4 * 4);
  for (let i = 0; i < red.length; i += 4) red.set([255, 0, 0, 255], i);
  const workerPixels = vm.runInNewContext('new Uint8ClampedArray(4)');
  assert.equal(new realm.ImageData(workerPixels, 1, 1).width, 1, 'ImageData takes another context\'s array');
  const redBitmap = await realm.createImageBitmap(new realm.ImageData(red, 4, 4));
  assert.ok(redBitmap instanceof realm.ImageBitmap);
  assert.deepEqual([redBitmap.width, redBitmap.height], [4, 4]);

  const greenSource = new realm.OffscreenCanvas(6, 2);
  const green = greenSource.getContext('2d');
  green.fillStyle = '#00ff00'; green.fillRect(0, 0, 6, 2);
  const greenBitmap = await realm.createImageBitmap(await greenSource.convertToBlob(), 2, 0, 3, 2);
  assert.deepEqual([greenBitmap.width, greenBitmap.height], [3, 2], 'a decoded PNG is cropped');

  const worker = new realm.Worker(new URL('mods/Fast/workers/canvas.worker.js', realm.location.href));
  const sheet = realm.document.createElement('canvas');
  sheet.width = 16; sheet.height = 8;
  const created = await request(worker, { op: 'create', id: 1,
    request: { canvasId: 'a', canvas: sheet.transferControlToOffscreen() } });
  assert.equal(JSON.stringify(created.result),
    '{"self":true,"location":"file:///game/mods/Fast/workers/canvas.worker.js"}');
  await request(worker, { op: 'draw', id: 2, request: { canvasId: 'a', bitmap: redBitmap, x: 0, y: 0 } });
  await request(worker, { op: 'draw', id: 3, request: { canvasId: 'a', bitmap: greenBitmap, x: 4, y: 0 } });
  assert.deepEqual(await pixel(sheet, 5, 1), [0, 255, 0, 255], 'the worker drew into the page canvas');
  const got = await request(worker, { op: 'get', id: 4, request: { canvasId: 'a', width: 7, height: 4 } });
  const chunks = [];
  for await (const chunk of got.result) chunks.push(Buffer.from(chunk));
  const png = Buffer.concat(chunks);
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  const roundTrip = await realm.createImageBitmap(new Blob([png]));
  assert.deepEqual([roundTrip.width, roundTrip.height], [7, 4]);
  assert.deepEqual(await pixel(roundTrip, 1, 1), [255, 0, 0, 255]);
  assert.deepEqual(await pixel(roundTrip, 6, 1), [0, 255, 0, 255]);
  assert.deepEqual(await pixel(roundTrip, 6, 3), [0, 0, 0, 0]);

  const text = new realm.Worker('mods/Fast/workers/text.worker.js');
  assert.equal(JSON.stringify(await request(text, 'héllo')), '{"bytes":6,"chunks":1}');

  let failed;
  const missing = new realm.Worker('mods/Fast/workers/none.js');
  missing.onerror = event => { failed = event.message; };
  await settle(() => failed);
  assert.match(failed, /not found/);

  worker.terminate();
  let late = false;
  worker.onmessage = () => { late = true; };
  worker.postMessage({ op: 'create', id: 5, request: { canvasId: 'b' } });
  for (let round = 0; round < 5; round++) { realm.PMJS.tasks.drain(); await new Promise(r => setImmediate(r)); }
  assert.equal(late, false, 'a terminated worker gets and sends nothing');
  console.log('node-workers ok');
})().catch(error => { console.error(error); process.exit(1); });
