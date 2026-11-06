'use strict';

(function() {
  var paintingId = 'tilemap.yed-indexed-paint-loops';
  var animationId = 'tilemap.yed-indexed-animation';
  PMJS.plugins.registerOptimization('YED_Tiled', {
    id: paintingId, owner: 'plugins/yed/tiled',
    fallback: 'guest tile preparation and priority-sprite painting'
  });
  PMJS.plugins.registerOptimization('YED_Tiled', {
    id: animationId, owner: 'plugins/yed/tiled',
    fallback: 'guest animation updates with full tile repaint'
  });

  var reviewedMethods = {
    _paintAllTiles: 'e9b49d6deb06b751a5c2d605b252a951bbf3155c5db0ab4a1a2d2fc090ea2aec',
    _updateLayerPositions: '192c62e166187aeb511ac40046b4299999b4f53fe4dd1a77a5676f734d8eeeeb',
    _paintObjectLayers: '695762171e06d553823ce50a2c1b54067ae9e124c893b24ba116c42cd4a9dc8e',
    _paintTilesLayer: '2ffe4cd820664ad0911e7f25db7272416613dfde1d4e2b772373637f0f6773ec',
    _paintTile: '3179495717cb0e9ee850549aad37258435125b8b91f980e7a965ecb35fd0f40e',
    _paintPriorityTile: '9d8ed2d54c4397ed8fc7ac5ffb202022c37bb11af28b9611c2e42fd8cf22d1c3',
    _updateAnim: '61c2fed25261010df7f9b37abb4f691863ef23f2e3d84aad3f50d4599d9d840b',
    updateTransform: 'b7a7a370946ce0ae21b0627c85c55abd0efd8db9eef430a0afcb92f37637f236',
    _compareChildOrder: '4a81bea0be0ed6cb764109f1846f04e4bae324b85999d5258bdf920e3f4eb012',
    _paintTiles: '7b10b95d1b40b756830d4a685e29706839bdc548fd2b1fddd53ada242edc33bc',
    _getTextureId: 'd61c490aaedc4da890a6f13299bfa605a707146a1eb4fad8a9a303ef17f7d3b3',
    _getAnimTileId: '6b2481626a353fe2df179a7260405ee1a32b2ca7af8acc6a5a5254d19d47e637',
    _getPriority: 'aeac6b3ac39790e16616036a059d0114218504718d8bee3dc0dea93b4b4b05d9',
    _isPriorityTile: 'a83e33b7e55289e825b00d3a60e3f83d622f8843199ce0efbb1ee5e29f45beeb',
    _getZIndex: 'd04b04844182e1fcc628e8d0b21899fdcde0cc0d7649a720207f862894791b99',
    _updateAnimFrames: '1784d51ae97e984417d78e6ba34073a9d31e53259873765f040d3693cf9ab8cf',
    hideOnLevel: '0140d27e86bc6e413e5450c27b2446445b7c26a180de67339b7d54f6926e14aa',
    _sortChildren: 'f70b7bc23a18ba594dba1664022d1aac77f4285cde92b18e3c4040d995a82210'
  };
  var contracts = new WeakMap();

  function matches(fn, digest) {
    if (typeof fn !== 'function' || !globalThis.__pmjsBuiltinRequire) return false;
    var source = Function.prototype.toString.call(fn)
      .replace(/^function(?:\s+[\w$]+)?\s*\(/, 'function(');
    return globalThis.__pmjsBuiltinRequire('crypto').createHash('sha256')
      .update(source).digest('hex') === digest;
  }

  function dataContract(data) {
    if (!data || !Array.isArray(data.layers) || !Array.isArray(data.tilesets)) return 'unreviewed-tiled-data';
    if (data.infinite || data.orientation && data.orientation !== 'orthogonal' ||
        data.layers.some(function(layer) { return !layer || layer.layers || layer.chunks ||
          layer.data !== undefined && !Array.isArray(layer.data) ||
          layer.objects !== undefined && !Array.isArray(layer.objects); })) {
      return 'unreviewed-tiled-layer-geometry';
    }
    if (data.tilesets.some(function(set) { return !set || set.margin || set.spacing ||
        Array.isArray(set.tiles) && set.tiles.some(function(tile, index) { return tile && tile.id !== index; }); })) {
      return 'unreviewed-tiled-tileset-geometry';
    }
    if (data.layers.some(function(layer) {
      return (layer.data || []).some(function(gid) { return (Number(gid) >>> 0) > 0x0fffffff; }) ||
        (layer.objects || []).some(function(object) { return object && (Number(object.gid) >>> 0) > 0x0fffffff; });
    })) return 'unreviewed-tiled-flips';
    return true;
  }

  function rejectActivation(reason, beforeBoot) {
    [paintingId, animationId].forEach(function(id) {
      if (beforeBoot) PMJS.optimizations.refuse(id, reason);
      else PMJS.optimizations.reportFallback(id, reason);
    });
    if (PMJS.maps) PMJS.maps.tiledContract = function() { return reason; };
  }

  function activate(constructor, beforeBoot) {
    if (typeof constructor !== 'function') {
      rejectActivation('tilemap constructor unavailable', beforeBoot);
      return;
    }
    if (contracts.has(constructor)) {
      if (PMJS.maps) PMJS.maps.tiledContract = contracts.get(constructor);
      return;
    }
    var prototype = constructor.prototype;
    var names = Object.keys(reviewedMethods);
    var qualified = !Object.prototype.hasOwnProperty.call(prototype, 'updateTransform') &&
      names.every(function(name) {
        return name === '_compareChildOrder' && prototype[name] === undefined ||
          matches(prototype[name], reviewedMethods[name]);
      });
    if (!qualified) {
      rejectActivation('unrecognized tile preparation composition', beforeBoot);
      if (PMJS.maps) PMJS.maps.tiledContract = function() { return 'unreviewed-tiled-methods'; };
      return;
    }
    var original = {};
    names.forEach(function(name) { original[name] = prototype[name]; });
    var effective = Object.assign({}, original);
    var disabled = new WeakSet();
    var retained = PMJS.yedRetainedTiles;
    var painting = PMJS.optimizations.isEnabled(paintingId);
    var animation = painting && PMJS.optimizations.isEnabled(animationId);
    if (!painting && PMJS.optimizations.isEnabled(animationId)) {
      if (beforeBoot) PMJS.optimizations.refuse(animationId, 'requires ' + paintingId);
      else PMJS.optimizations.reportFallback(animationId, 'requires ' + paintingId);
    }

    function methodsUnchanged(instance) {
      return names.every(function(name) { return instance[name] === effective[name]; });
    }
    function deactivate(instance, reason) {
      if (disabled.has(instance)) return;
      PMJS.optimizations.reportFallback(paintingId, reason);
      if (animation) PMJS.optimizations.reportFallback(animationId, reason);
      disabled.add(instance);
      instance._pmjsIndexedAnimation = false;
      instance._pmjsIndexedPaintLoops = false;
      instance._needsRepaint = true;
      instance._needsAnimRepaint = false;
      instance._pmjsChangedAnimKeys = null;
      retained.invalidate(instance);
    }
    function eligible(instance) {
      if (disabled.has(instance)) return false;
      if (!methodsUnchanged(instance)) {
        deactivate(instance, 'tilemap methods changed after installation');
        return false;
      }
      if (!retained.supported(instance)) {
        deactivate(instance, 'tilemap data or instance contract unsupported');
        return false;
      }
      return true;
    }
    function coordinates(instance) {
      var camera = instance.origin;
      return [Math.floor(((instance.roundPixels ? Math.floor(camera.x) : camera.x) - (instance._margin || 0)) / instance._tileWidth),
        Math.floor(((instance.roundPixels ? Math.floor(camera.y) : camera.y) - (instance._margin || 0)) / instance._tileHeight)];
    }
    function prepare(instance) {
      if (!eligible(instance)) return false;
      var window = coordinates(instance);
      if (!retained.prepare(instance, window[0], window[1])) {
        deactivate(instance, 'retained tile preparation rejected');
        return false;
      }
      instance._sortChildren();
      return true;
    }
    function wrap(name, operation) {
      var guest = original[name];
      var wrapped = function() {
        if (!eligible(this)) return guest.apply(this, arguments);
        if (operation.apply(this, arguments) === false) {
          deactivate(this, 'retained tile operation rejected: ' + name);
          return guest.apply(this, arguments);
        }
      };
      wrapped._pmjsYedGuard = true;
      prototype[name] = effective[name] = wrapped;
    }
    if (painting) {
      wrap('_paintAllTiles', function(x, y) { return retained.paint(this, x, y); });
      wrap('_updateLayerPositions', function(x, y) { return retained.updatePositions(this, x, y); });
      if (animation) wrap('_updateAnim', function() { return retained.updateAnimation(this); });
      wrap('updateTransform', function() {
        if (!prepare(this)) return false;
        PIXI.Container.prototype.updateTransform.call(this);
        return true;
      });
      prototype._paintAnimTiles = function(pending) {
        if (!eligible(this)) return;
        if (pending) this._pmjsChangedAnimKeys = Object.assign(this._pmjsChangedAnimKeys || Object.create(null), pending);
        prepare(this);
      };
      prototype._pmjsPrepareTiles = function() { return prepare(this); };
      if (typeof pmjsPixiRenderPreflight !== 'undefined') {
        var containerUpdateTransform = PIXI.Container.prototype.updateTransform;
        pmjsPixiRenderPreflight.registerTransformPreparation(effective.updateTransform,
          prepare, function(instance) { return PIXI.Container.prototype.updateTransform === containerUpdateTransform &&
            eligible(instance) && names.every(function(name) {
            return prototype[name] === effective[name];
          }); });
      }
      prototype._pmjsIndexedPaintLoops = true;
      prototype._pmjsIndexedAnimation = animation;
    }
    var contract = function(data) {
      if (!names.every(function(name) { return prototype[name] === effective[name]; })) return 'tiled-producer-changed';
      return data ? dataContract(data) : true;
    };
    contracts.set(constructor, contract);
    if (PMJS.maps) PMJS.maps.tiledContract = contract;
  }

  var reflectionId = 'tilemap.yed-reflection-sprites';
  PMJS.plugins.registerOptimization('YED_Tiled', { id: reflectionId, owner: 'plugins/yed/tiled',
    fallback: 'update all reflection sprites' });
  PMJS.phases.on('afterGuestPlugins', reflectionId, function() {
    if (!PMJS.optimizations.isEnabled(reflectionId)) return;
    var prototype = Spriteset_Map.prototype;
    var create = prototype.createCharacters, update = prototype.update;
    var model = Game_CharacterBase.prototype.updateReflection;
    var query = Game_Map.prototype.isOnReflection;
    if (!PMJS.methods.matchesSource(create, '360be50d29482d1126b15bdb08c213765d7caac3dd5572993234b045bb59a841') ||
        !PMJS.methods.matchesSource(model, '58b6d640f457bba7552a7af7371bddd327142b4089078210f62bb224cb9f2907') ||
        !PMJS.methods.matchesSource(query, '48b319446b732df6e0a5cca07c43886b64e9bd0b2350cf79822312c4f78344d5')) {
      PMJS.optimizations.refuse(reflectionId, 'unrecognized reflection composition'); return;
    }
    var states = new WeakMap();
    function reconcile(spriteset, state) {
      var map = globalThis.$gameMap;
      var idle = PMJS.optimizations.isEnabled(reflectionId) && map && map === state.map &&
        Array.isArray(map._reflection) && map._reflection.length === 0 &&
        Game_CharacterBase.prototype.updateReflection === model && map.isOnReflection === query;
      for (var i = 0; i < state.sprites.length; i++) {
        var entry = state.sprites[i], sprite = entry.sprite;
        var parent = sprite.parent;
        var park = idle && sprite.update === entry.update && sprite.updateReflect === entry.reflect &&
          sprite.updatePosition === entry.position && sprite._character.updateReflection === model &&
          !sprite._balloonSprite && !(sprite._animationSprites && sprite._animationSprites.length);
        if (park && parent === spriteset._tilemap) state.holder.addChild(sprite);
        else if (!park && parent === state.holder) spriteset._tilemap.addChild(sprite);
      }
    }
    prototype.createCharacters = function() {
      var result = create.apply(this, arguments);
      var sprites = this._characterSprites.filter(function(sprite) {
        return PMJS.methods.matchesSource(sprite.update, 'b9bd26e3c58172344a22d937c65c0d79dd2c8832149c89907be766bab18f695d') &&
          PMJS.methods.matchesSource(sprite.updateReflect, 'ecf3960b4fb2252991db3e8e1594db1df648062a46daeaee1c1317131f892fd9') &&
          PMJS.methods.matchesSource(sprite.updatePosition, 'cae2b6425843e61373801fec2a0ed932315e9d727568ff4fddbf105236836a3f');
      }).map(function(sprite) {
        return { sprite: sprite, update: sprite.update, reflect: sprite.updateReflect, position: sprite.updatePosition };
      });
      if (sprites.length) {
        var holder = new PIXI.Container();
        holder.visible = false;
        this.addChild(holder);
        var state = { map: globalThis.$gameMap, holder: holder, sprites: sprites };
        states.set(this, state);
        reconcile(this, state);
      }
      return result;
    };
    prototype.update = function() {
      var state = states.get(this);
      if (state) reconcile(this, state);
      return update.apply(this, arguments);
    };
  });

  PMJS.methods.wrap({
    key: 'Spriteset_Map.loadTileset', id: 'pmjs.yed-map-contract',
    getTarget: function() { return typeof Spriteset_Map === 'function' ? Spriteset_Map.prototype : null; },
    method: 'loadTileset',
    wrap: function(guest) { return function() {
      if (this._tilemap && typeof $gameMap !== 'undefined' &&
          typeof $gameMap.isTiledMap === 'function' && $gameMap.isTiledMap()) {
        activate(this._tilemap.constructor);
      }
      return guest.apply(this, arguments);
    }; }
  });
  PMJS.plugins.onLoaded('YED_Tiled', 'pmjs.adapter.yed-tiled', function() {
    PMJS.phases.on('afterGuestPlugins', 'pmjs.adapter.yed-tiled', function() {
      if (typeof globalThis.TiledTilemap === 'function') activate(globalThis.TiledTilemap, true);
    });
  });
})();
