#!/usr/bin/env python3
"""Write build-info.json for an installed runtime: its build settings, source commit and each
file's checksum, which pmjs prepare records and pmjs self-test checks."""
import hashlib
import json
import subprocess
import sys
from pathlib import Path


def digest(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def source(root):
    # A source tree without .git (a distribution build) is reported as unqualified.
    try:
        git = lambda *args: subprocess.check_output(['git', '-C', root, *args], stderr=subprocess.DEVNULL).decode()
        return {'commit': git('rev-parse', 'HEAD').strip(), 'dirty': bool(git('status', '--porcelain').strip())}
    except (OSError, subprocess.CalledProcessError):
        return {'commit': 'unqualified', 'dirty': True}


def main(stage, build, root):
    files = {}
    for file in sorted(stage.rglob('*')):
        if file.is_symlink():
            raise SystemExit('installed files must be regular files, not symlinks: ' + str(file))
        if file.is_file() and file != stage / 'build-info.json':
            files[str(file.relative_to(stage))] = {'sha256': digest(file), 'bytes': file.stat().st_size,
                                                   'mode': file.stat().st_mode & 0o777}
    info = {**json.loads((build / 'build-config.json').read_text()), 'schema': 1,
            'source': source(root), 'files': files}
    (stage / 'build-info.json').write_text(json.dumps(info, indent=2, sort_keys=True) + '\n')


if __name__ == '__main__':
    main(*(Path(argument).resolve() for argument in sys.argv[1:4]))
