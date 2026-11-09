'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function fixture(files) {
  const errors = [];
  const context = vm.createContext({ console, __pmjsBuiltinRequire: require, performance: { now: () => 0 }, PMJS: {},
    CanvasContext2D: function() {},
    nativeWindowState: { focused: true, visible: true },
    gamePath: path => path.replace(/^\/?(game\/)?/, '').replace(/^\.\//, ''), gameReadPath: path => path,
    pmjsGameConfig: {}, NativeHost: { fs: { exists: path => !!files && path in files }, runtime: {
      loadScript(path) {
        if (!files) throw new Error('unexpected external script');
        return vm.runInContext(files[path], context);
      },
      runScript(source) { return vm.runInContext(source, context); }
    } } });
  context.window = context;
  for (const name of ['scheduler', 'events', ...require('./helpers/web-element-sources.cjs').elementSources.map(file => path.basename(file, '.js')), 'script-loader']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/pmjs-web', name + '.js'), 'utf8'), context);
  }
  context.onerror = message => { errors.push(message); return true; };
  return { context, document: context.document, errors };
}

test('inline scripts run synchronously in global scope on connection and only once', () => {
  const { context: c, document: d } = fixture();
  const container = d.createElement('div');
  const script = d.createElement('script');
  script.textContent = 'var dynamicValue = 42; globalThis.executingScript = document.currentScript;';
  container.appendChild(script);
  assert.equal(c.dynamicValue, undefined);
  d.body.appendChild(container);
  assert.equal(c.dynamicValue, 42);
  assert.equal(c.executingScript, script);
  assert.equal(d.currentScript, null);
  script.text = 'dynamicValue += 1;';
  d.head.appendChild(script);
  assert.equal(c.dynamicValue, 42);
  assert.equal(container.children.length, 0);
  assert.equal(script.parentNode, d.head);
});

test('empty connected scripts can receive text; non-script data remains inert', () => {
  const { context: c, document: d } = fixture();
  const script = d.createElement('script');
  d.head.appendChild(script);
  script.appendChild(d.createTextNode('globalThis.lateScript = 7;'));
  assert.equal(c.lateScript, 7);
  const data = d.createElement('script');
  data.type = 'application/json';
  data.text = '{"value":1}';
  d.body.appendChild(data);
  assert.equal(data.textContent, '{"value":1}');
});

test('nested currentScript is restored and script errors reach the global error handler', () => {
  const { context: c, document: d, errors } = fixture();
  const outer = d.createElement('script');
  outer.text = `var outerScript = document.currentScript;
    var innerScript = document.createElement('script');
    innerScript.text = 'globalThis.innerCurrent = document.currentScript; throw new Error("script failure");';
    document.body.appendChild(innerScript);
    globalThis.restoredCurrent = document.currentScript;`;
  d.body.appendChild(outer);
  assert.equal(c.innerCurrent, c.innerScript);
  assert.equal(c.restoredCurrent, outer);
  assert.equal(d.currentScript, null);
  assert.deepEqual(errors, ['script failure']);
  d.head.appendChild(c.innerScript);
  assert.equal(errors.length, 1);
});

test('script data and external script elements do not execute as inline source', () => {
  const { context: c, document: d, errors } = fixture();
  for (const properties of [{ src: 'external.js' }, { type: 'module' }]) {
    const script = d.createElement('script');
    Object.assign(script, properties);
    script.text = 'globalThis.inertSource = true;';
    d.body.appendChild(script);
  }
  assert.equal(c.inertSource, undefined);
  assert.deepEqual(errors, []);
});

// Karryn's Prison's mod manager appends <script src> for each mod and waits for onload.
test('external scripts load after the current task, in order, then fire load or error', async () => {
  const { context: c, document: d, errors } = fixture({
    'mods/Body Hair/Body Hair.js': 'globalThis.order.push("hair:" + (document.currentScript === hair));',
    'mods/broken.js': 'globalThis.order.push("broken"); throw new Error("mod failure");',
  });
  c.order = [];
  const events = [];
  const add = src => {
    const script = d.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = () => events.push('load ' + src);
    script.onerror = () => events.push('error ' + src);
    d.body.appendChild(script);
    return script;
  };
  c.hair = add('./mods/Body Hair/Body Hair.js');
  add('mods/missing.js');
  add('mods/broken.js');
  assert.deepEqual(c.order, [], 'nothing runs while the appending code runs');
  await c.PMJS.tasks.idle();
  assert.deepEqual(c.order, ['hair:true', 'broken']);
  assert.deepEqual(events, ['load ./mods/Body Hair/Body Hair.js', 'error mods/missing.js', 'load mods/broken.js']);
  assert.deepEqual(errors, ['mod failure']);
  assert.equal(d.currentScript, null);
});
