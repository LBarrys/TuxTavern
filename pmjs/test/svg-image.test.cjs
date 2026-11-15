'use strict';

// SVG images are drawn with the canvas (Karryn's Prison's menu cursor: three Inkscape SVGs that
// Pixi loads as textures through an <img> with a data URL).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function harness() {
  const calls = [], canvases = [], observed = [], tasks = [], events = [], decoded = [], paths = [];
  function CanvasElement() {
    this.width = 0; this.height = 0; canvases.push(this);
    this._ensureNativeCanvas = () => ({ handle: 7 });
  }
  CanvasElement.prototype.getContext = function() {
    return new Proxy({}, {
      get: (target, key) => (key in target ? target[key] : (...args) => calls.push([key, ...args])),
      set: (target, key, value) => { calls.push([key + '=', value]); return true; },
    });
  };
  function GenericElement() {}
  const context = vm.createContext({
    CanvasElement, GenericElement, TextDecoder, Uint8Array, atob, Promise,
    PMJS: { compat: { observed: (what, detail) => observed.push(detail) }, images: { shouldRetainPixels: () => false, loadCompleted() {} },
      tasks: { enqueue: callback => tasks.push(callback), queued: () => false } },
    NativeHost: { fs: { readText: file => (file === 'img/cursor.svg' ? '<svg width="2" height="3"/>' : null) },
      images: { fallbackImage: () => ({ width: 1, height: 1 }),
        loadBytesAsync: buffer => { decoded.push([...new Uint8Array(buffer)]); return Promise.resolve({ width: 8, height: 9 }); },
        loadAsync: file => { paths.push(file); return Promise.resolve(null); } } },
    gameReadPath: file => file, decodeResourceUrlPath: url => decodeURIComponent(url),
    trackNativeResource: resource => resource, releaseNativeResource() {},
    pmjsDispatchHostEvent: (target, event) => { events.push(event.type); return Promise.resolve(true); },
    pmjsReportEventError(error) { throw error; },
  });
  for (const file of ['svg.js', 'image-element.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/pmjs-web', file), 'utf8'), context);
  }
  return { context, calls, canvases, observed, tasks, events, decoded, paths,
    draw: text => { calls.length = 0; return context.PMJS.web.svg.canvas(text); } };
}

test('an Inkscape SVG is sized from its millimetres and drawn through its transforms', () => {
  const h = harness();
  const canvas = h.draw(`<?xml version="1.0"?><!-- Inkscape -->
    <svg width="48mm" height="32mm" viewBox="0 0 48 32" xmlns:svg="http://www.w3.org/2000/svg">
      <defs id="defs1"><rect width="9" height="9"/></defs>
      <g style="fill:#ffffff" transform="matrix(2,0,0,2,1,1)">
        <path d="m 1,2 3.79e-4,-3.91e-4 c 0,0 1,1 2,2 V 5 z"/>
        <ellipse cx="3" cy="4" rx="1" ry="2" style="opacity:0.5"/>
        <rect x="1" y="1" width="2" height="2" style="display:none"/>
      </g>
      <metadata><rdf:RDF/></metadata>
    </svg>`);
  // 48 mm is 181.4 px and 32 mm 120.9 px; Chromium rounds both.
  assert.deepEqual([canvas.width, canvas.height], [181, 121]);
  // The viewBox at the exact size (96 px per inch), then the group's matrix(2,0,0,2,1,1).
  const scale = 96 / 25.4, top = 0;
  const transform = h.calls.find(call => call[0] === 'setTransform');
  assert.deepEqual(transform.slice(1).map(v => +v.toFixed(3)),
    [2 * scale, 0, 0, 2 * scale, scale, scale + top].map(v => +v.toFixed(3)));
  const path = h.calls.slice(h.calls.findIndex(call => call[0] === 'moveTo'));
  assert.deepEqual(path[0], ['moveTo', 1, 2]);
  assert.deepEqual(path[1].map(v => (typeof v === 'number' ? +v.toFixed(6) : v)), ['lineTo', 1.000379, 1.999609],
    'an exponent is a number, not a path command');
  assert.equal(path[2][0], 'bezierCurveTo');
  assert.deepEqual(path[3].map(v => (typeof v === 'number' ? +v.toFixed(6) : v)), ['lineTo', 3.000379, 5]);
  assert.equal(path[4][0], 'closePath');
  assert.ok(h.calls.some(call => call[0] === 'ellipse' && call[1] === 3 && call[3] === 1 && call[4] === 2));
  assert.deepEqual(h.calls.filter(call => call[0] === 'globalAlpha=').map(call => call[1]), [1, 0.5]);
  assert.equal(h.calls.filter(call => call[0] === 'fill').length, 2, 'defs and hidden shapes are not drawn');
});

