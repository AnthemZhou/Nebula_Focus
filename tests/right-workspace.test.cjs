const {test} = require('node:test');
const assert = require('node:assert/strict');
const {buildSync} = require('esbuild');
const {JSDOM} = require('jsdom');
const code = buildSync({entryPoints: ['src/right-workspace.ts'], bundle: true, platform: 'node', format: 'cjs', external: ['obsidian'], write: false}).outputFiles[0].text;
const clone = value => JSON.parse(JSON.stringify(value));

function fixture(options = {}) {
  const dom = new JSDOM('<!doctype html><body></body>'), win = dom.window, doc = win.document;
  win.HTMLElement.prototype.createEl = function(tag, options = {}) {
    const el = doc.createElement(tag); if (options.cls) el.className = options.cls; if (options.text) el.textContent = options.text;
    this.append(el); return el;
  };
  win.HTMLElement.prototype.createDiv = function(options) {return this.createEl('div', options);};
  win.HTMLElement.prototype.createSpan = function(options) {return this.createEl('span', options);};
  class Component {constructor() {this.clean = [];} registerEvent(ref) {this.clean.push(ref.off);} unload() {this.clean.forEach(fn => fn()); this.onunload?.();}}
  class WorkspaceTabs {constructor(container) {this.container = container; this.id = 'group-' + ++sequence;}}
  class TFile {constructor(path) {this.path = path; this.extension = path.split('.').at(-1);}}
  const files = new Map(['Notes/Alpha.md', 'Notes/Beta.md', 'Views/Ideas.base', 'photo.png', 'Canvas.canvas'].map(path => [path, new TFile(path)]));
  let sequence = 0, active, failOpen = false, stateHook;
  const main = {name: 'main'}, popout = {name: 'popout'}, containers = [main, popout], leaves = [], factories = new Map();
  const commands = [], ribbons = [], splits = [], insertions = [], reveals = [], activations = [], opened = [], states = [], saved = [], notices = [], errors = [], pickers = [], ready = [];
  const listeners = new Map();
  const event = (name, ...args) => {for (const fn of listeners.get(name) ?? []) fn(...args);};
  const addLeaf = (group = new WorkspaceTabs(main), state = {type: 'empty'}, id) => {
    const leaf = {id: id ?? 'leaf-' + ++sequence, parent: group, state: clone(state), view: {getViewType: () => state.type},
      getContainer() {return this.parent.container;}, getViewState() {return this.state;}, getEphemeralState() {return {scroll: 42};},
      setEphemeralState(state) {this.ephemeral = state;},
      async setViewState(next, ephemeral) {
        const previous = this.state.type; this.state = next; states.push({leaf: this, state: clone(next), ephemeral: clone(ephemeral ?? {})});
        await stateHook?.(this, next); if (this.state !== next || !leaves.includes(this)) return;
        if (previous !== next.type) {await this.view.onClose?.(); this.view = factories.get(next.type)?.(this) ?? {getViewType: () => next.type}; await this.view.onOpen?.();}
      },
      async openFile(file, opts) {if (failOpen) throw Error('open failed'); opened.push({leaf: this, path: file.path, options: opts}); await this.setViewState({type: file.extension === 'base' ? 'bases' : 'markdown', state: {file: file.path}, active: false});},
      detach() {const index = leaves.indexOf(this); if (index >= 0) leaves.splice(index, 1); void this.view.onClose?.(); if (active === this) active = leaves[0]; event('layout-change');},
    };
    leaves.push(leaf); return leaf;
  };
  const leftGroup = new WorkspaceTabs(main), left = addLeaf(leftGroup, {type: 'markdown', state: {file: 'Notes/Alpha.md', mode: 'preview', custom: {nested: true}}, pinned: true}); active = left;
  const resolutions = [];
  const app = {vault: {getFileByPath: path => files.get(path), getFiles: () => [...files.values()]},
    metadataCache: {getFirstLinkpathDest(path, source) {resolutions.push({path, source}); const relative = source.includes('/') ? source.slice(0, source.lastIndexOf('/') + 1) + path : path;
      return [path, relative, path + '.md', relative + '.md'].map(key => files.get(key)).find(Boolean) ?? null;}}, workspace: {
    containerEl: doc.body,
    rootSplit: main, getLastOpenFiles: () => options.recent ?? ['Notes/Beta.md', 'Notes/Alpha.md'], getMostRecentLeaf: container => !container || active?.getContainer() === container || active?.parent === container ? active : leaves.find(leaf => leaf.getContainer() === container || leaf.parent === container),
    iterateAllLeaves(fn) {leaves.slice().forEach(fn);}, getLeafById: id => leaves.find(leaf => leaf.id === id),
    getLayout() {return {main: {type: 'split', children: groups(main)}, floating: {type: 'floating', children: [{type: 'window', children: groups(popout)}]}};},
    getLeaf(mode) {assert.equal(mode, 'tab'); const leaf = addLeaf(active?.parent ?? new WorkspaceTabs(main)); active = leaf; return leaf;},
    createLeafBySplit(source, direction, before) {splits.push({source, direction, before}); const leaf = addLeaf(new WorkspaceTabs(source.getContainer())); active = leaf; return leaf;},
    createLeafInParent(parent, index) {insertions.push({parent, index}); const leaf = addLeaf(parent); active = leaf; return leaf;},
    async revealLeaf(leaf) {assert.ok(leaves.includes(leaf)); reveals.push(leaf); if (options.revealActivates !== false) active = leaf;},
    setActiveLeaf(leaf, params) {assert.ok(leaves.includes(leaf)); assert.equal(reveals.at(-1), leaf); activations.push({leaf, params}); active = leaf;},
    onLayoutReady(fn) {ready.push(fn);}, on(name, fn) {if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); return {off: () => listeners.get(name).delete(fn)};},
  }};
  function groups(container) {
    return [...new Set(leaves.filter(leaf => leaf.getContainer() === container).map(leaf => leaf.parent))]
      .map(group => ({type: 'tabs', id: group.id, children: leaves.filter(leaf => leaf.parent === group).map(leaf => ({type: 'leaf', id: leaf.id, state: clone(leaf.state)}))}));
  }
  class ItemView extends Component {constructor(leaf) {super(); this.leaf = leaf; this.app = app; this.contentEl = doc.createElement('div'); doc.body.append(this.contentEl); this.actions = [];} addAction(icon, title, fn) {this.actions.push({icon, title, fn}); return doc.createElement('button');}}
  class FuzzySuggestModal {constructor(app) {this.app = app; pickers.push(this);} setPlaceholder(value) {this.placeholder = value;} open() {this.opened = true;}}
  const plugin = {app, registerView(type, factory) {factories.set(type, factory);}, addCommand(command) {commands.push(command);}, addRibbonIcon(icon, title, fn) {const button = doc.createElement('button'); button.onclick = fn; button.title = title; ribbons.push(button); doc.body.append(button); return button;}};
  const api = {Component, ItemView, FuzzySuggestModal, WorkspaceTabs, TFile, Platform: {isMobileApp: !!options.mobile, isMacOS: options.mac !== false},
    parseLinktext(text) {const at = text.indexOf('#'); return at < 0 ? {path: text, subpath: ''} : {path: text.slice(0, at), subpath: text.slice(at)};},
    Notice: class {constructor(text) {notices.push(text);}}, setIcon: (el, icon) => {el.dataset.icon = icon;}};
  const mod = {exports: {}};
  new Function('module', 'exports', 'require', 'window', 'console', code)(mod, mod.exports, () => api, win, {error: (...args) => errors.push(args)});
  const create = extra => new mod.exports.RightWorkspaceController(plugin, {enabled: options.enabled, state: options.state,
    saveState: async state => {saved.push(clone(state));}, ...extra});
  const controller = create(); controller.onload();
  const tick = () => new Promise(resolve => win.setTimeout(resolve, 5));
  const start = async () => {for (const fn of ready.splice(0)) fn(); await tick();};
  const click = el => el.dispatchEvent(new win.MouseEvent('click', {bubbles: true, cancelable: true}));
  return {doc, win, main, popout, left, leftGroup, leaves, files, factories, commands, ribbons, splits, insertions, reveals, activations, opened, states, saved, notices, errors, pickers, controller, create, addLeaf, WorkspaceTabs, resolutions,
    mod: mod.exports, start, tick, event, click, active: () => active, setActive: leaf => {active = leaf;}, failOpen: () => {failOpen = true;}, setStateHook: fn => {stateHook = fn;},
    async close() {controller.unload(); await tick(); win.close();}};
}

