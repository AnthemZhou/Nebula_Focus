const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {transformSync} = require('esbuild');
const mod = {exports: {}};
new Function('module', 'exports', transformSync(readFileSync('src/home-model.ts', 'utf8'), {loader: 'ts', format: 'cjs'}).code)(mod, mod.exports);
const {readHomeConfig, reorderHomeModules, remapHomePaths, cloneHomeBase} = mod.exports;
const view = (extra = {}) => ({kind: 'view', id: 'view-1', title: '工作', collapsed: false, source: 'Bases/Ideas.base', view: '记录', basePath: '', height: 480, ...extra});
const summary = (extra = {}) => ({kind: 'summary', id: 'summary-1', title: '记录数', collapsed: false, source: 'Bases/Ideas.base', view: '记录', basePath: 'Home/Summary.base', operation: 'count', property: '', groupBy: '', ...extra});
const links = (extra = {}) => ({kind: 'links', id: 'links-1', title: '常用', collapsed: true, paths: ['Notes/开始.md'], ...extra});
const config = (...modules) => ({version: 1, title: '首页', modules});
const freeze = value => {if (value && typeof value === 'object') {Object.values(value).forEach(freeze); Object.freeze(value);} return value;};
const base = () => ({
  filters: {and: ['file.folder == "Records"', 'file.ext == "md"']},
  formulas: {标题: 'link(file.path, note["标题"])'},
  properties: {'formula.标题': {displayName: '标题'}},
  custom: {retain: [1, 2]}, nebulaSource: {version: 1, path: '入口.md', scope: 'folder', folder: 'Records'},
  views: [{type: 'table', name: '记录', filters: {and: ['状态 == "进行中"']}, sort: [{property: '标题', direction: 'ASC'}],
    groupBy: {property: 'note.状态', direction: 'ASC'}, order: ['formula.标题', 'note.状态'], columnSize: {'formula.标题': 340},
    nebulaTable: {titleProperty: '标题', titleColumn: 'formula.标题', tags: {状态: 'single'}, wrap: true, attachments: []}, customView: true},
  {type: 'kanban', name: '其他视图', order: ['file.name']}],
});

test('missing settings create an independent blank home without business modules', () => {
  const first = readHomeConfig(undefined), second = readHomeConfig(null);
  assert.deepEqual(first, {version: 1, title: '首页', modules: []});
  assert.deepEqual(second, first);
  first.modules.push(links()); assert.equal(second.modules.length, 0);
});

test('all three module kinds and same-version extension fields survive reading without aliases to the input', () => {
  const source = freeze({...config(view(), summary(), links()), futureOption: {mode: 'quiet'}, modules: [view({extension: {value: true}}), summary(), links()]});
  const read = readHomeConfig(source);
  assert.deepEqual(read, source);
  assert.notEqual(read, source); assert.notEqual(read.modules, source.modules);
  assert.notEqual(read.modules[0].extension, source.modules[0].extension);
  read.futureOption.mode = 'changed'; assert.equal(source.futureOption.mode, 'quiet');
  assert.equal(read.modules[0].basePath, '');
  assert.equal(read.modules[1].property, ''); assert.equal(read.modules[1].groupBy, '');
});

test('unknown versions and malformed schemas throw instead of silently becoming an empty home', () => {
  for (const source of [{version: 2, title: 'Future', modules: [], importantFutureState: true}, {}, [], 'raw', {version: 1, title: 'Home'},
    config({...view(), collapsed: undefined}), config(view({height: 0})), config(view({height: NaN})), config(view({height: Infinity})),
    config(summary({operation: ['count']})), config(summary({operation: 'median'})), config({kind: 'future', id: 'future', title: '', collapsed: false})]) {
    assert.throws(() => readHomeConfig(source));
  }
});

test('duplicate or path-like module IDs are rejected rather than dropping or merging modules', () => {
  assert.throws(() => readHomeConfig(config(view(), links({id: 'view-1'}))), /重复/);
  for (const id of ['', '../outside', 'a/b', 'a\\b', 'with space']) assert.throws(() => readHomeConfig(config(view({id}))));
});

test('vault paths reject schemes, absolute/traversal and encoded traversal while preserving ordinary names', () => {
  for (const path of ['../Outside.base', '/absolute.base', 'A/../B.base', 'A/./B.base', 'A//B.base', 'A\\B.base', 'https://example.test/a.base', 'obsidian://open', '//host/file.base', 'A/%2e%2e/B.base', '%2Froot.base', 'https%3A%2F%2Fexample.test/a.base', 'A\u0000.base']) {
    assert.throws(() => readHomeConfig(config(view({source: path}))), path);
    assert.throws(() => readHomeConfig(config(view({basePath: path}))), path);
    assert.throws(() => readHomeConfig(config(links({paths: [path]}))), path);
  }
  assert.throws(() => readHomeConfig(config(view({source: ''}))));
  assert.throws(() => readHomeConfig(config(links({paths: ['']}))));
  assert.equal(readHomeConfig(config(view({source: 'Bases/项目 (2026) 100%.base'}))).modules[0].source, 'Bases/项目 (2026) 100%.base');
});

