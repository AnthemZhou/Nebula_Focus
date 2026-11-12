const {test} = require('node:test');
const assert = require('node:assert/strict');
const {buildSync} = require('esbuild');
const {JSDOM} = require('jsdom');
const code = buildSync({entryPoints: ['src/record-links.ts'], bundle: true, platform: 'node', format: 'cjs',
  external: ['obsidian'], write: false}).outputFiles[0].text;

function fixture() {
  const dom = new JSDOM('<!doctype html><body></body>'), doc = dom.window.document;
  const files = new Map(), caches = new Map(), resolutions = new Map(), contents = new Map(), opened = [], modals = [];
  dom.window.HTMLElement.prototype.createEl = function(tag, options = {}) {
    const el = doc.createElement(tag);
    if (options.cls) el.className = options.cls;
    if (options.text) el.textContent = options.text;
    for (const [key, value] of Object.entries(options.attr || {})) el.setAttribute(key, value);
    this.append(el); return el;
  };
  dom.window.HTMLElement.prototype.createDiv = function(options) {return this.createEl('div', options);};
  dom.window.HTMLElement.prototype.createSpan = function(options) {return this.createEl('span', options);};
  dom.window.HTMLElement.prototype.addClass = function(cls) {this.classList.add(cls);};
  const app = {vault: {getFileByPath: path => files.get(path) || null,
      getMarkdownFiles: () => [...files.values()].filter(file => file.extension === 'md'),
      cachedRead: async file => contents.get(file.path), getResourcePath: file => 'app://local/' + file.path},
    metadataCache: {resolvedLinks: {}, getFileCache: file => caches.get(file.path) || null,
      getFirstLinkpathDest: (path, source) => files.get(resolutions.get(source + '|' + path) || path) || null},
    workspace: {getLeaf: mode => ({async openFile(file, state) {opened.push({file: file.path, mode, state});}})}};
  class Modal {
    constructor(app) {this.app = app; this.modalEl = doc.body.createDiv(); this.contentEl = this.modalEl.createDiv(); this.titleEl = doc.createElement('h2'); modals.push(this);}
    setTitle(title) {this.titleEl.textContent = title;}
    open() {this.onOpen();}
    close() {this.closed = true; this.onClose();}
  }
  const module = {exports: {}};
  const parseLinktext = link => {const i = link.indexOf('#'); return i < 0 ? {path: link, subpath: ''} : {path: link.slice(0, i), subpath: link.slice(i)};};
  new Function('require', 'module', 'exports', code)(name => {
    assert.equal(name, 'obsidian'); return {Modal, parseLinktext, setIcon(el, name) {el.dataset.icon = name;}};
  }, module, module.exports);
  function file(path, cache = {}) {
    const name = path.split('/').pop(), result = {path, name, basename: name.replace(/\.[^.]+$/, ''), extension: name.split('.').pop()};
    files.set(path, result); caches.set(path, cache); return result;
  }
  return {...module.exports, app, files, caches, resolutions, contents, opened, modals, doc, dom, file,
    settle: () => new Promise(resolve => setImmediate(resolve)), close: () => dom.window.close()};
}

const ref = (link, displayText, key) => ({link, original: '[[' + link + ']]', displayText, ...(key ? {key} : {})});

test('source links allow actual Notion hosts over HTTPS and reject deceptive or active URLs', () => {
  const f = fixture(); try {
    for (const url of ['https://notion.so/a', 'https://www.notion.so/a', 'https://team.notion.site/a', 'https://app.notion.com/p/a'])
      assert.equal(f.notionSourceUrl(url), url);
    for (const url of ['http://notion.so/a', 'https://notion.so.evil.test/a', 'https://notion.site.evil/a', 'https://evilnotion.so/a',
      'https://notion.so@evil.test/a', 'https://user:secret@notion.so/a', 'https://notion.so:8443/a', 'javascript:alert(1)', null, 1])
      assert.equal(f.notionSourceUrl(url), null, String(url));
  } finally {f.close();}
});

