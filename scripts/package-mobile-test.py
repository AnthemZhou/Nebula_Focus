"""Package a standalone fictional iPhone test vault; never a public release.

Only the named sample files and three runtime files are copied. The repository
manifest is not edited, and no user's vault or plugin settings are read.
"""
from pathlib import Path
import argparse
import hashlib
import json
import re
import shutil
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent
SAMPLE = ROOT / 'examples' / 'mobile-vault'
FILES = (
    'Home.md',
    'Bases/想法收集箱.base', 'Bases/项目看板.base', 'Bases/图片画廊.base',
    'Ideas/01-short.md', 'Ideas/02-long-title.md', 'Ideas/03-many-tags.md',
    'Ideas/04-english.md', 'Ideas/05-image.md', 'Ideas/06-empty.md',
    'Projects/移动端版式实验.md', 'Projects/多语言输入实验.md', 'Projects/长标题与边缘滚动检查.md',
    'Assets/色彩条纹.md', 'Assets/圆形构图.md', 'Assets/没有图片的样例.md',
    'Media/color-bars.svg', 'Media/circles.svg',
)


def read_regular(path, boundary):
    relative = path.relative_to(ROOT)
    # Reject symlinked directories too: a named example directory must not
    # redirect this allowlist into a real vault outside the repository.
    candidates = [ROOT.joinpath(*relative.parts[:index]) for index in range(1, len(relative.parts) + 1)]
    if (not path.is_file() or any(candidate.is_symlink() for candidate in candidates)
            or not path.resolve().is_relative_to(boundary.resolve())):
        raise SystemExit(f'Missing or unsafe input: {path.relative_to(ROOT)}')
    return path.read_bytes()


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--name', default='Nebula-Focus-iPhone-Test',
                        help='New output directory name inside dist; existing test vaults are never overwritten.')
    args = parser.parse_args()
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,79}', args.name):
        raise SystemExit('Use a simple output name (letters, digits, hyphens and underscores).')
    dist = ROOT / 'dist'
    if dist.is_symlink():
        raise SystemExit('dist must not be a symlink.')
    dist.mkdir(exist_ok=True)
    output = dist / args.name
    archive = dist / f'{args.name}.zip'
    checksum = dist / f'{args.name}.sha256'
    if any(path.exists() or path.is_symlink() for path in (output, archive, checksum)):
        raise SystemExit('Output already exists. Use --name with a new name to preserve prior test notes.')

    # Validate before creating output. A missing build is an error, not a source
    # fallback: a phone cannot execute the TypeScript source directly.
    runtime = {name: read_regular(ROOT / name, ROOT) for name in ('main.js', 'manifest.json', 'styles.css')}
    manifest = json.loads(runtime['manifest.json'])
    if manifest.get('id') != 'nebula-focus':
        raise SystemExit('Unexpected plugin id; refusing to package another plugin.')
    if not runtime['main.js'].strip():
        raise SystemExit('main.js is empty. Run npm run build first.')
    samples = {name: read_regular(SAMPLE / name, SAMPLE) for name in FILES}
    # This copy is specifically for testing on mobile. It does not change the
    # project's desktop-only release metadata or claim mobile acceptance.
    manifest['isDesktopOnly'] = False

    with tempfile.TemporaryDirectory(prefix='.nebula-mobile-', dir=dist) as temporary:
        stage = Path(temporary) / args.name
        stage.mkdir()
        for name, data in samples.items():
            target = stage / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        plugin = stage / '.obsidian' / 'plugins' / 'nebula-focus'
        plugin.mkdir(parents=True)
        for name in ('main.js', 'styles.css'):
            (plugin / name).write_bytes(runtime[name])
        write_json(plugin / 'manifest.json', manifest)
        write_json(stage / '.obsidian' / 'community-plugins.json', ['nebula-focus'])
        write_json(stage / '.obsidian' / 'core-plugins.json', {
            'file-explorer': True, 'switcher': True, 'command-palette': True,
            'properties': True, 'outline': True, 'file-recovery': True, 'bases': True,
        })
        write_json(stage / '.obsidian' / 'app.json', {'livePreview': True, 'showInlineTitle': True})
        write_json(stage / '.obsidian' / 'types.json', {'types': {
            '这里写想法': 'text', '领域': 'multitext', '类型': 'text', '重要性': 'text',
            '文件和媒体': 'multitext', '状态': 'text', '截止日期': 'date',
            '项目下一步': 'text', '项目摘要': 'text',
        }})
        (stage / 'TEST-PACKAGE.md').write_text(
            '# iPhone test package / iPhone 测试包\n\n'
            f'Plugin version: {manifest.get("version", "unknown")}\n\n'
            'This is a local test build, not a published or certified mobile release. '
            'Only this package enables mobile loading. All notes and local artwork are fictional. '
            'Open Home.md after enabling Bases and Nebula Focus.\n\n'
            '这是独立手机测试库，不代表已通过 iPhone 验收或已上架。'
            '包内所有笔记和图形均为虚构示例；项目中的正式 manifest 不会被此脚本修改。'
            '在 Obsidian 中启用 Bases 与 Nebula Focus 后打开 Home.md。'
            '请勿把本库覆盖到自己的正式笔记库。\n', encoding='utf-8')
        files = sorted(path for path in stage.rglob('*') if path.is_file())
        checksums = ''.join(f'{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.relative_to(stage).as_posix()}\n'
                            for path in files)
        (stage / 'CONTENTS.sha256').write_text(checksums, encoding='utf-8')
        packed = Path(temporary) / archive.name
        with zipfile.ZipFile(packed, 'w', zipfile.ZIP_DEFLATED) as bundle:
            for path in sorted(stage.rglob('*')):
                if path.is_file():
                    bundle.write(path, (Path(args.name) / path.relative_to(stage)).as_posix())
        # No recursive replacement or deletion of an existing test vault.
        shutil.move(str(stage), output)
        shutil.move(str(packed), archive)
    checksum.write_text(f'{hashlib.sha256(archive.read_bytes()).hexdigest()}  {archive.name}\n', encoding='utf-8')
    print(f'Test vault: {output}')
    print(f'Archive: {archive}')
    print(f'Checksum: {checksum}')
    print('Test-only mobile manifest; no public release or user vault changed.')


if __name__ == '__main__':
    main()
