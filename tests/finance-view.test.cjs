const {test} = require('node:test');
const assert = require('node:assert/strict');
const {buildSync} = require('esbuild');
const {JSDOM} = require('jsdom');
class Value {constructor(value) {this.value = value;} toString() {return String(this.value);} isTruthy() {return !!this.value;}}
class NumberValue extends Value {}
class BooleanValue extends Value {}
class NullValue extends Value {constructor() {super(null);}}
class ListValue extends Value {length() {return this.value.length;} get(i) {return wrap(this.value[i]);} toString() {return this.value.join(', ');}}
class BasesView {constructor(controller) {this.app = controller.app;}}
const wrap = value => value === null || value === undefined ? new NullValue() : Array.isArray(value) ? new ListValue(value)
  : typeof value === 'number' ? new NumberValue(value) : typeof value === 'boolean' ? new BooleanValue(value) : new Value(value);
const stub = {BasesView, NumberValue, BooleanValue, NullValue, ListValue,
  parseLinktext: text => {const index = text.indexOf('#'); return {path: index < 0 ? text : text.slice(0, index), subpath: index < 0 ? '' : text.slice(index)};},
  setIcon: (el, icon) => {el.dataset.icon = icon;}};
const compiled = buildSync({entryPoints: ['src/finance-view.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['obsidian']}).outputFiles[0].text;
const mod = {exports: {}};
new Function('require', 'module', 'exports', compiled)(name => {assert.equal(name, 'obsidian'); return stub;}, mod, mod.exports);
const {FinanceView, registerFinanceView} = mod.exports;

function fixture(options = {}) {
  const dom = new JSDOM('<div id="root"></div>');
  const proto = dom.window.HTMLElement.prototype;
  proto.createEl = function(tag, opts = {}) {
    const el = this.ownerDocument.createElement(tag);
    if (opts.cls) el.className = opts.cls;
    if (opts.text !== undefined) el.textContent = opts.text;
    if (opts.href) el.href = opts.href;
    for (const [key, value] of Object.entries(opts.attr || {})) el.setAttribute(key, value);
    this.append(el); return el;
  };
  proto.createDiv = function(opts) {return this.createEl('div', opts);};
  proto.createSpan = function(opts) {return this.createEl('span', opts);};
  proto.empty = function() {this.replaceChildren();};
  const opened = [], inspected = [], metadata = {}, files = new Map();
  const destinations = new Map();
  const app = {metadataCache: {getFileCache: file => ({frontmatter: metadata[file.path] || {}}),
    getFirstLinkpathDest: path => {
      if (destinations.has(path)) return destinations.get(path);
      if (!files.has(path)) files.set(path, {path});
      return files.get(path);
    }},
    vault: {getResourcePath: file => 'app://vault/' + file.path, getFileByPath: path => files.get(path) ?? null},
    workspace: {openLinkText: () => {throw new Error('Never recreate a stale destination via openLinkText');},
      getLeaf: () => ({openFile: (file, state) => {opened.push([file.path, state]); return Promise.resolve();}})}};
  const view = new FinanceView({app}, dom.window.document.getElementById('root'), options.noInspector ? undefined : file => inspected.push(file.path));
  const order = ['note.流水摘要', 'note.金额', 'note.币种', 'note.方向', 'note.关联项目', 'note.计算净额'];
  view.config = {get: key => options[key], getAsPropertyId: key => options[key] || null,
    getOrder: () => order, getDisplayName: prop => prop.replace('note.', '')};
  const entry = (path, values) => {
    const file = {path, basename: path.replace('.md', ''), extension: 'md'}; files.set(path, file);
    return {file, getValue: prop => wrap(values[prop.replace('note.', '')])};
  };
  const group = (entries, key) => ({entries, key: wrap(key), hasKey: () => key !== undefined});
  const update = (entries, groups = [group(entries)]) => {view.data = {data: entries, groupedData: groups}; view.onDataUpdated();};
  return {dom, root: dom.window.document.getElementById('root'), view, entry, group, update, opened, inspected, metadata, order, destinations, files};
}

test('public view registration declares configurable properties and no writing callback', () => {
  let registration;
  assert.equal(registerFinanceView({registerBasesView: (id, value) => {assert.equal(id, 'nebula-finance'); registration = value; return true;}}), true);
  const options = registration.options();
  assert.ok(options.some(o => o.key === 'showSummaries' && o.type === 'toggle'));
  assert.ok(options.some(o => o.key === 'amountProperty' && o.type === 'property'));
  assert.ok(options.some(o => o.key === 'scopeNote' && o.type === 'text'));
});

test('only current query rows contribute to totals and native grouping gains separate readable linked summaries', () => {
  const f = fixture();
  const a = f.entry('a.md', {流水摘要: 'Receipt', 金额: 0.1, 币种: 'CNY', 方向: '收入', 关联项目: ['[[Projects/P|Project P]]']});
  const b = f.entry('b.md', {流水摘要: 'Cost', 金额: 0.2, 币种: 'CNY', 方向: '支出'});
  f.update([a, b], [f.group([a, b], '[[Projects/P|Project P]]')]);
  assert.match(f.root.querySelector('.nf-finance-summary').textContent, /净额−0\.10/);
  const header = f.root.querySelector('.nf-finance-group-name');
  assert.equal(header.textContent, 'Project P · 2');
  header.querySelector('button').click(); assert.equal(f.opened[0][0], 'Projects/P');
  assert.match(f.root.querySelector('.nf-finance-group-summary').textContent, /净额−0\.10/);
  f.update([a]); assert.match(f.root.querySelector('.nf-finance-summary').textContent, /当前筛选 · 1 条/);
  assert.equal(f.root.querySelectorAll('tbody tr').length, 1);
});

test('a multi-relation record can appear in more than one group without losing rows or double-counting global totals', () => {
  const f = fixture();
  const a = f.entry('a.md', {流水摘要: 'Shared receipt', 金额: 10, 币种: 'CNY', 方向: '收入'});
  f.update([a], [f.group([a], 'Project A'), f.group([a], 'Project B')]);
  assert.equal(f.root.querySelectorAll('.nf-finance-record-title').length, 2);
  assert.match(f.root.querySelector('.nf-finance-summary').textContent, /当前筛选 · 1 条/);
  f.root.querySelectorAll('.nf-finance-record-title')[1].click(); assert.deepEqual(f.inspected, ['a.md']);
});

test('unchanged metadata update retains a focused row control; numeric formatting never mutates stored values', () => {
  const f = fixture();
  const values = {流水摘要: 'A receipt', 金额: 1234.5, 币种: 'CNY', 方向: '收入'};
  const a = f.entry('a.md', values);
  f.update([a]);
  const button = f.root.querySelector('.nf-finance-record-title'); button.focus();
  f.update([a]);
  assert.equal(f.root.querySelector('.nf-finance-record-title'), button);
  assert.equal(f.dom.window.document.activeElement, button);
  assert.equal(f.root.querySelector('td.nf-finance-number').textContent, '1,234.50');
  assert.equal(values.金额, 1234.5);
});

test('unavailable formula references and snapshot fields are explicit, select tags and relation arrays retain structure', () => {
  const f = fixture({tagProperties: ['note.方向']});
  f.metadata['a.md'] = {nf_snapshot_fields: ['金额'], nf_unavailable_fields: ['计算净额']};
  const a = f.entry('a.md', {流水摘要: 'Snapshot', 金额: 5, 币种: 'CNY', 方向: '收入',
    关联项目: ['[[Projects/P|Project P]]', '[[Projects/Q|Project Q]]'], 计算净额: 'formulaResult://source/page/property'});
  f.update([a]);
  assert.ok(f.root.querySelector('.nf-finance-snapshot'));
  assert.equal(f.root.querySelector('.nf-finance-unavailable').textContent, '未取得');
  assert.ok(!f.root.textContent.includes('formulaResult://'));
  assert.equal(f.root.querySelector('.nf-finance-tag').textContent, '收入');
  const links = f.root.querySelectorAll('.nf-finance-values button');
  assert.equal(links.length, 2); links[1].click();
  assert.deepEqual(f.opened[0], ['Projects/Q', undefined]);
});

test('non-ledger views can hide summaries without inventing currency or direction', () => {
  const f = fixture({showSummaries: false});
  f.update([f.entry('invoice.md', {流水摘要: 'Invoice', 金额: 20})]);
  assert.equal(f.root.querySelector('.nf-finance-summary').hidden, true);
  assert.equal(f.root.querySelector('.nf-finance-hint').hidden, true);
  assert.ok(!f.root.textContent.includes('按币种分别计算'));
  assert.equal(f.root.querySelector('td.nf-finance-number').textContent, '20.00');
  f.view.onunload(); assert.equal(f.root.children.length, 0);
});

test('six configured columns stay six columns, including grouped rows, with the record icon beside the title', () => {
  const f = fixture({showSummaries: false});
  const a = f.entry('a.md', {流水摘要: 'A record', 金额: 10});
  f.update([a], [f.group([a], 'A group')]);
  assert.equal(f.root.querySelectorAll('thead th').length, 6);
  assert.equal(f.root.querySelectorAll('tbody tr:last-child td').length, 6);
  assert.equal(f.root.querySelector('.nf-finance-group th').colSpan, 6);
  const icon = f.root.querySelector('.nf-finance-title-cell .nf-finance-record-icon');
  assert.equal(icon.getAttribute('aria-label'), '查看记录与关联：A record');
  icon.click(); assert.deepEqual(f.inspected, ['a.md']);
  assert.equal(f.root.querySelectorAll('.nf-finance-record-icon').length, 1);
  assert.equal(f.root.querySelector('.nf-finance-icon-cell'), null);
});

test('views without a title column retain an accessible record control and adjust grouped column spans', () => {
  const f = fixture({showSummaries: false});
  f.order.splice(0, 1);
  const a = f.entry('a.md', {流水摘要: 'A record', 金额: 10});
  f.update([a], [f.group([a], 'A group')]);
  assert.equal(f.root.querySelectorAll('thead th').length, 6);
  assert.equal(f.root.querySelector('.nf-finance-group th').colSpan, 6);
  f.root.querySelector('td.nf-finance-icon-cell button').click();
  assert.deepEqual(f.inspected, ['a.md']);
});

test('source widths apply to the matching column, clamp numeric extremes, and reject strings or inherited values', () => {
  const columnWidths = Object.assign(Object.create({'note.币种': 300}), {
    'note.流水摘要': 280, 'note.金额': -1, 'note.方向': 90000, 'note.关联项目': '200px; color:red', 'note.计算净额': Infinity,
  });
  const f = fixture({columnWidths});
  const a = f.entry('a.md', {流水摘要: 'A record', 金额: 10});
  f.update([a]);
  for (const selector of ['thead th', 'tbody td']) {
    const cells = f.root.querySelectorAll(selector);
    const widths = [...cells].map(cell => cell.style.getPropertyValue('--nf-finance-column-width'));
    assert.deepEqual(widths, ['280px', '64px', '', '960px', '', '']);
  }
  columnWidths['note.流水摘要'] = 320;
  f.update([a]);
  assert.equal(f.root.querySelector('.nf-finance-title-cell').style.getPropertyValue('--nf-finance-column-width'), '320px');
});

test('scope descriptions are visible independently of summaries and rendered as text, with editable table labels', () => {
  const options = {showSummaries: false, scopeNote: '样本范围 <img src=x onerror=bad()>', tableLabel: '费用与报销'};
  const f = fixture(options);
  f.update([f.entry('a.md', {流水摘要: 'A record'})]);
  assert.equal(f.root.querySelector('.nf-finance-scope-note').hidden, false);
  assert.equal(f.root.querySelector('.nf-finance-scope-note').textContent, options.scopeNote);
  assert.equal(f.root.querySelector('img'), null);
  assert.equal(f.root.querySelector('caption').textContent, '费用与报销 · 1 条');
  options.scopeNote = ''; options.showSummaries = true;
  f.update([]);
  assert.equal(f.root.querySelector('.nf-finance-scope-note').hidden, true);
  assert.equal(f.root.querySelector('.nf-finance-hint').hidden, false);
  assert.equal(f.root.querySelector('caption').textContent, '费用与报销 · 当前筛选下没有记录');
});

test('tag columns keep their unbroken-label role when a configured narrow text column becomes a tag column', () => {
  const options = {showSummaries: false, columnWidths: {'note.方向': 64}, tagProperties: []};
  const f = fixture(options), value = {流水摘要: 'Multiple tags', 方向: ['个人代付', '待确认分配']};
  const row = f.entry('a.md', value);
  f.update([row]);
  assert.equal(f.root.querySelectorAll('.nf-finance-tag-cell').length, 0);
  options.tagProperties.push('note.方向');
  f.update([row]);
  const heading = f.root.querySelector('th.nf-finance-tag-cell'), cell = f.root.querySelector('td.nf-finance-tag-cell');
  assert.equal(heading.textContent, '方向');
  assert.equal(heading.style.getPropertyValue('--nf-finance-column-width'), '64px');
  assert.equal(cell.style.getPropertyValue('--nf-finance-column-width'), '64px');
  assert.deepEqual([...cell.querySelectorAll('.nf-finance-values > .nf-finance-tag')].map(tag => tag.textContent), ['个人代付', '待确认分配']);
  assert.equal(f.root.querySelector('th.nf-finance-number').textContent, '金额');
  options.tagProperties.length = 0;
  f.update([row]);
  assert.equal(f.root.querySelectorAll('.nf-finance-tag-cell').length, 0);
  assert.deepEqual(value.方向, ['个人代付', '待确认分配']);
});

test('date and relation columns receive readable-width roles; a missing relation never implicitly creates a note', () => {
  const f = fixture({showSummaries: false});
  f.order.push('note.交易日期');
  f.destinations.set('Missing', null);
  f.update([f.entry('a.md', {流水摘要: 'Receipt', 交易日期: '2026-10-31', 关联项目: ['[[Missing|Unresolved project]]']})]);
  assert.equal(f.root.querySelector('.nf-finance-date').textContent, '2026-10-31');
  const relation = f.root.querySelector('.nf-finance-relation button');
  assert.equal(relation.textContent, 'Unresolved project');
  relation.click(); assert.equal(f.opened.length, 0);
  assert.equal(relation.title, '未解析的本地链接');
});

test('unavailable note amounts, currencies and directions are excluded from totals even if stale values remain', () => {
  const f = fixture();
  const values = {流水摘要: 'Pending source calculation', 金额: 5, 币种: 'CNY', 方向: '收入'};
  const entries = ['金额', '币种', '方向'].map((field, index) => {
    const path = `unavailable-${index}.md`;
    f.metadata[path] = {nf_unavailable_fields: [field]};
    return f.entry(path, values);
  });
  f.update(entries, [f.group(entries, 'Project')]);
  assert.match(f.root.querySelector('.nf-finance-summary').textContent, /0 条计入收支/);
  assert.match(f.root.querySelector('.nf-finance-summary').textContent, /3 条未计入收支汇总/);
  assert.equal(f.root.querySelectorAll('.nf-finance-currency').length, 0);
  assert.equal(values.金额, 5);
});

test('missing imported note-field markers do not mask a separately calculated local formula with the same name', () => {
  const f = fixture({amountProperty: 'formula.金额'});
  f.order.splice(1, 1, 'formula.金额');
  f.metadata['a.md'] = {nf_unavailable_fields: ['金额'], nf_snapshot_fields: ['金额']};
  f.update([f.entry('a.md', {流水摘要: 'Local amount', 'formula.金额': 5, 币种: 'CNY', 方向: '收入'})]);
  assert.match(f.root.querySelector('.nf-finance-summary').textContent, /1 条计入收支/);
  assert.match(f.root.querySelector('.nf-finance-summary').textContent, /收入5\.00/);
  assert.equal(f.root.querySelector('td.nf-finance-number').textContent, '5.00');
  assert.equal(f.root.querySelector('.nf-finance-snapshot'), null);
  assert.equal(f.root.querySelector('.nf-finance-unavailable'), null);
});

test('remote attachment links keep signatures in href only and never automatically load remote media', () => {
  const f = fixture({showSummaries: false, attachmentProperties: ['note.文件']});
  f.order.push('note.文件');
  const url = 'https://files.example.com/folder/%E5%8F%91%E7%A5%A8.png?token=secret&signature=' + 'a'.repeat(3000) + '#private';
  f.update([f.entry('a.md', {流水摘要: 'Invoice', 文件: [url]})]);
  const anchor = f.root.querySelector('.nf-finance-external');
  assert.equal(anchor.textContent, '发票.png');
  assert.equal(anchor.href, url);
  assert.ok(!anchor.title.includes('secret'));
  assert.ok(!f.root.textContent.includes('secret'));
  assert.equal(f.root.querySelector('img'), null);
  assert.match(f.root.textContent, /未下载/);
});

test('long and malformed-encoded remote labels stay compact while invalid credential URLs are not rendered', () => {
  const f = fixture({showSummaries: false});
  f.order.push('note.文件');
  f.update([f.entry('a.md', {流水摘要: 'Links', 文件: [
    'https://example.com/' + 'long-path-'.repeat(100) + '?token=secret',
    'https://example.com/%E0%A4%A.pdf?token=secret',
    'https://user:password@example.com/invoice.pdf?token=secret',
  ]})]);
  const anchors = [...f.root.querySelectorAll('.nf-finance-external')];
  assert.equal(anchors.length, 2);
  assert.ok(anchors.every(anchor => anchor.textContent.length <= 64 && anchor.title.length <= 160));
  assert.ok(!f.root.textContent.includes('secret'));
  assert.ok(!f.root.textContent.includes('password'));
  assert.match(f.root.textContent, /链接无效/);
});

test('local raster attachments use fixed 32px thumbnails and open the original without stretching a row', () => {
  const f = fixture({showSummaries: false, attachmentProperties: ['note.文件']});
  f.order.push('note.文件');
  f.destinations.set('Files/receipt.png', {path: 'Files/receipt.png'});
  f.files.set('Files/receipt.png', f.destinations.get('Files/receipt.png'));
  f.update([f.entry('a.md', {流水摘要: 'Receipt', 文件: ['[[Files/receipt.png|Receipt scan]]']})]);
  const image = f.root.querySelector('.nf-finance-thumbnail img');
  assert.equal(image.src, 'app://vault/Files/receipt.png');
  assert.equal(image.getAttribute('width'), '32');
  assert.equal(image.getAttribute('height'), '32');
  assert.equal(image.alt, 'Receipt scan');
  image.parentElement.click();
  assert.deepEqual(f.opened, [['Files/receipt.png', undefined]]);
  const css = require('node:fs').readFileSync('styles.css', 'utf8').split('/* Compact local attachments and remote links;')[1];
  f.dom.window.document.head.appendChild(Object.assign(f.dom.window.document.createElement('style'), {textContent: '/* Compact local attachments and remote links;' + css}));
  const computed = f.dom.window.getComputedStyle(image.parentElement);
  assert.equal(computed.width, '32px'); assert.equal(computed.height, '32px');
});

test('Markdown relations open the record layout while heading links retain native note navigation', () => {
  const f = fixture();
  const project = {path: 'Projects/P.md', extension: 'md'};
  f.files.set(project.path, project); f.destinations.set('Projects/P', project);
  f.update([f.entry('a.md', {流水摘要: 'Receipt', 关联项目: ['[[Projects/P|Project]]', '[[Projects/P#Details|Details]]']})]);
  const links = f.root.querySelectorAll('.nf-finance-values button');
  links[0].click(); assert.deepEqual(f.inspected, [project.path]); assert.deepEqual(f.opened, []);
  links[1].click(); assert.deepEqual(f.opened, [[project.path, {eState: {subpath: '#Details'}}]]);
});

test('deleted relation targets, attachments and stale row entries never create replacement notes', () => {
  const f = fixture({noInspector: true, attachmentProperties: ['note.文件']});
  f.order.push('note.文件');
  const project = {path: 'Projects/P.md', extension: 'md'}, image = {path: 'Files/image.png', extension: 'png'};
  f.destinations.set('Projects/P', project); f.destinations.set(image.path, image);
  f.files.set(project.path, project); f.files.set(image.path, image);
  const a = f.entry('a.md', {流水摘要: 'Receipt', 关联项目: ['[[Projects/P|Project]]'], 文件: ['[[Files/image.png|Scan]]']});
  f.update([a]);
  f.files.delete(project.path); f.files.delete(image.path); f.files.delete(a.file.path);
  f.root.querySelector('.nf-finance-relation button').click();
  f.root.querySelector('.nf-finance-thumbnail').click();
  f.root.querySelector('.nf-finance-record-title').click();
  assert.deepEqual(f.opened, []); assert.deepEqual(f.inspected, []);
});
