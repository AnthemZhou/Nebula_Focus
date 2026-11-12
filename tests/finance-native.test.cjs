const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {transformSync} = require('esbuild');
const mod = {exports: {}};
new Function('module', 'exports', transformSync(readFileSync('src/finance-native.ts', 'utf8'), {loader: 'ts', format: 'cjs'}).code)(mod, mod.exports);
const {convertFinanceBase} = mod.exports;
const title = 'formula.Nebula标题_流水摘要';
const expression = 'link(file.path, if(note["流水摘要"], note["流水摘要"], file.name))';
const view = (extra = {}) => ({type: 'nebula-finance', name: '流水', titleProperty: 'note.流水摘要', order: ['流水摘要', 'note.金额', '方向'], ...extra});
const freeze = value => {
  if (value && typeof value === 'object') {Object.values(value).forEach(freeze); Object.freeze(value);}
  return value;
};

test('migration preserves every view, filter, sort, group and unrelated setting without mutating input', () => {
  const original = freeze({
    filters: {and: ['file.inFolder("Example")']}, custom: {keep: true},
    formulas: {月份: 'date(note["日期"]).format("YYYY-MM")'},
    properties: {'note.流水摘要': {displayName: '摘要'}, 'note.金额': {displayName: '人民币'}},
    views: [view({filters: {and: ['note["金额"] > 0']}, sort: [{property: '流水摘要', direction: 'ASC'}], groupBy: {property: '方向', direction: 'DESC'}, customOption: [1, 2]}),
      ...['视图', '视图 2', '视图 3'].map(name => ({type: 'table', name, order: ['file.name'], rowHeight: 'tall'}))],
  });
  const snapshot = JSON.stringify(original);
  const result = convertFinanceBase(original);
  assert.equal(result.changed, true);
  assert.equal(JSON.stringify(original), snapshot);
  assert.equal(result.data.views.length, 4);
  assert.deepEqual(result.data.views.slice(1), original.views.slice(1));
  const converted = result.data.views[0];
  for (const key of ['name', 'filters', 'sort', 'groupBy', 'customOption']) assert.deepEqual(converted[key], original.views[0][key]);
  assert.deepEqual(converted.order, [title, 'note.金额', '方向']);
  assert.deepEqual(result.data.filters, original.filters);
  assert.deepEqual(result.data.custom, original.custom);
  assert.equal(result.data.formulas.月份, original.formulas.月份);
  assert.equal(result.data.formulas.Nebula标题_流水摘要, expression);
  assert.equal(result.data.properties[title].displayName, '摘要');
  assert.deepEqual(result.data.properties['note.金额'], original.properties['note.金额']);
});

test('legacy column widths move to canonical native columnSize and never replace existing native widths', () => {
  const result = convertFinanceBase({views: [view({columnSize: {'note.金额': 200, 流水摘要: 350, [title]: 410}, columnWidths: {'note.流水摘要': 500, 金额: 250, 方向: 117.8, 'note.缺失': 0, 'file.name': 1200, bad: 'bad'}})]});
  assert.deepEqual(result.data.views[0].columnSize, {[title]: 410, 'note.金额': 200, 'note.方向': 118, 'note.缺失': 64, 'file.name': 960});
  assert.equal(result.data.views[0].columnWidths['note.流水摘要'], 500);
});

test('profiles retain bare tag and attachment names, default text tags to single select and preserve explicit multi-select', () => {
  const result = convertFinanceBase({views: [view({tagProperties: ['note.方向', '方向', 'note.人员', 'formula.no'], attachmentProperties: ['note.附件', '附件'], scopeNote: '仅演示', nebulaTable: {tags: {人员: 'multi'}, extension: true}})]});
  assert.deepEqual(result.data.views[0].nebulaTable, {titleProperty: '流水摘要', titleColumn: title, tags: {方向: 'single', 人员: 'multi'}, wrap: true, attachments: ['附件'], scopeNote: '仅演示', extension: true});
});

test('formula collisions are resolved once and compatible formulas are shared across views', () => {
  const result = convertFinanceBase({formulas: {Nebula标题_流水摘要: '"User formula"'}, properties: {'formula.Nebula标题_流水摘要': {displayName: 'User label'}}, views: [view(), view({name: '另一个视图'})]});
  assert.equal(result.data.formulas.Nebula标题_流水摘要, '"User formula"');
  assert.equal(result.data.properties['formula.Nebula标题_流水摘要'].displayName, 'User label');
  assert.equal(result.data.formulas.Nebula标题_流水摘要_2, expression);
  assert.equal(result.data.views[0].nebulaTable.titleColumn, 'formula.Nebula标题_流水摘要_2');
  assert.equal(result.data.views[1].nebulaTable.titleColumn, 'formula.Nebula标题_流水摘要_2');
  assert.equal(convertFinanceBase(result.data).changed, false);
});

test('missing computed amounts are never replaced with zero or guessed formulas', () => {
  const result = convertFinanceBase({views: [view({numberProperties: ['note.资金池'], order: ['note.流水摘要', 'note.资金池'], unavailable: ['资金池']})]});
  assert.deepEqual(result.data.views[0].order, [title, 'note.资金池']);
  assert.deepEqual(result.data.views[0].numberProperties, ['note.资金池']);
  assert.deepEqual(Object.keys(result.data.formulas), ['Nebula标题_流水摘要']);
  assert.deepEqual(result.data.views[0].unavailable, ['资金池']);
});

test('default title and column order match the old view, and unusual property names remain quoted safely', () => {
  const result = convertFinanceBase({views: [{type: 'nebula-finance', name: '默认'}, view({titleProperty: 'note.He said "hi"', order: ['He said "hi"']})]});
  assert.deepEqual(result.data.views[0].order, ['note.交易日期', title, 'note.金额', 'note.币种', 'note.方向', 'note.关联项目']);
  assert.equal(result.data.formulas['Nebula标题_He said "hi"'], 'link(file.path, if(note["He said \\"hi\\""], note["He said \\"hi\\""], file.name))');
});

test('malformed documents are rejected and native documents are left intact', () => {
  for (const input of [null, [], {}, {views: null}, {views: [null]}, {views: [view()], formulas: []}, {views: [view({titleProperty: 'file.name'})]}, {views: [view({order: [null]})]}, {views: [view({columnSize: []})]}, {views: [view({nebulaTable: []})]}]) assert.equal(convertFinanceBase(input), null);
  const native = {views: [{type: 'table', name: '普通表格'}]};
  assert.deepEqual(convertFinanceBase(native), {data: native, changed: false});
});
