'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { aplib, unpack, unzip } = require('../../lib/evb.js');

function pack(data) {
  const out = [data[0]];
  let tag = 0, n = 8;
  const bit = b => {
    if (n === 8) { tag = out.length; out.push(0); n = 0; }
    if (b) out[tag] |= 0x80 >> n;
    n++;
  };
  for (let k = 1; k < data.length; k++) { bit(0); out.push(data[k]); }
  bit(1); bit(1); bit(0); out.push(0);
  return Buffer.from(out);
}

function evb(root, legacy = false) {
  const table = [], blobs = [];
  const u32 = v => { const b = Buffer.alloc(4); b.writeUInt32LE(v); return b; };
  const entry = (count, name, type, rest) => {
    const body = Buffer.concat([Buffer.from(name + '\0', 'utf16le'), Buffer.from([type]), rest]);
    return Buffer.concat([u32(12 + body.length), Buffer.alloc(8), u32(count), body]);
  };
  const node = n => {
    const kids = n.children || [];
    const type = kids.length || !n.data ? 3 : 2;
    if (!legacy) table.push(u32(0), Buffer.alloc(8), u32(kids.length), Buffer.from(n.name + '\0', 'utf16le'), Buffer.from([type]));
    if (n.data) {
      let blob = n.data;
      if (n.chunks) {
        const chunks = n.chunks.map(c => (Buffer.isBuffer(c) && c.raw ? c : pack(c)));
        const sizes = chunks.map(c => c.length);
        const index = sizes.flatMap((s, k) => (k < sizes.length - 1 ? [u32(s), u32(0), u32(0)] : [u32(s)]));
        const block = 8 + 4 * index.length;
        blob = Buffer.concat([u32(block), u32(0), ...index, ...chunks]);
      }
      const opt = Buffer.alloc(legacy ? 49 : 53);
      opt.writeUInt32LE(n.data.length, 2);
      opt.writeUInt32LE(blob.length, legacy ? 41 : 49);
      if (legacy) table.push(entry(0, n.name, 2, Buffer.concat([Buffer.alloc(3), opt])), blob);
      else { table.push(opt); blobs.push(blob); }
    } else {
      table.push(legacy ? entry(kids.length, n.name, 3, Buffer.alloc(25)) : Buffer.alloc(25));
      kids.forEach(node);
    }
  };
  if (legacy) table.push(entry(1, '', 0, Buffer.alloc(25)));
  node(root);
  const t = Buffer.concat(table);
  const pe = Buffer.alloc(512);
  pe.write('MZ', 0);
  pe.write('.enigma1', 400);
  if (legacy) return Buffer.concat([pe, Buffer.from('EVB\0'), Buffer.alloc(60), t]);
  const main = Buffer.concat([u32(t.length + 11), Buffer.alloc(8), u32(1)]);
  return Buffer.concat([pe, Buffer.from('EVB\0'), Buffer.alloc(60), main.subarray(0, 15), t, ...blobs]);
}

const vector = Object.assign(Buffer.from('5400686520717569636bec620e726f776ece66ae7880 6a756d7073ede4766575726074 3f6c617a79ea64fe67c000'.replace(/ /g, ''), 'hex'), { raw: true });
const quick = Buffer.from('The quick brown fox jumps over the lazy dog');
const page = Buffer.from('<!doctype html>'.repeat(50));
const game = {
  name: '%DEFAULT FOLDER%',
  children: [
    { name: 'package.json', data: Buffer.from('{"main":"www/index.html"}') },
    { name: 'www', children: [
      { name: 'index.html', data: page, chunks: [page.subarray(0, 300), page.subarray(300)] },
      { name: 'js', children: [{ name: 'quick.txt', data: quick, chunks: [vector] }] },
      { name: 'セーブ.txt', data: Buffer.from('save') },
      { name: 'empty.txt', data: Buffer.alloc(0) },
    ] },
  ],
};

