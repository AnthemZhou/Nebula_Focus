from pathlib import Path, PurePosixPath
import hashlib
import json
import re
import stat
import subprocess
import zipfile

root = Path(__file__).resolve().parent.parent


def git(*args):
    try:
        return subprocess.check_output(['git', *args], cwd=root, stderr=subprocess.PIPE)
    except (OSError, subprocess.CalledProcessError) as error:
        raise SystemExit('Packaging requires a Git checkout with public release files staged.') from error


# The index is the reviewed source snapshot. Never traverse the working tree:
# ignored backups, local validation data and untracked notes are not release input.
if Path(git('rev-parse', '--show-toplevel').decode().strip()).resolve() != root:
    raise SystemExit('Run this packaging script from its own Git repository.')
indexed = {}
excluded = {'.git', 'node_modules', 'dist', 'test-results'}
for record in git('ls-files', '--cached', '--stage', '-z').split(b'\0'):
    if not record:
        continue
    metadata, encoded_path = record.split(b'\t', 1)
    mode, object_id, stage = metadata.split()
    path = encoded_path.decode('utf-8')
    relative = PurePosixPath(path)
    if stage != b'0':
        raise SystemExit(f'Resolve the staged merge conflict before packaging: {path}')
    if excluded.intersection(relative.parts):
        continue
    if not (stat.S_ISREG(int(mode, 8)) or stat.S_ISLNK(int(mode, 8))):
        raise SystemExit(f'Unsupported Git entry in release source: {path}')
    indexed[path] = (int(mode, 8), object_id.decode('ascii'))


def source_bytes(path):
    if path not in indexed:
        raise SystemExit(f'Stage this public release file before packaging: {path}')
    # Read the blob, not the worktree path: an unstaged change or symlink target
    # must never replace the content that was reviewed and added to Git.
    return git('cat-file', 'blob', indexed[path][1])


def write_source(archive, path, destination):
    info = zipfile.ZipInfo(destination)
    info.create_system = 3
    info.external_attr = indexed[path][0] << 16
    info.compress_type = zipfile.ZIP_DEFLATED
    archive.writestr(info, source_bytes(path))


assets = ['main.js', 'manifest.json', 'styles.css']
asset_contents = {}
documents = ['LICENSE', 'THIRD-PARTY-NOTICES.md', 'README.md']
for filename in assets + documents:
    path = root / filename
    if not path.is_file() or path.is_symlink():
        raise SystemExit(f'Missing regular release asset: {filename}')
    asset_contents[filename] = path.read_bytes()
    if filename != 'main.js' and asset_contents[filename] != source_bytes(filename):
        raise SystemExit(f'Stage the release asset changes before packaging: {filename}')
manifest = json.loads(source_bytes('manifest.json'))
plugin_id, version = manifest['id'], manifest['version']
if not re.fullmatch(r'[A-Za-z0-9_-]+', plugin_id) or not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+(?:[-+][A-Za-z0-9.+-]+)?', version):
    raise SystemExit('Invalid plugin ID or release version.')

dist = root / 'dist'
dist.mkdir(exist_ok=True)
names = [f'{plugin_id}-{version}.zip', f'{plugin_id}-{version}-source.zip', f'{plugin_id}-{version}-examples.zip']
with zipfile.ZipFile(dist / names[0], 'w', zipfile.ZIP_DEFLATED) as archive:
    for filename in assets + documents:
        if filename == 'main.js':
            archive.writestr(f'{plugin_id}/{filename}', asset_contents[filename])
        else:
            write_source(archive, filename, f'{plugin_id}/{filename}')
with zipfile.ZipFile(dist / names[1], 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(indexed):
        write_source(archive, path, f'{plugin_id}/{path}')
with zipfile.ZipFile(dist / names[2], 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(indexed):
        relative = PurePosixPath(path)
        if relative.is_relative_to('examples/vault'):
            write_source(archive, path, str(relative.relative_to('examples/vault')))
# Only this version's three archives are checksummed; old local dist files are
# neither included inside an archive nor selected as release assets here.
(dist / 'SHA256SUMS.txt').write_text(''.join(f'{hashlib.sha256((dist / name).read_bytes()).hexdigest()}  {name}\n' for name in names))
print(f'Packaged {plugin_id} {version} from the staged Git snapshot')
