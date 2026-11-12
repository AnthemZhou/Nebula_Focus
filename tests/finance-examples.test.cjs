const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

const folder = path.resolve('examples/vault/Finance');
const records = fs.readdirSync(folder).filter(name => name.endsWith('.md')).flatMap(name => {
  const text = fs.readFileSync(path.join(folder, name), 'utf8');
  const header = /^---\n([\s\S]*?)\n---/.exec(text);
  return header ? [{path: 'Finance/' + name, note: YAML.parse(header[1]), text}] : [];
});
const daily = YAML.parse(fs.readFileSync(path.join(folder, '财务示例.base'), 'utf8'));
const monthly = YAML.parse(fs.readFileSync(path.join(folder, '月度收支.base'), 'utf8'));
const profile = JSON.parse(fs.readFileSync(path.join(folder, 'nebula-record-layouts.json'), 'utf8')).profiles['example-projects'];

// The example uses this deliberately small intersection of Bases and JS
// expressions, mapping string contains to includes. Execute only repository-owned
// fixture expressions, never notes; this is not a replacement Bases evaluator.
function matches(filter, record) {
  if (!filter) return true;
  if (typeof filter === 'string') {
    const note = new Proxy(record.note, {get: (target, key) => target[key] ?? null});
    const file = {ext: 'md', inFolder: name => record.path.startsWith(name + '/')};
    return !!new Function('note', 'file', 'return (' + filter.replaceAll('.contains(', '.includes(') + ')')(note, file);
  }
  if (filter.and) return filter.and.every(part => matches(part, record));
  if (filter.or) return filter.or.some(part => matches(part, record));
  throw new Error('Unsupported example filter');
}
function inView(name, items = records) {
  const view = daily.views.find(item => item.name === name);
  assert.ok(view, 'Missing view ' + name);
  return items.filter(record => matches(daily.filters, record) && matches(view.filters, record));
}
const record = name => records.find(item => item.path === 'Finance/' + name + '.md');

test('fictional finance fixture has no unresolved wiki targets or external source identities', () => {
  assert.equal(records.length, 11);
  for (const item of records) {
    assert.match(item.note.nf_source_collection, /^example-/);
    assert.ok(!item.note.nf_source_url);
    for (const link of item.text.matchAll(/\[\[([^|\]#]+)(?:[^\]]*)\]\]/g)) {
      assert.ok(records.some(target => target.path === link[1] + '.md'), 'Unresolved link ' + link[1]);
    }
  }
});

test('daily views partition paid and pending personal advances without including company payments', () => {
  assert.deepEqual(inView('待报销').map(item => item.note.费用内容), ['项目 A 素材垫款']);
  assert.deepEqual(inView('已报销').map(item => item.note.费用内容), ['项目 A 快递垫款']);
  for (const name of ['待报销', '已报销']) {
    const view = daily.views.find(item => item.name === name);
    assert.equal(view.showSummaries, false);
    assert.equal(view.type, 'table');
    assert.equal(view.nebulaTable.titleProperty, '费用内容');
    assert.deepEqual(view.order, [view.nebulaTable.titleColumn, ...['项目归属', '报销金额', '时间', '支付记录', '报销人员'].map(key => 'note.' + key)]);
  }
  const pending = record('待报销费用');
  for (const status of ['部分报销', '待确认', null]) {
    assert.equal(inView('待报销', [{...pending, note: {...pending.note, 报销状态: status}}]).length, 1);
  }
  assert.equal(inView('待报销', [{...pending, note: {...pending.note, 成本状态: '已作废'}}]).length, 0);
  assert.equal(inView('待报销', [{...pending, note: {...pending.note, 付款来源: '公司账户'}}]).length, 0);
});

test('all daily source views use exact source identities and exclude voided entries where configured', () => {
  assert.ok(daily.views.every(view => view.type === 'table'));
  assert.deepEqual(['收支流水', '项目', '待报销', '已报销', '发票', '待确认'].map(name => inView(name).length), [3, 2, 1, 1, 1, 1]);
  const payment = record('示例付款');
  assert.equal(inView('收支流水', [{...payment, note: {...payment.note, 入账状态: '已作废'}}]).length, 0);
  assert.equal(inView('收支流水', [{...payment, note: {...payment.note, nf_source_collection: 'unrelated-ledger'}}]).length, 0);
  const invoice = record('示例发票');
  assert.equal(inView('发票', [{...invoice, note: {...invoice.note, 票据状态: '已作废'}}]).length, 0);
});

test('project layout includes only configured related sources and its title fields stay visible', () => {
  assert.deepEqual(profile.tabs.map(tab => tab.label), ['费用与报销', '收付款', '发票']);
  const projectPath = 'Finance/示例项目';
  const related = profile.tabs.map(tab => records.filter(item => item.note.nf_source_collection === tab.targetCollection
    && (item.note[tab.relationProperty] || []).some(link => link.split('|')[0] === '[[' + projectPath)));
  assert.deepEqual(related.map(items => items.length), [3, 3, 1]);
  assert.ok(!related.flat().includes(record('其他项目费用')));
  for (const tab of profile.tabs) assert.ok(tab.columns.includes(tab.titleProperty));
  assert.ok(related[0].find(item => item.path.endsWith('/已报销费用.md')).note.对应付款
    .some(link => link.includes('Finance/示例报销付款|')));
});

test('missing project and overview calculations remain distinct from explicit invoice zero', () => {
  const project = record('示例项目').note;
  for (const name of ['已收款', '已确认成本', '成员甲已分配', '成员乙已分配']) {
    assert.ok(project.nf_unavailable_fields.includes(name));
    assert.equal(project[name], undefined);
  }
  assert.equal(record('示例发票').note.票面税额, 0);
  assert.ok(record('资金总览').note.nf_unavailable_fields.includes('公司账面现金'));
  assert.equal(record('资金总览').note.公司账面现金, undefined);
});

test('monthly view uses confirmed ledger entries, keeps cash snapshot columns and groups by month', () => {
  assert.equal(records.filter(item => matches(monthly.filters, item)).length, 3);
  const first = record('示例收款');
  assert.equal(matches(monthly.filters, {...first, note: {...first.note, 入账状态: '待核对'}}), false);
  const view = monthly.views[0];
  assert.equal(view.groupBy.property, 'formula.月份');
  assert.ok(monthly.formulas.月份.includes('YYYY-MM'));
  assert.ok(view.order.includes('note.现金流入'));
  assert.ok(view.order.includes('note.现金流出'));
  for (const item of records.filter(item => matches(monthly.filters, item))) {
    assert.ok(item.note.nf_snapshot_fields.includes('现金流入'));
    assert.ok(item.note.nf_snapshot_fields.includes('现金流出'));
  }
});
