const {test} = require('node:test');
const assert = require('node:assert/strict');
const {buildSync} = require('esbuild');
const code = buildSync({entryPoints: ['src/record-layout.ts'], bundle: true, platform: 'node', format: 'cjs', external: ['obsidian'], write: false}).outputFiles[0].text;
const moduleResult = {exports: {}};
new Function('require', 'module', 'exports', code)(name => {
  assert.equal(name, 'obsidian'); return {parseLinktext: link => ({path: link.split('#')[0], subpath: link.includes('#') ? '#' + link.split('#')[1] : ''})};
}, moduleResult, moduleResult.exports);
const {parseRecordLayouts, loadRecordLayout, relatedRecordRows, recordLayoutValue} = moduleResult.exports;
const tab = () => ({label: 'Costs', targetCollection: 'costs', relationProperty: 'Project', forwardProperty: 'Costs', titleProperty: 'Title', columns: ['Title', 'Amount']});
const profile = () => ({metrics: [{property: 'Contract', format: 'number', currency: 'CNY'}], tabs: [tab()]});
const config = (collection = 'projects') => ({version: 1, profiles: {[collection]: profile()}});
function fixture() {
  const files = new Map(), contents = new Map(), caches = new Map(), resolutions = new Map(), reads = [];
  const app = {vault: {
    getFileByPath: path => files.get(path) || null,
    getMarkdownFiles: () => [...files.values()].filter(file => file.extension === 'md'),
    async cachedRead(file) {reads.push(file.path); return contents.get(file.path);}
  }, metadataCache: {
    getFileCache: file => caches.get(file.path) || null,
    getFirstLinkpathDest: (path, source) => files.get(resolutions.get(source + '|' + path) || path) || null
  }};
  function file(path, frontmatter = {}) {
    const result = {path, extension: path.split('.').pop(), stat: {size: 1}};
    files.set(path, result); caches.set(path, {frontmatter}); return result;
  }
  function sidecar(path, value) {file(path); contents.set(path, typeof value === 'string' ? value : JSON.stringify(value));}
  return {app, files, caches, resolutions, contents, reads, file, sidecar};
}

test('versioned layout schema accepts declarative profiles and rejects malformed/executable shapes', () => {
  assert.deepEqual(parseRecordLayouts(JSON.stringify(config())), config());
  const invalid = [null, {}, {version: 2, profiles: {}}, {...config(), script: 'alert(1)'}, {version: 1, profiles: {projects: {...profile(), body: '<b>HTML</b>'}}}];
  for (const item of invalid) assert.equal(parseRecordLayouts(JSON.stringify(item)), null);
  for (const change of [t => t.columns = ['Amount'], t => t.columns = ['Title', 'Title'], t => t.sort = [{property: 'Date', direction: 'eval'}],
    t => t.filters = [{property: 'Status', operator: 'equals'}], t => t.filters = [{property: 'Status', operator: 'isEmpty', value: null}],
    t => t.filters = [{property: 'Amount', operator: 'eval', value: '1 + 1'}]]) {
    const value = config(); change(value.profiles.projects.tabs[0]); assert.equal(parseRecordLayouts(JSON.stringify(value)), null);
  }
  assert.equal(parseRecordLayouts('{"version":1,"profiles":{"__proto__":{"metrics":[],"tabs":[]}}}'), null);
  assert.equal(parseRecordLayouts(' '.repeat(262145)), null);
});

test('ancestor configuration uses exact collection, nearest matching profile and safe read-only fallback', async () => {
  const f = fixture(), record = f.file('Sample/Records/a.md');
  f.sidecar('nebula-record-layouts.json', config());
  f.sidecar('Sample/nebula-record-layouts.json', config('other'));
  assert.equal((await loadRecordLayout(f.app, record, 'projects')).path, 'nebula-record-layouts.json');
  f.sidecar('Sample/Records/nebula-record-layouts.json', config());
  assert.equal((await loadRecordLayout(f.app, record, 'projects')).path, 'Sample/Records/nebula-record-layouts.json');
  assert.equal((await loadRecordLayout(f.app, record, 'collection://projects')).profile, null);
  f.sidecar('Sample/Records/nebula-record-layouts.json', '{bad');
  const result = await loadRecordLayout(f.app, record, 'projects');
  assert.equal(result.profile, null); assert.match(result.error, /配置无效/);
  f.app.vault.cachedRead = async () => {throw new Error('offline');};
  assert.match((await loadRecordLayout(f.app, record, 'projects')).error, /无法读取/);
});

test('related rows require exact database and resolved record identity, ignoring duplicate title and body links', () => {
  const f = fixture(), project = f.file('Projects/a.md', {Title: 'Same'}), duplicate = f.file('Other/a.md', {Title: 'Same'});
  const a = f.file('Costs/a.md', {nf_source_collection: 'costs', Project: '[[Projects/a.md]]', Title: 'Expense A'});
  f.file('Costs/b.md', {nf_source_collection: 'other-costs', Project: '[[Projects/a.md]]'});
  f.file('Costs/c.md', {nf_source_collection: 'costs', Project: '[[Other/a.md]]'});
  f.file('Costs/d.md', {nf_source_collection: 'costs', Project: 'Same'});
  f.file('Costs/e.md', {nf_source_collection: 'costs', Notes: '[[Projects/a.md]]'});
  const snapshot = JSON.stringify([...f.caches]);
  assert.deepEqual(relatedRecordRows(f.app, project, tab()).rows.map(row => row.file.path), [a.path]);
  assert.deepEqual(relatedRecordRows(f.app, duplicate, tab()).rows.map(row => row.file.path), ['Costs/c.md']);
  assert.equal(JSON.stringify([...f.caches]), snapshot);
});

