'use strict';

(function() {
  // NW.js runs main.js first, and plugins then wrap the window.onload it set (DKTools sets itself up
  // there: Karryn's Prison). PMJS runs the plugins first, so they wrap this forwarder; main.js
  // sees no handler, as in NW.js, and the one it sets runs at the end of the plugins' wrappers.
  var mainOnload = typeof window.onload === 'function' ? window.onload : null;
  window.onload = function() {
    return mainOnload ? mainOnload.apply(this, arguments) : undefined;
  };

  function pmjsMvLoadEntrypoint() {
    var pluginOnload = window.onload;
    window.onload = null;
    NativeHost.runtime.loadScript('js/main.js');
    if (typeof window.onload !== 'function') {
      throw new Error('main.js did not install boot hook (window.onload)');
    }
    mainOnload = window.onload;
    window.onload = pluginOnload;
    if (typeof nativeBootPhase === 'function') {
      nativeBootPhase('main-loaded');
    }
  }

  function dispatchWindowLoad() {
    globalThis.pmjsPrepareRpgMakerBoot();
    if (typeof window.dispatchEvent === 'function') {
      window.dispatchEvent({ type: 'load', target: window });
    }
    if (typeof window.onload === 'function') {
      window.onload();
    }
  }

  function pmjsMvStart() {
    dispatchWindowLoad();
    globalThis.pmjsRpgMakerBootStarted();
  }

  globalThis.pmjsMvLoadEntrypoint = pmjsMvLoadEntrypoint;
  globalThis.pmjsMvStart = pmjsMvStart;
})();