test('arcs, strokes and unsupported paint', () => {
  const h = harness();
  h.draw('<svg viewBox="0 0 10 10"><path d="M0 5 A5 5 0 0 1 10 5" fill="none" stroke="red" stroke-width="2"/>' +
    '<circle cx="5" cy="5" r="2" fill="url(#gradient)"/></svg>');
  const ellipse = h.calls.find(call => call[0] === 'ellipse');
  assert.deepEqual(ellipse.slice(1, 5).map(v => +v.toFixed(6)), [5, 5, 5, 5]);
  assert.ok(h.calls.some(call => call[0] === 'stroke'));
  assert.ok(h.calls.some(call => call[0] === 'lineWidth=' && call[1] === 2));
  assert.equal(h.calls.filter(call => call[0] === 'fill').length, 0);
  assert.deepEqual(h.observed, ['paint server']);
});

test('an <img> with an SVG data URL or file loads as a canvas', async () => {
  const h = harness();
  for (const [source, size] of [
    ['data:image/svg+xml,' + encodeURIComponent('<svg width="4" height="5"></svg>'), [4, 5]],
    ['data:image/svg+xml;base64,' + Buffer.from('<svg width="6" height="7"/>').toString('base64'), [6, 7]],
    ['img/cursor.svg', [2, 3]],
  ]) {
    const image = new h.context.NativeImage();
    image.src = source;
    assert.equal(image.complete, false);
    await h.tasks.shift()();
    assert.deepEqual([image.width, image.height, image.complete], [...size, true]);
    assert.equal(image._pmjsCanvasOwner, h.canvases.at(-1));
    assert.deepEqual(image._nativeCanvas, { handle: 7 });
    assert.equal(h.events.at(-1), 'load');
  }
  const broken = new h.context.NativeImage();
  broken.src = 'img/missing.svg';
  await h.tasks.shift()();
  assert.equal(h.events.at(-1), 'error');
  assert.equal(broken._pmjsLoadFailed, true);
});

// The Rain Monster's GOSSSave keeps save thumbnails as JPEG data URLs; read as a game file, the
// thumbnail failed and loading a save froze on MZ's load error.
test('an <img> with a JPEG or PNG data URL decodes its bytes', async () => {
  const h = harness();
  for (const source of [
    'data:image/jpeg;base64,' + Buffer.from([0xff, 0xd8, 0x00, 0x80]).toString('base64'),
    'data:image/png,%FF%D8%00%80',
  ]) {
    const image = new h.context.NativeImage();
    image.src = source;
    await h.tasks.shift()();
    await new Promise(resolve => setImmediate(resolve));
    await h.tasks.shift()();
    assert.deepEqual(h.decoded.at(-1), [0xff, 0xd8, 0x00, 0x80]);
    assert.deepEqual([image.width, image.height, image._pmjsLoadFailed], [8, 9, false]);
    assert.equal(h.events.at(-1), 'load');
  }
  assert.deepEqual(h.paths, [], 'no data URL is read as a game file');
});
