'use strict';

// tools/apk.sh builds the checkout into BusyLinux's local repository and installs it. It runs
// here in a private mount namespace, over empty /etc/apk, /root, /var/lib and /var/tmp, with
// apk, cmake and openssl stand-ins that record what they were asked.
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const script = path.join(__dirname, '../tools/apk.sh');
const usable = process.getuid?.() === 0 &&
  spawnSync('unshare', ['-m', 'true']).status === 0;

const stubs = {
  apk: `echo "apk $*" >> "$LOG"
case $1 in
--print-arch) echo x86_64 ;;
list) [ ! -f /var/lib/installed ] || echo "pmjs-$(cat /var/lib/installed) x86_64 {pmjs} (MIT) [installed]" ;;
mkpkg) while [ $# -gt 0 ]; do
    case $1 in --files) cp "$2/usr/bin/pmjs" /var/lib/wrapper ;; --output) : > "$2" ;; esac
    shift
  done ;;
esac`,
  cmake: `echo "cmake $*" >> "$LOG"
[ "$1" != --install ] || { mkdir -p "$4/bin"; echo '{}' > "$4/build-info.json"; }`,
  openssl: `echo "openssl $1" >> "$LOG"
while [ $# -gt 1 ]; do [ "$1" != -out ] || echo key > "$2"; shift; done`
};

function run(root, installed) {
  const log = path.join(root, 'log');
  fs.writeFileSync(log, '');
  const setup = ['/etc/apk', '/root', '/var/lib', '/var/tmp']
    .map(dir => `mount -t tmpfs none ${dir}`).join(' && ');
  const state = path.join(root, 'state');
  const result = spawnSync('unshare', ['-m', 'sh', '-c', `mount --make-rprivate / && ${setup} &&
    mkdir -p /etc/apk/keys && cp -a ${state}/. / 2>/dev/null; ${installed ? `echo ${installed} > /var/lib/installed;` : ''}
    sh ${script}; status=$?; rm -rf ${state}; mkdir -p ${state}/etc ${state}/root ${state}/var;
    cp -a /etc/apk ${state}/etc/; cp -a /root/. ${state}/root/; cp -a /var/lib /var/tmp ${state}/var/; exit $status`],
  { env: { ...process.env, LOG: log, PATH: `${root}/bin:${process.env.PATH}` }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return { calls: fs.readFileSync(log, 'utf8').trim().split('\n'), state };
}

test('apk.sh packages the checkout and installs it from the local repository', { skip: !usable && 'needs root and unshare' }, () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pmjs-apk-'));
  fs.mkdirSync(path.join(root, 'bin'));
  fs.mkdirSync(path.join(root, 'state', 'etc', 'apk'), { recursive: true });
  fs.writeFileSync(path.join(root, 'state', 'etc', 'apk', 'repositories'), 'https://alpine/edge/main\n');
  for (const [name, body] of Object.entries(stubs))
    fs.writeFileSync(path.join(root, 'bin', name), '#!/bin/sh\n' + body + '\n', { mode: 0o755 });
  const day = execFileSync('git', ['-c', 'safe.directory=*', '-C', path.dirname(script), 'log', '-1',
    '--format=%cd', '--date=format:%Y%m%d'], { encoding: 'utf8' }).trim();
  const version = `0.1.0_git${day}`;
  const repo = path.join(root, 'state', 'var', 'lib', 'busylinux', 'repo', 'x86_64');

  const first = run(root, `0.1.0_git20000101-r7`);
  const mkpkg = first.calls.find(call => call.startsWith('apk mkpkg'));
  assert.match(mkpkg, new RegExp(`version:${version}-r0 `), 'a newer day starts at r0');
  assert.match(mkpkg, /depends:nodejs so:libSDL2-2\.0\.so\.0 .* ffmpeg-libswscale --sign-key \/root\/keys\/local\.rsa/);
  assert.deepEqual(first.calls.slice(-2), ['apk add -u pmjs@busylinux', 'apk del -q .pmjs-build'],
    'build tools stay until pmjs is installed');
  assert.ok(first.calls.includes('openssl genrsa'), 'a missing signing key is created');
  assert.equal(fs.readFileSync(path.join(root, 'state', 'var', 'lib', 'wrapper'), 'utf8'),
    '#!/bin/sh\nexec /usr/lib/pmjs/bin/pmjs "$@"\n');
  assert.ok(fs.existsSync(path.join(root, 'state', 'etc', 'apk', 'keys', 'local.rsa.pub')));
  assert.deepEqual(fs.readdirSync(repo), [`pmjs-${version}-r0.apk`]);

  const second = run(root, `${version}-r0`);
  assert.ok(second.calls.some(call => call.includes(`version:${version}-r1 `)), 'the same day goes one past');
  assert.ok(!second.calls.some(call => call.startsWith('openssl')), 'the key is kept');
  assert.deepEqual(fs.readdirSync(repo), [`pmjs-${version}-r1.apk`], 'the old package goes');
  assert.equal(fs.readFileSync(path.join(root, 'state', 'etc', 'apk', 'repositories'), 'utf8'),
    'https://alpine/edge/main\nv3 @busylinux /var/lib/busylinux/repo\n', 'the repository is added once');
  assert.deepEqual(fs.readdirSync(path.join(root, 'state', 'var', 'tmp')), [], 'build files go');
  fs.rmSync(root, { recursive: true });
});