test('desktop creates one right split then appends native tabs without changing the left view', async () => {
  const f = fixture(); try {
    await f.start(); const original = clone(f.left.getViewState());
    const [one, two] = await Promise.all([f.controller.newTab(f.left), f.controller.newTab(f.left)]);
    assert.equal(f.splits.length, 1); assert.deepEqual(f.splits[0], {source: f.left, direction: 'vertical', before: false});
    assert.equal(one.parent, two.parent); assert.notEqual(one.parent, f.left.parent); assert.equal(f.insertions.length, 1);
    assert.deepEqual(f.left.getViewState(), original); assert.equal(one.getViewState().type, 'nebula-workspace-start');
    const three = await f.controller.openFile(f.files.get('Views/Ideas.base'), f.left);
    assert.equal(three.parent, one.parent); assert.equal(three.getViewState().type, 'bases'); assert.equal(f.splits.length, 1);
    assert.equal(f.saved.at(-1).groups[0].leafIds.length, 3);
  } finally {await f.close();}
});

test('duplicate keeps note and Bases state but does not pin, link or mutate the source', async () => {
  const f = fixture(); try {
    await f.start(); const target = await f.controller.duplicateCurrent(f.left);
    assert.deepEqual(target.getViewState().state, f.left.getViewState().state); assert.notEqual(target.getViewState().state, f.left.getViewState().state);
    assert.equal(target.getViewState().pinned, undefined); assert.equal(target.getViewState().group, undefined);
    assert.equal(f.states.find(item => item.leaf === target).ephemeral.scroll, 42);
    target.getViewState().state.custom.nested = false; assert.equal(f.left.getViewState().state.custom.nested, true);
    const base = f.addLeaf(f.leftGroup, {type: 'bases', state: {file: 'Views/Ideas.base', view: 'Grouped', sorting: ['name']}});
    const copied = await f.controller.duplicateCurrent(base); assert.deepEqual(copied.getViewState().state, base.getViewState().state);
    const web = f.addLeaf(f.leftGroup, {type: 'webviewer', state: {url: 'https://example.com'}}), before = f.leaves.length;
    assert.equal(await f.controller.duplicateCurrent(web), undefined); assert.equal(f.leaves.length, before);
    assert.equal(await f.controller.openFile(f.files.get('photo.png')), undefined);
  } finally {await f.close();}
});

