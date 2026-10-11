'use strict';

// PMJS_PRESENT_FILTER=sharp: a 1.5x stretch (1280x720 on 1920x1080) keeps pixel edges
// crisp, where linear smears each across its neighbours.
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

if (process.env.SHARP_CHILD) {
  const native = require(path.resolve(process.argv[2]));
  native.initialize({ gameRoot: path.resolve(process.argv[3]), assetRoot: '',
    width: 8, height: 4, windowTitle: 'sharp presentation' });
  // MZ's page sizes the canvas itself, asking for smooth scaling unless pixelated.
  if (process.env.SHARP_AUTHORED) native.render.setPresentationViewport(12, 6, 2);
  native.beginFrame();
  native.render.quad(0, 0, 4, 4, 1, 0, 0, 1);
  native.render.quad(4, 0, 4, 4, 0, 0, 1, 1);
  native.renderFrame();
  const shot = native.canvas.captureDrawable();
  const row = [];
  for (let x = 0; x < 12; x++) {
    const pixel = native.canvas.pixel(shot.handle, x, 3);
    row.push([(pixel >>> 24) & 255, (pixel >>> 8) & 255]);
  }
  native.canvas.release(shot.handle);
  console.log(JSON.stringify({ filter: native.render.presentation().filter, row }));
  process.exit(0);
}

function run(filter, authored) {
  const result = spawnSync(process.execPath, [__filename, ...process.argv.slice(2)], { encoding: 'utf8',
    env: { ...process.env, SHARP_CHILD: '1', PMJS_WINDOW_SIZE: '12x6', PMJS_PRESENT_FILTER: filter,
      ...(authored ? { SHARP_AUTHORED: '1' } : {}) } });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout.trim().split('\n').pop());
  const mixed = output.row.filter(([red, blue]) => !(red > 250 && blue < 5) && !(blue > 250 && red < 5)).length;
  return { filter: output.filter, mixed };
}

const linear = run('linear');
const sharp = run('sharp');
assert.equal(sharp.filter, 'sharp');
assert.ok(linear.mixed >= 2, `linear should blend the edge, mixed ${linear.mixed}`);
assert.ok(sharp.mixed < linear.mixed && sharp.mixed <= 1, `sharp blends ${sharp.mixed} pixels, linear ${linear.mixed}`);

const authored = run('sharp', true);
assert.deepEqual(authored, sharp, 'the setting also wins over a page-sized canvas (MZ)');
