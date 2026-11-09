'use strict';

// NineSlicePlane (plugin window frames and buttons) is drawn as nine sprites: corners at size,
// edges stretched along one axis, the middle both; Pixi 7 shrinks the borders on small planes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function load() {
  let contract;
  class Rectangle { constructor(x, y, width, height) { Object.assign(this, { x, y, width, height }); } }
  class Texture { constructor(baseTexture, frame) { Object.assign(this, { baseTexture, frame, valid: true }); } destroy() {} }
  class Sprite {
    constructor(texture) {
      this.texture = texture;
      this.position = { set: (x, y) => Object.assign(this, { x, y }) };
      this.scale = { set: (x, y) => { this.sx = x; this.sy = y; } };
    }
    updateTransform() { this.updated = this.parent; }
  }
  class NineSlicePlane {
    constructor(texture, l, t, r, b) {
      Object.assign(this, { texture, _leftWidth: l, _topHeight: t, _rightWidth: r, _bottomHeight: b,
        _origWidth: texture.orig.width, _origHeight: texture.orig.height, _width: texture.orig.width,
        _height: texture.orig.height, tint: 0xffffff, blendMode: 0, children: [] });
    }
    _getMinScale() {
      const w = this._leftWidth + this._rightWidth, h = this._topHeight + this._bottomHeight;
      return Math.min(this._width > w ? 1 : this._width / w, this._height > h ? 1 : this._height / h);
    }
  }
  const context = vm.createContext({ PIXI: { NineSlicePlane, Sprite, Texture, Rectangle },
    PMJS: { pixi5: { color: value => value, registerRenderContract(prototype, registered) { contract = registered; } } } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/pmjs-pixi5/nine-slice.js'), 'utf8'), context);
  const texture = { baseTexture: { uid: 1 }, frame: new Rectangle(100, 50, 40, 30), orig: { width: 40, height: 30 }, valid: true };
  return { contract, plane: (...borders) => new NineSlicePlane(texture, ...borders) };
}
const slice = entry => [entry.node.texture.frame.x, entry.node.texture.frame.y, entry.node.texture.frame.width,
  entry.node.texture.frame.height, entry.node.x, entry.node.y, entry.node.x + entry.node.texture.frame.width * entry.node.sx,
  entry.node.y + entry.node.texture.frame.height * entry.node.sy];

test('a stretched NineSlicePlane is nine sprites from its texture frame', () => {
  const { contract, plane } = load();
  const p = plane(6, 8, 10, 4);
  p._width = 180; p._height = 150;
  const parts = contract.children(p).map(slice);
  assert.equal(parts.length, 9);
  assert.deepEqual(parts[0], [100, 50, 6, 8, 0, 0, 6, 8], 'top-left corner at its size');
  assert.deepEqual(parts[4], [106, 58, 24, 18, 6, 8, 170, 146], 'middle stretched both ways');
  assert.deepEqual(parts[8], [130, 76, 10, 4, 170, 146, 180, 150], 'bottom-right corner at its size');
  assert.ok(contract.children(p).every(entry => entry.node.updated === p), 'slices transform under the plane');
});

test('a plane smaller than its borders shrinks them, as Pixi 7 does', () => {
  const { contract, plane } = load();
  const p = plane(6, 8, 10, 4);
  p._width = 8; p._height = 6;
  const parts = contract.children(p).map(slice);
  const scale = 0.5;
  assert.deepEqual(parts.map(part => part.slice(4)).at(-1), [8 - 10 * scale, 6 - 4 * scale, 8, 6]);
});