test('start page opens existing note/Base without Home entries and plus adds a sibling tab', async () => {
  const f = fixture(); try {
    await f.start(); const target = await f.controller.newTab(f.left), start = target.view;
    assert.match(start.contentEl.textContent, /打开笔记或数据库/); assert.doesNotMatch(start.contentEl.textContent, /网页|网址|首页/);
    assert.ok(f.commands.every(command => !command.id.includes('home'))); assert.equal(f.factories.has('nebula-home'), false);
    f.click(start.contentEl.querySelector('.nf-workspace-start-action')); const picker = f.pickers.at(-1);
    assert.deepEqual(picker.getItems().map(file => file.extension), ['md', 'md', 'base']);
    picker.onChooseItem(f.files.get('Views/Ideas.base')); await f.tick(); assert.equal(target.getViewState().type, 'bases'); assert.equal(f.leaves.length, 2);
    const next = await f.controller.newTab(); f.click(next.view.contentEl.querySelector('.nf-workspace-start-new')); await f.tick();
    assert.equal(f.splits.length, 1); assert.equal(f.active().getViewState().type, 'nebula-workspace-start');
  } finally {await f.close();}
});

test('canceled or stale file selection cannot replace another page', async () => {
  const f = fixture(); try {
    await f.start(); const target = await f.controller.newTab(); f.controller.chooseFile(target);
    assert.equal(f.leaves.length, 2); assert.equal(target.getViewState().type, 'nebula-workspace-start');
    await target.openFile(f.files.get('Notes/Beta.md'), {});
    f.pickers.at(-1).onChooseItem(f.files.get('Views/Ideas.base')); await f.tick();
    assert.equal(target.getViewState().state.file, 'Notes/Beta.md');
  } finally {await f.close();}
});

test('native plus only prepares empty tabs in the managed group, and keeps unrelated tabs native', async () => {
  const f = fixture(); try {
    await f.start(); const target = await f.controller.newTab(), plus = f.addLeaf(target.parent), ordinary = f.addLeaf(f.leftGroup);
    f.event('layout-change'); await f.tick(); assert.equal(plus.getViewState().type, 'nebula-workspace-start'); assert.equal(ordinary.getViewState().type, 'empty');
    const navigated = f.addLeaf(target.parent); await navigated.openFile(f.files.get('Notes/Beta.md'), {});
    f.event('layout-change'); await f.tick(); assert.equal(navigated.getViewState().type, 'markdown');
  } finally {await f.close();}
});

test('mobile opens normal tabs without desktop ribbons or split assumptions', async () => {
  const f = fixture({mobile: true}); try {
    await f.start(); await f.controller.newTab(); await f.controller.openFile(f.files.get('Views/Ideas.base'));
    assert.equal(f.splits.length, 0); assert.equal(f.insertions.length, 0); assert.equal(f.ribbons.length, 0); assert.equal(f.leaves.length, 3);
    assert.ok(f.leaves.every(leaf => leaf.parent === f.leftGroup)); assert.deepEqual(f.saved, []);
    assert.equal(f.commands[0].name, '打开新标签页'); assert.ok(f.commands.every(command => !command.name.includes('右侧')));
    const native = f.addLeaf(f.leftGroup); f.event('layout-change'); await f.tick(); assert.equal(native.getViewState().type, 'empty');
  } finally {await f.close();}
});

test('saved owned group survives reload with only file tabs, while stale IDs and moved leaves are ignored', async () => {
  const f = fixture(); let other; try {
    await f.start(); const right = await f.controller.openFile(f.files.get('Notes/Beta.md')); const state = clone(f.saved.at(-1));
    f.controller.unload(); other = f.create({state}); other.onload(); await f.start();
    const next = await other.newTab(f.left); assert.equal(next.parent, right.parent); assert.equal(f.splits.length, 1);
    other.unload(); right.parent = f.leftGroup; next.detach();
    other = f.create({state}); other.onload(); await f.start(); const fresh = await other.newTab(f.left);
    assert.notEqual(fresh.parent, f.leftGroup); assert.equal(f.splits.length, 2);
  } finally {other?.unload(); await f.close();}
});

test('closing one owned tab reuses remaining siblings; closing the group creates one replacement', async () => {
  const f = fixture(); try {
    await f.start(); const first = await f.controller.newTab(), second = await f.controller.newTab(); first.detach();
    const next = await f.controller.newTab(f.left); assert.equal(next.parent, second.parent); assert.equal(f.splits.length, 1);
    second.detach(); next.detach(); const replacement = await f.controller.newTab(f.left);
    assert.equal(f.splits.length, 2); assert.notEqual(replacement.parent, second.parent);
  } finally {await f.close();}
});

