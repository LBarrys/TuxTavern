'use strict';

(function() {
  var registry = Object.create(null);
  var fired = Object.create(null);
  var failures = Object.create(null);

  function on(name, owner, callback) {
    if (typeof owner === 'function') {
      callback = owner;
      owner = 'anonymous';
    }
    if (typeof callback !== 'function') return;
    // A phase that threw 0, false, null or '' stays failed with that value (upstream 1b1671b).
    if (Object.hasOwn(failures, name)) throw failures[name];
    if (fired[name]) {
      try { callback(); } catch (error) {
        console.error('[pmjs] error running late phase ' + name +
          ' (owner ' + owner + '):', error);
        failures[name] = error;
        throw error;
      }
      return;
    }
    (registry[name] || (registry[name] = [])).push({
      owner: owner, callback: callback
    });
  }

  function emit(name) {
    // A phase that threw 0, false, null or '' stays failed with that value (upstream 1b1671b).
    if (Object.hasOwn(failures, name)) throw failures[name];
    if (fired[name]) return false;
    fired[name] = true;
    var entries = registry[name] || [];
    delete registry[name];
    entries.forEach(function(entry) {
      try { entry.callback(); } catch (error) {
        console.error('[pmjs] error running phase ' + name +
          ' (owner ' + entry.owner + '):', error);
        failures[name] = error;
        throw error;
      }
    });
    return true;
  }

  globalThis.PMJS = globalThis.PMJS || {};
  PMJS.phases = { on: on, emit: emit };
})();
