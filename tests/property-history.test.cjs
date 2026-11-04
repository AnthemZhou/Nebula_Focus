const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {createHash}=require('node:crypto');
const {transformSync}=require('esbuild');
const mod={exports:{}};
new vm.Script(transformSync(fs.readFileSync('src/property-history.ts','utf8'),{loader:'ts',format:'cjs'}).code)
  .runInContext(vm.createContext({module:mod,exports:mod.exports}));
const {applyPropertyTransaction}=mod.exports;

function fixture(properties=[{}]) {
  const files=properties.map((_,i)=>({path:`Ideas/${i}.md`,extension:'md'}));
  const live=new Map(files.map(file=>[file.path,file]));
  const documents=new Map(files.map((file,i)=>[file,{properties:structuredClone(properties[i]),body:'# 正文\r\n\r\n原文 ![[图.png]]\r\n'}]));
  const calls=[],writes=[];
  const app={vault:{getFileByPath:path=>live.get(path),
      read(){throw Error('Unexpected body read');},modify(){throw Error('Unexpected direct Markdown write');},process(){throw Error('Unexpected direct Markdown write');}},
    fileManager:{async processFrontMatter(file,callback){
      calls.push(file.path);await Promise.resolve();
      app.beforeProcess?.(file);
      const document=documents.get(file),draft=structuredClone(document.properties);
      callback(draft);app.beforeCommit?.(file);
      document.properties=draft;writes.push(file.path);
    }}};
  const view={undoStack:['unchanged undo stack'],redoStack:['unchanged redo stack']};
  return {app,view,files,live,documents,calls,writes,props:file=>documents.get(file).properties};
}

test('undo removes newly introduced keys, redo restores them, and neither history stacks nor body bytes are touched',async()=>{
  const f=fixture([{保留:'原值',这里写想法:'新增想法'}]),file=f.files[0];
  const transaction={changes:[{file,start:{保留:'原值'},end:{保留:'原值',这里写想法:'新增想法'}}]};
  const bodyHash=()=>createHash('sha256').update(f.documents.get(file).body).digest('hex'),before=bodyHash();
  await applyPropertyTransaction(f.app,f.view,transaction,false);
  assert.deepEqual(f.props(file),{保留:'原值'});assert.equal(Object.hasOwn(f.props(file),'这里写想法'),false);
  await applyPropertyTransaction(f.app,f.view,transaction,true);
  assert.deepEqual(f.props(file),transaction.changes[0].end);assert.equal(bodyHash(),before);
  assert.deepEqual(f.writes,[file.path,file.path]);
  assert.deepEqual(f.view,{undoStack:['unchanged undo stack'],redoStack:['unchanged redo stack']});
  assert.deepEqual(transaction.changes[0].start,{保留:'原值'});
});

test('existing fields and complete nested snapshots restore without depending on object key order',async()=>{
  const start={这里写想法:'旧标题',领域:['Blender'],extra:{a:1,b:false},day:new Date('2026-10-30T00:00:00Z')};
  const end={day:new Date('2026-10-30T00:00:00Z'),extra:{b:true,a:2},领域:['Blender','AI'],这里写想法:'新标题'};
  const f=fixture([end]),file=f.files[0],tx={changes:[{file,start,end}]};
  await applyPropertyTransaction(f.app,f.view,tx,false);
  assert.equal(f.props(file)['这里写想法'],'旧标题');assert.deepEqual(structuredClone(f.props(file).领域),['Blender']);
  assert.deepEqual(structuredClone(f.props(file).extra),{a:1,b:false});assert.equal(f.props(file).day.getTime(),start.day.getTime());
  f.props(file).extra.a=99;assert.equal(start.extra.a,1);
  f.props(file).extra.a=1;
  await applyPropertyTransaction(f.app,f.view,tx,true);assert.equal(f.props(file)['这里写想法'],'新标题');
});

test('already-desired snapshots skip a native write, allowing retry after an earlier partial success',async()=>{
  const f=fixture([{value:0},{value:0},{value:0}]);
  const tx={changes:f.files.map(file=>({file,start:{value:0},end:{value:1}}))};
  let fail=true;
  f.app.beforeCommit=file=>{if(file===f.files[1]&&fail){fail=false;throw Error('temporary write error');}};
  await assert.rejects(applyPropertyTransaction(f.app,f.view,tx,true),/可重试/);
  assert.deepEqual(f.calls,[f.files[0].path,f.files[1].path]);assert.deepEqual(f.writes,[f.files[0].path]);
  assert.equal(f.props(f.files[0]).value,1);assert.equal(f.props(f.files[1]).value,0);assert.equal(f.props(f.files[2]).value,0);
  await applyPropertyTransaction(f.app,f.view,tx,true);
  assert.deepEqual(f.writes,f.files.map(file=>file.path));assert.deepEqual(f.files.map(file=>f.props(file).value),[1,1,1]);
});

test('full-snapshot conflicts preserve external edits and stop before subsequent files',async()=>{
  const f=fixture([{value:1,external:'new edit'},{value:1}]);
  const tx={changes:f.files.map(file=>({file,start:{},end:{value:1}}))};
  await assert.rejects(applyPropertyTransaction(f.app,f.view,tx,false),/属性已被其他操作修改/);
  assert.deepEqual(f.props(f.files[0]),{value:1,external:'new edit'});assert.deepEqual(f.props(f.files[1]),{value:1});
  assert.deepEqual(f.calls,[f.files[0].path]);assert.deepEqual(f.writes,[]);
});

test('non-Markdown, replaced and mid-operation replaced files cannot be written',async()=>{
  for (const mode of ['extension','replacement','during-read']) {
    const f=fixture([{value:1}]),file=f.files[0],tx={changes:[{file,start:{},end:{value:1}}]};
    if(mode==='extension')file.extension='png';
    else if(mode==='replacement')f.live.set(file.path,{...file});
    else f.app.beforeProcess=()=>f.live.set(file.path,{...file});
    await assert.rejects(applyPropertyTransaction(f.app,f.view,tx,false),mode==='extension'?/仅支持 Markdown/:/被替换/);
    assert.deepEqual(f.props(file),{value:1});assert.deepEqual(f.writes,[]);
    if(mode!=='during-read')assert.deepEqual(f.calls,[]);
  }
});

test('restoration treats special YAML keys as own properties instead of changing object prototypes',async()=>{
  const desired=JSON.parse('{"__proto__":{"safe":"literal YAML property"},"constructor":"also literal"}');
  const f=fixture([{added:true}]),file=f.files[0],tx={changes:[{file,start:desired,end:{added:true}}]};
  await applyPropertyTransaction(f.app,f.view,tx,false);
  const value=f.props(file);
  assert.equal(Object.hasOwn(value,'added'),false);assert.equal(Object.hasOwn(value,'__proto__'),true);
  assert.equal(value.__proto__.safe,'literal YAML property');assert.equal(value.constructor,'also literal');
  assert.equal(Object.getPrototypeOf(value),Object.prototype);assert.equal({}.safe,undefined);
});
