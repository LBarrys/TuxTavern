'use strict';

// MV on Pixi 7 (Karryn's Prison, pixi-rpgm): MV's classes on the shared native scene encoder.
(function() {
  var pixi = PMJS.pixi5;

  // Sprite and TilingSprite._render touch the bitmap, upload a dirty canvas and, for Sprite,
  // draw nothing until the bitmap is ready; children still draw.
  function bitmapLeaf(skipUnready) {
    return function(node) {
      var bitmap = node._bitmap;
      if (!bitmap) return null;
      bitmap.touch();
      if (skipUnready && !bitmap.isReady()) return { kind: 0, resource: 0 };
      bitmap.checkDirty();
      return null;
    };
  }
  pixi.registerRenderContract(Sprite.prototype, { encode: bitmapLeaf(true) });
  pixi.registerRenderContract(TilingSprite.prototype, { encode: bitmapLeaf(false) });
  pixi.registerRenderContract(ToneSprite.prototype, {
    encode: function() { return { kind: 0, resource: 0 }; }
  });

  // Text._render redraws its canvas, at the renderer's resolution, before drawing it as a sprite
  // (Karryn's Prison draws window text as DisposableText).
  pixi.registerRenderContract(PIXI.Text && PIXI.Text.prototype, {
    prepare: function(node, renderer) {
      if (node._autoResolution && renderer && node._resolution !== renderer.resolution) {
        node._resolution = renderer.resolution;
        node.dirty = true;
      }
      node.updateText(true);
    }
  });

  var tilemap = PIXI.tilemap;
  var stride = tilemap.POINT_STRUCT_SIZE;
  var layers = new WeakMap();
  var finalizer = new FinalizationRegistry(function(resource) {
    NativeHost.render.releaseTileLayer(resource.handle);
  });
  var shadows = new Map();

  function shadowCanvas(color, width, height) {
    var key = Array.from(color).join(',');
    var canvas = shadows.get(key);
    if (canvas && canvas.width >= width && canvas.height >= height) return canvas;
    canvas = canvas || new CanvasElement();
    canvas.width = Math.max(canvas.width, width);
    canvas.height = Math.max(canvas.height, height);
    var context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = 'rgba(' + [color[0] * 255, color[1] * 255, color[2] * 255, color[3]].join(',') + ')';
    context.fillRect(0, 0, canvas.width, canvas.height);
    shadows.set(key, canvas);
    return canvas;
  }

  function releaseLayer(layer) {
    var resource = layers.get(layer);
    if (!resource) return;
    finalizer.unregister(resource);
    NativeHost.render.releaseTileLayer(resource.handle);
    layers.delete(layer);
  }

  // @pixi/tilemap keeps 14 values per tile; the native layer takes 9:
  // u, v, x, y, width, height, animX, animY, texture.
  function tileLayer(layer, renderer) {
    var buffer = layer.pointsBuf;
    var handles = [], revisions = [], indices = new Map(), points = [];
    var shadowWidth = 1, shadowHeight = 1, shadow = null;
    for (var i = 0; i < buffer.length; i += stride) {
      if (buffer[i + 9] < 0) {
        shadowWidth = Math.max(shadowWidth, Math.ceil(buffer[i + 4]));
        shadowHeight = Math.max(shadowHeight, Math.ceil(buffer[i + 5]));
      }
    }
    for (i = 0; i < buffer.length; i += stride) {
      if (buffer[i + 6] || buffer[i + 10] !== 1024 || buffer[i + 11] !== 1024 ||
          buffer[i + 12] !== 1 || buffer[i + 13] !== 1) {
        pixi.rejectRender('render.tile-options', layer, 'rotation, animation count or alpha');
      }
      var texture = buffer[i + 9];
      var source;
      if (texture < 0) {
        source = shadow = shadow || shadowCanvas(layer.shadowColor, shadowWidth, shadowHeight);
      } else {
        var base = layer.tileset[texture];
        source = base && base.resource && base.resource.source;
      }
      var native = pixi.nativeSource(source);
      if (!native) continue;
      if (!indices.has(native.handle)) {
        indices.set(native.handle, handles.length);
        handles.push(native.handle);
        revisions.push(source.__pmjsContentRevision || 0);
      }
      points.push(buffer[i], buffer[i + 1], buffer[i + 2], buffer[i + 3], buffer[i + 4], buffer[i + 5],
        buffer[i + 7], buffer[i + 8], indices.get(native.handle));
    }
    var animation = layer.tileAnim || renderer && renderer.plugins && renderer.plugins.tilemap.tileAnim || [0, 0];
    if (!points.length) {
      releaseLayer(layer);
      return { kind: 0, resource: 0 };
    }
    var signature = handles.join(':') + '/' + revisions.join(':');
    var previous = layers.get(layer);
    if (!previous || previous.signature !== signature || previous.points.length !== points.length ||
        points.some(function(value, index) { return value !== previous.points[index]; })) {
      var handle = NativeHost.render.createTileLayer(new Float32Array(points), handles);
      if (!handle) throw new Error('native tile layer creation failed');
      releaseLayer(layer);
      previous = { handle: handle, signature: signature, points: points };
      layers.set(layer, previous);
      finalizer.register(layer, previous, previous);
    }
    return { kind: 4, resource: previous.handle, nearest: true, animation: [animation[0], animation[1]] };
  }

  pixi.registerRenderContract(tilemap.Tilemap.prototype, { encode: tileLayer, callsLeaf: false,
    children: function() { return []; } });
  pixi.registerRenderContract(tilemap.CompositeTilemap.prototype, { callsLeaf: false });
  // ShaderTilemap.render sets the renderer's animation frame, then renders as a Container.
  pixi.registerRenderContract(ShaderTilemap.prototype, { callsLeaf: false,
    encode: function(node, renderer) {
      node._hackRenderer(renderer);
      return null;
    }
  });
  PMJS.methods.wrap({ key: 'pixi7.tilemap.destroy', id: 'pmjs-pixi7.display',
    getTarget: function() { return tilemap.Tilemap.prototype; }, method: 'destroy',
    wrap: function(original) {
      return function() {
        releaseLayer(this);
        return original.apply(this, arguments);
      };
    }
  });

  // MV's ToneFilter and other ColorMatrixFilters: a 4x5 matrix and alpha.
  var ColorMatrixFilter = PIXI.ColorMatrixFilter;
  var stockMatrix = new ColorMatrixFilter();
  pmjsPixi5RegisterFilterEncoder(function(filter) {
    if (!(filter instanceof ColorMatrixFilter) || filter.apply !== stockMatrix.apply ||
        filter.program !== stockMatrix.program) return null;
    var matrix = Array.from(filter.matrix);
    return { kind: 25, parameters: matrix.concat(filter.alpha),
      neutral: filter.alpha === 0 || matrix.every(function(value, index) {
        return value === (index % 6 === 0 && index < 19 ? 1 : 0);
      }) };
  });

  PMJS.pixi7 = {
    renderStageToCanvas: function(stage, canvas, roundPixels, renderer) {
      NativeHost.render.setRenderTargetSize(canvas.width, canvas.height);
      try {
        globalThis.pmjsPixi5RenderScene(stage, null, 1, { width: canvas.width, height: canvas.height },
          renderer, false, null);
        NativeHost.render.renderToCanvas(canvas._ensureNativeCanvas().handle);
      } finally {
        if (renderer) NativeHost.render.setScreenRenderSize(renderer.width, renderer.height);
      }
    },
    releaseSceneResources: function() {}
  };
})();
