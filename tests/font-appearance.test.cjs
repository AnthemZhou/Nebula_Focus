const {test} = require('node:test');
const assert = require('node:assert/strict');
const {buildSync} = require('esbuild');
const {JSDOM} = require('jsdom');
const code = buildSync({entryPoints: ['src/font-appearance.ts'], bundle: true, platform: 'node', format: 'cjs', write: false}).outputFiles[0].text;
const mod = {exports: {}};
new Function('module', 'exports', code)(mod, mod.exports);
const {FontAppearance, BUNDLED_FONT_CLASS, BUNDLED_FONT_FAMILY, CODEX_FONT_CLASS, readFontChoice} = mod.exports;
const settle = () => new Promise(resolve => setImmediate(resolve));

function renderer() {
  const dom = new JSDOM('<!doctype html><body></body>');
  const doc = dom.window.document, pending = [], faces = new Set(), additions = [], removals = [];
  class Font {
    constructor(family, source, descriptors) {
      this.family = family; this.source = source; this.descriptors = descriptors;
      this.promise = new Promise((resolve, reject) => {this.resolve = () => resolve(this); this.reject = reject;});
      pending.push(this);
    }
    load() {return this.promise;}
  }
  dom.window.FontFace = Font;
  Object.defineProperty(doc, 'fonts', {value: {
    add(face) {faces.add(face); additions.push(face);},
    delete(face) {removals.push(face); return faces.delete(face);},
  }});
  return {dom, doc, pending, faces, additions, removals, enabled: () => doc.body.classList.contains(BUNDLED_FONT_CLASS), close: () => dom.window.close()};
}

function controller() {
  const events = {changes: 0, failures: []};
  const font = new FontAppearance('data:font/woff2;base64,dGVzdA==', () => events.changes++, error => events.failures.push(error));
  return {font, events};
}

test('unknown saved font choices fall back to Obsidian; the default never loads a font', () => {
  for (const value of [undefined, null, '', 'custom', 1, {}, 'default']) assert.equal(readFontChoice(value), 'default');
  assert.equal(readFontChoice('lxgw-wenkai'), 'lxgw-wenkai');
  assert.equal(readFontChoice('codex-system'), 'codex-system');
  const r = renderer(), {font, events} = controller();
  try {
    font.sync(r.doc, false); font.sync(r.doc, false);
    assert.equal(r.pending.length, 0); assert.equal(r.enabled(), false);
    assert.equal(events.changes, 0); assert.deepEqual(events.failures, []);
  } finally {font.destroy(); r.close();}
});

test('Codex system font needs no font load and survives a pending WenKai load without reactivation', async () => {
  const r = renderer(), other = renderer(), {font, events} = controller();
  try {
    font.sync(r.doc, 'codex-system');
    assert.equal(r.pending.length, 0);
    assert.equal(r.doc.body.classList.contains(CODEX_FONT_CLASS), true);
    font.sync(r.doc, true);
    assert.equal(r.doc.body.classList.contains(CODEX_FONT_CLASS), false);
    font.sync(r.doc, 'codex-system');
    r.pending[0].resolve(); await settle();
    assert.equal(r.enabled(), false);
    assert.equal(r.doc.body.classList.contains(CODEX_FONT_CLASS), true);
    font.sync(r.doc, false);
    assert.equal(r.doc.body.classList.contains(CODEX_FONT_CLASS), false);
    font.sync(other.doc, 'codex-system');
    font.destroy();
    assert.equal(other.doc.body.classList.contains(CODEX_FONT_CLASS), false);
    assert.deepEqual(events.failures, []);
  } finally {font.destroy(); r.close(); other.close();}
});

