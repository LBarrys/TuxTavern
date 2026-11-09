'use strict';

// MV's Graphics on the native renderer. Karryn's Prison's own _createRenderer swallows errors
// and its render skips frames by time, so both are replaced, as pmjs-mv does on Pixi 4.
Graphics._createRenderer = function() {
  var renderer = this._renderer = new PIXI.Renderer({ view: this._canvas, width: this._width,
    height: this._height, resolution: 1 });
  // Pixi 7's Renderer prototype has getters for these; own values shadow them.
  Object.defineProperties(renderer, {
    textureGC: { value: { maxIdle: 1, run: function() {} } },
    plugins: { value: { tilemap: { tileAnim: [0, 0] } } },
    // Karryn's Prison's FastCutIns binds a sprite sheet until it sees a GL texture for this
    // context; the native renderer uploads it when drawn.
    CONTEXT_UID: { value: 0 },
    texture: { value: { bind: function(baseTexture) {
      if (baseTexture && baseTexture._glTextures) baseTexture._glTextures[0] = true;
    } } }
  });
  // Pixi 7's event system: sprites that react to the mouse (eventMode, on('pointerdown')) in
  // plugins and mods. PMJS delivers mouse input to the document, not the canvas, so presses and
  // the wheel are passed on; moves and releases already reach the document and window. A release
  // is over the canvas, not "outside" it, as the game fills the window.
  if (PIXI.EventSystem) {
    if (Graphics._pmjsEvents) {
      document.removeEventListener('mousedown', Graphics._pmjsEvents.onPointerDown, true);
      document.removeEventListener('wheel', Graphics._pmjsEvents.onWheel, true);
      Graphics._pmjsEvents.destroy();
    }
    var events = Graphics._pmjsEvents = new PIXI.EventSystem(renderer);
    Object.defineProperty(renderer, 'events', { value: events });
    var onPointerUp = events.onPointerUp;
    events.onPointerUp = function(event) {
      onPointerUp(Object.create(event, { target: { value: events.domElement }, composedPath: { value: undefined } }));
    };
    events.init({});
    document.addEventListener('mousedown', events.onPointerDown, true);
    document.addEventListener('wheel', events.onWheel, true);
  }
  // PNG whatever the format asked for: the save thumbnails only need an image. Pixi 7's
  // base64 and image return Promises; canvas and pixels do not.
  function base64(target, format, quality, frame) {
    var canvas = new CanvasElement();
    canvas.width = Graphics.width;
    canvas.height = Graphics.height;
    PMJS.pixi7.renderStageToCanvas(target, canvas, false, renderer);
    if (frame) {
      var crop = new CanvasElement();
      crop.width = frame.width;
      crop.height = frame.height;
      crop.getContext('2d').drawImage(canvas, frame.x, frame.y, frame.width, frame.height,
        0, 0, frame.width, frame.height);
      canvas = crop;
    }
    return canvas.toDataURL();
  }
  renderer.extract.base64 = function(target, format, quality, frame) {
    try { return Promise.resolve(base64(target, format, quality, frame)); }
    catch (error) { return Promise.reject(error); }
  };
  renderer.extract.image = function(target, format, quality, frame) {
    return renderer.extract.base64(target, format, quality, frame).then(function(url) {
      return new Promise(function(resolve, reject) {
        var image = new Image();
        image.onload = function() { resolve(image); };
        image.onerror = reject;
        image.src = url;
      });
    });
  };
  renderer.extract.pixels = function(target, frame) {
    var canvas = renderer.extract.canvas(target);
    frame = frame || { x: 0, y: 0, width: canvas.width, height: canvas.height };
    return new Uint8Array(canvas.getContext('2d').getImageData(frame.x, frame.y, frame.width, frame.height).data.buffer);
  };
};

Graphics.render = function(stage) {
  if (stage) this._renderer.render(stage);
  this._skipCount = 0;
  this._rendered = true;
  this.frameCount++;
};

var pmjsPixi7IsOptionValid = Utils.isOptionValid;
Utils.isOptionValid = function(name) {
  return (!globalThis.AudioContext && name === 'noaudio') || pmjsPixi7IsOptionValid.call(this, name);
};
