'use strict';
const { existsSync, mkdirSync, readdirSync, renameSync, statSync } = require('fs');
const path = require('path');

const dirs = new Map();

function list(dir) {
  const st = statSync(dir, { throwIfNoEntry: false });
  const mtime = st ? st.mtimeMs : -1;
  const entry = { mtime, settled: Date.now() - mtime > 2000, names: new Map() };
  try {
    for (const n of readdirSync(dir)) if (!entry.names.has(n.toLowerCase())) entry.names.set(n.toLowerCase(), n);
  } catch {}
  dirs.set(dir, entry);
  return entry;
}

function lookup(dir, name) {
  const key = name.toLowerCase();
  const entry = dirs.get(dir) || list(dir);
  let hit = entry.names.get(key);
  if (hit === undefined) {
    const st = statSync(dir, { throwIfNoEntry: false });
    if (st && (st.mtimeMs !== entry.mtime || !entry.settled)) hit = list(dir).names.get(key);
  }
  return hit;
}

function resolve(p) {
  p = path.resolve(p);
  if (existsSync(p)) return p;
  const rest = [];
  let cur = p;
  for (;;) {
    const up = path.dirname(cur);
    if (up === cur) break;
    rest.push(path.basename(cur));
    cur = up;
    if (existsSync(cur)) break;
  }
  for (let i = rest.length - 1; i >= 0; i--) {
    const hit = lookup(cur, rest[i]);
    if (hit === undefined) return null;
    cur = path.join(cur, hit);
  }
  return cur;
}

function resolveWrite(p) {
  p = path.resolve(p);
  const found = resolve(p);
  if (found) return found;
  const dir = resolve(path.dirname(p));
  return dir ? path.join(dir, path.basename(p)) : p;
}

function resolveIn(root, rel) {
  const p = path.resolve(root, '.' + path.sep + rel);
  if (p !== root && !p.startsWith(root + path.sep)) return null;
  return resolve(p);
}

function unbackslash(p) {
  if (typeof p !== 'string' || !p.includes('\\')) return p;
  const fixed = p.replace(/\\/g, '/');
  if (!existsSync(fixed) && existsSync(p)) {
    try {
      mkdirSync(path.dirname(fixed), { recursive: true });
      renameSync(p, fixed);
    } catch {}
  }
  return fixed;
}

module.exports = { resolve, resolveWrite, resolveIn, unbackslash };
