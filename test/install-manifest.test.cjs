'use strict';

// build-info.json lists every installed file with its checksum, size and mode, in the
// same sorted, ASCII-only JSON the Python script wrote, so existing manifests compare.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const script = path.join(__dirname, '../tools/install-manifest.mjs');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pmjs-manifest-'));
  const stage = path.join(root, 'stage'), build = path.join(root, 'build');
  fs.mkdirSync(path.join(stage, 'share/ünï'), { recursive: true });
  fs.mkdirSync(build);
  fs.writeFileSync(path.join(build, 'build-config.json'), JSON.stringify({ version: '1', nodeApi: 8 }));
  fs.writeFileSync(path.join(stage, 'share/ünï/b.js'), 'b');
  fs.writeFileSync(path.join(stage, 'a.txt'), 'abc', { mode: 0o640 });
  fs.writeFileSync(path.join(stage, 'build-info.json'), 'stale');
  return { root, stage, build };
}

test('manifest records installed files in sorted ASCII JSON', () => {
  const { root, stage, build } = fixture();
  execFileSync(process.execPath, [script, stage, build, root]);
  const text = fs.readFileSync(path.join(stage, 'build-info.json'), 'utf8');
  assert.match(text, /^\{\n {2}"files": \{\n {4}"a\.txt": \{\n {6}"bytes": 3,/);
  assert.ok(text.includes('"share/\\u00fcn\\u00ef/b.js"'), 'non-ASCII paths are escaped');
  assert.ok(text.endsWith('}\n'));
  const info = JSON.parse(text);
  assert.deepEqual(Object.keys(info), ['files', 'nodeApi', 'schema', 'source', 'version']);
  assert.deepEqual(info.files['a.txt'], { bytes: 3, mode: 0o640,
    sha256: createHash('sha256').update('abc').digest('hex') });
  assert.equal(info.files['build-info.json'], undefined);
  assert.deepEqual(info.source, { commit: 'unqualified', dirty: true }, 'no git checkout');
  fs.rmSync(root, { recursive: true });
});

test('manifest refuses symlinks', () => {
  const { root, stage, build } = fixture();
  fs.symlinkSync('a.txt', path.join(stage, 'link'));
  assert.throws(() => execFileSync(process.execPath, [script, stage, build, root], { stdio: 'pipe' }),
    /not symlinks/);
  fs.rmSync(root, { recursive: true });
});
