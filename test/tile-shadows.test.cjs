'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

function load() {
  const created = [];
  const fills = [];
  let nextHandle = 1000;
  const context = {
    PMJS: {}, console: { log() {} },
    FinalizationRegistry: class { register() {} unregister() {} },
    PMJS_GAME_CONFIG: { disableOptimizations: [] },
    NativeHost: { runtime: { env() {} }, scene: { packetVersion: 30, schema: { version: 30, metadataStride: 7,
      valueStride: 41, transactionalSubmit: true, preparedWorldState: true } }, render: {
      createTileLayer(points, handles) { created.push({ points: Array.from(points), handles: Array.from(handles) }); return ++nextHandle; },
      releaseTileLayer() {}, createMesh() { return ++nextHandle; }, releaseMesh() {},
    } },
    nativeCompatibilityHit() {},
    PIXI: {
      Container: function Container() {
        this.worldAlpha = 1;
        this.transform = { worldTransform: { identity() {} } };
      },
      mesh: { Mesh: { DRAW_MODES: { TRIANGLE_MESH: 0, TRIANGLES: 1 } } },
    },
    CanvasElement: function CanvasElement() {
      const canvas = this;
      this._context = { clearRect() {}, fillRect(x, y, w, h) { fills.push([canvas.width, this.fillStyle, w, h]); } };
    },
  };
  context.CanvasElement.prototype.getContext = function() { return this._context; };
  context.CanvasElement.prototype._ensureNativeCanvas = function() {
    if (!this._native) this._native = { handle: ++nextHandle };
    return this._native;
  };
  vm.createContext(context);
  for (const file of ['js/pmjs-core/config.js', 'js/pmjs-core/optimizations.js', 'js/pmjs-pixi4/scene-primitives.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, { filename: file });
  }
  const ensure = layer => { context.layer = layer; return vm.runInContext('ensureNativeRectTileLayer(layer)', context); };
  return { ensure, created, fills };
}

const texture = handle => ({ baseTexture: { source: { _nativeImage: { handle } } }, width: 16, height: 16 });
const tile = slot => [0, 0, 0, 0, 24, 24, 0, 0, slot];

test('shadow tiles (texture -1) get a texture in the layer shadow colour', () => {
  const { ensure, created, fills } = load();
  const layer = { pointsBuf: [...tile(0), ...tile(-1)], textures: [texture(7)],
    shadowColor: new Float32Array([0, 0, 0, 0.5]), _pmjsNativeGeneration: 0 };
  assert.ok(ensure(layer));
  assert.equal(created.length, 1);
  assert.equal(created[0].handles.length, 2);
  assert.equal(created[0].handles[0], 7);
  assert.deepEqual([created[0].points[8], created[0].points[17]], [0, 1]);
  assert.deepEqual(fills, [[128, 'rgba(0,0,0,0.5)', 128, 128]]);
  assert.equal(layer.pointsBuf[17], -1, 'the game\'s own points are left alone');
});

test('a tile naming a missing slot gets a blank texture', () => {
  const { ensure, created } = load();
  const layer = { pointsBuf: [...tile(0), ...tile(2)], textures: [texture(7)], _pmjsNativeGeneration: 0 };
  assert.ok(ensure(layer));
  assert.equal(created[0].handles.length, 3);
  assert.deepEqual([created[0].points[8], created[0].points[17]], [0, 2]);
});

test('layers without shadows or missing slots are unchanged', () => {
  const { ensure, created, fills } = load();
  const layer = { pointsBuf: tile(0), textures: [texture(7)], _pmjsNativeGeneration: 0 };
  assert.ok(ensure(layer));
  assert.deepEqual(created[0].handles, [7]);
  assert.deepEqual(fills, []);
});