test('reordering moves before or after the requested module and leaves original references untouched', () => {
  const a = view(), b = summary(), c = links(), source = freeze(config(a, b, c));
  const after = reorderHomeModules(source, a.id, c.id, true);
  assert.deepEqual(after.modules.map(item => item.id), [b.id, c.id, a.id]);
  assert.equal(after.modules[2], a); assert.deepEqual(source.modules, [a, b, c]);
  const before = reorderHomeModules(source, c.id, b.id, false);
  assert.deepEqual(before.modules.map(item => item.id), [a.id, c.id, b.id]);
  for (const args of [[a.id, a.id, true], ['missing', b.id, false], [a.id, 'missing', true], [a.id, b.id, false], [b.id, a.id, true]]) {
    assert.equal(reorderHomeModules(source, ...args), source);
  }
});

test('renames update exact file paths and folder descendants but not similar prefixes or text labels', () => {
  const source = freeze(config(view({title: 'Bases', source: 'Bases/Ideas.base', basePath: 'Home/v.base'}),
    summary({source: 'Bases/Finance.base', property: 'Bases/amount', groupBy: 'Bases/type'}),
    links({paths: ['Bases/Ideas.base', 'Bases-more/Other.base', 'Notes/Bases.md']})));
  const renamed = remapHomePaths(source, 'Bases', 'Archive/Bases');
  assert.equal(renamed.modules[0].source, 'Archive/Bases/Ideas.base');
  assert.equal(renamed.modules[0].title, 'Bases'); assert.equal(renamed.modules[0].basePath, 'Home/v.base');
  assert.equal(renamed.modules[1].source, 'Archive/Bases/Finance.base');
  assert.equal(renamed.modules[1].property, 'Bases/amount'); assert.equal(renamed.modules[1].groupBy, 'Bases/type');
  assert.deepEqual(renamed.modules[2].paths, ['Archive/Bases/Ideas.base', 'Bases-more/Other.base', 'Notes/Bases.md']);
  const movedClone = remapHomePaths(source, 'Home/v.base', 'Home/renamed.base');
  assert.equal(movedClone.modules[0].basePath, 'Home/renamed.base');
  assert.equal(movedClone.modules[1], source.modules[1]);
  assert.equal(remapHomePaths(source, 'Missing', 'Other'), source);
  assert.equal(remapHomePaths(source, 'Bases', 'Bases'), source);
  assert.throws(() => remapHomePaths(source, 'Bases', '../outside'));
  assert.equal(remapHomePaths(config(view()), 'Home', 'Other').modules[0].basePath, '');
});

test('each Base clone keeps only the selected view while preserving query constraints and presentation', () => {
  const original = freeze(base()), cloned = cloneHomeBase(original, '记录', 'module-123');
  assert.deepEqual(cloned.filters, original.filters); assert.deepEqual(cloned.formulas, original.formulas);
  assert.deepEqual(cloned.properties, original.properties); assert.deepEqual(cloned.custom, original.custom);
  assert.deepEqual(cloned.views, [{...original.views[0], name: '首页视图'}]);
  assert.deepEqual(cloned.nebulaHomeModule, {version: 1, id: 'module-123'});
  assert.equal(cloned.nebulaSource, undefined); assert.ok(original.nebulaSource);
  assert.equal(original.views[0].name, '记录'); assert.equal(original.views.length, 2);
  cloned.views[0].nebulaTable.tags.状态 = 'multi';
  cloned.filters.and.push('extra filter');
  assert.equal(original.views[0].nebulaTable.tags.状态, 'single'); assert.equal(original.filters.and.length, 2);
});

test('missing, ambiguous and invalid Base views fail before a clone can be persisted', () => {
  const duplicate = base(); duplicate.views.push({...duplicate.views[0]});
  for (const input of [null, [], {}, {views: null}, {views: [null]}, {views: [{}]}, {...base(), formulas: []}, {...base(), properties: []}, duplicate]) {
    assert.throws(() => cloneHomeBase(input, '记录', 'module-123'));
  }
  assert.throws(() => cloneHomeBase(base(), '不存在', 'module-123'), /不存在/);
  assert.throws(() => cloneHomeBase(base(), '记录', '../bad'));
});

test('declarative extension data is preserved safely while cycles or executable values fail explicitly', () => {
  const original = base(); Object.defineProperty(original, '__proto__', {value: {safe: true}, enumerable: true});
  const cloned = cloneHomeBase(original, '记录', 'module-123');
  assert.deepEqual(Object.getOwnPropertyDescriptor(cloned, '__proto__').value, {safe: true});
  assert.equal({}.safe, undefined);
  const cycle = base(); cycle.loop = cycle;
  assert.throws(() => cloneHomeBase(cycle, '记录', 'module-123'), /循环/);
  assert.throws(() => readHomeConfig({...config(), onOpen: () => {}}), /不支持/);
});