test('different windows have independent managed groups and a closed anchor cannot redirect requests', async () => {
  const f = fixture(); try {
    await f.start(); const pop = f.addLeaf(new f.WorkspaceTabs(f.popout), {type: 'markdown', state: {file: 'Notes/Beta.md'}});
    const mainRight = await f.controller.newTab(f.left), popRight = await f.controller.newTab(pop);
    assert.equal(mainRight.getContainer(), f.main); assert.equal(popRight.getContainer(), f.popout); assert.equal(f.splits.length, 2);
    assert.equal((await f.controller.newTab(f.left)).parent, mainRight.parent); assert.equal((await f.controller.newTab(pop)).parent, popRight.parent);
    pop.detach(); const before = f.leaves.length; assert.equal(await f.controller.newTab(pop), undefined); assert.equal(f.leaves.length, before);
  } finally {await f.close();}
});

test('native appearance hides entries and clears only custom start tabs; re-enable reuses the same group', async () => {
  const f = fixture(); try {
    await f.start(); const start = await f.controller.newTab(), note = await f.controller.openFile(f.files.get('Notes/Beta.md'));
    const before = clone(note.getViewState()); await f.controller.setEnabled(false);
    assert.equal(f.ribbons[0].hidden, true); assert.equal(start.getViewState().type, 'empty'); assert.deepEqual(note.getViewState(), before);
    assert.ok(f.commands.every(command => command.checkCallback(true) === false)); assert.equal(await f.controller.newTab(), undefined);
    await f.controller.setEnabled(true); assert.equal(f.ribbons[0].hidden, false); await f.tick(); assert.equal(start.getViewState().type, 'nebula-workspace-start');
    assert.equal((await f.controller.newTab()).parent, note.parent); assert.equal(f.splits.length, 1);
    f.controller.unload(); await f.tick(); assert.deepEqual(note.getViewState(), before); assert.equal(f.ribbons[0].isConnected, false); assert.equal(start.getViewState().type, 'empty');
  } finally {await f.close();}
});

test('enhanced desktop page menus use DOM presentation while native mode and mobile keep host menus', async () => {
  for (const mobile of [false, true]) {
    const f = fixture({mobile}); try {
      await f.start(); const calls = [], menu = {setUseNativeMenu(value) {calls.push(value); return this;}};
      for (const source of ['more-options', 'tab-header', 'file-explorer-context-menu', 'link-context-menu'])
        f.event('file-menu', menu, f.files.get('Notes/Alpha.md'), source, f.left);
      assert.deepEqual(calls, mobile ? [] : [false, false]);
      await f.controller.setEnabled(false);
      f.event('file-menu', menu, f.files.get('Notes/Alpha.md'), 'more-options', f.left);
      assert.deepEqual(calls, mobile ? [] : [false, false], 'native appearance does not override menu presentation');
      f.controller.unload(); f.event('file-menu', menu, f.files.get('Notes/Alpha.md'), 'tab-header', f.left);
      assert.deepEqual(calls, mobile ? [] : [false, false], 'unload unregisters the host event');
    } finally {await f.close();}
  }
});

test('open failures remove only the unused new leaf and do not affect existing pages', async () => {
  const f = fixture(); try {
    await f.start(); f.failOpen(); assert.equal(await f.controller.openFile(f.files.get('Notes/Beta.md')), undefined);
    assert.equal(f.leaves.length, 1); assert.equal(f.left.getViewState().state.file, 'Notes/Alpha.md'); assert.equal(f.notices.length, 1);
  } finally {await f.close();}
});

test('retiring a legacy Home returns to the recent real page without changing any restored file views', async () => {
  const f = fixture(); try {
    const beta = f.addLeaf(f.leftGroup, {type: 'markdown', state: {file: 'Notes/Beta.md', mode: 'source'}});
    const old = f.addLeaf(f.leftGroup, {type: 'nebula-home', state: {}}); f.setActive(old);
    const before = clone(beta.getViewState()); await f.start();
    assert.equal(f.leaves.includes(old), false); assert.equal(f.active(), beta); assert.deepEqual(beta.getViewState(), before);
    assert.equal(f.left.getViewState().state.file, 'Notes/Alpha.md'); assert.deepEqual(f.opened, []);
    assert.equal(await f.controller.duplicateCurrent(old), undefined);
  } finally {await f.close();}
});

test('an active legacy Home reopens the most recent file when only older unrelated tabs remain', async () => {
  const f = fixture({recent: ['Notes/Beta.md', 'Notes/Alpha.md']}); try {
    const old = f.addLeaf(f.leftGroup, {type: 'nebula-home'}); f.setActive(old); await f.start();
    assert.equal(f.leaves.includes(old), true); assert.equal(old.getViewState().state.file, 'Notes/Beta.md');
    assert.equal(f.active(), old); assert.equal(f.left.getViewState().state.file, 'Notes/Alpha.md');
    assert.equal(f.opened.length, 1); assert.deepEqual(f.reveals, []); assert.deepEqual(f.splits, []);
  } finally {await f.close();}
});

