const {test} = require('node:test');
const assert = require('node:assert/strict');
const {buildSync} = require('esbuild');

function load(path) {
  const mod = {exports: {}};
  const code = buildSync({entryPoints: [path], bundle: true, write: false, platform: 'node', format: 'cjs'}).outputFiles[0].text;
  new Function('module', 'exports', code)(mod, mod.exports);
  return mod.exports;
}
const {enhanceBaseProfiles} = load('src/auto-base-profile.ts');
const {tableProfile} = load('src/table-profile.ts');
const link = property => `link(file.path, if(note[${JSON.stringify(property)}], note[${JSON.stringify(property)}], file.name))`;
const asLink = property => `file.asLink(if(note[${JSON.stringify(property)}], note[${JSON.stringify(property)}], file.name))`;
const base = (expression = link('摘要'), patch = {}) => ({
  formulas: {标题: expression},
  views: [{type: 'table', name: '流水', order: ['formula.标题', 'note.领域'], ...patch}],
});
function freeze(value) {
  if (value && typeof value === 'object') {Object.values(value).forEach(freeze); Object.freeze(value);}
  return value;
}

test('legacy inbox receives its exact existing profile and remains valid after renaming the view', () => {
  const input = freeze({formulas: {想法: asLink('这里写想法')}, views: [{type: 'table', name: '想法收集箱',
    order: ['formula.想法', 'note.领域', 'note.类型'], tagProperties: ['不要替换原标签'], nebulaRowMode: 'clip'}]});
  const output = enhanceBaseProfiles(input);
  assert.equal(output.changed, true);
  const view = output.data.views[0], profile = view.nebulaTable;
  assert.equal(profile.titleProperty, '这里写想法'); assert.equal(profile.titleColumn, 'formula.想法');
  assert.deepEqual({...profile.tags}, {领域: 'multi', 类型: 'single', 重要性: 'single'});
  assert.deepEqual(profile.attachments, ['文件和媒体']); assert.equal(profile.wrap, false);
  view.name = '灵感记录';
  assert.deepEqual(tableProfile(view), profile);
  assert.equal(Object.hasOwn(input.views[0], 'nebulaTable'), false);
});

test('only complete generated title expressions opt in, including quoted names and harmless whitespace', () => {
  for (const property of ['摘要', '引号"与反斜线\\', '__proto__', 'constructor']) {
    for (const expression of [link(property), asLink(property), ` \n link( file.path , if( note[ ${JSON.stringify(property)} ], note[${JSON.stringify(property)}], file.name ) )\t`]) {
      const result = enhanceBaseProfiles(base(expression));
      assert.equal(result.changed, true, expression);
      assert.equal(result.data.views[0].nebulaTable.titleProperty, property);
      assert.deepEqual({...result.data.views[0].nebulaTable.tags}, {});
    }
  }
  const escaped = enhanceBaseProfiles(base('link(file.path, if(note["\\u6807\\u9898"], note["标题"], file.name))'));
  assert.equal(escaped.data.views[0].nebulaTable.titleProperty, '标题');
});

test('explicit tag and attachment declarations are normalized without guessing native list properties', () => {
  const input = base(link('摘要'), {tagProperties: ['note.领域', '类型', 'note.领域', 'file.name', 'formula.值', '', null],
    attachmentProperties: ['note.文件和媒体', '凭证', 'note.文件和媒体', 'formula.图片'], scopeNote: '仅示例', nebulaRowMode: 'clip'});
  input.properties = {'note.普通列表': {type: 'multitext'}};
  const profile = enhanceBaseProfiles(input).data.views[0].nebulaTable;
  assert.deepEqual({...profile.tags}, {领域: 'single', 类型: 'single'});
  assert.deepEqual(profile.attachments, ['文件和媒体', '凭证']);
  assert.equal(profile.wrap, false); assert.equal(profile.scopeNote, '仅示例');
  assert.equal(profile.tags.普通列表, undefined);
});

test('all existing profiles including invalid or empty ones remain authoritative', () => {
  for (const nebulaTable of [null, undefined, false, 42, [], {}, {titleProperty: '不同字段'}]) {
    const input = base(link('摘要'), {nebulaTable});
    const result = enhanceBaseProfiles(input);
    assert.equal(result.changed, false); assert.equal(result.data, input);
    assert.equal(result.data.views[0].nebulaTable, nebulaTable);
  }
});

