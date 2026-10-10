'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../js/pmjs-rpgmaker/main-loop.js'), 'utf8');

function setup(bitmaps, isReady) {
  const lines = [];
  const context = vm.createContext({ console: { log: (...args) => lines.push(args.join(' ')) } });
  context.globalThis = context;
  vm.runInContext(`
    function Scene_Base() {}
    Scene_Base.prototype.isReady = function() { return ImageManager.isReady(); };
    function Scene_Title() {}
    Scene_Title.prototype = Object.create(Scene_Base.prototype);
    Scene_Title.prototype.constructor = Scene_Title;
    var SceneManager = { _scene: new Scene_Title(), _sceneStarted: false,
      isCurrentSceneStarted() { return this._scene && this._sceneStarted; } };
    var ImageManager = { _imageCache: { _items: {} },
      isReady() { return Object.values(this._imageCache._items).every(i => i.bitmap.isReady()); } };
  `, context);
  for (const [url, state] of bitmaps) {
    context.ImageManager._imageCache._items[url] = { bitmap: { _url: url, _loadingState: state,
      isReady: () => state === 'loaded', isRequestOnly: () => state === 'pending' } };
  }
  if (isReady) vm.runInContext(`Scene_Title.prototype.isReady = ${isReady};`, context);
  vm.runInContext(source, context);
  return { context, lines };
}

test('a scene still loading after 10 s names the images it waits for', () => {
  const { context, lines } = setup([['img/titles1/a.png', 'loaded'], ['img/titles1/b.png', 'requesting'],
    ['img/system/c.png', 'pending']]);
  context.pmjsRunRpgMakerTick(1000);
  context.pmjsRunRpgMakerTick(10999);
  assert.deepEqual(lines, ['[pmjs] scene Scene_Title']);
  context.pmjsRunRpgMakerTick(11000);
  context.pmjsRunRpgMakerTick(30000);
  assert.deepEqual(lines.slice(1), ['[pmjs] Scene_Title has not started after 10 s; waiting for 1 image(s):',
    '[pmjs]   img/titles1/b.png (requesting)']);
});

test('with its images ready, the plugin isReady holding the scene is shown', () => {
  const { context, lines } = setup([['img/titles1/a.png', 'loaded']],
    'function() { return Scene_Base.prototype.isReady.call(this) && window.pluginDone; }');
  context.pmjsRunRpgMakerTick(0);
  context.pmjsRunRpgMakerTick(10000);
  assert.equal(lines[1], '[pmjs] Scene_Title has not started after 10 s; its images are ready, so a plugin holds isReady:');
  assert.match(lines[2], /^\[pmjs\] {3}Scene_Title\.isReady: function\(\) \{ return .*window\.pluginDone; \}$/);
  assert.match(lines[3], /^\[pmjs\] {3}Scene_Base\.isReady: /);
});

test('a scene that starts is not reported', () => {
  const { context, lines } = setup([['img/titles1/b.png', 'requesting']]);
  context.pmjsRunRpgMakerTick(0);
  context.SceneManager._sceneStarted = true;
  context.pmjsRunRpgMakerTick(20000);
  assert.deepEqual(lines, ['[pmjs] scene Scene_Title']);
});
