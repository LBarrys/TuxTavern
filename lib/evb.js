'use strict';
// The Enigma part is ported from evbunpack by mos9527 (Apache-2.0, https://github.com/mos9527/evbunpack)
// and the aPLib decompressor in aplib by Sandor Nemes (GPL-3.0, https://github.com/snemes/aplib), with changes.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');

function aplib(src) {
  if (src.length >= 24 && src.toString('latin1', 0, 4) === 'AP32') {
    src = src.subarray(src.readUInt32LE(4), src.readUInt32LE(4) + src.readUInt32LE(8));
  }
  const n = src.length;
  let out = Buffer.allocUnsafe(Math.max(256, n * 4)), o = 0;
  const room = len => {
    if (o + len <= out.length) return;
    const bigger = Buffer.allocUnsafe(Math.max(out.length * 2, o + len));
    out.copy(bigger, 0, 0, o);
    out = bigger;
  };
  let i = 0, tag = 0, bits = 0;
  const byte = () => { if (i >= n) throw new Error('end'); return src[i++]; };
  const bit = () => {
    if (--bits < 0) { tag = byte(); bits = 7; }
    const b = (tag >> 7) & 1;
    tag = (tag << 1) & 0xff;
    return b;
  };
  const gamma = () => { let r = 1; do r = (r << 1) + bit(); while (bit()); return r; };
  const copy = (offs, len) => {
    if (len <= 0) return;
    const j = offs > 0 ? o - offs : -offs;
    if (j < 0 || j >= o) throw new Error('offset');
    room(len);
    if (offs > 0) for (let k = 0; k < len; k++) out[o + k] = out[j + k];
    else out.fill(out[j], o, o + len);
    o += len;
  };
  try {
    let r0 = -1, lwm = 0;
    const first = byte();
    room(1);
    out[o++] = first;
    for (;;) {
      if (!bit()) {
        if (i < n) { room(1); out[o++] = src[i++]; }
        lwm = 0;
      } else if (!bit()) {
        let offs = gamma();
        if (!lwm && offs === 2) copy(r0, gamma());
        else {
          offs = ((offs - (lwm ? 2 : 3)) << 8) + byte();
          let len = gamma();
          if (offs >= 32000) len++;
          if (offs >= 1280) len++;
          if (offs < 128) len += 2;
          copy(offs, len);
          r0 = offs;
        }
        lwm = 1;
      } else if (!bit()) {
        const b = byte();
        if (!(b >> 1)) break;
        copy(b >> 1, 2 + (b & 1));
        r0 = b >> 1;
        lwm = 1;
      } else {
        let offs = 0;
        for (let k = 0; k < 4; k++) offs = (offs << 1) + bit();
        if (offs) copy(offs, 1);
        else { room(1); out[o++] = 0; }
        lwm = 0;
      }
    }
  } catch {}
  return out.subarray(0, o);
}

function reader(fd) {
  let buf = Buffer.allocUnsafe(1 << 20), base = 0, len = 0;
  return (pos, n) => {
    if (pos < base || pos + n > base + len) {
      if (n > buf.length) buf = Buffer.allocUnsafe(n);
      base = pos;
      len = fs.readSync(fd, buf, 0, buf.length, pos);
    }
    return buf.subarray(pos - base, Math.max(pos - base, Math.min(pos - base + n, len)));
  };
}

function table(read, size, magic, legacy) {
  const nodes = [];
  let max = 0, seen = 0, pos, data;
  if (legacy) pos = magic + 64;
  else {
    const main = read(magic + 64, 16);
    nodes.push({ type: 0, count: main.readUInt32LE(12) });
    data = magic + 80 + main.readUInt32LE(0) - 12;
    pos = magic + 79;
  }
  for (;;) {
    const head = read(pos, 16);
    if (head.length < 16) break;
    const length = head.readUInt32LE(0), count = head.readUInt32LE(12);
    let end = pos + 16;
    const limit = Math.min(size, end + 1024);
    while (end + 1 < limit) { const p = read(end, 2); if (!p[0] && !p[1]) break; end += 2; }
    if (end + 1 >= limit) break;
    const node = { name: read(pos + 16, end - pos - 16).toString('utf16le'), type: read(end + 2, 1)[0], count };
    const next = pos + length + 4;
    end += 3;
    if (legacy && next < end + (node.type === 2 ? 49 : 0)) break;
    if (node.type === 2) {
      const opt = legacy ? read(next - 49, 49) : read(end, 53);
      node.original = opt.readUInt32LE(2);
      node.stored = opt.readUInt32LE(legacy ? 41 : 49);
      node.offset = legacy ? next : data;
      if (legacy) pos = next + node.stored;
      else { data += node.stored; pos = end + 53; }
      seen++;
    } else if (node.type === 3) {
      pos = legacy ? next : end + 25;
      max += node.count;
      seen++;
    } else if (node.type === 0 && legacy && !nodes.length) pos = next;
    else break;
    nodes.push(node);
    if (seen > max && max > 0) break;
  }
  return nodes;
}

