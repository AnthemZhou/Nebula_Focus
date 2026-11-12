const {test} = require('node:test');
const assert = require('node:assert/strict');
const {buildSync} = require('esbuild');
const {JSDOM} = require('jsdom');
const mod = {exports: {}};
const code = buildSync({entryPoints: ['src/shortcut-guide.ts'], bundle: true, platform: 'node', format: 'cjs', write: false}).outputFiles[0].text;
new Function('module', 'exports', code)(mod, mod.exports);
const {ShortcutGuide, commandHotkeys, hotkeyCaps, shortcutHints, APPEARANCE_HOTKEY} = mod.exports;

function fixture(t, {mac = true, reduced = false} = {}) {
  const dom = new JSDOM('<!doctype html><body><main><textarea>中文草稿保持不变</textarea></main><section tabindex="0"></section></body>', {pretendToBeVisual: true});
  const win = dom.window, doc = win.document;
  const make = function(tag, options) {
    const el = doc.createElement(tag);
    if (typeof options === 'string') el.className = options;
    else if (options) {
      el.className = options.cls || '';
      if (options.text !== undefined) el.textContent = options.text;
      for (const [key, value] of Object.entries(options.attr || {})) el.setAttribute(key, value);
    }
    this.appendChild(el); return el;
  };
  win.HTMLElement.prototype.createEl = make;
  win.HTMLElement.prototype.createDiv = function(options) {return make.call(this, 'div', options);};
  win.HTMLElement.prototype.createSpan = function(options) {return make.call(this, 'span', options);};
  const motion = new win.EventTarget(); motion.matches = reduced;
  win.matchMedia = () => motion;
  const observers = [];
  win.ResizeObserver = class {
    constructor(run) {this.run = run; observers.push(this);}
    observe(target) {this.target = target;}
    disconnect() {this.disconnected = true;}
  };
  let time = 0, serial = 0;
  const timers = new Map();
  win.setTimeout = (run, delay) => {const id = ++serial; timers.set(id, {run, at: time + delay}); return id;};
  win.clearTimeout = id => timers.delete(id);
  const tick = ms => {
    const end = time + ms;
    while (true) {
      const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      time = next[1].at; timers.delete(next[0]); next[1].run();
    }
    time = end;
  };
  const state = {target: doc.querySelector('main'), rect: {left: 200, right: 1000, top: 80, bottom: 720}, status: '当前：优化外观', app: {}};
  state.target.getBoundingClientRect = () => state.rect;
  const input = doc.querySelector('textarea'); input.focus(); input.setSelectionRange(2, 5);
  const guide = new ShortcutGuide(win, mac, {
    target: () => state.target,
    hints: () => shortcutHints(state.app, mac, 'nebula-focus'),
    status: () => state.status,
  });
  const key = (type, value, options = {}) => {
    const event = new win.KeyboardEvent(type, {key: value, bubbles: true, cancelable: true, ...options});
    input.dispatchEvent(event); return event;
  };
  const press = options => key('keydown', mac ? 'Meta' : 'Control', {metaKey: mac, ctrlKey: !mac, ...options});
  const release = () => key('keyup', mac ? 'Meta' : 'Control');
  const panel = () => doc.querySelector('.bui-shortcut-guide:not(.is-leaving)');
  const dispatch = (type, target = doc) => {const event = new win.Event(type, {bubbles: true, cancelable: true}); target.dispatchEvent(event); return event;};
  t.after(() => {guide.dispose(); dom.window.close();});
  return {dom, win, doc, guide, state, input, timers, observers, motion, tick, key, press, release, panel, dispatch};
}

test('shortcut lookup honors custom bindings and explicit removal before defaults', () => {
  const fallback = [APPEARANCE_HOTKEY], custom = [{modifiers: ['Mod', 'Shift'], key: 'h'}];
  const manager = {customKeys: {'nebula-focus:toggle-reading-ui': custom}, getHotkeys() {throw Error('custom overrides must win');}};
  assert.deepEqual(commandHotkeys({hotkeyManager: manager}, 'nebula-focus:toggle-reading-ui', fallback), custom);
  manager.customKeys['nebula-focus:toggle-reading-ui'] = [];
  assert.deepEqual(commandHotkeys({hotkeyManager: manager}, 'nebula-focus:toggle-reading-ui', fallback), []);
  const seen = [];
  const methods = {getHotkeys(id) {assert.equal(this, methods); seen.push(id);}, getDefaultHotkeys(id) {seen.push(id); return custom;}};
  assert.deepEqual(commandHotkeys({hotkeyManager: methods}, 'command', fallback), custom);
  assert.deepEqual(seen, ['command', 'command']);
  assert.deepEqual(commandHotkeys({}, 'command', fallback), fallback);
});

