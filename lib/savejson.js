'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const ci = require('./ci');

function lzstring(save) {
  let dir = path.dirname(path.resolve(save));
  for (let k = 0; k < 5; k++, dir = path.dirname(dir)) {
    for (const rel of ['js/libs/lz-string.js', 'www/js/libs/lz-string.js']) {
      const f = ci.resolve(path.join(dir, rel));
      if (f) return require(f);
    }
  }
  throw new Error(`${save} is not an MZ save, and no js/libs/lz-string.js was found above it to read it as MV`);
}

function decode(save) {
  const raw = fs.readFileSync(save);
  try { return { json: zlib.inflateSync(raw).toString(), format: 'zlib' }; } catch {}
  const text = raw.toString('utf8');
  try { return { json: zlib.inflateSync(Buffer.from(text, 'latin1')).toString(), format: 'zlib-utf8' }; } catch {}
  if (/^\s*[{[]/.test(text)) return { json: text, format: 'json' };
  const json = lzstring(save).decompressFromBase64(text.trim());
  if (!json) throw new Error(`${save} is not an RPG Maker MV/MZ save`);
  return { json, format: 'lz' };
}

function encode(save, json, format) {
  if (format === 'json') return json;
  if (format === 'lz') return lzstring(save).compressToBase64(json);
  const z = zlib.deflateSync(json, { level: 1 });
  return format === 'zlib' ? z : Buffer.from(z.toString('latin1'), 'utf8');
}

function toJson(save, out) {
  fs.writeFileSync(out, JSON.stringify(JSON.parse(decode(save).json), null, 2) + '\n');
}

function fromJson(file, save) {
  const json = JSON.stringify(JSON.parse(fs.readFileSync(file, 'utf8')));
  const data = encode(save, json, decode(save).format);
  if (!fs.existsSync(save + '.bak')) fs.copyFileSync(save, save + '.bak');
  fs.writeFileSync(save, data);
}

module.exports = { decode, encode, toJson, fromJson };

if (require.main === module) {
  const [cmd, a, b] = process.argv.slice(2);
  try {
    if (cmd === 'decode') toJson(a, b);
    else if (cmd === 'encode') fromJson(a, b);
    else throw new Error('usage: savejson.js decode SAVE OUT.json | encode IN.json SAVE');
  } catch (e) { console.error(`tuxtavern: ${e.message}`); process.exit(1); }
}
