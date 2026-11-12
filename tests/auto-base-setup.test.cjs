const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildSync}=require('esbuild');
class TFile {constructor(path,content=''){this.path=path;this.basename=path.split('/').pop().replace(/\.[^.]+$/,'');this.extension=path.split('.').pop();this.stat={mtime:1};this.content=content;}}
class TFolder {constructor(path){this.path=path;this.children=[];}}
const mod={exports:{}};
const getFrontMatterInfo=content=>{const m=/^---\r?\n([^]*?)\r?\n---(?:\r?\n|$)/.exec(content);return {exists:!!m,frontmatter:m?.[1]??'',contentStart:m?.[0].length??0};};
new Function('require','module','exports',buildSync({entryPoints:['src/auto-base-setup.ts'],bundle:true,write:false,platform:'node',format:'cjs',external:['obsidian']}).outputFiles[0].text)(()=>({TFile,TFolder,getFrontMatterInfo,normalizePath:p=>p,parseYaml:JSON.parse,stringifyYaml:JSON.stringify}),mod,mod.exports);
const {AutoBaseSetup}=mod.exports;
const legacy=()=>({formulas:{想法:'file.asLink(if(note["这里写想法"], note["这里写想法"], file.name))'},views:[{type:'table',name:'想法收集箱',order:['formula.想法','领域','类型'],sort:[{property:'领域',direction:'DESC'}],columnSize:{'note.领域':153}}]});
function fixture(){
 const nodes=new Map(),caches=new Map(),backups=new Map(),dirs=new Set(),writes=[];let enabled=true;
 const add=(path,content='# Original',cache={})=>{const file=new TFile(path,content);nodes.set(path,file);caches.set(path,cache);return file;};
 const app={vault:{configDir:'.obsidian',getFileByPath:p=>nodes.get(p) instanceof TFile?nodes.get(p):null,getFolderByPath:p=>nodes.get(p) instanceof TFolder?nodes.get(p):null,getAbstractFileByPath:p=>nodes.get(p)||null,
  read:async f=>f.content,process:async(f,fn)=>{const result=fn(f.content);if(result!==f.content){writes.push(f.path);f.content=result;f.stat.mtime++;}},
  create:async(p,text)=>{if(nodes.has(p))throw Error('exists');writes.push(p);return add(p,text);},
  createFolder:async p=>{const f=new TFolder(p);nodes.set(p,f);return f;},
  adapter:{exists:async p=>dirs.has(p)||backups.has(p),mkdir:async p=>dirs.add(p),write:async(p,text)=>backups.set(p,text)}},
 metadataCache:{getFileCache:f=>caches.get(f.path),getFirstLinkpathDest:p=>nodes.get(p)||null}};
 const setup=new AutoBaseSetup(app,'nebula-focus',()=>enabled);
 return {app,setup,nodes,caches,backups,writes,add,disable:()=>{enabled=false;}};
}
test('an existing embedded inbox is upgraded in place, preserves view settings, and never writes Markdown',async()=>{
 const f=fixture(),source=f.add('收集箱.md','# Collection\n![[Bases/Ideas.base#想法收集箱]]',{embeds:[{link:'Bases/Ideas.base#想法收集箱'}]}),base=f.add('Bases/Ideas.base',JSON.stringify(legacy()));
 const result=await f.setup.ensure(source);assert.deepEqual(result,[base]);
 const data=JSON.parse(base.content);assert.equal(data.views[0].nebulaTable.titleProperty,'这里写想法');assert.equal(data.views[0].columnSize['note.领域'],153);assert.deepEqual(data.views[0].sort,legacy().views[0].sort);
 assert.equal(source.content,'# Collection\n![[Bases/Ideas.base#想法收集箱]]');assert.deepEqual(f.writes,['Bases/Ideas.base']);assert.equal(f.backups.size,1);
 await f.setup.ensure(source,true);assert.equal(f.backups.size,1);assert.equal(f.writes.length,1);
});
test('plain notes generate a separate exact-scope Base once and preserve subsequent configuration edits',async()=>{
 const f=fixture(),source=f.add('Notes/Example.md','---\n{"标题":"例子","金额":13}\n---\n# Text',{frontmatter:{标题:'例子',金额:13}});
 const [base]=await f.setup.ensure(source);assert.equal(base.path,'Nebula Views/Notes/Example.base');
 const data=JSON.parse(base.content);assert.equal(data.nebulaSource.path,source.path);assert.ok(JSON.stringify(data.filters).includes('file.path'));
 data.views[0].name='My renamed view';data.views[0].columnSize={'note.金额':320};base.content=JSON.stringify(data);
 source.stat.mtime++;await f.setup.ensure(source);
 assert.equal(JSON.parse(base.content).views[0].name,'My renamed view');assert.equal(JSON.parse(base.content).views[0].columnSize['note.金额'],320);
 assert.equal(f.writes.length,1);assert.match(source.content,/# Text/);
});
test('a same-stem record folder creates a collection, never a vault-wide fallback',async()=>{
 const f=fixture(),source=f.add('Ideas.md'),folder=new TFolder('Ideas');f.nodes.set(folder.path,folder);
 folder.children=[f.add('Ideas/A.md','# A',{frontmatter:{标题:'A',tags:['技术']}}),new TFile('Ideas/image.png')];
 const [base]=await f.setup.ensure(source),data=JSON.parse(base.content);
 assert.equal(data.nebulaSource.scope,'folder');assert.equal(data.nebulaSource.folder,'Ideas');assert.match(JSON.stringify(data.filters),/file.folder/);assert.doesNotMatch(JSON.stringify(data.filters),/inFolder/);
 assert.deepEqual(f.writes,[base.path]);
});
test('unresolved explicit embeds and unindexed collection records remain retryable without creating duplicate views',async()=>{
 const f=fixture(),source=f.add('Ideas.md','# Keep\n![[Missing.base#Table]]',{embeds:[{link:'Missing.base#Table'}]});
 assert.deepEqual(await f.setup.ensure(source),[]);assert.equal(f.writes.length,0);
 const base=f.add('Missing.base',JSON.stringify(legacy()));assert.deepEqual(await f.setup.ensure(source),[base]);
 const other=f.add('Other.md'),folder=new TFolder('Other');f.nodes.set('Other',folder);const child=f.add('Other/Child.md');folder.children=[child];f.caches.delete(child.path);
 assert.deepEqual(await f.setup.ensure(other),[]);f.caches.set(child.path,{});assert.equal((await f.setup.ensure(other)).length,1);
});
test('concurrent opens share one creation operation',async()=>{
 const f=fixture(),source=f.add('Example.md');
 const results=await Promise.all([f.setup.ensure(source),f.setup.ensure(source),f.setup.ensure(source,true)]);
 assert.equal(results[0][0],results[1][0]);assert.equal(f.writes.length,1);
});
test('an existing native sibling is reused and a generated-path collision is never overwritten',async()=>{
 const f=fixture(),source=f.add('Example.md'),sibling=f.add('Example.base',JSON.stringify({views:[{type:'table',name:'Mine'}]}));
 assert.deepEqual(await f.setup.ensure(source),[sibling]);assert.equal(f.writes.length,0);
 const other=f.add('Other.md'),collision=f.add('Nebula Views/Other.base','private existing content');
 await assert.rejects(f.setup.ensure(other));assert.equal(collision.content,'private existing content');assert.equal(f.writes.length,0);
});
test('backup failure and concurrent edits both preserve the existing Base',async()=>{
 const f=fixture(),base=f.add('Ideas.base',JSON.stringify(legacy())),original=base.content;
 f.app.vault.adapter.write=async()=>{throw Error('disk full');};await assert.rejects(f.setup.ensure(base));assert.equal(base.content,original);assert.equal(f.writes.length,0);
 const g=fixture(),other=g.add('Ideas.base',original),updated=JSON.stringify({...legacy(),userEdit:true});
 g.app.vault.process=async(file,fn)=>{file.content=fn(updated);};await g.setup.ensure(other);assert.equal(other.content,updated);assert.equal(g.backups.size,1);
});
test('unload during asynchronous inspection prevents configuration writes',async()=>{
 const f=fixture(),base=f.add('Ideas.base',JSON.stringify(legacy()));
 f.app.vault.read=async file=>{f.disable();return file.content;};
 await f.setup.ensure(base);assert.equal(f.writes.length,0);assert.equal(f.backups.size,0);
});
test('empty caches defer to indexing and disabled appearance does not provision files',async()=>{
 const f=fixture(),source=f.add('Example.md');f.caches.delete(source.path);
 assert.deepEqual(await f.setup.ensure(source),[]);assert.equal(f.writes.length,0);
 f.caches.set(source.path,{});assert.equal((await f.setup.ensure(source)).length,1);
 const other=f.add('Other.md');f.disable();assert.deepEqual(await f.setup.ensure(other),[]);assert.equal(f.writes.length,1);
});

test('different notes embedding the same Base share one enhancement and one exact backup',async()=>{
 const f=fixture(),original=JSON.stringify(legacy()),base=f.add('Shared.base',original);
 const first=f.add('First.md','# First\n![[Shared.base]]',{embeds:[{link:'Shared.base'}]});
 const second=f.add('Second.md','# Second\n![[Shared.base]]',{embeds:[{link:'Shared.base'}]});
 let reads=0;f.app.vault.read=async file=>{if(file===base)reads++;return file.content;};
 const results=await Promise.all([f.setup.ensure(first),f.setup.ensure(second),f.setup.ensure(base)]);
 assert.deepEqual(results,[[base],[base],[base]]);assert.equal(reads,1);
 assert.deepEqual(f.writes,['Shared.base']);assert.equal(f.backups.size,1);
 assert.equal(JSON.parse([...f.backups.values()][0]).content,original);
 assert.equal(first.content,'# First\n![[Shared.base]]');assert.equal(second.content,'# Second\n![[Shared.base]]');
});

test('simultaneous distinct Base upgrades tolerate backup-directory creation races without losing backups',async()=>{
 const f=fixture(),first=f.add('First.base',JSON.stringify(legacy())),second=f.add('Second.base',JSON.stringify(legacy()));
 const directories=new Set();let collisions=0;
 f.app.vault.adapter.exists=async path=>directories.has(path)||f.backups.has(path);
 f.app.vault.adapter.mkdir=async path=>{if(directories.has(path)){collisions++;throw Error('EEXIST');}directories.add(path);};
 const results=await Promise.all([f.setup.ensure(first),f.setup.ensure(second)]);
 assert.deepEqual(results,[[first],[second]]);assert.ok(collisions>0,'fixture must exercise the mkdir race');
 assert.deepEqual([...f.writes].sort(),['First.base','Second.base']);assert.equal(f.backups.size,2);
 assert.deepEqual([...f.backups.values()].map(raw=>JSON.parse(raw).path).sort(),['First.base','Second.base']);
});

test('a failed shared enhancement releases its lock and a real mkdir failure remains retryable',async()=>{
 const f=fixture(),base=f.add('Retry.base',JSON.stringify(legacy())),original=base.content;
 const originalMkdir=f.app.vault.adapter.mkdir;
 f.app.vault.adapter.mkdir=async()=>{throw Error('permission denied');};
 const results=await Promise.allSettled([f.setup.ensure(base),f.setup.ensure(base)]);
 assert.ok(results.every(result=>result.status==='rejected'));
 assert.equal(base.content,original);assert.equal(f.writes.length,0);assert.equal(f.backups.size,0);
 f.app.vault.adapter.mkdir=originalMkdir;
 assert.deepEqual(await f.setup.ensure(base),[base]);assert.equal(f.writes.length,1);assert.equal(f.backups.size,1);
});

test('fresh file content wins over stale metadata for both schemas and newly inserted Base embeds',async()=>{
 const f=fixture(),source=f.add('Fresh.md','---\n{"标题":"最新标题","新增字段":12}\n---\n# Body',{frontmatter:{旧字段:'过期'}});
 const [base]=await f.setup.ensure(source),data=JSON.parse(base.content);
 assert.ok(data.views[0].order.includes('note.新增字段'));assert.ok(!data.views[0].order.includes('note.旧字段'));
 const embedded=f.add('Embed.md','![[Present.base#Table]]',{}),present=f.add('Present.base',JSON.stringify(legacy()));
 assert.deepEqual(await f.setup.ensure(embedded),[present]);assert.equal(f.nodes.has('Nebula Views/Embed.base'),false);
});

test('empty same-stem folders stay collection-scoped so future children can enter the query',async()=>{
 const f=fixture(),source=f.add('Empty.md');f.nodes.set('Empty',new TFolder('Empty'));
 const [base]=await f.setup.ensure(source),data=JSON.parse(base.content);
 assert.equal(data.nebulaSource.scope,'folder');assert.equal(data.nebulaSource.folder,'Empty');assert.notEqual(data.views[0].nebulaAllowCreate,false);
});

test('code examples and comments do not become database links, while real Markdown embeds resolve',async()=>{
 const f=fixture(),source=f.add('Guide.md','```md\n![[Ignore.base]]\n```\n`![[Inline.base]]`\n<!-- ![[Comment.base]] -->\n![](Actual%20Base.base)',{}),base=f.add('Actual Base.base',JSON.stringify({views:[]}));
 assert.deepEqual(await f.setup.ensure(source),[base]);assert.equal(f.writes.length,0);
});

test('an asynchronous Base rename into Markdown cannot receive a configuration write',async()=>{
 const f=fixture(),base=f.add('Ideas.base',JSON.stringify(legacy())),original=base.content;
 f.app.vault.adapter.write=async(path,text)=>{f.backups.set(path,text);base.path='Ideas.md';base.extension='md';};
 await f.setup.ensure(base);assert.equal(base.content,original);assert.equal(f.writes.length,0);
});

test('a note changed during folder creation defers provisioning instead of freezing an obsolete schema',async()=>{
 const f=fixture(),source=f.add('Changing.md'),base=f.add('New.base',JSON.stringify({views:[]}));
 const createFolder=f.app.vault.createFolder;
 f.app.vault.createFolder=async path=>{source.content='![[New.base]]';source.stat.mtime++;return createFolder(path);};
 assert.deepEqual(await f.setup.ensure(source),[]);assert.equal(f.writes.length,0);
 assert.deepEqual(await f.setup.ensure(source),[base]);
});

test('changed or added collection members defer initial schema generation',async()=>{
 for(const scenario of ['changed','added','removed']) {
  const f=fixture(),source=f.add('Ideas.md'),folder=new TFolder('Ideas'),child=f.add('Ideas/A.md');
  folder.children=[child];f.nodes.set(folder.path,folder);const createFolder=f.app.vault.createFolder;
  f.app.vault.createFolder=async path=>{if(scenario==='changed'){child.content='---\n{"title":"Updated"}\n---\nText';child.stat.mtime++;}
   else if(scenario==='added')folder.children.push(f.add('Ideas/B.md'));else folder.children=[];return createFolder(path);};
  assert.deepEqual(await f.setup.ensure(source),[]);assert.equal(f.writes.length,0);
 }
});

test('existing inline Bases suppress duplicate auto-generated views without rewriting the source',async()=>{
 const f=fixture(),text='```base\nviews:\n  - type: table\n```',source=f.add('Inline.md',text);
 assert.deepEqual(await f.setup.ensure(source),[]);assert.deepEqual(f.writes,[]);assert.equal(source.content,text);
});
