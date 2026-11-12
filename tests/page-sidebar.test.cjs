const {test} = require('node:test');
const assert = require('node:assert/strict');
const {buildSync} = require('esbuild');
const {JSDOM} = require('jsdom');
const code = buildSync({entryPoints: ['src/page-sidebar.ts'], bundle: true, platform: 'node', format: 'cjs', external: ['obsidian'], write: false}).outputFiles[0].text;

function fixture(initial, initialEnabled = true, options = {}) {
  const dom = new JSDOM('<!doctype html><body></body>'), win = dom.window, doc = win.document;
  win.HTMLElement.prototype.createEl = function(tag, options = {}) {
    const el = doc.createElement(tag);
    if (options.cls) el.className = options.cls;
    if (options.text) el.textContent = options.text;
    for (const [key, value] of Object.entries(options.attr || {})) el.setAttribute(key, value);
    for (const key of ['type', 'placeholder']) if (options[key]) el[key] = options[key];
    this.append(el); return el;
  };
  win.HTMLElement.prototype.createDiv = function(options) {return this.createEl('div', options);};
  win.HTMLElement.prototype.createSpan = function(options) {return this.createEl('span', options);};
  class Component {registerEvent() {}}
  class TFile {constructor(path) {this.path = path; this.name = path.split('/').pop(); this.extension = path.split('.').pop(); this.basename = this.name.slice(0, -(this.extension.length + 1));}}
  class TFolder {constructor(path, children) {this.path = path; this.name = path.split('/').pop(); this.children = children; for (const child of children) child.parent = this;}}
  const root = new TFolder('/', [new TFile('Home.md'), new TFolder('Home', [new TFile('Home/Child.md')]), new TFile('Alpha.md'), new TFile('Zebra.md')]);
  let active = 'Home.md', failSave = false, activeType = 'markdown', collapsed = 0, failOpen = false;
  const platform = {isMobileApp: !!options.mobile};
  const writes = [], opens = [], notices = [], menus = [], commands = [], created = [], modals = [], settingTabs = [], layoutReady = [];
  const contents = new Map(), metadata = new Map(), disk = new Map([['.obsidian/core-plugins.json', JSON.stringify({bookmarks: true})]]), reads = [];
  let readBody = file => contents.get(file.path) ?? '';
  const leaves = [], revealed = [], viewStates = []; let switchHook;
  const addLeaf = (type, currentView, state = {type, state: {}}) => {
    const leaf = {view: currentView ?? {getViewType: () => type}, state,
      getViewState() {return this.state;},
      async setViewState(next) {
        viewStates.push({leaf: this, state: next}); await switchHook?.(this, next);
        await this.view.onClose?.(); this.state = next;
        this.view = next.type === 'nebula-pages' ? new module.exports.PageSidebarView(this, sidebar) : {getViewType: () => next.type};
        await this.view.onOpen?.();
      }};
    if (currentView) currentView.leaf = leaf; leaves.push(leaf); return leaf;
  };
  const find = (path, node = root) => node.path === path ? node : node.children?.map(child => find(path, child)).find(Boolean);
  const app = {metadataCache: {getFileCache: file => metadata.get(file.path) ?? {}},
    vault: {configDir: '.obsidian', getRoot: () => root, getName: () => '测试库', getAbstractFileByPath: path => find(path), on() {},
    async cachedRead(file) {reads.push(file.path); return readBody(file);},
    adapter: {async exists(path) {return disk.has(path);}, async read(path) {reads.push(path); if (!disk.has(path)) throw new Error('ENOENT'); return disk.get(path);}},
    async createFolder(path) {created.push({folder: path}); const parent = find(path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '/'); parent.children.push(new TFolder(path, []));},
    async create(path, content) {created.push({file: path, content}); const file = new TFile(path); const parent = find(path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '/'); parent.children.push(file); return file;}},
    workspace: {on() {}, onLayoutReady(fn) {layoutReady.push(fn);}, getActiveFile: () => find(active),
      getMostRecentLeaf: () => ({view: {getViewType: () => activeType}}), leftSplit: {collapse() {collapsed++;}},
      getLeavesOfType: type => leaves.filter(leaf => leaf.view.getViewType() === type),
      iterateAllLeaves: callback => leaves.forEach(callback), getLeftLeaf: split => split ? addLeaf('empty') : leaves[0] ?? addLeaf('empty'),
      revealLeaf: async leaf => {revealed.push(leaf);},
      getLeaf: mode => ({async openFile(file, state) {if (failOpen) throw new Error('cannot open'); opens.push({path: file.path, mode, ...(state ? {state} : {})}); active = file.path; activeType = 'markdown';}})}};
  class ItemView extends Component {constructor(leaf) {super(); this.leaf = leaf; this.app = app; this.contentEl = doc.createElement('div'); doc.body.append(this.contentEl);}}
  class Modal {constructor() {this.app = app; this.modalEl = doc.createElement('div'); this.contentEl = doc.createElement('div'); this.modalEl.append(this.contentEl); doc.body.append(this.modalEl); modals.push(this);} setTitle() {} open() {this.closed = false; this.onOpen();} close() {if (this.closed) return; this.closed = true; this.onClose(); this.modalEl.remove();}}
  class Menu {constructor() {menus.push(this); this.items = [];} setUseNativeMenu() {return this;} addItem(fn) {const item = {setTitle(title) {this.title = title; return this;}, setIcon() {return this;}, setChecked() {return this;}, setDisabled(disabled) {this.disabled = disabled; return this;}, onClick(fn) {this.click = fn; return this;}}; fn(item); this.items.push(item); return this;} addSeparator() {} showAtPosition() {}}
  const obsidian = {PluginSettingTab: class {constructor(app) {this.app = app;} update() {}}, Platform: platform, Component, ItemView, TFile, TFolder, Modal, Menu, Notice: class {constructor(value) {notices.push(value);}}, setIcon: (el, icon) => {el.dataset.icon = icon;},
    normalizePath: path => path.replace(/\\/g, '/').replace(/\/+$/, ''),
    getAllTags: cache => [...(cache.tags ?? []).map(item => item.tag), ...(cache.frontmatter?.tags ?? []).map(tag => '#' + tag.replace(/^#/, ''))]};
  const module = {exports: {}};
  new Function('module', 'exports', 'require', 'window', 'console', code)(module, module.exports, name => {assert.equal(name, 'obsidian'); return obsidian;}, win, {error() {}});
  const ribbonIcon = doc.createElement('div');
  const plugin = {app, registerView() {}, addCommand(command) {commands.push(command);}, addRibbonIcon() {return ribbonIcon;}, addSettingTab(tab) {settingTabs.push(tab);}};
  const sidebar = new module.exports.PageSidebar(plugin, initial, async value => {if (failSave) throw new Error('disk full'); writes.push(JSON.parse(JSON.stringify(value)));}, initialEnabled);
  const view = new module.exports.PageSidebarView({}, sidebar);
  const click = (el, options = {}) => el.dispatchEvent(new win.MouseEvent('click', {bubbles: true, cancelable: true, ...options}));
  const key = (el, name, options = {}) => el.dispatchEvent(new win.KeyboardEvent('keydown', {key: name, bubbles: true, cancelable: true, ...options}));
  const settle = () => new Promise(resolve => setImmediate(resolve));
  return {dom, doc, win, root, sidebar, view, writes, opens, notices, menus, commands, created, modals, settingTabs, layoutReady, ribbonIcon, find, click, key, settle,
    leaves, revealed, viewStates, addLeaf, app, contents, metadata, disk, reads, setReadBody: reader => {readBody = reader;}, setSwitchHook: hook => {switchHook = hook;},
    collapsed: () => collapsed, platform, failOpen: () => {failOpen = true;},
    row: id => [...doc.querySelectorAll('.bui-page-row')].find(row => row.dataset.id === id),
    failSave() {failSave = true;}, restoreSave() {failSave = false;}, close() {for (const current of [...sidebar.views]) current.onClose(); view.onClose(); sidebar.onunload(); win.close();}};
}

test('opening the sidebar merges root entries; title opens the note, arrow expands without opening', async () => {
  const f = fixture(); try {
    await f.view.onOpen(); assert.equal(f.doc.querySelectorAll('.bui-page-row').length, 3);
    f.click(f.row('Home').querySelector('.bui-page-disclosure')); await f.settle();
    assert.ok(f.row('Home/Child.md')); assert.deepEqual(f.opens, []);
    f.click(f.row('Home').querySelector('.bui-page-title'));
    assert.deepEqual(f.opens, [{path: 'Home.md', mode: false}]);
    f.click(f.row('Alpha.md'), {metaKey: true}); assert.equal(f.opens[1].mode, false);
  } finally {f.close();}
});

test('project and page groups retain one tree hierarchy without copying page entries', async () => {
  const f = fixture({expanded: ['Home']}); try {
    await f.view.onOpen();
    const groups = [...f.doc.querySelectorAll('.bui-pages-group')];
    assert.deepEqual(groups.map(el => el.getAttribute('aria-label')), ['项目', '页面']);
    assert.deepEqual([...groups[0].querySelectorAll('.bui-page-row')].map(el => el.dataset.id), ['Home', 'Home/Child.md']);
    assert.deepEqual([...groups[1].querySelectorAll('.bui-page-row')].map(el => el.dataset.id), ['Alpha.md', 'Zebra.md']);
    assert.equal(f.doc.querySelectorAll('.bui-page-row[data-id="Home"]').length, 1);
    assert.deepEqual(f.created, []); assert.deepEqual(f.writes, []);
  } finally {f.close();}
});

test('desktop and mobile use one magnifier to open unified search without replacing the sidebar', async () => {
  for (const mobile of [false, true]) {
    const f = fixture(undefined, true, {mobile}); try {
      await f.view.onOpen();
      assert.equal(f.doc.querySelector('.bui-pages-home'), null);
      assert.equal(f.doc.querySelector('.bui-pages-header'), null);
      assert.equal(f.doc.querySelector('.bui-pages-vault'), null);
      assert.equal(f.doc.querySelector('.bui-pages-toolbar input'), null);
      assert.equal(f.doc.querySelector('[aria-label="侧栏选项"]'), null);
      const search = f.doc.querySelector('.bui-pages-search-button'); assert.ok(search);
      if (mobile) assert.equal(f.doc.querySelector('.bui-pages-vault-name').textContent, '测试库');
      else assert.ok(f.doc.querySelector('.bui-pages-desktop-header'));
      f.click(search); const modal = f.modals.at(-1);
      assert.deepEqual([...modal.contentEl.querySelectorAll('.bui-sidebar-search-modes button')].map(el => el.textContent), ['直接搜索', '标签', '书签', '文件列表']);
      const input = modal.contentEl.querySelector('input'); input.value = 'child'; input.dispatchEvent(new f.win.Event('input'));
      assert.equal(modal.contentEl.querySelector('.bui-sidebar-search-title').textContent, 'Child');
      assert.equal(f.row('Home/Child.md'), undefined, 'finder does not expand or filter the underlying tree');
      f.click(modal.contentEl.querySelector('.bui-sidebar-search-cancel'));
      assert.ok(f.doc.querySelector('.bui-pages-search-button')); assert.deepEqual(f.viewStates, []);
      assert.equal(f.doc.querySelector('.bui-pages-create [data-icon]').dataset.icon, 'square-pen');
      assert.deepEqual(f.opens, []); assert.deepEqual(f.writes, []);
    } finally {f.close();}
  }
});

test('mobile page and creation navigation close the drawer; expansion and failed opens leave it open', async () => {
  const f = fixture(undefined, true, {mobile: true}); try {
    await f.view.onOpen();
    f.click(f.row('Home').querySelector('.bui-page-disclosure')); await f.settle(); assert.equal(f.collapsed(), 0);
    f.click(f.row('Alpha.md')); await f.settle(); assert.equal(f.collapsed(), 1);
    f.click(f.doc.querySelector('.bui-pages-create'));
    const modal = f.modals[0]; modal.contentEl.querySelector('input').value = 'New';
    modal.contentEl.querySelector('form').dispatchEvent(new f.win.Event('submit', {bubbles: true, cancelable: true})); await f.settle();
    assert.equal(f.collapsed(), 2); assert.equal(f.opens.at(-1).path, 'New.md');
    f.failOpen(); f.click(f.row('Zebra.md')); await f.settle(); assert.equal(f.collapsed(), 2); assert.equal(f.notices.length, 1);
  } finally {f.close();}
});

test('desktop long-title hover starts after 300ms, slides only overflow and resets without changing text', async () => {
  const f = fixture(); try {
    await f.view.onOpen();
    let run, delay, animation, cancelled = 0, cleared = 0;
    f.win.matchMedia = query => ({matches: !query.includes('reduced-motion')});
    f.win.setTimeout = (fn, ms) => {run = fn; delay = ms; return 7;};
    f.win.clearTimeout = () => {cleared++;};
    const label = f.row('Alpha.md').querySelector('.bui-page-title'), text = label.firstElementChild;
    Object.defineProperty(label, 'clientWidth', {value: 60}); Object.defineProperty(text, 'scrollWidth', {value: 160});
    text.animate = (frames, options) => {animation = {frames, options}; return {cancel() {cancelled++;}};};
    label.dispatchEvent(new f.win.Event('pointerenter')); assert.equal(delay, 300); assert.equal(animation, undefined);
    run(); assert.equal(animation.frames[1].transform, 'translateX(-100px)'); assert.equal(label.classList.contains('is-scrolling'), true);
    assert.equal(label.textContent, 'Alpha'); assert.equal(f.row('Alpha.md').getAttribute('title'), null);
    assert.equal(f.row('Alpha.md').getAttribute('aria-label'), null, 'host aria-label tooltips must not duplicate scrolling titles');
    assert.equal(f.row('Alpha.md').getAttribute('aria-labelledby'), label.id);
    assert.equal(f.doc.getElementById(label.id).textContent, 'Alpha', 'accessible name remains the complete title');
    label.dispatchEvent(new f.win.Event('pointerleave')); assert.equal(cancelled, 1); assert.ok(cleared); assert.equal(label.classList.contains('is-scrolling'), false);
    animation = undefined; label.dispatchEvent(new f.win.Event('pointerenter')); f.view.render(); run(); assert.equal(animation, undefined);
  } finally {f.close();}
});

test('mobile, touch and reduced-motion users never start hover title motion', async () => {
  for (const mode of ['mobile', 'touch', 'reduced']) {
    const f = fixture(undefined, true, {mobile: mode === 'mobile'}); try {
      await f.view.onOpen(); let scheduled = 0;
      f.win.matchMedia = query => ({matches: query.includes('reduced-motion') ? mode === 'reduced' : true});
      f.win.setTimeout = () => {scheduled++; return 1;};
      const event = new f.win.Event('pointerenter'); Object.defineProperty(event, 'pointerType', {value: mode === 'touch' ? 'touch' : 'mouse'});
      f.row('Alpha.md').querySelector('.bui-page-title').dispatchEvent(event); assert.equal(scheduled, 0, mode);
    } finally {f.close();}
  }
});

test('pinned entries reorder by menu, keyboard and pointer while preserving hidden pins and file data', async () => {
  const f = fixture({favorites: ['Home.md', 'Hidden.md', 'Alpha.md', 'Zebra.md']}); try {
    await f.view.onOpen();
    const pins = () => [...f.doc.querySelectorAll('.bui-page-favorite')].map(el => el.dataset.id);
    const pin = id => [...f.doc.querySelectorAll('.bui-page-favorite')].find(el => el.dataset.id === id);
    assert.equal(f.doc.querySelector('.bui-pages-favorites .bui-pages-section').textContent, '置顶');
    pin('Alpha.md').dispatchEvent(new f.win.MouseEvent('contextmenu', {bubbles: true}));
    f.menus.at(-1).items.find(item => item.title === '上移').click(); await f.settle();
    assert.deepEqual(f.sidebar.settings.favorites, ['Alpha.md', 'Home.md', 'Hidden.md', 'Zebra.md']);
    f.key(pin('Zebra.md').querySelector('.bui-page-favorite-open'), 'ArrowUp', {altKey: true}); await f.settle();
    assert.deepEqual(pins(), ['Alpha.md', 'Zebra.md', 'Home']);
    const source = pin('Home').querySelector('.bui-page-favorite-open'); f.doc.elementFromPoint = () => pin('Alpha.md');
    for (const [type, y] of [['pointerdown', 20], ['pointermove', -10], ['pointerup', -10]]) {
      const event = new f.win.MouseEvent(type, {bubbles: true, cancelable: true, clientX: 30, clientY: y, button: 0});
      Object.defineProperty(event, 'pointerId', {value: 1}); Object.defineProperty(event, 'pointerType', {value: 'mouse'}); source.dispatchEvent(event);
    }
    f.click(source); await f.settle();
    assert.deepEqual(pins(), ['Home', 'Alpha.md', 'Zebra.md']); assert.ok(f.sidebar.settings.favorites.includes('Hidden.md'));
    assert.deepEqual(f.created, []); assert.deepEqual(f.opens, []); assert.deepEqual(f.sidebar.settings.order, {});
  } finally {f.close();}
});

test('reordering pages keeps project aliases, hidden ordering and pins intact', async () => {
  const f = fixture({order: {'/': ['Home.md', 'Hidden.md', 'Alpha.md', 'Zebra.md']}, favorites: ['Alpha.md']}); try {
    await f.view.onOpen(); f.key(f.row('Zebra.md'), 'ArrowUp', {altKey: true}); await f.settle();
    assert.deepEqual(f.sidebar.settings.order['/'], ['Home', 'Hidden.md', 'Zebra.md', 'Alpha.md']);
    assert.deepEqual(f.sidebar.settings.favorites, ['Alpha.md']); assert.ok(f.find('Home.md'));
  } finally {f.close();}
});

test('archive entry points are optional and call the external archive controller without changing the vault', async () => {
  const f = fixture(); try {
    let browsed = 0, archived;
    f.sidebar.archives = {directory: '/Archive', async setDirectory() {}, open(node) {archived = node.id;}, browse() {browsed++;}};
    await f.view.onOpen(); assert.equal(f.doc.querySelector('.bui-pages-archive'), null);
    f.doc.querySelector('.bui-pages-toolbar').dispatchEvent(new f.win.MouseEvent('contextmenu', {bubbles: true}));
    f.menus.at(-1).items.find(item => item.title === '外部归档…').click(); assert.equal(browsed, 1);
    f.row('Alpha.md').dispatchEvent(new f.win.MouseEvent('contextmenu', {bubbles: true}));
    f.menus.at(-1).items.find(item => item.title === '归档到外部…').click(); assert.equal(archived, 'Alpha.md');
    assert.deepEqual(f.created, []); assert.deepEqual(f.writes, []);
  } finally {f.close();}
});

test('keyboard navigation and reorder retain focus, persist complete sibling order and do not move files', async () => {
  const f = fixture(); try {
    await f.view.onOpen(); f.row('Zebra.md').focus();
    f.key(f.row('Zebra.md'), 'ArrowUp', {altKey: true}); await f.settle();
    assert.deepEqual(f.writes[0].order['/'], ['Zebra.md', 'Home', 'Alpha.md']);
    assert.equal(f.doc.activeElement.dataset.id, 'Zebra.md');
    f.key(f.row('Zebra.md'), 'ArrowUp'); assert.equal(f.doc.activeElement.dataset.id, 'Home');
    assert.deepEqual(f.created, []); assert.deepEqual(f.opens, []);
  } finally {f.close();}
});

test('save failures retain the existing order and report the error; a later save succeeds', async () => {
  const f = fixture(); try {
    await f.view.onOpen(); f.failSave(); f.key(f.row('Zebra.md'), 'ArrowUp', {altKey: true}); await f.settle();
    assert.equal(f.notices.length, 1); assert.deepEqual(f.sidebar.settings.order, {});
    f.restoreSave(); f.key(f.row('Zebra.md'), 'ArrowUp', {altKey: true}); await f.settle(); assert.equal(f.writes.length, 1);
  } finally {f.close();}
});

test('favorite actions persist, reopen the underlying page and survive serialization', async () => {
  const f = fixture(); try {
    await f.view.onOpen(); f.row('Home').dispatchEvent(new f.win.MouseEvent('contextmenu', {bubbles: true}));
    f.menus[0].items.find(item => item.title === '置顶').click(); await f.settle();
    assert.deepEqual(f.writes[0].favorites, ['Home']);
    f.click(f.doc.querySelector('.bui-page-favorite-open')); assert.equal(f.opens[0].path, 'Home.md');
    const serialized = JSON.parse(JSON.stringify(f.writes[0])), next = fixture(serialized);
    try {await next.view.onOpen(); assert.ok(next.doc.querySelector('.bui-page-favorite-open'));} finally {next.close();}
  } finally {f.close();}
});

test('pin buttons toggle pages and folder projects without navigation; pinned section precedes projects and keeps hierarchy', async () => {
  const f = fixture(); try {
    f.root.children.push(new (f.find('Home').constructor)('Finance', [new (f.find('Alpha.md').constructor)('Finance/Workbench.md')]));
    await f.view.onOpen();
    const finance = f.row('Finance');
    assert.equal(finance.querySelector('.bui-page-icon'), null, 'plain folders do not add a different title offset');
    assert.equal(f.row('Home').querySelector('.bui-page-icon'), null);
    assert.ok(finance.querySelector('.bui-page-disclosure'));
    f.click(finance.querySelector('.bui-page-pin')); await f.settle();
    f.click(f.row('Alpha.md').querySelector('.bui-page-pin')); await f.settle();
    assert.deepEqual(f.sidebar.settings.favorites, ['Finance', 'Alpha.md']); assert.deepEqual(f.opens, []);
    const pins = [...f.doc.querySelectorAll('.bui-page-favorite')];
    assert.deepEqual(pins.map(el => el.dataset.id), ['Finance', 'Alpha.md']);
    assert.ok(f.doc.querySelector('.bui-pages-favorites').compareDocumentPosition(f.doc.querySelector('.bui-pages-tree')) & f.win.Node.DOCUMENT_POSITION_FOLLOWING);
    f.click(pins[0].querySelector('.bui-page-favorite-open')); await f.settle();
    assert.ok(f.row('Finance/Workbench.md')); assert.equal(f.row('Finance/Workbench.md').getAttribute('aria-level'), '2');
    assert.deepEqual(f.opens, []);
    f.click(f.doc.querySelector('.bui-page-favorite .bui-page-pin')); await f.settle();
    assert.deepEqual(f.sidebar.settings.favorites, ['Alpha.md']); assert.ok(f.row('Finance'));
    assert.equal(f.row('Finance').querySelector('.bui-page-pin').getAttribute('aria-pressed'), 'false');
    assert.deepEqual(f.created, []);
  } finally {f.close();}
});

test('hidden pages disappear from tree, search and favorites, and return without losing preferences', async () => {
  const f = fixture({favorites: ['Home', 'Alpha.md'], hiddenPaths: ['Home', 'Home.md', 'Alpha.md'], expanded: ['Home'], futurePreference: 'keep'});
  try {
    await f.view.onOpen();
    assert.equal(f.row('Home'), undefined); assert.equal(f.row('Alpha.md'), undefined);
    assert.equal(f.doc.querySelector('.bui-page-favorite-open'), null);
    assert.equal(f.row('Home/Child.md'), undefined);
    await f.sidebar.update(state => ({...state, hiddenPaths: []}));
    assert.ok(f.row('Home/Child.md')); assert.ok(f.row('Alpha.md'));
    assert.equal(f.doc.querySelectorAll('.bui-page-favorite-open').length, 2);
    assert.deepEqual(f.sidebar.settings.favorites, ['Home', 'Alpha.md']);
    assert.equal(f.writes[0].futurePreference, 'keep');
    assert.deepEqual(f.created, []); assert.ok(f.find('Home/Child.md')); assert.ok(f.find('Alpha.md'));
  } finally {f.close();}
});

test('hidden path settings save only on the explicit button and retain edits when a save fails', async () => {
  const f = fixture({favorites: ['Home'], hiddenPaths: ['Alpha.md'], futurePreference: 'keep'});
  try {
    f.sidebar.onload(); const tab = f.settingTabs[0];
    const definition = tab.getSettingDefinitions().flatMap(group => group.items || []).find(item => item.name === '隐藏页面路径');
    assert.ok(definition); assert.match(definition.desc, /不会删除/);
    const input = f.doc.createElement('textarea'), button = f.doc.createElement('button'); let save;
    definition.render({
      addTextArea(fn) {const text = {inputEl: input, setValue(value) {input.value = value; return text;}, setPlaceholder(value) {input.placeholder = value; return text;}}; fn(text);},
      addButton(fn) {const control = {setButtonText(value) {button.textContent = value; return control;}, setDisabled(value) {button.disabled = value; return control;}, onClick(fn) {save = fn; return control;}}; fn(control);},
    });
    assert.equal(input.value, 'Alpha.md');
    input.value = ' Home/ \nAlpha.md\nHome'; assert.deepEqual(f.writes, []);
    await save(); assert.deepEqual(f.sidebar.settings.hiddenPaths, ['Home', 'Alpha.md']);
    assert.equal(input.value, 'Home\nAlpha.md'); assert.deepEqual(f.sidebar.settings.favorites, ['Home']);
    assert.equal(f.writes[0].futurePreference, 'keep');
    f.failSave(); input.value = ''; await save();
    assert.deepEqual(f.sidebar.settings.hiddenPaths, ['Home', 'Alpha.md']); assert.equal(input.value, '');
    assert.equal(input.disabled, false); assert.equal(button.disabled, false);
    f.restoreSave(); await save(); assert.deepEqual(f.sidebar.settings.hiddenPaths, []);
  } finally {f.close();}
});

test('pointer sorting rejects cross-folder targets, persists same-level order and suppresses release clicks', async () => {
  const f = fixture({expanded: ['Home']}); try {
    await f.view.onOpen();
    const pointer = (el, type, y) => {const event = new f.win.MouseEvent(type, {bubbles: true, cancelable: true, clientX: 30, clientY: y, button: 0}); Object.defineProperty(event, 'pointerId', {value: 1}); Object.defineProperty(event, 'pointerType', {value: 'mouse'}); el.dispatchEvent(event);};
    f.doc.elementFromPoint = () => f.row('Alpha.md');
    let source = f.row('Home/Child.md'); pointer(source, 'pointerdown', 20); pointer(source, 'pointermove', -10); pointer(source, 'pointerup', -10); await f.settle(); assert.deepEqual(f.writes, []);
    source = f.row('Zebra.md'); pointer(source, 'pointerdown', 20); pointer(source, 'pointermove', -10); pointer(source, 'pointerup', -10); f.click(source); await f.settle();
    assert.deepEqual(f.writes[0].order['/'], ['Zebra.md', 'Home', 'Alpha.md']); assert.deepEqual(f.created, []); assert.deepEqual(f.opens, []);
    assert.equal(f.doc.querySelector('.is-dragging'), null);
  } finally {f.close();}
});

test('pointer cancellation and a destination outside the tree leave order and files untouched', async () => {
  const f = fixture(); try {
    await f.view.onOpen();
    const source = f.row('Zebra.md');
    const pointer = (type, y) => {const event = new f.win.MouseEvent(type, {bubbles: true, cancelable: true, clientX: 30, clientY: y}); Object.defineProperty(event, 'pointerId', {value: 1}); Object.defineProperty(event, 'pointerType', {value: 'mouse'}); source.dispatchEvent(event);};
    f.doc.elementFromPoint = () => f.row('Alpha.md');
    pointer('pointerdown', 20); pointer('pointermove', -10); pointer('pointercancel', -10); pointer('pointerup', -10);
    f.doc.elementFromPoint = () => f.doc.body;
    pointer('pointerdown', 20); pointer('pointermove', -10); pointer('pointerup', -10); await f.settle();
    assert.deepEqual(f.writes, []); assert.deepEqual(f.created, []); assert.equal(f.doc.querySelector('.drop-before'), null);
  } finally {f.close();}
});

test('new child pages create a matching folder without renaming the parent, reject duplicate names and double submit', async () => {
  const f = fixture(); try {
    await f.view.onOpen();
    f.click(f.row('Alpha.md').querySelector('button[aria-label="在 Alpha 下新建页面"]'));
    const modal = f.modals[0], form = modal.contentEl.querySelector('form'), input = form.querySelector('input'); input.value = 'Child';
    const submit = () => form.dispatchEvent(new f.win.Event('submit', {bubbles: true, cancelable: true}));
    submit(); submit(); await f.settle();
    assert.deepEqual(f.created, [{folder: 'Alpha'}, {file: 'Alpha/Child.md', content: ''}]); assert.ok(f.find('Alpha.md'));
    assert.equal(f.opens[0].path, 'Alpha/Child.md'); assert.ok(f.row('Alpha/Child.md'));
    f.click(f.row('Alpha').querySelector('button[aria-label="在 Alpha 下新建页面"]'));
    const other = f.modals[1]; other.contentEl.querySelector('input').value = 'Child';
    other.contentEl.querySelector('form').dispatchEvent(new f.win.Event('submit', {bubbles: true, cancelable: true})); await f.settle();
    assert.match(other.contentEl.querySelector('[role="alert"]').textContent, /已存在/); assert.equal(f.created.length, 2);
  } finally {f.close();}
});

test('closing removes the view and ignores later renders; a disabled controller refuses queued writes', async () => {
  const f = fixture(); try {
    await f.view.onOpen(); await f.view.onClose(); assert.equal(f.sidebar.views.size, 0);
    f.view.render(); assert.equal(f.view.contentEl.children.length, 0);
    f.sidebar.onunload(); assert.equal(await f.sidebar.update(state => ({...state, favorites: ['Home']})), false); assert.deepEqual(f.writes, []);
  } finally {f.close();}
});


test('Nebula Focus registers sidebar settings; controls persist through the shared store and keep the tree preferences', async () => {
  const f = fixture({favorites: ['Home'], order: {'/': ['Home', 'Zebra.md']}});
  try {
    f.sidebar.onload(); assert.equal(f.settingTabs.length, 1);
    const tab = f.settingTabs[0];
    let visible = false;
    f.sidebar.ribbon = {available: true, listItems: () => [{id: 'graph', label: '查看关系图谱', visible}], isVisible: () => visible,
      async setVisible(id, value) {assert.equal(id, 'graph'); visible = value; return true;}};
    assert.ok(tab.getSettingDefinitions().find(group => group.heading === '左侧工具按钮').items.some(item => item.control?.key === 'ribbon:graph'));
    assert.equal(tab.getControlValue('ribbon:graph'), false); await tab.setControlValue('ribbon:graph', true);
    assert.equal(tab.getControlValue('ribbon:graph'), true);
    f.sidebar.ribbon.available = false;
    assert.equal(tab.getSettingDefinitions().some(group => group.heading === '左侧工具按钮'), false);
    assert.equal(tab.getControlValue('openOnStartup'), false);
    await Promise.all([tab.setControlValue('openOnStartup', true), tab.setControlValue('showAttachments', true), tab.setControlValue('sort', 'name')]);
    assert.equal(tab.getControlValue('openOnStartup'), true);
    assert.equal(tab.getControlValue('showAttachments'), true);
    assert.equal(tab.getControlValue('sort'), 'name');
    assert.deepEqual(f.sidebar.settings.favorites, ['Home']);
    assert.deepEqual(f.sidebar.settings.order, {'/': ['Home', 'Zebra.md']});
    const count = f.writes.length;
    await tab.setControlValue('sort', 'invalid'); await tab.setControlValue('favorites', []);
    assert.equal(f.writes.length, count);
    f.failSave(); await tab.setControlValue('showAttachments', false);
    assert.equal(tab.getControlValue('showAttachments'), true);
  } finally {f.close();}
});

test('automatic opening waits for layout, is opt-in and cannot resurrect an unloaded plugin', async () => {
  for (const [enabled, stopped, expected] of [[false, false, 0], [true, false, 1], [true, true, 0]]) {
    const f = fixture({openOnStartup: enabled});
    try {
      let opened = 0; f.sidebar.open = async () => {opened++;};
      f.sidebar.onload(); assert.equal(opened, 0);
      if (stopped) f.sidebar.onunload();
      f.layoutReady.forEach(fn => fn()); assert.equal(opened, 0); await new Promise(resolve => f.win.setTimeout(resolve, 5));
      assert.equal(opened, expected);
    } finally {f.close();}
  }
});

test('appearance switching replaces the same real sidebar leaf and restores search, scroll and page settings', async () => {
  const f = fixture({expanded: ['Home'], favorites: ['Home'], order: {'/': ['Home', 'Alpha.md', 'Zebra.md']}});
  try {
    f.sidebar.onload(); assert.equal(f.ribbonIcon.hidden, false);
    const leaf = f.addLeaf('nebula-pages', f.view); await f.view.onOpen();
    f.click(f.doc.querySelector('.bui-pages-search-button'));
    const input = f.modals.at(-1).contentEl.querySelector('input'); input.value = 'Alpha'; input.dispatchEvent(new f.win.Event('input'));
    f.modals.at(-1).close();
    f.doc.querySelector('.bui-pages-scroll').scrollTop = 27;
    const navigation = f.view.captureNavigation(), settings = JSON.stringify(f.sidebar.settings);
    await f.sidebar.setEnabled(false);
    assert.equal(f.sidebar.isEnabled, false); assert.equal(f.ribbonIcon.hidden, true); assert.equal(leaf.view.getViewType(), 'file-explorer');
    assert.equal(f.leaves.length, 1); assert.equal(f.doc.querySelectorAll('.bui-page-row').length, 0);
    await f.sidebar.setEnabled(true);
    assert.equal(f.ribbonIcon.hidden, false); assert.equal(leaf.view.getViewType(), 'nebula-pages'); assert.equal(f.leaves.length, 1);
    assert.deepEqual(leaf.view.captureNavigation(), navigation); assert.equal(JSON.stringify(f.sidebar.settings), settings);
    assert.deepEqual(f.writes, []); assert.deepEqual(f.created, []); assert.equal(f.revealed.at(-1), leaf);
    leaf.view.restoreNavigation({...navigation, query: 'Zebra', mobileQuery: undefined});
    assert.ok(f.row('Alpha.md')); assert.ok(f.row('Home'), 'legacy inline query must not invisibly filter the restored tree');
    f.click(f.doc.querySelector('.bui-pages-search-button'));
    assert.equal(f.modals.at(-1).contentEl.querySelector('input').value, 'Zebra', 'legacy query migrates into the finder');
  } finally {f.close();}
});

test('all existing page tabs become real file explorers, while existing native tabs remain and no tabs are added', async () => {
  const f = fixture(); try {
    const one = f.addLeaf('nebula-pages'), two = f.addLeaf('nebula-pages'), native = f.addLeaf('file-explorer');
    for (let pass = 0; pass < 2; pass++) {
      await f.sidebar.setEnabled(false); assert.equal(f.leaves.length, 3);
      assert.ok(f.leaves.every(leaf => leaf.view.getViewType() === 'file-explorer'));
      await f.sidebar.open(); assert.ok(f.leaves.every(leaf => leaf.view.getViewType() === 'file-explorer'));
      await f.sidebar.setEnabled(true); assert.equal(f.leaves.length, 3);
      assert.equal(one.view.getViewType(), 'nebula-pages'); assert.equal(two.view.getViewType(), 'nebula-pages');
      assert.equal(native.view.getViewType(), 'file-explorer');
    }
    assert.deepEqual(f.created, []); assert.deepEqual(f.writes, []);
  } finally {f.close();}
});

test('persisted native mode defeats startup and page commands, and re-enabling reuses the existing native position', async () => {
  const f = fixture({openOnStartup: true}, false); try {
    const nativeState = {type: 'file-explorer', state: {collapsed: ['Work']}};
    const native = f.addLeaf('file-explorer', undefined, nativeState);
    f.sidebar.onload(); for (const ready of f.layoutReady) ready(); await new Promise(resolve => f.win.setTimeout(resolve, 5));
    await f.sidebar.open(); assert.equal(native.view.getViewType(), 'file-explorer');
    assert.equal(f.viewStates.some(item => item.state.type === 'nebula-pages'), false);
    await f.sidebar.setEnabled(true); assert.equal(native.view.getViewType(), 'nebula-pages'); assert.equal(f.leaves.length, 1);
    await f.sidebar.setEnabled(false); assert.deepEqual(native.getViewState().state, nativeState.state); assert.equal(f.leaves.length, 1);
  } finally {f.close();}
  const ghost = fixture({openOnStartup: true}, false); try {
    const leaf = ghost.addLeaf('nebula-pages'); ghost.sidebar.onload();
    ghost.layoutReady.forEach(ready => ready()); await new Promise(resolve => ghost.win.setTimeout(resolve, 5));
    assert.equal(leaf.view.getViewType(), 'file-explorer'); assert.equal(ghost.leaves.length, 1);
  } finally {ghost.close();}
});

test('rapid mode requests serialize in place, honor the latest mode and never revive views after unload', async () => {
  const f = fixture(); let release; try {
    const leaf = f.addLeaf('nebula-pages', f.view); await f.view.onOpen();
    const paused = new Promise(resolve => {release = resolve;});
    let first = true; f.setSwitchHook(async (_leaf, state) => {if (first && state.type === 'file-explorer') {first = false; await paused;}});
    const off = f.sidebar.setEnabled(false); await f.settle();
    const on = f.sidebar.setEnabled(true), again = f.sidebar.setEnabled(false), command = f.sidebar.open();
    release(); await Promise.all([off, on, again, command]);
    assert.equal(leaf.view.getViewType(), 'file-explorer'); assert.equal(f.leaves.length, 1);
    assert.equal(f.viewStates.some(item => item.state.type === 'nebula-pages'), false);
    const count = f.viewStates.length; f.sidebar.onunload(); await f.sidebar.setEnabled(true); await f.sidebar.open();
    assert.equal(f.viewStates.length, count);
  } finally {release?.(); f.close();}
});

test('page, pin and keyboard navigation use the main group; explicit main-tab and right-tab actions remain separate', async () => {
  const f = fixture({favorites: ['Alpha.md']}); const calls = [];
  try {
    f.sidebar.rightWorkspace = {async openFileInMain(file, anchor, newTab) {calls.push({path: file.path, anchor, newTab}); return {};},
      async openFile(file) {calls.push({path: file.path, explicit: true});}};
    f.view.leaf = {getContainer: () => ({})};
    await f.view.onOpen();
    f.click(f.row('Alpha.md')); await f.settle();
    f.click(f.doc.querySelector('.bui-page-favorite-open'), {metaKey: true}); await f.settle();
    f.key(f.row('Zebra.md'), 'Enter', {ctrlKey: true}); await f.settle();
    assert.deepEqual(calls.map(({anchor, ...call}) => call), [{path: 'Alpha.md', newTab: false}, {path: 'Alpha.md', newTab: false}, {path: 'Zebra.md', newTab: false}]);
    assert.ok(calls.every(call => call.anchor.view.getViewType() === 'markdown')); assert.deepEqual(f.opens, []);
    f.row('Alpha.md').dispatchEvent(new f.win.MouseEvent('contextmenu', {bubbles: true}));
    await f.menus.at(-1).items.find(item => item.title === '在新标签页打开').click();
    assert.equal(calls.at(-1).newTab, true);
    await f.menus.at(-1).items.find(item => item.title === '在右侧新标签页打开').click();
    assert.deepEqual(calls.at(-1), {path: 'Alpha.md', explicit: true});
    assert.deepEqual(f.created, []); assert.deepEqual(f.writes, []);
  } finally {f.close();}
});

test('the optional reminders entry opens the new controller and closes only a mobile drawer', async () => {
  const f = fixture(undefined, true, {mobile: true}); let opened = 0;
  try {
    f.sidebar.openReminders = async () => {opened++;}; await f.view.onOpen();
    f.click(f.doc.querySelector('.bui-pages-reminders')); await f.settle();
    assert.equal(opened, 1); assert.equal(f.collapsed(), 1); assert.equal(f.doc.querySelector('.bui-pages-home'), null);
    assert.deepEqual(f.created, []); assert.deepEqual(f.writes, []);
  } finally {f.close();}
});

test('mobile search finds collapsed page titles without changing the tree, preserves its query and cancels without navigation', async () => {
  const f = fixture(undefined, true, {mobile: true}); try {
    await f.view.onOpen(); f.click(f.doc.querySelector('.bui-pages-search-button'));
    const modal = f.modals.at(-1), input = modal.contentEl.querySelector('input');
    assert.ok(modal.modalEl.classList.contains('bui-sidebar-search-modal'));
    assert.deepEqual([...modal.contentEl.querySelectorAll('.bui-sidebar-search-modes button')].map(button => button.textContent), ['直接搜索', '标签', '书签', '文件列表']);
    input.value = 'child'; input.dispatchEvent(new f.win.Event('input'));
    assert.deepEqual([...modal.contentEl.querySelectorAll('.bui-sidebar-search-title')].map(el => el.textContent), ['Child']);
    assert.equal(f.row('Home/Child.md'), undefined); assert.ok(f.row('Alpha.md'));
    f.key(input, 'Escape'); assert.equal(modal.closed, true); assert.deepEqual(f.opens, []); assert.equal(f.collapsed(), 0);
    f.click(f.doc.querySelector('.bui-pages-search-button')); const reopened = f.modals.at(-1);
    assert.equal(reopened.contentEl.querySelector('input').value, 'child');
    f.click(reopened.contentEl.querySelector('.bui-sidebar-search-cancel')); assert.equal(reopened.closed, true);
    assert.deepEqual(f.writes, []); assert.deepEqual(f.created, []);
  } finally {f.close();}
});

test('mobile search respects IME composition and opens its chosen result in the existing main tab', async () => {
  const f = fixture(undefined, true, {mobile: true}); try {
    await f.view.onOpen(); f.click(f.doc.querySelector('.bui-pages-search-button'));
    const modal = f.modals.at(-1), input = modal.contentEl.querySelector('input');
    input.dispatchEvent(new f.win.CompositionEvent('compositionstart')); input.value = 'child'; input.dispatchEvent(new f.win.Event('input'));
    f.key(input, 'Enter', {isComposing: true}); f.key(input, 'Escape', {isComposing: true});
    assert.equal(modal.closed, false); assert.deepEqual(f.opens, []);
    input.dispatchEvent(new f.win.CompositionEvent('compositionend')); f.key(input, 'Enter'); await f.settle();
    assert.deepEqual(f.opens, [{path: 'Home/Child.md', mode: false}]); assert.equal(modal.closed, true); assert.equal(f.collapsed(), 1);
  } finally {f.close();}
});

test('missing mobile compositionend cannot block explicit search actions or discard a result tap during blur', async () => {
  const f = fixture(undefined, true, {mobile: true}); try {
    await f.view.onOpen(); f.click(f.doc.querySelector('.bui-pages-search-button'));
    let modal = f.modals.at(-1), input = modal.contentEl.querySelector('input');
    input.dispatchEvent(new f.win.CompositionEvent('compositionstart')); input.value = 'child';
    input.dispatchEvent(new f.win.Event('input')); input.dispatchEvent(new f.win.FocusEvent('blur'));
    assert.equal(modal.contentEl.querySelector('.bui-sidebar-search-title').textContent, 'Child');
    input.dispatchEvent(new f.win.CompositionEvent('compositionstart')); input.value = '';
    const result = modal.contentEl.querySelector('.bui-sidebar-search-result');
    result.dispatchEvent(new f.win.MouseEvent('pointerdown', {bubbles: true}));
    input.dispatchEvent(new f.win.FocusEvent('blur', {relatedTarget: result}));
    assert.equal(result.isConnected, true, 'blur must not replace the result before its click');
    f.click(result); await f.settle(); assert.equal(f.opens.at(-1).path, 'Home/Child.md');
    f.click(f.doc.querySelector('.bui-pages-search-button')); modal = f.modals.at(-1); input = modal.contentEl.querySelector('input');
    input.dispatchEvent(new f.win.CompositionEvent('compositionstart')); input.value = 'draft';
    f.click([...modal.contentEl.querySelectorAll('.bui-sidebar-search-modes button')].find(button => button.textContent === '文件列表'));
    await f.settle(); assert.equal(input.getAttribute('aria-label'), '搜索文件'); assert.equal(modal.closed, false);
    assert.deepEqual(f.viewStates, []); assert.equal(input.value, 'draft');
    assert.deepEqual(f.writes, []); assert.deepEqual(f.created, []);
  } finally {f.close();}
});

test('committing IME input during a result tap preserves the pressed result, focus and committed query', async () => {
  const f = fixture(undefined, true, {mobile: true}); try {
    await f.view.onOpen(); f.click(f.doc.querySelector('.bui-pages-search-button'));
    const modal = f.modals.at(-1), input = modal.contentEl.querySelector('input');
    const result = [...modal.contentEl.querySelectorAll('.bui-sidebar-search-result')].find(button =>
      button.querySelector('.bui-sidebar-search-title')?.textContent === 'Alpha');
    input.dispatchEvent(new f.win.CompositionEvent('compositionstart')); input.value = 'alpha';
    result.dispatchEvent(new f.win.MouseEvent('pointerdown', {bubbles: true}));
    input.dispatchEvent(new f.win.CompositionEvent('compositionend'));
    assert.equal(result.isConnected, true, 'compositionend must retain the pressed result until click');
    input.dispatchEvent(new f.win.Event('input'));
    assert.equal(result.isConnected, true, 'the final input event must also retain the pressed result');
    assert.equal(f.view.captureNavigation().mobileQuery, 'alpha');
    result.focus();
    assert.equal(result.isConnected, true, 'blur must retain the same result');
    assert.equal(f.doc.activeElement, result);
    f.click(result); await f.settle();
    assert.deepEqual(f.opens, [{path: 'Alpha.md', mode: false}]);
    assert.equal(modal.closed, true); assert.equal(f.collapsed(), 1);
    assert.equal(f.view.captureNavigation().mobileQuery, 'alpha');
    assert.deepEqual(f.viewStates, []); assert.deepEqual(f.writes, []); assert.deepEqual(f.created, []);
  } finally {f.close();}
});

test('all search modes remain in one modal; metadata tags and nested files open without replacing the sidebar', async () => {
  const f = fixture(undefined, true, {mobile: true}); try {
    f.addLeaf('nebula-pages', f.view); await f.view.onOpen(); f.click(f.doc.querySelector('.bui-pages-search-button'));
    const modal = f.modals.at(-1), input = modal.contentEl.querySelector('input');
    const mode = label => f.click([...modal.contentEl.querySelectorAll('.bui-sidebar-search-modes button')].find(button => button.textContent === label));
    const result = label => [...modal.contentEl.querySelectorAll('.bui-sidebar-search-result')].find(button => button.querySelector('.bui-sidebar-search-title')?.textContent === label);
    f.metadata.set('Alpha.md', {frontmatter: {tags: ['工作']}, tags: [{tag: '#工作'}]});
    f.metadata.set('Home/Child.md', {tags: [{tag: '#工作/项目'}]});
    mode('标签'); assert.equal(input.placeholder, '搜索标签…');
    assert.equal(result('#工作').querySelector('.bui-sidebar-search-path').textContent, '1 个页面', 'a note is counted once even with frontmatter and inline tags');
    f.click(result('#工作'));
    assert.deepEqual([...modal.contentEl.querySelectorAll('.bui-sidebar-search-title')].map(el => el.textContent).sort(), ['Alpha', 'Child']);
    mode('书签'); await f.settle(); assert.match(modal.contentEl.textContent, /还没有保存的书签/);
    mode('直接搜索'); assert.equal(input.placeholder, '搜索页面或正文…');
    mode('文件列表'); f.click(result('Home'));
    assert.equal(modal.contentEl.querySelector('.bui-sidebar-search-location').textContent, 'Home');
    assert.ok(result('Child')); assert.equal(f.leaves[0].getViewState().type, 'nebula-pages');
    assert.ok(f.doc.querySelector('.bui-pages-search-button')); assert.equal(modal.closed, false);
    assert.deepEqual(f.viewStates, []); assert.deepEqual(f.opens, []);
    f.click(result('Child')); await f.settle(); assert.equal(modal.closed, true);
    assert.deepEqual(f.opens, [{path: 'Home/Child.md', mode: false}]); assert.equal(f.collapsed(), 1);
    assert.deepEqual(f.created, []); assert.deepEqual(f.writes, []);
  } finally {f.close();}
});

test('direct search finds Markdown body text and discards asynchronous matches after changing modes or closing', async () => {
  const f = fixture(undefined, true, {mobile: true}); try {
    f.contents.set('Home/Child.md', '这篇笔记的正文记录了一次预算讨论。');
    await f.view.onOpen(); f.click(f.doc.querySelector('.bui-pages-search-button'));
    const modal = f.modals.at(-1), input = modal.contentEl.querySelector('input');
    input.value = '预算'; input.dispatchEvent(new f.win.Event('input'));
    await new Promise(resolve => setTimeout(resolve, 170)); await f.settle();
    assert.deepEqual([...modal.contentEl.querySelectorAll('.bui-sidebar-search-title')].map(el => el.textContent), ['Child']);
    assert.match(modal.contentEl.textContent, /正文 · 1/); assert.match(modal.contentEl.textContent, /一次预算讨论/);
    const releases = []; f.setReadBody(() => new Promise(resolve => releases.push(resolve)));
    input.value = '迟到结果'; input.dispatchEvent(new f.win.Event('input'));
    await new Promise(resolve => setTimeout(resolve, 170)); assert.ok(releases.length);
    f.click([...modal.contentEl.querySelectorAll('.bui-sidebar-search-modes button')].find(button => button.textContent === '文件列表'));
    for (const release of releases) release('迟到结果'); await f.settle();
    assert.doesNotMatch(modal.contentEl.textContent, /正文 ·|迟到结果/);
    modal.close(); await f.settle(); assert.equal(modal.contentEl.childElementCount, 0);
    assert.deepEqual(f.viewStates, []); assert.deepEqual(f.opens, []); assert.deepEqual(f.created, []); assert.deepEqual(f.writes, []);
  } finally {f.close();}
});

test('bookmarks read configured storage, retain groups and subpaths, and explain unsupported saved queries', async () => {
  const f = fixture(undefined, true, {mobile: true}); try {
    f.disk.set('.obsidian/bookmarks.json', JSON.stringify({items: [{type: 'group', title: '我的资料', items: [
      {type: 'file', path: 'Alpha.md', subpath: '#简介', title: '特别书签'},
      {type: 'folder', path: 'Home', title: '项目文件'},
      {type: 'search', query: '"预算讨论"', title: '保存的文本搜索'},
      {type: 'search', query: 'tag:#工作 OR path:Home', title: '复杂查询'},
      {type: 'file', path: 'Deleted.md', title: '已删除'}, {type: 'graph', title: '关系图'},
    ]}]}));
    await f.view.onOpen(); f.click(f.doc.querySelector('.bui-pages-search-button'));
    let modal = f.modals.at(-1);
    const showBookmarks = async () => {f.click([...modal.contentEl.querySelectorAll('.bui-sidebar-search-modes button')].find(button => button.textContent === '书签')); await f.settle();};
    const result = label => [...modal.contentEl.querySelectorAll('.bui-sidebar-search-result')].find(button => button.querySelector('.bui-sidebar-search-title')?.textContent === label);
    await showBookmarks(); assert.match(modal.contentEl.textContent, /我的资料/);
    assert.match(modal.contentEl.textContent, /复杂查询 — 暂不支持此保存搜索的高级表达式/);
    assert.match(modal.contentEl.textContent, /已删除 — 来源已不存在或不可用/);
    assert.match(modal.contentEl.textContent, /关系图 — 暂不支持此书签类型/);
    f.click(result('项目文件')); assert.equal(modal.contentEl.querySelector('.bui-sidebar-search-location').textContent, 'Home');
    assert.ok(result('Child')); await showBookmarks();
    f.click(result('保存的文本搜索')); assert.equal(modal.contentEl.querySelector('input').value, '预算讨论');
    assert.equal(modal.contentEl.querySelector('[aria-pressed="true"]').textContent, '直接搜索');
    modal.contentEl.querySelector('input').value = ''; await showBookmarks();
    f.click(result('特别书签')); await f.settle();
    assert.deepEqual(f.opens, [{path: 'Alpha.md', mode: false, state: {eState: {subpath: '#简介'}}}]);
    assert.equal(modal.closed, true); assert.deepEqual(f.viewStates, []);
    assert.deepEqual(f.created, []); assert.deepEqual(f.writes, []);
  } finally {f.close();}
});

test('bookmark errors and disabled core plugin stay readable without changing the stored configuration', async () => {
  const f = fixture(undefined, true, {mobile: true}); try {
    await f.view.onOpen(); f.click(f.doc.querySelector('.bui-pages-search-button'));
    const modal = f.modals.at(-1), bookmark = [...modal.contentEl.querySelectorAll('.bui-sidebar-search-modes button')].find(button => button.textContent === '书签');
    f.disk.set('.obsidian/core-plugins.json', '[]'); f.click(bookmark); await f.settle(); assert.match(modal.contentEl.textContent, /尚未启用/);
    f.disk.set('.obsidian/core-plugins.json', '["bookmarks"]'); f.disk.set('.obsidian/bookmarks.json', '{broken');
    f.click(bookmark); await f.settle(); assert.match(modal.contentEl.textContent, /书签暂时无法读取/);
    f.disk.set('.obsidian/bookmarks.json', '{"unexpected":true}'); f.click(bookmark); await f.settle(); assert.match(modal.contentEl.textContent, /此书签格式暂不支持/);
    assert.equal(f.disk.get('.obsidian/bookmarks.json'), '{"unexpected":true}'); assert.equal(modal.closed, false);
    assert.deepEqual(f.viewStates, []); assert.deepEqual(f.created, []); assert.deepEqual(f.writes, []);
  } finally {f.close();}
});

test('independent search includes sidebar-hidden notes but excludes system/trash/generated files and leaves the sidebar hidden', async () => {
  const hiddenPaths = ['Home.md', 'Home', 'Alpha.md', 'Zebra.md', 'CustomSettings'];
  const f = fixture({hiddenPaths}, true, {mobile: true}); try {
    const Folder = f.root.constructor, File = f.find('Alpha.md').constructor;
    f.app.vault.configDir = 'CustomSettings';
    for (const path of ['.obsidian', '.trash', 'Nebula Views', 'CustomSettings'])
      f.root.children.push(new Folder(path, [new File(`${path}/Private.md`)]));
    f.root.children.push(new File('Database.base'));
    await f.view.onOpen(); assert.equal(f.doc.querySelectorAll('.bui-page-row').length, 0);
    f.click(f.doc.querySelector('.bui-pages-search-button')); const modal = f.modals.at(-1);
    const paths = [...modal.contentEl.querySelectorAll('.bui-sidebar-search-path')].map(el => el.textContent);
    assert.deepEqual(paths.sort(), ['Alpha.md', 'Home.md', 'Home/Child.md', 'Zebra.md']);
    const alpha = [...modal.contentEl.querySelectorAll('.bui-sidebar-search-result')].find(el => el.querySelector('.bui-sidebar-search-title').textContent === 'Alpha');
    f.click(alpha); await f.settle(); assert.deepEqual(f.opens, [{path: 'Alpha.md', mode: false}]);
    assert.equal(f.doc.querySelectorAll('.bui-page-row').length, 0); assert.deepEqual(f.sidebar.settings.hiddenPaths, hiddenPaths);
    assert.deepEqual(f.writes, []); assert.deepEqual(f.created, []);
  } finally {f.close();}
});

test('search stays open on navigation failure and stale results cannot navigate after closure', async () => {
  const f = fixture({hiddenPaths: ['Alpha.md']}, true, {mobile: true}); try {
    await f.view.onOpen(); f.click(f.doc.querySelector('.bui-pages-search-button'));
    const modal = f.modals.at(-1), input = modal.contentEl.querySelector('input');
    input.value = 'Zebra'; input.dispatchEvent(new f.win.Event('input')); const result = modal.contentEl.querySelector('.bui-sidebar-search-result');
    f.failOpen(); f.click(result); await f.settle(); assert.equal(modal.closed, false); assert.equal(f.notices.length, 1); assert.equal(f.collapsed(), 0);
    await f.view.onClose(); assert.equal(modal.closed, true); f.click(result); await f.settle();
    assert.equal(f.notices.length, 1); assert.deepEqual(f.opens, []);
  } finally {f.close();}
});

test('new sidebar pages route to the main group instead of whichever native tab is active', async () => {
  const f = fixture(); const routes = [];
  try {
    f.sidebar.rightWorkspace = {async openFileInMain(file) {routes.push(file.path); return {};}};
    await f.view.onOpen(); f.click(f.doc.querySelector('.bui-pages-create'));
    const modal = f.modals.at(-1); modal.contentEl.querySelector('input').value = 'New main page';
    modal.contentEl.querySelector('form').dispatchEvent(new f.win.Event('submit', {bubbles: true, cancelable: true})); await f.settle();
    assert.deepEqual(routes, ['New main page.md']); assert.deepEqual(f.opens, []);
    assert.deepEqual(f.created, [{file: 'New main page.md', content: ''}]); assert.equal(modal.closed, true);
  } finally {f.close();}
});
