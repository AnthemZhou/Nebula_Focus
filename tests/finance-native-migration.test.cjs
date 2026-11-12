const {test} = require('node:test');
const assert = require('node:assert/strict');
const {buildSync} = require('esbuild');
const code = buildSync({entryPoints:['src/finance-native-migration.ts'], bundle:true, write:false, platform:'node', format:'cjs', external:['obsidian']}).outputFiles[0].text;
const mod = {exports:{}};
new Function('require','module','exports',code)(() => ({parseYaml:JSON.parse,stringifyYaml:JSON.stringify,normalizePath:path=>path}),mod,mod.exports);
const {migrateFinanceBases} = mod.exports;

function fixture() {
  const original = JSON.stringify({views:[{type:'nebula-finance',name:'流水',titleProperty:'note.摘要',order:['摘要','金额']},{type:'table',name:'我的视图'}]});
  const files = new Map([['Finance.base',original],['Native.base','not serialized'],['Record.md','# Keep body']]);
  const backups = new Map(), directories = new Set(), writes = [];
  const vault = {configDir:'.obsidian',getFiles:()=>[...files.keys()].map(path=>({path,extension:path.split('.').pop()})),
    read:async file=>files.get(file.path), process:async(file,fn)=>{writes.push(file.path);files.set(file.path,fn(files.get(file.path)));},
    adapter:{exists:async path=>directories.has(path)||backups.has(path),mkdir:async path=>directories.add(path),write:async(path,text)=>backups.set(path,text)}};
  return {vault,files,backups,writes,original};
}
test('backs up exact original before conversion; preserves native views and never touches Markdown',async()=>{
  const f=fixture();
  const result=await migrateFinanceBases(f.vault,'nebula-focus');
  assert.deepEqual(result,{converted:['Finance.base'],failed:[]});
  const backup=JSON.parse([...f.backups.values()][0]);assert.equal(backup.content,f.original);assert.equal(backup.path,'Finance.base');
  assert.equal(JSON.parse(f.files.get('Finance.base')).views[1].name,'我的视图');
  assert.equal(f.files.get('Record.md'),'# Keep body');assert.equal(f.files.get('Native.base'),'not serialized');
  assert.deepEqual(f.writes,['Finance.base']);
  await migrateFinanceBases(f.vault,'nebula-focus');assert.equal(f.backups.size,1);assert.equal(f.writes.length,1);
});
test('backup failure leaves source untouched and is reported',async()=>{
  const f=fixture();f.vault.adapter.write=async()=>{throw Error('disk full');};
  assert.deepEqual(await migrateFinanceBases(f.vault,'nebula-focus'),{converted:[],failed:['Finance.base']});
  assert.equal(f.files.get('Finance.base'),f.original);assert.deepEqual(f.writes,[]);
});
test('concurrent user edits win over the prepared conversion',async()=>{
  const f=fixture(), changed=f.original+'\n';
  f.vault.process=async(file,fn)=>f.files.set(file.path,fn(changed));
  assert.deepEqual(await migrateFinanceBases(f.vault,'nebula-focus'),{converted:[],failed:['Finance.base']});
  assert.equal(f.files.get('Finance.base'),changed);assert.equal(f.backups.size,1);
});
test('malformed legacy config is reported without mutation',async()=>{
  const f=fixture();f.files.set('Finance.base',JSON.stringify({views:[{type:'nebula-finance',order:42}]}));
  assert.deepEqual(await migrateFinanceBases(f.vault,'nebula-focus'),{converted:[],failed:['Finance.base']});
  assert.equal(f.backups.size,0);assert.deepEqual(f.writes,[]);
});
