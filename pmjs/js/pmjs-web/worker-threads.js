'use strict';

// worker_threads for pino's file transport (Karryn's Prison's logger). thread-stream hands log
// lines to a worker thread through a shared buffer; here they are appended to the log file on this
// thread once a second, and at once when the logger waits for them (flushSync, end). Any other
// worker script is refused, so its logger falls back to the console as before.
(function() {
  var WRITE_INDEX = 4, READ_INDEX = 8;
  var EventEmitter = globalThis.__pmjsBuiltinRequire('events').EventEmitter;
  var drains = new Map();

  function Worker(filename, options) {
    EventEmitter.call(this);
    var data = options && options.workerData;
    var target = data && data.workerData;
    if (!/thread-stream/.test(String(filename)) || !data || !/pino[-/]file/.test(String(data.filename)) ||
        !target || typeof target.destination !== 'string') {
      throw new Error('worker_threads: only pino file logs are supported, not ' + filename);
    }
    var worker = this, destination = target.destination;
    var state = new Int32Array(data.stateBuf), bytes = Buffer.from(data.dataBuf);
    function fail(error) {
      stop();
      Atomics.store(state, WRITE_INDEX, -2);
      Atomics.store(state, READ_INDEX, -2);
      worker.emit('message', { code: 'ERROR', err: error });
    }
    function drain() {
      var read = Atomics.load(state, READ_INDEX), end = Atomics.load(state, WRITE_INDEX);
      try {
        if (end > read) fsModule.appendFileSync(destination, bytes.toString('utf8', read, end));
      } catch (error) { fail(error); return; }
      if (end === -1) stop();
      Atomics.store(state, READ_INDEX, end);
    }
    function stop() {
      clearInterval(timer);
      drains.delete(data.stateBuf);
    }
    var timer = setInterval(drain, 1000);
    drains.set(data.stateBuf, drain);
    this.threadId = 1;
    this._stop = stop;
    setTimeout(function() {
      try {
        if (target.mkdir) fsModule.mkdirSync(pathModule.dirname(destination), { recursive: true });
      } catch (error) { fail(error); return; }
      worker.emit('message', { code: 'READY' });
    }, 0);
  }
  Worker.prototype = Object.create(EventEmitter.prototype);
  Worker.prototype.constructor = Worker;
  Worker.prototype.postMessage = function() {};
  Worker.prototype.ref = Worker.prototype.unref = function() {};
  Worker.prototype.terminate = function() {
    this._stop();
    this.emit('exit', 0);
    return Promise.resolve(0);
  };

  // The logger blocks until the worker has read up to a mark; read it now instead.
  var wait = Atomics.wait;
  Atomics.wait = function(array, index, value) {
    var drain = array && drains.get(array.buffer);
    if (!drain) return wait.apply(Atomics, arguments);
    drain();
    return Atomics.load(array, index) === value ? 'timed-out' : 'ok';
  };

  registerCommonJsModule(['worker_threads', 'node:worker_threads'], {
    Worker: Worker, isMainThread: true, parentPort: null, workerData: null, threadId: 0
  });
})();
