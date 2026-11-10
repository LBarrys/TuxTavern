'use strict';

// TuxTavern: YEP_QuestJournal 1.02 sizes the quest data window's contents at ten times its text
// height when the format has <WordWrap>, and narrows the scroll range to the text once drawn.
// Chromium (NW.js) takes canvases up to 32767 px a side; PMJS stops at 8192, so Sigillum 0.3's
// quest details (1244x10200) threw "invalid canvas dimensions". The height is capped at that
// limit: the text ends far above it, and the scroll range still follows the text.
(function() {
  var MAX_CANVAS_SIDE = 8192;

  function install() {
    var proto = typeof Window_QuestData === 'function' && Window_QuestData.prototype;
    if (!proto || typeof proto.contentsHeight !== 'function' || proto.contentsHeight._pmjsCapped) return;
    var contentsHeight = proto.contentsHeight;
    proto.contentsHeight = function() {
      return Math.min(MAX_CANVAS_SIDE, contentsHeight.apply(this, arguments));
    };
    proto.contentsHeight._pmjsCapped = true;
  }

  PMJS.plugins.onLoaded('YEP_QuestJournal', 'pmjs.adapter.yanfly-quest-journal', function() {
    PMJS.phases.on('afterGuestPlugins', 'pmjs.adapter.yanfly-quest-journal', install);
  });
})();
