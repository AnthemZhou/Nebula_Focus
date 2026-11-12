const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const {transformSync} = require('esbuild');

function load(file, requireModule = require) {
  const mod = {exports: {}};
  new Function('module', 'exports', 'require', transformSync(readFileSync(file, 'utf8'), {loader: 'ts', format: 'cjs'}).code)(mod, mod.exports, requireModule);
  return mod.exports;
}
const {ExternalArchive, validArchiveRelativePath} = load('src/external-archive.ts');
const host = load('src/external-archive-node.ts', id => id === 'obsidian' ? {Platform: {isDesktop: true}} : require(id));
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function exists(value) {return fs.lstat(value).then(() => true, error => {if (error.code === 'ENOENT') return false; throw error;});}
async function write(value, data) {await fs.mkdir(path.dirname(value), {recursive: true}); await fs.writeFile(value, data);}
async function fixture(t, files = {'A.md': '# A\n中文内容', 'Nested/B.md': '# B\n[[A]]', 'Attachments/image.png': Buffer.from([0, 255, 4, 22])}) {
  // Canonicalize the OS temp directory: macOS's /var alias is itself a symlink,
  // and the archive deliberately refuses symlinked roots.
  const temp = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'nebula-archive-test-')));
  t.after(() => fs.rm(temp, {recursive: true, force: true}));
  const vaultRoot = path.join(temp, 'Vault'), archiveRoot = path.join(temp, 'Archives'), trashRoot = path.join(temp, 'Trash');
  await fs.mkdir(vaultRoot);
  for (const [relative, data] of Object.entries(files)) await write(path.join(vaultRoot, relative), data);
  const trashed = [], io = host.createNodeArchiveIO();
  const request = {
    vaultRoot, archiveRoot, label: 'Example project',
    items: Object.keys(files).map(relative => ({path: relative, removeSource: !relative.startsWith('Attachments/')})),
    async trashSource(relative) {
      await fs.mkdir(path.dirname(path.join(trashRoot, relative)), {recursive: true});
      await fs.rename(path.join(vaultRoot, relative), path.join(trashRoot, relative)); trashed.push(relative);
    },
  };
  return {temp, vaultRoot, archiveRoot, trashRoot, files, trashed, io, request, engine: new ExternalArchive(io)};
}
async function mutateManifest(manifest, modify) {
  const target = path.join(manifest.packagePath, 'manifest.json');
  const value = JSON.parse(await fs.readFile(target, 'utf8')); modify(value);
  await fs.writeFile(target, JSON.stringify(value));
}

test('the desktop host loads no Node module on import and blocks both mobile entry points', () => {
  const loaded = [];
  const mobile = load('src/external-archive-node.ts', id => {
    loaded.push(id); if (id === 'obsidian') return {Platform: {isDesktop: false}};
    throw new Error('Node must not load on mobile');
  });
  assert.deepEqual(loaded, ['obsidian']);
  assert.throws(() => mobile.createNodeArchiveIO(), /桌面/);
  assert.throws(() => mobile.defaultArchiveDirectory('Example'), /桌面/);
  assert.deepEqual(loaded, ['obsidian']);
  const folder = host.defaultArchiveDirectory('../../A/B\\C\u0000');
  assert.equal(path.dirname(folder), path.join(os.homedir(), 'Documents', 'Nebula Focus Archives'));
  assert.equal(host.defaultArchiveDirectory('...'), path.join(os.homedir(), 'Documents', 'Nebula Focus Archives', 'Vault'));
  assert.equal(host.defaultArchiveDirectory(' .. '), path.join(os.homedir(), 'Documents', 'Nebula Focus Archives', 'Vault'));
});

