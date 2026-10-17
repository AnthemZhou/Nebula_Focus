from pathlib import Path
import json, zipfile, hashlib

root = Path(__file__).resolve().parent.parent
manifest = json.loads((root / 'manifest.json').read_text())
plugin_id, version = manifest['id'], manifest['version']
dist = root / 'dist'
dist.mkdir(exist_ok=True)
assets = ['main.js', 'manifest.json', 'styles.css']
for filename in assets:
    if not (root / filename).is_file():
        raise SystemExit(f'Missing release asset: {filename}')
with zipfile.ZipFile(dist / f'{plugin_id}-{version}.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for filename in assets + ['LICENSE', 'THIRD-PARTY-NOTICES.md', 'README.md']:
        archive.write(root / filename, f'{plugin_id}/{filename}')
with zipfile.ZipFile(dist / f'{plugin_id}-{version}-source.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(root.rglob('*')):
        if path.is_file() and not any(part in ('node_modules','dist','.git','test-results') for part in path.relative_to(root).parts):
            archive.write(path, f'{plugin_id}/{path.relative_to(root)}')
with zipfile.ZipFile(dist / f'{plugin_id}-{version}-examples.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in sorted((root / 'examples/vault').rglob('*')):
        if path.is_file(): archive.write(path, path.relative_to(root / 'examples/vault'))
names = [f'{plugin_id}-{version}.zip', f'{plugin_id}-{version}-source.zip', f'{plugin_id}-{version}-examples.zip']
(dist / 'SHA256SUMS.txt').write_text(''.join(f'{hashlib.sha256((dist / name).read_bytes()).hexdigest()}  {name}\n' for name in names))
print(f'Packaged {plugin_id} {version}')
