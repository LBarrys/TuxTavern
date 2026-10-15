'use strict';

// MV's Graphics on the native renderer. Karryn's Prison's own _createRenderer swallows errors
// and its render skips frames by time, so both are replaced, as pmjs-mv does on Pixi 4.
Graphics._createRenderer = function() {
  var renderer = this._renderer = new PIXI.Renderer({ view: this._canvas, width: this._width,
    height: this._height, resolution: 1 });
  // Pixi 7's Renderer prototype has getters for these; own values shadow them.
  Object.defineProperties(renderer, {
    textureGC: { value: { maxIdle: 1, run: function() {} } },
    plugins: { value: { tilemap: { tileAnim: [0, 0] } } }
  });
  // PNG whatever the format asked for: the save thumbnails only need an image.
  renderer.extract.base64 = function(target, format, quality, frame) {
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