function plan(nodes, size) {
  const items = [];
  let next = 1;
  const walk = dir => {
    const n = nodes[next++];
    if (!n || n.type === 0) throw new Error('the file table is cut short');
    const name = n.type === 3 && n.name === '%DEFAULT FOLDER%' ? '' : n.name;
    if (/[\\/:\0]/.test(name) || name === '.' || name === '..') throw new Error(`bad name in file table: ${name}`);
    const p = path.join(dir, name);
    if (n.type === 2 && n.offset + n.stored > size) throw new Error(`${p} lies past the end of the file`);
    items.push([p, n]);
    if (n.type === 3) for (let k = 0; k < n.count; k++) walk(p);
  };
  if (!nodes[0] || nodes[0].type !== 0) throw new Error('no file table');
  for (let k = 0; k < nodes[0].count; k++) walk('');
  return items;
}

function unpack(exe, dest) {
  const fd = fs.openSync(exe, 'r');
  const size = fs.fstatSync(fd).size;
  const read = reader(fd);

  let magic = -1;
  for (let pos = 0; pos < size && magic < 0; pos += 1 << 20) {
    const i = read(pos, (1 << 20) + 3).indexOf('EVB\0', 0, 'latin1');
    if (i >= 0) magic = pos + i;
  }
  if (magic < 0) { fs.closeSync(fd); throw new Error(`${exe} is not packed with Enigma Virtual Box`); }

  let items;
  try { items = plan(table(read, size, magic, false), size); } catch (e) {
    try { items = plan(table(read, size, magic, true), size); } catch { fs.closeSync(fd); throw e; }
  }

  const copy = Buffer.allocUnsafe(1 << 20);
  const write = (file, n) => {
    const out = fs.openSync(file, 'w');
    try {
      if (n.original === n.stored) {
        for (let done = 0; done < n.stored;) {
          const got = fs.readSync(fd, copy, 0, Math.min(copy.length, n.stored - done), n.offset + done);
          if (!got) break;
          fs.writeSync(out, copy, 0, got);
          done += got;
        }
        return;
      }
      const block = read(n.offset, 4).readUInt32LE(0);
      const index = Buffer.from(read(n.offset + 8, block - 8));
      let at = n.offset + block, left = n.stored - block, total = 0;
      for (let k = 0; left > 0; k += 12) {
        const chunk = read(at, Math.min(k + 4 <= index.length ? index.readUInt32LE(k) : 65536, left));
        if (!chunk.length) break;
        at += chunk.length;
        left -= chunk.length;
        total += fs.writeSync(out, aplib(chunk));
      }
      if (total !== n.original) throw new Error(`${file}: unpacked ${total} bytes, expected ${n.original}`);
    } finally { fs.closeSync(out); }
  };

  try {
    fs.mkdirSync(dest, { recursive: true });
    for (const [p, n] of items) {
      if (n.type === 3) fs.mkdirSync(path.join(dest, p), { recursive: true });
      else write(path.join(dest, p), n);
    }
  } finally { fs.closeSync(fd); }
}

function zipName(bytes, utf8) {
  if (utf8) return bytes.toString('utf8');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch {}
  try { return new TextDecoder('shift_jis').decode(bytes); } catch {
    throw new Error('this archive has Shift-JIS file names, and this Node.js cannot decode them: apk add icu-data-full');
  }
}