test('unknown registry shapes and malformed bindings cannot crash or become executable help', () => {
  const fallback = [APPEARANCE_HOTKEY];
  for (const app of [null, {hotkeyManager: null}, {hotkeyManager: {getHotkeys() {throw Error('host changed');}}}]) {
    assert.deepEqual(commandHotkeys(app, 'x', fallback), fallback);
  }
  const valid = {modifiers: ['Ctrl'], key: 'F7'};
  assert.deepEqual(commandHotkeys({hotkeyManager: {customKeys: {x: [null, {}, {key: 'x', modifiers: ['Bad']}, {key: '', modifiers: []}, valid]}}}, 'x', fallback), [valid]);
  assert.deepEqual(commandHotkeys({hotkeyManager: {customKeys: {x: 'bad'}}}, 'x', fallback), []);
});

test('keycap labels map the actual platform and each opening reads current custom keys', () => {
  assert.deepEqual(hotkeyCaps(APPEARANCE_HOTKEY, true), ['⌘', '⌥', 'U']);
  assert.deepEqual(hotkeyCaps(APPEARANCE_HOTKEY, false), ['Ctrl', 'Alt', 'U']);
  assert.deepEqual(hotkeyCaps({modifiers: ['Mod', 'Ctrl', 'Shift'], key: 'ArrowUp'}, false), ['Ctrl', 'Shift', '↑']);
  assert.deepEqual(hotkeyCaps({modifiers: ['Meta'], key: 'Escape'}, false), ['Win', 'Esc']);
  const app = {hotkeyManager: {customKeys: {}}};
  assert.deepEqual(shortcutHints(app, true, 'nebula-focus')[0].keys, [['⌘', '⌥', 'U']]);
  app.hotkeyManager.customKeys['nebula-focus:toggle-reading-ui'] = [{modifiers: ['Mod', 'Shift'], key: 'h'}];
  assert.deepEqual(shortcutHints(app, true, 'nebula-focus')[0].keys, [['⌘', '⇧', 'H']]);
  app.hotkeyManager.customKeys['nebula-focus:toggle-reading-ui'] = [];
  assert.deepEqual(shortcutHints(app, true, 'nebula-focus')[0].keys, []);
});

test('a literal space is a valid custom hotkey and displays a readable Space keycap', () => {
  const binding = {modifiers: ['Mod', 'Alt'], key: ' '};
  const app = {hotkeyManager: {customKeys: {'nebula-focus:toggle-reading-ui': [binding]}}};
  assert.deepEqual(commandHotkeys(app, 'nebula-focus:toggle-reading-ui', [APPEARANCE_HOTKEY]), [binding]);
  assert.deepEqual(shortcutHints(app, true, 'nebula-focus')[0].keys, [['⌘', '⌥', 'Space']]);
  assert.deepEqual(shortcutHints(app, false, 'nebula-focus')[0].keys, [['Ctrl', 'Alt', 'Space']]);
});

test('Mac hold opens after 600 ms, preserves typing focus and selection, and releases without input interception', t => {
  const f = fixture(t), original = f.input.value;
  const down = f.press(); f.tick(599); assert.equal(f.panel(), null);
  f.tick(1); const panel = f.panel(); assert.ok(panel);
  assert.equal(panel.getAttribute('role'), 'region');
  assert.equal(panel.querySelectorAll('dl.bui-shortcut-guide-list > .bui-shortcut-guide-row').length, 6);
  assert.equal(panel.querySelectorAll('dt.bui-shortcut-guide-label').length, 6);
  assert.equal(panel.querySelectorAll('dd.bui-shortcut-guide-bindings').length, 6);
  assert.match(panel.textContent, /优化 \/ 原生外观/);
  assert.equal(f.doc.activeElement, f.input);
  assert.equal(f.input.value, original); assert.equal(f.input.selectionStart, 2); assert.equal(f.input.selectionEnd, 5);
  assert.equal(down.defaultPrevented, false);
  const up = f.release(); assert.equal(up.defaultPrevented, false); assert.equal(f.panel(), null);
  assert.equal(panel.getAttribute('aria-hidden'), 'true'); assert.equal(panel.inert, true);
  f.tick(160); assert.equal(f.doc.querySelector('.bui-shortcut-guide'), null);
  assert.equal(f.observers[0].disconnected, true); assert.equal(f.timers.size, 0);
});

