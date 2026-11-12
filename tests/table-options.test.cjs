const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildSync}=require('esbuild');
function load(path) {const mod={exports:{}};new Function('module','exports',buildSync({entryPoints:[path],bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text)(mod,mod.exports);return mod.exports;}
const {tableContentOptions}=load('src/table-options.ts');
const {tableProfile}=load('src/table-profile.ts');
test('enhanced view settings offer wrap or fold; plain tables retain native controls',()=>{
  const height={key:'rowHeight',type:'dropdown',options:{short:'Short'}};
  const original=[{type:'group',items:[height,{key:'other'}]}];
  assert.equal(tableContentOptions(original,{name:'Ordinary'}),original);
  const changed=tableContentOptions(original,{name:'想法收集箱'});
  assert.equal(changed[0].items[0].key,'nebulaRowMode');assert.equal(changed[0].items[0].default,'wrap');
  assert.equal(original[0].items[0],height);assert.equal(changed[0].items[1],original[0].items[1]);
  for (const mode of ['wrap','clip']) {
    assert.equal(tableProfile({name:'想法收集箱',nebulaRowMode:mode}).wrap,mode==='wrap');
    assert.equal(tableProfile({name:'想法收集箱',get:key=>key==='nebulaRowMode'?mode:undefined}).wrap,mode==='wrap');
  }
});
