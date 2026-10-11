'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('a Pixi 4 deprecation prints once, other console groups as usual', () => {
  const lines = [];
  const record = kind => (...args) => lines.push(kind + ' ' + args.join(' '));
  const console = { groupCollapsed: record('group'), warn: record('warn'), groupEnd: record('end') };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../js/pmjs-pixi4/deprecations.js'), 'utf8'), { console });
  // The shape of Pixi 4.5's deprecation warn().
  const deprecate = message => {
    console.groupCollapsed('%cDeprecation Warning: %c%s', 'color', 'font', message);
    console.warn('at Lightmask.initialize');
    console.groupEnd();
  };
  deprecate('DisplayObjectContainer has been shortened to Container');
  deprecate('DisplayObjectContainer has been shortened to Container');
  console.warn('plugin warning');
  deprecate('SpriteBatch does not exist any more');
  console.groupCollapsed('other');
  console.groupEnd();
  assert.deepEqual(lines, [
    'group %cDeprecation Warning: %c%s color font DisplayObjectContainer has been shortened to Container',
    'warn at Lightmask.initialize', 'end ',
    'warn plugin warning',
    'group %cDeprecation Warning: %c%s color font SpriteBatch does not exist any more',
    'warn at Lightmask.initialize', 'end ',
    'group other', 'end ',
  ]);
});