test('forward fallback never overrides a conflicting explicit backlink and preserves external/missing references', () => {
  const f = fixture(), project = f.file('project.md', {Costs: ['[[valid.md]]', '[[wrong.md]]', '[[empty.md]]', '[[unknown.md]]', '[[missing.md]]', 'https://notion.so/not-imported']});
  f.file('valid.md', {nf_source_collection: 'costs'});
  f.file('other.md');
  f.file('wrong.md', {nf_source_collection: 'costs', Project: '[[other.md]]'});
  f.file('empty.md', {nf_source_collection: 'costs', Project: []});
  f.file('unknown.md', {nf_source_collection: 'costs', Project: [], nf_unavailable_fields: ['Project']});
  const result = relatedRecordRows(f.app, project, tab());
  assert.deepEqual(result.rows.map(row => row.file.path), ['unknown.md', 'valid.md']);
  assert.deepEqual(result.unresolved, ['missing.md', 'https://notion.so/not-imported']);
});

test('explicit filters and sort preserve zero, numeric ordering, empty last and stable ties', () => {
  const f = fixture(), project = f.file('project.md');
  const add = (path, amount, status, date) => f.file(path, {nf_source_collection: 'costs', Project: '[[project.md]]', Amount: amount, Status: status, Date: date});
  add('a.md', 100, 'Confirmed', '2026-01-02'); add('b.md', 2, 'Confirmed', '2026-01-03'); add('c.md', 0, 'Confirmed', '2026-01-03');
  add('d.md', 1, 'Void', '2026-01-04'); add('e.md', null, 'Confirmed', null);
  const configured = {...tab(), filters: [{property: 'Status', operator: 'notEquals', value: 'Void'}], sort: [{property: 'Date', direction: 'desc'}, {property: 'Amount', direction: 'asc'}]};
  assert.deepEqual(relatedRecordRows(f.app, project, configured).rows.map(row => row.file.path), ['c.md', 'b.md', 'a.md', 'e.md']);
  configured.filters = [{property: 'Amount', operator: 'equals', value: 0}];
  assert.deepEqual(relatedRecordRows(f.app, project, configured).rows.map(row => row.file.path), ['c.md']);
});

test('unavailable metrics and absent source results never turn into zero; ordinary blank table cells stay blank', () => {
  const values = {Contract: 0, Received: null, Missing: 12, nf_snapshot_fields: ['Contract'], nf_unavailable_fields: ['Missing']};
  assert.deepEqual(recordLayoutValue(values, 'Contract'), {value: 0, snapshot: true, unavailable: false});
  assert.deepEqual(recordLayoutValue(values, 'Absent'), {value: undefined, snapshot: false, unavailable: true});
  assert.equal(recordLayoutValue(values, 'Missing').unavailable, true);
  assert.equal(recordLayoutValue(values, 'Absent', false).unavailable, false);
  assert.equal(recordLayoutValue(values, 'Received').value, null);
});

test('public fictional project example resolves its actual profile into three related tables', () => {
  const fs = require('node:fs'), path = require('node:path'), YAML = require('yaml');
  const root = path.resolve('examples/vault/Finance'), f = fixture();
  for (const filename of fs.readdirSync(root).filter(name => name.endsWith('.md'))) {
    const body = fs.readFileSync(path.join(root, filename), 'utf8'), match = /^---\n([\s\S]*?)\n---/.exec(body);
    if (match) f.file('Finance/' + filename, YAML.parse(match[1]));
  }
  f.app.metadataCache.getFirstLinkpathDest = target => f.files.get(target) || f.files.get(target + '.md') || null;
  const value = parseRecordLayouts(fs.readFileSync(path.join(root, 'nebula-record-layouts.json'), 'utf8'));
  assert.ok(value);
  const project = f.files.get('Finance/示例项目.md');
  const results = value.profiles['example-projects'].tabs.map(item => relatedRecordRows(f.app, project, item));
  assert.deepEqual(results.map(result => result.rows.length), [3, 3, 1]);
  assert.deepEqual(results.map(result => result.unresolved.length), [0, 0, 0]);
  assert.equal(results.flatMap(result => result.rows).some(row => row.file.path.endsWith('/其他项目费用.md')), false);
});

test('filters fail closed for unavailable calculations, including unmarked opaque formula results', () => {
  const f = fixture(), project = f.file('project.md');
  f.file('confirmed.md', {nf_source_collection: 'costs', Project: '[[project.md]]', Status: 'Confirmed'});
  f.file('flagged.md', {nf_source_collection: 'costs', Project: '[[project.md]]', Status: 'Confirmed', nf_unavailable_fields: ['Status']});
  f.file('opaque.md', {nf_source_collection: 'costs', Project: '[[project.md]]', Status: 'formulaResult://unavailable'});
  const configured = {...tab(), filters: [{property: 'Status', operator: 'notEquals', value: 'Void'}]};
  assert.deepEqual(relatedRecordRows(f.app, project, configured).rows.map(row => row.file.path), ['confirmed.md']);
  assert.equal(recordLayoutValue({Status: 'rollupResult://unavailable'}, 'Status').unavailable, true);
});
