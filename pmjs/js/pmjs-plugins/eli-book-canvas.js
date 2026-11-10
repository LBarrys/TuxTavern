'use strict';

// TuxTavern: EliMZ_Book 4.1.2's Bitmap._createBaseTexture reads `this.context` to set pixel-perfect
// drawing, and in MZ that getter copies a loaded image into a canvas of its size. So every image got
// a canvas copy at load, and Netorare God V0.11's 14175x3864 battlers threw "invalid canvas
// dimensions" (past PMJS's canvas limit). The settings only matter for a canvas that exists, and MZ
// calls _createBaseTexture again with the real context whenever it creates one. So Eli's check sees
// the context only once there is a canvas, and loading no longer copies images.
(function() {
  var KNOWN = ['this.context && Eli.Book.isPixelPerfect()', 'Alias.Bitmap_createBaseTexture.call(this, source)'];

  function install() {
    var proto = typeof Bitmap === 'function' && Bitmap.prototype;
    var eli = proto && proto._createBaseTexture;
    if (typeof eli !== 'function' || eli._pmjsEliCanvas) return;
    var text = Function.prototype.toString.call(eli);
    if (!KNOWN.every(function(part) { return text.indexOf(part) >= 0; })) return;
    proto._createBaseTexture = function() {
      if (this._context || Object.prototype.hasOwnProperty.call(this, 'context')) return eli.apply(this, arguments);
      Object.defineProperty(this, 'context', { configurable: true, value: null });
      try { return eli.apply(this, arguments); } finally { delete this.context; }
    };
    proto._createBaseTexture._pmjsEliCanvas = true;
  }

  PMJS.plugins.onLoaded('EliMZ_Book', 'pmjs.adapter.eli-book-canvas', install);
})();
