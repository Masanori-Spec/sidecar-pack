#!/usr/bin/env python3
"""Deterministic source ZIP plus a verified per-file SHA-256 manifest.

This source-release packager is independent of the product's STORE ZIP engine.
It packages only project sources and synthetic verification evidence.
"""
import hashlib
import json
from pathlib import Path
import sys
import zipfile

root = Path(__file__).resolve().parent.parent
out = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else root.parent / 'sidecar-pack-output'
if out == root or root in out.parents:
    raise SystemExit('Release output must be outside the source project.')
out.mkdir(parents=True, exist_ok=True)
exclude = {'.git', 'node_modules', 'dist', 'test-results', 'browser-artifacts',
           'playwright-report', '__pycache__', 'out', '.cache'}
files = sorted(p for p in root.rglob('*') if p.is_file()
               and not any(part in exclude for part in p.relative_to(root).parts)
               and p.name != 'benchmark-ci.json' and not p.name.endswith('.log'))
if any(p.is_symlink() for p in files):
    raise SystemExit('Source release may not include symbolic links.')
records = [{'path': p.relative_to(root).as_posix(), 'bytes': p.stat().st_size,
            'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]
manifest = {'project': 'Sidecar Pack', 'format': 1, 'files': records}
manifest_path = out / 'source-manifest.json'
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
archive = out / 'sidecar-pack.zip'
with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for p in files:
        info = zipfile.ZipInfo('sidecar-pack/' + p.relative_to(root).as_posix(), (2020, 1, 1, 0, 0, 0))
        info.create_system = 3
        info.external_attr = 0o100644 << 16
        info.compress_type = zipfile.ZIP_DEFLATED
        z.writestr(info, p.read_bytes())
with zipfile.ZipFile(archive) as z:
    assert z.testzip() is None
    assert len(z.namelist()) == len(records)
    for row in records:
        data = z.read('sidecar-pack/' + row['path'])
        assert len(data) == row['bytes']
        assert hashlib.sha256(data).hexdigest() == row['sha256']
release = {'archive': str(archive), 'bytes': archive.stat().st_size,
           'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
           'files': len(files), 'manifest': str(manifest_path)}
(out / 'release.json').write_text(json.dumps(release, indent=2) + '\n', encoding='utf-8')
print(json.dumps(release, indent=2))
