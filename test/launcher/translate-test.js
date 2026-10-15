'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { read, translator, machine, sync, install } = require('../../lib/translate.js');

let failed = 0;
function is(desc, got, want) {
  got = JSON.stringify(got);
  want = JSON.stringify(want);
  if (got === want) { console.log('ok ' + desc); return; }
  failed++;
  console.log('FAIL ' + desc + ' (got ' + got + ', wanted ' + want + ')');
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tuxtavern-translate-'));
const file = path.join(dir, 'ja-en.json');
const disk = () => JSON.parse(fs.readFileSync(file, 'utf8'));

is('a missing file is an empty dictionary', Object.keys(read(file)), []);
fs.writeFileSync(file, '﻿{"__proto__": "x", "はい": "Yes"}');
is('a BOM and odd keys are read safely', [read(file).はい, read(file)['__proto__']], ['Yes', 'x']);
for (const [bad, why] of [['[1]', 'an array'], ['{"a": 1}', 'a number'], ['{"a": ', 'broken JSON']]) {
  fs.writeFileSync(file, bad);
  let threw = false;
  try { read(file); } catch { threw = true; }
  is(`${why} is refused`, threw, true);
}

const t = translator(Object.assign(Object.create(null), { はい: 'Yes', いいえ: '' }));
is('known text is translated', t.tr('はい'), 'Yes');
is('an empty translation shows the original', t.tr('いいえ'), 'いいえ');
is('new text is shown as is', t.tr('こんにちは'), 'こんにちは');
t.tr('Yes'); t.tr('7'); t.tr('99/99'); t.tr('A');
is('only new text with letters is recorded, never a translation', t.fresh, ['こんにちは']);

fs.writeFileSync(file, '{\n  "はい": "Yes"\n}\n');
const live = translator(read(file));
const state = { mtime: 0 };
live.tr('はい'); live.tr('おはよう');
sync(file, live, state);
is('new text is written with an empty translation', disk(), { はい: 'Yes', おはよう: '' });
fs.writeFileSync(file, '{"はい": "Yes", "おはよう": "Good morning"}');
fs.utimesSync(file, new Date(), new Date(Date.now() + 5000));
sync(file, live, state);
is('a translation added while playing is picked up', live.tr('おはよう'), 'Good morning');
fs.writeFileSync(file, '{"はい": "Yes", oops');
live.tr('さようなら');
sync(file, live, state);
is('a file broken while playing is never overwritten', fs.readFileSync(file, 'utf8'), '{"はい": "Yes", oops');
fs.writeFileSync(file, '{"はい": "Yes"}');
sync(file, live, state);
is('and text seen meanwhile is written once it is fixed', disk(), { はい: 'Yes', さようなら: '' });

fs.writeFileSync(file, '{"こんにちは": "Hello", "勇者": "Hero"}');
const drawn = [];
class Bitmap { drawText(text) { drawn.push(text); } }
class Window_Base {
  convertEscapeCharacters(text) { return text.replace(/\\N/, '!'); }
  processCharacter(c) { this.contents.drawText(c); }
  flushTextState(s) { this.contents.drawText(s); }
}
const w = { Bitmap, Window_Base, setInterval() {}, addEventListener() {} };
const hooked = install(w, file);
const win = Object.assign(new Window_Base(), { contents: new Bitmap() });
is('messages are translated before escape codes are converted', win.convertEscapeCharacters('こんにちは'), 'Hello');
win.contents.drawText('勇者');
win.processCharacter('こ');
win.flushTextState('Hello world');
win.contents.drawText(120);
is('names are translated; message pieces and numbers are drawn as they are', drawn, ['Hero', 'こ', 'Hello world', 120]);
hooked.flush();
is('message pieces are not recorded as new text', Object.keys(disk()), ['こんにちは', '勇者']);

const until = async ok => { for (let i = 0; i < 500 && !ok(); i++) await new Promise(r => setTimeout(r, 10)); };
(async () => {
  fs.writeFileSync(file, '{"はい": "Yes", "いいえ": ""}');
  const mt = machine("sed 's/^/EN:/'");
  const m = translator(read(file));
  const st = { mtime: 0 };
  m.tr('こんにちは'); m.tr('勇者');
  sync(file, m, st, mt);
  await until(() => mt.done.length === 3);
  fs.writeFileSync(file, '{"はい": "Yes", "いいえ": "", "こんにちは": "", "勇者": "Hero"}');
  fs.utimesSync(file, new Date(), new Date(Date.now() + 5000));
  sync(file, m, st, mt);
  is('empty entries are filled in by the command; a translation typed meanwhile wins', disk(), { はい: 'Yes', いいえ: 'EN:いいえ', こんにちは: 'EN:こんにちは', 勇者: 'Hero' });
  is('and shown right away', [m.tr('こんにちは'), m.tr('勇者')], ['EN:こんにちは', 'Hero']);
  is('and not recorded as new text', m.fresh, []);
  m.tr('さようなら');
  sync(file, m, st, mt);
  await until(() => mt.done.length === 1);
  sync(file, m, st, mt);
  is('new text seen later is filled in too', disk().さようなら, 'EN:さようなら');

  const errors = [], error = console.error;
  console.error = e => errors.push(e);
  const bad = machine('echo no network >&2; exit 3');
  bad.want({ a: '', b: '' });
  await until(() => errors.length);
  await new Promise(r => setTimeout(r, 100));
  console.error = error;
  is('a failing command stops machine translation once, saying why', errors, ['tuxtavern: machine translation stopped: no network']);
  is('and fills in nothing', bad.done, []);

  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
})();
