'use strict';
// Ruby Marshal (format 4.8) to editable JSON and back, for XP/VX/VX Ace saves: one or more dumps
// back to back. Unedited, it writes the same bytes back. Objects shared in the save stay shared:
// one carries "$id", later uses are {"$ref": id}. Plain JSON is used where it is unambiguous:
// null, true, false, integers, arrays, and strings in the save's usual form ("strings": "E" is
// VX Ace's UTF-8, "raw" XP's and VX's untagged bytes; "symbols" likewise). Everything else is
// tagged with a $ key.

const INT_MIN = -(2 ** 30), INT_MAX = 2 ** 30 - 1;
const utf8 = bytes => { const s = bytes.toString('utf8'); return Buffer.from(s, 'utf8').equals(bytes) ? s : null; };
const isE = ivars => ivars.length === 1 && ivars[0][0] === 'E' && ivars[0][1] === true;

function parse(buf) {
  let pos = 0, strings = null, symbols = null;
  const streams = [];
  const byte = () => { if (pos >= buf.length) throw new Error('save ends early'); return buf[pos++]; };
  const long = () => {
    const c = (byte() << 24) >> 24;
    if (c === 0) return 0;
    if (c > 4) return c - 5;
    if (c < -4) return c + 5;
    let x = 0;
    for (let i = 0; i < Math.abs(c); i++) x += byte() * 2 ** (8 * i);
    return c > 0 ? x : x - 2 ** (8 * -c);
  };
  const bytes = () => { const n = long(); if (pos + n > buf.length) throw new Error('save ends early'); pos += n; return buf.subarray(pos - n, pos); };
  while (pos < buf.length) {
    if (buf[pos] !== 4 || buf[pos + 1] !== 8) throw new Error('not a Ruby Marshal 4.8 save');
    const start = (pos += 2);
    // First pass: which objects are linked to; second: the JSON, with "$id" only on those.
    let linked = new Set();
    for (const pass of [1, 2]) {
      pos = start;
      const syms = [], ids = { n: 0 };
      const sym = () => {
        const t = byte();
        if (t === 0x3b) return syms[long()];
        if (t === 0x3a) {
          const s = bytes().toString('latin1'); syms.push(s);
          if (symbols === null && /[^\0-\x7f]/.test(s)) symbols = 'raw';
          return s;
        }
        if (t === 0x49 && buf[pos] === 0x3a) {
          byte(); const s = bytes().toString('latin1'); syms.push(s); ivars();
          if (symbols === null) symbols = 'E';
          return s;
        }
        throw new Error('symbol expected at byte ' + (pos - 1));
      };
      const name = s => Buffer.from(s, 'latin1').toString('utf8');
      const ivars = () => { const out = []; for (let n = long(); n > 0; n--) { const k = name(sym()); out.push([k, value()]); } return out; };
      const entry = () => { const id = ids.n++; return id; };
      const tag = (id, v) => { if (pass === 2 && linked.has(id)) v.$id = id; return v; };
      const string = (id, raw, iv) => {
        const text = utf8(raw);
        if (strings === null) strings = isE(iv) ? 'E' : 'raw';
        const plain = text !== null && (strings === 'E' ? isE(iv) : iv.length === 0);
        if (plain && !(pass === 2 && linked.has(id))) return text;
        const v = text !== null ? { $str: text } : { $bytes: raw.toString('base64') };
        if (iv.length) v.$ivars = iv;
        return tag(id, v);
      };
      function value() {
        const t = String.fromCharCode(byte());
        switch (t) {
        case '0': return null;
        case 'T': return true;
        case 'F': return false;
        case 'i': return long();
        case ':': case ';': pos--; return { $sym: name(sym()) };
        case '@': { const id = long(); if (pass === 1) linked.add(id); return { $ref: id }; }
        case 'I': {
          if (buf[pos] === 0x3a) { pos--; return { $sym: name(sym()) }; }
          if (buf[pos] === 0x22) { byte(); const id = entry(), raw = bytes(); return string(id, raw, ivars()); }
          const inner = value();
          return { $value: inner, $ivars: ivars() };
        }
        case '"': { const id = entry(); return string(id, bytes(), []); }
        case 'f': { const id = entry(); return tag(id, { $float: bytes().toString('latin1') }); }
        case 'l': {
          const id = entry(), sign = String.fromCharCode(byte()), n = long() * 2;
          let x = 0n;
          for (let i = n - 1; i >= 0; i--) x = x * 256n + BigInt(buf[pos + i]);
          pos += n;
          // Ruby 1.8 may pad with a zero word; that width is kept.
          const padded = n > 2 && buf[pos - 1] === 0 && buf[pos - 2] === 0;
          if (sign === '-') x = -x;
          const v = Number(x);
          if (Number.isSafeInteger(v) && !padded && !(pass === 2 && linked.has(id))) return v;
          return tag(id, padded ? { $bignum: x.toString(), $words: n / 2 } : { $bignum: x.toString() });
        }
        case '[': { const id = entry(), out = []; for (let n = long(); n > 0; n--) out.push(value()); return pass === 2 && linked.has(id) ? { $id: id, $array: out } : out; }
        case '{': case '}': {
          const id = entry(), v = { $hash: [] };
          for (let n = long(); n > 0; n--) v.$hash.push([value(), value()]);
          if (t === '}') v.$default = value();
          return tag(id, v);
        }
        case 'o': {
          const id = entry(), v = { '@class': name(sym()) };
          tag(id, v);
          for (const [k, x] of ivars()) v[k] = x;
          return v;
        }
        case 'u': { const id = entry(); return tag(id, { '@class': name(sym()), $dump: bytes().toString('base64') }); }
        case 'U': { const id = entry(), v = tag(id, { '@class': name(sym()) }); v.$marshal = value(); return v; }
        case 'S': { const id = entry(), v = tag(id, { $struct: name(sym()), $members: [] }); v.$members = ivars(); return v; }
        case '/': { const id = entry(), src = bytes(); return tag(id, { $regexp: src.toString('base64'), $options: byte() }); }
        case 'c': case 'm': case 'M': { const id = entry(); return tag(id, { [t === 'c' ? '$class' : t === 'm' ? '$module' : '$classOrModule']: bytes().toString('latin1') }); }
        case 'e': { const mod = name(sym()); return { $extended: mod, $value: value() }; }
        case 'C': { const cls = name(sym()); return { $uclass: cls, $value: value() }; }
        case 'd': { const id = entry(), v = tag(id, { $data: name(sym()) }); v.$value = value(); return v; }
        default: throw new Error(`unknown Marshal type ${JSON.stringify(t)} at byte ${pos - 1}`);
        }
      }
      const v = value();
      if (pass === 2) streams.push(v);
    }
  }
  strings = strings || 'E';
  return { tuxtavern: 'RGSS save as JSON: change values, keep the $ and @class keys', strings, symbols: symbols || strings, streams };
}

