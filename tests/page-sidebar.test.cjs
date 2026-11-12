const {test} = require('node:test');
const assert = require('node:assert/strict');
const {buildSync} = require('esbuild');
const {JSDOM} = require('jsdom');
const code = buildSync({entryPoints: ['src/page-sidebar.ts'], bundle: true, platform: 'node', format: 'cjs', external: ['obsidian'], write: false}).outputFiles[0].text;

function fixture(initial, initialEnabled = true) {
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
  class TFile {constructor(path) {this.path = path; this.name = path.split('/').pop(); this.extension = path.split('.').pop();}}
  class TFolder {constructor(path, children) {this.path = path; this.name = path.split('/').pop(); this.children = children;}}
  const root = new TFolder('/', [new TFile('Home.md'), new TFolder('Home', [new TFile('Home/Child.md')]), new TFile('Alpha.md'), new TFile('Zebra.md')]);
  let active = 'Home.md', failSave = false;
  const writes = [], opens = [], notices = [], menus = [], commands = [], created = [], modals = [], settingTabs = [], layoutReady = [];
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
  const app = {vault: {getRoot: () => root, getName: () => '测试库', getAbstractFileByPath: path => find(path), on() {},
    async createFolder(path) {created.push({folder: path}); const parent = find(path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '/'); parent.children.push(new TFolder(path, []));},
    async create(path, content) {created.push({file: path, content}); const file = new TFile(path); const parent = find(path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '/'); parent.children.push(file); return file;}},
    workspace: {on() {}, onLayoutReady(fn) {layoutReady.push(fn);}, getActiveFile: () => find(active),
      getLeavesOfType: type => leaves.filter(leaf => leaf.view.getViewType() === type),
      iterateAllLeaves: callback => leaves.forEach(callback), getLeftLeaf: () => leaves[0] ?? addLeaf('empty'),
      revealLeaf: async leaf => {revealed.push(leaf);},
      getLeaf: mode => ({async openFile(file) {opens.push({path: file.path, mode}); active = file.path;}})}};
  class ItemView extends Component {constructor(leaf) {super(); this.leaf = leaf; this.app = app; this.contentEl = doc.createElement('div'); doc.body.append(this.contentEl);}}
  class Modal {constructor() {this.contentEl = doc.createElement('div'); doc.body.append(this.contentEl); modals.push(this);} setTitle() {} open() {this.onOpen();} close() {this.onClose();}}
  class Menu {constructor() {menus.push(this); this.items = [];} setUseNativeMenu() {return this;} addItem(fn) {const item = {setTitle(title) {this.title = title; return this;}, setIcon() {return this;}, setChecked() {return this;}, setDisabled(disabled) {this.disabled = disabled; return this;}, onClick(fn) {this.click = fn; return this;}}; fn(item); this.items.push(item); return this;} addSeparator() {} showAtPosition() {}}
  const obsidian = {PluginSettingTab: class {constructor(app) {this.app = app;} update() {}}, Component, ItemView, TFile, TFolder, Modal, Menu, Notice: class {constructor(value) {notices.push(value);}}, setIcon: (el, icon) => {el.dataset.icon = icon;}};
  const module = {exports: {}};
  new Function('module', 'exports', 'require', 'window', 'console', code)(module, module.exports, name => {assert.equal(name, 'obsidian'); return obsidian;}, win, {error() {}});
  const plugin = {app, registerView() {}, addCommand(command) {commands.push(command);}, addRibbonIcon() {}, addSettingTab(tab) {settingTabs.push(tab);}};
  const sidebar = new module.exports.PageSidebar(plugin, initial, async value => {if (failSave) throw new Error('disk full'); writes.push(JSON.parse(JSON.stringify(value)));}, undefined, initialEnabled);
  const view = new module.exports.PageSidebarView({}, sidebar);
  const click = (el, options = {}) => el.dispatchEvent(new win.MouseEvent('click', {bubbles: true, cancelable: true, ...options}));
  const key = (el, name, options = {}) => el.dispatchEvent(new win.KeyboardEvent('keydown', {key: name, bubbles: true, cancelable: true, ...options}));
  const settle = () => new Promise(resolve => setImmediate(resolve));
  return {dom, doc, win, root, sidebar, view, writes, opens, notices, menus, commands, created, modals, settingTabs, layoutReady, find, click, key, settle,
    leaves, revealed, viewStates, addLeaf, setSwitchHook: hook => {switchHook = hook;},
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
    f.click(f.row('Alpha.md'), {metaKey: true}); assert.equal(f.opens[1].mode, 'tab');
  } finally {f.close();}
});