test('selected font applies only after decoding and cached selection toggles without reloading', async () => {
  const r = renderer(), {font, events} = controller();
  try {
    font.sync(r.doc, true); font.sync(r.doc, true);
    assert.equal(r.pending.length, 1); assert.equal(r.enabled(), false);
    assert.equal(r.pending[0].family, BUNDLED_FONT_FAMILY);
    assert.match(r.pending[0].source, /^url\("data:font\/woff2;base64,/);
    assert.equal(r.pending[0].descriptors.weight, '400');
    r.pending[0].resolve(); await settle();
    assert.equal(r.enabled(), true); assert.equal(r.faces.size, 1); assert.equal(events.changes, 1);
    font.sync(r.doc, true); assert.equal(events.changes, 1);
    font.sync(r.doc, false); assert.equal(r.enabled(), false); assert.equal(events.changes, 2);
    font.sync(r.doc, true); assert.equal(r.enabled(), true); assert.equal(events.changes, 3);
    assert.equal(r.pending.length, 1); assert.deepEqual(events.failures, []);
  } finally {font.destroy(); assert.equal(r.faces.size, 0); assert.equal(r.enabled(), false); r.close();}
});

test('a font finishing after switching to native appearance cannot restore enhanced typography', async () => {
  const r = renderer(), {font, events} = controller();
  try {
    font.sync(r.doc, true); font.sync(r.doc, false);
    r.pending[0].resolve(); await settle();
    assert.equal(r.enabled(), false); assert.equal(events.changes, 0);
    font.sync(r.doc, true);
    assert.equal(r.enabled(), true); assert.equal(r.pending.length, 1); assert.equal(events.changes, 1);
  } finally {font.destroy(); r.close();}
});

test('destroy during decoding ignores late completion and future sync attempts', async () => {
  const r = renderer(), {font, events} = controller();
  try {
    font.sync(r.doc, true); font.destroy();
    r.pending[0].resolve(); await settle(); font.sync(r.doc, true);
    assert.equal(r.enabled(), false); assert.equal(r.additions.length, 0);
    assert.equal(r.pending.length, 1); assert.equal(events.changes, 0); assert.deepEqual(events.failures, []);
  } finally {font.destroy(); r.close();}
});

test('each renderer owns its font; closing one window leaves the other renderer intact', async () => {
  const first = renderer(), second = renderer(), {font, events} = controller();
  try {
    font.sync(first.doc, true); font.sync(second.doc, true);
    first.pending[0].resolve(); await settle();
    assert.equal(first.enabled(), true); assert.equal(second.enabled(), false);
    second.pending[0].resolve(); await settle();
    assert.equal(second.enabled(), true); assert.notEqual(first.pending[0], second.pending[0]);
    font.forget(first.doc);
    assert.equal(first.enabled(), false); assert.equal(first.faces.size, 0);
    assert.equal(second.enabled(), true); assert.equal(second.faces.size, 1);
    font.destroy();
    assert.equal(second.enabled(), false); assert.equal(second.faces.size, 0);
    assert.deepEqual(events.failures, []);
  } finally {font.destroy(); first.close(); second.close();}
});

test('forgetting a loading renderer cannot affect a later load for the same document', async () => {
  const r = renderer(), {font, events} = controller();
  try {
    font.sync(r.doc, true); font.forget(r.doc); font.sync(r.doc, true);
    assert.equal(r.pending.length, 2);
    r.pending[0].resolve(); await settle();
    assert.equal(r.additions.length, 0); assert.equal(r.enabled(), false);
    r.pending[1].resolve(); await settle();
    assert.deepEqual(r.additions, [r.pending[1]]); assert.equal(r.enabled(), true);
    assert.equal(events.changes, 1);
  } finally {font.destroy(); r.close();}
});

test('load failure keeps the native font and permits an explicit later retry', async () => {
  const r = renderer(), {font, events} = controller();
  try {
    font.sync(r.doc, true);
    const failure = new Error('font decode failed'); r.pending[0].reject(failure); await settle();
    assert.equal(r.enabled(), false); assert.equal(r.faces.size, 0); assert.equal(events.changes, 0);
    assert.deepEqual(events.failures, [failure]);
    for (let i = 0; i < 5; i++) font.sync(r.doc, true);
    assert.equal(r.pending.length, 1); assert.deepEqual(events.failures, [failure]);
    font.sync(r.doc, false); font.sync(r.doc, true);
    assert.equal(r.pending.length, 2);
    r.pending[1].resolve(); await settle(); assert.equal(r.enabled(), true);
  } finally {font.destroy(); r.close();}
});

test('missing font APIs fail safely and failures after unloading are ignored', async () => {
  const unsupported = renderer(), loading = renderer(), {font, events} = controller();
  try {
    unsupported.dom.window.FontFace = undefined;
    font.sync(unsupported.doc, false); assert.deepEqual(events.failures, []);
    font.sync(unsupported.doc, true);
    assert.equal(unsupported.enabled(), false); assert.equal(events.failures.length, 1);
    font.sync(loading.doc, true); font.destroy();
    loading.pending[0].reject(new Error('late failure')); await settle();
    assert.equal(events.failures.length, 1); assert.equal(loading.enabled(), false);
  } finally {font.destroy(); unsupported.close(); loading.close();}
});
