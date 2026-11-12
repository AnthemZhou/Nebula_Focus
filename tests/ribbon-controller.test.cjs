const {test} = require('node:test');
const assert = require('node:assert/strict');
const {buildSync} = require('esbuild');
const {JSDOM} = require('jsdom');
const code = buildSync({entryPoints: ['src/ribbon-controller.ts'], bundle: true, platform: 'node', format: 'cjs', external: ['obsidian'], write: false}).outputFiles[0].text;

function fixture(initial, mobile = false, emulatedMobile = false) {
  const dom = new JSDOM('<!doctype html><body><div class="workspace-ribbon mod-primary"><div class="side-dock-actions"></div><div class="side-dock-settings"><button>设置</button></div></div></body>');
  const doc = dom.window.document, writes = [], handlers = {}, ready = [];
  let fail = false;
  class Component {registerEvent() {}}
  const plugin = {app: {workspace: {containerEl: doc.body, on: (event, fn) => {handlers[event] = fn;}, onLayoutReady: fn => ready.push(fn)}}};
  const module = {exports: {}};
  new Function('module', 'exports', 'require', 'console', code)(module, module.exports,
    name => {assert.equal(name, 'obsidian'); return {Component, Platform: {isMobileApp: mobile, isMobile: mobile || emulatedMobile}};}, {warn() {}});
  const controller = new module.exports.RibbonController(plugin, initial, async prefs => {
    if (fail) throw new Error('disk full'); writes.push(JSON.parse(JSON.stringify(prefs)));
  });
  const add = (icon, label, document = doc) => {
    const el = document.createElement('div'); el.className = 'side-dock-ribbon-action'; el.setAttribute('aria-label', label);
    el.innerHTML = `<svg class="svg-icon lucide-${icon}"></svg>`;
    document.querySelector('.side-dock-actions').append(el); return el;
  };
  const settle = () => new Promise(resolve => setImmediate(resolve));
  return {controller, doc, dom, writes, handlers, ready, add, settle, exports: module.exports,
    fail: () => {fail = true;}, close: () => {controller.onunload(); dom.window.close();}};
}

function addNativeFooter(doc) {
  const profile = doc.createElement('div'); profile.className = 'workspace-sidedock-vault-profile';
  profile.innerHTML = '<button class="workspace-drawer-vault-switcher">Vault</button><div class="workspace-drawer-vault-actions"><span class="clickable-icon"><svg class="help"></svg></span><span class="clickable-icon"><svg class="lucide-settings"></svg></span></div><span class="native-trailing">Keep order</span>';
  doc.body.append(profile);
  return {profile, actions: profile.querySelector('.workspace-drawer-vault-actions'), trailing: profile.lastChild};
}

test('known optional tools are compact by default; unfamiliar tools and native settings remain untouched', () => {
  const f = fixture(); try {
    const quick = f.add('file-search', '打开快速切换'), graph = f.add('git-fork', '查看关系图谱');
    const thirdParty = f.add('git-fork', 'A separate plugin tool');
    const settings = f.doc.querySelector('.side-dock-settings'); settings.setAttribute('style', 'opacity: .7');
    f.controller.onload();
    assert.equal(quick.classList.contains('bui-ribbon-hidden'), false);
    assert.equal(graph.classList.contains('bui-ribbon-hidden'), true);
    assert.equal(thirdParty.classList.contains('bui-ribbon-hidden'), false);
    assert.equal(settings.getAttribute('style'), 'opacity: .7');
    assert.equal(f.controller.listItems().length, 3); assert.deepEqual(f.writes, []);
  } finally {f.close();}
});

test('preferences persist independently, concurrent edits compose and failed saves keep current visibility', async () => {
  const f = fixture(); try {
    const quick = f.add('file-search', '打开快速切换'), graph = f.add('git-fork', '查看关系图谱'); f.controller.onload();
    await Promise.all([f.controller.setVisible('quick-switcher', false), f.controller.setVisible('graph', true)]);
    assert.deepEqual(f.writes.at(-1).visibility, {'quick-switcher': false, graph: true});
    assert.equal(quick.classList.contains('bui-ribbon-hidden'), true); assert.equal(graph.classList.contains('bui-ribbon-hidden'), false);
    f.fail(); assert.equal(await f.controller.setVisible('graph', false), false);
    assert.equal(graph.classList.contains('bui-ribbon-hidden'), false);
    assert.deepEqual(f.writes.at(-1).visibility, {'quick-switcher': false, graph: true});
  } finally {f.close();}
});

test('native mode and unload restore original class and inline styles even across window changes', () => {
  const f = fixture(); const popout = new JSDOM('<body><div class="workspace-ribbon"><div class="side-dock-actions"></div></div></body>');
  try {
    const graph = f.add('git-fork', '查看关系图谱'); graph.setAttribute('style', 'display: grid; color: red');
    f.controller.onload(); f.handlers['window-open'](null, popout.window);
    const other = f.add('calendar', "Open today's daily note", popout.window.document); f.ready[0]();
    assert.equal(other.classList.contains('bui-ribbon-hidden'), true);
    f.controller.setEnabled(false);
    assert.equal(graph.classList.contains('bui-ribbon-hidden'), false); assert.equal(other.classList.contains('bui-ribbon-hidden'), false);
    assert.equal(graph.getAttribute('style'), 'display: grid; color: red');
    f.controller.setEnabled(true); assert.equal(graph.classList.contains('bui-ribbon-hidden'), true);
    f.handlers['window-close'](null, popout.window); assert.equal(other.classList.contains('bui-ribbon-hidden'), false);
    f.controller.onunload(); assert.equal(graph.classList.contains('bui-ribbon-hidden'), false);
    assert.equal(graph.getAttribute('style'), 'display: grid; color: red');
  } finally {f.close(); popout.window.close();}
});

