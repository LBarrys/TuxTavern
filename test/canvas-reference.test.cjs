'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

// The pins upstream PMJS captured this reference with (in NW.js 0.29, the MV runtime).
const reference = {
  nwVersion: '0.29.0', chromiumVersion: '65.0.3325.146', nodeVersion: '9.7.1',
  files: {
    nw: '0c99f7355109513384f386bd6bff014d9c89d011b3eeb5690cae4da56b2aca73',
    'lib/libnw.so': '24ebbbc3dc171134277af7d6c70b83546162e4309ad1e543950e29fd4dfd980d',
    'natives_blob.bin': '47a86495fbc403ade14d7e451c33edb1baa810402d8d192446a7767bc563dd47',
    'snapshot_blob.bin': '2f5c021a21c674911724272da4e1128108e84569bbcdc5ce025de304a2213462',
    'icudtl.dat': '83b3d8cecab6eea5b73263af8a4d475231f6fe4145644aa230a223e89378ab88',
  },
};
const settings = {
  width: 8, height: 8, canvasBackend: 'cpu', freshProcessReplays: 2,
  frozenCaptures: 2, representation: 'getImageData straight RGBA8 converted to premultiplied RGBA8',
};
const scenarioFile = path.join(__dirname, 'helpers/canvas-regression-scenario.cjs');
const fontFile = path.join(__dirname, 'assets/testfont.ttf');
const shapingFontFile = path.join(__dirname, 'assets/text-shaping.ttf');
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function validateFixture(fixture) {
  assert.deepEqual(fixture.reference, reference, 'Canvas reference pin changed');
  assert.deepEqual(fixture.settings, settings, 'Canvas reference capture settings changed');
  assert.equal(fixture.scenarioSha256, hash(scenarioFile), 'Canvas reference scenario/readback changed');
  assert.equal(fixture.readbackSha256, hash(scenarioFile), 'Canvas reference readback changed');
  assert.equal(fixture.fontSha256, hash(fontFile), 'Canvas reference font changed');
  assert.equal(fixture.shapingFontSha256, hash(shapingFontFile), 'Canvas reference shaping font changed');
  assert.match(fixture.driverSha256, /^[a-f0-9]{64}$/, 'Canvas reference driver identity missing');
  assert.equal(fixture.channelTolerance, 2, 'Canvas reference tolerance changed');
}


const fixturePath = path.join(__dirname, 'assets/reference/canvas-regressions.json.gz');
test('Canvas expectations reject stale runtime, readback, font and capture identities', () => {
  const fixture = JSON.parse(zlib.gunzipSync(fs.readFileSync(fixturePath)));
  validateFixture(fixture);
  for (const change of [
    value => { value.reference.files.nw = '0'.repeat(64); },
    value => { value.reference.chromiumVersion = '66.0'; },
    value => { value.scenarioSha256 = '0'.repeat(64); },
    value => { value.readbackSha256 = '0'.repeat(64); },
    value => { value.fontSha256 = '0'.repeat(64); },
    value => { delete value.driverSha256; },
    value => { value.settings.freshProcessReplays = 1; },
    value => { value.channelTolerance = 3; },
  ]) {
    const stale = structuredClone(fixture); change(stale);
    assert.throws(() => validateFixture(stale));
  }
});