test('relations retain their property contexts, local resolution, aliases and unresolved records', () => {
  const f = fixture(); try {
    const project = f.file('Projects/uuid.md', {frontmatter: {aliases: ['真实项目名称']}});
    const attachment = f.file('Receipts/bill.pdf');
    const file = f.file('Ledger/entry.md', {frontmatter: {项目: ['[[Projects/uuid.md]]', '[[Missing]]'], '关联.0': '[[Projects/uuid.md]]'},
      frontmatterLinks: [ref(project.path, project.path, '项目.0'), ref('Missing', '未导入项目', '项目.1'),
        ref(project.path, project.path, '项目.2'), ref(project.path, '另一个字段别名', '关联.0')],
      links: [ref(project.path + '#付款', '付款明细'), ref('https://example.test', '远程'), ref('mailto:a@example.test', '邮件')],
      embeds: [ref(attachment.path, '发票 PDF')]});
    const details = f.inspectRecord(f.app, file);
    assert.equal(details.outgoing.length, 5);
    assert.deepEqual(details.outgoing.map(link => [link.property, link.label, link.file?.path, link.kind]), [
      ['项目', '真实项目名称', project.path, 'property'], ['项目', '未导入项目', undefined, 'property'],
      ['关联.0', '另一个字段别名', project.path, 'property'], ['正文', '付款明细', project.path, 'body'],
      ['附件', '发票 PDF', attachment.path, 'attachment']]);
  } finally {f.close();}
});

test('backlinks use resolved paths rather than duplicate names and preserve relation direction and labels', () => {
  const f = fixture(); try {
    const target = f.file('Projects/a.md'), duplicate = f.file('Elsewhere/a.md');
    const source = f.file('Ledger/uuid.md', {frontmatter: {aliases: ['这笔付款']}, frontmatterLinks: [ref(target.path, '', '项目')]});
    f.file('Notes/source.md', {links: [ref(target.path, '')]});
    f.app.metadataCache.resolvedLinks = {[source.path]: {[target.path]: 2, [duplicate.path]: 1},
      'Notes/source.md': {[target.path]: 1}, 'Removed.md': {[target.path]: 1}, [target.path]: {[target.path]: 1}};
    const details = f.inspectRecord(f.app, target);
    assert.deepEqual(details.incoming.map(link => [link.file.path, link.label, link.count, link.contexts]),
      [[source.path, '这笔付款', 2, ['项目']], ['Notes/source.md', 'source', 1, ['正文']]]);
    assert.equal(details.outgoing.length, 0);
  } finally {f.close();}
});

test('import metadata distinguishes snapshots, unavailable values and real zero without mutations', () => {
  const f = fixture(); try {
    const cache = {frontmatter: {aliases: ['金额为零的付款'], 金额: 0, 分摊: 12.34, 备注: '',
      nf_snapshot_fields: ['分摊', '未授权汇总'], nf_unavailable_fields: ['未授权汇总'],
      nf_source_id: 'id', nf_source_url: 'https://app.notion.com/p/id', nf_source_collection: 'collection', nf_imported_at: '2026-11-06T00:00:00Z', position: {}}};
    const before = JSON.stringify(cache), file = f.file('Ledger/uuid.md', cache), result = f.inspectRecord(f.app, file);
    assert.equal(result.title, '金额为零的付款');
    assert.deepEqual(result.properties, [
      {name: '金额', value: 0, snapshot: false, unavailable: false},
      {name: '分摊', value: 12.34, snapshot: true, unavailable: false},
      {name: '备注', value: '', snapshot: false, unavailable: false},
      {name: '未授权汇总', value: null, snapshot: true, unavailable: true}]);
    assert.equal(JSON.stringify(cache), before); assert.equal(result.sourceId, 'id');
    assert.equal(result.sourceUrl, 'https://app.notion.com/p/id');
  } finally {f.close();}
});

