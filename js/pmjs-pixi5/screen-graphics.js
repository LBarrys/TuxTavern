'use strict';

// MV and MZ ScreenSprite: a stock Graphics rectangle drawn as a tinted 1x1 white sprite.
(function() {
  var pixi = PMJS.pixi5;
  var screenCanvas;
  var graphicsMethods = ['finishPoly', '_populateBatches', '_renderBatched',
    '_renderDirect', 'calculateVertices', 'calculateTints'].map(function(name) {
    return [name, PIXI.Graphics.prototype[name]];
  });
  var stockUpdateBatches = PIXI.GraphicsGeometry && PIXI.GraphicsGeometry.prototype.updateBatches;

  pixi.registerRenderContract(PIXI.Graphics.prototype, {
    encode: function(graphics) {
      var parent = graphics.parent;
      if (!(parent instanceof ScreenSprite) || parent._graphics !== graphics ||
          graphics.shader || graphics.pluginName !== 'batch' ||
          graphics.geometry.updateBatches !== stockUpdateBatches ||
          graphicsMethods.some(function(entry) { return graphics[entry[0]] !== entry[1]; })) {
        pixi.rejectRender('render.screen-graphics', graphics);
      }
      graphics.finishPoly();
      var data = graphics.geometry.graphicsData;
      if (!data.length) return { kind: 0, resource: 0 };
      var rectangle = data[0], shape = rectangle.shape, fill = rectangle.fillStyle;
      if (data.length !== 1 || shape.type !== PIXI.SHAPES.RECT ||
          rectangle.holes.length || rectangle.matrix || rectangle.lineStyle.visible ||
          fill.texture !== PIXI.Texture.WHITE || fill.matrix) {
        pixi.rejectRender('render.screen-graphics-shape', graphics);
      }
      if (!fill.visible) return { kind: 0, resource: 0 };
      if (!screenCanvas) {
        screenCanvas = new CanvasElement();
        screenCanvas.width = screenCanvas.height = 1;
        var context = screenCanvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, 1, 1);
      }
      var matrix = graphics.worldTransform;
      var vertices = new Float32Array(8);
      var points = [shape.x, shape.y, shape.x + shape.width, shape.y,
        shape.x + shape.width, shape.y + shape.height, shape.x, shape.y + shape.height];
      for (var corner = 0; corner < 4; corner++) {
        var x = points[corner * 2], y = points[corner * 2 + 1];
        vertices[corner * 2] = matrix.a * x + matrix.c * y + matrix.tx;
        vertices[corner * 2 + 1] = matrix.b * x + matrix.d * y + matrix.ty;
      }
      var tint = 0;
      [16, 8, 0].forEach(function(shift) {
        tint |= Math.floor(((graphics.tint >> shift) & 255) / 255 *
          ((fill.color >> shift) & 255) / 255 * 255) << shift;
      });
      return { kind: 1, resource: pixi.nativeSource(screenCanvas).handle,
        tint: tint, alphaMultiplier: fill.alpha,
        sprite: { vertices: vertices, texture: {
          baseTexture: { resolution: 1, scaleMode: PIXI.SCALE_MODES.NEAREST },
          frame: { x: 0, y: 0, width: 1, height: 1 },
          orig: { width: shape.width, height: shape.height }
        } } };
    }
  });
})();
