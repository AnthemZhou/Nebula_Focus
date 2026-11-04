const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {transformSync} = require('esbuild');
const loaded = {exports: {}};
new Function('module', 'exports', transformSync(fs.readFileSync('src/idea-native.ts', 'utf8'), {loader:'ts',format:'cjs'}).code)(loaded, loaded.exports);
const {isIdeaView, isIdeaViewMetadata, isIdeaCell} = loaded.exports;

test('native idea guards defer initializing getters and retry the same instance after setup', () => {
  let ready = false;
  const view = {type:'table', get config() {
    if (!ready) throw Error('native config initializing');
    return {name:'想法收集箱'};
  }, rows:[]};
  assert.equal(isIdeaViewMetadata(view), false);
  assert.equal(isIdeaView(view), false);
  ready = true;
  assert.equal(isIdeaViewMetadata(view), true);
  assert.equal(isIdeaView(view), true);
});

test('transient rows and renderer entry getters leave native rendering available', () => {
  let ready = false;
  const cell = {renderer:{get entry() {
    if (!ready) throw Error('native entry initializing');
    return {file:{path:'Example.md'}};
  }}};
  const view = {type:'table', config:{name:'想法收集箱'}, get rows() {
    if (!ready) throw Error('native rows initializing');
    return [{cells:[cell]}];
  }};
  assert.equal(isIdeaCell(cell), false);
  assert.equal(isIdeaView(view), false);
  ready = true;
  assert.equal(isIdeaCell(cell), true);
  assert.equal(isIdeaView(view), true);
});
