const {test} = require('node:test');
const assert = require('node:assert/strict');
const {buildSync} = require('esbuild');
const loaded = {exports: {}};
new Function('module', 'exports', buildSync({entryPoints:['src/idea-native.ts'],bundle:true,write:false,
  platform:'node',format:'cjs'}).outputFiles[0].text)(loaded, loaded.exports);
const {isIdeaView, isIdeaViewMetadata, isIdeaCell, isNativeTableView} = loaded.exports;

test('native table guards opt in through a profile instead of a special view name', () => {
  const nebulaTable = {titleColumn:'formula.流水',titleProperty:'流水摘要',tags:{交易类型:'single'},wrap:true,attachments:[]};
  const view = {type:'table',config:{name:'收支流水',nebulaTable},rows:[]};
  assert.equal(isIdeaView(view),true);
  view.config.name='自定义视图';assert.equal(isIdeaView(view),true);
  delete view.config.nebulaTable;assert.equal(isIdeaView(view),false);
  view.config.get=key=>key==='nebulaTable'?nebulaTable:undefined;assert.equal(isIdeaView(view),true);
  view.type='cards';assert.equal(isIdeaView(view),false);
});

test('structural native-table guard permits file-name title controls without opting into idea tags or rows',()=>{
  const view={type:'table',config:{name:'发布记录'},rows:[]};
  assert.equal(isNativeTableView(view),true);assert.equal(isIdeaView(view),false);
  view.rows=[{cells:[{renderer:{entry:42}}]}];assert.equal(isNativeTableView(view),false);
  view.rows=[];view.type='cards';assert.equal(isNativeTableView(view),false);
});

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
