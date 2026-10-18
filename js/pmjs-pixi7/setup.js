'use strict';

// MV on Pixi 7 (Karryn's Prison): the game's index.html loads Pixi 7 and its own libraries
// (@pixi/tilemap, pixi-rpgm, a logger) before rpg_core.js; load them in that order, as NW.js does.
nativeBootPhase('adapter-ready');
var pmjsPixi7RuntimeGame = globalThis.PMJS_RUNTIME_GAME;
if (!pmjsPixi7RuntimeGame || !Array.isArray(pmjsPixi7RuntimeGame.libraries)) {
  throw new Error('MV on Pixi 7 needs the inspected index.html libraries');
}
pmjsPixi7RuntimeGame.libraries.forEach(function(script) {
  NativeHost.runtime.loadScript(script);
});
if (!globalThis.PIXI || typeof PIXI.Container !== 'function') {
  throw new Error('Pixi object model did not initialize');
}
if (PIXI.VERSION !== pmjsPixi7RuntimeGame.pixiVersion) {
  throw new Error('inspected Pixi ' + pmjsPixi7RuntimeGame.pixiVersion + ' but loaded ' + PIXI.VERSION);
}
// Assets loads textures through Image, which PMJS decodes natively, not createImageBitmap in a
// blob-URL worker (Karryn's Prison's FastCutIns loads its sprite sheets with Assets).
if (PIXI.Assets && typeof PIXI.Assets.setPreferences === 'function') {
  PIXI.Assets.setPreferences({ preferWorkers: false, preferCreateImageBitmap: false });
}
// Compressed textures need a WebGL context in the page, which PMJS does not give; Pixi 7's
// detector then reads the missing context and Assets.init throws (Karryn's Prison's FastCutIns
// lost a batch of sprite sheets).
if (PIXI.extensions && PIXI.detectCompressedTextures) PIXI.extensions.remove(PIXI.detectCompressedTextures);
