const {test} = require('node:test');
const assert = require('node:assert/strict');
const {buildSync} = require('esbuild');
const {JSDOM} = require('jsdom');
const code = buildSync({entryPoints: ['src/hover-hints.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['obsidian']}).outputFiles[0].text;

function fixture(t, enabled = true) {
  const dom = new JSDOM('<body><main></main></body>'), doc = dom.window.document, callbacks = {}, floating = [];
  const workspace = {containerEl: doc.querySelector('main'), iterateAllLeaves: () => {}, on: (name, fn) => {callbacks[name] = fn;}};
  const module = {exports: {}};
  new Function('module', 'exports', 'require', code)(module, module.exports, () => ({Component: class {registerEvent() {}}}));
  const hints = new module.exports.HoverHints({app: {workspace}}, enabled); hints.onload();
  const enter = el => el.dispatchEvent(new el.ownerDocument.defaultView.MouseEvent('pointerover', {bubbles: true}));
  const leave = (el, relatedTarget = null) => el.dispatchEvent(new el.ownerDocument.defaultView.MouseEvent('pointerout', {bubbles: true, relatedTarget}));
  const flush = () => new Promise(resolve => setImmediate(resolve));
  t.after(() => {hints.onunload(); dom.window.close(); floating.forEach(win => win.close());});
  return {doc, win: dom.window, hints, enter, leave, callbacks, flush, floating};
}

test('hover suppresses inherited and direct native titles while preserving names and unrelated UI', t => {
  const f = fixture(t);
  f.doc.body.innerHTML = '<section title="仓库"><button title="打开日期" aria-label="选择日期"><svg></svg></button></section><button title="未悬停">旁边</button><div class="menu">菜单</div><div class="hover-popover">链接预览</div>';
  const section = f.doc.querySelector('section'), button = f.doc.querySelector('button'), icon = button.querySelector('svg');
  f.enter(icon);
  assert.equal(section.title, ''); assert.equal(button.title, '');
  assert.equal(button.getAttribute('aria-label'), '选择日期');
  assert.equal(f.doc.querySelectorAll('button')[1].title, '未悬停');
  assert.equal(f.doc.querySelector('.menu').textContent, '菜单');
  assert.equal(f.doc.querySelector('.hover-popover').textContent, '链接预览');
  f.leave(icon, section);
  assert.equal(button.title, '打开日期'); assert.equal(section.title, '');
  f.leave(section);
  assert.equal(section.title, '仓库'); assert.equal(button.getAttribute('aria-label'), '选择日期');
});

test('title-only icons retain an accessible name, but text, associated labels and existing names are untouched', t => {
  const f = fixture(t);
  f.doc.body.innerHTML = '<button title="设置"></button><button title="详情">标题</button><label for="date">日期</label><input id="date" title="请选择"><button title="说明" aria-labelledby="date"></button>';
  const buttons = f.doc.querySelectorAll('button'), input = f.doc.querySelector('input');
  f.enter(buttons[0]); assert.equal(buttons[0].getAttribute('aria-label'), '设置');
  f.leave(buttons[0]); assert.equal(buttons[0].hasAttribute('aria-label'), false);
  for (const element of [buttons[1], input, buttons[2]]) {
    f.enter(element); assert.equal(element.hasAttribute('aria-label'), false); f.leave(element);
  }
  assert.equal(buttons[2].getAttribute('aria-labelledby'), 'date');
});

test('host title updates during hover are suppressed and the latest host value survives exit and disable', async t => {
  const f = fixture(t), button = f.doc.createElement('button'); button.title = '旧日期'; f.doc.body.append(button);
  f.enter(button); button.title = '新日期'; await f.flush();
  assert.equal(button.title, ''); assert.equal(button.getAttribute('aria-label'), '新日期');
  f.hints.setEnabled(false); assert.equal(button.title, '新日期'); assert.equal(button.hasAttribute('aria-label'), false);
  f.hints.setEnabled(true); button.removeAttribute('title'); await f.flush(); f.leave(button);
  assert.equal(button.hasAttribute('title'), false); assert.equal(button.hasAttribute('aria-label'), false);
  button.title = '最终日期'; f.enter(button); button.setAttribute('aria-label', '宿主名称'); button.title = '即时修改';
  f.hints.onunload();
  assert.equal(button.title, '即时修改'); assert.equal(button.getAttribute('aria-label'), '宿主名称');
});

test('native appearance and unload restore browser hints without scanning or mutating inactive titles', t => {
  const f = fixture(t, false), button = f.doc.createElement('button'); button.title = '原生'; f.doc.body.append(button);
  f.enter(button); assert.equal(button.title, '原生');
  f.hints.setEnabled(true); assert.equal(button.title, '');
  f.hints.setEnabled(false); assert.equal(button.title, '原生');
  f.hints.setEnabled(true); f.win.dispatchEvent(new f.win.Event('blur')); assert.equal(button.title, '原生');
  f.enter(button); f.hints.onunload(); assert.equal(button.title, '原生');
  f.enter(button); assert.equal(button.title, '原生');
});

test('floating window hints are restored when that window closes and use their own document', t => {
  const f = fixture(t), other = new JSDOM('<body><button title="悬浮窗口"></button></body>'); f.floating.push(other.window);
  f.callbacks['window-open']({}, other.window);
  const button = other.window.document.querySelector('button'); f.enter(button); assert.equal(button.title, '');
  f.callbacks['window-close']({}, other.window); assert.equal(button.title, '悬浮窗口');
  f.enter(button); assert.equal(button.title, '悬浮窗口');
});