test('verified archive and restore preserve exact Markdown and binary bytes; shared attachments stay in place', async t => {
  const f = await fixture(t), archived = await f.engine.archiveFiles(f.request);
  assert.equal(archived.status, 'archived');
  assert.deepEqual(f.trashed, ['A.md', 'Nested/B.md']);
  for (const entry of archived.entries) {
    const expected = Buffer.from(f.files[entry.path]);
    assert.equal(entry.sha256, digest(expected)); assert.equal(entry.size, expected.length);
    assert.equal(entry.sourceRemoved, entry.removeSource);
    assert.deepEqual(await fs.readFile(path.join(archived.packagePath, 'files', entry.path)), expected);
    assert.equal(await exists(path.join(f.vaultRoot, entry.path)), !entry.removeSource);
    if (entry.removeSource) assert.deepEqual(await fs.readFile(path.join(f.trashRoot, entry.path)), expected);
  }
  const restored = await f.engine.restorePackage({vaultRoot: f.vaultRoot, packagePath: archived.packagePath});
  assert.deepEqual(restored.restored, ['A.md', 'Nested/B.md']);
  assert.deepEqual(restored.retained, ['Attachments/image.png']);
  for (const [relative, original] of Object.entries(f.files)) assert.deepEqual(await fs.readFile(path.join(f.vaultRoot, relative)), Buffer.from(original));
  assert.equal((await f.engine.inspectPackage(archived.packagePath)).status, 'restored');
  await assert.rejects(f.engine.restorePackage({vaultRoot: f.vaultRoot, packagePath: archived.packagePath}), /已存在/);
  assert.equal(await exists(archived.packagePath), true);
});

test('each archive gets a distinct package, even with the same timestamp and label', async t => {
  const f = await fixture(t, {'A.md': 'note'});
  const engine = new ExternalArchive({...f.io, now: () => '2026-01-01T00:00:00.000Z'});
  const request = {...f.request, items: [{path: 'A.md', removeSource: false}]};
  const first = await engine.archiveFiles(request), second = await engine.archiveFiles(request);
  assert.notEqual(first.packagePath, second.packagePath); assert.deepEqual(f.trashed, []);
  assert.equal((await engine.listPackages(f.archiveRoot)).length, 2);
});

test('copy write failure keeps every source and records a recoverable incomplete package', async t => {
  const f = await fixture(t);
  const engine = new ExternalArchive({...f.io, async writeExclusive(target, bytes) {
    if (target.endsWith('/Nested/B.md')) throw new Error('injected full disk');
    await f.io.writeExclusive(target, bytes);
  }});
  let failure;
  await assert.rejects(engine.archiveFiles(f.request), error => {failure = error; return /源文件已保留/.test(error.message);});
  assert.deepEqual(f.trashed, []);
  for (const relative of Object.keys(f.files)) assert.equal(await exists(path.join(f.vaultRoot, relative)), true);
  assert.equal(JSON.parse(await fs.readFile(path.join(failure.packagePath, 'manifest.json'))).status, 'copy-failed');
});

test('copy corruption is detected before the first source is trashed', async t => {
  const f = await fixture(t);
  const engine = new ExternalArchive({...f.io, writeExclusive: (target, bytes) => f.io.writeExclusive(target, Buffer.concat([Buffer.from(bytes), Buffer.from('corrupt')]))});
  await assert.rejects(engine.archiveFiles(f.request), /校验失败/); assert.deepEqual(f.trashed, []);
  assert.equal(await fs.readFile(path.join(f.vaultRoot, 'A.md'), 'utf8'), f.files['A.md']);
});

test('all payloads are reverified after copying; late corruption stops all source removal', async t => {
  const f = await fixture(t);
  const engine = new ExternalArchive({...f.io, async writeExclusive(target, bytes) {
    await f.io.writeExclusive(target, bytes);
    if (target.endsWith('/Attachments/image.png')) await fs.writeFile(path.join(path.dirname(path.dirname(target)), 'A.md'), 'late corruption');
  }});
  await assert.rejects(engine.archiveFiles(f.request), /校验失败/); assert.deepEqual(f.trashed, []);
});

test('source modifications during copying abort without moving source files', async t => {
  const f = await fixture(t);
  const engine = new ExternalArchive({...f.io, async replace(target, bytes) {
    await f.io.replace(target, bytes);
    if (JSON.parse(Buffer.from(bytes).toString()).status === 'copying') await fs.writeFile(path.join(f.vaultRoot, 'A.md'), 'new content');
  }});
  await assert.rejects(engine.archiveFiles(f.request), /源文件已变化/); assert.deepEqual(f.trashed, []);
  assert.equal(await fs.readFile(path.join(f.vaultRoot, 'A.md'), 'utf8'), 'new content');
});

