const {test} = require('node:test');
const assert = require('node:assert/strict');
const {buildSync} = require('esbuild');
const {JSDOM} = require('jsdom');
const code = buildSync({entryPoints: ['src/home-view.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['obsidian']}).outputFiles[0].text;

const dataModule = (id, patch = {}) => ({id, kind: 'view', title: id, collapsed: false, source: 'Ideas.base', view: 'Ideas', basePath: `Home/${id}.base`, height: 480, ...patch});

function fixture(modules = []) {
  const dom = new JSDOM('<!doctype html><body></body>'), win = dom.window, doc = win.document;
  win.HTMLElement.prototype.createEl = function(tag, options = {}) {
    const el = doc.createElement(tag);
    if (options.cls) el.className = options.cls;
    if (options.text !== undefined) el.textContent = options.text;
    for (const [key, value] of Object.entries(options.attr || {})) el.setAttribute(key, value);
    for (const key of ['type', 'placeholder', 'value']) if (options[key] !== undefined) el[key] = options[key];
    this.append(el); return el;
  };
  win.HTMLElement.prototype.createDiv = function(options) {return this.createEl('div', options);};
  win.HTMLElement.prototype.createSpan = function(options) {return this.createEl('span', options);};
  class Component {
    constructor() {this.children = new Set(); this.cleanup = []; this.unloaded = false;}
    addChild(child) {this.children.add(child); return child;}
    removeChild(child) {this.children.delete(child); child.unload(); return child;}
    register(fn) {this.cleanup.push(fn);}
    unload() {if (this.unloaded) return; this.unloaded = true; for (const child of this.children) child.unload(); for (const fn of this.cleanup) fn();}
  }
  class TFile {constructor(path) {this.path = path; this.basename = path.split('/').pop().replace(/\.md$/, ''); this.extension = path.split('.').pop();}}
  const files = new Map(['Notes/A.md', 'Other/A.md', 'Notes/B.md'].map(path => [path, new TFile(path)]));
  const opens = [], mounts = [], saves = [], menus = [];
  let fail = false;
  const app = {vault: {getFileByPath: path => files.get(path) || null, getMarkdownFiles: () => [...files.values()]},
    workspace: {getLeaf: mode => ({openFile: async file => {opens.push({path: file.path, mode});}})}};
  class ItemView extends Component {constructor() {super(); this.app = app; this.contentEl = doc.createElement('div'); doc.body.append(this.contentEl);}}
  class Modal {constructor(app) {this.app = app; this.contentEl = doc.createElement('div'); doc.body.append(this.contentEl);} setTitle(title) {this.title = title;} open() {this.onOpen();} close() {this.onClose();}}
  class Menu {
    constructor() {this.items = []; menus.push(this);}
    addItem(fn) {const item = {setTitle(title) {this.title = title; return this;}, setIcon() {return this;}, onClick(fn) {this.click = fn; return this;}}; fn(item); this.items.push(item); return this;}
    showAtPosition() {}
  }
  const loaded = {exports: {}};
  new Function('require', 'module', 'exports', code)(() => ({Component, ItemView, Modal, Menu, TFile, setIcon(el, icon) {el.dataset.icon = icon;}}), loaded, loaded.exports);
  const {HomeView, HomeModuleModal} = loaded.exports;
  const host = {config: {version: 1, title: '首页', modules}, views: new Set(),
    async update(change) {if (fail) return false; this.config = change(this.config); for (const view of this.views) view.render(); return true;},
    async saveModule(module) {saves.push(structuredClone(module)); if (fail) return false; this.config = {...this.config, modules: [...this.config.modules, module]}; for (const view of this.views) view.render(); return true;},
    async mountModule(el, module, component) {mounts.push({el, module, component}); el.createEl('input', {value: `live-${module.id}`});},
    async openModule(module) {opens.push({module: module.id});},
    async listSources() {return [{path: 'Ideas.base', views: ['Ideas', 'Archive'], properties: ['note.金额', 'note.币种']}]}, async open() {}};
  const view = new HomeView({}, host);
  const click = el => el.dispatchEvent(new win.MouseEvent('click', {bubbles: true, cancelable: true}));
  const change = el => el.dispatchEvent(new win.Event('change', {bubbles: true}));
  const submit = modal => modal.contentEl.querySelector('form').dispatchEvent(new win.Event('submit', {bubbles: true, cancelable: true}));
  const control = (modal, label) => [...modal.contentEl.querySelectorAll('label')].find(el => el.firstElementChild.textContent === label)?.querySelector('input, select');
  const settle = () => new Promise(resolve => setImmediate(resolve));
  return {dom, win, doc, view, host, mounts, opens, saves, menus, files, click, change, submit, control, settle,
    modal: (kind, module) => new HomeModuleModal(app, host, kind, module),
    fail(value = true) {fail = value;}, async close() {await view.onClose(); win.close();}};
}

test('Home preserves live module DOM/components across title, collapse, height and ordering changes', async () => {
  const f = fixture([dataModule('one'), dataModule('two')]);
  try {
    await f.view.onOpen(); await f.settle();
    assert.equal(f.mounts.length, 2); assert.equal(f.host.views.has(f.view), true);
    const section = f.doc.querySelector('[data-module-id="one"]'), input = section.querySelector('input');
    const originalComponent = f.mounts[0].component;
    f.host.config.modules = [dataModule('two'), dataModule('one', {title: '改名', collapsed: true, height: 720})]; f.view.render();
    assert.equal(f.mounts.length, 2); assert.equal(section.querySelector('input'), input);
    assert.equal(section.querySelector('.nf-home-module-body').hidden, true); assert.equal(originalComponent.unloaded, false);
    assert.equal(f.doc.querySelector('.nf-home-sections').lastElementChild, section);
    assert.equal(section.querySelector('.nf-home-module-title').textContent, '改名');
    assert.equal(section.querySelector('.nf-home-module-body').style.getPropertyValue('--nf-home-view-height'), '720px');
    f.host.config.modules[1].collapsed = false; f.view.render(); assert.equal(f.mounts.length, 2);
    f.host.config.modules[1].view = 'Archive'; f.view.render(); await f.settle();
    assert.equal(f.mounts.length, 3); assert.equal(originalComponent.unloaded, true); assert.equal(input.isConnected, false);
    await f.view.onClose(); assert.equal(f.host.views.size, 0); assert.ok(f.mounts.every(mount => mount.component.unloaded));
  } finally {await f.close();}
});

test('failed module persistence keeps modal choices and original Home, then retry saves the same draft', async () => {
  const f = fixture(), modal = f.modal('view');
  try {
    modal.open(); await f.settle();
    const source = f.control(modal, '数据来源'); source.value = 'Ideas.base'; f.change(source);
    const selectedView = f.control(modal, '来源视图'); selectedView.value = 'Archive'; f.change(selectedView);
    const title = f.control(modal, '模块名称'); title.value = '我的归档';
    const height = f.control(modal, '显示高度'); height.value = '300'; f.change(height);
    f.fail(); f.submit(modal); await f.settle();
    assert.equal(f.host.config.modules.length, 0); assert.equal(title.value, '我的归档');
    assert.equal(source.value, 'Ideas.base'); assert.equal(selectedView.value, 'Archive'); assert.equal(height.value, '300');
    assert.equal(title.disabled, false); assert.match(modal.contentEl.querySelector('[role="alert"]').textContent, /仍保留/);
    f.fail(false); f.submit(modal); await f.settle();
    assert.equal(f.host.config.modules.length, 1);
    assert.equal(f.host.config.modules[0].title, '我的归档'); assert.equal(f.host.config.modules[0].view, 'Archive');
    assert.equal(f.host.config.modules[0].height, 300); assert.equal(modal.contentEl.children.length, 0);
    assert.deepEqual(f.saves[0], f.saves[1]);
  } finally {modal.close(); await f.close();}
});

test('link picker rejects missing and ambiguous notes, stores unique real paths, and links open real files', async () => {
  const f = fixture(), modal = f.modal('links');
  try {
    modal.open(); const picker = modal.contentEl.querySelector('input[type="search"]');
    const add = [...modal.contentEl.querySelectorAll('button')].find(el => el.textContent === '添加');
    picker.value = 'Missing.md'; f.click(add); assert.equal(modal.contentEl.querySelectorAll('.nf-home-selected-links li').length, 0);
    picker.value = 'A'; f.click(add); assert.match(modal.contentEl.querySelector('[role="alert"]').textContent, /完整路径/);
    for (const path of ['Notes/A.md', 'Notes/A.md', 'B']) {picker.value = path; f.click(add);}
    assert.equal(modal.contentEl.querySelectorAll('.nf-home-selected-links li').length, 2);
    f.submit(modal); await f.settle(); assert.deepEqual(f.host.config.modules[0].paths, ['Notes/A.md', 'Notes/B.md']);
    await f.view.onOpen(); f.click(f.doc.querySelector('.nf-home-link'));
    assert.deepEqual(f.opens, [{path: 'Notes/A.md', mode: false}]); assert.equal(f.mounts.length, 0);
  } finally {modal.close(); await f.close();}
});