test('same-name ordinary views, unreferenced formulas, and ambiguous title columns remain untouched', () => {
  const cases = [
    {formulas: {想法: asLink('这里写想法')}, views: [{type: 'table', name: '想法收集箱', order: ['file.name', 'note.领域']}]},
    {formulas: {想法: 'note["这里写想法"]'}, views: [{type: 'table', name: '想法收集箱', order: ['formula.想法']}]},
    base(link('摘要'), {type: 'cards'}), base(link('摘要'), {order: ['标题']}),
    base(link('摘要'), {order: ['note.摘要']}), base(link('摘要'), {order: ['formula.标题', 42]}),
    base(link('摘要'), {order: 42}), base(link('摘要'), {order: undefined}),
    {formulas: {标题: link('摘要'), 其他: asLink('项目')}, views: [{type: 'table', order: ['formula.标题', 'formula.其他']}]},
    {views: [{type: 'table', name: '想法收集箱', order: ['formula.想法']}]},
  ];
  for (const input of cases) {
    const result = enhanceBaseProfiles(input); assert.equal(result.changed, false); assert.equal(result.data, input);
  }
});

test('arbitrary or mismatched formulas are never interpreted as editable title mappings', () => {
  const cases = [
    'link(file.path, if(note["A"], note["B"], file.name))',
    'file.asLink(if(note["A"], note["A"], "Fallback"))',
    'link(file.path, if(note.A, note.A, file.name))',
    'link(file.path, if(note["A"], note["A"] + "other", file.name))',
    'link(other.path, if(note["A"], note["A"], file.name))',
    'link(file.path, if(note["A"], note["A"], file.name)).toString()',
    link('A') + '; globalThis.autoProfileExecuted = true',
    'link(file.path, if(note["\\q"], note["\\q"], file.name))',
    'link(file.path, if(note[""], note[""], file.name))',
    null, {}, ['title'],
  ];
  for (const expression of cases) assert.equal(enhanceBaseProfiles(base(expression)).changed, false);
  assert.equal(globalThis.autoProfileExecuted, undefined);
});

test('pure and idempotent enhancement retains complete view configuration and unknown data', () => {
  const input = base(asLink('摘要'), {filters: {and: ['note.方向 == "收入"']}, sort: [{property: '日期', direction: 'DESC'}],
    columnSize: {'formula.标题': 380}, futureSetting: {preserve: true}});
  input.filters = {and: ['file.inFolder("Records")']}; input.properties = {'formula.标题': {displayName: '文字'}};
  input.formulas.不要改 = '100 + 200'; input.custom = {nested: ['anything']};
  input.views.push({type: 'unknown-future-view', name: '保留', payload: {x: 1}});
  const before = JSON.stringify(input); freeze(input);
  const result = enhanceBaseProfiles(input), view = result.data.views[0];
  const {nebulaTable, ...originalView} = view;
  assert.deepEqual(originalView, input.views[0]); assert.ok(nebulaTable);
  assert.equal(result.data.formulas, input.formulas); assert.equal(result.data.filters, input.filters);
  assert.equal(result.data.properties, input.properties); assert.equal(result.data.custom, input.custom);
  assert.equal(result.data.views[1], input.views[1]); assert.equal(JSON.stringify(input), before);
  const again = enhanceBaseProfiles(result.data);
  assert.equal(again.changed, false); assert.equal(again.data, result.data);
});

test('malformed base documents are rejected without partial enhancement', () => {
  for (const input of [null, [], 42, {}, {views: null}, {views: [null]}, {views: [[], {}]},
    {...base(), formulas: null}, {...base(), formulas: []}, {...base(), formulas: 42}]) {
    assert.equal(enhanceBaseProfiles(input), null);
  }
  assert.deepEqual(enhanceBaseProfiles({views: []}), {data: {views: []}, changed: false});
});

test('dangerous names remain own data and never pollute prototypes or resolve inherited formulas', () => {
  const formulas = JSON.parse('{"__proto__":"placeholder"}'); formulas.__proto__ = link('__proto__');
  const input = {formulas, views: [{type: 'table', name: '普通表', order: ['formula.__proto__'],
    tagProperties: ['note.__proto__', 'constructor', 'toString'], attachmentProperties: ['__proto__']}]};
  const profile = enhanceBaseProfiles(input).data.views[0].nebulaTable;
  assert.equal(profile.titleProperty, '__proto__'); assert.equal(Object.getPrototypeOf(profile.tags), null);
  for (const key of ['__proto__', 'constructor', 'toString']) assert.equal(Object.getOwnPropertyDescriptor(profile.tags, key).value, 'single');
  assert.deepEqual(profile.attachments, ['__proto__']); assert.equal({}.polluted, undefined);
  const inherited = {formulas: Object.create({标题: link('摘要')}), views: base().views};
  assert.equal(enhanceBaseProfiles(inherited).changed, false);
  assert.equal(Object.getPrototypeOf(input.formulas), Object.prototype);
});