test('Windows uses Ctrl, while Command on Windows and Ctrl on Mac do not open the guide', t => {
  const windows = fixture(t, {mac: false});
  windows.key('keydown', 'Meta', {metaKey: true}); windows.tick(900); assert.equal(windows.panel(), null);
  windows.key('keyup', 'Meta'); windows.press(); windows.tick(600);
  assert.ok(windows.panel()); assert.match(windows.panel().textContent, /CtrlAltU/); assert.match(windows.panel().textContent, /松开 Ctrl/);
  const mac = fixture(t);
  mac.key('keydown', 'Control', {ctrlKey: true}); mac.tick(900); assert.equal(mac.panel(), null);
  mac.key('keyup', 'Control'); mac.press(); mac.tick(600); assert.ok(mac.panel());
});

test('short taps and repeat-only input never flash a guide, held repeats do not restart its timer', t => {
  const f = fixture(t);
  f.press(); f.tick(500); f.release(); f.tick(1000); assert.equal(f.panel(), null); assert.equal(f.timers.size, 0);
  f.press({repeat: true}); f.tick(1000); assert.equal(f.panel(), null); f.release();
  f.press(); f.tick(300); f.press({repeat: true}); f.tick(300);
  assert.ok(f.panel()); assert.equal(f.doc.querySelectorAll('.bui-shortcut-guide').length, 1);
});

test('normal shortcut chords stay native and suppress help until the primary modifier is released', t => {
  const f = fixture(t), delivered = [];
  f.input.addEventListener('keydown', event => delivered.push(event.key));
  f.press(); f.tick(300);
  const alt = f.key('keydown', 'Alt', {metaKey: true, altKey: true});
  const action = f.key('keydown', 'u', {metaKey: true, altKey: true});
  assert.equal(alt.defaultPrevented, false); assert.equal(action.defaultPrevented, false);
  assert.deepEqual(delivered, ['Meta', 'Alt', 'u']);
  f.key('keyup', 'u', {metaKey: true}); f.key('keyup', 'Alt', {metaKey: true}); f.tick(1000); assert.equal(f.panel(), null);
  f.press(); f.tick(1000); assert.equal(f.panel(), null);
  f.release(); f.press(); f.tick(600); assert.ok(f.panel());
  const escape = f.key('keydown', 'Escape', {metaKey: true}); assert.equal(escape.defaultPrevented, false); assert.equal(f.panel(), null);
});

test('Mac Command release recovers from a missing letter keyup before the next hold', t => {
  const f = fixture(t);
  f.press(); f.key('keydown', 'u', {metaKey: true}); f.tick(700); assert.equal(f.panel(), null);
  // macOS may omit u's keyup while Command is down. Releasing Command must
  // clear the stale chord key; the next genuine hold should still work.
  f.release(); f.press(); f.tick(600); assert.ok(f.panel());
  assert.equal(f.doc.querySelectorAll('.bui-shortcut-guide').length, 1);
});

test('other keys held first, mixed modifiers and composition cannot start the timer', t => {
  const f = fixture(t);
  for (const options of [{altKey: true}, {shiftKey: true}, {ctrlKey: true}, {isComposing: true}]) {
    f.press(options); f.tick(1000); assert.equal(f.panel(), null); f.release();
  }
  f.key('keydown', 'x'); f.press(); f.tick(1000); assert.equal(f.panel(), null);
  f.key('keyup', 'x'); f.release(); f.press(); f.tick(600); assert.ok(f.panel());
});

test('IME, beforeinput and pointer interactions cancel pending or visible help without cancelling those events', t => {
  for (const type of ['compositionstart', 'beforeinput', 'pointerdown']) {
    const f = fixture(t);
    f.press(); f.tick(300); assert.equal(f.dispatch(type).defaultPrevented, false);
    f.tick(600); assert.equal(f.panel(), null);
    f.guide.reset(); f.press(); f.tick(600); assert.ok(f.panel());
    assert.equal(f.dispatch(type).defaultPrevented, false); assert.equal(f.panel(), null);
  }
  const f = fixture(t);
  f.dispatch('pointerdown'); f.press(); f.tick(600); assert.equal(f.panel(), null);
  f.dispatch('pointerup'); f.tick(600); assert.equal(f.panel(), null);
  f.release(); f.press(); f.tick(600); assert.ok(f.panel());
  f.release(); f.tick(160); f.dispatch('compositionstart'); f.press(); f.tick(600); assert.equal(f.panel(), null);
  f.dispatch('compositionend'); f.release(); f.press(); f.tick(600); assert.ok(f.panel());
});

