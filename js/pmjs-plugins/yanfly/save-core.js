'use strict';

PMJS.plugins.onLoaded('YEP_SaveCore', 'pmjs.adapter.save-core', function() {
  var pending = new WeakMap();
  function cancelPreviews(window) {
    var requests = window && pending.get(window);
    if (!requests) return;
    requests.forEach(function(request) { clearTimeout(request.timer); });
    requests.clear();
    pending.delete(window);
  }
  function previewBitmap(name, args) {
    if (name === 'drawCharacter') return ImageManager.loadCharacter(args[0]);
    if (name === 'drawFace') return ImageManager.loadFace(args[0]);
    return ImageManager.loadSvActor(args[0].battlerName());
  }

  ['updateIndex', 'refresh'].forEach(function(name) {
    var original = Window_SaveInfo.prototype[name];
    if (typeof original !== 'function') return;
    Window_SaveInfo.prototype[name] = function() {
      cancelPreviews(this);
      return original.apply(this, arguments);
    };
  });

  ['drawCharacter', 'drawFace', 'drawSvActor'].forEach(function(name) {
    var original = Window_SaveInfo.prototype[name];
    if (typeof original !== 'function') return;
    Window_SaveInfo.prototype[name] = function() {
      var window = this, args = arguments;
      var bitmap = previewBitmap(name, args);
      if (bitmap.width > 0) return original.apply(window, args);
      var scene = SceneManager._scene, parent = window.parent, contents = window.contents;
      if (!scene || !parent || !contents || bitmap.isError && bitmap.isError()) return;
      var slot = window.savefileId(), requests = pending.get(window);
      if (!requests) { requests = new Set(); pending.set(window, requests); }
      var request = { timer: null, attempts: 0 };
      requests.add(request);
      function retry() {
        if (!requests.has(request)) return;
        requests.delete(request);
        if (SceneManager._scene !== scene || SceneManager.isSceneChanging() ||
            window.parent !== parent || window.contents !== contents ||
            window.savefileId() !== slot) return;
        // Completion can evict the old image before this callback runs.
        bitmap = previewBitmap(name, args);
        if (bitmap.isError && bitmap.isError()) return;
        if (bitmap.width > 0) return original.apply(window, args);
        // Each party image owns its budget; another image cannot reset it.
        if (++request.attempts >= 60) {
          console.warn('[pmjs] save preview image retry limit reached');
          return;
        }
        requests.add(request);
        request.timer = setTimeout(retry, 50);
      }
      request.timer = setTimeout(retry, 50);
    };
  });

  Window_SaveInfo.prototype.drawContents = function(y) {
    // As Yanfly's waits for contents a game loads later (Karryn's Prison's save previews), but
    // for 3 seconds, not forever, and only while the same slot is shown.
    if (!this._saveContents) {
      var window = this, slot = this.savefileId(), contents = this.contents, scene = SceneManager._scene;
      var request = { timer: null, attempts: 0 }, requests = pending.get(window);
      if (!requests) { requests = new Set(); pending.set(window, requests); }
      var retry = function() {
        requests.delete(request);
        if (SceneManager._scene !== scene || window.contents !== contents || window.savefileId() !== slot) return;
        if (window._saveContents) return window.drawContents(y);
        if (++request.attempts >= 60) {
          console.warn('[pmjs] save ' + slot + ' preview has no contents');
          return window.drawInvalidText(y);
        }
        requests.add(request);
        request.timer = setTimeout(retry, 50);
      };
      requests.add(request);
      request.timer = setTimeout(retry, 50);
      return;
    }
    if (typeof this._saveContents === 'string') {
      this._saveContents = JsonEx.parse(this._saveContents);
    }
    y = this.drawPartyGraphics(y);
    y = this.drawPartyNames(y);
    y = this.drawPartyLevels(y);
    return this.drawColumnData(y);
  };

  var proto = Scene_File.prototype;
  proto.onConfirmOk = function() {
    this._confirmWindow.deactivate();
    this._confirmWindow.close();
    clearTimeout(this._pmjsSaveActionTimer);
    var symbol = this._actionWindow.currentSymbol();
    var method = { load: 'performActionLoad', save: 'performActionSave',
      delete: 'performActionDelete' }[symbol];
    if (!method) return this.onConfirmCancel();
    var scene = this, id = this.savefileId(), action = this[method];
    var request = this._pmjsSaveActionRequest = {};
    this._pmjsSaveActionTimer = setTimeout(function() {
      if (scene._pmjsSaveActionRequest !== request || SceneManager._scene !== scene ||
          SceneManager.isSceneChanging()) return;
      scene._pmjsSaveActionTimer = null;
      scene._pmjsSaveActionRequest = null;
      // A changed selection cancels confirmation instead of acting on another slot.
      if (scene.savefileId() !== id || scene._actionWindow.currentSymbol() !== symbol) {
        return scene.onActionCancel();
      }
      return action.call(scene);
    }, 200);
  };
  ['onConfirmCancel', 'onActionCancel', 'terminate'].forEach(function(name) {
    var original = proto[name];
    proto[name] = function() {
      if (name === 'terminate') cancelPreviews(this._infoWindow);
      clearTimeout(this._pmjsSaveActionTimer);
      this._pmjsSaveActionTimer = null;
      this._pmjsSaveActionRequest = null;
      return original.apply(this, arguments);
    };
  });
});
