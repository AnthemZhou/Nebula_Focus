const {test} = require('node:test');
const assert = require('node:assert/strict');
const {buildSync} = require('esbuild');
const YAML = require('yaml');
const {webcrypto} = require('node:crypto');
const front = content => {const match = /^---\r?\n([^]*?)\r?\n---(?:\r?\n|$)/.exec(content); return {exists: !!match, frontmatter: match?.[1] ?? '', contentStart: match?.[0].length ?? 0};};
class TFile {constructor(path) {this.path = path; this.name = path.split('/').pop(); this.extension = this.name.split('.').pop(); this.basename = this.name.slice(0, -this.extension.length - 1);}}
class TFolder {constructor(path) {this.path = path;}}
const mod = {exports: {}};
new Function('require', 'module', 'exports', 'crypto', buildSync({entryPoints: ['src/record-api.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['obsidian']}).outputFiles[0].text)(() => ({TFile, TFolder, getFrontMatterInfo: front, parseYaml: YAML.parse, stringifyYaml: YAML.stringify}), mod, mod.exports, webcrypto);
const {RecordService} = mod.exports;
const base = {filters: {and: ['file.ext == "md"', 'file.inFolder("Records")']}, views: [{name: '待报销', type: 'table', filters: {and: ['note["nf_source_collection"] == "costs"', '报销状态 != "已报销"']},
  order: ['note.费用内容', '金额', '日期', '报销状态', '凭证', '项目', '完成', '公式'], numberProperties: ['金额'], dateProperties: ['日期'],
  nebulaTable: {titleColumn: 'note.费用内容', titleProperty: '费用内容', wrap: true, tags: {报销状态: 'single'}, attachments: ['凭证']},
  nebulaRecords: {fields: {报销状态: {type: 'select', options: ['未报销', '已报销']}, 项目: {type: 'relation'}, 完成: {type: 'checkbox'}, 公式: {readOnly: true}}}}]};
function fixture(config = base) {
  const files = new Map(), contents = new Map(); let processHook;
  const add = (path, content) => {const file = new TFile(path); files.set(path, file); contents.set(path, content); return file;};
  add('Views/Finance.base', YAML.stringify(config)); files.set('Records', new TFolder('Records'));
  add('Projects/A.md', '# Project'); add('Attachments/receipt.png', 'image');
  const vault = {getName: () => '测试库', getFiles: () => [...files.values()].filter(file => file instanceof TFile), getMarkdownFiles: () => [...files.values()].filter(file => file.extension === 'md'),
    getFileByPath: path => files.get(path) instanceof TFile ? files.get(path) : null, getAbstractFileByPath: path => files.get(path), read: async file => contents.get(file.path),
    create: async (path, content) => {if (files.has(path)) throw Error('exists'); return add(path, content);}, createFolder: async path => {files.set(path, new TFolder(path));},
    createBinary: async (path, data) => {if (files.has(path)) throw Error('exists'); return add(path, data);},
    process: async (file, fn) => {if (processHook) processHook(file); const next = fn(contents.get(file.path)); contents.set(file.path, next); return next;}};
  const app = {vault, metadataCache: {getFirstLinkpathDest: path => vault.getFileByPath(path) ?? vault.getFileByPath(path + '.md')}, fileManager: {getAvailablePathForAttachment: async name => 'Attachments/' + name}};
  const service = new RecordService(app);
  const call = input => service.handle({database: 'Views/Finance.base', view: '待报销', ...input});
  return {service, call, add, files, contents, hook: fn => {processHook = fn;}};
}
const create = {action: 'create', title: '打车报销', requestId: 'expense-1', properties: {金额: 23.5, 日期: '2026-11-15', 报销状态: '未报销', 凭证: ['[[Attachments/receipt.png]]'], 项目: ['[[Projects/A]]']}, body: '客户拜访\n'};
const good = response => {assert.equal(response.ok, true, JSON.stringify(response)); return response.result;};
const error = (response, code) => {assert.equal(response.ok, false); assert.equal(response.error.code, code, JSON.stringify(response));};

test('discovers views and schema with title mapping, typed fields and scoped defaults', async () => {
  const f = fixture();
  const list = good(await f.service.handle({action: 'databases'})); assert.equal(list.databases[0].canCreate, true);
  const schema = good(await f.call({action: 'schema'})); assert.equal(schema.titleProperty, '费用内容'); assert.equal(schema.folder, 'Records');
  assert.equal(schema.defaults.nf_source_collection, 'costs');
  assert.equal(schema.fields.find(f => f.key === '金额').type, 'number'); assert.equal(schema.fields.find(f => f.key === '凭证').type, 'attachment');
  assert.equal(schema.fields.find(f => f.key === 'nf_source_collection').writable, false);
});
test('creates once, applies collection defaults, returns encoded real page link and retries idempotently', async () => {
  const f = fixture(), result = good(await f.call(create)); assert.equal(result.path, 'Records/打车报销.md'); assert.equal(result.created, true);
  assert.match(result.markdownLink, /obsidian:\/\/open\?vault=%/); assert.equal(result.revision.length, 64);
  const properties = YAML.parse(front(f.contents.get(result.path)).frontmatter); assert.equal(properties.nf_source_collection, 'costs'); assert.equal(properties.费用内容, create.title);
  assert.deepEqual(properties.凭证, create.properties.凭证); assert.equal(result.body, create.body);
  assert.equal(good(await f.call(create)).idempotent, true);
  error(await f.call({...create, properties: {...create.properties, 金额: 24}}), 'request_id_conflict');
  error(await f.call({...create, requestId: 'another'}), 'duplicate_title');
});
test('updates exactly one record and preserves unrelated properties and body', async () => {
  const f = fixture(), before = good(await f.call(create));
  const after = good(await f.call({action: 'update', path: before.path, expectedRevision: before.revision, properties: {金额: 25, 日期: null}, append: '补充说明'}));
  assert.equal(after.properties.金额, 25); assert.equal(after.properties.日期, undefined); assert.equal(after.properties.费用内容, create.title);
  assert.equal(after.body, '客户拜访\n补充说明'); assert.notEqual(after.revision, before.revision);
  error(await f.call({action: 'update', path: before.path, expectedRevision: before.revision, properties: {金额: 1}}), 'revision_conflict');
  assert.equal(good(await f.call({action: 'read', path: before.path})).properties.金额, 25);
});
test('atomic compare-and-write rejects an edit made after the initial read', async () => {
  const f = fixture(), before = good(await f.call(create));
  f.hook(file => f.contents.set(file.path, f.contents.get(file.path) + '手工修改'));
  error(await f.call({action: 'update', path: before.path, expectedRevision: before.revision, append: 'AI 修改'}), 'revision_conflict');
  assert.ok(f.contents.get(before.path).endsWith('手工修改'));
});
test('retry remains idempotent after the record leaves the selected view', async () => {
  const f = fixture(), before = good(await f.call(create));
  const after = good(await f.call({action: 'update', path: before.path, expectedRevision: before.revision, properties: {报销状态: '已报销'}}));
  assert.equal(after.matchesView, false); assert.equal(good(await f.call({action: 'query'})).total, 0);
  assert.equal(good(await f.call(create)).idempotent, true);
});
test('invalid fields, values and attachment links never create a note', async () => {
  for (const [properties, code] of [[{未知: 1}, 'unknown_field'], [{金额: '23'}, 'invalid_field_type'], [{日期: '2026-02-30'}, 'invalid_field_type'],
    [{报销状态: '不存在'}, 'unknown_option'], [{公式: 'unsafe'}, 'read_only_field'], [{nf_source_collection: 'other'}, 'read_only_field'],
    [{凭证: ['[[Missing.png]]']}, 'unresolved_link'], [{项目: ['[[Attachments/receipt.png]]']}, 'unresolved_link']]) {
    const f = fixture(); error(await f.call({...create, properties}), code); assert.equal(f.files.has('Records/打车报销.md'), false);
  }
});
test('rejects wrong vault, traversal, raw frontmatter and files outside the selected view', async () => {
  const f = fixture(); error(await f.call({...create, vault: '其他库'}), 'wrong_vault');
  error(await f.call({action: 'schema', database: '../bad.base'}), 'invalid_path');
  error(await f.call({...create, body: '---\na: 1\n---\nhi'}), 'invalid_body');
  error(await f.call({action: 'read', path: 'Projects/A.md'}), 'record_not_found');
});
test('unsupported filters fail closed instead of widening database scope', async () => {
  for (const filter of ['file.hasTag("expense")', 'file.name.startsWith("secret")', 'app.vault.delete()']) {
    const config = structuredClone(base); config.views[0].filters = {and: [filter]}; const f = fixture(config);
    assert.equal(good(await f.service.handle({action: 'databases'})).databases[0].canCreate, false);
    error(await f.call(create), 'unsupported_filter');
  }
});
test('self views are hidden by default, require explicit view and cannot create', async () => {
  const config = structuredClone(base); config.filters = {and: ['file.path == "Projects/A.md"']}; config.views[0].filters = undefined; config.views.push({...config.views[0], name: 'second'});
  const f = fixture(config); assert.equal(good(await f.service.handle({action: 'databases'})).databases.length, 0);
  assert.equal(good(await f.service.handle({action: 'databases', includeSelf: true})).databases.length, 2);
  error(await f.call({action: 'schema', view: undefined}), 'ambiguous_view'); error(await f.call(create), 'creation_unavailable');
});
test('concurrent create calls share one queue and return one created file', async () => {
  const f = fixture(), results = await Promise.all([f.call(create), f.call(create)]);
  assert.equal(good(results[0]).created, true); assert.equal(good(results[1]).idempotent, true);
});
test('does not overwrite a filename collision belonging to a different collection', async () => {
  const f = fixture(); f.add('Records/打车报销.md', '---\nnf_source_collection: other\n---\noriginal');
  error(await f.call(create), 'path_exists'); assert.ok(f.contents.get('Records/打车报销.md').endsWith('original'));
});
test('attachments store original bytes and validate size and extension', async () => {
  const f = fixture(), data = new Uint8Array([1, 2, 3]).buffer;
  const saved = await f.service.storeAttachment('new.png', data); assert.equal(f.contents.get(saved.path), data); assert.ok(saved.wikiLink.includes('new.png'));
  await assert.rejects(() => f.service.storeAttachment('bad.exe', data), /图片/);
});