function zip(files, zip64 = false) {
  const locals = [], central = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.isBuffer(f.name) ? f.name : Buffer.from(f.name);
    const data = Buffer.from(f.data || '');
    const method = f.method ?? 8;
    const body = method === 8 ? zlib.deflateRawSync(data) : data;
    const flags = f.utf8 ? 0x800 : 0;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(flags, 6); lh.writeUInt16LE(method, 8); lh.writeUInt32LE(zlib.crc32(data), 14);
    lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(f.usize ?? data.length, 22); lh.writeUInt16LE(name.length, 26);
    locals.push(lh, name, body);
    const extra = Buffer.alloc(zip64 ? 28 : 0);
    if (zip64) {
      extra.writeUInt16LE(1, 0); extra.writeUInt16LE(24, 2);
      extra.writeBigUInt64LE(BigInt(f.usize ?? data.length), 4); extra.writeBigUInt64LE(BigInt(body.length), 12); extra.writeBigUInt64LE(BigInt(offset), 20);
    }
    const big = v => (zip64 ? 0xffffffff : v);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(flags, 8); ch.writeUInt16LE(method, 10); ch.writeUInt32LE(f.crc ?? zlib.crc32(data), 16);
    ch.writeUInt32LE(big(body.length), 20); ch.writeUInt32LE(big(f.usize ?? data.length), 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt16LE(extra.length, 30); ch.writeUInt32LE(big(offset), 42);
    central.push(ch, name, extra);
    offset += 30 + name.length + body.length;
  }
  const cd = Buffer.concat(central);
  const tail = [];
  if (zip64) {
    const e64 = Buffer.alloc(56);
    e64.writeUInt32LE(0x06064b50, 0); e64.writeBigUInt64LE(44n, 4);
    e64.writeBigUInt64LE(BigInt(files.length), 24); e64.writeBigUInt64LE(BigInt(files.length), 32);
    e64.writeBigUInt64LE(BigInt(cd.length), 40); e64.writeBigUInt64LE(BigInt(offset), 48);
    const loc = Buffer.alloc(20);
    loc.writeUInt32LE(0x07064b50, 0); loc.writeBigUInt64LE(BigInt(offset + cd.length), 8); loc.writeUInt32LE(1, 16);
    tail.push(e64, loc);
  }
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(zip64 ? 0xffff : files.length, 8); end.writeUInt16LE(zip64 ? 0xffff : files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(zip64 ? 0xffffffff : offset, 16);
  return Buffer.concat([...locals, cd, ...tail, end]);
}

module.exports = { evb, game, zip };

if (require.main === module) (async () => {
  let failed = 0;
  const is = (desc, got, want) => {
    if (got === want) { console.log('ok ' + desc); return; }
    failed++;
    console.log('FAIL ' + desc + ' (got ' + JSON.stringify(got) + ', wanted ' + JSON.stringify(want) + ')');
  };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tuxtavern-evb-'));
  const read = p => { try { return fs.readFileSync(path.join(tmp, 'out', p), 'utf8'); } catch { return null; } };

  is('aPLib decodes its reference vector', aplib(vector).toString(), quick.toString());
  is('aPLib round-trips literal data', aplib(pack(page)).toString(), page.toString());

  fs.writeFileSync(path.join(tmp, 'Game.exe'), evb(game));
  try { unpack(path.join(tmp, 'Game.exe'), path.join(tmp, 'out')); } catch (e) { console.log('FAIL unpack threw: ' + e.message); failed++; }
  is('a stored file is extracted at the root', read('package.json'), '{"main":"www/index.html"}');
  is('a file compressed in two chunks is extracted', read('www/index.html'), page.toString());
  is('a nested compressed file is extracted', read('www/js/quick.txt'), quick.toString());
  is('UTF-16 names survive', read('www/セーブ.txt'), 'save');
  is('an empty file is extracted', read('www/empty.txt'), '');

  fs.writeFileSync(path.join(tmp, 'Old.exe'), evb(game, true));
  try { unpack(path.join(tmp, 'Old.exe'), path.join(tmp, 'old')); } catch (e) { console.log('FAIL old layout threw: ' + e.message); failed++; }
  const old = f => { try { return fs.readFileSync(path.join(tmp, 'old', f), 'utf8'); } catch { return null; } };
  is('old layout: a stored file is extracted', old('package.json'), '{"main":"www/index.html"}');
  is('old layout: compressed files are extracted', old('www/index.html') + old('www/js/quick.txt'), page.toString() + quick.toString());
  is('old layout: UTF-16 names and empty files survive', old('www/セーブ.txt') + old('www/empty.txt'), 'save');
  const cut = evb(game, true);
  fs.writeFileSync(path.join(tmp, 'Cut.exe'), cut.subarray(0, cut.length - 40));
  let cutMsg = '';
  try { unpack(path.join(tmp, 'Cut.exe'), path.join(tmp, 'cut')); } catch (e) { cutMsg = e.message; }
  is('a truncated archive is refused before anything is written', cutMsg !== '' && !fs.existsSync(path.join(tmp, 'cut')), true);

  const evil = { name: '%DEFAULT FOLDER%', children: [{ name: '..', children: [{ name: 'x', data: Buffer.from('x') }] }] };
  fs.writeFileSync(path.join(tmp, 'Evil.exe'), evb(evil));
  let msg = '';
  try { unpack(path.join(tmp, 'Evil.exe'), path.join(tmp, 'evil')); } catch (e) { msg = e.message; }
  is('a .. entry is refused', /bad name/.test(msg), true);

  fs.writeFileSync(path.join(tmp, 'Plain.exe'), Buffer.alloc(4096));
  msg = '';
  try { unpack(path.join(tmp, 'Plain.exe'), path.join(tmp, 'plain')); } catch (e) { msg = e.message; }
  is('an unpacked .exe is refused', /not packed/.test(msg), true);

  const nw = [
    { name: 'www/', method: 0 },
    { name: 'package.json', data: '{"main":"www/index.html"}' },
    { name: 'www/index.html', data: '<!doctype html>'.repeat(40), method: 0 },
    { name: 'www/img/セーブ.png', data: 'png', utf8: true },
    { name: Buffer.from('8c8892e82e6f6767', 'hex'), data: 'ogg' },
  ];
  for (const zip64 of [false, true]) {
    const label = zip64 ? 'ZIP64: ' : 'zip: ';
    const out = path.join(tmp, `nw${zip64}`);
    fs.writeFileSync(out + '.nw', zip(nw, zip64));
    try { await unzip(out + '.nw', out); } catch (e) { console.log('FAIL unzip threw: ' + e.message); failed++; }
    const get = p => { try { return fs.readFileSync(path.join(out, p), 'utf8'); } catch { return null; } };
    is(label + 'a deflated file is extracted', get('package.json'), '{"main":"www/index.html"}');
    is(label + 'a stored file is extracted', get('www/index.html'), '<!doctype html>'.repeat(40));
    is(label + 'a UTF-8-flagged name is kept', get('www/img/セーブ.png'), 'png');
    is(label + 'an unflagged Shift-JIS name is decoded', get('決定.ogg'), 'ogg');
  }
  const refused = async (desc, files, pattern) => {
    fs.writeFileSync(path.join(tmp, 'bad.nw'), zip(files));
    let msg = '';
    try { await unzip(path.join(tmp, 'bad.nw'), path.join(tmp, 'bad')); } catch (e) { msg = e.message; }
    is(desc, pattern.test(msg), true);
  };
  await refused('zip: a path out of the folder is refused', [{ name: '../escape.txt', data: 'x' }], /outside/);
  await refused('zip: an unsupported compression method is refused', [{ name: 'a.txt', data: 'x', method: 12 }], /method 12/);
  await refused('zip: a damaged file is reported', [{ name: 'a.txt', data: 'abc', usize: 5 }], /damaged/);
  await refused('zip: a corrupted file is reported', [{ name: 'a.txt', data: 'abc', crc: 1 }], /damaged/);
  is('zip: nothing escaped the folder', fs.existsSync(path.join(tmp, 'escape.txt')), false);

  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
})();
