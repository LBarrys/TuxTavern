'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function document() {
  const context = vm.createContext({ console, performance: { now: () => 0 }, PMJS: {},
    CanvasContext2D: function() {}, nativeWindowState: { focused: true, visible: true },
    pmjsGameConfig: {}, NativeHost: { runtime: { loadScript() {}, runScript() {} } } });
  context.window = context;
  for (const name of ['scheduler', 'events', ...require('./helpers/web-element-sources.cjs').elementSources.map(file => path.basename(file, '.js'))]) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/pmjs-web', name + '.js'), 'utf8'), context);
  }
  return context.document;
}

test('element styles take setProperty, as DRGN_TranslationUI uses for CSS variables', () => {
  for (const element of [document().createElement('div'), document().createElement('canvas')]) {
    element.style.setProperty('--d', 3);
    element.style.setProperty('background-color', 'red');
    assert.equal(element.style.getPropertyValue('--d'), '3');
    assert.equal(element.style.backgroundColor, 'red', 'hyphenated names reach their camelCase property');
    element.style.opacity = 0.5;
    assert.equal(element.style.getPropertyValue('opacity'), '0.5');
    assert.equal(element.style.removeProperty('--d'), '3');
    assert.equal(element.style.getPropertyValue('--d'), '');
    assert.deepEqual(Object.keys(element.style), ['backgroundColor', 'opacity'], 'methods are not style properties');
  }
});
