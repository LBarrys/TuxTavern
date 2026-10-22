'use strict';

// MV on Pixi 7 (Karryn's Prison): MV classes and @pixi/tilemap on the shared native scene encoder.
const assert = require('node:assert/strict');
const test = require('node:test');
const { createContext, runModule } = require('./helpers/pixi5-context.cjs');

function harness() {
  const fixture = createContext();
  const { context } = fixture;
  const { Container, Sprite, TilingSprite } = context.PIXI;
  fixture.created = [];
  Object.assign(context.NativeHost.render, {
    createTileLayer(points, handles) {
      fixture.created.push({ points: Array.from(points), handles: Array.from(handles) });
      return fixture.created.length;
    },
    releaseTileLayer() {},
  });
  context.CanvasElement.prototype.getContext = function() {
    return { clearRect() {}, fillRect() {}, drawImage() {} };
  };
  class Tilemap extends Container {
    constructor(tileset) { super(); this.tileset = tileset; this.pointsBuf = []; this.tileAnim = null; }
    render() {}
    destroy() {}
  }
  class CompositeTilemap extends Container { render() {} }
  class ColorMatrixFilter {
    constructor() { this.matrix = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0]; this.alpha = 1; }
    apply() {}
  }
  ColorMatrixFilter.prototype.program = {};
  class Text extends Sprite {
    constructor(texture) { super(texture); this._autoResolution = true; this._resolution = 1; this.updates = []; }
    updateText(respectDirty) { this.updates.push([respectDirty, this._resolution, this.dirty]); }
    _render() {}
  }
  Object.assign(context.PIXI, { Text, ColorMatrixFilter,
    tilemap: { Tilemap, CompositeTilemap, POINT_STRUCT_SIZE: 14 } });
  class MvSprite extends Sprite { _render() {} }
  class MvTilingSprite extends TilingSprite { _render() {} }
  class ToneSprite extends Container { _render() {} }
  class ShaderTilemap extends Container {
    render() {}
    _hackRenderer(renderer) { renderer.plugins.tilemap.tileAnim[0] = 96; renderer.plugins.tilemap.tileAnim[1] = 48; }
  }
  Object.assign(context, { Sprite: MvSprite, TilingSprite: MvTilingSprite, ToneSprite, ShaderTilemap });
  runModule(context, 'js/pmjs-core/methods.js');
  runModule(context, 'js/pmjs-pixi5/scene.js');
  runModule(context, 'js/pmjs-pixi5/renderer.js');
  runModule(context, 'js/pmjs-pixi5/pixi7-display.js');
  context.PMJS.methods.install();
  fixture.renderer = { plugins: { tilemap: { tileAnim: [0, 0] } } };
  fixture.render = stage => {
    context.pmjsPixi5RenderScene(stage, null, 1, { width: 64, height: 64 }, fixture.renderer);
    const packet = fixture.submissions.at(-1);
    return Array.from({ length: packet.count }, (_, i) => ({
      m: Array.from(packet.metadata.slice(i * 7, i * 7 + 7)),
      v: Array.from(packet.values.slice(i * 41, i * 41 + 41)),
    }));
  };
  fixture.texture = handle => ({ baseTexture: { resource: { source: { _nativeImage: { handle } } }, resolution: 1 },
    frame: { x: 0, y: 0, width: 4, height: 4 }, orig: { width: 4, height: 4 } });
  return fixture;
}

test('@pixi/tilemap tiles become native tile layers; shadows and animation carry over', () => {
  const f = harness(), c = f.context;
  const map = new c.ShaderTilemap();
  const layer = new c.PIXI.tilemap.Tilemap([f.texture(7).baseTexture]);
  layer.shadowColor = [0, 0, 0, 0.5];
  // u, v, x, y, width, height, rotate, animX, animY, texture, animCountX, animCountY, animDivisor, alpha
  layer.pointsBuf.push(48, 0, 0, 0, 48, 48, 0, 1, 0, 0, 1024, 1024, 1, 1);
  layer.pointsBuf.push(0, 0, 48, 0, 24, 24, 0, 0, 0, -1, 1024, 1024, 1, 1);
  map.addChild(layer);
  const rows = f.render(map);
  assert.equal(f.created.length, 1);
  const { points, handles } = f.created[0];
  assert.deepEqual(points.slice(0, 9), [48, 0, 0, 0, 48, 48, 1, 0, 0]);
  assert.deepEqual(points.slice(9), [0, 0, 48, 0, 24, 24, 0, 0, 1]);
  assert.equal(handles[0], 7);
  assert.notEqual(handles[1], 7, 'shadows draw from their own canvas');
  const tiles = rows.find(row => row.m[0] === 4);
  assert.deepEqual(tiles.v.slice(15, 17), [96, 48], 'ShaderTilemap sets the animation frame');
  assert.ok(tiles.m[5] & 8, 'tiles sample nearest');
  f.render(map);
  assert.equal(f.created.length, 1, 'unchanged tiles reuse the native layer');

  layer.pointsBuf[13] = 0.5;
  layer.modificationMarker = 0;
  assert.throws(() => f.render(map), /render\.tile-options/, 'per-tile alpha is a reported gap');
});

