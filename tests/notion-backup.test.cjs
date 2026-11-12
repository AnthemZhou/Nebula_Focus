const {test} = require('node:test');
const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const {mkdtempSync, mkdirSync, readFileSync, writeFileSync, symlinkSync, rmSync, existsSync} = require('node:fs');
const {tmpdir} = require('node:os');
const path = require('node:path');
const {createHash} = require('node:crypto');

const script = path.join(__dirname, '../scripts/import-notion-backup.py');
const sourceId = '11111111-1111-4111-8111-111111111111';
const projectSourceId = '22222222-2222-4222-8222-222222222222';
const pageId = '33333333-3333-4333-8333-333333333333';
const projectId = '44444444-4444-4444-8444-444444444444';
const missingId = '55555555-5555-4555-8555-555555555555';
const url = id => `https://www.notion.so/${id.replaceAll('-', '')}`;
const formula = `formulaResult://${sourceId}/${pageId}/result`;
const note = `Records/${sourceId}/${pageId}.md`;
const sha = value => createHash('sha256').update(value).digest('hex');

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), 'nebula-notion-backup-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  const vault = path.join(root, 'vault'); mkdirSync(vault);
  const bundle = {
    snapshotAt: '2026-01-01T00:00:00Z', rootPageId: pageId,
    sources: [
      {id: sourceId, name: '流水样例', schema: {
        '摘要': {type: 'title'}, '金额': {type: 'number', number_format: 'yuan'},
        '日期': {type: 'date'}, '核对': {type: 'checkbox'}, '类别': {type: 'select'},
        '项目': {type: 'relation', dataSourceUrl: `collection://${projectSourceId}`},
        '计算结果': {type: 'formula'}, '附件': {type: 'file'},
      }, rows: [{url: url(pageId), '摘要': '样例收入', '金额': 1234.56, 'date:日期:start': '2026-01-01',
        '核对': '__YES__', '类别': '服务', '项目': JSON.stringify([url(projectId)]), '计算结果': formula}]},
      {id: projectSourceId, name: '项目样例', schema: {'项目名称': {type: 'title'}},
        rows: [{url: url(projectId), '项目名称': '虚构项目'}]},
    ],
    pages: [{id: pageId, title: '样例收入', url: url(pageId),
      text: `<page><content>原始正文\n\n项目：<mention url="${url(projectId)}" />\n日期：<date start="2026-01-01" /></content></page>`},
    {id: projectId, title: '虚构项目', url: url(projectId), content: '项目说明。'}],
    computed: {}, assets: {},
  };
  const output = path.join(vault, 'Backup');
  const read = relative => readFileSync(path.join(output, relative), 'utf8');
  const run = (...extra) => {
    writeFileSync(path.join(root, 'bundle.json'), JSON.stringify(bundle));
    return spawnSync('python3', [script, '--bundle', path.join(root, 'bundle.json'), '--vault', vault,
      '--folder', 'Backup', ...extra], {encoding: 'utf8'});
  };
  return {root, vault, output, bundle, read, run};
}