test('human-readable titles prefer a usable alias and fall back to filename for malformed aliases', () => {
  const f = fixture(); try {
    for (const [aliases, expected] of [[' 项目 A ', '项目 A'], [['', null, '项目 B'], '项目 B'], [[], 'uuid'], [{bad: true}, 'uuid']]) {
      const file = f.file('uuid.md', {frontmatter: {aliases}});
      assert.equal(f.recordTitle(f.app, file), expected);
    }
  } finally {f.close();}
});

test('inspector puts relationships first, renders wiki properties as links and collapses missing fields and provenance', () => {
  const f = fixture(); try {
    const project = f.file('Projects/id.md', {frontmatter: {aliases: '项目甲'}});
    const file = f.file('Ledger/uuid.md', {frontmatter: {aliases: ['付款甲'], 项目: '[[Projects/id.md]]', 金额: 0,
      nf_unavailable_fields: ['未读公式'], nf_source_collection: 'raw-uuid', nf_source_id: 'raw-id'},
      frontmatterLinks: [ref(project.path, '', '项目')]});
    const modal = f.openRecordInspector(f.app, file);
    assert.equal(modal.titleEl.textContent, '付款甲');
    assert.deepEqual([...modal.contentEl.querySelectorAll('h3')].map(el => el.textContent), ['此记录关联到', '关联到此记录', '属性']);
    assert.equal(modal.contentEl.querySelector('dd .bui-record-file').textContent, '项目甲');
    assert.equal(modal.contentEl.textContent.includes('[[Projects/id.md]]'), false);
    assert.equal(modal.contentEl.querySelector('.bui-record-unavailable').open, false);
    assert.match(modal.contentEl.querySelector('.bui-record-unavailable summary').textContent, /1/);
    assert.equal(modal.contentEl.querySelector('.bui-record-provenance').open, false);
    assert.equal(modal.contentEl.querySelectorAll('dt').length, 2);
    assert.equal(modal.contentEl.querySelectorAll('dd')[1].textContent, '0');
  } finally {f.close();}
});

test('navigation retains headings and modifier keys, closes on success and never writes a note', async () => {
  const f = fixture(); try {
    const related = f.file('Projects/target.md');
    const file = f.file('Ledger/source.md', {links: [ref(related.path + '#付款', '付款章节')]});
    const modal = f.openRecordInspector(f.app, file);
    modal.contentEl.querySelector('.bui-record-file').dispatchEvent(new f.dom.window.MouseEvent('click', {bubbles: true, metaKey: true}));
    await f.settle();
    assert.deepEqual(f.opened, [{file: related.path, mode: 'tab', state: {eState: {subpath: '#付款'}}}]);
    assert.equal(modal.closed, true);
  } finally {f.close();}
});

test('deleted or replaced targets cannot be created implicitly by clicking stale inspector links', async () => {
  const f = fixture(); try {
    const target = f.file('target.md'), source = f.file('source.md', {links: [ref(target.path, '')]});
    const modal = f.openRecordInspector(f.app, source);
    f.files.delete(target.path);
    modal.contentEl.querySelector('.bui-record-file').click(); await f.settle();
    assert.equal(f.opened.length, 0); assert.equal(modal.closed, undefined);
    assert.match(modal.contentEl.textContent, /未解析的本地链接/);
  } finally {f.close();}
});

test('mixed property lists keep external URLs, prose and zero alongside clickable local attachments', () => {
  const f = fixture(); try {
    const receipt = f.file('receipt.pdf');
    const values = ['[[receipt.pdf|发票原件]]', 'https://invoice.example/x', '手工补录说明', 0, '请查看 [[receipt.pdf]]'];
    const file = f.file('source.md', {frontmatter: {文件媒体: values},
      frontmatterLinks: [ref(receipt.path, '发票原件', '文件媒体.0')]});
    const modal = f.openRecordInspector(f.app, file), cell = modal.contentEl.querySelector('dd');
    assert.equal(cell.querySelectorAll('.bui-record-file').length, 1);
    assert.equal(cell.querySelector('a').getAttribute('href'), 'https://invoice.example/x');
    assert.deepEqual([...cell.children].map(item => item.textContent),
      ['发票原件', 'invoice.example/x', '手工补录说明', '0', '请查看 [[receipt.pdf]]']);
  } finally {f.close();}
});

