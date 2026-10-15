'use strict';
const fs = require('fs');

function read(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (e) {
    if (e.code === 'ENOENT') return Object.create(null);
    throw e;
  }
  text = text.replace(/^﻿/, '');
  const parsed = text.trim() ? JSON.parse(text) : {};
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('expected a JSON object of "text": "translation"');
  const dict = Object.create(null);
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v !== 'string') throw new Error(`the translation of ${JSON.stringify(k)} is not text`);
    dict[k] = v;
  }
  return dict;
}

function write(file, dict) {
  const tmp = `${file}.tuxtavern-tmp`;
  fs.writeFileSync(tmp, JSON.stringify(dict, null, 2) + '\n');
  fs.renameSync(tmp, file);
}

function translator(dict) {
  const outputs = new Set(Object.values(dict).filter(Boolean));
  const fresh = [];
  return {
    fresh,
    learn(k, v) { if (v) { dict[k] = v; outputs.add(v); } },
    tr(s) {
      if (typeof s !== 'string' || !s) return s;
      if (s in dict) return dict[s] || s;
      if (!outputs.has(s) && s.length > 1 && /\p{L}/u.test(s)) { dict[s] = ''; fresh.push(s); }
      return s;
    },
  };
}

// Fills in empty translations one at a time with a command that reads the
// text on stdin and prints its translation; stops at the first failure.
function machine(cmd, run = require('child_process').exec) {
  const tried = new Set(), queue = [], done = [];
  let busy = false, off = false;
  const next = () => {
    if (busy || off || !queue.length) return;
    busy = true;
    const s = queue.shift();
    const child = run(cmd, { timeout: 60000, maxBuffer: 1 << 20 }, (err, out, errout) => {
      busy = false;
      if (err) {
        off = true;
        console.error(`tuxtavern: machine translation stopped: ${String(errout || '').trim() || err.message}`);
        return;
      }
      const v = String(out).replace(/\r?\n$/, '');
      if (v.trim() && v !== s) done.push([s, v]);
      next();
    });
    child.stdin.on('error', () => {});
    child.stdin.end(s);
  };
  return {
    done,
    want(dict) {
      for (const k in dict) if (!dict[k] && !tried.has(k)) { tried.add(k); queue.push(k); }
      next();
    },
  };
}

function sync(file, t, state, mt) {
  let mtime = 0;
  try { mtime = fs.statSync(file).mtimeMs; } catch {}
  const done = mt ? mt.done : [];
  if (!t.fresh.length && !done.length && mtime === state.mtime) return;
  let disk;
  try { disk = read(file); } catch { return; }
  for (const k in disk) t.learn(k, disk[k]);
  let changed = false;
  for (const s of t.fresh.splice(0)) if (!(s in disk)) { disk[s] = ''; changed = true; }
  for (const [s, v] of done.splice(0)) if (disk[s] === '') { disk[s] = v; t.learn(s, v); changed = true; }
  if (changed) write(file, disk);
  if (mt) mt.want(disk);
  try { state.mtime = fs.statSync(file).mtimeMs; } catch {}
}

function install(w, file, every = 2000, cmd = '') {
  const t = translator(read(file));
  const state = { mtime: 0 };
  const mt = cmd ? machine(cmd) : null;
  let depth = 0;
  const wrap = (proto, name, make) => {
    if (proto && typeof proto[name] === 'function') proto[name] = make(proto[name]);
  };
  const base = w.Window_Base && w.Window_Base.prototype;
  wrap(base, 'convertEscapeCharacters', f => function (text, ...rest) { return f.call(this, t.tr(text), ...rest); });
  for (const name of ['processCharacter', 'flushTextState']) {
    wrap(base, name, f => function (...args) {
      depth++;
      try { return f.apply(this, args); } finally { depth--; }
    });
  }
  wrap(w.Bitmap && w.Bitmap.prototype, 'drawText', f => function (text, ...rest) {
    return f.call(this, depth || typeof text !== 'string' ? text : t.tr(text), ...rest);
  });
  const flush = () => sync(file, t, state, mt);
  w.setInterval(flush, every);
  w.addEventListener('beforeunload', flush);
  return { t, flush };
}

module.exports = { read, write, translator, machine, sync, install };
