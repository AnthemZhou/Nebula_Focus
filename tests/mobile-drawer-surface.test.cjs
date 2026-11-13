const {test} = require('node:test');
const assert = require('node:assert/strict');
const {buildSync} = require('esbuild');
const {JSDOM} = require('jsdom');
const code = buildSync({entryPoints: ['src/mobile-drawer-surface.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['obsidian']}).outputFiles[0].text;

function fixture(t, {phone = true, enabled = true} = {}) {
  const dom = new JSDOM('<body><div class="workspace"><div class="workspace-drawer mod-left"></div><div class="workspace-split mod-root"></div><div class="native-last"></div></div></body>');
  const doc = dom.window.document, workspace = doc.querySelector('.workspace'), root = doc.querySelector('.mod-root'), callbacks = {}, ready = [];
  const app = {workspace: {containerEl: workspace, rootSplit: {containerEl: root}, on: (name, fn) => {callbacks[name] = fn;}, onLayoutReady: fn => ready.push(fn)}};
  const module = {exports: {}};
  new Function('module', 'exports', 'require', code)(module, module.exports, () => ({Component: class {registerEvent() {}}, Platform: {isPhone: phone}}));
  const controller = new module.exports.MobileDrawerSurface({app}, enabled);
  const backdrop = () => {const el = doc.createElement('div'); el.className = 'workspace-drawer-backdrop'; el.style.opacity = '.35'; return el;};
  const flush = () => new Promise(resolve => setImmediate(resolve));
  controller.onload(); ready.forEach(fn => fn());
  t.after(() => {controller.onunload(); dom.window.close();});
  return {controller, doc, workspace, root, callbacks, app, backdrop, flush};
}

test('legacy phone backdrop is adopted intact, follows native opacity and removal, and works again on reopening', async t => {
  const f = fixture(t), backdrop = f.backdrop(); let clicks = 0;
  backdrop.addEventListener('click', () => clicks++);
  f.workspace.append(backdrop); await f.flush();
  assert.equal(backdrop.parentElement, f.root);
  assert.ok(backdrop.classList.contains('bui-legacy-drawer-backdrop'));
  assert.equal(backdrop.style.opacity, '0.35');
  backdrop.style.opacity = '0.8'; backdrop.click(); await f.flush();
  assert.equal(backdrop.style.opacity, '0.8'); assert.equal(clicks, 1);
  backdrop.remove(); await f.flush();
  assert.equal(backdrop.isConnected, false);
  f.workspace.append(backdrop); await f.flush();
  assert.equal(backdrop.parentElement, f.root); backdrop.click(); assert.equal(clicks, 2);
  backdrop.remove(); f.controller.setEnabled(false);
  assert.equal(backdrop.isConnected, false, 'disabling never reattaches a closed backdrop');
  assert.equal(backdrop.className, 'workspace-drawer-backdrop');
});

test('native mode and unload restore the legacy position without changing host styles or active callbacks', async t => {
  const f = fixture(t, {enabled: false}), backdrop = f.backdrop(), next = f.doc.querySelector('.native-last');
  f.workspace.insertBefore(backdrop, next); await f.flush();
  assert.equal(backdrop.parentElement, f.workspace);
  f.controller.setEnabled(true); await f.flush(); assert.equal(backdrop.parentElement, f.root);
  backdrop.style.opacity = '.65';
  f.controller.setEnabled(false); await f.flush();
  assert.equal(backdrop.parentElement, f.workspace); assert.equal(backdrop.nextSibling, next);
  assert.equal(backdrop.style.opacity, '0.65'); assert.equal(backdrop.className, 'workspace-drawer-backdrop');
  f.controller.setEnabled(true); await f.flush(); assert.equal(backdrop.parentElement, f.root);
  f.controller.onunload(); await f.flush();
  assert.equal(backdrop.parentElement, f.workspace); assert.equal(backdrop.nextSibling, next);
  assert.equal(backdrop.className, 'workspace-drawer-backdrop'); assert.equal(backdrop.style.opacity, '0.65');
});

test('modern nested backdrops and non-phone hosts remain entirely native', async t => {
  const modern = fixture(t), nested = modern.backdrop(); modern.root.prepend(nested);
  modern.callbacks['layout-change'](); await modern.flush();
  assert.equal(nested.parentElement, modern.root); assert.equal(nested.className, 'workspace-drawer-backdrop');
  modern.controller.setEnabled(false); modern.controller.onunload();
  assert.equal(nested.parentElement, modern.root); assert.equal(nested.style.opacity, '0.35');
  const desktop = fixture(t, {phone: false}), sibling = desktop.backdrop(); desktop.workspace.append(sibling);
  desktop.controller.setEnabled(true); await desktop.flush();
  assert.equal(sibling.parentElement, desktop.workspace); assert.equal(sibling.className, 'workspace-drawer-backdrop');
});
