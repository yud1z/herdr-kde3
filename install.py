#!/usr/bin/env python3
"""Install only KDE3 theme files; back up changed targets and merge scoped keys."""
import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import tempfile

ROOT = Path(__file__).resolve().parent


def payload(root):
    files = list((root / 'mods/kde3').rglob('*'))
    files += [root / 'layouts' / name for name in ('kde3.json', 'kde3.svg')]
    files += [root / 'themes' / name for name in
              ('kde3.json', 'kde3-black.json', 'kde3-linux.json', 'kde3-paper.json')]
    result = []
    for source in files:
        if source.is_symlink():
            raise ValueError('Symlinks are not part of the theme payload')
        if source.is_file():
            relative = source.relative_to(root)
            if any(part.startswith('.') or part == '__pycache__' for part in relative.parts):
                continue
            result.append((relative, source.read_bytes()))
    return result


def atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix='.kde3-install-', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(data)
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def install(destination, dry_run=False, root=ROOT):
    destination = Path(destination).expanduser().resolve()
    keys_path = destination / 'keys.json'
    if keys_path.is_symlink():
        raise ValueError('Refusing symlink keys.json; nothing was changed')
    existing_keys = json.loads(keys_path.read_text()) if keys_path.exists() else {}
    if not isinstance(existing_keys, dict):
        raise ValueError('Existing keys.json must be an object; nothing was changed')
    scoped = json.loads((root / 'keys.json').read_text())['layout:kde3']
    keys = {**existing_keys, 'layout:kde3': scoped}
    changes = payload(root) + [(Path('keys.json'), (json.dumps(keys, indent=2) + '\n').encode())]
    changes = [(relative, data) for relative, data in changes
               if not (destination / relative).is_file() or (destination / relative).read_bytes() != data]
    # Validate every target before changing anything; don't follow destination symlinks.
    for relative, _ in changes:
        target = destination / relative
        if target.exists() and not target.is_file():
            raise ValueError(f'Not a regular file: {relative}')
        if any(parent.is_symlink() for parent in [target, *target.parents] if parent != destination.parent):
            raise ValueError(f'Refusing symlink target: {relative}')
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    backup = destination / 'backups' / f'kde3-{stamp}'
    for relative, data in changes:
        print(('Would install ' if dry_run else 'Install ') + str(relative))
        if dry_run:
            continue
        target = destination / relative
        if target.exists():
            saved = backup / relative
            saved.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(target, saved)
        atomic_write(target, data)
    if not dry_run and backup.exists():
        print(f'Changed originals backed up under backups/{backup.name}/')
    return len(changes)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dest', default='~/.config/herdr-app')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    install(args.dest, args.dry_run)