// As Pixi's own tilemap renderer: tiles are rebuilt after clear() (which zeroes the marker), or
// when the tileset or a bitmap changes, and not read again while unchanged.
test('@pixi/tilemap layers are rebuilt only when cleared, retiled or redrawn', () => {
  const f = harness(), c = f.context;
  const texture = f.texture(7);
  const layer = new c.PIXI.tilemap.Tilemap([texture.baseTexture]);
  layer.modificationMarker = 0;
  layer.pointsBuf.push(0, 0, 0, 0, 48, 48, 0, 0, 0, 0, 1024, 1024, 1, 1);
  f.render(layer);
  assert.equal(layer.modificationMarker, 14);
  layer.pointsBuf[2] = 8;
  f.render(layer);
  assert.equal(f.created.length, 1, 'unchanged marker: the buffer is not read');
  layer.modificationMarker = 0;
  f.render(layer);
  assert.equal(f.created.length, 2, 'cleared tiles are rebuilt');
  assert.equal(f.created[1].points[2], 8);
  texture.baseTexture.resource.source.__pmjsContentRevision = 1;
  f.render(layer);
  assert.equal(f.created.length, 3, 'a redrawn bitmap is uploaded again');
  layer.tileset = [f.texture(9).baseTexture];
  f.render(layer);
  assert.deepEqual(f.created[3].handles, [9], 'a new tileset is used');
});

test('MV sprites draw nothing until their bitmap is ready, and upload it when dirty', () => {
  const f = harness(), c = f.context;
  const sprite = new c.Sprite(f.texture(5));
  const calls = [];
  let ready = false;
  sprite._bitmap = { touch() { calls.push('touch'); }, isReady() { return ready; },
    checkDirty() { calls.push('dirty'); } };
  const child = new c.Sprite(f.texture(6));
  sprite.addChild(child);
  let rows = f.render(sprite);
  assert.ok(!rows.some(row => row.m[2] === 5));
  assert.ok(rows.some(row => row.m[2] === 6), 'children of an unready sprite still draw');
  ready = true;
  rows = f.render(sprite);
  assert.ok(rows.some(row => row.m[2] === 5));
  assert.deepEqual(calls, ['touch', 'touch', 'dirty']);
  const tone = new c.ToneSprite();
  assert.equal(f.render(tone)[0].m[0], 0, 'ToneSprite draws nothing on WebGL, as in Pixi');
});

test('a colour matrix fills both parameter blocks of the packet', () => {
  const f = harness(), c = f.context;
  const sprite = new c.Sprite(f.texture(5));
  const filter = new c.PIXI.ColorMatrixFilter();
  filter.matrix = Array.from({ length: 20 }, (_, i) => i + 1);
  filter.alpha = 0.5;
  sprite.filters = [filter];
  const begin = f.render(sprite).find(row => row.m[0] === 6);
  assert.equal(begin.m[4], 25);
  assert.deepEqual(begin.v.slice(7, 17), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(begin.v.slice(22, 33), [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 0.5]);
});

test('the native renderer takes Pixi 7 render options', () => {
  const f = harness(), c = f.context;
  const renderer = new c.PIXI.Renderer({ width: 8, height: 8 });
  const stage = new c.PIXI.Container();
  renderer.render(stage, { clear: false, skipUpdateTransform: true });
  assert.equal(f.submissions.length, 1);
  assert.ok(!f.targets.some(target => target[0] === 'render'), 'no renderTexture: drawn to the screen');
});

test('Pixi 7 text redraws at the renderer resolution and draws as a sprite', () => {
  const f = harness(), c = f.context;
  class DisposableText extends c.PIXI.Text {}
  const text = new DisposableText(f.texture(9));
  f.renderer.resolution = 2;
  const rows = f.render(text);
  assert.ok(rows.some(row => row.m[2] === 9), 'Karryn\'s Prison window text draws');
  assert.deepEqual(text.updates, [[true, 2, true]]);
});

test('a bound texture counts as uploaded for FastCutIns', () => {
  const f = harness(), c = f.context;
  c.Graphics = { _width: 8, _height: 8 };
  c.Utils = { isOptionValid: () => false };
  runModule(c, 'js/pmjs-pixi5/pixi7-renderer.js');
  c.Graphics._createRenderer();
  const renderer = c.Graphics._renderer;
  const baseTexture = { valid: true, _glTextures: {} };
  renderer.texture.bind(baseTexture);
  assert.ok(baseTexture._glTextures[renderer.CONTEXT_UID]);
});

test('a rectangle mask clips its container; a mask that cannot be an alpha mask clips to its bounds', () => {
  const f = harness(), c = f.context;
  const portrait = new c.PIXI.Container();
  portrait.addChild(new c.Sprite(f.texture(5)));
  let fast = true;
  portrait.mask = { isFastRect: () => fast, worldTransform: { a: 1, b: 0, c: 0, d: 1 },
    getBounds: () => ({ x: 10, y: 20, width: 30, height: 40 }) };
  const rows = f.render(portrait);
  const clip = rows.find(row => row.m[5] & 1);
  assert.deepEqual(clip.v.slice(17, 21), [10, 20, 40, 60], 'FastCutIns crops a portrait');
  assert.ok(rows.some(row => row.m[2] === 5));
  fast = false;
  const bounded = f.render(portrait);
  assert.deepEqual(bounded.find(row => row.m[5] & 1).v.slice(17, 21), [10, 20, 40, 60]);
  assert.ok(bounded.some(row => row.m[2] === 5), 'the masked portrait is still drawn');
});
