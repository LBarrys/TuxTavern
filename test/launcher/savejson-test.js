'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { decode, toJson, fromJson } = require('../../lib/savejson.js');

let failed = 0;
function is(desc, got, want) {
  if (got === want) { console.log('ok ' + desc); return; }
  failed++;
  console.log('FAIL ' + desc + ' (got ' + JSON.stringify(got) + ', wanted ' + JSON.stringify(want) + ')');
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tuxtavern-save-'));
const json = JSON.stringify({ party: { _gold: 100 }, actors: { _data: [null, { _name: 'ハロルド' }] } });
const file = (rel, data) => {
  const p = path.join(root, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, data);
  return p;
};
const edit = (save, gold) => {
  toJson(save, save + '.json');
  const obj = JSON.parse(fs.readFileSync(save + '.json', 'utf8'));
  obj.party._gold = gold;
  fs.writeFileSync(save + '.json', JSON.stringify(obj, null, 2));
  fromJson(save + '.json', save);
  return JSON.parse(decode(save).json);
};

const z = zlib.deflateSync(json, { level: 1 });
const mz = file('mz/save/file1.rmmzsave', z.toString('latin1'));
is('an MZ save (zlib written as text) is read', decode(mz).format, 'zlib-utf8');
is('with its contents', decode(mz).json, json);
is('an edit is written back', edit(mz, 777).party._gold, 777);
is('in the same format', decode(mz).format, 'zlib-utf8');
is('UTF-8 text survives', JSON.parse(decode(mz).json).actors._data[1]._name, 'ハロルド');
is('the original is kept as .bak', decode(mz + '.bak').json, json);
edit(mz, 888);
is('a second edit keeps the first original', JSON.parse(decode(mz + '.bak').json).party._gold, 100);

const raw = file('raw/save/file1.rpgsave', z);
is('a zlib save written as bytes is read', decode(raw).format, 'zlib');
is('and written back as bytes', edit(raw, 5).party._gold, 5);

const plain = file('plain/save.json', json);
is('a plain JSON save is read', decode(plain).format, 'json');

file('mv/www/Js/Libs/LZ-String.js', `module.exports = {
  compressToBase64: s => 'LZ' + Buffer.from(s).toString('base64'),
  decompressFromBase64: s => (s.startsWith('LZ') ? Buffer.from(s.slice(2), 'base64').toString() : null) };`);
const mv = file('mv/www/save/file1.rpgsave', 'LZ' + Buffer.from(json).toString('base64'));
is("an MV save is read with the game's own lz-string, found case-insensitively", decode(mv).format, 'lz');
is('and written back with it', edit(mv, 9).party._gold, 9);
is('as lz-string text', fs.readFileSync(mv, 'utf8').startsWith('LZ'), true);

const lonely = file('nolib/file1.rpgsave', 'N4IgdghgtgpiBcIDKA');
let msg = '';
try { decode(lonely); } catch (e) { msg = e.message; }
is('an MV save with no lz-string near it is refused clearly', /no js\/libs\/lz-string.js/.test(msg), true);

const before = fs.readFileSync(mz);
fs.writeFileSync(mz + '.json', '{ broken');
msg = '';
try { fromJson(mz + '.json', mz); } catch (e) { msg = e.message; }
is('invalid JSON is refused', msg !== '', true);
is('and the save is left untouched', Buffer.compare(fs.readFileSync(mz), before), 0);

fs.rmSync(root, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
