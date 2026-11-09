'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const test = require('node:test');
const { temporaryDirectory } = require('./helpers/temp.cjs');

test('the real session worker stops when its supervisor crashes', async () => {
  const directory = temporaryDirectory('session-parent-loss-');
  const parent = path.join(directory, 'parent.cjs');
  const exitFile = path.join(directory, 'worker-exit.txt');
  const observer = path.join(directory, 'observe-exit.cjs');
  fs.writeFileSync(observer, `process.once('exit', code =>
    require('node:fs').writeFileSync(${JSON.stringify(exitFile)}, String(code)));`);
  fs.writeFileSync(parent, `
    const { fork } = require('node:child_process');
    const child = fork(${JSON.stringify(path.resolve(__dirname, '../runner/session.cjs'))}, [],
      { stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
        execArgv: ['--require', ${JSON.stringify(observer)}] });
    child.once('spawn', () => {
      process.stdout.write(String(child.pid) + '\\n', () => process.kill(process.pid, 'SIGKILL'));
    });
  `);
  const child = spawn(process.execPath, [parent], { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '', diagnostics = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { diagnostics += chunk; });
  const timeout = setTimeout(() => {
    child.kill('SIGKILL');
    const pid = Number(output.trim());
    if (pid) { try { process.kill(pid, 'SIGKILL'); } catch (_) {} }
  }, 5000);
  try {
    // The worker inherits stderr, so close also waits for its descriptor to close.
    const [, signal] = await once(child, 'close');
    assert.equal(signal, 'SIGKILL');
    assert.match(diagnostics, /Supervisor connection lost; stopping session/);
    assert.ok(Number(output.trim()) > 0);
    assert.equal(fs.readFileSync(exitFile, 'utf8'), '1');
  } finally { clearTimeout(timeout); }
});
