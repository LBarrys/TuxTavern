'use strict';
// TuxTavern: Netorare God V0.11's EliMZ_Book copied every loaded image into a canvas, which failed
// for its 14175x3864 battlers.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const adapter = fs.readFileSync(path.join(__dirname, '../js/pmjs-plugins/eli-book-canvas.js'), 'utf8');

function load({ withAdapter = true, pixelPerfect = true } = {}) {
  const context = vm.createContext({
    copies: 0,
    document: { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage() { context.copies++; } }) }) },
    PMJS: { plugins: { onLoaded(name, owner, run) { if (name === 'EliMZ_Book') run(); } } }
  });
  // RPG Maker MZ 1.8's Bitmap canvas path.
  vm.runInContext(`function Bitmap() { this._canvas = null; this._context = null; this._image = null; }
    Object.defineProperty(Bitmap.prototype, 'context', { get: function() { this._ensureCanvas(); return this._context; }, configurable: true });
    Bitmap.prototype._ensureCanvas = function() {
      if (!this._canvas) {
        if (this._image) { this._createCanvas(this._image.width, this._image.height); this._context.drawImage(this._image, 0, 0); }
        else this._createCanvas(0, 0);
      }
    };
    Bitmap.prototype._createCanvas = function(width, height) {
      this._canvas = document.createElement('canvas'); this._context = this._canvas.getContext('2d');
      this._canvas.width = width; this._canvas.height = height; this._createBaseTexture(this._canvas);
    };
    Bitmap.prototype._createBaseTexture = function(source) { this._baseTexture = { source: source }; };
    var Eli = { Book: { isPixelPerfect: function() { return ${pixelPerfect}; } } }, Alias = {};`, context);
  // EliMZ_Book 4.1.2, as the game ships it.
  vm.runInContext(`Alias.Bitmap_createBaseTexture = Bitmap.prototype._createBaseTexture
Bitmap.prototype._createBaseTexture = function(source) {
    if(this.context && Eli.Book.isPixelPerfect()) {
        this.context.imageSmoothingEnabled = false
        this.context.lineCap = "square"
        this.context.lineJoin = "miter"
    }
    
    Alias.Bitmap_createBaseTexture.call(this, source)
}`, context);
  if (withAdapter) vm.runInContext(adapter, context);
  return context;
}

function loadImage(context) {
  return vm.runInContext(`(function () { var b = new Bitmap(); b._image = { width: 14175, height: 3864 };
    b._createBaseTexture(b._image); return b; })()`, context);
}

test('without the adapter EliMZ_Book copies each loaded image into a canvas', () => {
  const context = load({ withAdapter: false });
  loadImage(context);
  assert.equal(context.copies, 1);
});

test('a loaded image keeps its image texture and is not copied', () => {
  for (const pixelPerfect of [true, false]) {
    const context = load({ pixelPerfect });
    const bitmap = loadImage(context);
    assert.equal(context.copies, 0);
    assert.equal(bitmap._baseTexture.source, bitmap._image);
    assert.equal(Object.prototype.hasOwnProperty.call(bitmap, 'context'), false);
  }
});

test('a canvas made later still gets the pixel-perfect settings', () => {
  const context = load();
  const bitmap = loadImage(context);
  const drawing = bitmap.context;
  assert.equal(context.copies, 1);
  assert.equal(drawing.imageSmoothingEnabled, false);
  assert.equal(drawing.lineCap, 'square');
  assert.equal(bitmap._baseTexture.source, bitmap._canvas);
});
