const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {transformSync}=require('esbuild');
const mod={exports:{}};
new Function('module','exports',transformSync(readFileSync('src/drafts.ts','utf8'),{loader:'ts',format:'cjs'}).code)(mod,mod.exports);
const {DraftStore,DraftStoreError,MAX_RECOVERY_DRAFTS,createDraftId}=mod.exports;

function memory(initial) {
  const values=new Map(Object.entries(initial||{})),writes=[];
  return {values,writes,loadLocalStorage:key=>values.get(key),saveLocalStorage(key,value){writes.push({key,value});values.set(key,value);}};
}
const draft=(id,value=id)=>({id,base:'## Title\n\nOriginal',kind:'block',value,start:10,end:18,createdAt:100,updatedAt:100});

test('editing and saving another block cannot remove an earlier recovery draft',()=>{
  const app=memory(),store=new DraftStore(app),key='nebula-focus-draft:Home.md';
  store.upsert(key,draft('cancelled-A','Recovery A'));
  store.upsert(key,draft('saved-B','Saved B'));
  assert.equal(store.remove(key,'saved-B'),true);
  assert.deepEqual(store.list(key).map(d=>[d.id,d.value]),[['cancelled-A','Recovery A']]);
  assert.equal(store.remove(key,'missing'),false);
});

test('same-session updates retain identity and creation time without duplicating drafts',()=>{
  const app=memory(),store=new DraftStore(app),key='draft';
  store.upsert(key,draft('active','First'));
  const replacement={...draft('active','First\n\nPasted'),kind:'replacement',createdAt:999,updatedAt:1000};
  const saved=store.upsert(key,replacement);
  assert.equal(saved.createdAt,100);
  assert.equal(store.list(key).length,1);
  assert.equal(store.list(key)[0].kind,'replacement');
  assert.equal(store.remove(key,'active',{base:replacement.base,kind:'block',value:'First'}),false);
  assert.equal(store.remove(key,'active',replacement),true);
  assert.equal(app.values.get(key),null);
});

test('legacy single drafts migrate lazily without losing section index or offsets',()=>{
  for(const legacy of [
    {base:'Original',kind:'section',value:'Old section recovery',index:2},
    {base:'Original',kind:'block',value:'Old block recovery',start:0,end:8},
    {base:'Original',value:'Older recovery'},
  ]) {
    const app=memory({key:legacy}),store=new DraftStore(app);
    const first=store.list('key')[0];assert.equal(first.id,'legacy-v1');assert.equal(first.createdAt,0);
    assert.equal(first.value,legacy.value);assert.equal(first.index,legacy.index);assert.equal(first.start,legacy.start);
    assert.equal(app.writes.length,0);
    store.upsert('key',draft('new'));
    assert.equal(app.values.get('key').version,2);
    assert.deepEqual(store.list('key').map(d=>d.id),['new','legacy-v1']);
    store.remove('key','new');assert.equal(store.list('key')[0].value,legacy.value);
  }
});

test('capacity rejects new drafts without evicting unrecovered text, but allows updates and deletion',()=>{
  const app=memory(),store=new DraftStore(app);
  for(let i=0;i<MAX_RECOVERY_DRAFTS;i++)store.upsert('key',draft(String(i)));
  const snapshot=JSON.stringify(app.values.get('key')),count=app.writes.length;
  assert.throws(()=>store.upsert('key',draft('overflow')),e=>e instanceof DraftStoreError && e.code==='full');
  assert.equal(JSON.stringify(app.values.get('key')),snapshot);assert.equal(app.writes.length,count);
  store.upsert('key',draft('0','Still recoverable'));assert.equal(store.list('key').find(d=>d.id==='0').value,'Still recoverable');
  store.remove('key','1');store.upsert('key',draft('overflow'));
  assert.equal(store.list('key').length,MAX_RECOVERY_DRAFTS);
});

test('multiple page instances read current storage and return isolated records',()=>{
  const app=memory(),first=new DraftStore(app),second=new DraftStore(app);
  const original=draft('A');first.upsert('key',original);original.value='Changed caller object';
  second.upsert('key',draft('B'));first.upsert('key',draft('A','Updated A'));
  const loaded=first.list('key');loaded[0].value='Changed returned object';loaded.pop();
  assert.deepEqual(second.list('key').map(d=>d.value),['Updated A','B']);
  first.upsert('other-file',draft('A','Other file'));
  assert.equal(second.list('key').length,2);assert.equal(second.list('other-file')[0].value,'Other file');
});

test('malformed, duplicate-ID and future caches are not overwritten',()=>{
  for(const raw of [
    'invalid',[],{version:3,drafts:[]},{version:2,drafts:[draft('A'),draft('A')]},
    {version:2,drafts:[{...draft('A'),start:-1}]},{version:2,drafts:[{...draft('A'),end:1}]},
    {version:2,drafts:[{...draft('A'),createdAt:NaN}]},
  ]) {
    const app=memory({key:raw}),store=new DraftStore(app);
    assert.throws(()=>store.upsert('key',draft('new')),e=>e.code==='invalid');
    assert.throws(()=>store.remove('key','A'),e=>e.code==='invalid');
    assert.equal(app.values.get('key'),raw);assert.equal(app.writes.length,0);
  }
});

test('storage failures remain visible and do not mutate previously loaded draft objects',()=>{
  const app=memory(),store=new DraftStore(app);store.upsert('key',draft('A'));
  const before=JSON.stringify(app.values.get('key'));
  app.saveLocalStorage=()=>{throw Error('Quota exhausted');};
  assert.throws(()=>store.upsert('key',draft('A','Changed')),e=>e.code==='write');
  assert.equal(JSON.stringify(app.values.get('key')),before);
  assert.throws(()=>store.remove('key','A'),e=>e.code==='write');
  app.loadLocalStorage=()=>{throw Error('Storage unavailable');};
  assert.throws(()=>store.upsert('key',draft('B')),e=>e.code==='read');
});

test('session IDs are distinct and empty values remain recoverable',()=>{
  const ids=Array.from({length:100},()=>createDraftId());assert.equal(new Set(ids).size,100);
  const store=new DraftStore(memory());store.upsert('key',{...draft(ids[0],''),start:0,end:0});
  assert.equal(store.list('key')[0].value,'');
});
