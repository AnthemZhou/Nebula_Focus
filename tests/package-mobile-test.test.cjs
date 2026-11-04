const {test} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync, execFileSync} = require('node:child_process');
const {mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, rmSync, existsSync, cpSync, renameSync} = require('node:fs');
const {tmpdir} = require('node:os');
const path = require('node:path');
const {createHash} = require('node:crypto');

const repo = path.join(__dirname, '..');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const name = 'Nebula-Focus-iPhone-Test';
function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'nebula-mobile-package-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const write = (relative, data) => {
    const target = path.join(root, relative);
    mkdirSync(path.dirname(target), {recursive: true}); writeFileSync(target, data);
  };
  write('scripts/package-mobile-test.py', readFileSync(path.join(repo, 'scripts/package-mobile-test.py')));
  cpSync(path.join(repo, 'examples/mobile-vault'), path.join(root, 'examples/mobile-vault'), {recursive: true});
  write('main.js', '/* compiled runtime fixture */');
  write('styles.css', '/* runtime style fixture */');
  write('manifest.json', JSON.stringify({id: 'nebula-focus', version: '1.0.0', isDesktopOnly: true}));
  const run = (...args) => spawnSync('python3', ['scripts/package-mobile-test.py', ...args], {cwd: root, encoding: 'utf8'});
  return {root, write, run};
}

test('mobile package includes only fictional fixtures and runtime, preserves release metadata and verifies hashes', t => {
  const f = fixture(t);
  f.write('examples/mobile-vault/PRIVATE.md', 'PRIVATE unlisted note');
  f.write('examples/mobile-vault/.obsidian/plugins/other/data.json', 'PRIVATE user configuration');
  f.write('src/private.ts', 'PRIVATE unreviewed source');
  const original = readFileSync(path.join(f.root, 'manifest.json'));
  const result = f.run(); assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(readFileSync(path.join(f.root, 'manifest.json')), original);
  const output = path.join(f.root, 'dist', name);
  const plugin = path.join(output, '.obsidian/plugins/nebula-focus');
  assert.equal(JSON.parse(readFileSync(path.join(plugin, 'manifest.json'))).isDesktopOnly, false);
  assert.deepEqual(JSON.parse(readFileSync(path.join(output, '.obsidian/community-plugins.json'))), ['nebula-focus']);
  assert.equal(JSON.parse(readFileSync(path.join(output, '.obsidian/core-plugins.json'))).bases, true);
  const entries = JSON.parse(execFileSync('python3', ['-c',
    'import json,sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps({i.filename:z.read(i).decode() for i in z.infolist()}))',
    path.join(f.root, 'dist', `${name}.zip`)], {encoding: 'utf8'}));
  assert(Object.keys(entries).every(entry => entry.startsWith(`${name}/`)));
  assert(!JSON.stringify(entries).includes('PRIVATE'));
  assert(Object.keys(entries).includes(`${name}/Bases/想法收集箱.base`));
  assert(Object.keys(entries).includes(`${name}/.obsidian/plugins/nebula-focus/main.js`));
  assert.equal(Object.keys(entries).filter(entry => entry.includes('/.obsidian/plugins/')).length, 3);
  const contents = readFileSync(path.join(output, 'CONTENTS.sha256'), 'utf8').trim().split('\n');
  assert.equal(contents.length, Object.keys(entries).length - 1);
  for (const line of contents) {
    const [digest, relative] = line.split('  ');
    assert.equal(digest, sha(readFileSync(path.join(output, relative))));
    assert.equal(entries[`${name}/${relative}`], readFileSync(path.join(output, relative), 'utf8'));
  }
  const [digest, archive] = readFileSync(path.join(f.root, 'dist', `${name}.sha256`), 'utf8').trim().split('  ');
  assert.equal(archive, `${name}.zip`);
  assert.equal(digest, sha(readFileSync(path.join(f.root, 'dist', archive))));
});

test('mobile package fails without a built runtime and creates no output vault', t => {
  const f = fixture(t); rmSync(path.join(f.root, 'main.js'));
  const result = f.run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /Missing or unsafe input: main\.js/);
  assert.equal(existsSync(path.join(f.root, 'dist', name)), false);
});

test('mobile package refuses existing vaults, archives and unsafe output names', t => {
  const f = fixture(t);
  f.write(`dist/${name}/sentinel.md`, 'Keep prior test notes');
  const existing = f.run(); assert.notEqual(existing.status, 0); assert.match(existing.stderr, /Output already exists/);
  assert.equal(readFileSync(path.join(f.root, 'dist', name, 'sentinel.md'), 'utf8'), 'Keep prior test notes');
  const traversal = f.run('--name', '../outside'); assert.notEqual(traversal.status, 0);
  assert.match(traversal.stderr, /simple output name/);
  f.write('dist/Existing.zip', 'Preserve previous archive');
  assert.notEqual(f.run('--name', 'Existing').status, 0);
  assert.equal(readFileSync(path.join(f.root, 'dist/Existing.zip'), 'utf8'), 'Preserve previous archive');
});

test('mobile package rejects a symlinked source file or fixture directory', t => {
  const file = fixture(t);
  file.write('private.txt', 'PRIVATE source');
  rmSync(path.join(file.root, 'examples/mobile-vault/Home.md'));
  symlinkSync(path.join(file.root, 'private.txt'), path.join(file.root, 'examples/mobile-vault/Home.md'));
  const first = file.run(); assert.notEqual(first.status, 0); assert.match(first.stderr, /unsafe input/);
  const folder = fixture(t);
  renameSync(path.join(folder.root, 'examples/mobile-vault'), path.join(folder.root, 'redirected-vault'));
  symlinkSync(path.join(folder.root, 'redirected-vault'), path.join(folder.root, 'examples/mobile-vault'));
  const second = folder.run(); assert.notEqual(second.status, 0); assert.match(second.stderr, /unsafe input/);
  assert.equal(existsSync(path.join(folder.root, 'dist', name)), false);
});

test('mobile package rejects a symlinked output directory', t => {
  const f = fixture(t);
  mkdirSync(path.join(f.root, 'private-vault'));
  symlinkSync(path.join(f.root, 'private-vault'), path.join(f.root, 'dist'));
  const result = f.run(); assert.notEqual(result.status, 0); assert.match(result.stderr, /dist must not be a symlink/);
  assert.equal(existsSync(path.join(f.root, 'private-vault', name)), false);
});
