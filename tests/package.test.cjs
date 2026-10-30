const {test} = require('node:test');
const assert = require('node:assert/strict');
const {execFileSync, spawnSync} = require('node:child_process');
const {mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, rmSync, existsSync} = require('node:fs');
const {tmpdir} = require('node:os');
const path = require('node:path');
const {createHash} = require('node:crypto');

const packageScript = readFileSync(path.join(__dirname, '../scripts/package.py'));
function fixture(t, initialize = true) {
  const root = mkdtempSync(path.join(tmpdir(), 'nebula-package-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const write = (name, text) => {mkdirSync(path.dirname(path.join(root, name)), {recursive: true}); writeFileSync(path.join(root, name), text);};
  const git = (...args) => execFileSync('git', args, {cwd: root, stdio: 'pipe'});
  write('scripts/package.py', packageScript);
  write('.gitignore', 'main.js\ndist/\nprivate/\n');
  write('manifest.json', JSON.stringify({id: 'nebula-focus', version: '1.0.0'}));
  write('styles.css', '/* public styles */');
  for (const name of ['LICENSE', 'THIRD-PARTY-NOTICES.md', 'README.md']) write(name, `Public ${name}\n`);
  write('src/main.ts', 'export const publicSource = true;\n');
  write('examples/vault/公开示例.md', '# Public example\n');
  if (initialize) {
    git('init', '--quiet'); git('add', '.');
    git('-c', 'user.name=Package Test', '-c', 'user.email=package@example.invalid', 'commit', '--quiet', '-m', 'Public fixture');
  }
  write('main.js', '/* compiled public plugin */');
  const run = () => spawnSync('python3', ['scripts/package.py'], {cwd: root, encoding: 'utf8'});
  const zip = name => JSON.parse(execFileSync('python3', ['-c',
    'import json,sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps({i.filename:{"text":z.read(i).decode(),"mode":i.external_attr>>16} for i in z.infolist()}))',
    path.join(root, 'dist', name)], {encoding: 'utf8'}));
  return {root, write, git, run, zip};
}

test('packages only reviewed index content, including staged additions and Unicode paths', t => {
  const f = fixture(t);
  f.write('src/新模块.ts', 'export const stagedFeature = true;\n'); f.git('add', 'src/新模块.ts');
  f.write('src/main.ts', 'PRIVATE unstaged worktree change');
  f.write('src/untracked.ts', 'PRIVATE new unreviewed source');
  f.write('private/vault.md', 'PRIVATE ignored note');
  f.write('native-reading-ui/docs/content-before.json', 'PRIVATE note paths');
  f.write('native-reading-ui/docs/validation.md', 'PRIVATE validation notes');
  f.write('native-reading-ui/backups/vault.zip', 'PRIVATE backup');
  f.write('examples/vault/untracked.md', 'PRIVATE example-folder note');
  f.write('examples/vault/公开示例.md', 'PRIVATE unstaged example change');
  f.write('dist/nebula-focus-0.9.2.zip', 'PRIVATE old archive');
  const result = f.run(); assert.equal(result.status, 0, result.stderr);
  const source = f.zip('nebula-focus-1.0.0-source.zip');
  const tracked = f.git('ls-files', '--cached', '-z').toString().split('\0').filter(Boolean).map(name => `nebula-focus/${name}`).sort();
  assert.deepEqual(Object.keys(source).sort(), tracked);
  assert.equal(source['nebula-focus/src/main.ts'].text, 'export const publicSource = true;\n');
  assert.equal(source['nebula-focus/src/新模块.ts'].text, 'export const stagedFeature = true;\n');
  const examples = f.zip('nebula-focus-1.0.0-examples.zip');
  assert.deepEqual(Object.keys(examples), ['公开示例.md']);
  assert.equal(examples['公开示例.md'].text, '# Public example\n');
  const plugin = f.zip('nebula-focus-1.0.0.zip');
  assert.deepEqual(Object.keys(plugin).sort(), ['LICENSE', 'THIRD-PARTY-NOTICES.md', 'README.md', 'main.js', 'manifest.json', 'styles.css'].map(name => `nebula-focus/${name}`).sort());
  assert.equal(plugin['nebula-focus/main.js'].text, '/* compiled public plugin */');
  assert(!JSON.stringify({source, examples, plugin}).includes('PRIVATE'));
  const sums = readFileSync(path.join(f.root, 'dist/SHA256SUMS.txt'), 'utf8').trim().split('\n');
  assert.equal(sums.length, 3);
  for (const line of sums) {
    const [hash, name] = line.split('  ');
    assert.match(name, /^nebula-focus-1\.0\.0(?:-source|-examples)?\.zip$/);
    assert.equal(hash, createHash('sha256').update(readFileSync(path.join(f.root, 'dist', name))).digest('hex'));
  }
  assert.equal(readFileSync(path.join(f.root, 'dist/nebula-focus-0.9.2.zip'), 'utf8'), 'PRIVATE old archive');
});

test('a tracked symlink packages its reviewed link text without reading the private target', t => {
  const f = fixture(t);
  f.write('private/secret.txt', 'PRIVATE symlink target');
  symlinkSync('private/secret.txt', path.join(f.root, 'public-link'));
  f.git('add', 'public-link');
  const result = f.run(); assert.equal(result.status, 0, result.stderr);
  const source = f.zip('nebula-focus-1.0.0-source.zip');
  assert.equal(source['nebula-focus/public-link'].text, 'private/secret.txt');
  assert.equal(source['nebula-focus/public-link'].mode & 0o170000, 0o120000);
  assert(!JSON.stringify(source).includes('PRIVATE symlink target'));
});

test('packaging fails closed without Git and rejects unstaged release metadata', t => {
  const absent = fixture(t, false), missingGit = absent.run();
  assert.notEqual(missingGit.status, 0);
  assert.match(missingGit.stderr, /Git checkout/);
  assert.equal(existsSync(path.join(absent.root, 'dist')), false);
  const f = fixture(t);
  f.write('manifest.json', JSON.stringify({id: 'nebula-focus', version: '2.0.0'}));
  const changed = f.run(); assert.notEqual(changed.status, 0);
  assert.match(changed.stderr, /Stage the release asset changes.*manifest\.json/);
  assert.equal(existsSync(path.join(f.root, 'dist')), false);
});