test('raw values are text only and metadata indexing absence is shown honestly', () => {
  const f = fixture(); try {
    const file = f.file('source.md', {frontmatter: {备注: '<img src=x onerror=alert(1)>'}});
    const modal = f.openRecordInspector(f.app, file);
    assert.equal(modal.contentEl.querySelector('img'), null);
    assert.match(modal.contentEl.textContent, /<img/);
    f.caches.delete(file.path);
    modal.contentEl.querySelector('.bui-record-refresh').click();
    assert.match(modal.contentEl.textContent, /仍在索引/);
  } finally {f.close();}
});

test('open failures stay visible in the inspector without an unhandled rejection', async () => {
  const f = fixture(); try {
    const file = f.file('source.md');
    f.app.workspace.getLeaf = () => ({async openFile() {throw new Error('unavailable');}});
    const modal = f.openRecordInspector(f.app, file);
    modal.contentEl.querySelector('.bui-record-actions button').click(); await f.settle();
    assert.equal(modal.closed, undefined); assert.match(modal.contentEl.querySelector('[role="alert"]').textContent, /无法打开/);
  } finally {f.close();}
});

function installLayout(f) {
  f.file('Sample/nebula-record-layouts.json');
  const value = {version: 1, profiles: {projects: {
    metrics: [{property: 'Contract', format: 'number', currency: 'CNY'}, {property: 'Received', format: 'number'}, {property: 'Missing', format: 'number'}],
    tabs: [
      {label: 'Expenses', targetCollection: 'costs', relationProperty: 'Project', forwardProperty: 'Costs', titleProperty: 'Title',
        columns: ['Title', 'Amount', 'Category', 'Project'], numberProperties: ['Amount'], tagProperties: ['Category']},
      {label: 'Payments', targetCollection: 'payments', relationProperty: 'Project', titleProperty: 'Title', columns: ['Title', 'Amount']}
    ]
  }}};
  f.contents.set('Sample/nebula-record-layouts.json', JSON.stringify(value));
  const project = f.file('Sample/Records/project.md', {frontmatter: {aliases: ['Sample project'], nf_source_collection: 'projects', Contract: 0,
    nf_snapshot_fields: ['Contract'], nf_unavailable_fields: ['Received'], Costs: ['[[Sample/Records/cost.md]]', 'https://notion.so/missing']}});
  const expense = f.file('Sample/Records/cost.md', {frontmatter: {aliases: ['Expense A'], nf_source_collection: 'costs', Title: 'Expense A',
    Amount: 25, Category: ['Travel', 'Supplies'], Project: '[[Sample/Records/project.md]]'}, frontmatterLinks: [ref(project.path, '', 'Project')]});
  return {project, expense, value};
}

test('profiled inspector shows source metrics first, exact table columns, tabs and collapsed raw details without writes', async () => {
  const f = fixture(); try {
    const {project} = installLayout(f), before = JSON.stringify([...f.caches]);
    const modal = f.openRecordInspector(f.app, project); await f.settle();
    assert.deepEqual([...modal.contentEl.querySelectorAll('.nf-record-layout-metric-value')].map(el => el.textContent), ['CNY 0.00', '未取得', '未取得']);
    assert.equal(modal.contentEl.querySelector('.nf-record-layout-raw').open, false);
    assert.deepEqual([...modal.contentEl.querySelectorAll('th')].map(el => el.textContent), ['Title', 'Amount', 'Category', 'Project']);
    assert.equal(modal.contentEl.querySelector('.nf-record-layout-table tbody tr').children.length, 4);
    assert.match(modal.contentEl.querySelector('.nf-record-layout-panel').textContent, /不能代表完整账本/);
    assert.deepEqual([...modal.contentEl.querySelectorAll('.nf-record-layout-tag')].map(el => el.textContent), ['Travel', 'Supplies']);
    const tabs = modal.contentEl.querySelectorAll('[role="tab"]'), panels = modal.contentEl.querySelectorAll('[role="tabpanel"]');
    assert.equal(panels[0].hidden, false); assert.equal(panels[1].hidden, true);
    tabs[1].click(); assert.equal(panels[0].hidden, true); assert.equal(panels[1].hidden, false);
    tabs[1].dispatchEvent(new f.dom.window.KeyboardEvent('keydown', {key: 'Home', bubbles: true}));
    assert.equal(tabs[0].getAttribute('aria-selected'), 'true'); assert.equal(panels[0].hidden, false);
    assert.equal(JSON.stringify([...f.caches]), before); assert.deepEqual(f.opened, []);
  } finally {f.close();}
});