test('an inactive legacy Home never steals focus; ordinary native startup creates no page or split', async () => {
  const f = fixture(); try {
    const old = f.addLeaf(f.leftGroup, {type: 'nebula-home'}); await f.start();
    assert.equal(f.leaves.includes(old), false); assert.equal(f.active(), f.left); assert.deepEqual(f.reveals, []);
    assert.deepEqual(f.opened, []); assert.deepEqual(f.splits, []); assert.deepEqual(f.saved, []);
  } finally {await f.close();}
});

test('a lone legacy Home restores a still-existing last file or becomes a native empty tab', async () => {
  for (const recent of [['missing.md', 'photo.png', 'Views/Ideas.base'], ['missing.md']]) {
    const f = fixture({recent, enabled: false}); try {
      await f.left.setViewState({type: 'nebula-home'}); await f.start();
      assert.equal(f.left.getViewState().type, recent.includes('Views/Ideas.base') ? 'bases' : 'empty');
      assert.equal(f.leaves.length, 1); assert.deepEqual(f.reveals, []); assert.deepEqual(f.splits, []);
    } finally {await f.close();}
  }
});

test('click-origin routing finds the actual owning leaf even when another window is active, and rejects stale elements', async () => {
  const f = fixture(); try {
    await f.start();
    const local = f.doc.createElement('div'), icon = f.doc.createElement('button'); local.append(icon); f.doc.body.append(local); f.left.view.containerEl = local;
    const pop = f.addLeaf(new f.WorkspaceTabs(f.popout), {type: 'markdown', state: {file: 'Notes/Beta.md'}}); f.setActive(pop);
    const opened = await f.controller.openFileFromElement(f.files.get('Notes/Beta.md'), icon);
    assert.equal(opened.getContainer(), f.main); assert.equal(f.splits[0].source, f.left); assert.equal(pop.getViewState().state.file, 'Notes/Beta.md');
    const before = f.leaves.length; local.remove(); assert.equal(await f.controller.openFileFromElement(f.files.get('Notes/Beta.md'), icon), undefined);
    assert.equal(f.leaves.length, before);
  } finally {await f.close();}
});

test('queued file openings revalidate the file before creating a tab after an earlier navigation', async () => {
  const f = fixture(); try {
    await f.start(); let release;
    f.setStateHook((_leaf, state) => {if (state.type === 'nebula-workspace-start') return new Promise(resolve => {release = resolve;});});
    const first = f.controller.newTab(); await f.tick();
    const pending = f.controller.openFile(f.files.get('Notes/Beta.md'), f.left);
    f.files.delete('Notes/Beta.md'); f.setStateHook(undefined); release(); await first;
    assert.equal(await pending, undefined); assert.equal(f.leaves.length, 2); assert.deepEqual(f.opened, []);
    assert.equal(f.left.getViewState().state.file, 'Notes/Alpha.md'); assert.deepEqual(f.notices, []);
  } finally {await f.close();}
});

test('unloading while a start view is opening restores empty state and never reactivates it', async () => {
  const f = fixture(); try {
    await f.start(); let release, target;
    f.setStateHook((leaf, state) => {if (state.type === 'nebula-workspace-start') {target = leaf; return new Promise(resolve => {release = resolve;});}});
    const pending = f.controller.newTab(); await f.tick(); f.controller.unload(); await f.tick(); release();
    assert.equal(await pending, undefined); assert.equal(target.getViewState().type, 'empty'); assert.deepEqual(f.reveals, []);
    assert.equal(f.left.getViewState().type, 'markdown');
  } finally {await f.close();}
});

test('disabling or closing during async opening does not reveal stale targets or remove a finished file', async () => {
  for (const action of ['disable', 'close', 'navigate']) {
    const f = fixture(); try {
      await f.start(); let release, target;
      f.setStateHook((leaf, state) => {if (state.type === 'markdown') {target = leaf; return new Promise(resolve => {release = resolve;});}});
      const pending = f.controller.openFile(f.files.get('Notes/Beta.md')); await f.tick(); assert.ok(target);
      if (action === 'disable') await f.controller.setEnabled(false);
      if (action === 'close') target.detach();
      if (action === 'navigate') {f.setStateHook(undefined); await target.setViewState({type: 'bases', state: {file: 'Views/Ideas.base'}});}
      release(); assert.equal(await pending, undefined); assert.deepEqual(f.reveals, []);
      if (action === 'disable') assert.equal(target.getViewState().state.file, 'Notes/Beta.md');
      assert.equal(f.left.getViewState().state.file, 'Notes/Alpha.md');
    } finally {await f.close();}
  }
});

test('reload repairs only start placeholders and initial native mode leaves them as native empty tabs', async () => {
  for (const enabled of [true, false]) {
    const f = fixture({enabled}); try {
      const start = f.addLeaf(new f.WorkspaceTabs(f.main), {type: 'nebula-workspace-start', state: {}}); await f.start();
      assert.equal(start.getViewState().type, enabled ? 'nebula-workspace-start' : 'empty');
      if (enabled) assert.ok(start.view instanceof f.mod.RightWorkspaceStartView);
      assert.equal(f.left.getViewState().type, 'markdown'); assert.deepEqual(f.reveals, []);
    } finally {await f.close();}
  }
});

