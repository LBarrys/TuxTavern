'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function setup() {
  let install;
  let consumed = 0;
  const listeners = {};
  const context = {
    NativeHost: {
      input: { consumePressed() { consumed++; } },
      runtime: { env: () => '', now: () => 0,
        platform: () => ({ platform: 'linux', arch: 'x64' }),
        displaySize: () => ({ width: 640, height: 480 }),
        windowSize: () => ({ width: 640, height: 480 }) }
    },
    PMJS: { phases: { on(_name, _owner, callback) { install = callback; } } },
    addEventListener(type, callback) { (listeners[type] ||= []).push(callback); },
    dispatchEvent(event) { for (const callback of listeners[event.type] || []) callback(event); },
    document: { addEventListener(type, callback) { (listeners[type] ||= []).push(callback); },
      dispatchEvent(event) { for (const callback of listeners[event.type] || []) callback(event); },
      hasFocus() { return context.nativeWindowState.focused; } }
  };
  context.globalThis = context;
  context.Input = {
    keyMapper: { 65: 'tag', 67: 'ok', 90: 'ok', 37: 'left' },
    gamepadMapper: { 3: 'tag', 12: 'up', 14: 'left' },
    clear() { this._currentState = {}; this._previousState = {}; this._gamepadStates = []; this._latestButton = null; this._pressedTime = 0; },
    _onKeyDown(event) { const action = this.keyMapper[event.keyCode]; if (action) this._currentState[action] = true; },
    _onKeyUp(event) { const action = this.keyMapper[event.keyCode]; if (action) this._currentState[action] = false; },
    _updateGamepadState(pad) {
      const previous = this._gamepadStates[pad.index] || [];
      const next = pad.buttons.map(button => button.pressed);
      next[12] ||= pad.axes[1] < -0.5;
      next[13] ||= pad.axes[1] > 0.5;
      next[14] ||= pad.axes[0] < -0.5;
      next[15] ||= pad.axes[0] > 0.5;
      for (let i = 0; i < next.length; i++) {
        if (next[i] !== previous[i] && this.gamepadMapper[i]) this._currentState[this.gamepadMapper[i]] = next[i];
      }
      this._gamepadStates[pad.index] = next;
    },
    update() {
      for (const pad of context.navigator.getGamepads()) if (pad?.connected) this._updateGamepadState(pad);
      if (this._currentState[this._latestButton]) this._pressedTime++;
      else this._latestButton = null;
      for (const action in this._currentState) {
        if (this._currentState[action] && !this._previousState[action]) {
          this._latestButton = action; this._pressedTime = 0;
        }
        this._previousState[action] = this._currentState[action];
      }
    },
    isPressed(action) { return !!this._currentState[action]; },
    isTriggered(action) { return this._latestButton === action && this._pressedTime === 0; }
  };
  context.Input.clear();
  context.document.addEventListener('keydown', event => context.Input._onKeyDown(event));
  context.document.addEventListener('keyup', event => context.Input._onKeyUp(event));
  context.addEventListener('blur', () => context.Input.clear());
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/pmjs-web/runtime.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/pmjs-rpgmaker/input.js'), 'utf8'), context);
  install();
  return { context, consumed: () => consumed };
}

test('native mouse events are MouseEvent instances, as PixiJS 4 expects', () => {
  const { context } = setup();
  const seen = [];
  context.document.addEventListener('mousemove', event => seen.push(event));
  context.document.addEventListener('mousedown', event => seen.push(event));
  context.__pmjsReceiveInput({ gamepads: [], keyEvents: [], keysDown: [], keysPressed: [], pointerEvents: [
    { type: 'mousemove', x: 10, y: 20 }, { type: 'mousedown', button: 0, x: 10, y: 20 }] });
  assert.equal(seen.length, 2);
  assert.equal(typeof context.MouseEvent, 'function');
  for (const event of seen) assert.ok(vm.runInContext('(e) => e instanceof MouseEvent', context)(event));
  assert.deepEqual([seen[0].type, seen[0].clientX, seen[0].clientY], ['mousemove', 10, 20]);
});

test('plugins can construct their own MouseEvent', () => {
  const { context } = setup();
  const event = vm.runInContext("new MouseEvent('click', { clientX: 3 })", context);
  assert.deepEqual([event.type, event.clientX], ['click', 3]);
  event.preventDefault();
  assert.equal(event.defaultPrevented, true);
});
