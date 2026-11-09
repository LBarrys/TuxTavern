'use strict';
// Karryn's Prison runs YEP_CoreEngine on Pixi 7, where the Pixi 4 render preflight is not loaded.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const adapter = fs.readFileSync(require.resolve('../js/pmjs-plugins/yanfly-core-transforms.js'), 'utf8');

test('YEP_CoreEngine transform adapter is a no-op without the Pixi 4 render preflight', () => {
  const phases = [];
  const context = vm.createContext({ PMJS: { phases: { on(_phase, _owner, callback) { phases.push(callback); } } } });
  context.globalThis = context;
  vm.runInContext(`
    function Sprite() {}
    var Yanfly = { Core: { Sprite_updateTransform: function() {} } };
    Sprite.prototype.updateTransform = function() {
      Yanfly.Core.Sprite_updateTransform.call(this);
      this.worldTransform.tx = Math.floor(this.worldTransform.tx);
      this.worldTransform.ty = Math.floor(this.worldTransform.ty);
    };
    globalThis.Sprite = Sprite; globalThis.Yanfly = Yanfly;`, context);
  vm.runInContext(adapter, context);
  assert.equal(phases.length, 1);
  assert.doesNotThrow(() => phases[0]());
});
