'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { install, stamp } = require('../../lib/pmjs-screenshot.js');

let failed = 0;
function is(desc, got, want) {
  got = JSON.stringify(got);
  want = JSON.stringify(want);
  if (got === want) { console.log('ok PMJS screenshots: ' + desc); return; }
  failed++;
  console.log('FAIL PMJS screenshots: ' + desc + ' (got ' + got + ', wanted ' + want + ')');
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tuxtavern-shots-'));
const shots = path.join(dir, 'Pictures');
const listeners = [], captures = [];
const w = {
  require,
  document: { addEventListener: (type, f) => { if (type === 'keydown') listeners.push(f); } },
  nw: { Window: { get: () => ({ capturePage: (callback, options) => captures.push({ callback, options }) }) } },
};
const press = (keyCode, repeat = false) => listeners.forEach(f => f({ keyCode, repeat }));
const logged = [];
const log = console.log;
console.log = text => (String(text).startsWith('tt:') ? logged.push(text) : log(text));
try {
  install(w, shots, 'Tux Quest');
  press(122); press(123, true);
  is('only a fresh F12 press captures', captures.length, 0);
  press(123); press(123);
  is('F12 asks NW.js for a PNG of the screen, once until it arrives', captures.map(c => c.options), [{ format: 'png', datatype: 'buffer' }]);
  captures.shift().callback(Buffer.from('png one'));
  const first = fs.readdirSync(shots);
  is('it is saved, named after the game and the time', first.length === 1 && /^Tux Quest-\d{8}-\d{6}\.png$/.test(first[0]), true);
  is('with the captured bytes', fs.readFileSync(path.join(shots, first[0]), 'utf8'), 'png one');
  is('saying where', logged.pop(), 'tt: screenshot saved to ' + path.join(shots, first[0]));
  // A shot in the same second as an earlier one gets its own name (this second or the next).
  fs.rmSync(path.join(shots, first[0]));
  const now = Date.now(), taken = [now, now + 1000].map(t => `Tux Quest-${stamp(new Date(t))}`);
  for (const name of taken) fs.writeFileSync(path.join(shots, name + '.png'), 'earlier');
  press(123);
  captures.shift().callback(Buffer.from('png two'));
  is('an earlier shot is never replaced', taken.map(n => fs.readFileSync(path.join(shots, n + '.png'), 'utf8')), ['earlier', 'earlier']);
  const second = fs.readdirSync(shots).filter(n => n.endsWith('-2.png'));
  is('the new one is kept beside it', second.length === 1 && fs.readFileSync(path.join(shots, second[0]), 'utf8'), 'png two');
  fs.rmSync(shots, { recursive: true });
  fs.writeFileSync(shots, 'a file, not a folder');
  press(123);
  captures.shift().callback(Buffer.from('png three'));
  is('a folder that cannot be made is reported, not thrown', /^tt: screenshot not saved: /.test(logged.pop()), true);
  is('the time stamp is local YYYYMMDD-HHMMSS', stamp(new Date(2026, 0, 2, 3, 4, 5)), '20260102-030405');
} finally {
  console.log = log;
  fs.rmSync(dir, { recursive: true, force: true });
}
process.exitCode = failed ? 1 : 0;
