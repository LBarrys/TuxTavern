'use strict';

const fs = require('node:fs/promises');
const syncFs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const checksum = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const checksumRaw = value => crypto.createHash('sha256').update(value, 'utf8').digest('hex');
const HASH = /^[a-f0-9]{64}$/;
const CACHE_PATH = /^(entries\/[a-f0-9]{64}(\/[\w.-]+)?|maps\/entries\/[a-f0-9]{64}(\/[\w.-]+)?|maps\/sources\/[a-f0-9]{64}\.png)$/;
const DOT_SEGMENT = /(^|\/)\.\.?(\/|$)/;
function relative(root, file) {
  const value = path.relative(path.resolve(root), path.resolve(file));
  if (!value || value.includes('\\') || value.includes('\0') || value.split('/').some(p => !p || p === '.' || p === '..'))
    throw new Error('unsafe catalog cache path');
  if (!CACHE_PATH.test(value))
    throw new Error('unsupported catalog cache path');
  return value;
}
function paths(payload, root, encode) {
  const prefix = path.join(root, path.sep);
  function cachePath(value) {
    if (typeof value !== 'string' || (!encode && path.isAbsolute(value))) throw new Error('invalid catalog path');
    // A stored path already in the form relative() gives is joined as it is: resolving each of
    // Karryn's Prison's 39,000 took 200 ms of every start.
    if (!encode && CACHE_PATH.test(value) && !DOT_SEGMENT.test(value)) return prefix + value;
    const safe = relative(root, encode ? value : path.resolve(root, value));
    return encode ? safe : path.join(root, safe);
  }
  if (!Array.isArray(payload.entries)) throw new Error('invalid catalog entries');
  if (!encode) {
    // A payload just read from the file is changed in place instead of copied.
    for (const entry of payload.entries) {
      entry.directory = cachePath(entry.directory);
      if (entry.descriptor.sources) for (const source of entry.descriptor.sources) source.snapshot = cachePath(source.snapshot);
    }
    if (payload.decryptedEntries) for (const entry of payload.decryptedEntries) entry.file = cachePath(entry.file);
    return payload;
  }
  const entries = payload.entries.map(entry => ({ ...entry, directory: cachePath(entry.directory),
    descriptor: entry.descriptor.sources ? { ...entry.descriptor,
      sources: entry.descriptor.sources.map(source => ({ ...source, snapshot: cachePath(source.snapshot) })) } : entry.descriptor }));
  const decryptedEntries = payload.decryptedEntries?.map(entry => ({ ...entry, file: cachePath(entry.file) }));
  return { ...payload, entries, ...(decryptedEntries ? { decryptedEntries } : {}) };
}
// Version 4 is version 3 with the payload written as JSON, not as a string holding JSON: the file
// was parsed twice, and Karryn's Prison's holds 46 MB. The payload's stored text is what the checksum
// covers, so it is split off at the first marker (the header holds only hashes and binding field
// names) and parsed once. The whole file stays JSON, so older readers miss it instead of failing.
const PAYLOAD_MARKER = ',"payload":';
function parseCatalog(text) {
  const marker = text.indexOf(PAYLOAD_MARKER);
  if (text.startsWith('{"version":4,') && marker > 0 && text.endsWith('}'))
    return { catalog: JSON.parse(text.slice(0, marker) + '}'), payloadText: text.slice(marker + PAYLOAD_MARKER.length, -1) };
  return { catalog: JSON.parse(text) };
}
async function readCatalog(file, binding, root, onMiss = () => {}) {
  const miss = (reason, changed) => { onMiss(reason, changed); return null; };
  try {
    const { catalog, payloadText } = parseCatalog(await fs.readFile(file, 'utf8'));
    if (catalog.binding !== checksum(binding)) {
      // Upstream 2a47b85: name the parts of the binding that changed.
      const stored = catalog.fields && typeof catalog.fields === 'object' ? catalog.fields : {};
      return miss('binding-mismatch', [...new Set([...Object.keys(stored), ...Object.keys(binding)])]
        .filter(key => stored[key] !== (key in binding ? checksum(binding[key]) : undefined)).sort());
    }
    // Version 3 stores the payload as a string so integrity is verified by
    // hashing the stored bytes: no canonical re-serialization pass is needed.
    // Version 2 (payload object, checksum over re-serialization) stays readable
    // so existing caches keep their fast path across the upgrade.
    let payload;
    if (catalog.version === 4 && typeof payloadText === 'string') {
      if (catalog.checksum !== checksumRaw(payloadText)) return miss('integrity-mismatch');
      payload = JSON.parse(payloadText);
    } else if (catalog.version === 3 && typeof catalog.payload === 'string') {
      if (catalog.checksum !== checksumRaw(catalog.payload)) return miss('integrity-mismatch');
      payload = JSON.parse(catalog.payload);
    } else if (catalog.version === 2 && catalog.checksum === checksum(catalog.payload)) {
      payload = catalog.payload;
    } else return miss('format-or-integrity-mismatch');
    if (!Array.isArray(payload.keys) || !payload.keys.every(key => HASH.test(key))) return miss('invalid-metadata');
    if (!Array.isArray(payload.entries) || payload.entries.length > 100000 || !payload.summary ||
        payload.summary.installed !== payload.entries.length ||
        !Object.values(payload.summary).every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)) return miss('invalid-metadata');
    if (payload.decryptedEntries !== undefined) {
      if (!Array.isArray(payload.decryptedEntries) || payload.decryptedEntries.length > 100000) return miss('invalid-metadata');
    } else if (!Array.isArray(payload.maps) || !payload.index || typeof payload.index !== 'object' || Array.isArray(payload.index)) return miss('invalid-metadata');
    // Older versions are rewritten as version 4 once installed (storedVersion tells the caller).
    return Object.defineProperty(paths(payload, root, false), 'storedVersion', { value: catalog.version });
  } catch (error) { return miss(error.code === 'ENOENT' ? 'missing' : 'unreadable-or-invalid'); }
}
async function publishCatalog(file, binding, root, payload) {
  payload = JSON.stringify(paths(payload, root, true));
  const stage = file+'.stage-'+process.pid;
  await fs.rm(stage, { force: true });
  try {
    const handle = await fs.open(stage, 'wx');
    try {
      const fields = Object.fromEntries(Object.entries(binding).map(([key, value]) => [key, checksum(value)]));
      const header = JSON.stringify({ version: 4, binding: checksum(binding), fields, checksum: checksumRaw(payload) });
      await handle.writeFile(header.slice(0, -1) + PAYLOAD_MARKER + payload + '}');
      await handle.sync();
    } finally { await handle.close(); }
    await fs.rename(stage, file);
  } finally { await fs.rm(stage, { force: true }); }
}
function catalogInvalidator(file, logger) {
  let invalidated = false;
  return function() {
    if (invalidated) return true;
    try {
      syncFs.rmSync(file, { force: true });
      invalidated = true;
      return true;
    } catch (error) {
      logger.warn('[pmjs] cannot invalidate preparation catalog: '+error.message);
      return false;
    }
  };
}
function retainedCatalogKeys(record) {
  const keys = [];
  const collect = value => {
    if (Array.isArray(value)) for (const key of value) if (HASH.test(key)) keys.push(key);
  };
  if (!record || typeof record !== 'object') return keys;
  collect(record.keys);
  collect(record.snapshots);
  if (Array.isArray(record.previous)) for (const older of record.previous) if (older && typeof older === 'object') {
    collect(older.keys);
    collect(older.snapshots);
  }
  let payload = record.payload;
  // Version 3 stores the payload as a string; retention only needs its keys,
  // so a damaged payload degrades to retaining nothing extra instead of failing.
  if (typeof payload === 'string') {
    try { payload = JSON.parse(payload); } catch (_) { return keys; }
  }
  collect(payload && payload.keys);
  return keys;
}

// Upstream issue #16: an index also keeps the keys of the last other runtime version (generation),
// so cleanup doesn't delete them and switching back doesn't prepare the whole cache again.
function previousGenerations(index, generation) {
  if (!index || typeof index !== 'object') return [];
  const older = Array.isArray(index.previous)
    ? index.previous.filter(item => item && typeof item === 'object' && item.generation !== generation) : [];
  if (typeof index.generation === 'string' && index.generation !== generation)
    older.unshift({ generation: index.generation, keys: index.keys, ...(index.snapshots ? { snapshots: index.snapshots } : {}) });
  return older.slice(0, 1);
}

module.exports = { checksum, readCatalog, publishCatalog, catalogInvalidator, retainedCatalogKeys, previousGenerations };