test('source modifications after verification are checked again immediately before trash', async t => {
  const f = await fixture(t);
  const engine = new ExternalArchive({...f.io, async replace(target, bytes) {
    await f.io.replace(target, bytes);
    if (JSON.parse(Buffer.from(bytes).toString()).status === 'verified') await fs.writeFile(path.join(f.vaultRoot, 'A.md'), 'edited after copy');
  }});
  const manifest = await engine.archiveFiles(f.request);
  assert.equal(manifest.status, 'partial'); assert.deepEqual(f.trashed, []);
  assert.equal(await fs.readFile(path.join(f.vaultRoot, 'A.md'), 'utf8'), 'edited after copy');
  assert.equal(await fs.readFile(path.join(manifest.packagePath, 'files', 'A.md'), 'utf8'), f.files['A.md']);
});

test('trash failure stops later removals and partial restore retains unchanged sources', async t => {
  const f = await fixture(t, {'A.md': 'a', 'B.md': 'b', 'C.md': 'c'});
  const manifest = await f.engine.archiveFiles({...f.request, async trashSource(relative) {
    if (relative === 'B.md') throw new Error('trash denied'); await f.request.trashSource(relative);
  }});
  assert.equal(manifest.status, 'partial');
  assert.deepEqual(manifest.entries.map(entry => entry.sourceRemoved), [true, false, false]);
  assert.deepEqual(f.trashed, ['A.md']);
  const restored = await f.engine.restorePackage({vaultRoot: f.vaultRoot, packagePath: manifest.packagePath});
  assert.deepEqual(restored.restored, ['A.md']); assert.deepEqual(restored.retained, ['B.md', 'C.md']);
});

test('a no-op trash callback is treated as partial, never as successful removal', async t => {
  const f = await fixture(t);
  const manifest = await f.engine.archiveFiles({...f.request, async trashSource() {}});
  assert.equal(manifest.status, 'partial'); assert.ok(manifest.entries.every(entry => !entry.sourceRemoved));
});

test('manifest write failure before verified status prevents source deletion', async t => {
  const f = await fixture(t);
  const engine = new ExternalArchive({...f.io, async replace(target, bytes) {
    if (JSON.parse(Buffer.from(bytes).toString()).status === 'verified') throw new Error('manifest disk failure');
    await f.io.replace(target, bytes);
  }});
  await assert.rejects(engine.archiveFiles(f.request), /源文件已保留/); assert.deepEqual(f.trashed, []);
});

test('unsafe relative paths, hidden/config paths and duplicate selection fail before package creation', async t => {
  const f = await fixture(t);
  for (const invalid of ['', '.', '..', '../escape.md', '/absolute.md', 'a/../b.md', 'a//b.md', 'a\\b.md', 'C:/x.md', 'a:b.md', 'a\u0000.md', '.obsidian/plugins/x/main.js', '.trash/A.md', '.git/config', 'Folder/.hidden']) {
    assert.equal(validArchiveRelativePath(invalid), false, invalid);
    await assert.rejects(f.engine.archiveFiles({...f.request, items: [{path: invalid, removeSource: true}]}));
  }
  await assert.rejects(f.engine.archiveFiles({...f.request, items: [{path: 'A.md', removeSource: true}, {path: 'A.md', removeSource: true}]}), /重复/);
  await assert.rejects(f.engine.archiveFiles({...f.request, items: []}), /没有/);
  assert.equal(await exists(f.archiveRoot), false); assert.deepEqual(f.trashed, []);
});

