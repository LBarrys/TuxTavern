'use strict';

(function() {
  var libraries = [
    'js/libs/pako.min.js',
    'js/libs/localforage.min.js'
  ];
  var engineScripts = [
    'js/rmmz_core.js',
    'js/rmmz_managers.js',
    'js/rmmz_objects.js',
    'js/rmmz_scenes.js',
    'js/rmmz_sprites.js',
    'js/rmmz_windows.js'
  ];

  libraries.forEach(function(path) {
    NativeHost.runtime.loadScript(path);
  });
  engineScripts.forEach(function(path) {
    NativeHost.runtime.loadScript(path);
  });

  if (globalThis.PMJS_RUNTIME_GAME && PMJS_RUNTIME_GAME.engineVersion &&
      Utils.RPGMAKER_VERSION !== PMJS_RUNTIME_GAME.engineVersion) {
    throw new Error('inspected MZ ' + PMJS_RUNTIME_GAME.engineVersion +
      ' but loaded ' + Utils.RPGMAKER_VERSION);
  }

  if (typeof Graphics !== 'function' || typeof SceneManager === 'undefined' ||
      typeof PluginManager === 'undefined' || typeof Scene_Boot !== 'function') {
    throw new Error('RPG Maker MZ engine did not initialize');
  }

  // main.js declares Main and main, and plugins load after it, so some use them
  // (LoadingSpinnerCustomize: new Main()). PMJS boots MZ itself: these stand in,
  // drawing no HTML and never loading the engine or starting the game again.
  if (typeof Main === 'undefined') {
    var StandInMain = function Main() {
      this.xhrSucceeded = true;
      this.loadCount = 0;
      this.error = null;
    };
    ['run', 'showLoadingSpinner', 'eraseLoadingSpinner', 'testXhr', 'loadMainScripts',
      'onScriptLoad', 'onScriptError', 'onWindowLoad', 'onWindowError',
      'initEffekseerRuntime', 'onEffekseerLoad', 'onEffekseerError'].forEach(function(name) {
      StandInMain.prototype[name] = function() {};
    });
    StandInMain.prototype.printError = function(name, message) {
      console.error(name + ': ' + message);
    };
    StandInMain.prototype.makeErrorHtml = function() { return ''; };
    StandInMain.prototype.isPathRandomized = function() { return false; };
    globalThis.Main = StandInMain;
    globalThis.main = new StandInMain();
  }
  nativeBootPhase('rpg-core-loaded');
})();