test('search reaches collapsed descendants and restores the collapsed tree when cleared', async () => {
  const f = fixture(); try {
    await f.view.onOpen(); const input = f.doc.querySelector('input'); input.value = 'child'; input.dispatchEvent(new f.win.Event('input'));
    assert.ok(f.row('Home/Child.md')); assert.equal(f.row('Alpha.md'), undefined);
    assert.equal(f.row('Home').draggable, false); assert.deepEqual(f.writes, []);
    f.key(input, 'Escape'); assert.equal(f.row('Home/Child.md'), undefined); assert.ok(f.row('Alpha.md'));
  } finally {f.close();}
});

test('keyboard navigation and reorder retain focus, persist complete sibling order and do not move files', async () => {
  const f = fixture(); try {
    await f.view.onOpen(); f.row('Zebra.md').focus();
    f.key(f.row('Zebra.md'), 'ArrowUp', {altKey: true}); await f.settle();
    assert.deepEqual(f.writes[0].order['/'], ['Alpha.md', 'Zebra.md', 'Home']);
    assert.equal(f.doc.activeElement.dataset.id, 'Zebra.md');
    f.key(f.row('Zebra.md'), 'ArrowUp'); assert.equal(f.doc.activeElement.dataset.id, 'Alpha.md');
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
    f.menus[0].items.find(item => item.title === '添加到收藏').click(); await f.settle();
    assert.deepEqual(f.writes[0].favorites, ['Home']);
    f.click(f.doc.querySelector('.bui-page-favorite-open')); assert.equal(f.opens[0].path, 'Home.md');
    const serialized = JSON.parse(JSON.stringify(f.writes[0])), next = fixture(serialized);
    try {await next.view.onOpen(); assert.ok(next.doc.querySelector('.bui-page-favorite-open'));} finally {next.close();}
  } finally {f.close();}
});

test('pointer sorting rejects cross-folder targets, persists same-level order and suppresses release clicks', async () => {
  const f = fixture({expanded: ['Home']}); try {
    await f.view.onOpen();
    const pointer = (el, type, y) => {const event = new f.win.MouseEvent(type, {bubbles: true, cancelable: true, clientX: 30, clientY: y, button: 0}); Object.defineProperty(event, 'pointerId', {value: 1}); Object.defineProperty(event, 'pointerType', {value: 'mouse'}); el.dispatchEvent(event);};
    f.doc.elementFromPoint = () => f.row('Alpha.md');
    let source = f.row('Home/Child.md'); pointer(source, 'pointerdown', 20); pointer(source, 'pointermove', -10); pointer(source, 'pointerup', -10); await f.settle(); assert.deepEqual(f.writes, []);
    source = f.row('Zebra.md'); pointer(source, 'pointerdown', 20); pointer(source, 'pointermove', -10); pointer(source, 'pointerup', -10); f.click(source); await f.settle();
    assert.deepEqual(f.writes[0].order['/'], ['Zebra.md', 'Alpha.md', 'Home']); assert.deepEqual(f.created, []); assert.deepEqual(f.opens, []);
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
    const leaf = f.addLeaf('nebula-pages', f.view); await f.view.onOpen();
    const input = f.doc.querySelector('input[type="search"]'); input.value = 'Alpha'; input.dispatchEvent(new f.win.Event('input'));
    f.doc.querySelector('.bui-pages-scroll').scrollTop = 27;
    const navigation = f.view.captureNavigation(), settings = JSON.stringify(f.sidebar.settings);
    await f.sidebar.setEnabled(false);
    assert.equal(f.sidebar.isEnabled, false); assert.equal(leaf.view.getViewType(), 'file-explorer');
    assert.equal(f.leaves.length, 1); assert.equal(f.doc.querySelectorAll('.bui-page-row').length, 0);
    await f.sidebar.setEnabled(true);
    assert.equal(leaf.view.getViewType(), 'nebula-pages'); assert.equal(f.leaves.length, 1);
    assert.deepEqual(leaf.view.captureNavigation(), navigation); assert.equal(JSON.stringify(f.sidebar.settings), settings);
    assert.deepEqual(f.writes, []); assert.deepEqual(f.created, []); assert.equal(f.revealed.at(-1), leaf);
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
