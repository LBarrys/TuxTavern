// Subset licensed DejaVu Sans for shaping tests; requires hb-subset (HarfBuzz utilities):
//   node tools/unicode/generate-text-test-font.mjs /usr/share/fonts/truetype/dejavu/DejaVuSans.ttf
// The committed font came from fontTools. This one has the same glyphs, cmaps, names and
// shaping but other bytes: after regenerating, update fontSha256 in
// test/assets/reference/text-layout.json, whose Chromium metrics it then still meets.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const source = process.argv[2];
if (createHash('sha256').update(fs.readFileSync(source)).digest('hex') !==
    'ae7b7855e115a5966d8b1b3f80f254ccc117ec86f9965e202ee2940453837280') {
  console.error('Expected the pinned DejaVu Sans 2.37 source font');
  process.exit(1);
}
const unicodes = [];
for (let code = 0x20; code < 0x7f; code++) unicodes.push(code);
unicodes.push(0xe9, 0x301, 0x323, 0x2665, 0x2764);
for (let code = 0x600; code < 0x700; code++) unicodes.push(code);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'pmjs-font-'));
const subset = path.join(temporary, 'subset.ttf');
execFileSync('hb-subset', ['--font-file=' + source, '--output-file=' + subset,
  '--unicodes=' + unicodes.map(code => code.toString(16)).join(','),
  '--name-IDs=*', '--name-legacy', '--name-languages=*', '--notdef-outline'], { stdio: 'inherit' });
const font = fs.readFileSync(subset);
fs.rmSync(temporary, { recursive: true });

const tables = new Map();
for (let index = 0; index < font.readUInt16BE(4); index++) {
  const record = 12 + index * 16;
  const offset = font.readUInt32BE(record + 8);
  tables.set(font.toString('latin1', record, record + 4),
    Buffer.from(font.subarray(offset, offset + font.readUInt32BE(record + 12))));
}

// The glyph a format 4 (Windows Unicode BMP) subtable maps a code point to.
function glyphFor(cmap, codepoint) {
  for (let index = 0; index < cmap.readUInt16BE(2); index++) {
    const offset = cmap.readUInt32BE(4 + index * 8 + 4);
    if (cmap.readUInt16BE(4 + index * 8) !== 3 || cmap.readUInt16BE(offset) !== 4) continue;
    const segments = cmap.readUInt16BE(offset + 6) / 2;
    const ends = offset + 14, starts = ends + segments * 2 + 2;
    const deltas = starts + segments * 2, ranges = deltas + segments * 2;
    for (let segment = 0; segment < segments; segment++) {
      const end = cmap.readUInt16BE(ends + segment * 2), start = cmap.readUInt16BE(starts + segment * 2);
      if (codepoint < start || codepoint > end) continue;
      const delta = cmap.readUInt16BE(deltas + segment * 2), range = cmap.readUInt16BE(ranges + segment * 2);
      if (!range) return (codepoint + delta) & 0xffff;
      const glyph = cmap.readUInt16BE(ranges + segment * 2 + range + (codepoint - start) * 2);
      return glyph && (glyph + delta) & 0xffff;
    }
  }
  throw new Error('no glyph for U+' + codepoint.toString(16));
}

// A synthetic alternate verifies selectors affect shaping without OS emoji fallback:
// U+2764 U+FE0F draws U+2665's heart through a format 14 subtable (Unicode, encoding 5).
const cmap = tables.get('cmap');
const variation = Buffer.alloc(10 + 11 + 4 + 5);
variation.writeUInt16BE(14, 0); variation.writeUInt32BE(variation.length, 2);
variation.writeUInt32BE(1, 6);
variation.writeUIntBE(0xfe0f, 10, 3); variation.writeUInt32BE(0, 13); variation.writeUInt32BE(21, 17);
variation.writeUInt32BE(1, 21); variation.writeUIntBE(0x2764, 25, 3);
variation.writeUInt16BE(glyphFor(cmap, 0x2665), 28);
const records = [];
for (let index = 0; index < cmap.readUInt16BE(2); index++) {
  const record = 4 + index * 8, offset = cmap.readUInt32BE(record + 4);
  const length = cmap.readUInt16BE(offset) >= 8 ? cmap.readUInt32BE(offset + 2) : cmap.readUInt16BE(offset + 2);
  records.push([cmap.readUInt16BE(record), cmap.readUInt16BE(record + 2), cmap.subarray(offset, offset + length)]);
}
records.push([0, 5, variation]);
records.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
const cmapHeader = Buffer.alloc(4 + records.length * 8);
cmapHeader.writeUInt16BE(records.length, 2);
let cmapOffset = cmapHeader.length;
records.forEach(([platform, encoding, data], index) => {
  cmapHeader.writeUInt16BE(platform, 4 + index * 8); cmapHeader.writeUInt16BE(encoding, 6 + index * 8);
  cmapHeader.writeUInt32BE(cmapOffset, 8 + index * 8); cmapOffset += data.length;
});
tables.set('cmap', Buffer.concat([cmapHeader, ...records.map(record => record[2])]));

