'use strict';

// Web Workers, OffscreenCanvas and ImageBitmap, as Karryn's Prison's mods use them (FastCutIns turns
// poses into sprite sheets in canvas and PNG workers; SelectiveRendering compresses saves). A
// worker runs on this thread in its own global context; messages are tasks, delivered in order
// and passed by reference rather than cloned.
(function() {
  function ImageBitmap() { throw new TypeError('Illegal constructor'); }
  ImageBitmap.prototype = Object.create(CanvasElement.prototype);
  ImageBitmap.prototype.constructor = ImageBitmap;
  ImageBitmap.prototype.close = function() {
    this._releaseNativeCanvas();
    this._width = this._height = 0;
  };

  function OffscreenCanvas(width, height) {
    CanvasElement.call(this);
    this.width = width;
    this.height = height;
  }
  OffscreenCanvas.prototype = Object.create(CanvasElement.prototype);
  OffscreenCanvas.prototype.constructor = OffscreenCanvas;
  OffscreenCanvas.prototype.convertToBlob = function() {
    var png = NativeHost.canvas.encodePng(this._ensureNativeCanvas().handle);
    return Promise.resolve(new Blob([png], { type: 'image/png' }));
  };
  OffscreenCanvas.prototype.transferToImageBitmap = function() {
    var bitmap = copyToBitmap(this, 0, 0, this.width, this.height);
    this._releaseNativeCanvas();
    return bitmap;
  };
  // The canvas stays usable here; the worker draws into the same pixels.
  CanvasElement.prototype.transferControlToOffscreen = function() { return this; };

  function copyToBitmap(source, sx, sy, width, height) {
    var bitmap = new CanvasElement();
    Object.setPrototypeOf(bitmap, ImageBitmap.prototype);
    bitmap.width = width;
    bitmap.height = height;
    var context = bitmap.getContext('2d');
    if (source instanceof ImageData) {
      context.putImageData(source, -sx, -sy, sx, sy, width, height);
    } else if (width && height) {
      context.drawImage(source, sx, sy, width, height, 0, 0, width, height);
    }
    return bitmap;
  }

  function decodeBlob(blob) {
    return blob.arrayBuffer().then(function(buffer) {
      return NativeHost.images.loadBytesAsync(buffer, false);
    }).then(function(result) {
      var image = new NativeImage();
      image._nativeImage = trackNativeResource(result, 'image');
      image.width = image.naturalWidth = result.width;
      image.height = image.naturalHeight = result.height;
      image.complete = true;
      return image;
    });
  }

  globalThis.createImageBitmap = function(source, sx, sy, sw, sh) {
    return Promise.resolve(source && typeof source.arrayBuffer === 'function' && !source.getContext
      ? decodeBlob(source) : source).then(function(image) {
      if (!image || !(image.width > 0) || !(image.height > 0)) {
        throw new DOMException('createImageBitmap source has no image', 'InvalidStateError');
      }
      var cropped = typeof sx === 'number';
      var bitmap = copyToBitmap(image, cropped ? sx : 0, cropped ? sy : 0,
        cropped ? sw : image.width, cropped ? sh : image.height);
      if (image !== source && image._nativeImage) releaseNativeResource(image._nativeImage, 'image');
      return bitmap;
    });
  };
  globalThis.ImageBitmap = ImageBitmap;
  globalThis.OffscreenCanvas = OffscreenCanvas;

  var vm = globalThis.__pmjsBuiltinRequire && globalThis.__pmjsBuiltinRequire('vm');
  var shared = ['console', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask',
    'performance', 'TextEncoder', 'TextDecoder', 'Blob', 'ReadableStream', 'WritableStream', 'TransformStream',
    'URL', 'URLSearchParams', 'atob', 'btoa', 'structuredClone', 'fetch', 'navigator', 'crypto', 'EventTarget',
    'AbortController', 'AbortSignal', 'DOMException', 'OffscreenCanvas', 'ImageData', 'ImageBitmap',
    'createImageBitmap'];

  function sourceOf(href) {
    var path = href.replace(/^file:\/\//, '');
    try { path = decodeURI(path); } catch (_) { /* keep it as written */ }
    var text = NativeHost.fs.readText(gameReadPath(gamePath(path)));
    if (text === null) throw new Error('worker script not found: ' + href);
    return text;
  }

  function Worker(url, options) {
    EventTarget.call(this);
    var worker = this;
    var href = new URL(String(url), globalThis.location.href).href;
    var listeners = new EventTarget();
    var scope = { name: options && options.name || '', onmessage: null, onerror: null };
    shared.forEach(function(name) { if (name in globalThis) scope[name] = globalThis[name]; });
    scope.location = { href: href, toString: function() { return href; } };
    scope.addEventListener = listeners.addEventListener.bind(listeners);
    scope.removeEventListener = listeners.removeEventListener.bind(listeners);
    scope.postMessage = function(data) {
      PMJS.tasks.enqueue(function() {
        if (!worker._closed) worker.dispatchEvent({ type: 'message', data: data, target: worker });
      });
    };
    scope.close = function() { worker._closed = true; };
    var context = vm.createContext(scope);
    scope.importScripts = function() {
      Array.prototype.forEach.call(arguments, function(script) {
        var scriptHref = new URL(String(script), href).href;
        vm.runInContext(sourceOf(scriptHref), context, { filename: scriptHref });
      });
    };
    vm.runInContext('globalThis.self = globalThis;', context);
    this._closed = false;
    this._pending = Promise.resolve();
    this._scope = scope;
    this._listeners = listeners;
    this._run(function() { vm.runInContext(sourceOf(href), context, { filename: href }); });
  }
  Worker.prototype = Object.create(EventTarget.prototype);
  Worker.prototype.constructor = Worker;
  // Each delivery waits for the previous one's promises, as a browser runs microtasks between
  // tasks: a webpack worker sets onmessage only once its startup chunks have resolved.
  Worker.prototype._run = function(callback) {
    var worker = this;
    this._pending = this._pending.then(function() {
      return new Promise(function(resolve) {
        PMJS.tasks.enqueue(function() {
          if (!worker._closed) {
            try { callback(); } catch (error) {
              var event = { type: 'error', message: String(error && error.message || error), error: error,
                target: worker, preventDefault: function() { this.defaultPrevented = true; } };
              if (worker.dispatchEvent(event) && !worker.onerror) console.error('[pmjs] worker error:', error);
            }
          }
          resolve();
        });
      });
    });
  };
  Worker.prototype.postMessage = function(data) {
    var scope = this._scope, listeners = this._listeners;
    this._run(function() {
      var event = { type: 'message', data: data, target: scope };
      if (typeof scope.onmessage === 'function') scope.onmessage(event);
      listeners.dispatchEvent(event);
    });
  };
  Worker.prototype.terminate = function() { this._closed = true; };
  if (vm) globalThis.Worker = Worker;
})();
