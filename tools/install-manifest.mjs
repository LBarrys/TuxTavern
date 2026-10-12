// Write build-info.json for an installed runtime: its build settings, source commit and each
// file's checksum, which pmjs prepare records and pmjs self-test checks.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function source(root) {
  // A source tree without .git (a distribution build) is reported as unqualified.
  try {
    const git = (...args) => execFileSync('git', ['-C', root, ...args],
      { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    return { commit: git('rev-parse', 'HEAD').trim(), dirty: !!git('status', '--porcelain').trim() };
  } catch {
    return { commit: 'unqualified', dirty: true };
  }
}

function walk(directory, files = []) {
  for (const name of fs.readdirSync(directory)) {
    const file = path.join(directory, name);
    const stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) throw new Error('installed files must be regular files, not symlinks: ' + file);
    if (stat.isDirectory()) walk(file, files);
    else if (stat.isFile()) files.push([file, stat]);
  }
  return files;
}

// The format build-info.json has always had: sorted keys, two-space indent, ASCII only.
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

const [stage, build, root] = process.argv.slice(2, 5).map(argument => path.resolve(argument));
const files = {};
for (const [file, stat] of walk(stage)) {
  if (file === path.join(stage, 'build-info.json')) continue;
  files[path.relative(stage, file)] = { sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
    bytes: stat.size, mode: stat.mode & 0o777 };
}
const info = { ...JSON.parse(fs.readFileSync(path.join(build, 'build-config.json'), 'utf8')),
  schema: 1, source: source(root), files };
fs.writeFileSync(path.join(stage, 'build-info.json'), JSON.stringify(stable(info), null, 2)
  .replace(/[\u007f-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')) + '\n');