test('persisted layout markers reject malformed IDs and contain no note data', () => {
  const f = fixture(); try {
    assert.deepEqual(f.mod.readRightWorkspaceState({groups: [{tabGroupId: 'tabs', leafIds: ['x', 'x', 7, '']}, {}, {tabGroupId: 'empty', leafIds: []}]}), {groups: [{tabGroupId: 'tabs', leafIds: ['x']}]});
    assert.deepEqual(f.mod.readRightWorkspaceState(undefined), {groups: []});
  } finally {f.controller.unload(); f.win.close();}
});

test('ordinary navigation reuses its destination tab while explicit openFile still duplicates', async () => {
  const f = fixture(); try {
    await f.start(); const original = clone(f.left.getViewState());
    const [one, two] = await Promise.all([f.controller.navigateFile(f.files.get('Notes/Beta.md'), f.left), f.controller.navigateFile(f.files.get('Notes/Beta.md'), f.left)]);
    assert.equal(one, two); assert.equal(f.splits.length, 1); assert.equal(f.leaves.length, 2);
    const duplicate = await f.controller.openFile(f.files.get('Notes/Beta.md'), f.left);
    assert.notEqual(duplicate, one); assert.equal(duplicate.parent, one.parent); assert.equal(f.leaves.length, 3);
    assert.deepEqual(f.left.getViewState(), original);
  } finally {await f.close();}
});

test('platform modifier opens in the main group, respects pinned pages, and keeps right-hand records intact', async () => {
  for (const mac of [true, false]) {
    const f = fixture({mac}); try {
      await f.start(); const right = await f.controller.navigateFile(f.files.get('Notes/Beta.md'), f.left);
      const rightState = clone(right.getViewState()), original = clone(f.left.getViewState());
      const main = await f.controller.navigateFile(f.files.get('Views/Ideas.base'), right, {metaKey: mac, ctrlKey: !mac});
      assert.equal(main.parent, f.left.parent); assert.notEqual(main, f.left, 'a pinned main page is preserved');
      assert.equal(f.splits.length, 1); assert.deepEqual(right.getViewState(), rightState); assert.deepEqual(f.left.getViewState(), original);
      const reused = await f.controller.navigateFile(f.files.get('Views/Ideas.base'), right, {metaKey: mac, ctrlKey: !mac});
      assert.equal(reused, main);
      const changed = await f.controller.navigateFile(f.files.get('Notes/Beta.md'), main, {metaKey: mac, ctrlKey: !mac});
      assert.equal(changed, main); assert.equal(main.getViewState().state.file, 'Notes/Beta.md');
      assert.deepEqual(right.getViewState(), rightState);
    } finally {await f.close();}
  }
});

test('mobile navigation ignores desktop modifiers and reuses ordinary tabs without splitting', async () => {
  const f = fixture({mobile: true}); try {
    await f.start(); const note = await f.controller.navigateFile(f.files.get('Notes/Beta.md'), f.left, {metaKey: true, ctrlKey: true});
    assert.equal(note.parent, f.leftGroup); assert.equal(f.splits.length, 0);
    assert.equal(await f.controller.navigateFile(f.files.get('Notes/Beta.md'), f.left), note);
    assert.equal(f.leaves.length, 2); assert.equal(f.left.getViewState().state.file, 'Notes/Alpha.md');
  } finally {await f.close();}
});

test('sidebar navigation opens in the main region while right tabs have focus, and explicit tabs stay in main', async () => {
  const f = fixture({revealActivates: false}); try {
    await f.start(); f.left.getViewState().pinned = false;
    const right = await f.controller.navigateFile(f.files.get('Notes/Beta.md'), f.left), before = clone(right.getViewState());
    const main = await f.controller.openFileInMain(f.files.get('Notes/Beta.md'));
    assert.equal(main, f.left, 'a matching file on the right is not the sidebar destination');
    assert.equal(f.active(), main); assert.deepEqual(f.activations.at(-1), {leaf: main, params: {focus: true}});
    assert.equal(main.getViewState().state.file, 'Notes/Beta.md'); assert.deepEqual(right.getViewState(), before);
    f.setActive(right); assert.equal(await f.controller.openFileInMain(f.files.get('Notes/Beta.md')), main);
    assert.equal(f.active(), main, 'reusing an existing main tab also activates it');
    f.setActive(right); const duplicate = await f.controller.openFileInMain(f.files.get('Notes/Beta.md'), undefined, true);
    assert.notEqual(duplicate, main); assert.equal(duplicate.parent, f.leftGroup); assert.equal(f.leaves.length, 3);
    assert.equal(f.active(), duplicate); assert.equal(f.activations.length, 3);
    assert.equal(f.splits.length, 1); assert.deepEqual(right.getViewState(), before);
    const internal = await f.controller.navigateFile(f.files.get('Views/Ideas.base'), main);
    assert.equal(internal.parent, right.parent, 'record links keep the managed right region');
    assert.equal(f.splits.length, 1);
  } finally {await f.close();}
});

