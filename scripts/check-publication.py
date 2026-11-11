#!/usr/bin/env python3
"""Audit the public bundle; does not read the user's Herdr configuration."""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import re
import socket
import struct
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
FORBIDDEN = {'.visual', '.state', '.env', '.DS_Store', 'backups', 'telemetry', 'AGENTS.md', 'jsconfig.json',
             'shared.json', 'settings.json', 'view.json', 'window.json', 'windows.json',
             'seen.json', 'installed.json', 'credentials.json'}
SECRETS = [
    re.compile(r'gh[pousr]_[A-Za-z0-9_]{20,}'),
    re.compile(r'github_pat_[A-Za-z0-9_]{20,}'),
    re.compile(r'AKIA[A-Z0-9]{16}'),
    re.compile(r'xox[baprs]-[A-Za-z0-9-]{15,}'),
    re.compile(r'-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----'),
    re.compile(r'sk-(?:proj-)?[A-Za-z0-9_-]{30,}'),
    re.compile(r'(?i)(?:password|api_key|access_token)\s*[:=]\s*[\"\'][A-Za-z0-9+/=_-]{16,}[\"\']'),
    re.compile(r'/(?:Users|home)/[A-Za-z0-9._-]+'),
    re.compile(r'\b(?:tb|sp|p)[a-f0-9]{32}\b'),
]


def png_chunks(data):
    if not data.startswith(b'\x89PNG\r\n\x1a\n'):
        raise ValueError('Invalid PNG')
    offset = 8
    chunks = []
    while offset < len(data):
        length = struct.unpack('>I', data[offset:offset + 4])[0]
        kind = data[offset + 4:offset + 8]
        if offset + 12 + length > len(data):
            raise ValueError('Truncated PNG')
        chunks.append(kind)
        offset += 12 + length
        if kind == b'IEND':
            if offset != len(data):
                raise ValueError('Unexpected data after PNG')
            break
    return chunks


def audit(root=ROOT, denied=()):
    problems = []
    # Local identity checks are computed at run time, never embedded in the repo.
    identity = [*denied, Path.home().name, socket.gethostname()]
    identity = [value for value in identity if len(value) >= 5 and value not in {'example', 'runner'}]
    manifest = json.loads((root / 'mods/kde3/icons/period/manifest.json').read_text())
    original_hashes = {item['sha256'] for item in manifest}
    entries = [p for p in root.rglob('*') if not any(
        part in {'.git', '__pycache__'} for part in p.relative_to(root).parts)]
    files = [p for p in entries if p.is_file()]
    for path in entries:
        if path.is_symlink():
            problems.append(f'{path.relative_to(root)}: symlink')
    if not (root / 'docs/screenshot.png').is_file():
        problems.append('docs/screenshot.png: missing reviewed demo screenshot')
    for path in files:
        relative = path.relative_to(root)
        if path.is_symlink():
            problems.append(f'{relative}: symlink')
            continue
        if any(part in FORBIDDEN or part.startswith('.env.') for part in relative.parts) or path.suffix in {'.jsonl', '.log', '.sock'} or path.name.endswith('.d.ts') or '.backup' in path.name:
            problems.append(f'{relative}: forbidden runtime/private artifact')
        if path.suffix not in {'.js', '.mjs', '.json', '.svg', '.md', '.py', '.png', '.xpm', ''}:
            problems.append(f'{relative}: unreviewed file type')
        data = path.read_bytes()
        if path.suffix == '.png':
            digest = hashlib.sha256(data).hexdigest()
            if str(relative) == 'docs/screenshot.png':
                allowed = {b'IHDR', b'IDAT', b'IEND', b'sRGB', b'gAMA', b'pHYs', b'cHRM'}
                try:
                    if set(png_chunks(data)) - allowed:
                        problems.append(f'{relative}: unexpected PNG metadata')
                except ValueError as error:
                    problems.append(f'{relative}: {error}')
            elif str(relative).startswith('mods/kde3/icons/period/') and digest in original_hashes:
                pass
            else:
                problems.append(f'{relative}: unreviewed image')
            continue
        content = data.decode('utf-8', errors='replace')
        for pattern in SECRETS:
            if pattern.search(content):
                problems.append(f'{relative}: credential, private path or runtime ID pattern')
                break
        if any(value.casefold() in content.casefold() for value in identity):
            problems.append(f'{relative}: local/private identity string')
        if path.suffix == '.svg':
            try:
                tree = ET.fromstring(content)
                for node in tree.iter():
                    if node.tag.rsplit('}', 1)[-1] in {'script', 'foreignObject'}:
                        problems.append(f'{relative}: active SVG content')
                    for key, value in node.attrib.items():
                        if key.rsplit('}', 1)[-1] != 'href':
                            continue
                        if value.startswith('data:image/png;base64,'):
                            digest = hashlib.sha256(base64.b64decode(value.split(',', 1)[1], validate=True)).hexdigest()
                            if digest not in original_hashes:
                                problems.append(f'{relative}: unreviewed embedded image')
                        elif '://' in value or value.startswith('data:'):
                            problems.append(f'{relative}: external/unreviewed image reference')
            except (ValueError, ET.ParseError) as error:
                problems.append(f'{relative}: invalid SVG: {error}')
    keys = json.loads((root / 'keys.json').read_text())
    if set(keys) != {'layout:kde3'}:
        problems.append('keys.json: contains unrelated keybinding sections')
    return len(files), problems


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--deny', action='append', default=[], help='Additional private string to reject (not printed)')
    args = parser.parse_args()
    count, problems = audit(denied=args.deny)
    for problem in problems:
        print(problem)
    if problems:
        sys.exit(1)
    print(f'PASS: {count} public files scanned; no detected private artifacts or credential patterns.')