async function unzip(file, dest) {
  const fd = fs.openSync(file, 'r');
  const read = reader(fd);
  const list = [];
  try {
    const size = fs.fstatSync(fd).size;
    const tail = Buffer.from(read(Math.max(0, size - 65557), Math.min(size, 65557)));
    const end = tail.lastIndexOf(Buffer.from('PK\x05\x06', 'latin1'));
    if (end < 0) throw new Error(`${file} is not a zip archive`);
    let count = tail.readUInt16LE(end + 10), dirSize = tail.readUInt32LE(end + 12), pos = tail.readUInt32LE(end + 16);
    if (pos === 0xffffffff || count === 0xffff || dirSize === 0xffffffff) {
      const z64 = read(Number(tail.readBigUInt64LE(end - 12)), 56);
      count = Number(z64.readBigUInt64LE(32));
      dirSize = Number(z64.readBigUInt64LE(40));
      pos = Number(z64.readBigUInt64LE(48));
    }
    const dir = Buffer.allocUnsafe(dirSize);
    if (fs.readSync(fd, dir, 0, dirSize, pos) !== dirSize) throw new Error(`${file}: broken zip directory`);
    for (let k = 0, at = 0; k < count; k++) {
      if (at + 46 > dir.length || dir.readUInt32LE(at) !== 0x02014b50) throw new Error(`${file}: broken zip directory`);
      const n = dir.readUInt16LE(at + 28), x = dir.readUInt16LE(at + 30);
      const more = dir.subarray(at + 46, at + 46 + n + x);
      const flags = dir.readUInt16LE(at + 8);
      const e = { name: zipName(more.subarray(0, n), flags & 0x800).replace(/\\/g, '/'), flags,
        method: dir.readUInt16LE(at + 10), crc: dir.readUInt32LE(at + 16), csize: dir.readUInt32LE(at + 20),
        usize: dir.readUInt32LE(at + 24), offset: dir.readUInt32LE(at + 42) };
      for (let i = n; i + 4 <= more.length; i += 4 + more.readUInt16LE(i + 2)) {
        if (more.readUInt16LE(i) !== 1) continue;
        let j = i + 4;
        for (const key of ['usize', 'csize', 'offset']) if (e[key] === 0xffffffff) { e[key] = Number(more.readBigUInt64LE(j)); j += 8; }
      }
      list.push(e);
      at += 46 + n + x + dir.readUInt16LE(at + 32);
    }
    list.sort((a, b) => a.offset - b.offset);
    await extract(file, dest, list, read);
  } finally { fs.closeSync(fd); }
}

async function extract(file, dest, list, read) {
  const root = path.resolve(dest);
  const made = new Set();
  const dir = d => { if (!made.has(d)) { fs.mkdirSync(d, { recursive: true }); made.add(d); } };
  for (const e of list) {
    const out = path.resolve(root, e.name);
    if (out !== root && !out.startsWith(root + path.sep)) throw new Error(`refusing to write outside ${dest}: ${e.name}`);
    if (e.name.endsWith('/')) { dir(out); continue; }
    if (e.flags & 1) throw new Error(`${e.name} is encrypted`);
    if (e.method !== 0 && e.method !== 8) throw new Error(`${e.name} uses compression method ${e.method}; only stored and deflate are supported`);
    dir(path.dirname(out));
    const local = read(e.offset, 30);
    if (local.length < 30 || local.readUInt32LE(0) !== 0x04034b50) throw new Error(`${e.name} is damaged`);
    const data = e.offset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
    let written;
    if (e.csize < 4 << 20) {
      const raw = read(data, e.csize);
      const body = e.method === 8 && e.csize ? zlib.inflateRawSync(raw) : raw;
      if (zlib.crc32 && zlib.crc32(body) !== e.crc) throw new Error(`${e.name} is damaged`);
      fs.writeFileSync(out, body);
      written = body.length;
    } else {
      const input = fs.createReadStream(file, { start: data, end: data + e.csize - 1 });
      await pipeline(input, ...(e.method === 8 ? [zlib.createInflateRaw()] : []), fs.createWriteStream(out));
      written = fs.statSync(out).size;
    }
    if (written !== e.usize) throw new Error(`${e.name} is damaged`);
  }
}

module.exports = { aplib, unpack, unzip, zipName };

if (require.main === module) {
  const [file, dest] = process.argv.slice(2);
  const head = Buffer.alloc(2);
  try { const fd = fs.openSync(file, 'r'); fs.readSync(fd, head, 0, 2, 0); fs.closeSync(fd); } catch {}
  (async () => (head.toString('latin1') === 'PK' ? unzip(file, dest) : unpack(file, dest)))()
    .catch(e => { console.error(`tuxtavern: ${e.message}`); process.exit(1); });
}