test('main navigation protects pinned pages and stays inside the source window', async () => {
  const f = fixture(); try {
    await f.start(); const original = clone(f.left.getViewState());
    const right = await f.controller.openFile(f.files.get('Notes/Beta.md'));
    const main = await f.controller.openFileInMain(f.files.get('Views/Ideas.base'), right);
    assert.equal(main.parent, f.leftGroup); assert.notEqual(main, f.left); assert.deepEqual(f.left.getViewState(), original);
    const pop = f.addLeaf(new f.WorkspaceTabs(f.popout), {type: 'markdown', state: {file: 'Notes/Alpha.md'}});
    const popRight = await f.controller.openFile(f.files.get('Notes/Beta.md'), pop); f.setActive(main);
    assert.equal(await f.controller.openFileInMain(f.files.get('Views/Ideas.base'), popRight), pop);
    assert.equal(pop.getContainer(), f.popout); assert.equal(f.splits.length, 2);
    popRight.detach(); const count = f.opened.length;
    assert.equal(await f.controller.openFileInMain(f.files.get('Notes/Beta.md'), popRight), undefined);
    assert.equal(f.opened.length, count, 'closed source windows cannot redirect a queued navigation');
  } finally {await f.close();}
});

test('unmarked restored right tabs never become sidebar destinations or cause a third split', async () => {
  const f = fixture({state: {groups: []}, revealActivates: false}); try {
    f.left.getViewState().pinned = false;
    const right = f.addLeaf(new f.WorkspaceTabs(f.main), {type: 'markdown', state: {file: 'Notes/Beta.md', mode: 'source'}, pinned: true});
    const original = clone(right.getViewState()); f.setActive(right); await f.start();
    const result = await f.controller.openFileInMain(f.files.get('Notes/Beta.md'), right);
    assert.equal(result, f.left, 'a restored matching right tab is excluded from main lookup');
    assert.equal(f.active(), f.left); assert.deepEqual(right.getViewState(), original);
    const extra = await f.controller.newTab(right);
    assert.equal(extra.parent, right.parent); assert.deepEqual(f.splits, []);
    assert.equal(f.saved.at(-1).groups[0].tabGroupId, right.parent.id);
    assert.equal((await f.controller.navigateFile(f.files.get('Notes/Beta.md'), f.left)), right);
    assert.equal(f.leaves.length, 3, 'normal record navigation reuses the existing right record');
  } finally {await f.close();}
});

test('only the first content group is main even with stale markers and additional old groups', async () => {
  const f = fixture(); try {
    f.left.getViewState().pinned = false;
    const second = f.addLeaf(new f.WorkspaceTabs(f.main), {type: 'bases', state: {file: 'Views/Ideas.base'}});
    const third = f.addLeaf(new f.WorkspaceTabs(f.main), {type: 'markdown', state: {file: 'Notes/Beta.md'}});
    const states = [clone(second.getViewState()), clone(third.getViewState())]; f.setActive(third); await f.start();
    assert.equal(await f.controller.openFileInMain(f.files.get('Notes/Beta.md'), third), f.left);
    assert.equal((await f.controller.newTab(third)).parent, second.parent);
    assert.deepEqual(second.getViewState(), states[0]); assert.deepEqual(third.getViewState(), states[1]);
    assert.equal(f.splits.length, 0, 'existing regions are reused without adding or destructively flattening panes');
    assert.equal(f.leaves.length, 4);
  } finally {await f.close();}
});

test('sidebar reclaims the remaining content group when main was closed instead of creating another split', async () => {
  const f = fixture(); try {
    await f.start(); const right = await f.controller.openFile(f.files.get('Notes/Beta.md')); f.left.detach();
    assert.equal(await f.controller.openFileInMain(f.files.get('Views/Ideas.base'), right), right);
    assert.equal(f.splits.length, 1); assert.equal(f.leaves.length, 1); assert.deepEqual(f.saved.at(-1).groups, []);
    const record = await f.controller.navigateFile(f.files.get('Notes/Beta.md'), right);
    assert.notEqual(record.parent, right.parent); assert.equal(f.splits.length, 2);
  } finally {await f.close();}
});

test('mobile sidebar replaces the current tab and only creates a tab for an explicit request', async () => {
  const f = fixture({mobile: true, revealActivates: false}); try {
    await f.start(); f.left.getViewState().pinned = false;
    assert.equal(await f.controller.openFileInMain(f.files.get('Notes/Beta.md')), f.left);
    assert.equal(f.leaves.length, 1); assert.equal(f.left.getViewState().state.file, 'Notes/Beta.md');
    assert.equal(f.active(), f.left); assert.deepEqual(f.activations.at(-1), {leaf: f.left, params: {focus: false}});
    const duplicate = await f.controller.openFileInMain(f.files.get('Notes/Beta.md'), f.left, true);
    assert.notEqual(duplicate, f.left); assert.equal(duplicate.parent, f.leftGroup); assert.equal(f.leaves.length, 2);
    assert.equal(f.active(), duplicate); assert.deepEqual(f.activations.at(-1), {leaf: duplicate, params: {focus: false}});
    assert.deepEqual(f.splits, []); assert.deepEqual(f.saved, []);
  } finally {await f.close();}
});

