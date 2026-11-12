const {test} = require('node:test');
const assert = require('node:assert/strict');
const {buildSync} = require('esbuild');
const {JSDOM} = require('jsdom');
class Value {constructor(value) {this.value = value;} toString() {return String(this.value);}}
class NumberValue extends Value {}
class StringValue extends Value {}
class NullValue extends Value {constructor() {super(null);}}
const wrap = value => value === null || value === undefined ? new NullValue() : typeof value === 'number' ? new NumberValue(value) : typeof value === 'string' ? new StringValue(value) : value;
const compiled = buildSync({entryPoints: ['src/native-finance-summary.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['obsidian']}).outputFiles[0].text;
const mod = {exports: {}};
new Function('require', 'module', 'exports', compiled)(name => {assert.equal(name, 'obsidian'); return {NumberValue, StringValue, NullValue};}, mod, mod.exports);
const {NativeFinanceSummary} = mod.exports;

function fixture() {
  const dom = new JSDOM('<main><div id="root"></div></main>');
  dom.window.document.win = dom.window;
  dom.window.createEl = tag => dom.window.document.createElement(tag);
  dom.window.createFragment = () => dom.window.document.createDocumentFragment();
  const root = dom.window.document.getElementById('root');
  const metadata = {};
  const summary = new NativeFinanceSummary(file => metadata[file.path]);
  const settings = {showSummaries: true, nebulaTable: {titleProperty: '摘要', titleColumn: 'formula.标题', tags: {}, wrap: true, attachments: []}};
  const view = {type: 'table', config: {name: '流水', get: key => settings[key]}, queryData: {data: []}};
  const entry = (path, amount, direction = '收入', currency = 'CNY', fields = {}) => {
    const values = {'note.金额': amount, 'note.方向': direction, 'note.币种': currency, ...fields};
    return {file: {path}, getValue: prop => wrap(values[prop])};
  };
  const refresh = entries => {view.queryData.data = entries; summary.refresh(view, root);};
  const text = () => root.previousElementSibling?.textContent || '';
  return {dom, root, metadata, summary, settings, view, entry, refresh, text};
}

test('filtered query rows, not virtualized visible rows, provide exact totals separated by currency', () => {
  const f = fixture();
  const a = f.entry('a', 0.1), b = f.entry('b', 0.2), c = f.entry('c', 0.3, '支出');
  f.view.rows = [{entry: a}];
  f.refresh([a, b, c, f.entry('d', 2, '收入', 'USD'), f.entry('e', 300, '收入', 'JPY')]);
  assert.match(f.text(), /当前筛选 · 5 条 · 5 条计入收支/);
  const totals = f.root.previousElementSibling.querySelectorAll('dl');
  assert.deepEqual([...totals].map(el => el.getAttribute('aria-label')), ['CNY', 'JPY', 'USD']);
  assert.equal(totals[0].querySelector('.net').textContent, '0.00');
  assert.equal(totals[1].querySelector('.income').textContent, '300');
  f.refresh([a]);
  assert.match(f.text(), /当前筛选 · 1 条 · 1 条计入收支/);
  assert.equal(f.root.previousElementSibling.querySelector('.income').textContent, '0.10');
});

test('source-unavailable fields and unresolved formula references remain excluded, never counted as zero', () => {
  const f = fixture();
  f.metadata.a = {nf_unavailable_fields: ['金额']};
  f.metadata.b = {nf_unavailable_fields: ['币种']};
  f.refresh([f.entry('a', null), f.entry('b', 300, '收入', ''), f.entry('c', 'formulaResult://example/amount'), f.entry('d', 0)]);
  assert.match(f.text(), /4 条 · 1 条计入收支/);
  assert.match(f.text(), /金额为空：2/);
  assert.match(f.text(), /币种缺失或格式无效：1/);
  assert.equal(f.root.previousElementSibling.querySelector('.income').textContent, '0.00');
});

test('later user values including zero override stale unavailable metadata, and formula fields remain independent', () => {
  const f = fixture();
  f.metadata.a = {nf_unavailable_fields: ['金额', '币种', '方向']};
  f.metadata.b = {nf_unavailable_fields: ['金额']};
  f.refresh([f.entry('a', 0), f.entry('b', 200)]);
  assert.match(f.text(), /2 条 · 2 条计入收支/);
  assert.equal(f.root.previousElementSibling.querySelector('.income').textContent, '200.00');
  assert.equal(f.root.previousElementSibling.querySelector('details'), null);
  f.settings.amountProperty = 'formula.金额';
  f.refresh([f.entry('a', null, '收入', 'CNY', {'formula.金额': 0})]);
  assert.match(f.text(), /1 条 · 1 条计入收支/);
  assert.equal(f.root.previousElementSibling.querySelector('.income').textContent, '0.00');
});

test('raw-property fallback uses bare note names and does not attempt to read formulas as frontmatter', () => {
  const f = fixture(), reads = [];
  const values = {金额: '12.34', 方向: '收入', 币种: 'CNY'};
  const entry = {file: {path: 'raw'}, getRawProperty: property => {reads.push(property); return values[property];}};
  f.refresh([entry]);
  assert.deepEqual(reads, ['金额', '币种', '方向']);
  assert.equal(f.root.previousElementSibling.querySelector('.income').textContent, '12.34');
  reads.length = 0; f.settings.amountProperty = 'formula.金额';
  f.refresh([entry]);
  assert.deepEqual(reads, ['币种', '方向']);
  assert.match(f.text(), /金额为空：1/);
});

test('formula properties use host Values and configurable direction labels without losing exact decimal strings', () => {
  const f = fixture();
  Object.assign(f.settings, {amountProperty: 'formula.现金值', currencyProperty: '币种', directionProperty: '方向', incomeValue: 'credit', expenseValue: 'debit'});
  f.refresh([f.entry('a', null, 'credit', 'CNY', {'formula.现金值': '9999999999999999.99'}),
    f.entry('b', null, 'debit', 'CNY', {'formula.现金值': '0.01'}),
    f.entry('c', null, 'credit', 'CNY', {'formula.现金值': 1000000000000000})]);
  assert.match(f.text(), /3 条 · 2 条计入收支/);
  assert.equal(f.root.previousElementSibling.querySelector('.net').textContent, '9,999,999,999,999,999.98');
  assert.match(f.text(), /金额精度超出范围：1/);
});

test('invalid, negative, list and unsupported currency rows have explicit exclusions', () => {
  const f = fixture();
  f.refresh([f.entry('a', -2), f.entry('b', ['1']), f.entry('c', 'abc'), f.entry('d', 1, '收入', 'XYZ'), f.entry('e', 1, 'unknown'), f.entry('f', 0.001)]);
  assert.match(f.text(), /6 条 · 0 条计入收支/);
  assert.match(f.text(), /负金额需确认方向：1/);
  assert.match(f.text(), /金额无效：2/);
  assert.match(f.text(), /币种无法识别：1/);
  assert.match(f.text(), /方向未配置或不属于收支：1/);
  assert.match(f.text(), /金额精度超出范围：1/);
  assert.equal(f.root.previousElementSibling.querySelectorAll('dl').length, 0);
});

test('only explicit summary-enabled enhanced tables render, and disable removes stale totals', () => {
  const f = fixture(); f.refresh([f.entry('a', 1)]);
  for (const disabled of [false, undefined, 'true']) {
    f.settings.showSummaries = disabled; f.summary.refresh(f.view, f.root);
    assert.equal(f.root.previousElementSibling, null);
  }
  f.settings.showSummaries = true;
  delete f.settings.nebulaTable; f.summary.refresh(f.view, f.root);
  assert.equal(f.root.previousElementSibling, null);
  f.settings.nebulaTable = {titleProperty: '摘要', titleColumn: 'formula.标题', tags: {}, wrap: true, attachments: []};
  f.view.type = 'kanban'; f.summary.refresh(f.view, f.root);
  assert.equal(f.root.previousElementSibling, null);
});

test('summary survives native row rerenders and repeated refresh retains nodes and expanded exclusion details', () => {
  const f = fixture(); f.refresh([f.entry('a', 1), f.entry('b', null)]);
  const section = f.root.previousElementSibling;
  const income = section.querySelector('.income');
  section.querySelector('details').open = true;
  f.root.replaceChildren(f.dom.window.document.createElement('table'));
  f.summary.refresh(f.view, f.root);
  assert.equal(f.root.previousElementSibling, section);
  assert.equal(section.querySelector('.income'), income);
  f.refresh([f.entry('a', 2), f.entry('b', null)]);
  assert.equal(section.querySelector('details').open, true);
  assert.equal(section.querySelector('.income').textContent, '2.00');
});

test('query adapters support current controller data and view data but never replace an incomplete query with stale data', () => {
  const f = fixture();
  delete f.view.queryData;
  f.view.queryController = {queryData: {data: [f.entry('a', 1)]}};
  f.summary.refresh(f.view, f.root); assert.match(f.text(), /1 条 · 1 条计入收支/);
  delete f.view.queryController;
  f.view.data = {data: [f.entry('a', 1), f.entry('b', 2)]};
  f.summary.refresh(f.view, f.root); assert.match(f.text(), /2 条 · 2 条计入收支/);
  f.view.queryData = {}; f.summary.refresh(f.view, f.root);
  assert.equal(f.root.previousElementSibling, null);
  f.view.queryData = {data: []}; f.summary.refresh(f.view, f.root);
  assert.match(f.text(), /0 条 · 0 条计入收支/);
});

test('multiple native tables remain isolated, clear removes all owned nodes, and host failures remove stale totals', () => {
  const f = fixture(); f.refresh([f.entry('a', 1)]);
  const second = f.dom.window.document.createElement('div'); f.root.parentElement.append(second);
  f.summary.refresh(f.view, second);
  assert.equal(f.root.parentElement.querySelectorAll('.nf-native-finance-summary').length, 2);
  f.summary.clear();
  assert.equal(f.root.parentElement.querySelectorAll('.nf-native-finance-summary').length, 0);
  assert.ok(f.root.isConnected && second.isConnected);
  f.refresh([f.entry('a', 1)]);
  f.view.queryData.data[0].getValue = () => {throw new Error('Query updating');};
  assert.doesNotThrow(() => f.summary.refresh(f.view, f.root));
  assert.equal(f.root.previousElementSibling, null);
});