// Family, style, full and PostScript names identify the test font, not DejaVu Sans.
const name = tables.get('name');
const nameCount = name.readUInt16BE(2), storage = name.readUInt16BE(4);
const strings = [], nameRecords = [];
for (let index = 0; index < nameCount; index++) {
  const record = 6 + index * 12;
  const [platform, encoding, language, id] = [0, 2, 4, 6].map(at => name.readUInt16BE(record + at));
  let text = name.subarray(storage + name.readUInt16BE(record + 10),
    storage + name.readUInt16BE(record + 10) + name.readUInt16BE(record + 8));
  if ([1, 2, 3, 4, 6, 16, 17].includes(id)) {
    const value = id === 2 || id === 17 ? 'Regular' : 'PMJS Text Test';
    text = platform === 1 ? Buffer.from(value, 'latin1') : Buffer.from(value, 'utf16le').swap16();
  }
  nameRecords.push([platform, encoding, language, id, text]);
}
const nameHeader = Buffer.alloc(6 + nameRecords.length * 12);
nameHeader.writeUInt16BE(nameRecords.length, 2); nameHeader.writeUInt16BE(nameHeader.length, 4);
let nameOffset = 0;
nameRecords.forEach(([platform, encoding, language, id, text], index) => {
  [platform, encoding, language, id, text.length, nameOffset].forEach((value, field) =>
    nameHeader.writeUInt16BE(value, 6 + index * 12 + field * 2));
  strings.push(text); nameOffset += text.length;
});
tables.set('name', Buffer.concat([nameHeader, ...strings]));

// The bounding box of the glyphs kept, as the font had before hb-subset kept DejaVu's.
const head = tables.get('head'), loca = tables.get('loca'), glyf = tables.get('glyf');
const longOffsets = head.readInt16BE(50) === 1;
const box = [Infinity, Infinity, -Infinity, -Infinity];
for (let glyph = 0; glyph < tables.get('maxp').readUInt16BE(4); glyph++) {
  const at = longOffsets ? loca.readUInt32BE(glyph * 4) : loca.readUInt16BE(glyph * 2) * 2;
  const next = longOffsets ? loca.readUInt32BE(glyph * 4 + 4) : loca.readUInt16BE(glyph * 2 + 2) * 2;
  if (next === at) continue;
  for (let field = 0; field < 4; field++) {
    const value = glyf.readInt16BE(at + 2 + field * 2);
    box[field] = field < 2 ? Math.min(box[field], value) : Math.max(box[field], value);
  }
}
box.forEach((value, field) => head.writeInt16BE(value, 36 + field * 2));

// Reassemble with four-byte table alignment, table checksums and head's whole-font adjustment.
const checksum = data => {
  let sum = 0;
  const padded = Buffer.concat([data, Buffer.alloc((4 - data.length % 4) % 4)]);
  for (let at = 0; at < padded.length; at += 4) sum = (sum + padded.readUInt32BE(at)) >>> 0;
  return sum;
};
tables.get('head').writeUInt32BE(0, 8);
const tags = [...tables.keys()].sort();
const header = Buffer.alloc(12 + tags.length * 16);
header.writeUInt32BE(0x00010000, 0); header.writeUInt16BE(tags.length, 4);
const power = 2 ** Math.floor(Math.log2(tags.length));
header.writeUInt16BE(power * 16, 6); header.writeUInt16BE(Math.log2(power), 8);
header.writeUInt16BE(tags.length * 16 - power * 16, 10);
const bodies = [];
let offset = header.length;
tags.forEach((tag, index) => {
  const data = tables.get(tag);
  header.write(tag, 12 + index * 16, 'latin1');
  header.writeUInt32BE(checksum(data), 16 + index * 16);
  header.writeUInt32BE(offset, 20 + index * 16); header.writeUInt32BE(data.length, 24 + index * 16);
  const padded = Buffer.concat([data, Buffer.alloc((4 - data.length % 4) % 4)]);
  bodies.push(padded); offset += padded.length;
});
const output = Buffer.concat([header, ...bodies]);
const headOffset = header.readUInt32BE(20 + tags.indexOf('head') * 16);
output.writeUInt32BE((0xb1b0afba - checksum(output)) >>> 0, headOffset + 8);
fs.writeFileSync(new URL('../../test/assets/text-shaping.ttf', import.meta.url), output);
