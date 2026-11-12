const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildSync}=require('esbuild');
const {JSDOM}=require('jsdom');
class NumberValue{constructor(value){this.value=value;}toString(){return String(this.value);}}
class StringValue{constructor(value){this.value=value;}toString(){return String(this.value);}}
class BooleanValue{constructor(value){this.value=value;}toString(){return String(this.value);}}
class NullValue{}
const code=buildSync({entryPoints:['src/home-summary.ts'],bundle:true,write:false,platform:'node',format:'cjs',external:['obsidian']}).outputFiles[0].text;
const mod={exports:{}};
new Function('module','exports','require',code)(mod,mod.exports,name=>{assert.equal(name,'obsidian');return{NumberValue,StringValue,BooleanValue,NullValue};});
const {homeQueryEntries,summarizeHome,renderHomeSummary}=mod.exports;
let id=0;
const entry=values=>({file:{path:`records/${++id}.md`},getValue:property=>values[property]});
const rows=values=>values.map(value=>entry({'note.金额':value}));
const summary=(values,operation='sum',extra={})=>summarizeHome(rows(values),{operation,property:'金额',...extra});

// These fixtures never touch the real vault or rewrite .base/Markdown data.
test('native current query filters are authoritative and virtual rows or controller results cannot widen totals',()=>{
  const one=entry({'note.金额':1}),two=entry({'note.金额':2}),three=entry({'note.金额':3});
  const filtered=Object.freeze([one,two]);
  const view={queryData:{data:filtered},queryController:{queryData:{data:[three]},results:new Map([['three',three]])},data:{data:[three]},rows:[{entry:one}]};
  assert.deepEqual(homeQueryEntries(view),[one,two]);
  assert.equal(summarizeHome(homeQueryEntries(view),{operation:'sum',property:'金额'}).groups[0].value,'3');
  delete view.queryData;assert.deepEqual(homeQueryEntries(view),[three]);
  delete view.queryController.queryData;assert.deepEqual(homeQueryEntries(view),[three]);
  delete view.data;assert.equal(homeQueryEntries(view),null);
  assert.deepEqual(filtered,[one,two]);
});

test('unknown, partial, sparse, duplicate and unloaded query data never masquerades as a complete empty result',()=>{
  const item=entry({});
  for(const view of [null,{}, {rows:[]},{queryData:{}},{queryData:{data:[undefined]}},{queryData:{data:new Array(2)}},
    {queryData:{data:[item,item]}},{queryData:{data:[{file:{path:'x'}}]}},{queryData:{data:[{file:{path:''},getValue(){}}]}},
    {_loaded:false,queryData:{data:[]}},{queryData:{data:null},data:{data:[]}},{get queryData(){throw Error('pending');}}])
    assert.equal(homeQueryEntries(view),null);
  assert.deepEqual(homeQueryEntries({queryData:{data:[]}}),[]);
  assert.deepEqual(homeQueryEntries({queryData:null,queryController:{queryData:{data:[]}}}),[]);
});

test('count requires no numeric property and never reads one; empty count is zero',()=>{
  const items=Array.from({length:3},()=>({file:{path:`${++id}.md`},getValue(){throw Error('must not read');}}));
  const result=summarizeHome(items,{operation:'count'});
  assert.equal(result.groups[0].value,'3');assert.equal(result.groups[0].available,true);assert.equal(result.included,3);assert.equal(result.excluded,0);
  assert.equal(summarizeHome([],{operation:'count'}).groups[0].value,'0');
  assert.equal(summarizeHome([],{operation:'sum',property:'金额'}).groups[0].value,'未取得');
  assert.equal(summarizeHome([],{operation:'average',property:'金额'}).groups[0].available,false);
});

test('decimal sum and average avoid floating point addition artefacts and preserve zero and signed values',()=>{
  assert.equal(summary([0.1,new NumberValue(0.2)]).groups[0].value,'0.3');
  assert.equal(summary([0.1,0.2],'average').groups[0].value,'0.15');
  assert.equal(summary([0,-2.5,1.2]).groups[0].value,'−1.3');
  assert.equal(summary([0]).groups[0].value,'0');
  assert.equal(summary([1.2e-7,2.3e-7]).groups[0].value,'0.00000035');
  assert.equal(summary([1e12,0.125]).groups[0].value,'1000000000000.125');
  const rounded=summary([1,0,0],'average').groups[0];assert.equal(rounded.value,'0.33333333');assert.equal(rounded.approximate,true);
  assert.equal(summary([1,2],'average').groups[0].approximate,false);
  assert.equal(summary([-1,0,0],'average').groups[0].value,'−0.33333333');
  const tiny=summary([1e-12,0,0],'average').groups[0];assert.equal(tiny.value,'3.33333333e-13');assert.equal(tiny.approximate,true);
});

test('only real numbers are included; text, nulls, unresolved formulas, arrays and unsafe numeric values stay visible as exclusions',()=>{
  const values=[null,undefined,new NullValue(), '12',new StringValue('12'),'formulaResult://pending',true,[],{}, {data:123},NaN,Infinity,Number.MAX_SAFE_INTEGER+1,new NumberValue(-Infinity),0,12];
  const result=summary(values);
  assert.equal(result.rows,16);assert.equal(result.included,2);assert.equal(result.excluded,14);assert.equal(result.groups[0].value,'12');
  assert.deepEqual(result.issues,{missing:3,invalid:7,unsafe:4});
  const none=summary([undefined,'12',Infinity]);assert.equal(none.groups[0].value,'未取得');assert.equal(none.groups[0].available,false);
});

