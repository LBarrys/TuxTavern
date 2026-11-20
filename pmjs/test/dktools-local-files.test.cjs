'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');
const { loadPmjsRuntime } = require('./helpers/runtime-context.cjs');
const file = require.resolve('../js/pmjs-plugins/dktools-local-files.js');

// DKTools 9's own shape: IO's local mode is NW.js, which PMJS reports as false.
const dktools = `window.DKTools = { Utils: { isNwjs: function() { return Utils.isNwjs(); } } };
DKTools.IO = class {
  static initialize() {
    if (this.isLocalMode()) { this._fs = require('fs'); this._path = require('path'); }
    this._projectPath = '';
  }
  static isLocalMode() { return DKTools.Utils.isNwjs(); }
};`;

test('DKTools reads the game folder, as Karryn\'s Prison\'s Smoother CG Loading needs', () => {
  const ctx = loadPmjsRuntime({ __pmjsBuiltinRequire: require, Utils: { isNwjs() { return false; } } });
  ctx.window = ctx;
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  ctx.PMJS.plugins.execute('DKTools', () => vm.runInContext(dktools, ctx));
  assert.equal(vm.runInContext('DKTools.IO.isLocalMode()', ctx), true);
  // Its window and console code still see a browser.
  assert.equal(vm.runInContext('DKTools.Utils.isNwjs()', ctx), false);
});

test('another plugin named like DKTools\'s globals is left alone', () => {
  const ctx = loadPmjsRuntime({ __pmjsBuiltinRequire: require, Utils: { isNwjs() { return false; } } });
  ctx.window = ctx;
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  ctx.PMJS.plugins.execute('DKTools_Other', () => vm.runInContext(dktools, ctx));
  assert.equal(vm.runInContext('DKTools.IO.isLocalMode()', ctx), false);
});
