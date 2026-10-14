'use strict';

(function() {
  var canvas = null, video = null, overlay = null;
  var hitRegion = null;
  var viewportKey = '';
  // The window can show the canvas larger or smaller than its CSS size (a tiled or fullscreen
  // window, or MV at a plugin's resolution): page pixels are window pixels times these.
  var scaleX = 1, scaleY = 1;

  function opacity(element, fallback) {
    var value = element && element.style && element.style.opacity;
    return value === undefined || value === '' ? fallback : Number(value);
  }

  function sync() {
    if (!canvas || !NativeHost.render) return;
    var windowSize = NativeHost.runtime.windowSize();
    var geometry = NativeHost.render.presentation();
    var ratioX = geometry.drawableWidth / windowSize.width;
    var ratioY = geometry.drawableHeight / windowSize.height;
    var cssWidth = parseFloat(canvas.style.width), cssHeight = parseFloat(canvas.style.height);
    var width = Number.isFinite(cssWidth) && cssWidth > 0 ? Math.max(1, Math.round(cssWidth * ratioX)) : 0;
    var height = Number.isFinite(cssHeight) && cssHeight > 0 ? Math.max(1, Math.round(cssHeight * ratioY)) : 0;
    var filter = canvas.style.imageRendering === 'pixelated' ? 1 : 2;
    var key = [width, height, filter].join(':');
    if (key !== viewportKey) {
      NativeHost.render.setPresentationViewport(width, height, filter);
      viewportKey = key;
      geometry = NativeHost.render.presentation();
    }
    var shownWidth = geometry.viewportWidth / ratioX, shownHeight = geometry.viewportHeight / ratioY;
    scaleX = width && shownWidth ? width / ratioX / shownWidth : 1;
    scaleY = height && shownHeight ? height / ratioY / shownHeight : 1;
    canvas._pmjsPresentationRect = { left: geometry.viewportX / ratioX,
      top: geometry.viewportY / ratioY, width: shownWidth * scaleX, height: shownHeight * scaleY };
    var videoSource = video && video._pmjsNativePresentationSource();
    NativeHost.render.setPresentationLayers(opacity(canvas, 1),
      videoSource ? videoSource.handle : 0, video ? opacity(video, 0) : 0,
      overlay ? overlay._ensureNativeCanvas().handle : 0, overlay ? opacity(overlay, 1) : 0);
  }

  function toPage(x, y) {
    var rect = canvas && canvas._pmjsPresentationRect;
    if (!rect) return { x: x, y: y };
    return { x: rect.left + (x - rect.left) * scaleX, y: rect.top + (y - rect.top) * scaleY };
  }

  function pointerTarget(x, y) {
    if (hitRegion) {
      var rect = hitRegion.canvas.getBoundingClientRect();
      var px = (x - rect.left) * hitRegion.canvas.width / rect.width;
      var py = (y - rect.top) * hitRegion.canvas.height / rect.height;
      var bounds = hitRegion.bounds;
      if (px >= bounds.x && py >= bounds.y &&
          px < bounds.x + bounds.width && py < bounds.y + bounds.height) return hitRegion.element;
    }
    return canvas || document;
  }

  PMJS.web.presentation = {
    setLayers: function(mainCanvas, videoElement, overlayCanvas) {
      canvas = mainCanvas;
      video = videoElement;
      overlay = overlayCanvas;
    },
    setHitRegion: function(element, referenceCanvas, bounds) {
      hitRegion = element && bounds ? { element: element, canvas: referenceCanvas, bounds: bounds } : null;
    },
    sync: sync,
    pointerTarget: pointerTarget,
    toPage: toPage
  };
})();
