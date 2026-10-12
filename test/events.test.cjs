'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function fixture() {
  const context = vm.createContext({ console });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/pmjs-web/events.js'), 'utf8'), context);
  return context;
}

// A listener removed during dispatch is not called, as in browsers (DOM "removed" flag).
{
  const mode = 'synchronous';
  const dispatch = (context, target) => target.dispatchEvent({ type: 'load' });

  test(mode + ' dispatch skips a listener removed by an earlier listener', () => {
    const context = fixture(), target = new context.EventTarget(), trace = [];
    const later = () => trace.push('B');
    target.addEventListener('load', () => {
      trace.push('A'); target.removeEventListener('load', later);
    });
    target.addEventListener('load', later);
    dispatch(context, target);
    assert.deepEqual(trace, ['A']);
  });

  test(mode + ' dispatch does not revive a removed registration when re-added', () => {
    const context = fixture(), target = new context.EventTarget(), trace = [];
    let first = true;
    const later = () => trace.push('B');
    target.addEventListener('load', () => {
      trace.push('A');
      if (first) {
        first = false;
        target.removeEventListener('load', later);
        target.addEventListener('load', later);
      }
    });
    target.addEventListener('load', later);
    dispatch(context, target);
    assert.deepEqual(trace, ['A']);
    dispatch(context, target);
    assert.deepEqual(trace, ['A', 'A', 'B']);
  });

  test(mode + ' dispatch defers additions and suppresses duplicate registrations', () => {
    const context = fixture(), target = new context.EventTarget(), trace = [];
    const later = () => trace.push('B');
    target.addEventListener('load', () => {
      trace.push('A'); target.addEventListener('load', later); target.addEventListener('load', later);
    });
    dispatch(context, target);
    assert.deepEqual(trace, ['A']);
    dispatch(context, target);
    assert.deepEqual(trace, ['A', 'A', 'B']);
  });

  test(mode + ' dispatch permits self-removal without skipping the next listener', () => {
    const context = fixture(), target = new context.EventTarget(), trace = [];
    function first() { trace.push('A'); target.removeEventListener('load', first); }
    target.addEventListener('load', first);
    target.addEventListener('load', () => trace.push('B'));
    dispatch(context, target);
    dispatch(context, target);
    assert.deepEqual(trace, ['A', 'B', 'B']);
  });

  test(mode + ' dispatch skips a registered handler cleared before its turn', () => {
    const context = fixture(), target = new context.EventTarget(), trace = [];
    context.EventTarget.defineEventHandlerProperty(target, 'load');
    target.addEventListener('load', () => { trace.push('A'); target.onload = null; });
    target.onload = () => trace.push('handler');
    dispatch(context, target);
    assert.deepEqual(trace, ['A']);
    assert.equal(target.onload, null);
  });
}

test('nested dispatch sees a new registration without reviving the outer snapshot', () => {
  const context = fixture(), target = new context.EventTarget(), trace = [];
  const later = event => trace.push(event.depth + ':B');
  target.addEventListener('load', event => {
    trace.push(event.depth + ':A');
    if (event.depth === 'outer') {
      target.removeEventListener('load', later);
      target.addEventListener('load', later);
      target.dispatchEvent({ type: 'load', depth: 'inner' });
    }
  });
  target.addEventListener('load', later);
  target.dispatchEvent({ type: 'load', depth: 'outer' });
  assert.deepEqual(trace, ['outer:A', 'inner:A', 'inner:B']);
});