test('custom vault configuration is protected case-insensitively for archive and restore', async t => {
  const f = await fixture(t, {'A.md': 'a', 'CustomConfig/plugins/p/main.js': 'untrusted'});
  await assert.rejects(f.engine.archiveFiles({...f.request, protectedPaths: ['customconfig']}), /配置目录/);
  assert.equal(await exists(f.archiveRoot), false);
  // Represent an otherwise valid foreign archive where this path was ordinary
  // content. The receiving vault's custom configuration still must be protected.
  const manifest = await f.engine.archiveFiles(f.request);
  await assert.rejects(f.engine.restorePackage({vaultRoot: f.vaultRoot, packagePath: manifest.packagePath, protectedPaths: ['CustomConfig']}), /配置目录/);
  assert.equal(await exists(path.join(f.vaultRoot, 'A.md')), false);
  assert.equal(await exists(path.join(f.vaultRoot, 'CustomConfig/plugins/p/main.js')), false);
});

test('case and Unicode aliases are refused before a package can restore colliding paths', async t => {
  const f = await fixture(t, {'A.md': 'a', 'Résumé.md': 'note'});
  await assert.rejects(f.engine.archiveFiles({...f.request, items: [{path: 'A.md', removeSource: true}, {path: 'a.md', removeSource: true}]}), /重复/);
  assert.equal(await exists(f.archiveRoot), false);
  const manifest = await f.engine.archiveFiles(f.request);
  const original = await fs.readFile(path.join(manifest.packagePath, 'manifest.json'));
  for (const duplicate of ['a.md', 'Re\u0301sume\u0301.md']) {
    await fs.writeFile(path.join(manifest.packagePath, 'manifest.json'), original);
    await mutateManifest(manifest, data => {data.entries.push({...data.entries[0], path: duplicate});});
    await assert.rejects(f.engine.restorePackage({vaultRoot: f.vaultRoot, packagePath: manifest.packagePath}), /重复/);
    assert.equal(await exists(path.join(f.vaultRoot, 'A.md')), false);
  }
});

test('nested roots, filesystem roots and relative roots are refused in either direction', async t => {
  const f = await fixture(t);
  for (const archiveRoot of [f.vaultRoot, path.join(f.vaultRoot, 'Archive'), f.temp, path.parse(f.temp).root, './Archive'])
    await assert.rejects(f.engine.archiveFiles({...f.request, archiveRoot}));
  await assert.rejects(f.engine.archiveFiles({...f.request, vaultRoot: path.parse(f.temp).root}));
  assert.deepEqual(f.trashed, []);
});

test('case aliases cannot put an archive inside its vault on case-insensitive filesystems', async t => {
  const f = await fixture(t), alias = path.join(f.temp, 'vAuLt');
  if (!await exists(alias)) return t.skip('case-sensitive filesystem');
  await assert.rejects(f.engine.archiveFiles({...f.request, archiveRoot: path.join(alias, 'Archive')}), /库外/);
  assert.equal(await exists(path.join(f.vaultRoot, 'Archive')), false);
});

test('symlink roots and selected symlink files or ancestor directories are rejected', async t => {
  const f = await fixture(t);
  const alias = path.join(f.temp, 'VaultAlias'); await fs.symlink(f.vaultRoot, alias, 'dir');
  await assert.rejects(f.engine.archiveFiles({...f.request, vaultRoot: alias}), /符号链接/);
  await fs.symlink(path.join(f.vaultRoot, 'A.md'), path.join(f.vaultRoot, 'Linked.md'));
  await fs.symlink(path.join(f.vaultRoot, 'Nested'), path.join(f.vaultRoot, 'LinkedFolder'), 'dir');
  for (const relative of ['Linked.md', 'LinkedFolder/B.md'])
    await assert.rejects(f.engine.archiveFiles({...f.request, items: [{path: relative, removeSource: true}]}), /符号链接/);
  assert.deepEqual(f.trashed, []);
});

test('payload corruption blocks restore before any original path is written', async t => {
  const f = await fixture(t), manifest = await f.engine.archiveFiles(f.request);
  await fs.writeFile(path.join(manifest.packagePath, 'files', 'Nested/B.md'), 'corrupt');
  await assert.rejects(f.engine.restorePackage({vaultRoot: f.vaultRoot, packagePath: manifest.packagePath}), /校验失败/);
  assert.equal(await exists(path.join(f.vaultRoot, 'A.md')), false);
});