test('profiled relation navigation stays in inspector with back action while explicit Open note still opens native file', async () => {
  const f = fixture(); try {
    const {project, expense} = installLayout(f);
    const modal = f.openRecordInspector(f.app, project); await f.settle();
    modal.contentEl.querySelector('.nf-record-layout-table tbody .bui-record-file').click(); await f.settle();
    assert.equal(modal.titleEl.textContent, 'Expense A'); assert.equal(modal.closed, undefined); assert.equal(f.opened.length, 0);
    const back = [...modal.contentEl.querySelectorAll('.bui-record-actions button')].find(el => el.textContent === '返回上一记录');
    back.click(); await f.settle(); assert.equal(modal.titleEl.textContent, 'Sample project');
    modal.contentEl.querySelector('.nf-record-layout-table tbody .bui-record-file').click(); await f.settle();
    [...modal.contentEl.querySelectorAll('.bui-record-actions button')].find(el => el.textContent === '打开笔记').click(); await f.settle();
    assert.deepEqual(f.opened, [{file: expense.path, mode: false, state: undefined}]);
    assert.equal(modal.closed, true);
  } finally {f.close();}
});

test('invalid sidecar safely falls back to raw record without interpreting configuration text as HTML', async () => {
  const f = fixture(); try {
    const {project} = installLayout(f);
    f.contents.set('Sample/nebula-record-layouts.json', '<script>alert(1)</script>');
    const modal = f.openRecordInspector(f.app, project); await f.settle();
    assert.equal(modal.contentEl.querySelector('script'), null); assert.match(modal.contentEl.textContent, /配置无效/);
    assert.equal(modal.contentEl.querySelector('.nf-record-layout'), null);
    assert.ok(modal.contentEl.querySelector('.bui-record-properties'));
  } finally {f.close();}
});

test('refresh reloads configuration and source values; closed modal ignores outstanding asynchronous read', async () => {
  const f = fixture(); try {
    const {project} = installLayout(f);
    const modal = f.openRecordInspector(f.app, project); await f.settle();
    f.caches.get(project.path).frontmatter.Contract = 120;
    modal.contentEl.querySelector('.bui-record-refresh').click(); await f.settle();
    assert.equal(modal.contentEl.querySelector('.nf-record-layout-metric-value').textContent, 'CNY 120.00');
    let resolve;
    f.app.vault.cachedRead = () => new Promise(done => {resolve = done;});
    modal.contentEl.querySelector('.bui-record-refresh').click();
    modal.close(); resolve(f.contents.get('Sample/nebula-record-layouts.json')); await f.settle();
    assert.equal(modal.contentEl.children.length, 0);
  } finally {f.close();}
});

