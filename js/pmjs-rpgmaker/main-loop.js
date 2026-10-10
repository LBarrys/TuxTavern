'use strict';

(function() {
  var reportedScene = null;
  var sceneSince = 0;
  var waitReported = false;
  var WAIT_REPORT_MS = 10000;

  function updateNativeServices() {
    if (globalThis.PMJS && PMJS.rpgmaker && PMJS.rpgmaker.audio &&
        typeof PMJS.rpgmaker.audio.update === 'function') {
      PMJS.rpgmaker.audio.update();
    }
    if (globalThis.PMJS && PMJS.web && PMJS.web.video) {
      PMJS.web.video.update();
    }
    if (globalThis.PMJS && PMJS.tasks) {
      PMJS.tasks.drain();
    }
  }

  function oneLine(fn) {
    var source = Function.prototype.toString.call(fn).replace(/\s+/g, ' ');
    return source.length > 300 ? source.slice(0, 300) + '...' : source;
  }

  // Bitmaps a scene waits for: MV keeps them in ImageManager._imageCache, MZ in _cache.
  function unreadyBitmaps() {
    var bitmaps = [];
    var cache = typeof ImageManager !== 'undefined' && ImageManager;
    var items = cache && cache._imageCache && cache._imageCache._items;
    var key;
    if (items) for (key in items) bitmaps.push(items[key] && items[key].bitmap);
    else if (cache && cache._cache) for (key in cache._cache) bitmaps.push(cache._cache[key]);
    return bitmaps.filter(function(bitmap) {
      return bitmap && typeof bitmap.isReady === 'function' && !bitmap.isReady() &&
        !(typeof bitmap.isRequestOnly === 'function' && bitmap.isRequestOnly());
    });
  }

  // "Now Loading" that never ends: say whether images or a plugin's isReady hold the scene.
  function reportSceneWait(scene) {
    var name = scene.constructor && scene.constructor.name || 'UnknownScene';
    var waiting = unreadyBitmaps();
    var head = '[pmjs] ' + name + ' has not started after ' + WAIT_REPORT_MS / 1000 + ' s; ';
    if (waiting.length) {
      console.log(head + 'waiting for ' + waiting.length + ' image(s):');
      waiting.slice(0, 10).forEach(function(bitmap) {
        console.log('[pmjs]   ' + (bitmap._url || '(no url)') + ' (' + bitmap._loadingState + ')');
      });
      return;
    }
    console.log(head + 'its images are ready, so a plugin holds isReady:');
    for (var proto = Object.getPrototypeOf(scene); proto && proto !== Object.prototype;
      proto = Object.getPrototypeOf(proto)) {
      if (Object.prototype.hasOwnProperty.call(proto, 'isReady') && typeof proto.isReady === 'function') {
        console.log('[pmjs]   ' + (proto.constructor && proto.constructor.name) + '.isReady: ' +
          oneLine(proto.isReady));
      }
    }
    if (typeof ImageManager !== 'undefined' && typeof ImageManager.isReady === 'function' &&
        !ImageManager.isReady()) {
      console.log('[pmjs]   ImageManager.isReady() is false: ' + oneLine(ImageManager.isReady));
    }
  }

  function runTick(now, beforeServices, beforeScheduler) {
    if (typeof beforeServices === 'function') beforeServices(now);
    updateNativeServices();
    if (typeof beforeScheduler === 'function') beforeScheduler(now);
    if (typeof globalThis.pmjsDrainScheduler === 'function') {
      globalThis.pmjsDrainScheduler(now);
    }
    if (typeof SceneManager !== 'undefined' && SceneManager._scene !== reportedScene) {
      reportedScene = SceneManager._scene;
      sceneSince = now;
      waitReported = false;
      console.log('[pmjs] scene', reportedScene && reportedScene.constructor &&
        reportedScene.constructor.name || 'UnknownScene');
    } else if (reportedScene && !waitReported && now - sceneSince >= WAIT_REPORT_MS &&
        typeof SceneManager.isCurrentSceneStarted === 'function' &&
        !SceneManager.isCurrentSceneStarted()) {
      waitReported = true;
      try { reportSceneWait(reportedScene); } catch (_) {}
    }
  }

  globalThis.pmjsRunRpgMakerTick = runTick;
})();