test('blur, hidden documents, focus changes and disposal clear UI and never leave active timers', t => {
  const f = fixture(t);
  f.press(); f.tick(600); f.dispatch('blur', f.win); assert.equal(f.doc.querySelector('.bui-shortcut-guide'), null);
  f.press(); f.tick(600); Object.defineProperty(f.doc, 'hidden', {configurable: true, value: true});
  f.dispatch('visibilitychange'); assert.equal(f.doc.querySelector('.bui-shortcut-guide'), null);
  Object.defineProperty(f.doc, 'hidden', {configurable: true, value: false});
  f.press(); f.tick(600); f.doc.querySelector('section').focus(); assert.equal(f.panel(), null); f.release(); f.tick(160);
  f.press(); f.tick(300); f.guide.dispose(); f.tick(1000); assert.equal(f.panel(), null); assert.equal(f.timers.size, 0);
  f.press(); f.tick(1000); assert.equal(f.panel(), null);
});

test('navigation, detached origins and modal dialogs suppress stale help', t => {
  const f = fixture(t), original = f.state.target;
  f.press(); f.state.target = null; f.tick(600); assert.equal(f.panel(), null); f.release();
  f.state.target = original; f.press(); f.tick(600); assert.ok(f.panel());
  f.state.target = null; f.dispatch('resize', f.win); assert.equal(f.doc.querySelector('.bui-shortcut-guide'), null); f.release();
  f.state.target = original; const modal = f.doc.createElement('div'); modal.className = 'modal-container'; f.doc.body.append(modal);
  f.press(); f.tick(600); assert.equal(f.panel(), null); f.release(); modal.remove();
  f.press(); original.remove(); f.tick(600); assert.equal(f.panel(), null);
});

test('sheet follows the visible active pane, including narrow panes and visual viewport clipping', t => {
  const f = fixture(t); f.press(); f.tick(600); const panel = f.panel();
  assert.equal(panel.style.width, '520px'); assert.equal(panel.style.left, '340px');
  assert.equal(panel.style.bottom, '60px'); assert.equal(panel.style.maxHeight, '616px');
  assert.equal(panel.classList.contains('bui-shortcut-guide-narrow'), false);
  f.state.rect = {left: 500, right: 900, top: 80, bottom: 720}; f.observers[0].run();
  assert.equal(panel.style.width, '376px'); assert.equal(panel.style.left, '512px');
  assert.equal(panel.classList.contains('bui-shortcut-guide-narrow'), true);
  const viewport = new f.win.EventTarget(); Object.assign(viewport, {offsetLeft: 550, offsetTop: 100, width: 300, height: 400});
  Object.defineProperty(f.win, 'visualViewport', {value: viewport}); f.dispatch('resize', f.win);
  assert.equal(panel.style.width, '276px'); assert.equal(panel.style.left, '562px');
  assert.equal(panel.style.bottom, '280px'); assert.equal(panel.style.maxHeight, '376px');
  f.state.rect = {left: 0, right: 90, top: 0, bottom: 70}; f.dispatch('resize', f.win);
  assert.equal(f.doc.querySelector('.bui-shortcut-guide'), null);
});

test('reduced motion closes immediately; retiring panels cannot remove a later fresh sheet', t => {
  const reduced = fixture(t, {reduced: true}); reduced.press(); reduced.tick(600); reduced.release();
  assert.equal(reduced.doc.querySelector('.bui-shortcut-guide'), null); assert.equal(reduced.timers.size, 0);
  const f = fixture(t); f.press(); f.tick(600); const old = f.panel(); f.release();
  f.press(); f.tick(600); const current = f.panel(); assert.ok(current); assert.notEqual(current, old); assert.equal(old.isConnected, false);
  f.tick(1000); assert.equal(f.panel(), current);
  f.release(); f.motion.matches = true; f.motion.dispatchEvent(new f.win.Event('change'));
  assert.equal(f.doc.querySelector('.bui-shortcut-guide'), null); assert.equal(f.timers.size, 0);
});

test('reopening reflects current native/custom bindings and does not write document data', t => {
  const f = fixture(t); f.press(); f.tick(600); assert.match(f.panel().textContent, /⌘⌥U/); f.release(); f.tick(160);
  f.state.app = {hotkeyManager: {customKeys: {'nebula-focus:toggle-reading-ui': []}}}; f.state.status = '当前：原生外观';
  f.press(); f.tick(600); assert.match(f.panel().textContent, /当前：原生外观/); assert.match(f.panel().textContent, /未设置/);
  assert.equal(f.input.value, '中文草稿保持不变'); assert.equal(f.doc.activeElement, f.input);
});
