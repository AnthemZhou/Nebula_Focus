const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildSync}=require('esbuild');
const {parse}=require('yaml');
const code=buildSync({entryPoints:['src/notion-rule-refresh.ts'],bundle:true,write:false,format:'cjs',platform:'node'}).outputFiles[0].text;
const loaded={exports:{}};
new Function('module','exports','require',code)(loaded,loaded.exports,require);
const {refreshRuleProperties,patchCalculated}=loaded.exports;
const fm=s=>parse(s.split('---')[1]);

function setup(){
  const schema={version:1,sources:{
    accounts:{properties:{Items:{type:'relation',relation:{data_source_id:'entries'}},
      Total:{type:'rollup',rollup:{function:'sum',relation_property_name:'Items',rollup_property_name:'Amount'}}}},
    entries:{properties:{Amount:{type:'number'},Double:{type:'formula',formula:{expression:'prop("Amount") * 2'}},
      Obsolete:{type:'formula',formula:{expression:'ifs(false, 2)'}}}}}};
  const map=new Map(),contents=new Map();let clock=0;
  const put=(path,text)=>{const file=map.get(path)??{path,stat:{}};map.set(path,file);contents.set(file,text);file.stat.mtime=++clock;file.stat.size=text.length;return file;};
  const rules=put('Book/nebula-notion-rules.json',JSON.stringify(schema));
  const account=put('Book/A.md','---\nnf_source_collection: accounts\nItems: ["[[P]]"]\nTotal: 0 # note\n---\nText\n');
  const payment=put('Book/P.md','---\r\nnf_source_collection: entries\r\nAmount: 7 # input\r\nObsolete: 100\r\n---\r\n# Title\r\nUser edits\r\n');
  const elsewhere=put('Other/else.md',contents.get(payment));
  const archive=put('Book/_source/P.md',contents.get(payment));
  put('Book/inner/nebula-notion-rules.json','{}');const nested=put('Book/inner/P.md',contents.get(payment));
  const files=()=>Array.from(map.values()).filter(f=>f.path.endsWith('.md'));
  const listeners=new Set();
  const state={emit:file=>{for(const fn of listeners)fn(file);},before:()=>{},indexed:true,writes:[]};
  const app={vault:{on:(_,fn)=>{listeners.add(fn);return fn;},offref:fn=>listeners.delete(fn),getMarkdownFiles:files,getFileByPath:path=>map.get(path)??null,read:async file=>contents.get(file),
    process:async(file,fn)=>{state.before(file);const next=fn(contents.get(file));put(file.path,next);state.emit(file);state.writes.push(file.path);}},
    metadataCache:{getFileCache:file=>file===payment&&!state.indexed?null:{frontmatter:fm(contents.get(file))},
      getFirstLinkpathDest:link=>link==='P'?payment:null}};
  return {app,rules,account,payment,elsewhere,archive,nested,state,put,contents,schema};
}
test('manual update precomputes all changes, touches calculated YAML only and retries idempotently',async()=>{
  const x=setup(),before=x.contents.get(x.payment),saved=x.contents.get(x.rules);
  assert.equal(await refreshRuleProperties(x.app,x.rules),2);
  assert.equal(x.contents.get(x.account),'---\nnf_source_collection: accounts\nItems: ["[[P]]"]\nTotal: 7 # note\n---\nText\n');
  const next=x.contents.get(x.payment);assert.equal(fm(next).Double,14);assert.ok(!Object.hasOwn(fm(next),'Obsolete'));
  assert.ok(next.includes('Amount: 7 # input\r\n'));assert.ok(next.endsWith('\r\n---\r\n# Title\r\nUser edits\r\n'));
  for(const f of [x.elsewhere,x.archive,x.nested])assert.equal(x.contents.get(f),before);
  assert.equal(x.contents.get(x.rules),saved);assert.equal(await refreshRuleProperties(x.app,x.rules),0);
  x.put(x.payment.path,next.replace('Amount: 7','Amount: 9'));assert.equal(await refreshRuleProperties(x.app,x.rules),2);
  assert.equal(fm(x.contents.get(x.account)).Total,9);assert.equal(fm(x.contents.get(x.payment)).Double,18);
});
test('no partial preflight on missing index, broken links or unsupported formula',async()=>{
  const x=setup();x.state.indexed=false;await assert.rejects(refreshRuleProperties(x.app,x.rules),/索引/);
  x.state.indexed=true;x.app.metadataCache.getFirstLinkpathDest=()=>null;
  await assert.rejects(refreshRuleProperties(x.app,x.rules),/未导入/);assert.deepEqual(x.state.writes,[]);
  x.app.metadataCache.getFirstLinkpathDest=()=>x.payment;
  x.schema.sources.entries.properties.Double.formula.expression='unknownFunction(3)';
  x.put(x.rules.path,JSON.stringify(x.schema));await assert.rejects(refreshRuleProperties(x.app,x.rules),/未支持/);
  assert.deepEqual(x.state.writes,[]);
});
test('input changed mid-batch is preserved, a fresh run repairs previous dependent values',async()=>{
  const x=setup();x.state.before=file=>{
    if(file===x.payment)x.put(file.path,x.contents.get(file).replace('Amount: 7','Amount: 11'));
  };
  await assert.rejects(refreshRuleProperties(x.app,x.rules),/已更新 1 条/);
  assert.equal(fm(x.contents.get(x.payment)).Amount,11);assert.equal(fm(x.contents.get(x.account)).Total,7);
  x.state.before=()=>{};assert.equal(await refreshRuleProperties(x.app,x.rules),2);
  assert.equal(fm(x.contents.get(x.account)).Total,11);assert.equal(fm(x.contents.get(x.payment)).Double,22);
});
test('multiline previous rollup and custom body/comments survive YAML patch',()=>{
  const note='---\na: 3 # user\n# between\n"b":\n  - x\n  - y\nc: |\n  user\n  text\n---\n\nbody\n---\n';
  const next=patchCalculated(note,new Map([['b',['hi','yo']],['数值',12]]));
  assert.ok(next.includes('a: 3 # user\n# between'));assert.ok(next.includes('c: |\n  user\n  text'));
  assert.deepEqual(fm(next).b,['hi','yo']);assert.ok(next.endsWith('---\n\nbody\n---\n'));
});

test('same timestamp and size edits to another input stop a pending write',async()=>{
  const x=setup();
  x.state.before=file=>{
    if(file===x.account){x.contents.set(x.payment,x.contents.get(x.payment).replace('Amount: 7','Amount: 8'));x.state.emit(x.payment);}
  };
  await assert.rejects(refreshRuleProperties(x.app,x.rules),/已更新 0 条/);
  assert.deepEqual(x.state.writes,[]);assert.equal(fm(x.contents.get(x.payment)).Amount,8);
});
