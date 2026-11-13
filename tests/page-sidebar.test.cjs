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
  let active = 'Home.md', failSave = false, activeType = 'markdown', collapsed = 0, failOpen = false, sidebarFocused = false;
  const platform = {isMobileApp: !!options.mobile, isPhone: !!options.mobile};
  const writes = [], opens = [], notices = [], menus = [], commands = [], created = [], modals = [], settingTabs = [], layoutReady = [];
  const contents = new Map(), metadata = new Map(), disk = new Map([['.obsidian/core-plugins.json', JSON.stringify({bookmarks: true})]]), reads = [];
  const events = () => {
    const listeners = new Set();
    return {on(name, callback) {const ref = {name, callback}; listeners.add(ref); return ref;},
      offref(ref) {listeners.delete(ref);},
      trigger(name, ...args) {for (const ref of [...listeners]) if (ref.name === name) ref.callback(...args);},
      count: () => listeners.size};
  };
  const vaultEvents = events(), metadataEvents = events(), workspaceEvents = events();
  let readBody = file => contents.get(file.path) ?? '';
  const leaves = [], revealed = [], viewStates = []; let switchHook;
  const addLeaf = (type, currentView, state = {type, state: {}}) => {
    const leaf = {view: currentView ?? {getViewType: () => type}, state,
      getViewState() {return this.state;}, getContainer: () => app.workspace.rootSplit, getRoot: () => app.workspace.leftSplit,
      async setViewState(next) {
        viewStates.push({leaf: this, state: next}); await switchHook?.(this, next);
        await this.view.onClose?.(); this.state = next;
        this.view = next.type === 'nebula-pages' ? new module.exports.PageSidebarView(this, sidebar) : {getViewType: () => next.type};
        await this.view.onOpen?.();
      }};
    if (currentView) currentView.leaf = leaf; leaves.push(leaf); return leaf;
  };
  const find = (path, node = root) => node.path === path ? node : node.children?.map(child => find(path, child)).find(Boolean);
  class View extends Component {constructor(leaf, type) {super(); this.leaf = leaf; this.type = type;} getViewType() {return this.type;}}
  class FileView extends View {constructor(file, leaf) {super(leaf, 'markdown'); this.file = file;}}
  const contentLeaf = {getContainer: () => app.workspace.rootSplit, getRoot: () => app.workspace.rootSplit,
    get view() {return activeType === 'markdown' ? new FileView(find(active), this) : new View(this, activeType);}};
  const app = {metadataCache: {...metadataEvents, getFileCache: file => metadata.get(file.path) ?? {}},
    vault: {...vaultEvents, configDir: '.obsidian', getRoot: () => root, getName: () => '测试库', getAbstractFileByPath: path => find(path),
    async cachedRead(file) {reads.push(file.path); return readBody(file);},
    adapter: {async exists(path) {return disk.has(path);}, async read(path) {reads.push(path); if (!disk.has(path)) throw new Error('ENOENT'); return disk.get(path);}},
    async createFolder(path) {created.push({folder: path}); const parent = find(path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '/'); parent.children.push(new TFolder(path, []));},
    async create(path, content) {created.push({file: path, content}); const file = new TFile(path); const parent = find(path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '/'); parent.children.push(file); return file;}},
    workspace: {...workspaceEvents, rootSplit: {}, onLayoutReady(fn) {layoutReady.push(fn);}, getActiveFile: () => find(active),
      getActiveViewOfType(Type) {const current = sidebarFocused ? view : contentLeaf.view; return current instanceof Type ? current : null;},
      getMostRecentLeaf: () => contentLeaf, leftSplit: {collapse() {collapsed++;}},
      getLeavesOfType: type => leaves.filter(leaf => leaf.view.getViewType() === type),
      iterateAllLeaves: callback => leaves.forEach(callback), getLeftLeaf: split => split ? addLeaf('empty') : leaves[0] ?? addLeaf('empty'),
      revealLeaf: async leaf => {revealed.push(leaf);},
      getLeaf: mode => ({async openFile(file, state) {if (failOpen) throw new Error('cannot open'); opens.push({path: file.path, mode, ...(state ? {state} : {})}); active = file.path; activeType = 'markdown'; sidebarFocused = false;}})}};
  class ItemView extends View {constructor(leaf) {super(leaf); this.app = app; this.contentEl = doc.createElement('div'); doc.body.append(this.contentEl);}}
  class Modal {
    constructor() {
      this.app = app; this.containerEl = doc.createElement('div'); this.containerEl.className = 'modal-container';
      this.containerEl.createDiv({cls: 'modal-bg'}); this.modalEl = this.containerEl.createDiv({cls: 'modal'});
      this.contentEl = this.modalEl.createDiv({cls: 'modal-content'}); doc.body.append(this.containerEl); modals.push(this);
    }
    setTitle(title) {this.title = title;}
    open() {this.closed = false; this.onOpen();}
    close() {if (this.closed) return; this.closed = true; this.onClose(); this.containerEl.remove();}
  }
  class Menu {constructor() {menus.push(this); this.items = [];} setUseNativeMenu() {return this;} addItem(fn) {const item = {setTitle(title) {this.title = title; return this;}, setIcon() {return this;}, setChecked() {return this;}, setDisabled(disabled) {this.disabled = disabled; return this;}, onClick(fn) {this.click = fn; return this;}}; fn(item); this.items.push(item); return this;} addSeparator() {} showAtPosition() {}}
  const obsidian = {PluginSettingTab: class {constructor(app) {this.app = app;} update() {}}, Platform: platform, Component, View, ItemView, FileView, MarkdownView: FileView, TFile, TFolder, Modal, Menu, Notice: class {constructor(value) {notices.push(value);}}, setIcon: (el, icon) => {el.dataset.icon = icon;},
    normalizePath: path => path.replace(/\\/g, '/').replace(/\/+$/, ''),
    getAllTags: cache => [...(cache.tags ?? []).map(item => item.tag), ...(cache.frontmatter?.tags ?? []).map(tag => '#' + tag.replace(/^#/, ''))]};
  const module = {exports: {}};
  new Function('module', 'exports', 'require', 'window', 'console', code)(module, module.exports, name => {assert.equal(name, 'obsidian'); return obsidian;}, win, {error() {}});
  const ribbonIcon = doc.createElement('div');
  const plugin = {app, registerView() {}, addCommand(command) {commands.push(command);}, addRibbonIcon() {return ribbonIcon;}, addSettingTab(tab) {settingTabs.push(tab);}};
  const sidebar = new module.exports.PageSidebar(plugin, initial, async value => {if (failSave) throw new Error('disk full'); writes.push(JSON.parse(JSON.stringify(value)));}, initialEnabled);
  const view = new module.exports.PageSidebarView({getContainer: () => app.workspace.rootSplit, getRoot: () => app.workspace.leftSplit}, sidebar);
  const click = (el, options = {}) => el.dispatchEvent(new win.MouseEvent('click', {bubbles: true, cancelable: true, ...options}));
  const key = (el, name, options = {}) => el.dispatchEvent(new win.KeyboardEvent('keydown', {key: name, bubbles: true, cancelable: true, ...options}));
  const settle = () => new Promise(resolve => setImmediate(resolve));
  return {dom, doc, win, root, sidebar, view, writes, opens, notices, menus, commands, created, modals, settingTabs, layoutReady, ribbonIcon, find, click, key, settle,
    leaves, revealed, viewStates, addLeaf, app, contents, metadata, disk, reads, setReadBody: reader => {readBody = reader;}, setSwitchHook: hook => {switchHook = hook;},
    collapsed: () => collapsed, platform, setActive: path => {active = path; activeType = 'markdown'; sidebarFocused = false;}, setActiveType: type => {activeType = type; sidebarFocused = false;}, focusSidebar: () => {sidebarFocused = true;}, failOpen: () => {failOpen = true;},
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
    assert.deepEqual(groups.map(el => f.doc.getElementById(el.getAttribute('aria-labelledby')).textContent), ['项目', '页面']);
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
      assert.equal(modal.title, '搜索'); assert.equal(modal.modalEl.getAttribute('aria-label'), '搜索');
      assert.equal(modal.contentEl.querySelector('.bui-sidebar-search-cancel'), null);
      assert.deepEqual([...modal.contentEl.children].map(el => el.className), mobile
        ? ['bui-sidebar-search-modes', 'bui-sidebar-search-results', 'bui-sidebar-search-header']
        : ['bui-sidebar-search-header', 'bui-sidebar-search-results', 'bui-sidebar-search-modes']);
      const input = modal.contentEl.querySelector('input'); input.value = 'child'; input.dispatchEvent(new f.win.Event('input'));
      assert.equal(modal.contentEl.querySelector('.bui-sidebar-search-title').textContent, 'Child');
      assert.equal(f.row('Home/Child.md'), undefined, 'finder does not expand or filter the underlying tree');
      f.key(input, 'Escape'); assert.equal(modal.closed, true);
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
    f.click(f.doc.querySelector('.bui-pages-create')); await f.settle();
    assert.equal(f.modals.length, 0); assert.equal(f.collapsed(), 2); assert.equal(f.opens.at(-1).path, '未命名.md');
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

test('captured pinned-row clicks navigate through the main controller; pin actions and dragging never navigate', async () => {
  const f = fixture({favorites: ['Alpha.md']}); const calls = [];
  try {
    f.sidebar.rightWorkspace = {async openFileInMain(file) {calls.push(file.path); f.setActive(file.path); return {};}};
    f.view.leaf = {getContainer: () => f.app.workspace.rootSplit, getRoot: () => f.app.workspace.leftSplit}; await f.view.onOpen();
    const row = f.doc.querySelector('.bui-page-favorite'), button = row.querySelector('.bui-page-favorite-open');
    let captured; row.setPointerCapture = id => {captured = id;}; row.hasPointerCapture = id => captured === id;
    row.releasePointerCapture = () => {captured = undefined;};
    const pointer = (target, type, y) => {
      const event = new f.win.MouseEvent(type, {bubbles: true, cancelable: true, button: 0, clientX: 30, clientY: y});
      Object.defineProperty(event, 'pointerId', {value: 3}); Object.defineProperty(event, 'pointerType', {value: 'mouse'});
      target.dispatchEvent(event);
    };
    pointer(button, 'pointerdown', 40); assert.equal(captured, 3);
    pointer(row, 'pointerup', 40); f.click(row); await f.settle();
    assert.deepEqual(calls, ['Alpha.md'], 'pointer capture retargets click to the row, which still opens the pinned page');
    f.click(f.doc.querySelector('.bui-page-favorite .bui-page-pin')); await f.settle();
    assert.deepEqual(calls, ['Alpha.md']); assert.deepEqual(f.sidebar.settings.favorites, []);
    await f.sidebar.update(state => ({...state, favorites: ['Alpha.md']}));
    const dragging = f.doc.querySelector('.bui-page-favorite');
    f.doc.elementFromPoint = () => f.doc.body;
    pointer(dragging.querySelector('.bui-page-favorite-open'), 'pointerdown', 40);
    pointer(dragging, 'pointermove', 60); pointer(dragging, 'pointerup', 60); f.click(dragging); await f.settle();
    assert.deepEqual(calls, ['Alpha.md'], 'drag completion cannot also open the page');
  } finally {f.close();}
});

test('only the successful pinned or tree navigation source is selected, including mobile touch clicks', async () => {
  for (const mobile of [false, true]) {
    const f = fixture({favorites: ['Home', 'Alpha.md']}, true, {mobile}); try {
      await f.view.onOpen();
      const highlights = () => [...f.doc.querySelectorAll('.bui-page-row.is-active, .bui-page-favorite.is-active')];
      assert.equal(highlights().length, 1); assert.ok(highlights()[0].classList.contains('bui-page-favorite'));
      assert.equal(f.row('Home').getAttribute('aria-selected'), 'false');
      f.click(f.row('Home')); await f.settle();
      assert.equal(highlights().length, 1); assert.equal(highlights()[0], f.row('Home'));
      assert.equal(f.doc.querySelector('.bui-page-favorite-open').getAttribute('aria-current'), 'false');
      f.click(f.doc.querySelector('.bui-page-favorite-open')); await f.settle();
      assert.equal(highlights().length, 1); assert.ok(highlights()[0].classList.contains('bui-page-favorite'));
      assert.equal(f.row('Home').getAttribute('aria-selected'), 'false');
      f.setActive('Zebra.md'); f.view.revealActive('Zebra.md');
      assert.equal(highlights().length, 1); assert.equal(highlights()[0], f.row('Zebra.md'));
      f.failOpen(); f.click(f.doc.querySelector('.bui-page-favorite-open')); await f.settle();
      assert.equal(highlights().length, 1); assert.equal(highlights()[0], f.row('Zebra.md'), 'failed navigation does not select the clicked shortcut');
      assert.deepEqual(f.sidebar.settings.favorites, ['Home', 'Alpha.md']);
    } finally {f.close();}
  }
});

test('mobile pinned navigation uses the active content view while recent-leaf visibility still points at Reminders', async () => {
  for (const controlled of [false, true]) {
    const f = fixture({favorites: ['Alpha.md']}, true, {mobile: true}); try {
      const stale = {view: {getViewType: () => 'nebula-reminders'}, getContainer: () => f.app.workspace.rootSplit,
        getRoot: () => f.app.workspace.rootSplit};
      f.app.workspace.getMostRecentLeaf = () => stale;
      // Some mobile hosts expose a drawer container here. Content belongs to
      // the workspace root, so this must not scope the active note out.
      f.view.leaf.getContainer = () => f.app.workspace.leftSplit;
      f.setActiveType('nebula-reminders');
      if (controlled) f.sidebar.rightWorkspace = {async openFileInMain(file) {f.setActive(file.path); return {};}};
      await f.view.onOpen();
      f.click(f.doc.querySelector('.bui-page-favorite-open')); await f.settle();
      assert.equal(f.collapsed(), 1, 'successful navigation closes the drawer even when recent-leaf visibility is stale');
      const selected = () => [...f.doc.querySelectorAll('.bui-page-row.is-active, .bui-page-favorite.is-active')];
      assert.equal(selected().length, 1); assert.equal(selected()[0].dataset.id, 'Alpha.md');
      assert.ok(selected()[0].classList.contains('bui-page-favorite'));
      assert.equal(f.row('Alpha.md').getAttribute('aria-selected'), 'false');
      f.focusSidebar(); f.view.syncActivePage();
      assert.equal(selected().length, 1, 'sidebar focus retains the last actual content leaf, not the stale visibility fallback');
      f.setActiveType('nebula-reminders'); f.view.syncActivePage(); assert.equal(selected().length, 0);
      assert.deepEqual(f.sidebar.settings.favorites, ['Alpha.md']);
    } finally {f.close();}
  }
});

test('non-file content clears stale selection, while sidebar focus and duplicate events preserve the current note', async () => {
  const f = fixture({favorites: ['Home']}, true, {mobile: true}); try {
    await f.view.onOpen(); f.sidebar.onload();
    const selected = () => [...f.doc.querySelectorAll('.bui-page-row.is-active, .bui-page-favorite.is-active')];
    assert.equal(selected().length, 1);
    let renders = 0; const original = f.view.render.bind(f.view); f.view.render = () => {renders++; original();};
    f.setActiveType('nebula-reminders');
    assert.equal(f.app.workspace.getActiveFile().path, 'Home.md', 'host still reports its last file in a non-file view');
    f.app.workspace.trigger('active-leaf-change'); f.app.workspace.trigger('file-open', f.find('Home.md'));
    await f.settle(); assert.equal(selected().length, 0); assert.equal(renders, 1);
    f.app.workspace.trigger('active-leaf-change'); await f.settle(); assert.equal(renders, 1, 'unchanged non-file selection does not rerender');
    f.setActive('Alpha.md'); f.app.workspace.trigger('active-leaf-change'); f.app.workspace.trigger('file-open', f.find('Alpha.md'));
    await f.settle(); assert.equal(selected().length, 1); assert.equal(selected()[0], f.row('Alpha.md')); assert.equal(renders, 2);
    f.focusSidebar(); f.app.workspace.trigger('active-leaf-change', f.view.leaf); await f.settle();
    assert.equal(selected()[0], f.row('Alpha.md')); assert.equal(renders, 2, 'focusing a sidebar retains the actual content page selection');
    f.setActiveType('empty'); f.app.workspace.trigger('active-leaf-change'); f.sidebar.onunload(); await f.settle();
    assert.equal(renders, 2, 'unload cancels queued selection refresh');
  } finally {f.close();}
});

test('non-file content never selects or auto-expands plain folders with an undefined file path', async () => {
  for (const pinned of [false, true]) {
    const f = fixture({favorites: pinned ? ['Finance'] : []}, true, {mobile: true}); try {
      const Folder = f.find('Home').constructor, File = f.find('Alpha.md').constructor;
      f.root.children.push(new Folder('Finance', [new File('Finance/Workbench.md')]));
      f.setActiveType('nebula-reminders'); await f.view.onOpen();
      assert.ok(f.row('Finance'), 'a directory without a folder note is visible');
      assert.equal(f.row('Finance').getAttribute('aria-expanded'), 'false');
      assert.equal(f.doc.querySelector('.bui-page-row.is-active, .bui-page-favorite.is-active'), null);
      assert.equal(f.doc.querySelector('[aria-selected="true"], [aria-current="page"]'), null);
      if (pinned) assert.ok(f.doc.querySelector('.bui-page-favorite[data-id="Finance"]'));
      f.view.revealActive(undefined);
      assert.equal(f.doc.querySelector('.bui-page-row.is-active, .bui-page-favorite.is-active'), null);
      assert.equal(f.row('Finance').getAttribute('aria-expanded'), 'false');
      assert.deepEqual(f.writes, []); assert.deepEqual(f.opens, []);
    } finally {f.close();}
  }
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

test('root and child actions create unique blank pages directly, coalesce fast repeats and preserve the parent', async () => {
  const f = fixture(); try {
    await f.view.onOpen();
    f.click(f.row('Alpha.md').querySelector('button[data-icon="plus"]'));
    f.click(f.row('Alpha.md').querySelector('button[data-icon="plus"]')); await f.settle();
    assert.equal(f.modals.length, 0);
    assert.deepEqual(f.created, [{folder: 'Alpha'}, {file: 'Alpha/未命名.md', content: ''}]); assert.ok(f.find('Alpha.md'));
    assert.equal(f.opens[0].path, 'Alpha/未命名.md'); assert.ok(f.row('Alpha/未命名.md'));
    f.click(f.row('Alpha').querySelector('button[data-icon="plus"]')); await f.settle();
    assert.equal(f.created.at(-1).file, 'Alpha/未命名 1.md');
    f.click(f.doc.querySelector('.bui-pages-create')); await f.settle();
    assert.equal(f.created.at(-1).file, '未命名.md');
    f.click(f.doc.querySelector('.bui-pages-create'), {detail: 2}); await f.settle();
    assert.equal(f.created.at(-1).file, '未命名.md', 'the second click of a desktop double-click cannot create another page');
    f.click(f.doc.querySelector('.bui-pages-create')); await f.settle();
    assert.equal(f.created.at(-1).file, '未命名 1.md');
    assert.ok(f.created.filter(item => item.file).every(item => item.content === ''));
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
    f.view.leaf = {getContainer: () => f.app.workspace.rootSplit, getRoot: () => f.app.workspace.leftSplit};
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

test('top shortcuts retain creation and expose reminder rename without opening a page', async () => {
  const f = fixture(); let renamed = 0, name = '工作计划';
  try {
    f.sidebar.openReminders = async () => {}; f.sidebar.reminderName = () => name;
    f.sidebar.renameReminders = () => {renamed++; name = '下一步'; f.sidebar.refresh();};
    await f.view.onOpen();
    const shortcuts = f.doc.querySelector('.bui-pages-shortcuts');
    assert.deepEqual([...shortcuts.children].map(el => el.textContent), ['新建页面', '工作计划']);
    assert.equal(f.doc.querySelector('.bui-pages-footer'), null);
    assert.ok(shortcuts.compareDocumentPosition(f.doc.querySelector('.bui-pages-scroll')) & f.win.Node.DOCUMENT_POSITION_FOLLOWING);
    f.doc.querySelector('.bui-pages-reminders').dispatchEvent(new f.win.MouseEvent('contextmenu', {bubbles: true, cancelable: true}));
    f.menus.at(-1).items.find(item => item.title === '重命名').click();
    assert.equal(renamed, 1); assert.equal(f.doc.querySelector('.bui-pages-reminders').textContent, '下一步');
    assert.deepEqual(f.opens, []); assert.deepEqual(f.created, []);
  } finally {f.close();}
});

test('mobile footer places the original settings action before New page, restores it on close, and supports late native headers', async () => {
  for (const late of [false, true]) {
    const f = fixture(undefined, true, {mobile: true}); let settingsOpened = 0;
    try {
      const drawer = f.doc.body.createDiv({cls: 'workspace-drawer mod-left'});
      const header = drawer.createDiv({cls: 'workspace-drawer-header'});
      const settings = f.doc.createElement('button'); settings.className = 'workspace-drawer-header-icon mod-settings';
      settings.addEventListener('click', () => {settingsOpened++;});
      if (!late) header.append(settings);
      await f.view.onOpen();
      if (late) {header.append(settings); await f.settle();}
      const footer = f.doc.querySelector('.bui-pages-mobile-footer');
      assert.deepEqual([...footer.children].map(el => el.className), ['bui-pages-mobile-settings-slot', 'bui-pages-create']);
      assert.equal(f.doc.querySelector('.bui-pages-shortcuts .bui-pages-create'), null);
      assert.equal(f.doc.querySelectorAll('.bui-pages-create').length, 1);
      assert.equal(footer.querySelector('.mod-settings'), settings, 'move the real native settings control, preserving its handler');
      f.click(settings); assert.equal(settingsOpened, 1);
      f.click(footer.querySelector('.bui-pages-create')); await f.settle();
      assert.equal(f.modals.length, 0); assert.equal(f.opens.at(-1).path, '未命名.md');
      await f.view.onClose(); assert.equal(settings.parentElement, header);
      f.click(settings); assert.equal(settingsOpened, 2, 'native appearance retains the original settings button');
    } finally {f.close();}
  }
});

test('mobile startup selects Pages instead of a stale bookmark drawer and retains main focus', async () => {
  for (const openOnStartup of [true, false]) {
    const f = fixture({openOnStartup}, true, {mobile: true}); try {
      const pages = f.addLeaf('nebula-pages'), bookmark = f.addLeaf('bookmarks');
      const main = {view: {getViewType: () => 'markdown'}, path: 'Home.md'};
      let selectedDrawer = bookmark, activeLeaf = main, drawerClosed = false, release;
      const pending = new Promise(resolve => {release = resolve;});
      f.app.workspace.leftSplit.collapse = () => {drawerClosed = true;};
      f.app.workspace.revealLeaf = async leaf => {
        f.revealed.push(leaf); selectedDrawer = leaf; drawerClosed = false;
        if (f.revealed.length === 1) await pending;
      };
      f.app.workspace.setActiveLeaf = leaf => {activeLeaf = leaf;};
      f.sidebar.onload(); f.layoutReady.forEach(ready => ready());
      await new Promise(resolve => f.win.setTimeout(resolve, 5));
      assert.equal(selectedDrawer, pages, 'the native drawer selector no longer points to bookmarks');
      assert.equal(drawerClosed, true, 'drawer is closed even while deferred loading is pending');
      assert.equal(activeLeaf, main, 'preparing the drawer must not activate its leaf');
      release(); await f.settle();
      assert.equal(drawerClosed, true); assert.equal(activeLeaf, main);
      assert.equal(pages.view.getViewType(), 'nebula-pages'); assert.equal(bookmark.view.getViewType(), 'bookmarks');
      assert.equal(f.leaves.length, 2, 'existing sidebar leaves are reused without deleting bookmarks');
      await f.sidebar.open(); assert.equal(drawerClosed, false, 'an explicit sidebar command still opens it');
      assert.equal(selectedDrawer, pages); assert.equal(activeLeaf, main);
      assert.deepEqual(f.created, []); assert.deepEqual(f.writes, []);
    } finally {f.close();}
  }
});

test('failed mobile startup reveal still closes the drawer without changing the main page', async () => {
  const f = fixture(undefined, true, {mobile: true}); try {
    f.addLeaf('file-explorer'); let closed = true;
    f.app.workspace.leftSplit.collapse = () => {closed = true;};
    f.app.workspace.revealLeaf = async () => {closed = false; throw new Error('failed reveal');};
    f.sidebar.onload(); f.layoutReady.forEach(ready => ready());
    await new Promise(resolve => f.win.setTimeout(resolve, 5)); await f.settle();
    assert.equal(closed, true); assert.equal(f.app.workspace.getActiveFile().path, 'Home.md');
    assert.equal(f.notices.length, 1); assert.deepEqual(f.created, []);
  } finally {f.close();}
});

test('sidebar actions show one full-title card beside the row, without native or host title bubbles', async () => {
  const f = fixture(); try {
    await f.view.onOpen(); let run;
    f.win.setTimeout = fn => {run = fn; return 1;}; f.win.clearTimeout = () => {};
    const row = f.row('Home'), action = row.querySelector('button[data-icon="plus"]');
    row.getBoundingClientRect = () => ({left: 20, right: 220, top: 70, bottom: 100, width: 200, height: 30});
    assert.equal(action.hasAttribute('title'), false); assert.equal(action.hasAttribute('aria-label'), false);
    assert.equal(f.doc.getElementById(action.getAttribute('aria-labelledby')).textContent, '在 Home 下新建页面');
    assert.equal(f.doc.querySelector('.bui-pages-tree [aria-label]'), null, 'group labels must not leak a 项目 tooltip on hover');
    action.dispatchEvent(new f.win.Event('pointerenter')); run();
    const tooltip = f.doc.querySelector('.bui-page-action-tooltip');
    assert.equal(tooltip.querySelector('.bui-page-action-tooltip-title').textContent, 'Home');
    assert.match(tooltip.textContent, /新建子页面/); assert.equal(tooltip.style.left, '228px'); assert.equal(tooltip.style.top, '70px');
    assert.equal(action.getAttribute('aria-describedby'), tooltip.id);
    row.querySelector('.bui-page-pin').dispatchEvent(new f.win.Event('pointerenter')); run();
    assert.equal(f.doc.querySelectorAll('.bui-page-action-tooltip').length, 1); assert.equal(tooltip.isConnected, false);
    f.doc.querySelector('.bui-pages-scroll').dispatchEvent(new f.win.Event('scroll'));
    assert.equal(f.doc.querySelector('.bui-page-action-tooltip'), null);
    action.dispatchEvent(new f.win.Event('pointerenter')); f.view.render(); run();
    assert.equal(f.doc.querySelector('.bui-page-action-tooltip'), null, 'detached row cannot revive its tooltip');
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
    f.key(reopened.contentEl.querySelector('input'), 'Escape'); assert.equal(reopened.closed, true);
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

test('phone search can clear without losing input focus and close without navigating; desktop retains outside dismissal', async () => {
  for (const mobile of [false, true]) {
    const f = fixture(undefined, true, {mobile}); try {
      await f.view.onOpen(); f.click(f.doc.querySelector('.bui-pages-search-button'));
      const modal = f.modals.at(-1), input = modal.contentEl.querySelector('input');
      const clear = modal.contentEl.querySelector('[aria-label="清空搜索"]');
      const close = modal.contentEl.querySelector('[aria-label="关闭搜索"]');
      if (!mobile) {assert.equal(clear, null); assert.equal(close, null); continue;}
      assert.ok(clear.hidden);
      input.value = 'child'; input.dispatchEvent(new f.win.Event('input'));
      assert.equal(clear.hidden, false);
      input.dispatchEvent(new f.win.CompositionEvent('compositionstart'));
      f.click(clear);
      assert.equal(input.value, ''); assert.equal(f.doc.activeElement, input); assert.ok(clear.hidden);
      assert.equal(f.view.captureNavigation().mobileQuery ?? '', '');
      assert.equal(modal.closed, false); assert.equal(f.collapsed(), 0);
      input.value = '保留'; input.dispatchEvent(new f.win.Event('input'));
      f.click(close); await f.settle();
      assert.equal(modal.closed, true); assert.equal(f.view.captureNavigation().mobileQuery, '保留');
      assert.deepEqual(f.opens, []); assert.equal(f.collapsed(), 0);
    } finally {f.close();}
  }
});

test('every search mode dismisses from its backdrop or Escape while inside taps retain the current picker', async () => {
  const f = fixture(undefined, true, {mobile: true}); try {
    await f.view.onOpen();
    for (const mode of ['直接搜索', '标签', '书签', '文件列表']) {
      for (const dismiss of ['backdrop', 'escape']) {
        f.click(f.doc.querySelector('.bui-pages-search-button'));
        const modal = f.modals.at(-1), input = modal.contentEl.querySelector('input');
        const button = [...modal.contentEl.querySelectorAll('.bui-sidebar-search-modes button')].find(el => el.textContent === mode);
        f.click(button); await f.settle();
        modal.contentEl.querySelector('.bui-sidebar-search-header').dispatchEvent(new f.win.MouseEvent('pointerdown', {bubbles: true}));
        assert.equal(modal.closed, false);
        input.value = '保留查询'; input.dispatchEvent(new f.win.Event('input'));
        if (dismiss === 'backdrop') modal.containerEl.querySelector('.modal-bg').dispatchEvent(new f.win.MouseEvent('pointerdown', {bubbles: true}));
        else f.key(button, 'Escape');
        assert.equal(modal.closed, true, `${mode} closes on ${dismiss}`);
        assert.equal(f.view.captureNavigation().mobileQuery, '保留查询');
        await f.settle(); assert.equal(modal.contentEl.childElementCount, 0, 'late async results cannot refill a closed modal');
      }
    }
    assert.equal(f.collapsed(), 0); assert.deepEqual(f.opens, []); assert.deepEqual(f.viewStates, []);
    assert.deepEqual(f.writes, []); assert.deepEqual(f.created, []);
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

test('one pointer or touch tap opens the pressed result even when IME completion and keyboard blur occur before click', async () => {
  for (const start of ['pointerdown', 'touchstart']) {
    const f = fixture(undefined, true, {mobile: true}); try {
      await f.view.onOpen(); f.click(f.doc.querySelector('.bui-pages-search-button'));
      const modal = f.modals.at(-1), input = modal.contentEl.querySelector('input');
      const result = [...modal.contentEl.querySelectorAll('.bui-sidebar-search-result')].find(button =>
        button.querySelector('.bui-sidebar-search-title')?.textContent === 'Alpha');
      input.dispatchEvent(new f.win.CompositionEvent('compositionstart')); input.value = 'alpha';
      const press = start === 'pointerdown'
        ? new f.win.MouseEvent(start, {bubbles: true, cancelable: true, button: 0, clientX: 30, clientY: 40})
        : new f.win.Event(start, {bubbles: true, cancelable: true});
      if (start === 'pointerdown') for (const [key, value] of Object.entries({pointerType: 'touch', pointerId: 7, isPrimary: true}))
        Object.defineProperty(press, key, {value});
      result.querySelector('.bui-sidebar-search-title').dispatchEvent(press);
      input.dispatchEvent(new f.win.CompositionEvent('compositionend'));
      assert.equal(result.isConnected, true, `${start}: compositionend must retain the pressed result until click`);
      input.dispatchEvent(new f.win.Event('input'));
      assert.equal(result.isConnected, true, 'the final input event must also retain the pressed result');
      assert.equal(f.view.captureNavigation().mobileQuery, 'alpha');
      // iOS often reports no relatedTarget when the software keyboard closes.
      input.blur();
      assert.equal(result.isConnected, true, 'blur must retain the same result');
      const end = start === 'touchstart' ? new f.win.Event('touchend', {bubbles: true})
        : new f.win.MouseEvent('pointerup', {bubbles: true, button: 0, clientX: 30, clientY: 40});
      if (start === 'pointerdown') for (const [key, value] of Object.entries({pointerType: 'touch', pointerId: 7, isPrimary: true}))
        Object.defineProperty(end, key, {value});
      result.dispatchEvent(end);
      f.click(result); await f.settle();
      assert.deepEqual(f.opens, [{path: 'Alpha.md', mode: false}]);
      assert.equal(modal.closed, true); assert.equal(f.collapsed(), 1);
      assert.equal(f.view.captureNavigation().mobileQuery, 'alpha');
      assert.deepEqual(f.viewStates, []); assert.deepEqual(f.writes, []); assert.deepEqual(f.created, []);
    } finally {f.close();}
  }
});

test('touch result taps activate on release once, while scroll, cancellation and long presses cannot navigate through a compatibility click', async () => {
  for (const gesture of ['move', 'cancel', 'scroll', 'longpress', 'tap', 'keyboard']) {
    const f = fixture(undefined, true, {mobile: true}); try {
      await f.view.onOpen(); f.click(f.doc.querySelector('.bui-pages-search-button'));
      const modal = f.modals.at(-1);
      const result = [...modal.contentEl.querySelectorAll('.bui-sidebar-search-result')].find(button =>
        button.querySelector('.bui-sidebar-search-title')?.textContent === 'Alpha');
      const target = result.querySelector('.bui-sidebar-search-title');
      const pointer = (type, timeStamp, x = 30, y = 40) => {
        const event = new f.win.MouseEvent(type, {bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y});
        for (const [key, value] of Object.entries({pointerType: 'touch', pointerId: 7, isPrimary: true, timeStamp}))
          Object.defineProperty(event, key, {value});
        // A touched button implicitly captures its pointer, including a move
        // outside its bounds and the subsequent release/cancellation.
        target.dispatchEvent(event);
      };
      let release;
      const open = modal.actions.openPage;
      modal.actions.openPage = async (...args) => {const opened = await open(...args); await new Promise(resolve => {release = resolve;}); return opened;};
      pointer('pointerdown', 1000);
      if (gesture === 'move') {pointer('pointermove', 1020, 45); pointer('pointermove', 1040);}
      if (gesture === 'cancel' || gesture === 'keyboard') pointer('pointercancel', 1040);
      if (gesture === 'scroll') modal.contentEl.querySelector('.bui-sidebar-search-results').dispatchEvent(new f.win.Event('scroll'));
      pointer('pointerup', gesture === 'longpress' ? 1700 : 1100);
      if (gesture === 'tap') {
        assert.equal(f.opens.length, 1, 'a touch opens on pointerup even if WebKit never delivers click');
      } else assert.deepEqual(f.opens, [], `${gesture} must not open on pointerup`);
      if (gesture === 'keyboard') f.key(result, 'Enter');
      // WebViews can emit this compatibility click even after a cancelled
      // gesture; keyboard Enter also activates a native button via click.
      f.click(result, {detail: gesture === 'keyboard' ? 0 : 1}); await f.settle();
      if (gesture === 'tap' || gesture === 'keyboard') {
        assert.deepEqual(f.opens, [{path: 'Alpha.md', mode: false}]);
        assert.equal(modal.closed, false, 'the pending navigation is not counted twice');
        release(); await f.settle(); assert.equal(modal.closed, true); assert.equal(f.collapsed(), 1);
      } else {
        assert.deepEqual(f.opens, [], `${gesture} must suppress the trailing compatibility click`);
        assert.equal(modal.closed, false); assert.equal(f.collapsed(), 0);
      }
    } finally {f.close();}
  }
});

test('touching search categories preserves both the open and the dismissed software keyboard instead of moving or forcing focus', async () => {
  for (const keyboardOpen of [true, false]) {
    const f = fixture(undefined, true, {mobile: true}); try {
      await f.view.onOpen(); f.click(f.doc.querySelector('.bui-pages-search-button'));
      const modal = f.modals.at(-1), input = modal.contentEl.querySelector('input');
      if (!keyboardOpen) input.blur();
      const originalFocus = f.doc.activeElement;
      for (const mode of ['标签', '书签', '文件列表', '直接搜索']) {
        const button = [...modal.contentEl.querySelectorAll('.bui-sidebar-search-modes button')].find(el => el.textContent === mode);
        const press = new f.win.MouseEvent('pointerdown', {bubbles: true, cancelable: true, button: 0});
        Object.defineProperty(press, 'pointerType', {value: 'touch'});
        button.dispatchEvent(press);
        // Model the browser's default focus transfer, which jsdom omits.
        if (!press.defaultPrevented) button.focus();
        assert.equal(press.defaultPrevented, true, `${mode} suppresses the default focus transfer`);
        button.dispatchEvent(new f.win.MouseEvent('pointerup', {bubbles: true}));
        f.click(button); await f.settle();
        assert.equal(f.doc.activeElement, originalFocus, `${mode} preserves keyboard state ${keyboardOpen ? 'open' : 'closed'}`);
        assert.equal(button.getAttribute('aria-pressed'), 'true');
        assert.equal(modal.closed, false);
      }
      assert.deepEqual(f.opens, []); assert.deepEqual(f.viewStates, []);
    } finally {f.close();}
  }
});

test('unchanged query blur, blank taps and duplicate input preserve body results without reading notes or publishing query changes again', async () => {
  const f = fixture(undefined, true, {mobile: true}); try {
    f.contents.set('Alpha.md', '已经记录预算讨论，稍后补充预算讨论二。');
    await f.view.onOpen(); f.click(f.doc.querySelector('.bui-pages-search-button'));
    const modal = f.modals.at(-1), input = modal.contentEl.querySelector('input');
    const changes = [], changed = modal.actions.changed;
    modal.actions.changed = query => {changes.push(query); changed(query);};
    input.value = '预算讨论'; input.dispatchEvent(new f.win.Event('input'));
    await new Promise(resolve => setTimeout(resolve, 170)); await f.settle();
    const result = modal.contentEl.querySelector('.bui-sidebar-search-result.is-body-match');
    assert.ok(result); assert.deepEqual(changes, ['预算讨论']);
    const reads = [...f.reads];
    input.blur();
    const blank = modal.contentEl.querySelector('.bui-sidebar-search-results');
    blank.dispatchEvent(new f.win.MouseEvent('pointerdown', {bubbles: true}));
    f.click(blank); input.dispatchEvent(new f.win.Event('input'));
    await new Promise(resolve => setTimeout(resolve, 170)); await f.settle();
    assert.deepEqual(f.reads, reads, 'focus-only events must not repeat full-text reads');
    assert.equal(modal.contentEl.querySelector('.bui-sidebar-search-result.is-body-match'), result);
    assert.deepEqual(changes, ['预算讨论']);
    input.value = '预算讨论二'; input.dispatchEvent(new f.win.Event('input'));
    await new Promise(resolve => setTimeout(resolve, 170)); await f.settle();
    assert.ok(f.reads.length > reads.length, 'an actual query change still searches the body');
    assert.deepEqual(changes, ['预算讨论', '预算讨论二']);
    const readsBeforeSwitch = [...f.reads];
    const bodyResult = modal.contentEl.querySelector('.bui-sidebar-search-result.is-body-match');
    const results = modal.contentEl.querySelector('.bui-sidebar-search-results');
    results.scrollTop = 137;
    f.click(modal.contentEl.querySelector('.bui-sidebar-search-modes [aria-pressed="true"]'));
    await new Promise(resolve => setTimeout(resolve, 170)); await f.settle();
    assert.deepEqual(f.reads, readsBeforeSwitch, 'the selected category is not an implicit full-text refresh');
    assert.equal(modal.contentEl.querySelector('.bui-sidebar-search-result.is-body-match'), bodyResult);
    const mode = label => f.click([...modal.contentEl.querySelectorAll('.bui-sidebar-search-modes button')].find(button => button.textContent === label));
    mode('标签'); results.scrollTop = 23; mode('直接搜索');
    assert.equal(modal.contentEl.querySelector('.bui-sidebar-search-result.is-body-match'), bodyResult, 'returning to a category reuses its result nodes');
    assert.equal(results.scrollTop, 137, 'each category retains its scroll position');
    mode('标签'); assert.equal(results.scrollTop, 23); mode('直接搜索');
    await new Promise(resolve => setTimeout(resolve, 170)); await f.settle();
    assert.deepEqual(f.reads, readsBeforeSwitch, 'returning to the same query does not search Markdown again');
    assert.deepEqual(changes, ['预算讨论', '预算讨论二']);
    modal.close(); assert.deepEqual(changes, ['预算讨论', '预算讨论二']);
  } finally {f.close();}
});

test('pending body and bookmark searches survive category round trips and complete only into their own cached results', async () => {
  const f = fixture(undefined, true, {mobile: true}); try {
    const bodies = new Map(); f.setReadBody(file => new Promise(resolve => bodies.set(file.path, resolve)));
    f.disk.set('.obsidian/bookmarks.json', 'pending');
    const read = f.app.vault.adapter.read;
    let finishBookmarks;
    f.app.vault.adapter.read = path => {
      if (path !== '.obsidian/bookmarks.json') return read(path);
      f.reads.push(path); return new Promise(resolve => {finishBookmarks = resolve;});
    };
    await f.view.onOpen(); f.click(f.doc.querySelector('.bui-pages-search-button'));
    const modal = f.modals.at(-1), input = modal.contentEl.querySelector('input');
    const mode = label => f.click([...modal.contentEl.querySelectorAll('.bui-sidebar-search-modes button')].find(button => button.textContent === label));
    input.value = '异步正文'; input.dispatchEvent(new f.win.Event('input'));
    await new Promise(resolve => setTimeout(resolve, 170)); await f.settle();
    assert.equal(bodies.size, 4);
    mode('书签'); await f.settle(); assert.equal(typeof finishBookmarks, 'function');
    const startedReads = [...f.reads];
    mode('文件列表'); mode('直接搜索'); mode('书签'); mode('文件列表');
    await new Promise(resolve => setTimeout(resolve, 170)); await f.settle();
    assert.deepEqual(f.reads, startedReads, 'revisiting a pending category must not restart its request');
    for (const [path, resolve] of bodies) resolve(path === 'Alpha.md' ? '这里包含异步正文内容。' : '');
    finishBookmarks(JSON.stringify({items: [{type: 'file', path: 'Home/Child.md', title: '异步正文书签'}]}));
    await f.settle();
    assert.equal(modal.contentEl.querySelector('.is-body-match'), null);
    assert.doesNotMatch(modal.contentEl.textContent, /异步正文书签/, 'background completions cannot leak into the file category');
    mode('直接搜索');
    assert.equal(modal.contentEl.querySelector('.is-body-match .bui-sidebar-search-title').textContent, 'Alpha');
    assert.doesNotMatch(modal.contentEl.textContent, /正在查找正文/);
    mode('书签');
    assert.equal(modal.contentEl.querySelector('.bui-sidebar-search-title').textContent, '异步正文书签');
    assert.doesNotMatch(modal.contentEl.textContent, /正在读取书签/);
    assert.deepEqual(f.reads, startedReads); assert.deepEqual(f.opens, []);
  } finally {f.close();}
});

test('query changes and vault or metadata updates invalidate cached search categories without retaining stale rows or listeners', async () => {
  const f = fixture(undefined, true, {mobile: true}); try {
    f.contents.set('Alpha.md', '第一笔预算'); f.contents.set('Home/Child.md', '第二笔预算');
    f.metadata.set('Alpha.md', {tags: [{tag: '#旧标签'}]});
    await f.view.onOpen();
    const listenerCount = () => f.app.vault.count() + f.app.metadataCache.count();
    const baseline = listenerCount();
    f.click(f.doc.querySelector('.bui-pages-search-button'));
    const modal = f.modals.at(-1), input = modal.contentEl.querySelector('input');
    const mode = label => f.click([...modal.contentEl.querySelectorAll('.bui-sidebar-search-modes button')].find(button => button.textContent === label));
    const search = async text => {input.value = text; input.dispatchEvent(new f.win.Event('input')); await new Promise(resolve => setTimeout(resolve, 170)); await f.settle();};
    const titles = () => [...modal.contentEl.querySelectorAll('.bui-sidebar-search-title')].map(el => el.textContent);
    await search('第一笔'); assert.deepEqual(titles(), ['Alpha']);
    const previous = modal.contentEl.querySelector('.is-body-match');
    await search('第二笔'); assert.deepEqual(titles(), ['Child']); assert.equal(previous.isConnected, false);
    const readsBeforeChange = f.reads.length;
    mode('文件列表');
    f.contents.set('Alpha.md', '第二笔预算已移动到这篇'); f.contents.set('Home/Child.md', '内容已归档');
    f.app.vault.trigger('modify', f.find('Alpha.md')); f.app.vault.trigger('modify', f.find('Home/Child.md'));
    mode('直接搜索'); await new Promise(resolve => setTimeout(resolve, 170)); await f.settle();
    assert.deepEqual(titles(), ['Alpha']); assert.ok(f.reads.length > readsBeforeChange);
    await search(''); mode('标签'); assert.deepEqual(titles(), ['#旧标签']);
    mode('文件列表'); f.metadata.set('Alpha.md', {tags: [{tag: '#新标签'}]});
    f.app.metadataCache.trigger('changed', f.find('Alpha.md'));
    mode('标签'); assert.deepEqual(titles(), ['#新标签']);
    modal.close(); assert.equal(listenerCount(), baseline, 'closing search removes its source-change listeners');
    f.app.vault.trigger('modify', f.find('Alpha.md')); await f.settle(); assert.equal(modal.contentEl.childElementCount, 0);
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
    assert.match(modal.contentEl.querySelector('.bui-sidebar-search-result.is-body-match .bui-sidebar-search-path').textContent, /一次预算讨论/);
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
    await f.settle();
    assert.deepEqual(routes, ['未命名.md']); assert.deepEqual(f.opens, []);
    assert.deepEqual(f.created, [{file: '未命名.md', content: ''}]); assert.equal(f.modals.length, 0);
  } finally {f.close();}
});

test('new page creation retains failures safely and allows retry without overwriting a blank page', async () => {
  const f = fixture(undefined, true, {mobile: true}); try {
    const create = f.app.vault.create; f.app.vault.create = async () => {throw new Error('read only');};
    await f.sidebar.createPage(); assert.deepEqual(f.created, []); assert.deepEqual(f.opens, []); assert.equal(f.collapsed(), 0);
    assert.match(f.notices.at(-1), /无法新建页面/);
    f.app.vault.create = create; f.failOpen();
    await f.sidebar.createPage();
    assert.deepEqual(f.created, [{file: '未命名.md', content: ''}]); assert.ok(f.find('未命名.md'));
    assert.equal(f.collapsed(), 0); assert.match(f.notices.at(-1), /页面已创建，但未能打开/);
    f.sidebar.rightWorkspace = {async openFileInMain(file) {f.setActive(file.path); return {};}};
    await f.sidebar.createPage();
    assert.equal(f.created.at(-1).file, '未命名 1.md'); assert.equal(f.collapsed(), 1);
    f.failSave(); await f.sidebar.createPage(f.sidebar.tree().find(node => node.id === 'Home'));
    assert.equal(f.created.at(-1).file, 'Home/未命名.md'); assert.equal(f.app.workspace.getActiveFile().path, 'Home/未命名.md');
    assert.equal(f.collapsed(), 2, 'a failed expansion preference save must not block opening the created page');
    assert.match(f.notices.at(-1), /侧栏设置未能保存/); assert.equal(f.modals.length, 0);
  } finally {f.close();}
});

test('direct creation selects a visible native title on desktop and never focuses an iPhone keyboard', async () => {
  for (const mode of ['title', 'hidden-title', 'phone', 'title-changed']) {
    const f = fixture(undefined, true, {mobile: mode === 'phone'}); try {
      const NativeMarkdownView = f.app.workspace.getMostRecentLeaf().view.constructor;
      let titleFocused = 0, editorFocused = 0, cursor;
      const contentEl = f.doc.body.createDiv();
      const title = contentEl.createDiv({cls: 'inline-title', text: '未命名', attr: {contenteditable: 'true'}});
      title.getClientRects = () => mode === 'hidden-title' ? [] : [{}]; title.focus = () => {if (mode === 'title-changed') throw new Error('native view changed'); titleFocused++;};
      const nativeView = new NativeMarkdownView(undefined, undefined);
      Object.assign(nativeView, {contentEl, getMode: () => 'source', editor: {focus() {editorFocused++;}, setCursor(...args) {cursor = args;}}});
      const leaf = {view: nativeView};
      f.sidebar.rightWorkspace = {async openFileInMain(file) {nativeView.file = file; f.setActive(file.path); return leaf;}};
      await f.sidebar.createPage();
      assert.equal(f.modals.length, 0); assert.deepEqual(f.created, [{file: '未命名.md', content: ''}]);
      assert.equal(f.notices.length, 0, 'an optional title focus failure is not a navigation failure');
      assert.equal(titleFocused, mode === 'title' ? 1 : 0); assert.equal(editorFocused, mode === 'hidden-title' ? 1 : 0);
      if (mode === 'title') assert.equal(f.doc.getSelection().toString(), '未命名');
      if (mode === 'hidden-title') assert.deepEqual(cursor, [0, 0]);
      if (mode === 'phone') assert.equal(f.collapsed(), 1);
    } finally {f.close();}
  }
});
