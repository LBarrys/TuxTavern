'use strict';

// MV on Pixi 7 (Karryn's Prison): extract.base64 and extract.image return Promises, as in
// Pixi 7 (a plugin's .then() threw on a string); canvas and pixels stay synchronous.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('Pixi 7 extract: base64 and image are Promises, pixels is synchronous', async () => {
  function CanvasElement() { this.width = 0; this.height = 0; }
  CanvasElement.prototype.getContext = function() {
    return { drawImage() {}, getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(7) }) };
  };
  CanvasElement.prototype.toDataURL = () => 'data:image/png;base64,AAAA';
  function Image() {}
  Object.defineProperty(Image.prototype, 'src', { set(value) { this._src = value; setImmediate(() => this.onload()); } });
  const context = vm.createContext({
    CanvasElement, Image, Promise, setImmediate, Uint8Array, Object,
    Graphics: { width: 4, height: 4, _canvas: {} },
    Utils: { isOptionValid: () => false },
    PMJS: { pixi7: { renderStageToCanvas() {} } },
    PIXI: { Renderer: function() {
      return { extract: { canvas() { const canvas = new CanvasElement(); canvas.width = 4; canvas.height = 4; return canvas; } } };
    } },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/pmjs-pixi7/renderer.js'), 'utf8'), context);
  context.Graphics._createRenderer();
  const extract = context.Graphics._renderer.extract;
  const url = extract.base64({});
  assert.equal(typeof url.then, 'function');
  assert.equal(await url, 'data:image/png;base64,AAAA');
  assert.equal((await extract.image({}))._src, 'data:image/png;base64,AAAA');
  const pixels = extract.pixels({}, { x: 0, y: 0, width: 2, height: 1 });
  assert.equal(pixels.length, 8);
  assert.equal(pixels[0], 7);
});

// Plugins' clickable sprites (eventMode, on('pointertap')): PMJS sends mouse presses and the wheel
// to the document, and a release there is over the game, not "outside" the canvas.
test('Pixi 7 event system hears document presses and releases over the canvas', () => {
  const listeners = {};
  const document = { addEventListener(type, fn) { listeners[type] = fn; }, removeEventListener() {} };
  function EventSystem(renderer) {
    this.renderer = renderer;
    this.onPointerDown = (event) => { this.down = event; };
    this.onWheel = () => {};
    this.onPointerUp = (event) => { this.upTarget = event.target; this.upButton = event.button; };
  }
  EventSystem.prototype.init = function() { this.domElement = this.renderer.view; };
  EventSystem.prototype.destroy = function() {};
  const view = {};
  const context = vm.createContext({
    document, Object, Utils: { isOptionValid: () => false },
    Graphics: { width: 4, height: 4, _canvas: view },
    PMJS: { pixi7: {} },
    PIXI: { EventSystem, Renderer: function(options) { return { view: options.view, extract: {} }; } },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/pmjs-pixi7/renderer.js'), 'utf8'), context);
  context.Graphics._createRenderer();
  const events = context.Graphics._renderer.events;
  assert.ok(events instanceof EventSystem);
  listeners.mousedown({ clientX: 3 });
  assert.equal(events.down.clientX, 3);
  events.onPointerUp({ target: document, button: 2 });
  assert.equal(events.upTarget, view);
  assert.equal(events.upButton, 2);
});
