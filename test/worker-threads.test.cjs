'use strict';

// Karryn's Prison's logger (pino) writes its log file from a worker thread fed through a shared
// buffer; PMJS appends the lines itself, and at once when the logger waits for them.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function load() {
  const files = {}, made = [], modules = {}, timers = [];
  const context = vm.createContext({
    Buffer, Int32Array, SharedArrayBuffer, Promise, __pmjsBuiltinRequire: require,
    setInterval: fn => { timers.push(fn); return timers.length; }, clearInterval() {},
    setTimeout: fn => { timers.push(fn); },
    pathModule: path.posix,
    fsModule: {
      appendFileSync(file, text) { files[file] = (files[file] || '') + text; },
      mkdirSync(directory, options) { made.push([directory, options.recursive]); },
    },
    registerCommonJsModule(names, exports) { names.forEach(name => { modules[name] = exports; }); },
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/pmjs-web/worker-threads.js'), 'utf8'), context);
  return { context, files, made, modules, timers };
}

test('pino file logs are appended by the timer and when the logger waits', () => {
  const { context, files, made, modules, timers } = load();
  const stateBuf = new SharedArrayBuffer(128), dataBuf = new SharedArrayBuffer(64);
  const messages = [];
  const { Worker } = modules['node:worker_threads'];
  assert.equal(modules.worker_threads.isMainThread, true);
  const worker = new Worker('/game/js/libs/thread-stream-worker.js', { workerData: {
    filename: 'file:///game/js/libs/pino-file.js', stateBuf, dataBuf,
    workerData: { destination: '/logs/debug.log', mkdir: true } } });
  worker.on('message', message => messages.push(message.code));
  timers.pop()();
  assert.deepEqual(made, [['/logs', true]]);
  assert.deepEqual(messages, ['READY']);

  const state = new Int32Array(stateBuf), data = Buffer.from(dataBuf);
  data.write('one\n', 0);
  Atomics.store(state, 4, 4);
  timers[0]();
  assert.equal(files['/logs/debug.log'], 'one\n');
  assert.equal(Atomics.load(state, 8), 4);

  data.write('two\n', 4);
  Atomics.store(state, 4, 8);
  // thread-stream's flushSync: wait while the read index is behind.
  assert.equal(vm.runInContext('Atomics', context).wait(state, 8, 4, 1000), 'ok');
  assert.equal(files['/logs/debug.log'], 'one\ntwo\n');

  Atomics.store(state, 4, -1);
  vm.runInContext('Atomics', context).wait(state, 8, 8, 1000);
  assert.equal(Atomics.load(state, 8), -1, 'end() sees the worker finish');
});

test('other worker scripts are refused', () => {
  const { modules } = load();
  assert.throws(() => new modules.worker_threads.Worker('/game/js/worker.js', {}), /pino file logs/);
});