test('unsafe final totals cannot become an apparently precise number while large safe averages and cancellation remain exact',()=>{
  const tooLarge=summary([Number.MAX_SAFE_INTEGER,1]);
  assert.equal(tooLarge.groups[0].value,'未取得');assert.equal(tooLarge.groups[0].available,false);assert.equal(tooLarge.groups[0].error,'unsafe-total');
  assert.equal(summary([Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER],'average').groups[0].value,String(Number.MAX_SAFE_INTEGER));
  assert.equal(summary([Number.MAX_SAFE_INTEGER,1,-Number.MAX_SAFE_INTEGER]).groups[0].value,'1');
});

test('currency and other scalar groups remain independent, with missing and invalid grouping reported explicitly',()=>{
  const items=[entry({'note.金额':0.1,'note.币种':'CNY'}),entry({'note.金额':0.2,'note.币种':new StringValue('CNY')}),
    entry({'note.金额':20,'note.币种':'USD'}),entry({'note.金额':null,'note.币种':'JPY'}),entry({'note.金额':3}),entry({'note.金额':2,'note.币种':['CNY','USD']})];
  const result=summarizeHome(items,{operation:'sum',property:'金额',groupBy:'币种'});
  assert.deepEqual(result.groups.map(g=>[g.label,g.value,g.count,g.excluded]),[['CNY','0.3',2,0],['USD','20',1,0],['JPY','未取得',0,1],['未分组','3',1,0]]);
  assert.equal(result.excluded,2);assert.equal(result.issues['invalid-group'],1);
  const counts=summarizeHome(items,{operation:'count',groupBy:'币种'});assert.deepEqual(counts.groups.map(g=>g.value),['2','1','1','1']);
  const badNativeGroup=summarizeHome([entry({'note.币种':new NumberValue(Infinity)})],{operation:'count',groupBy:'币种'});
  assert.equal(badNativeGroup.issues['invalid-group'],1);assert.equal(badNativeGroup.groups.length,0);
});

test('formula property identifiers pass through unchanged and thrown getters report unavailable without propagating',()=>{
  const read=[];
  const items=[{file:{path:'a'},getValue(key){read.push(key);return key==='formula.净额'?new NumberValue(2):'CNY';}}];
  assert.equal(summarizeHome(items,{operation:'sum',property:'formula.净额',groupBy:'note.币种'}).groups[0].value,'2');
  assert.deepEqual(read,['note.币种','formula.净额']);
  const broken={file:{path:'broken'},getValue(){throw Error('temporarily unavailable');}};
  const result=summarizeHome([...items,broken],{operation:'sum',property:'formula.净额'});
  assert.equal(result.error,'read-error');assert.equal(result.issues['read-error'],1);assert.ok(result.groups.every(group=>group.value==='未取得'));
  assert.equal(summarizeHome(items,{operation:'sum'}).error,'invalid-options');
});

function host(){
  const dom=new JSDOM('<main></main>');dom.window.document.win=dom.window;
  dom.window.createEl=tag=>dom.window.document.createElement(tag);dom.window.createFragment=()=>dom.window.document.createDocumentFragment();
  return{dom,el:dom.window.document.querySelector('main')};
}
test('summary renderer uses literal labels, keeps unchanged nodes and expanded exclusions, and clears stale totals on query errors',()=>{
  const f=host();try{
    const result=summarizeHome([entry({'note.金额':1,'note.币种':'<img src=x>'}),entry({'note.金额':null,'note.币种':'<img src=x>'})],{operation:'average',property:'金额',groupBy:'币种'});
    renderHomeSummary(f.el,result);assert.equal(f.el.querySelector('img'),null);assert.equal(f.el.querySelector('dt').textContent,'<img src=x>');
    assert.match(f.el.textContent,/当前筛选 · 2 条 · 1 条计入/);assert.match(f.el.textContent,/1 条未计入/);
    const label=f.el.querySelector('dt'),details=f.el.querySelector('details');details.open=true;
    renderHomeSummary(f.el,result);assert.equal(f.el.querySelector('dt'),label);assert.equal(f.el.querySelector('details'),details);
    const changed=summary([1,0,0,null],'average');renderHomeSummary(f.el,changed);
    assert.equal(f.el.querySelector('details').open,true);assert.equal(f.el.querySelector('.nf-home-summary-value').textContent,'≈0.33333333');
    const broken=summarizeHome([{file:{path:'b'},getValue(){throw Error('x');}}],{operation:'sum',property:'金额'});
    renderHomeSummary(f.el,broken);assert.equal(f.el.querySelector('dd'),null);assert.match(f.el.textContent,/未取得/);
    renderHomeSummary(f.el,summarizeHome([],{operation:'count',groupBy:'币种'}));assert.match(f.el.textContent,/0 条/);
  }finally{f.dom.window.close();}
});

test('an identical summary restores its rendering after another lifecycle replaces or clears the output',()=>{
  const f=host();try{
    const result=summary([0.1,0.2]);renderHomeSummary(f.el,result);const initial=f.el.querySelector('dd');
    const unavailable=f.dom.window.document.createElement('p');unavailable.textContent='暂未取得数据';f.el.replaceChildren(unavailable);
    renderHomeSummary(f.el,result);assert.equal(f.el.querySelector('dd').textContent,'0.3');assert.notEqual(f.el.querySelector('dd'),initial);
    f.el.replaceChildren();renderHomeSummary(f.el,result);assert.equal(f.el.querySelector('dd').textContent,'0.3');
    const unchanged=f.el.querySelector('dd');renderHomeSummary(f.el,result);assert.equal(f.el.querySelector('dd'),unchanged);
  }finally{f.dom.window.close();}
});
