"""Create a source-only Jira handover ZIP and verify every entry against its manifest."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import re
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT.parent / 'outputs' / 'prodflow-jira-2026-11-15'
VERSION = json.loads((ROOT / 'package.json').read_text(encoding='utf-8-sig'))['version']
ROOT_FILES = [
    '.env.example', '.gitignore', '.prettierignore', '.prettierrc.json',
    'compose.yaml', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml',
    'README.md', 'Uruchom-ProdFlow.cmd',
]
DIRECTORIES = ['apps', 'packages', 'scripts', 'docs', '.github']
EXCLUDED = {'node_modules', 'dist', '.data', '.pnpm-store', 'tmp', 'coverage', '.git', '__pycache__'}
FILES = [ROOT / item for item in ROOT_FILES]
for directory in DIRECTORIES:
    for item in (ROOT / directory).rglob('*'):
        relative = item.relative_to(ROOT)
        if item.is_file() and not any(part in EXCLUDED for part in relative.parts):
            if not item.name.endswith(('.log', '.tsbuildinfo', '.pyc')):
                FILES.append(item)
FILES = sorted(set(FILES))

# Never print secret contents; reject if any local environment value leaks into a payload.
secrets = []
env_file = ROOT / '.env'
if env_file.exists():
    for line in env_file.read_text(encoding='utf-8-sig').splitlines():
        if '=' not in line or line.lstrip().startswith('#'):
            continue
        key, value = line.split('=', 1)
        if re.search(r'PASSWORD|TOKEN|SECRET|DATABASE_URL', key) and len(value.strip()) >= 12:
            secrets.append(value.strip().encode())
records = []
payloads = {}
for item in FILES:
    relative = item.relative_to(ROOT).as_posix()
    if item.is_symlink() or not item.resolve().is_relative_to(ROOT):
        raise RuntimeError('Refusing a linked file outside the source tree: ' + relative)
    if item.name == '.env' or (item.name.startswith('.env.') and item.name != '.env.example'):
        raise RuntimeError('Private environment file in payload: ' + relative)
    data = item.read_bytes()
    if any(secret in data for secret in secrets):
        raise RuntimeError('Local secret value found in payload: ' + relative)
    if b'-----BEGIN PRIVATE KEY-----' in data or b'-----BEGIN RSA PRIVATE KEY-----' in data:
        # Ignore these sentinel strings only in this scanner's own implementation.
        if relative != 'scripts/package-release.py':
            raise RuntimeError('Private key marker in payload: ' + relative)
    payloads['prodflow/' + relative] = data
    records.append({'path': relative, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
manifest = {
    'product': 'ProdFlow', 'version': VERSION, 'releaseDate': '2026-11-15',
    'createdAtUtc': datetime.now(timezone.utc).isoformat(),
    'kind': 'source snapshot; not a Git history or production release',
    'fileCount': len(records), 'files': records,
    'excluded': sorted(EXCLUDED | {'.env', '*.log', '*.tsbuildinfo', '*.pyc'}),
}
manifest_bytes = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode()
payloads['prodflow/ARCHIVE-MANIFEST.json'] = manifest_bytes
OUTPUT.mkdir(parents=True, exist_ok=True)
archive_path = OUTPUT / f'ProdFlow-{VERSION}-source-2026-11-15.zip'
if archive_path.exists():
    raise RuntimeError('Release ZIP already exists; use a new output directory to avoid replacing a published snapshot.')
with zipfile.ZipFile(archive_path, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
    for name, data in payloads.items():
        archive.writestr(name, data)
with zipfile.ZipFile(archive_path) as archive:
    assert archive.testzip() is None
    assert set(archive.namelist()) == set(payloads)
    for record in records:
        data = archive.read('prodflow/' + record['path'])
        assert len(data) == record['bytes']
        assert hashlib.sha256(data).hexdigest() == record['sha256']
    assert archive.read('prodflow/ARCHIVE-MANIFEST.json') == manifest_bytes
digest = hashlib.sha256(archive_path.read_bytes()).hexdigest()
(OUTPUT / 'SHA256SUMS.txt').write_text(f'{digest}  {archive_path.name}\n', encoding='utf-8')
(OUTPUT / 'ARCHIVE-MANIFEST.json').write_bytes(manifest_bytes)
(OUTPUT / 'package-verification.json').write_text(json.dumps({
    'archive': archive_path.name, 'sha256': digest, 'fileCount': len(records),
    'zipEntryCount': len(payloads), 'zipCrc': 'passed', 'manifestValidation': 'passed',
    'excludedPathsValidation': 'passed', 'localSecretValuesScan': 'passed',
    'bytes': archive_path.stat().st_size,
}, indent=2) + '\n', encoding='utf-8')
print(json.dumps({'archive': str(archive_path), 'sha256': digest, 'sourceFiles': len(records), 'bytes': archive_path.stat().st_size, 'verification': 'passed'}))
