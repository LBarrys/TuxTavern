'use strict';

// TuxTavern: the bootstrap runs as one script in the page, so its top-level names are globals a
// game's own top-level class or let cannot reuse. DC Quarantine's DK_Video_Player 1.3.3 declares
// class VideoElement, as NW.js (which has no such global) allows.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../js/pmjs-web/video-element.js'), 'utf8');

test('a game script can declare class VideoElement after the web layer loads', () => {
  const context = { NativeHost: { media: {} }, GenericElement: function() {}, EventTarget: { defineEventHandlerProperty() {} } };
  vm.createContext(context);
  vm.runInContext(source, context);
  assert.doesNotThrow(() => vm.runInContext('class VideoElement { static load() { return "game"; } }', context));
  assert.equal(vm.runInContext('VideoElement.load()', context), 'game');
  assert.equal(typeof context.PmjsVideoElement, 'function', 'PMJS keeps its own video element');
});
