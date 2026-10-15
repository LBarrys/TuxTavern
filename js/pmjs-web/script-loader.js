'use strict';

(function() {
  var currentScriptStack = [];

  function currentExecutingScript() {
    return currentScriptStack.length > 0
      ? currentScriptStack[currentScriptStack.length - 1]
      : null;
  }

  if (globalThis.document) {
    Object.defineProperty(globalThis.document, 'currentScript', {
      configurable: true,
      enumerable: true,
      get: currentExecutingScript
    });
  }

  function resolveScriptVirtualSrc(path) {
    var normalized = typeof normalizePath === 'function' ? normalizePath(path) : String(path).replace(/\\/g, '/');
    if (normalized.charAt(0) === '/') normalized = normalized.slice(1);
    if (normalized.indexOf('game/') === 0) normalized = normalized.slice(5);
    return 'file:///game/' + normalized;
  }

  if (typeof NativeHost !== 'undefined' && NativeHost.runtime &&
      typeof NativeHost.runtime.loadScript === 'function') {
    var rawLoadScript = NativeHost.runtime.loadScript;
    globalThis.pmjsExecuteScriptElement = function(script) {
      currentScriptStack.push(script);
      try {
        NativeHost.runtime.runScript(script.textContent);
      } finally {
        currentScriptStack.pop();
      }
    };
    // A connected <script src> loads after the current task, in append order, as with async=false
    // (Karryn's Prison's mod manager waits on onload). A missing file fires error; a script that
    // throws is reported and still fires load, as in a browser.
    globalThis.pmjsLoadScriptElement = function(script) {
      PMJS.tasks.enqueue(function() {
        var source = String(script.src).replace(/^file:\/\//, '');
        try { source = decodeURI(source); } catch (_) { /* keep it as written */ }
        var path = gamePath(source.split(/[?#]/)[0]);
        if (!NativeHost.fs.exists(gameReadPath(path))) {
          script.dispatchEvent({ type: 'error', target: script });
          return;
        }
        currentScriptStack.push(script);
        try { rawLoadScript.call(NativeHost.runtime, path); }
        catch (error) { pmjsReportEventError(error); }
        finally { currentScriptStack.pop(); }
        script.dispatchEvent({ type: 'load', target: script });
      });
    };
    NativeHost.runtime.loadScript = function(path) {
      var script = {
        src: resolveScriptVirtualSrc(path)
      };
      currentScriptStack.push(script);
      try {
        return rawLoadScript.call(NativeHost.runtime, path);
      } finally {
        currentScriptStack.pop();
      }
    };
  }
})();
