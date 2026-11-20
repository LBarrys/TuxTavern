'use strict';

// DKTools reads the game folder ("local mode") only on NW.js, which it asks Utils.isNwjs(): false in
// PMJS. Its file layer needs only fs, os, path and process.mainModule, which PMJS has, so it gets
// local mode; its window and console code still see a browser. Karryn's Prison's Smoother CG
// Loading option preloads whole image folders through it, and stopped at Scene_Boot without it.
PMJS.plugins.onLoaded('DKTools', 'pmjs.adapter.dktools-local-files', function() {
  if (typeof DKTools === 'undefined' || !DKTools.IO) return;
  DKTools.IO.isLocalMode = function() { return true; };
});
