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
  assert.equal(original[0].items[0],height);assert.equal(changed[0].items[2],original[0].items[1]);
  assert.deepEqual(changed[0].items[1],{type:'text',key:'nebulaScopeNote',displayName:'视图说明',default:''});
  for (const mode of ['wrap','clip']) {
    assert.equal(tableProfile({name:'想法收集箱',nebulaRowMode:mode}).wrap,mode==='wrap');
    assert.equal(tableProfile({name:'想法收集箱',get:key=>key==='nebulaRowMode'?mode:undefined}).wrap,mode==='wrap');
  }
});

test('view description is a native text option with inherited, overridden and cleared defaults',()=>{
  const profile={titleColumn:'file.name',titleProperty:'标题',tags:{},wrap:true,attachments:[],scopeNote:'代表性样例，非完整账本'};
  for(const override of [undefined,'我的说明','']) {
    const config={nebulaTable:profile,...(override===undefined?{}:{nebulaScopeNote:override})};
    for(const input of [config,{get:key=>config[key]}]) {
      const [option]=tableContentOptions([],input);
      assert.deepEqual(option,{type:'text',key:'nebulaScopeNote',displayName:'视图说明',default:override??profile.scopeNote});
    }
  }
});

test('nested native layout groups receive one description control and repeated processing stays idempotent',()=>{
  const original=[{type:'group',items:[{key:'rowHeight'}]},{type:'group',items:[{type:'group',items:[{key:'rowHeight'}]}]}];
  const before=JSON.stringify(original);
  const flatten=items=>items.flatMap(item=>[item,...(Array.isArray(item.items)?flatten(item.items):[])]);
  const config={name:'想法收集箱'};
  const changed=tableContentOptions(original,config);
  assert.equal(flatten(changed).filter(item=>item.key==='nebulaScopeNote').length,1);
  assert.equal(flatten(changed).filter(item=>item.key==='nebulaRowMode').length,2);
  assert.deepEqual(tableContentOptions(changed,config),changed);
  assert.equal(JSON.stringify(original),before);
});