test('backup preserves native data and creates an offline linked record graph with provenance', t => {
  const f = fixture(t);
  const result = f.run(); assert.equal(result.status, 0, result.stderr);
  const content = f.read(note);
  assert.match(content, /"金额": 1234\.56/);
  assert.match(content, /"核对": true/);
  assert.match(content, /"日期": "2026-01-01"/);
  assert.match(content, /"nf_source_id": "33333333-/);
  assert.match(content, /"nf_unavailable_fields": \["计算结果"\]/);
  assert(!content.includes(`"计算结果": 0`));
  assert(content.includes(`[[Backup/Records/${projectSourceId}/${projectId}|虚构项目]]`));
  assert(content.includes('原始正文\n\n项目：[['));
  assert(content.includes('日期：2026-01-01'));
  const index = JSON.parse(f.read('index.json'));
  assert.equal(index.records[pageId].path, `Backup/${note}`);
  assert.deepEqual(index.records[pageId].relations['项目'], [projectId]);
  const report = JSON.parse(f.read('import-report.json'));
  assert.equal(report.recordCount, 2);
  assert(report.issues.some(issue => issue.kind === 'missing-computed-value'));
  assert.deepEqual(JSON.parse(f.read(report.sourceSnapshot)), f.bundle);
  const base = JSON.parse(f.read(`Bases/${sourceId}.base`));
  assert.equal(base.formulas['记录'], 'file.asLink(note["摘要"])');
  assert(base.views[0].order.includes('note.金额'));
  assert(base.filters.and[0].includes(sourceId));
});

test('resolved computed values remain explicitly marked as snapshots and missing relations remain URLs', t => {
  const f = fixture(t);
  f.bundle.computed[formula] = {value: -0.42};
  f.bundle.sources[0].rows[0]['项目'] = [url(projectId), url(missingId)];
  const result = f.run(); assert.equal(result.status, 0, result.stderr);
  assert.match(f.read(note), /"计算结果": -0\.42/);
  assert.match(f.read(note), /"nf_snapshot_fields": \["计算结果"\]/);
  assert(f.read(note).includes(url(missingId)));
  assert(JSON.parse(f.read('import-report.json')).issues.some(issue => issue.kind === 'unresolved-relation'));
});

test('repeat imports are idempotent, refresh untouched notes, and never overwrite local edits', t => {
  const f = fixture(t);
  assert.equal(f.run().status, 0);
  const original = f.read(note);
  assert.equal(f.run().status, 0);
  assert.equal(f.read(note), original);
  assert.equal(JSON.parse(f.read('import-report.json')).written, 0);
  f.bundle.sources[0].rows[0]['金额'] = 200;
  assert.equal(f.run().status, 0);
  assert.match(f.read(note), /"金额": 200/);
  const manual = f.read(note) + '\n本地手写补充。\n';
  writeFileSync(path.join(f.output, note), manual);
  f.bundle.sources[0].rows[0]['金额'] = 300;
  assert.equal(f.run().status, 2);
  assert.equal(f.read(note), manual);
  const conflict = JSON.parse(f.read('import-report.json')).conflicts.find(item => item.path === note);
  assert(conflict);
  assert.match(f.read(conflict.incoming), /"金额": 300/);
  assert.equal(JSON.parse(f.read('index.json')).records[pageId].snapshotStatus, 'local-edits-preserved');
  assert.equal(existsSync(path.join(f.output, '.nebula-import.lock')), false);
});

test('records absent from a later partial sample are not deleted', t => {
  const f = fixture(t);
  assert.equal(f.run().status, 0);
  const original = f.read(note);
  f.bundle.sources[0].rows = [];
  f.bundle.pages = f.bundle.pages.filter(page => page.id !== pageId);
  delete f.bundle.rootPageId;
  assert.equal(f.run().status, 0);
  assert.equal(f.read(note), original);
  assert.equal(JSON.parse(f.read('index.json')).records[pageId].snapshotStatus, 'retained-from-earlier-import');
});

test('downloaded attachments are copied by hash and referenced locally; bad hashes stop the import', t => {
  const f = fixture(t);
  const source = path.join(f.root, 'receipt.pdf');
  writeFileSync(source, 'fictional receipt fixture');
  const reference = 'notion-file-block://fixture/receipt';
  const bytes = readFileSync(source);
  f.bundle.assets[reference] = {path: source, sha256: sha(bytes)};
  f.bundle.sources[0].rows[0]['附件'] = JSON.stringify([reference]);
  assert.equal(f.run().status, 0);
  assert(f.read(note).includes(`[[Backup/Attachments/${sha(bytes)}.pdf]]`));
  assert.equal(f.read(`Attachments/${sha(bytes)}.pdf`), bytes.toString());
  f.bundle.assets[reference].sha256 = 'bad';
  const bad = f.run(); assert.equal(bad.status, 1); assert.match(bad.stderr, /hash mismatch/);
});

test('explicit attachment names retain Unicode, sanitize wiki syntax, and preserve local edits on reimport', t => {
  const f = fixture(t);
  const source = path.join(f.root, 'local-file.pdf');
  const bytes = Buffer.from('fictional named receipt');
  writeFileSync(source, bytes);
  const reference = 'https://prod-files-secure.s3.us-west-2.amazonaws.com/example/receipt.pdf?X-Amz-Signature=fictional';
  f.bundle.assets[reference] = {path: source, sha256: sha(bytes), name: '报销[凭证]|第一张\n中文 样例.pdf'};
  f.bundle.sources[0].rows[0]['附件'] = [reference];
  assert.equal(f.run().status, 0);
  const expected = `[[Backup/Attachments/${sha(bytes)}.pdf|报销 凭证 第一张 中文 样例.pdf]]`;
  assert.ok(f.read(note).includes(expected));
  assert.equal(f.read(`Attachments/${sha(bytes)}.pdf`), bytes.toString());
  const original = f.read(note);
  assert.equal(f.run().status, 0);
  assert.equal(f.read(note), original);
  assert.equal(JSON.parse(f.read('import-report.json')).written, 0);
  const manual = original + '\n保留本地补充。\n';
  writeFileSync(path.join(f.output, note), manual);
  f.bundle.assets[reference].name = '新名称凭证.pdf';
  assert.equal(f.run().status, 2);
  assert.equal(f.read(note), manual);
  const conflict = JSON.parse(f.read('import-report.json')).conflicts.find(item => item.path === note);
  assert.ok(f.read(conflict.incoming).includes(`[[Backup/Attachments/${sha(bytes)}.pdf|新名称凭证.pdf]]`));
  assert.equal(f.read(`Attachments/${sha(bytes)}.pdf`), bytes.toString());
});

test('empty sanitized attachment labels fall back to the original unaliased hash link', t => {
  const f = fixture(t);
  const source = path.join(f.root, 'receipt.pdf');
  writeFileSync(source, 'fictional empty-label receipt');
  const bytes = readFileSync(source);
  const reference = 'notion-file-block://fixture/named-receipt';
  f.bundle.assets[reference] = {path: source, name: '[]|\n\r'};
  f.bundle.sources[0].rows[0]['附件'] = [reference];
  assert.equal(f.run().status, 0);
  assert.ok(f.read(note).includes(`[[Backup/Attachments/${sha(bytes)}.pdf]]`));
  assert.ok(!f.read(note).includes('.pdf|'));
});

test('undownloaded signed Notion attachments remain source references, while ordinary external URLs remain usable', t => {
  const f = fixture(t);
  const known = [
    'https://prod-files-secure.s3.us-west-2.amazonaws.com/fixture/receipt.pdf?X-Amz-Signature=fictional&X-Amz-Expires=60',
    'https://prod-files-secure.s3.amazonaws.com/fixture/receipt.pdf?x-amz-signature=fictional',
    'https://prod-files-public.s3.us-west-2.amazonaws.com/fixture/receipt.pdf?X-Amz-Signature=fictional',
    'https://files.notion.so/fixture/receipt.pdf?X-Amz-Signature=fictional',
    'https://s3-us-west-2.amazonaws.com/secure.notion-static.com/fixture/receipt.pdf?X-Amz-Signature=fictional',
  ];
  const external = [
    'https://example.org/receipt.pdf',
    'https://example.org/receipt.pdf?X-Amz-Signature=external',
    'https://another-bucket.s3.us-west-2.amazonaws.com/receipt.pdf?X-Amz-Signature=external',
    'https://prod-files-secure.s3.us-west-2.amazonaws.com.evil.example/receipt.pdf?X-Amz-Signature=external',
    'https://prod-files-secure.s3.us-west-2.amazonaws.com/fixture/public.pdf',
  ];
  f.bundle.sources[0].rows[0]['附件'] = [...known, ...external];
  assert.equal(f.run().status, 0);
  const values = JSON.parse(/^"附件": (.*)$/m.exec(f.read(note))[1]);
  assert.deepEqual(values.slice(0, known.length), known.map(() => '未下载的 Notion 附件（原始引用保存在快照中）'));
  assert.deepEqual(values.slice(known.length), external);
  const report = JSON.parse(f.read('import-report.json'));
  for (const reference of known) {
    assert.ok(!f.read(note).includes(reference));
    assert.ok(report.issues.some(item => item.detail === reference));
    assert.ok(f.read(report.sourceSnapshot).includes(reference));
  }
});

test('unsupported body blocks and truncated pages are retained and reported', t => {
  const f = fixture(t);
  f.bundle.pages[0].text = '<content>Original\n<custom-block>keep it</custom-block></content>';
  f.bundle.pages[0].metadata = {truncated: true, unknown_block_count: 2};
  assert.equal(f.run().status, 0);
  assert(f.read(note).includes('<custom-block>keep it</custom-block>'));
  const issues = JSON.parse(f.read('import-report.json')).issues;
  assert(issues.some(issue => issue.kind === 'incomplete-page-truncated'));
  assert(issues.some(issue => issue.kind === 'source-markup-preserved'));
});

test('Notion encoded file descriptors never become misleading local filesystem links', t => {
  const f = fixture(t);
  const descriptor = 'file://%7B%22id%22%3A%22fictional%22%7D';
  f.bundle.sources[0].rows[0]['附件'] = JSON.stringify([descriptor]);
  assert.equal(f.run().status, 0);
  assert(!f.read(note).includes('file://'));
  assert(f.read(note).includes('未下载的 Notion 附件'));
  const report = JSON.parse(f.read('import-report.json'));
  assert(report.issues.some(item => item.detail === descriptor));
  assert(f.read(report.sourceSnapshot).includes(descriptor));
});

test('invalid IDs, duplicate records, numeric strings and traversal fail before any import writes', t => {
  for (const change of [
    f => {f.bundle.sources[0].rows[0].url = 'https://evil.example/' + pageId;},
    f => {f.bundle.sources[0].rows.push({...f.bundle.sources[0].rows[0]});},
    f => {f.bundle.sources[0].rows[0]['金额'] = '1,234.56';},
    f => {f.bundle.sources[0].schema.nf_source_id = {type: 'text'};},
  ]) {
    const f = fixture(t); change(f);
    assert.equal(f.run().status, 1);
    assert.equal(existsSync(f.output), false);
  }
  const f = fixture(t);
  assert.equal(f.run('--folder', '../outside').status, 1);
  assert.equal(existsSync(path.join(f.root, 'outside')), false);
});

test('output symlinks and active import locks are rejected', t => {
  const f = fixture(t);
  mkdirSync(path.join(f.root, 'private'));
  symlinkSync(path.join(f.root, 'private'), f.output);
  assert.equal(f.run().status, 1);
  assert.equal(existsSync(path.join(f.root, 'private', 'manifest.json')), false);
  rmSync(f.output);
  mkdirSync(f.output);
  writeFileSync(path.join(f.output, '.nebula-import.lock'), '');
  const locked = f.run(); assert.equal(locked.status, 1); assert.match(locked.stderr, /Another import/);
});
