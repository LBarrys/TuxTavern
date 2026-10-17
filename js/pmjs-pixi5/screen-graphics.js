'use strict';

// PIXI.Graphics. MV and MZ's ScreenSprite rectangle is a tinted 1x1 white sprite; any other
// Graphics (plugin gauges, circles, outlines) is drawn on its own canvas and shown as a sprite,
// redrawn when its geometry changes.
(function() {
  var pixi = PMJS.pixi5;
  var screenCanvas;
  var graphicsMethods = ['finishPoly', '_populateBatches', '_renderBatched',
    '_renderDirect', 'calculateVertices', 'calculateTints'].map(function(name) {
    return [name, PIXI.Graphics.prototype[name]];
  });
  var stockUpdateBatches = PIXI.GraphicsGeometry && PIXI.GraphicsGeometry.prototype.updateBatches;

  var canvases = new WeakMap();
  var SHAPES = PIXI.SHAPES;

  function css(color, alpha) {
    color = pixi.color(color);
    return 'rgba(' + [color >> 16 & 255, color >> 8 & 255, color & 255, alpha].join(',') + ')';
  }
  function trace(context, shape) {
    var x = shape.x, y = shape.y;
    if (shape.type === SHAPES.RECT) {
      context.rect(x, y, shape.width, shape.height);
    } else if (shape.type === SHAPES.CIRC) {
      context.moveTo(x + shape.radius, y);
      context.arc(x, y, shape.radius, 0, Math.PI * 2);
    } else if (shape.type === SHAPES.ELIP) {
      context.moveTo(x + shape.width, y);
      context.ellipse(x, y, Math.abs(shape.width), Math.abs(shape.height), 0, 0, Math.PI * 2);
    } else if (shape.type === SHAPES.RREC) {
      var w = shape.width, h = shape.height;
      var r = Math.max(0, Math.min(shape.radius, Math.abs(w) / 2, Math.abs(h) / 2));
      context.moveTo(x + r, y);
      context.arcTo(x + w, y, x + w, y + h, r);
      context.arcTo(x + w, y + h, x, y + h, r);
      context.arcTo(x, y + h, x, y, r);
      context.arcTo(x, y, x + w, y, r);
      context.closePath();
    } else if (shape.type === SHAPES.POLY) {
      var points = shape.points;
      if (points.length < 4) return;
      context.moveTo(points[0], points[1]);
      for (var i = 2; i < points.length; i += 2) context.lineTo(points[i], points[i + 1]);
      if (shape.closeStroke) context.closePath();
    } else {
      pixi.rejectRender('render.graphics-shape', null, String(shape.type));
    }
  }
  // Pixi's alignment puts (1 - alignment) of the line inside the shape and the rest outside.
  function stroke(context, shape, line, resolution, width, height) {
    if (!line || !line.visible || !(line.width > 0) || !(line.alpha > 0)) return;
    context.strokeStyle = css(line.color, line.alpha);
    context.lineCap = line.cap || 'butt';
    context.lineJoin = line.join || 'miter';
    context.miterLimit = line.miterLimit || 10;
    var lineWidth = line.native ? 1 / resolution : line.width;
    var alignment = line.alignment === undefined ? 0.5 : line.alignment;
    var closed = shape.type !== SHAPES.POLY || shape.closeStroke;
    if (alignment === 0.5 || !closed || line.native) {
      context.lineWidth = lineWidth;
      context.beginPath(); trace(context, shape); context.stroke();
      return;
    }
    [[1 - alignment, false], [alignment, true]].forEach(function(part) {
      if (!part[0]) return;
      context.save();
      context.beginPath();
      if (part[1]) {
        context.save(); context.setTransform(1, 0, 0, 1, 0, 0);
        context.rect(0, 0, width, height); context.restore();
      }
      trace(context, shape);
      context.clip('evenodd');
      context.lineWidth = lineWidth * part[0] * 2;
      context.beginPath(); trace(context, shape); context.stroke();
      context.restore();
    });
  }
  function textured(style) {
    return style && style.visible && style.texture && style.texture !== PIXI.Texture.WHITE;
  }
  function draw(graphics, resolution) {
    graphics.geometry.graphicsData.forEach(function(data) {
      if (textured(data.fillStyle) || textured(data.lineStyle) || data.holes.some(function(hole) {
        return textured(hole.lineStyle);
      })) pixi.rejectRender('render.graphics-texture', graphics);
    });
    var bounds = graphics.geometry.bounds;
    if (!(bounds.maxX > bounds.minX) || !(bounds.maxY > bounds.minY)) return null;
    var left = Math.floor(bounds.minX) - 1, top = Math.floor(bounds.minY) - 1;
    var right = Math.ceil(bounds.maxX) + 1, bottom = Math.ceil(bounds.maxY) + 1;
    resolution = Math.min(resolution, 4096 / (right - left), 4096 / (bottom - top));
    var width = Math.max(1, Math.ceil((right - left) * resolution));
    var height = Math.max(1, Math.ceil((bottom - top) * resolution));
    var entry = canvases.get(graphics);
    var key = [graphics.geometry.dirty, resolution, left, top, width, height].join(':');
    if (entry && entry.key === key) return entry;
    var canvas = entry ? entry.canvas : new CanvasElement();
    canvas.width = width;
    canvas.height = height;
    var context = canvas.getContext('2d');
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, width, height);
    graphics.geometry.graphicsData.forEach(function(data) {
      var m = data.matrix || { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 };
      context.setTransform(resolution * m.a, resolution * m.b, resolution * m.c, resolution * m.d,
        resolution * (m.tx - left), resolution * (m.ty - top));
      var fill = data.fillStyle;
      if (fill && fill.visible && fill.alpha > 0) {
        context.fillStyle = css(fill.color, fill.alpha);
        context.beginPath();
        trace(context, data.shape);
        data.holes.forEach(function(hole) { trace(context, hole.shape); });
        context.fill('evenodd');
      }
      stroke(context, data.shape, data.lineStyle, resolution, width, height);
      data.holes.forEach(function(hole) { stroke(context, hole.shape, hole.lineStyle, resolution, width, height); });
    });
    if (typeof canvas._pmjsContentChanged === 'function') canvas._pmjsContentChanged();
    entry = { canvas: canvas, key: key, left: left, top: top, right: right, bottom: bottom, resolution: resolution };
    canvases.set(graphics, entry);
    return entry;
  }
  function worldVertices(matrix, points) {
    var vertices = new Float32Array(8);
    for (var corner = 0; corner < 4; corner++) {
      var x = points[corner * 2], y = points[corner * 2 + 1];
      vertices[corner * 2] = matrix.a * x + matrix.c * y + matrix.tx;
      vertices[corner * 2 + 1] = matrix.b * x + matrix.d * y + matrix.ty;
    }
    return vertices;
  }
  function screenRectangle(graphics) {
    var parent = graphics.parent, data = graphics.geometry.graphicsData;
    if (!(parent instanceof ScreenSprite) || parent._graphics !== graphics || data.length !== 1) return false;
    var rectangle = data[0];
    return rectangle.shape.type === SHAPES.RECT && !rectangle.holes.length && !rectangle.matrix &&
      !rectangle.lineStyle.visible && rectangle.fillStyle.texture === PIXI.Texture.WHITE && !rectangle.fillStyle.matrix;
  }

  pixi.registerRenderContract(PIXI.Graphics.prototype, {
    encode: function(graphics, renderer) {
      if (graphics.shader || graphics.pluginName !== 'batch' ||
          graphics.geometry.updateBatches !== stockUpdateBatches ||
          graphicsMethods.some(function(entry) { return graphics[entry[0]] !== entry[1]; })) {
        pixi.rejectRender('render.graphics-method', graphics);
      }
      graphics.finishPoly();
      var data = graphics.geometry.graphicsData;
      if (!data.length) return { kind: 0, resource: 0 };
      var matrix = graphics.worldTransform;
      if (screenRectangle(graphics)) {
        var shape = data[0].shape, fill = data[0].fillStyle;
        if (!fill.visible) return { kind: 0, resource: 0 };
        if (!screenCanvas) {
          screenCanvas = new CanvasElement();
          screenCanvas.width = screenCanvas.height = 1;
          var context = screenCanvas.getContext('2d');
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, 1, 1);
        }
        var tint = 0, graphicsTint = pixi.color(graphics.tint), fillColor = pixi.color(fill.color);
        [16, 8, 0].forEach(function(shift) {
          tint |= Math.floor(((graphicsTint >> shift) & 255) / 255 *
            ((fillColor >> shift) & 255) / 255 * 255) << shift;
        });
        return { kind: 1, resource: pixi.nativeSource(screenCanvas).handle,
          tint: tint, alphaMultiplier: fill.alpha,
          sprite: { vertices: worldVertices(matrix, [shape.x, shape.y, shape.x + shape.width, shape.y,
            shape.x + shape.width, shape.y + shape.height, shape.x, shape.y + shape.height]), texture: {
            baseTexture: { resolution: 1, scaleMode: PIXI.SCALE_MODES.NEAREST },
            frame: { x: 0, y: 0, width: 1, height: 1 },
            orig: { width: shape.width, height: shape.height }
          } } };
      }
      // Drawn at the scale it is shown, so zoomed shapes stay sharp.
      var scale = Math.sqrt(Math.max(matrix.a * matrix.a + matrix.b * matrix.b, matrix.c * matrix.c + matrix.d * matrix.d));
      var resolution = Math.min(4, Math.max(0.5, Math.ceil(scale * (renderer && renderer.resolution || 1) * 2) / 2));
      var entry = draw(graphics, resolution);
      if (!entry) return { kind: 0, resource: 0 };
      var w = entry.canvas.width / entry.resolution, h = entry.canvas.height / entry.resolution;
      return { kind: 1, resource: pixi.nativeSource(entry.canvas).handle,
        sprite: { vertices: worldVertices(matrix, [entry.left, entry.top, entry.left + w, entry.top,
          entry.left + w, entry.top + h, entry.left, entry.top + h]), texture: {
          baseTexture: { resolution: entry.resolution, scaleMode: PIXI.SCALE_MODES.LINEAR },
          frame: { x: 0, y: 0, width: w, height: h }, orig: { width: w, height: h }
        } } };
    }
  });
  if (PMJS.methods) {
    PMJS.methods.wrap({ key: 'PIXI.Graphics.destroy.native-canvas', id: 'pixi5-graphics-canvas-release',
      getTarget: function() { return PIXI.Graphics.prototype; }, method: 'destroy',
      wrap: function(original) {
        return function() {
          var entry = canvases.get(this);
          if (entry && typeof entry.canvas._releaseNativeCanvas === 'function') entry.canvas._releaseNativeCanvas();
          canvases.delete(this);
          return original.apply(this, arguments);
        };
      }
    });
  }
})();