test('late native actions are recognised, newly added third-party tools stay visible, show-all and reset work', async () => {
  const f = fixture(); try {
    f.controller.onload();
    const templates = f.add('files', 'Insert template'), unknown = f.add('star', 'My bookmark tool'); await f.settle();
    assert.equal(templates.classList.contains('bui-ribbon-hidden'), true); assert.equal(unknown.classList.contains('bui-ribbon-hidden'), false);
    await f.controller.showAll(); assert.equal(templates.classList.contains('bui-ribbon-hidden'), false);
    const id = f.controller.listItems().find(item => item.label === 'My bookmark tool').id;
    await f.controller.setVisible(id, false); assert.equal(unknown.classList.contains('bui-ribbon-hidden'), true);
    await f.controller.reset(); assert.equal(templates.classList.contains('bui-ribbon-hidden'), true); assert.equal(unknown.classList.contains('bui-ribbon-hidden'), false);
    unknown.remove(); await f.settle(); assert.equal(unknown.classList.contains('bui-ribbon-hidden'), false);
  } finally {f.close();}
});

test('mobile is not filtered and malformed stored preferences cannot change recognised defaults', () => {
  const f = fixture({visibility: {graph: 'false', 'quick-switcher': false}}, true); try {
    const graph = f.add('git-fork', '查看关系图谱'); f.controller.onload(); f.controller.trackDocument(f.doc);
    assert.equal(f.controller.available, false); assert.equal(graph.classList.contains('bui-ribbon-hidden'), false);
    assert.deepEqual(f.controller.listItems(), []);
    assert.deepEqual(f.exports.readRibbonPreferences({visibility: {graph: 'false', 'quick-switcher': false}}), {visibility: {'quick-switcher': false}});
  } finally {f.close();}
});

test('native help/settings move intact to the desktop ribbon and restore their exact slot and listeners', () => {
  const f = fixture(); try {
    const {profile, actions, trailing} = addNativeFooter(f.doc), before = profile.innerHTML;
    let calls = 0; actions.lastChild.addEventListener('click', () => calls++);
    f.controller.onload();
    assert.equal(actions.parentElement, f.doc.querySelector('.side-dock-settings'));
    assert.equal(actions.classList.contains('bui-ribbon-vault-actions'), true);
    assert.equal(f.doc.querySelectorAll('.workspace-drawer-vault-actions').length, 1);
    actions.lastChild.click(); assert.equal(calls, 1);
    f.controller.setEnabled(false);
    assert.equal(actions.parentElement, profile); assert.equal(actions.nextSibling, trailing);
    assert.equal(profile.innerHTML, before); actions.lastChild.click(); assert.equal(calls, 2);
    f.controller.setEnabled(true); f.controller.onunload();
    assert.equal(profile.innerHTML, before); assert.equal(actions.parentElement, profile);
  } finally {f.close();}
});

test('late footer creation and native profile replacement leave one live pair, without resurrecting deleted controls', async () => {
  const f = fixture(); try {
    f.controller.onload();
    const first = addNativeFooter(f.doc); await f.settle();
    assert.equal(first.actions.parentElement, f.doc.querySelector('.side-dock-settings'));
    const ribbon = f.doc.querySelector('.workspace-ribbon');
    ribbon.hidden = true; await f.settle(); assert.equal(first.actions.parentElement, first.profile);
    ribbon.hidden = false; await f.settle(); assert.equal(first.actions.parentElement, f.doc.querySelector('.side-dock-settings'));
    const second = addNativeFooter(f.doc); first.profile.remove(); await f.settle();
    assert.equal(first.actions.isConnected, false);
    assert.equal(second.actions.parentElement, f.doc.querySelector('.side-dock-settings'));
    // Native re-render can replace the profile's children without replacing the profile itself.
    second.profile.innerHTML = first.profile.innerHTML;
    const replacement = second.profile.querySelector('.workspace-drawer-vault-actions'); await f.settle();
    assert.equal(second.actions.isConnected, false);
    assert.equal(replacement.parentElement, f.doc.querySelector('.side-dock-settings'));
    replacement.remove(); await f.settle(); f.controller.setEnabled(false);
    assert.equal(replacement.isConnected, false); assert.equal(f.doc.querySelectorAll('.workspace-drawer-vault-actions').length, 0);
  } finally {f.close();}
});

test('footer placement is per-window and leaves mobile controls in the native vault profile', () => {
  const f = fixture(), phone = fixture(undefined, true), emulated = fixture(undefined, false, true);
  const popout = new JSDOM('<body><div class="workspace-ribbon mod-primary"><div class="side-dock-actions"></div><div class="side-dock-settings"></div></div></body>');
  try {
    const main = addNativeFooter(f.doc), other = addNativeFooter(popout.window.document), mobile = addNativeFooter(phone.doc), mockPhone = addNativeFooter(emulated.doc);
    f.controller.onload(); f.handlers['window-open'](null, popout.window); phone.controller.onload(); emulated.controller.onload();
    assert.equal(main.actions.closest('.workspace-ribbon')?.ownerDocument, f.doc);
    assert.equal(other.actions.closest('.workspace-ribbon')?.ownerDocument, popout.window.document);
    assert.equal(mobile.actions.parentElement, mobile.profile);
    assert.equal(mockPhone.actions.parentElement, mockPhone.profile);
    f.handlers['window-close'](null, popout.window); assert.equal(other.actions.parentElement, other.profile);
    assert.notEqual(main.actions.parentElement, main.profile);
  } finally {f.close(); phone.close(); emulated.close(); popout.window.close();}
});