test('layout leaves empty tags uncolored and renders local image attachments as compact thumbnails', async () => {
  const f = fixture(); try {
    const {project, expense, value} = installLayout(f);
    const tab = value.profiles.projects.tabs[0];
    tab.columns.push('Receipt'); tab.attachmentProperties = ['Receipt'];
    f.contents.set('Sample/nebula-record-layouts.json', JSON.stringify(value));
    const frontmatter = f.caches.get(expense.path).frontmatter;
    frontmatter.Category = ['']; frontmatter.Receipt = '[[Sample/receipt.png|Receipt]]';
    const image = f.file('Sample/receipt.png');
    const modal = f.openRecordInspector(f.app, project); await f.settle();
    assert.equal(modal.modalEl.classList.contains('nf-record-layout-modal'), true);
    assert.equal(modal.contentEl.querySelectorAll('.nf-record-layout-tag').length, 0);
    assert.equal(modal.contentEl.querySelectorAll('.nf-record-layout-table td')[2].textContent, '—');
    const thumbnail = modal.contentEl.querySelector('.nf-record-layout-thumbnail');
    assert.equal(thumbnail.querySelector('img').getAttribute('src'), 'app://local/' + image.path);
    thumbnail.click(); await f.settle();
    assert.equal(f.opened[0].file, image.path);
  } finally {f.close();}
});

test('signed URLs stay compact in profiled cells and raw properties, without remote image loading', async () => {
  const f = fixture(); try {
    const {project, expense, value} = installLayout(f), tab = value.profiles.projects.tabs[0];
    tab.columns.push('Receipt'); tab.attachmentProperties = ['Receipt'];
    f.contents.set('Sample/nebula-record-layouts.json', JSON.stringify(value));
    const url = 'https://bucket.example/%E5%8F%91%E7%A5%A8.pdf?X-Amz-Credential=private#hidden';
    f.caches.get(expense.path).frontmatter.Receipt = url;
    const modal = f.openRecordInspector(f.app, project); await f.settle();
    const link = modal.contentEl.querySelector('.nf-record-layout-table a');
    assert.equal(link.textContent, '发票.pdf'); assert.equal(link.href, url); assert.ok(!link.title.includes('private'));
    assert.ok(!modal.contentEl.textContent.includes('X-Amz')); assert.equal(modal.contentEl.querySelector('img'), null);
    modal.contentEl.querySelector('.nf-record-layout-table .bui-record-file').click(); await f.settle();
    assert.equal(modal.contentEl.querySelector('dd a').textContent, '发票.pdf');
    assert.ok(!modal.contentEl.textContent.includes('X-Amz'));
  } finally {f.close();}
});

test('a delayed native open cannot close a refreshed inspector or append errors after close', async () => {
  const f = fixture(); try {
    const file = f.file('source.md'); let resolve, reject;
    f.app.workspace.getLeaf = () => ({openFile: () => new Promise((yes, no) => {resolve = yes; reject = no;})});
    const modal = f.openRecordInspector(f.app, file);
    modal.contentEl.querySelector('.bui-record-actions button').click();
    modal.contentEl.querySelector('.bui-record-refresh').click(); resolve(); await f.settle();
    assert.equal(modal.closed, undefined);
    modal.contentEl.querySelector('.bui-record-actions button').click(); modal.close(); reject(new Error('late')); await f.settle();
    assert.equal(modal.contentEl.children.length, 0);
  } finally {f.close();}
});

test('profile datetime cells use browser-local time and retain original ISO in tooltip without modifying notes', async () => {
  const f = fixture(); try {
    const {project, expense, value} = installLayout(f), tab = value.profiles.projects.tabs[0];
    tab.columns.push('Date', 'Day');
    f.contents.set('Sample/nebula-record-layouts.json', JSON.stringify(value));
    const source = '2025-12-05T01:55:00.000Z', date = new Date(source), pad = n => String(n).padStart(2, '0');
    const expected = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    const fm = f.caches.get(expense.path).frontmatter; fm.Date = source; fm.Day = '2025-12-05';
    const before = JSON.stringify(fm), modal = f.openRecordInspector(f.app, project); await f.settle();
    const cells = modal.contentEl.querySelectorAll('.nf-record-layout-table tbody td');
    assert.equal(cells[4].textContent, expected); assert.equal(cells[4].firstElementChild.title, source);
    assert.equal(cells[5].textContent, '2025-12-05'); assert.equal(JSON.stringify(fm), before);
  } finally {f.close();}
});