function dump(doc) {
  const out = [];
  const E = doc.strings !== 'raw', symbolsE = (doc.symbols || doc.strings) !== 'raw';
  const byte = b => out.push(Buffer.from([b]));
  const long = x => {
    if (x === 0) return byte(0);
    if (x > 0 && x < 123) return byte(x + 5);
    if (x < 0 && x > -124) return byte((x - 5) & 0xff);
    const b = [];
    for (let i = 1; i <= 4; i++) {
      b.push(x & 0xff); x = Math.floor(x / 256);
      if (x === 0) return out.push(Buffer.from([i, ...b]));
      if (x === -1) return out.push(Buffer.from([256 - i, ...b]));
    }
    throw new Error('length too large for Marshal');
  };
  const raw = b => { long(b.length); out.push(b); };
  for (const stream of doc.streams) {
    byte(4); byte(8);
    const syms = new Map(), ids = new Map();
    let n = 0;
    const entry = v => { if (v && v.$id !== undefined) ids.set(v.$id, n); n++; };
    const sym = s => {
      if (syms.has(s)) { byte(0x3b); return long(syms.get(s)); }
      const b = Buffer.from(s, 'utf8'), ascii = b.every(c => c < 0x80);
      if (!ascii && symbolsE) byte(0x49);
      syms.set(s, syms.size); byte(0x3a); raw(b);
      if (!ascii && symbolsE) { long(1); sym('E'); byte(0x54); }
    };
    const ivars = list => { long(list.length); for (const [k, x] of list) { sym(k); value(x); } };
    const string = (v, text, b) => {
      const iv = text !== null && typeof v === 'string' ? (E ? [['E', true]] : []) : v.$ivars || [];
      if (iv.length) byte(0x49);
      entry(v); byte(0x22); raw(b);
      if (iv.length) ivars(iv);
    };
    function value(v) {
      if (v === null || v === undefined) return byte(0x30);
      if (v === true) return byte(0x54);
      if (v === false) return byte(0x46);
      if (typeof v === 'number') {
        if (Number.isInteger(v) && v >= INT_MIN && v <= INT_MAX) { byte(0x69); return long(v); }
        if (Number.isInteger(v)) return value({ $bignum: String(v) });
        return value({ $float: String(v) });
      }
      if (typeof v === 'string') return string(v, v, Buffer.from(v, 'utf8'));
      if (Array.isArray(v)) { entry(null); byte(0x5b); long(v.length); return v.forEach(value); }
      if (typeof v !== 'object') throw new Error('cannot save ' + JSON.stringify(v));
      if ('$ref' in v) {
        if (!ids.has(v.$ref)) throw new Error(`{"$ref": ${v.$ref}} names no "$id" before it`);
        byte(0x40); return long(ids.get(v.$ref));
      }
      if ('$sym' in v) return sym(v.$sym);
      if ('$str' in v) return string(v, null, Buffer.from(v.$str, 'utf8'));
      if ('$bytes' in v) return string(v, null, Buffer.from(v.$bytes, 'base64'));
      if ('$value' in v && '$ivars' in v) { byte(0x49); value(v.$value); return ivars(v.$ivars); }
      if ('$extended' in v) { byte(0x65); sym(v.$extended); return value(v.$value); }
      if ('$uclass' in v) { byte(0x43); sym(v.$uclass); return value(v.$value); }
      entry(v);
      if ('$array' in v) { byte(0x5b); long(v.$array.length); return v.$array.forEach(value); }
      if ('$float' in v) { byte(0x66); return raw(Buffer.from(String(v.$float), 'latin1')); }
      if ('$bignum' in v) {
        let x = BigInt(v.$bignum);
        byte(0x6c); byte(x < 0n ? 0x2d : 0x2b); if (x < 0n) x = -x;
        const b = [];
        do { b.push(Number(x & 0xffn)); x >>= 8n; } while (x > 0n);
        while (b.length % 2 || b.length < 2 * (v.$words || 0)) b.push(0);
        long(b.length / 2); return out.push(Buffer.from(b));
      }
      if ('$hash' in v) {
        const def = '$default' in v;
        byte(def ? 0x7d : 0x7b); long(v.$hash.length);
        for (const [k, x] of v.$hash) { value(k); value(x); }
        return def ? value(v.$default) : undefined;
      }
      if ('$struct' in v) { byte(0x53); sym(v.$struct); return ivars(v.$members); }
      if ('$regexp' in v) { byte(0x2f); raw(Buffer.from(v.$regexp, 'base64')); return byte(v.$options); }
      if ('$class' in v) { byte(0x63); return raw(Buffer.from(v.$class, 'latin1')); }
      if ('$module' in v) { byte(0x6d); return raw(Buffer.from(v.$module, 'latin1')); }
      if ('$classOrModule' in v) { byte(0x4d); return raw(Buffer.from(v.$classOrModule, 'latin1')); }
      if ('$data' in v) { byte(0x64); sym(v.$data); return value(v.$value); }
      if (!('@class' in v)) throw new Error('an object needs "@class": ' + JSON.stringify(v).slice(0, 80));
      if ('$dump' in v) { byte(0x75); sym(v['@class']); return raw(Buffer.from(v.$dump, 'base64')); }
      if ('$marshal' in v) { byte(0x55); sym(v['@class']); return value(v.$marshal); }
      byte(0x6f); sym(v['@class']);
      const keys = Object.keys(v).filter(k => k !== '@class' && k !== '$id');
      long(keys.length);
      for (const k of keys) { sym(k); value(v[k]); }
    }
    value(stream);
  }
  return Buffer.concat(out);
}

module.exports = { parse, dump };
