'use strict';

// PIXI.NineSlicePlane (window frames and buttons in plugin UIs) as nine sprites: corners at
// their size, edges stretched along one axis, the middle along both, as Pixi's mesh draws it.
(function() {
  var NineSlicePlane = PIXI.NineSlicePlane;
  if (!NineSlicePlane) return;
  var pixi = PMJS.pixi5;
  var slices = new WeakMap();

  function update(plane) {
    var texture = plane.texture, frame = texture && texture.frame;
    if (!texture || texture.valid === false || !frame || !(frame.width > 0) || !(frame.height > 0)) return [];
    // Pixi 7 shrinks the borders when the plane is smaller than them; Pixi 5 does not.
    var scale = typeof plane._getMinScale === 'function' ? plane._getMinScale() : 1;
    var width = plane._width, height = plane._height;
    var origWidth = plane._origWidth || texture.orig.width, origHeight = plane._origHeight || texture.orig.height;
    var columns = [plane._leftWidth, origWidth - plane._leftWidth - plane._rightWidth, plane._rightWidth];
    var rows = [plane._topHeight, origHeight - plane._topHeight - plane._bottomHeight, plane._bottomHeight];
    var x = [0, plane._leftWidth * scale, width - plane._rightWidth * scale, width];
    var y = [0, plane._topHeight * scale, height - plane._bottomHeight * scale, height];
    var key = [texture.baseTexture && texture.baseTexture.uid, frame.x, frame.y, frame.width, frame.height,
      origWidth, origHeight, columns, rows, x, y, pixi.color(plane.tint), plane.blendMode].join(':');
    var entry = slices.get(plane);
    if (!entry || entry.key !== key) {
      if (entry) entry.sprites.forEach(function(sprite) { sprite.texture.destroy(false); });
      var sprites = [], sourceY = 0;
      for (var row = 0; row < 3; row++) {
        var sourceX = 0;
        for (var column = 0; column < 3; column++) {
          var sourceWidth = columns[column] / origWidth * frame.width;
          var sourceHeight = rows[row] / origHeight * frame.height;
          var destinationWidth = x[column + 1] - x[column], destinationHeight = y[row + 1] - y[row];
          if (sourceWidth > 0 && sourceHeight > 0 && destinationWidth > 0 && destinationHeight > 0) {
            var sprite = new PIXI.Sprite(new PIXI.Texture(texture.baseTexture,
              new PIXI.Rectangle(frame.x + sourceX, frame.y + sourceY, sourceWidth, sourceHeight)));
            sprite.position.set(x[column], y[row]);
            sprite.scale.set(destinationWidth / sourceWidth, destinationHeight / sourceHeight);
            sprite.tint = plane.tint;
            sprite.blendMode = plane.blendMode;
            sprites.push(sprite);
          }
          sourceX += sourceWidth;
        }
        sourceY += rows[row] / origHeight * frame.height;
      }
      entry = { key: key, sprites: sprites };
      slices.set(plane, entry);
    }
    // The slices are not the plane's children; transform them under it as if they were.
    entry.sprites.forEach(function(sprite) {
      sprite.parent = plane;
      sprite.updateTransform();
    });
    return entry.sprites;
  }

  pixi.registerRenderContract(NineSlicePlane.prototype, {
    encode: function() { return { kind: 0, resource: 0 }; },
    children: function(plane) {
      return update(plane).concat(plane.children).map(function(node) { return { node: node }; });
    }
  });
})();
