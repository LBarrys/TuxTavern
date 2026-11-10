'use strict';
// TuxTavern: Sigillum 0.3's quest details asked for a 1244x10200 canvas (YEP_QuestJournal's
// word-wrap estimate times ten), past PMJS's 8192 px canvas limit.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/pmjs-plugins/yanfly-quest-journal.js'), 'utf8');

function load(loaded = true) {
  const phases = {};
  const context = vm.createContext({
    PMJS: {
      plugins: { onLoaded(name, id, run) { if (loaded && name === 'YEP_QuestJournal') run(); } },
      phases: { on(phase, id, run) { phases[phase] = run; } }
    }
  });
  // YEP_QuestJournal 1.02's own contentsHeight.
  vm.runInContext(`function Window_QuestData() { this._allTextHeight = 0; }
    Window_QuestData.prototype.contentsHeight = function() {
      var standard = this.height - this.standardPadding() * 2;
      return Math.max(standard, this._allTextHeight);
    };
    Window_QuestData.prototype.standardPadding = function() { return 18; };`, context);
  vm.runInContext(source, context);
  if (phases.afterGuestPlugins) phases.afterGuestPlugins();
  return vm.runInContext('new Window_QuestData()', context);
}

test('the quest data window never asks for a canvas past 8192 px', () => {
  const window = load();
  window.height = 624; window._allTextHeight = 10200;
  assert.equal(window.contentsHeight(), 8192);
});

test('heights under the limit, and the drawn text height afterwards, are unchanged', () => {
  const window = load();
  window.height = 624; window._allTextHeight = 1020;
  assert.equal(window.contentsHeight(), 1020);
  window._allTextHeight = 0;
  assert.equal(window.contentsHeight(), 588);
});

test('without YEP_QuestJournal nothing is wrapped', () => {
  const window = load(false);
  window.height = 624; window._allTextHeight = 10200;
  assert.equal(window.contentsHeight(), 10200);
});