test('tampered manifests cannot escape the payload or restore hidden configuration', async t => {
  const f = await fixture(t), manifest = await f.engine.archiveFiles(f.request);
  const original = await fs.readFile(path.join(manifest.packagePath, 'manifest.json'));
  for (const relative of ['../escape.md', '/escape.md', 'A/../../escape.md', '.obsidian/plugins/x/main.js', '.trash/x.md', 'Folder/.config']) {
    await fs.writeFile(path.join(manifest.packagePath, 'manifest.json'), original);
    await mutateManifest(manifest, data => {data.entries[0].path = relative;});
    await assert.rejects(f.engine.restorePackage({vaultRoot: f.vaultRoot, packagePath: manifest.packagePath}), /无效/);
    assert.equal(await exists(path.join(f.vaultRoot, 'A.md')), false);
  }
});

test('duplicate, nested and malformed manifest entries fail validation', async t => {
  const f = await fixture(t), manifest = await f.engine.archiveFiles(f.request);
  const original = await fs.readFile(path.join(manifest.packagePath, 'manifest.json'));
  for (const edit of [
    data => data.entries.push({...data.entries[0]}),
    data => {data.entries[1].path = 'A.md/child.md';},
    data => {data.entries[0].sha256 = 'invalid';},
    data => {data.entries[0].size = -1;},
    data => {data.entries[0].removeSource = false;},
    data => {data.entries = [];},
    data => {data.version = 2;},
    data => {data.restoredPaths = ['escape.md'];},
  ]) {
    await fs.writeFile(path.join(manifest.packagePath, 'manifest.json'), original);
    await mutateManifest(manifest, edit); await assert.rejects(f.engine.inspectPackage(manifest.packagePath));
  }
});

test('a conflict in the last destination rejects the whole restore, including identical existing notes', async t => {
  const f = await fixture(t), manifest = await f.engine.archiveFiles(f.request);
  await write(path.join(f.vaultRoot, 'Nested/B.md'), f.files['Nested/B.md']);
  await assert.rejects(f.engine.restorePackage({vaultRoot: f.vaultRoot, packagePath: manifest.packagePath}), /已存在/);
  assert.equal(await exists(path.join(f.vaultRoot, 'A.md')), false);
  assert.equal(await fs.readFile(path.join(f.vaultRoot, 'Nested/B.md'), 'utf8'), f.files['Nested/B.md']);
});

test('a changed retained attachment is a whole-operation restore conflict', async t => {
  const f = await fixture(t), manifest = await f.engine.archiveFiles(f.request);
  await fs.writeFile(path.join(f.vaultRoot, 'Attachments/image.png'), 'new image');
  await assert.rejects(f.engine.restorePackage({vaultRoot: f.vaultRoot, packagePath: manifest.packagePath}), /校验失败/);
  assert.equal(await exists(path.join(f.vaultRoot, 'A.md')), false);
  assert.equal(await fs.readFile(path.join(f.vaultRoot, 'Attachments/image.png'), 'utf8'), 'new image');
});

test('partial restore remains retryable only for this attempt’s unchanged files at the same target root', async t => {
  const f = await fixture(t, {'A.md': 'a', 'B.md': 'b'}), manifest = await f.engine.archiveFiles(f.request);
  const engine = new ExternalArchive({...f.io, async writeExclusive(target, bytes) {
    if (target === path.join(f.vaultRoot, 'B.md')) throw new Error('restore disk failure');
    await f.io.writeExclusive(target, bytes);
  }});
  await assert.rejects(engine.restorePackage({vaultRoot: f.vaultRoot, packagePath: manifest.packagePath}), /恢复未完成/);
  const partial = await f.engine.inspectPackage(manifest.packagePath);
  assert.equal(partial.status, 'restore-partial'); assert.deepEqual(partial.restoredPaths, ['A.md']);
  const otherVault = path.join(f.temp, 'OtherVault'); await write(path.join(otherVault, 'A.md'), 'a');
  await assert.rejects(f.engine.restorePackage({vaultRoot: otherVault, packagePath: manifest.packagePath}), /已存在/);
  const retry = await f.engine.restorePackage({vaultRoot: f.vaultRoot, packagePath: manifest.packagePath});
  assert.deepEqual(retry.restored, ['B.md']); assert.deepEqual(retry.retained, ['A.md']);
});