test('readable internal links resolve relative paths, preserve headings and reuse matching tabs with the modifier rule', async () => {
  const f = fixture(); try {
    const source = f.doc.createElement('div'); source.className = 'markdown-preview-view';
    source.innerHTML = '<a class="internal-link" data-href="Beta#Details" href="Beta#Details">Beta</a>';
    f.doc.body.append(source); f.left.view.containerEl = source; await f.start();
    const link = source.querySelector('a'); let native = 0; link.addEventListener('click', () => {native++;});
    f.click(link); await f.tick(); const right = f.active();
    assert.equal(native, 0); assert.equal(right.getViewState().state.file, 'Notes/Beta.md'); assert.notEqual(right.parent, f.leftGroup);
    assert.deepEqual(f.resolutions[0], {path: 'Beta', source: 'Notes/Alpha.md'});
    assert.deepEqual(f.opened.at(-1).options.eState, {subpath: '#Details'});
    link.dataset.href = 'Beta#Next'; f.click(link); await f.tick();
    assert.equal(f.leaves.length, 2); assert.equal(f.active(), right); assert.deepEqual(right.ephemeral, {subpath: '#Next'});
    link.dataset.href = 'Views/Ideas.base'; link.dispatchEvent(new f.win.MouseEvent('click', {bubbles: true, cancelable: true, metaKey: true})); await f.tick();
    assert.equal(f.active().parent, f.leftGroup); assert.equal(f.active().getViewState().state.file, 'Views/Ideas.base');
    assert.equal(right.getViewState().state.file, 'Notes/Beta.md'); assert.equal(f.left.getViewState().state.file, 'Notes/Alpha.md');
  } finally {await f.close();}
});

test('link routing leaves editing, attachments, external URLs, local fragments and other native gestures alone', async () => {
  const f = fixture(); try {
    const source = f.doc.createElement('div'); source.className = 'markdown-preview-view';
    f.doc.body.append(source); f.left.view.containerEl = source; await f.start();
    for (const scenario of [
      {href: 'https://example.com/Notes/Beta.md'}, {href: '//example.com/Notes/Beta.md'}, {href: 'photo.png'}, {href: '#Details'},
      {href: 'Notes/Beta.md', editable: 'true'}, {href: 'Notes/Beta.md', editable: 'plaintext-only'},
      {href: 'Notes/Beta.md', editor: true}, {href: 'Notes/Beta.md', unresolved: true},
      {href: 'Notes/Beta.md', titleEditor: true},
      {href: 'Notes/Beta.md', event: {button: 2}}, {href: 'Notes/Beta.md', event: {altKey: true}}, {href: 'Notes/Beta.md', event: {shiftKey: true}},
    ]) {
      source.replaceChildren(); const wrapper = source.createDiv();
      if (scenario.editable) wrapper.setAttribute('contenteditable', scenario.editable);
      if (scenario.editor) wrapper.className = 'cm-content';
      const link = wrapper.createEl('a', {cls: 'internal-link' + (scenario.unresolved ? ' is-unresolved' : '')}); link.setAttribute('href', scenario.href);
      if (scenario.titleEditor) link.classList.add('bui-idea-title');
      let nativeReached; link.addEventListener('click', event => {nativeReached = !event.defaultPrevented; event.preventDefault();});
      const event = new f.win.MouseEvent('click', {bubbles: true, cancelable: true, ...scenario.event}); link.dispatchEvent(event); await f.tick();
      assert.equal(nativeReached, true, JSON.stringify(scenario));
    }
    assert.equal(f.leaves.length, 1); assert.deepEqual(f.opened, []);
    await f.controller.setEnabled(false); source.innerHTML = '<a class="internal-link" href="Notes/Beta.md">Beta</a>';
    const native = new f.win.MouseEvent('click', {bubbles: true, cancelable: true}); source.firstChild.dispatchEvent(native); await f.tick();
    assert.equal(native.defaultPrevented, false); assert.equal(f.leaves.length, 1);
  } finally {await f.close();}
});

test('readonly property anchors in popouts use their own window and document listeners are removed on close', async () => {
  const f = fixture(), pop = new JSDOM('<!doctype html><body><div class="metadata-container"><a class="internal-link" href="Beta">Beta</a></div></body>');
  try {
    const source = pop.window.document.querySelector('.metadata-container');
    const leaf = f.addLeaf(new f.WorkspaceTabs(f.popout), {type: 'markdown', state: {file: 'Notes/Alpha.md', mode: 'source'}});
    leaf.view.containerEl = source; await f.start(); f.setActive(f.left);
    f.event('window-open', {}, {document: pop.window.document});
    source.firstChild.dispatchEvent(new pop.window.MouseEvent('click', {bubbles: true, cancelable: true})); await f.tick();
    assert.equal(f.active().getContainer(), f.popout); assert.equal(f.active().getViewState().state.file, 'Notes/Beta.md');
    assert.equal(f.left.getViewState().state.file, 'Notes/Alpha.md');
    f.event('window-close', {}, {document: pop.window.document}); const count = f.reveals.length;
    const native = new pop.window.MouseEvent('click', {bubbles: true, cancelable: true}); source.firstChild.dispatchEvent(native); await f.tick();
    assert.equal(native.defaultPrevented, false); assert.equal(f.reveals.length, count);
  } finally {pop.window.close(); await f.close();}
});