test('partial restore never overwrites a file edited between attempts', async t => {
  const f = await fixture(t, {'A.md': 'a', 'B.md': 'b'}), manifest = await f.engine.archiveFiles(f.request);
  const engine = new ExternalArchive({...f.io, async writeExclusive(target, bytes) {
    if (target === path.join(f.vaultRoot, 'B.md')) throw new Error('restore disk failure');
    await f.io.writeExclusive(target, bytes);
  }});
  await assert.rejects(engine.restorePackage({vaultRoot: f.vaultRoot, packagePath: manifest.packagePath}));
  await fs.writeFile(path.join(f.vaultRoot, 'A.md'), 'new edit');
  await assert.rejects(f.engine.restorePackage({vaultRoot: f.vaultRoot, packagePath: manifest.packagePath}), /校验失败/);
  assert.equal(await fs.readFile(path.join(f.vaultRoot, 'A.md'), 'utf8'), 'new edit');
  assert.equal(await exists(path.join(f.vaultRoot, 'B.md')), false);
});

test('restore refuses symlinks in the package, payload and destination ancestors', async t => {
  const f = await fixture(t), manifest = await f.engine.archiveFiles(f.request);
  const alias = path.join(f.temp, 'PackageAlias'); await fs.symlink(manifest.packagePath, alias, 'dir');
  await assert.rejects(f.engine.inspectPackage(alias), /符号链接/);
  const outside = path.join(f.temp, 'Outside'); await fs.mkdir(outside);
  await fs.rmdir(path.join(f.vaultRoot, 'Nested'));
  await fs.symlink(outside, path.join(f.vaultRoot, 'Nested'), 'dir');
  await assert.rejects(f.engine.restorePackage({vaultRoot: f.vaultRoot, packagePath: manifest.packagePath}), /符号链接/);
  assert.equal(await exists(path.join(f.vaultRoot, 'A.md')), false);
  await fs.unlink(path.join(f.vaultRoot, 'Nested'));
  await fs.unlink(path.join(manifest.packagePath, 'files', 'A.md'));
  await fs.symlink(path.join(f.trashRoot, 'A.md'), path.join(manifest.packagePath, 'files', 'A.md'));
  await assert.rejects(f.engine.restorePackage({vaultRoot: f.vaultRoot, packagePath: manifest.packagePath}), /符号链接/);
});

test('exclusive restore writes protect a destination created after preflight', async t => {
  const f = await fixture(t, {'A.md': 'a'}), manifest = await f.engine.archiveFiles(f.request);
  const engine = new ExternalArchive({...f.io, async writeExclusive(target, bytes) {
    if (target === path.join(f.vaultRoot, 'A.md')) await fs.writeFile(target, 'concurrent note');
    await f.io.writeExclusive(target, bytes);
  }});
  await assert.rejects(engine.restorePackage({vaultRoot: f.vaultRoot, packagePath: manifest.packagePath}), /恢复未完成/);
  assert.equal(await fs.readFile(path.join(f.vaultRoot, 'A.md'), 'utf8'), 'concurrent note');
  assert.equal(await fs.readFile(path.join(manifest.packagePath, 'files', 'A.md'), 'utf8'), 'a');
});

test('listing skips unrelated files and symlink packages and exposes malformed packages without reading their payload', async t => {
  const f = await fixture(t); assert.deepEqual(await f.engine.listPackages(f.archiveRoot), []);
  const manifest = await f.engine.archiveFiles(f.request);
  await fs.mkdir(path.join(f.archiveRoot, 'unrelated'));
  await fs.mkdir(path.join(f.archiveRoot, 'nebula-archive-broken'));
  await fs.symlink(manifest.packagePath, path.join(f.archiveRoot, 'nebula-archive-link'), 'dir');
  const listed = await f.engine.listPackages(f.archiveRoot);
  assert.equal(listed.length, 2);
  assert.equal(listed[0].status, 'archived'); assert.equal(listed[0].entryCount, 3);
  assert.equal(listed[1].status, 'invalid'); assert.ok(listed[1].errors.length);
});
