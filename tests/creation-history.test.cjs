const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {buildSync} = require('esbuild');
const {JSDOM} = require('jsdom');
const code = buildSync({entryPoints:['src/creation-history.ts'], bundle:true, write:false,
  platform:'node', format:'cjs', external:['obsidian']}).outputFiles[0].text;

// Simulate the YAML subset used by these fixtures. Production continues to
// use Obsidian's parser; this test never accesses a real vault.
function parseYaml(source) {
  const result = {};
  for (const line of source.split('\n')) {
    if (!line.trim()) continue;
    const match = /^([^:]+):\s*(.*)$/.exec(line);
    if (!match) throw Error('Unsupported fixture YAML');
    let value = match[2];
    try {value = JSON.parse(value);} catch {if (value.startsWith("'") && value.endsWith("'")) value=value.slice(1,-1);}
    if(match[2]==='.nan')value=NaN;
    else if(match[2]==='.inf')value=Infinity;
    else if(match[2]==='-.inf')value=-Infinity;
    else if(match[2].startsWith('!!timestamp '))value=new Date(match[2].slice(12));
    result[match[1].trim()] = value;
  }
  return result;
}
function splitNote(text) {
  const match=/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  return match?{properties:parseYaml(match[1]),body:text.slice(match[0].length)}:{properties:{},body:text};
}
function fixture(t, options = {}) {
  const dom = new JSDOM('<!doctype html><body><button id="outside">Outside</button><div class="workspace-leaf mod-active"><div class="bases-table-container" tabindex="0"></div></div></body>', {pretendToBeVisual:true});
  const win=dom.window, doc=win.document, container=doc.querySelector('.bases-table-container');
  class StringValue {constructor(data){this.data=data;} toString(){return this.data;}}
  const files=new Map(), folders=new Map(), content=new Map(), calls={open:0, create:[], trash:[], rename:[], nativeUndo:0, nativeRedo:0, notices:[], notify:0, save:0, frontmatter:0, groupCreate:0, phoneOpen:[], nativeCreateArgs:[]};
  let number=0, readHook, trashHook, createHook, openFileHook, renameHook;
  const put=(path, text='')=>{const file={path, extension:'md', basename:path.split('/').pop().replace(/\.md$/,''), stat:{ctime:100+number, mtime:200+number}}; files.set(path,file); content.set(file,text); return file;};
  const app={vault:{
    getAbstractFileByPath:path=>files.get(path)??null,
    getFileByPath:path=>files.get(path)??null,
    getFolderByPath:path=>folders.get(path)??null,
    async read(file) {if (readHook) return readHook(file); assert.equal(files.get(file.path),file,'read uses a live TFile'); return content.get(file);},
    async create(path,text,stats) {calls.create.push({path,text,stats}); if (createHook) await createHook(path,text,stats); assert(!files.has(path),'no overwrite'); const file=put(path,text); if(stats)file.stat={...stats}; return file;},
    async trash(file,system) {calls.trash.push({file,system}); if(trashHook)await trashHook(file,system); assert.equal(files.get(file.path),file); files.delete(file.path);},
  },fileManager:{async createNewFile(...args){
    assert.equal(this,app.fileManager,'native creation keeps its real file-manager receiver');calls.nativeCreateArgs.push(args);
    const [folder,name]=args;return app.vault.create(`${folder.path}/${name||'Untitled'} ${++number}.md`,'');
  },async createNewMarkdownFile(folder){return app.vault.create(`${folder.path}/Untitled ${++number}.md`,'');}, async renameFile(file,toPath){
    assert.equal(this,app.fileManager,'rename keeps the native link-aware file-manager receiver');
    calls.rename.push({file,fromPath:file.path,toPath});if(renameHook)await renameHook(file,toPath);
    assert.equal(files.get(file.path),file);assert(!files.has(toPath)||files.get(toPath)===file,'rename never overwrites');
    files.delete(file.path);file.path=toPath;file.basename=toPath.split('/').pop().replace(/\.md$/,'');files.set(toPath,file);
  }, async processFrontMatter(file,callback) {
    assert.equal(this,app.fileManager,'frontmatter keeps its real file-manager receiver');
    assert.equal(files.get(file.path),file,'frontmatter transaction uses a live TFile');
    const note=splitNote(content.get(file)), properties=note.properties;
    callback(properties);
    calls.frontmatter++;
    content.set(file,'---\n'+Object.entries(properties).map(([key,value])=>`${key}: ${JSON.stringify(value)}`).join('\n')+'\n---\n'+note.body);
  }},workspace:{iterateAllLeaves:callback=>{for(const view of leaves)callback(view.__leaf?view:{view});},getLeaf(kind){
    assert.equal(kind,'tab');return {openFile(file,state){calls.phoneOpen.push({file,state});openFileHook?.(file);}};
  }}};
  const leaves=[];
  const view={type:options.type??'table',_loaded:true,containerEl:container,undoStack:[],redoStack:[],
    isGroupedByFolder:!!options.folder,
    config:{name:options.type==='kanban'?'项目看板':options.type==='cards'?'画廊':'想法收集箱',...(options.folder?{groupBy:{property:'file.folder'}}:{}),sort:[{property:'note.领域',direction:'DESC'}],query:{file:'Bases/想法收集箱.base',saveFn(){calls.save++;}},getSort(){return this.sort;}},
    getEphemeralState:()=>({activeCell:{groupIdx:0,row:0,column:0}}),setEphemeralState(state){this.restoredState=state;},
    async createTransaction(callback) {const transaction={changes:[],state:this.getEphemeralState()}; await callback(transaction.changes); if(transaction.changes.length){this.redoStack=[];this.undoStack.push(transaction);}},
    async undoTransaction() {calls.nativeUndo++; const transaction=this.undoStack.pop(); if(!transaction)return; this.redoStack.push(transaction); for(const change of transaction.changes)await app.fileManager.processFrontMatter(change.file,properties=>{if(JSON.stringify(properties)===JSON.stringify(change.end))Object.assign(properties,structuredClone(change.start));});},
    async redoTransaction() {calls.nativeRedo++; const transaction=this.redoStack.pop(); if(!transaction)return; this.undoStack.push(transaction); for(const change of transaction.changes)await app.fileManager.processFrontMatter(change.file,properties=>{if(JSON.stringify(properties)===JSON.stringify(change.start))Object.assign(properties,structuredClone(change.end));});},
  };
  const menu={app,newlyCreatedFile:null,
    async open(name,onProperties) {
      calls.open++;
      if(options.phone){
        // Native isPhone branch opens a tab without setting newlyCreatedFile.
        const nativeApp=this.app,file=await nativeApp.fileManager.createNewFile({path:'Ideas'},name);
        await nativeApp.fileManager.processFrontMatter(file,properties=>{properties.领域=[];onProperties?.(properties);});
        nativeApp.workspace.getLeaf('tab').openFile(file,{active:true,eState:{rename:'all'}});return;
      }
      const file=await app.vault.create(`Ideas/Untitled ${++number}.md`,'---\n领域: []\n---\n');
      this.newlyCreatedFile=file;
      const hoverEl=doc.createElement('div');hoverEl.innerHTML='<div class="inline-title" contenteditable="true"></div>';
      hoverEl.firstChild.textContent=file.basename;doc.body.append(hoverEl);
      this.popover={hoverEl,embed:{file,editor:{getValue:()=>content.get(file)}}}; return 'native-open-result';
    },
    close(){this.popover?.hoverEl.remove();this.popover=null;this.newlyCreatedFile=null;},
  };
  const controller={view,newItemMenu:menu,requestNotifyView(){calls.notify++;}};
  menu.queryController=controller;view.queryController=controller;
  view.createFileForView=async(...args)=>{await menu.open(...args);};
  view.createNoteInGroup=async function(group){calls.groupCreate++;if(this.isReadOnly)return;if(this.isGroupedByFolder){const folder=app.vault.getFolderByPath(group.key?.data);if(!folder)return;await app.fileManager.createNewMarkdownFile(folder);return;}await this.createFileForView('',()=>{});};
  const original={open:menu.open,undo:view.undoTransaction,redo:view.redoTransaction,transaction:view.createTransaction,group:view.createNoteInGroup};
  const module={exports:{}};
  new vm.Script(code).runInContext(vm.createContext({module,exports:module.exports,document:doc,Element:win.Element,HTMLElement:win.HTMLElement,console,setTimeout,clearTimeout,
    require:name=>{assert.equal(name,'obsidian');return {Platform:{isPhone:!!options.phone},StringValue,Notice:class{constructor(message){calls.notices.push(typeof message==='string'?message:message.textContent);}},parseYaml};}}));
  const changed=[];const history=new module.exports.BaseCreationHistory(app,view=>changed.push(view));history.attach(view);
  const edit=async(file,text,legacy=false)=>(legacy?original.transaction:view.createTransaction).call(view,async changes=>{
    assert.equal(files.get(file.path),file);
    const start=splitNote(content.get(file)).properties, end=text.startsWith('---\n')?splitNote(text).properties:{...start,state:text};
    changes.push({file,start:structuredClone(start),end:structuredClone(end)});
    await app.fileManager.processFrontMatter(file,properties=>{for(const key of Object.keys(properties))delete properties[key];Object.assign(properties,end);});
  });
  const created=async()=>{assert.equal(await menu.open(),options.phone?undefined:'native-open-result');return options.phone?calls.phoneOpen.at(-1).file:menu.newlyCreatedFile;};
  const key=(target,options={})=>{const event=new win.KeyboardEvent('keydown',{key:'z',metaKey:true,bubbles:true,cancelable:true,...options});let handled;const listener=e=>{handled=history.handleKey(e);};doc.addEventListener('keydown',listener,true);target.dispatchEvent(event);doc.removeEventListener('keydown',listener,true);return{handled,event};};
  t.after(()=>{history.clear();dom.window.close();});
  return {dom,win,doc,container,app,view,menu,controller,original,history,files,folders,StringValue,content,calls,put,edit,created,key,leaves,changed,
    same:module.exports.sameCreatedContent,props:file=>splitNote(content.get(file)).properties,
    setReadHook:fn=>{readHook=fn;},setTrashHook:fn=>{trashHook=fn;},setCreateHook:fn=>{createHook=fn;},setOpenFileHook:fn=>{openFileHook=fn;},setRenameHook:fn=>{renameHook=fn;}};
}

test('native property → creation → native property undo and redo share chronological history and restored TFiles', async t=>{
  const f=fixture(t), existing=f.put('Ideas/Existing.md','---\nstate: "old"\n---\nBody');
  await f.edit(existing,'new',true);const prior=f.view.undoStack.at(-1);
  const file=await f.created(), marker=f.view.undoStack.at(-1), baseline=f.content.get(file);
  await f.edit(file,'---\n领域: ["Blender"]\n---\n');const later=f.view.undoStack.at(-1);
  assert.deepEqual([...f.view.undoStack],[prior,marker,later]);
  await f.view.undoTransaction();assert.equal(f.content.get(file),baseline);assert.equal(f.calls.nativeUndo,0);
  await f.view.undoTransaction();assert.equal(f.files.has(file.path),false);assert.equal(f.calls.nativeUndo,0);
  assert.equal(f.calls.trash.length,1);assert.equal(f.calls.trash[0].system,false);
  await f.view.undoTransaction();assert.equal(f.props(existing).state,'old');assert.equal(f.calls.nativeUndo,1);
  await f.view.redoTransaction();assert.equal(f.props(existing).state,'new');assert.equal(f.calls.nativeRedo,1);
  await f.view.redoTransaction();const restored=f.files.get(file.path);
  assert(restored);assert.notEqual(restored,file);assert.equal(f.content.get(restored),baseline);
  assert.deepEqual(restored.stat,file.stat);assert.equal(later.changes[0].file,restored);
  await f.view.redoTransaction();assert.equal(f.content.get(restored),'---\n领域: ["Blender"]\n---\n');
  assert.equal(f.calls.nativeRedo,1);assert.deepEqual([...f.view.undoStack],[prior,marker,later]);
  assert.deepEqual(f.calls.notices, [], 'successful creation, undo and redo stay silent');
});

test('unrelated file creation never enters this table history and native transactions are delegated', async t=>{
  const f=fixture(t), file=await f.app.vault.create('Elsewhere/Unrelated.md','keep');
  assert.equal(f.view.undoStack.length,0);
  await f.view.undoTransaction();assert.equal(f.calls.nativeUndo,1);assert.equal(f.files.get(file.path),file);assert.equal(f.calls.trash.length,0);
  const legacyFile=f.put('Elsewhere/Legacy.md','---\nstate: "old"\n---\nBody');
  await f.edit(legacyFile,'edited',true);await f.view.undoTransaction();assert.equal(f.props(legacyFile).state,'old');assert.equal(f.calls.trash.length,0);
});

test('phone native creation without newlyCreatedFile keeps native arguments, metadata and tab behavior while supporting undo/redo',async t=>{
  const f=fixture(t,{phone:true,type:'kanban'}),manager=f.app.fileManager,create=manager.createNewFile;
  await f.menu.open('Phone item',properties=>{properties.状态='制作中';});
  const file=f.calls.phoneOpen.at(-1).file,baseline=f.content.get(file);
  assert.equal(f.menu.newlyCreatedFile,null);assert.equal(f.menu.popover,undefined);
  assert.equal(f.app.fileManager,manager);assert.equal(manager.createNewFile,create,'shared file-manager API is never patched');
  assert.equal(f.calls.nativeCreateArgs[0][1],'Phone item');assert.equal(f.props(file).状态,'制作中');
  assert.deepEqual(f.calls.phoneOpen[0].state,{active:true,eState:{rename:'all'}});
  assert.equal(f.history.forView(f.view,false,false),true);await drain(f);
  assert.equal(f.files.has(file.path),false);assert.equal(f.calls.trash.length,1);
  assert.equal(f.history.forView(f.view,true,false),true);await drain(f);
  assert.equal(f.content.get(f.files.get(file.path)),baseline);assert.deepEqual(f.calls.notices,[]);
});

test('phone capture observes only its own native create return while another file is created concurrently',async t=>{
  const f=fixture(t,{phone:true});let release,started;
  const creating=new Promise(resolve=>{started=resolve;});
  f.setCreateHook(()=>new Promise(resolve=>{release=resolve;started();}));
  const opening=f.created();await creating;f.setCreateHook(null);
  const unrelated=await f.app.fileManager.createNewFile({path:'Elsewhere'},'Unrelated');
  release();const file=await opening;
  assert.equal(f.view.undoStack.length,1);await f.view.undoTransaction();
  assert.equal(f.files.has(file.path),false);assert.equal(f.files.get(unrelated.path),unrelated);
  assert.deepEqual(f.calls.trash.map(item=>item.file),[file]);
});

test('phone creation stays undoable when opening its new tab detaches the registered source leaf',async t=>{
  const f=fixture(t,{phone:true}),ui=mountSurface(f),owner=ownSession(f,ui);
  f.setOpenFileHook(()=>ui.leaf.remove());
  const file=await f.created();
  assert.equal(owner.view.containerEl.isConnected,false);
  f.history.prune();
  f.doc.body.append(ui.leaf);f.history.attach(f.view);
  assert.equal(f.view.undoStack.length,1,'inactive registered source retains its creation record');
  assert.equal(f.history.forView(f.view,false,false),true);await drain(f);
  assert.equal(f.files.has(file.path),false);
  assert.equal(f.history.forView(f.view,true,false),true);await drain(f);
  assert.equal(f.files.has(file.path),true);
});

test('removing an owning leaf ends its history even if the old DOM has not been detached yet',async t=>{
  const f=fixture(t,{phone:true}),ui=mountSurface(f),owner=ownSession(f,ui),file=await f.created();
  f.leaves.splice(f.leaves.indexOf(owner),1);
  assert.equal(owner.view.containerEl.isConnected,true);
  f.history.prune();
  f.leaves.push(owner);f.history.attach(f.view);
  assert.equal(f.view.undoStack.length,0,'a closed tab cannot revive history through its leftover DOM');
  assert.equal(f.history.forView(f.view,false,true),false);
  assert.equal(f.files.get(file.path),file);
});

test('failed phone native creation is not captured and leaves the real file manager available for retry',async t=>{
  const f=fixture(t,{phone:true}),manager=f.app.fileManager,create=manager.createNewFile;
  f.setCreateHook(()=>{throw Error('native creation failed');});await assert.rejects(f.menu.open(),/native creation failed/);
  assert.equal(manager.createNewFile,create);assert.equal(f.view.undoStack.length,0);assert.equal(f.calls.phoneOpen.length,0);
  f.setCreateHook(null);const file=await f.created();await f.view.undoTransaction();assert.equal(f.files.has(file.path),false);
});

test('changed disk content, renamed files, and path replacements cannot be removed by creation undo', async t=>{
  for(const kind of ['content','rename','replace']) {
    const f=fixture(t), file=await f.created(), marker=f.view.undoStack.at(-1), original=file.path;
    if(kind==='content')f.content.set(file,f.content.get(file)+'Important new body\n');
    if(kind==='rename'){f.files.delete(original);file.path='Ideas/Renamed.md';f.files.set(file.path,file);}
    if(kind==='replace'){f.files.delete(original);f.put(original,'Other file at same path');}
    await f.view.undoTransaction();
    assert.equal(f.calls.trash.length,0,kind);assert.equal(f.view.undoStack.at(-1),marker,kind);assert.equal(f.view.redoStack.length,0,kind);
  }
});

test('unsaved body and title drafts are guarded before any trash operation', async t=>{
  for(const kind of ['popover-body','other-leaf','title']) {
    const f=fixture(t),file=await f.created(),marker=f.view.undoStack.at(-1);
    if(kind==='popover-body')f.menu.popover.embed.editor.getValue=()=>f.content.get(file)+'Unsaved body';
    if(kind==='other-leaf')f.leaves.push({file,editor:{getValue:()=>f.content.get(file)+'Unsaved elsewhere'}});
    if(kind==='title')f.menu.popover.hoverEl.firstChild.textContent='New title draft';
    await f.view.undoTransaction();assert.equal(f.calls.trash.length,0,kind);assert.equal(f.view.undoStack.at(-1),marker,kind);
  }
});

test('redo refuses a path collision and retains the marker for a later safe retry', async t=>{
  const f=fixture(t),file=await f.created();await f.view.undoTransaction();const marker=f.view.redoStack.at(-1);
  const other=f.put(file.path,'Unrelated replacement');await f.view.redoTransaction();
  assert.equal(f.files.get(file.path),other);assert.equal(f.content.get(other),'Unrelated replacement');assert.equal(f.view.redoStack.at(-1),marker);
  f.files.delete(file.path);await f.view.redoTransaction();assert.notEqual(f.files.get(file.path),file);assert.equal(f.view.undoStack.at(-1),marker);
});

test('failed trash and failed redo preserve history and can be retried', async t=>{
  const f=fixture(t),file=await f.created(),marker=f.view.undoStack.at(-1);
  f.setTrashHook(()=>{throw Error('trash unavailable');});await f.view.undoTransaction();
  assert.equal(f.files.get(file.path),file);assert.equal(f.view.undoStack.at(-1),marker);assert.equal(f.view.redoStack.length,0);
  f.setTrashHook(null);await f.view.undoTransaction();assert.equal(f.view.redoStack.at(-1),marker);
  f.setCreateHook(()=>{throw Error('disk full');});await f.view.redoTransaction();
  assert.equal(f.files.has(file.path),false);assert.equal(f.view.redoStack.at(-1),marker);assert.equal(f.view.undoStack.length,0);
  f.setCreateHook(null);await f.view.redoTransaction();assert.equal(f.view.undoStack.at(-1),marker);
});

test('native text/IME undo is not captured in any editable field or outside the owned table', async t=>{
  const f=fixture(t);await f.created();
  for(const html of ['<input>','<textarea></textarea>','<select><option>A</option></select>',
    '<div contenteditable="true"><span>Typing</span></div>','<div contenteditable="plaintext-only">Typing</div>',
    '<div contenteditable>Typing</div>','<div contenteditable="">Typing</div>','<div class="cm-editor"><span>Typing</span></div>']) {
    const host=f.doc.createElement('div');host.innerHTML=html;f.container.append(host);const target=host.querySelector('span')||host.firstChild;
    const {handled,event}=f.key(target);assert.equal(handled,false,html);assert.equal(event.defaultPrevented,false,html);host.remove();
  }
  assert.equal(f.key(f.doc.querySelector('#outside')).handled,false);
  assert.equal(f.key(f.container,{isComposing:true}).handled,false);
  assert.equal(f.key(f.container,{altKey:true}).handled,false);
  assert.equal(f.calls.trash.length,0);
});

test('untouched new-item title can undo creation while a changed title retains native text undo', async t=>{
  const f=fixture(t),file=await f.created(),title=f.menu.popover.hoverEl.firstChild;
  title.textContent='Changed title';assert.equal(f.key(title).handled,false);
  title.textContent=file.basename;const result=f.key(title);assert.equal(result.handled,true);assert.equal(result.event.defaultPrevented,true);
  // Queue an additional native no-op to wait for the intercepted undo to settle.
  await f.view.undoTransaction();assert.equal(f.files.has(file.path),false);assert.equal(f.calls.trash.length,1);
});

test('unload removes only owned markers, restores native methods, and preserves ordinary property history', async t=>{
  const f=fixture(t),existing=f.put('Ideas/Existing.md','old');await f.edit(existing,'new');const prior=f.view.undoStack.at(-1);
  await f.created();await f.created();await f.view.undoTransaction();
  assert.equal(f.view.undoStack.length,2);assert.equal(f.view.redoStack.length,1);
  f.history.clear();assert.deepEqual([...f.view.undoStack],[prior]);assert.equal(f.view.redoStack.length,0);
  assert.equal(f.menu.open,f.original.open);assert.equal(f.view.undoTransaction,f.original.undo);assert.equal(f.view.redoTransaction,f.original.redo);
  assert.equal(f.view.createTransaction,f.original.transaction);
});

test('a later transaction arriving while the second content read is pending prevents deletion', async t=>{
  const f=fixture(t),file=await f.created(),marker=f.view.undoStack.at(-1),other=f.put('Ideas/Other.md','before');let reads=0;
  const later={changes:[{file:other,start:'before',end:'after'}]};
  f.setReadHook(async target=>{const value=f.content.get(target);if(++reads===2){f.content.set(other,'after');f.view.undoStack.push(later);}return value;});
  await f.view.undoTransaction();assert.equal(f.calls.trash.length,0);assert.equal(f.files.get(file.path),file);
  assert.deepEqual([...f.view.undoStack],[marker,later]);
});

test('unload during an in-flight read cannot remove the file or resurrect a marker', async t=>{
  const f=fixture(t),file=await f.created();let release,started;
  const reading=new Promise(resolve=>{started=resolve;});
  f.setReadHook(target=>new Promise(resolve=>{release=()=>resolve(f.content.get(target));started();}));
  const pending=f.view.undoTransaction();await reading;f.history.clear();release();await pending;
  assert.equal(f.files.get(file.path),file);assert.equal(f.calls.trash.length,0);assert.equal(f.view.undoStack.length,0);assert.equal(f.view.redoStack.length,0);
});

test('read-only changes after creation prevent destructive history actions', async t=>{
  const f=fixture(t),file=await f.created(),marker=f.view.undoStack.at(-1);f.view.isReadOnly=true;
  await f.view.undoTransaction();assert.equal(f.calls.trash.length,0);assert.equal(f.files.get(file.path),file);assert.equal(f.view.undoStack.at(-1),marker);
});

test('content safety tolerates equivalent YAML serialization but keeps exact body and property values',t=>{
  const f=fixture(t);
  assert.equal(f.same('---\na: 1\nb: "text"\n---\nBody','---\nb: text\na: 1\n---\nBody'),true);
  assert.equal(f.same('---\na: 1\n---\nBody','---\na: 2\n---\nBody'),false);
  assert.equal(f.same('---\na: 1\n---\nBody','---\na: 1\n---\nBody\n'),false);
  assert.equal(f.same('Body','---\n\n---\nBody'),true);
});

test('property transactions wait for creation capture and retain their actual native history order', async t=>{
  const f=fixture(t),other=f.put('Ideas/Other.md','before');let release,started;
  const reading=new Promise(resolve=>{started=resolve;});
  f.setReadHook(file=>new Promise(resolve=>{release=()=>resolve(f.content.get(file));started();}));
  const opening=f.created();await reading;
  const editing=f.edit(other,'after');await Promise.resolve();
  assert.equal(f.content.get(other),'before');assert.equal(f.view.undoStack.length,0);
  release();await opening;await editing;
  assert.equal(f.view.undoStack.length,2);assert.equal(f.view.undoStack[0].changes.length,0);
  assert.equal(f.view.undoStack[1].changes[0].file,other);
});

test('a detached title caret falling back to body undoes only the last active table property transaction', async t=>{
  const f=fixture(t),file=await f.created(),baseline=f.content.get(file);
  f.menu.close();await f.edit(file,'---\n领域: ["AI"]\n---\n');
  f.container.focus();f.container.blur();assert.equal(f.doc.activeElement,f.doc.body);
  const result=f.key(f.doc.body);assert.equal(result.handled,true);assert.equal(result.event.defaultPrevented,true);
  await f.view.createTransaction(async()=>{});
  assert.equal(f.content.get(file),baseline);assert.equal(f.files.get(file.path),file);assert.equal(f.calls.trash.length,0);
  assert.equal(f.calls.nativeUndo,0);assert.equal(f.calls.frontmatter,2);assert.equal(f.doc.activeElement,f.container);
});

test('body fallback never follows the last table into an inactive leaf or an unrelated control', async t=>{
  const f=fixture(t),file=await f.created();f.menu.close();await f.edit(file,'---\n领域: ["AI"]\n---\n');
  f.container.closest('.workspace-leaf').classList.remove('mod-active');
  assert.equal(f.key(f.doc.body).handled,false);
  f.container.closest('.workspace-leaf').classList.add('mod-active');
  const input=f.doc.createElement('textarea');f.doc.body.append(input);input.focus();
  assert.equal(f.key(input).handled,false);assert.equal(f.key(f.doc.querySelector('#outside')).handled,false);
  assert.equal(f.calls.nativeUndo,0);assert.equal(f.calls.trash.length,0);
});

test('non-JSON YAML values never collapse to equal null or empty objects in deletion guards',t=>{
  const f=fixture(t),note=value=>`---\nvalue: ${value}\n---\nBody`;
  for(const [a,b] of [['.nan','null'],['.inf','-.inf'],['!!timestamp 2026-01-01','!!timestamp 2026-02-01'],['!!timestamp 2026-01-01','{}']]) {
    assert.equal(f.same(note(a),note(b)),false,`${a} versus ${b}`);
  }
  assert.equal(f.same(note('.nan'),note('.nan')),true,'identical source needs no lossy comparison');
});

test('a natively saved rename keeps title text undo instead of swallowing it as creation undo', async t=>{
  const f=fixture(t),file=await f.created(),title=f.menu.popover.hoverEl.firstChild;
  f.files.delete(file.path);file.path='Ideas/Renamed.md';file.basename='Renamed';f.files.set(file.path,file);title.textContent=file.basename;
  const result=f.key(title);assert.equal(result.handled,false);assert.equal(result.event.defaultPrevented,false);
  assert.equal(f.calls.trash.length,0);assert.equal(f.files.get(file.path),file);
});

test('typing then restoring the original title still preserves its native text undo history', async t=>{
  const f=fixture(t),file=await f.created(),title=f.menu.popover.hoverEl.firstChild;
  title.textContent='Temporary title';title.dispatchEvent(new f.win.InputEvent('input',{bubbles:true,inputType:'insertText'}));
  title.textContent=file.basename;title.dispatchEvent(new f.win.InputEvent('input',{bubbles:true,inputType:'deleteContentBackward'}));
  const result=f.key(title);assert.equal(result.handled,false);assert.equal(result.event.defaultPrevented,false);
  assert.equal(f.calls.trash.length,0);assert.equal(f.files.get(file.path),file);
});

test('unloading before a queued menu open starts prevents native creation entirely', async t=>{
  const f=fixture(t),opening=f.menu.open();f.history.clear();await opening;
  assert.equal(f.calls.open,0);assert.equal(f.files.size,0);assert.equal(f.menu.popover,undefined);
  assert.equal(f.view.undoStack.length,0);
});

test('unload or controller replacement during an awaited sort save cancels the not-yet-started creation', async t=>{
  for(const cancel of ['unload','owner']) {
    const f=fixture(t);let release,started;
    const saving=new Promise(resolve=>{started=resolve;});
    f.view.config.query.saveFn=()=>new Promise(resolve=>{release=resolve;started();});
    const opening=f.menu.open();await saving;
    if(cancel==='unload')f.history.clear();else f.controller.view={type:'table'};
    release();await opening;
    assert.equal(f.calls.open,0,cancel);assert.equal(f.files.size,0,cancel);assert.equal(f.menu.popover,undefined,cancel);
    assert.equal(f.view.undoStack.length,0,cancel);
  }
});

test('title edits made while the initial content snapshot is pending still retain native text undo', async t=>{
  const f=fixture(t);let release,started;
  const reading=new Promise(resolve=>{started=resolve;});
  f.setReadHook(file=>new Promise(resolve=>{release=()=>resolve(f.content.get(file));started();}));
  const opening=f.created();await reading;
  const title=f.menu.popover.hoverEl.firstChild,file=f.menu.newlyCreatedFile;
  title.textContent='Transient';title.dispatchEvent(new f.win.InputEvent('input',{bubbles:true,inputType:'insertText'}));
  title.textContent=file.basename;title.dispatchEvent(new f.win.InputEvent('input',{bubbles:true,inputType:'deleteContentBackward'}));
  release();await opening;
  const result=f.key(title);assert.equal(result.handled,false);assert.equal(result.event.defaultPrevented,false);
  assert.equal(f.calls.trash.length,0);assert.equal(f.files.get(file.path),file);
});

test('replacing the native menu on the same table releases the old wrapper and captures the new menu', async t=>{
  const f=fixture(t),replacement={open:f.original.open,close:f.menu.close,queryController:f.controller,newlyCreatedFile:null};
  f.controller.newItemMenu=replacement;f.history.attach(f.view);
  assert.equal(f.menu.open,f.original.open,'old menu is restored');
  assert.notEqual(replacement.open,f.original.open,'replacement menu is wrapped');
  assert.equal(await replacement.open(),'native-open-result');const file=replacement.newlyCreatedFile;
  assert(file);assert.equal(f.view.undoStack.length,1);
  await f.view.undoTransaction();assert.equal(f.files.has(file.path),false);assert.equal(f.calls.trash.length,1);
  f.history.clear();assert.equal(replacement.open,f.original.open);assert.equal(f.view.undoTransaction,f.original.undo);
});

test('empty undo or redo stacks never consume the corresponding native keyboard event', async t=>{
  const f=fixture(t);
  for(const shiftKey of [false,true]) {
    const result=f.key(f.container,{shiftKey});assert.equal(result.handled,false);assert.equal(result.event.defaultPrevented,false);
  }
  await f.created();
  const noRedo=f.key(f.container,{shiftKey:true});assert.equal(noRedo.handled,false);assert.equal(noRedo.event.defaultPrevented,false);
  await f.view.undoTransaction();
  const noUndo=f.key(f.container);assert.equal(noUndo.handled,false);assert.equal(noUndo.event.defaultPrevented,false);
  assert.equal(f.calls.nativeUndo,0);assert.equal(f.calls.nativeRedo,0);
});

// Native Bases embeds use a header and a view host; the plugin board is a
// sibling of the hidden native renderer, not one of its children.
function mountSurface(f, livePreview = false) {
  const leaf=f.container.closest('.workspace-leaf'), preview=f.doc.createElement('div');
  preview.className=livePreview?'markdown-source-view':'markdown-preview-view';preview.tabIndex=-1;
  const host=f.doc.createElement('div');host.className='bases-view';host.tabIndex=-1;
  const header=f.doc.createElement('div');header.className='bases-header';
  const toolbar=f.doc.createElement('button');toolbar.textContent='New';header.append(toolbar);
  const presentation=f.doc.createElement('div');presentation.className='bui-presentation';presentation.tabIndex=-1;
  const footer=f.doc.createElement('button');footer.className='bui-column-new';footer.textContent='New';
  const plus=f.doc.createElement('button');plus.className='bui-add';plus.textContent='+';
  presentation.append(plus,footer);f.container.replaceWith(preview);
  if(livePreview){const cm=f.doc.createElement('div');cm.className='cm-editor';const content=f.doc.createElement('div');content.className='cm-content';content.contentEditable='true';content.setAttribute('contenteditable','true');const widget=f.doc.createElement('div');widget.setAttribute('contenteditable','false');content.append(widget);cm.append(content);preview.append(cm);widget.append(header,host);}
  else preview.append(header,host);
  host.append(f.container,presentation);f.controller.viewContainerEl=host;f.controller.viewHeaderEl=header;
  const dispose=f.history.registerSurface(f.view,presentation);
  return{leaf,preview,host,header,toolbar,presentation,footer,plus,dispose};
}
async function drain(f){await f.view.createTransaction(async()=>{});}

for(const type of ['kanban','cards'])test(`${type}: closing native creation popover to the reading root retains keyboard creation undo and redo`,async t=>{
  const f=fixture(t,{type}),ui=mountSurface(f),file=await f.created();f.menu.close();ui.preview.focus();
  assert.equal(f.doc.activeElement,ui.preview);const undo=f.key(ui.preview);
  assert.equal(undo.handled,true);assert.equal(undo.event.defaultPrevented,true);await drain(f);
  assert.equal(f.files.has(file.path),false);assert.equal(f.calls.trash.length,1);
  const redo=f.key(ui.footer,{shiftKey:true});assert.equal(redo.handled,true);await drain(f);
  assert.equal(f.files.has(file.path),true);assert.deepEqual(f.calls.notices,[]);
});

test('the custom board footer, column plus, native toolbar and empty board all route the same history once',async t=>{
  const f=fixture(t,{type:'kanban'}),ui=mountSurface(f),file=await f.created();f.menu.close();
  for(const target of [ui.footer,ui.plus,ui.toolbar,ui.presentation]){
    target.focus();const undo=f.key(target);assert.equal(undo.handled,true,target.className);await drain(f);
    assert.equal(f.files.has(file.path),false);const redo=f.key(target,{shiftKey:true});assert.equal(redo.handled,true);await drain(f);
    assert.equal(f.files.has(file.path),true);
  }
  assert.equal(f.calls.trash.length,4);assert.equal(f.calls.nativeUndo,0);assert.equal(f.calls.nativeRedo,0);
});

test('a non-editable Base widget nested inside CodeMirror can undo while real text controls keep text undo',async t=>{
  const f=fixture(t,{type:'kanban'}),ui=mountSurface(f,true),file=await f.created();f.menu.close();
  assert.equal(f.key(ui.footer).handled,true,'contenteditable=false overrides the outer cm-content editor');await drain(f);assert.equal(f.files.has(file.path),false);
  assert.equal(f.key(ui.plus,{shiftKey:true}).handled,true);await drain(f);
  for(const html of ['<input>','<textarea></textarea>','<div contenteditable="true"><span>Text</span></div>','<div contenteditable="plaintext-only">Text</div>']){
    const holder=f.doc.createElement('div');holder.innerHTML=html;ui.presentation.append(holder);const target=holder.querySelector('span')??holder.firstChild;
    assert.equal(f.key(target).handled,false,html);assert.equal(f.key(target,{shiftKey:true}).handled,false,html);holder.remove();
  }
  assert.equal(f.key(ui.footer,{isComposing:true}).handled,false);
  const prose=f.doc.createElement('span');ui.preview.querySelector('.cm-content').append(prose);assert.equal(f.key(prose).handled,false);
  assert.equal(f.calls.trash.length,1);
});

test('reading-root fallback excludes ordinary note text, a different pane and unrelated controls',async t=>{
  const f=fixture(t,{type:'kanban'}),ui=mountSurface(f);await f.created();f.menu.close();
  const paragraph=f.doc.createElement('p'),link=f.doc.createElement('a');link.href='#';paragraph.append(link);ui.preview.append(paragraph);
  const other=f.doc.createElement('div');other.className='workspace-leaf';other.innerHTML='<div class="markdown-preview-view" tabindex="-1"></div>';f.doc.body.append(other);
  for(const target of [paragraph,link,other.firstChild,f.doc.querySelector('#outside')])assert.equal(f.key(target).handled,false);
  ui.leaf.classList.remove('mod-active');other.classList.add('mod-active');assert.equal(f.key(ui.preview).handled,false);assert.equal(f.key(f.doc.body).handled,false);
  assert.equal(f.calls.trash.length,0);
});

test('removing custom presentation for appearance comparison preserves creation history through native controls',async t=>{
  const f=fixture(t,{type:'kanban'}),ui=mountSurface(f),file=await f.created();f.menu.close();
  ui.dispose();ui.dispose();ui.presentation.remove();
  const detached=f.key(ui.presentation);assert.notEqual(detached.handled,true,'removed custom DOM no longer owns shortcuts');assert.equal(detached.event.defaultPrevented,false);
  assert.equal(f.key(f.container).handled,true);await drain(f);assert.equal(f.files.has(file.path),false);
  assert.equal(f.key(ui.toolbar,{shiftKey:true}).handled,true);await drain(f);assert.equal(f.files.has(file.path),true);
  f.history.clear();assert.equal(f.key(f.container).handled,false);assert.equal(f.key(ui.toolbar).handled,false);
});

test('repeated new items and quick keyboard undo/redo remain ordered without skipping records',async t=>{
  const f=fixture(t,{type:'kanban'}),ui=mountSurface(f),files=[await f.created(),await f.created(),await f.created()];f.menu.close();
  for(let i=0;i<3;i++)assert.equal(f.key(ui.footer).handled,true);
  await drain(f);assert.equal(f.files.size,0);assert.deepEqual(f.calls.trash.map(x=>x.file),[...files].reverse());
  for(let i=0;i<3;i++)assert.equal(f.key(ui.footer,{shiftKey:true}).handled,true);
  await drain(f);assert.deepEqual([...f.files.keys()],files.map(file=>file.path));assert.equal(f.view.undoStack.length,3);assert.equal(f.view.redoStack.length,0);
});

test('an undo requested from the creation surface while file creation is pending runs after capture',async t=>{
  const f=fixture(t,{type:'kanban'}),ui=mountSurface(f);let release,started;
  const creating=new Promise(resolve=>{started=resolve;});f.setCreateHook(()=>new Promise(resolve=>{release=resolve;started();}));
  const opening=f.created();await creating;
  const request=f.key(ui.footer);assert.equal(request.handled,true);assert.equal(request.event.defaultPrevented,true);
  release();const file=await opening;await drain(f);assert.equal(f.files.has(file.path),false);assert.equal(f.calls.trash.length,1);assert.equal(f.view.redoStack.length,1);
});

test('explicit database commands use reading-root history while checked commands never mutate it',async t=>{
  const f=fixture(t,{type:'cards'}),ui=mountSurface(f),file=await f.created();f.menu.close();ui.preview.focus();
  assert.equal(f.history.command(false,true),true);assert.equal(f.files.get(file.path),file);assert.equal(f.calls.trash.length,0);
  assert.equal(f.history.command(false,false),true);await drain(f);assert.equal(f.files.has(file.path),false);
  assert.equal(f.history.command(true,true),true);assert.equal(f.files.has(file.path),false);
  assert.equal(f.history.command(true,false),true);await drain(f);assert.equal(f.files.has(file.path),true);
});

test('folder-group creation bypasses the native menu but still captures exact returned files for undo and redo',async t=>{
  const f=fixture(t,{type:'kanban',folder:true}),ui=mountSurface(f),folder={path:'Projects/Active'};f.folders.set(folder.path,folder);
  const group={key:new f.StringValue(folder.path)};await f.view.createNoteInGroup(group);
  assert.equal(f.calls.open,0,'the native folder branch does not open the menu');assert.equal(f.files.size,1);assert.equal(f.view.undoStack.length,1);
  const file=[...f.files.values()][0];assert.equal(file.path,'Projects/Active/Untitled 1.md');assert.equal(f.content.get(file),'');
  assert.equal(f.key(ui.footer).handled,true);await drain(f);assert.equal(f.files.size,0);
  assert.equal(f.key(ui.footer,{shiftKey:true}).handled,true);await drain(f);assert.equal(f.files.get(file.path).path,file.path);assert.equal(f.content.get(f.files.get(file.path)),'');
});

test('folder-group unavailable/read-only requests never invent a created-file history record',async t=>{
  for(const reason of ['missing','readonly']){
    const f=fixture(t,{type:'kanban',folder:true});mountSurface(f);const folder={path:'Projects/Active'};
    if(reason==='readonly'){f.folders.set(folder.path,folder);f.view.isReadOnly=true;}
    await f.view.createNoteInGroup({key:new f.StringValue(folder.path)});
    assert.equal(f.files.size,0,reason);assert.equal(f.view.undoStack.length,0,reason);assert.equal(f.calls.trash.length,0,reason);
  }
});

test('rapid folder-group requests serialize creation and preserve all undo steps',async t=>{
  const f=fixture(t,{type:'kanban',folder:true}),ui=mountSurface(f),folder={path:'Projects/Active'};f.folders.set(folder.path,folder);const group={key:new f.StringValue(folder.path)};
  await Promise.all([f.view.createNoteInGroup(group),f.view.createNoteInGroup(group),f.view.createNoteInGroup(group)]);
  const paths=[...f.files.keys()];assert.equal(paths.length,3);assert.equal(f.view.undoStack.length,3);
  for(let i=0;i<3;i++)assert.equal(f.key(ui.footer).handled,true);await drain(f);assert.equal(f.files.size,0);
  assert.deepEqual(f.calls.trash.map(item=>item.file.path),[...paths].reverse());
});

test('an untouched creation title can queue undo before its initial snapshot read resolves',async t=>{
  const f=fixture(t,{type:'cards'});mountSurface(f);let release,started;
  const reading=new Promise(resolve=>{started=resolve;});f.setReadHook(file=>new Promise(resolve=>{release=()=>resolve(f.content.get(file));started();}));
  const opening=f.created();await reading;const title=f.menu.popover.hoverEl.firstChild;
  const request=f.key(title);assert.equal(request.handled,true);assert.equal(request.event.defaultPrevented,true);
  f.setReadHook(null);release();const file=await opening;await drain(f);
  assert.equal(f.files.has(file.path),false);assert.equal(f.calls.trash.length,1);
});

test('a hidden old database in the active leaf cannot receive body or reading-root fallback',async t=>{
  const f=fixture(t,{type:'kanban'}),ui=mountSurface(f),file=await f.created();f.menu.close();
  for(const root of [f.container,ui.host,ui.presentation])root.checkVisibility=()=>false;
  assert.equal(f.key(f.doc.body).handled,false);assert.equal(f.key(ui.preview).handled,false);
  assert.equal(f.files.get(file.path),file);assert.equal(f.calls.trash.length,0);
});

test('keyboard shortcuts on separate database surfaces never undo the other database history',async t=>{
  const f=fixture(t,{type:'kanban'}),first=mountSurface(f),a=await f.created();f.menu.close();
  const container=f.doc.createElement('div');container.className='bases-cards-container';container.tabIndex=0;first.leaf.append(container);
  const view={type:'cards',_loaded:true,containerEl:container,config:{...f.view.config,name:'Second gallery'},undoStack:[],redoStack:[],
    getEphemeralState:f.view.getEphemeralState,setEphemeralState:f.view.setEphemeralState,
    createTransaction:f.original.transaction,undoTransaction:f.original.undo,redoTransaction:f.original.redo};
  const menu={app:f.app,open:f.original.open,close:f.menu.close,newlyCreatedFile:null};
  const controller={view,newItemMenu:menu,requestNotifyView(){}};view.queryController=controller;menu.queryController=controller;
  f.history.attach(view);const secondFixture={...f,view,menu,controller,container};const second=mountSurface(secondFixture);
  await menu.open();const b=menu.newlyCreatedFile;menu.close();
  assert.equal(f.key(first.footer).handled,true);await drain(f);
  assert.equal(f.files.has(a.path),false);assert.equal(f.files.get(b.path),b);
  assert.equal(f.key(second.footer,{metaKey:false,ctrlKey:true}).handled,true);await drain(secondFixture);
  assert.equal(f.files.has(b.path),false);assert.equal(f.calls.trash.length,2);
  assert.equal(f.key(first.footer,{metaKey:false,ctrlKey:true,shiftKey:true}).handled,true);await drain(f);
  assert.equal(f.files.has(a.path),true);assert.equal(f.files.has(b.path),false);
});

test('a board state change is undone before its card creation and restored after redo creation',async t=>{
  const f=fixture(t,{type:'kanban'}),ui=mountSurface(f),file=await f.created(),baseline=f.content.get(file);f.menu.close();
  await f.edit(file,'---\n领域: []\n状态: "发布"\n---\n');
  assert.equal(f.key(ui.footer).handled,true);await drain(f);assert.equal(f.content.get(file),baseline);assert.equal(f.files.get(file.path),file);
  assert.equal(f.key(ui.footer).handled,true);await drain(f);assert.equal(f.files.has(file.path),false);
  assert.equal(f.key(ui.footer,{shiftKey:true}).handled,true);await drain(f);assert.equal(f.files.has(file.path),true);
  assert.equal(f.key(ui.footer,{shiftKey:true}).handled,true);await drain(f);assert.equal(f.props(f.files.get(file.path)).状态,'发布');
});

function ownSession(f,ui,id='primary-note',file=f.put('Dashboard.md','Dashboard body')){
  const leaf={__leaf:true,id,view:{file,containerEl:ui.preview}};f.leaves.push(leaf);f.history.attach(f.view);return leaf;
}
function rebuildView(f,owner,options={}){
  const host=f.doc.createElement('div');host.className='bases-view';
  const header=f.doc.createElement('div');header.className='bases-header';
  const container=f.doc.createElement('div');container.className='bases-native-renderer';container.tabIndex=0;
  const presentation=f.doc.createElement('div');presentation.className='bui-presentation';presentation.tabIndex=-1;
  const footer=f.doc.createElement('button');footer.textContent='New';presentation.append(footer);
  host.append(container,presentation);owner.view.containerEl.append(header,host);
  const view={type:options.type??f.view.type,_loaded:true,containerEl:container,
    config:{...f.view.config,name:options.name??f.view.config.name,query:{...f.view.config.query,file:options.base??f.view.config.query.file}},
    undoStack:[],redoStack:[],getEphemeralState:f.view.getEphemeralState,setEphemeralState:f.view.setEphemeralState,
    createTransaction:f.original.transaction,undoTransaction:f.original.undo,redoTransaction:f.original.redo};
  const menu={app:f.app,open:f.original.open,close:f.menu.close,newlyCreatedFile:null};
  const controller={view,newItemMenu:menu,viewContainerEl:host,viewHeaderEl:header,requestNotifyView(){}};
  view.queryController=controller;if(!options.placeholder)menu.queryController=controller;
  f.history.attach(view);const dispose=f.history.registerSurface(view,presentation);
  return{...f,container,view,menu,controller,ui:{host,header,presentation,footer,dispose}};
}
function unmountView(f,ui){f.menu.close();f.view._loaded=false;ui.host.remove();f.history.prune();}

test('scroll-remount in the same open note restores creation and property undo/redo in order',async t=>{
  const f=fixture(t,{type:'kanban'}),ui=mountSurface(f),owner=ownSession(f,ui),file=await f.created(),baseline=f.content.get(file);
  f.menu.close();await f.edit(file,'---\n领域: []\n状态: "发布"\n---\n');unmountView(f,ui);
  const fresh=rebuildView(f,owner);assert.equal(fresh.view.undoStack.length,2);
  assert.equal(f.key(fresh.ui.footer).handled,true);await drain(fresh);assert.equal(f.content.get(file),baseline);
  assert.equal(f.key(fresh.ui.footer).handled,true);await drain(fresh);assert.equal(f.files.has(file.path),false);
  assert.equal(f.key(fresh.ui.footer,{shiftKey:true}).handled,true);await drain(fresh);
  assert.equal(f.key(fresh.ui.footer,{shiftKey:true}).handled,true);await drain(fresh);
  assert.equal(f.props(f.files.get(file.path)).状态,'发布');assert.equal(fresh.view.undoStack.length,2);
});

test('redo history also survives an off-screen destruction followed by a new Base instance',async t=>{
  const f=fixture(t,{type:'cards'}),ui=mountSurface(f),owner=ownSession(f,ui),file=await f.created();f.menu.close();await f.view.undoTransaction();
  assert.equal(f.files.has(file.path),false);unmountView(f,ui);const fresh=rebuildView(f,owner);
  assert.equal(fresh.view.redoStack.length,1);assert.equal(f.key(fresh.ui.footer,{shiftKey:true}).handled,true);await drain(fresh);
  assert.equal(f.files.has(file.path),true);assert.equal(fresh.view.undoStack.length,1);
});

test('hidden loading duplicates cannot consume suspended history before the actual query owner mounts',async t=>{
  const f=fixture(t,{type:'kanban'}),ui=mountSurface(f),owner=ownSession(f,ui),file=await f.created();unmountView(f,ui);
  const placeholder=rebuildView(f,owner,{placeholder:true});placeholder.ui.host.hidden=true;
  f.history.attach(placeholder.view);f.history.prune();assert.equal(placeholder.view.undoStack.length,0);
  const real=rebuildView(f,owner);assert.equal(real.view.undoStack.length,1);assert.equal(placeholder.view.undoStack.length,0);
  assert.equal(f.key(real.ui.footer).handled,true);await drain(real);assert.equal(f.files.has(file.path),false);
});

test('changing the note in an existing leaf never gives its previous note history to the new note',async t=>{
  const f=fixture(t,{type:'kanban'}),ui=mountSurface(f),owner=ownSession(f,ui),file=await f.created();unmountView(f,ui);
  owner.view.file=f.put('Different dashboard.md','Another body');f.history.prune();const fresh=rebuildView(f,owner);
  assert.equal(fresh.view.undoStack.length,0);assert.equal(f.key(fresh.ui.footer).handled,false);assert.equal(f.files.get(file.path),file);
});

test('another leaf showing the same Markdown and Base cannot inherit the first leaf history',async t=>{
  const f=fixture(t,{type:'kanban'}),ui=mountSurface(f),owner=ownSession(f,ui),file=await f.created();unmountView(f,ui);
  const container=f.doc.createElement('div');container.className='markdown-preview-view';
  const element=f.doc.createElement('div');element.className='workspace-leaf';element.append(container);f.doc.body.append(element);
  const other={__leaf:true,id:'different-pane',view:{file:owner.view.file,containerEl:container}};f.leaves.push(other);
  const fresh=rebuildView(f,other);assert.equal(fresh.view.undoStack.length,0);assert.equal(f.key(fresh.ui.footer).handled,false);
  const original=rebuildView(f,owner);assert.equal(original.view.undoStack.length,1);assert.equal(f.key(original.ui.footer).handled,true);await drain(original);assert.equal(f.files.has(file.path),false);
});

test('plugin clear destroys suspended sessions so new instances cannot revive old undo records',async t=>{
  const f=fixture(t,{type:'kanban'}),ui=mountSurface(f),owner=ownSession(f,ui),file=await f.created();unmountView(f,ui);f.history.clear();
  const fresh=rebuildView(f,owner);assert.equal(fresh.view.undoStack.length,0);assert.equal(fresh.view.redoStack.length,0);assert.equal(f.files.get(file.path),file);
});

test('a different Base path, view name or view type never claims the previous view session',async t=>{
  for(const options of [{name:'Other board'},{type:'cards'},{base:'Bases/Other.base'}]){
    const f=fixture(t,{type:'kanban'}),ui=mountSurface(f),owner=ownSession(f,ui),file=await f.created();unmountView(f,ui);
    const different=rebuildView(f,owner,options);assert.equal(different.view.undoStack.length,0,JSON.stringify(options));assert.equal(f.key(different.ui.footer).handled,false);
    const original=rebuildView(f,owner);assert.equal(original.view.undoStack.length,1);assert.equal(f.files.get(file.path),file);
  }
});

test('temporary DOM virtualization with the native instance still loaded retains its history on reattachment',async t=>{
  const f=fixture(t,{type:'kanban'}),ui=mountSurface(f),owner=ownSession(f,ui),file=await f.created();f.menu.close();
  ui.host.remove();assert.equal(f.view._loaded,true);f.history.prune();
  owner.view.containerEl.append(ui.host);f.history.attach(f.view);assert.equal(f.view.undoStack.length,1);
  assert.equal(f.key(ui.footer).handled,true);await drain(f);assert.equal(f.files.has(file.path),false);
  assert.equal(f.key(ui.footer,{shiftKey:true}).handled,true);await drain(f);assert.equal(f.files.has(file.path),true);
});

test('creation finishing after a temporary DOM detach is still captured for its owning reading note',async t=>{
  const f=fixture(t,{type:'kanban'}),ui=mountSurface(f);ownSession(f,ui);let release,started;
  const creating=new Promise(resolve=>{started=resolve;});f.setCreateHook(()=>new Promise(resolve=>{release=resolve;started();}));
  const opening=f.created();await creating;ui.host.remove();f.history.prune();assert.equal(f.view._loaded,true);
  release();const file=await opening;f.menu.close();assert.equal(f.view.undoStack.length,1);
  ui.preview.focus();assert.equal(f.key(ui.preview).handled,true);await drain(f);assert.equal(f.files.has(file.path),false);
});

test('a reused instance changing Base scope does not carry undo to the new name or type',async t=>{
  for(const change of ['name','type','base']){
    const f=fixture(t,{type:'kanban'}),ui=mountSurface(f);ownSession(f,ui);const file=await f.created();f.menu.close();
    const original={name:f.view.config.name,type:f.view.type,base:f.view.config.query.file};
    if(change==='name')f.view.config.name='Different view';
    else if(change==='type')f.view.type='cards';
    else f.view.config.query.file='Bases/Different.base';
    f.history.attach(f.view);assert.equal(f.view.undoStack.length,0,change);assert.equal(f.key(ui.footer).handled,false,change);
    f.view.config.name=original.name;f.view.type=original.type;f.view.config.query.file=original.base;f.history.attach(f.view);
    assert.equal(f.view.undoStack.length,1,change);assert.equal(f.key(ui.footer).handled,true,change);await drain(f);assert.equal(f.files.has(file.path),false,change);
  }
});

function staleSavedEditor(f,file,baseline,stale){
  const editor={getValue:()=>stale};
  const child={file,editor};
  const owner={file,editor,data:baseline,lastSavedData:stale,dirty:false,saveAgain:false,_children:[child]};
  f.menu.popover.embed=owner;
  return{editor,child,owner};
}

test('undoing a property then creation tolerates a clean editor still displaying its last-saved old properties',async t=>{
  const f=fixture(t,{type:'kanban'}),ui=mountSurface(f),file=await f.created(),baseline=f.content.get(file);
  const changed='---\n领域: []\n状态: "发布"\n---\n';await f.edit(file,changed);
  const {editor,child,owner}=staleSavedEditor(f,file,baseline,changed);
  // The same editor is reachable through a child before its MarkdownView owner.
  // Missing state on that alias must not outweigh the authoritative clean owner.
  f.leaves.push({_children:[child,owner]});
  assert.equal(f.key(ui.footer).handled,true);await drain(f);assert.equal(f.content.get(file),baseline);assert.equal(editor.getValue(),changed);
  assert.equal(f.key(ui.footer).handled,true);await drain(f);assert.equal(f.files.has(file.path),false);assert.equal(f.calls.trash.length,1);
});

test('clean stale-editor recognition requires matching authoritative data and an unchanged last-saved display',async t=>{
  for(const reason of ['typed-after-save','dirty','saving-again','unknown-clean-state','wrong-current-data','missing-current-data','missing-last-saved']){
    const f=fixture(t),file=await f.created(),baseline=f.content.get(file),stale='---\n领域: ["AI"]\n---\n';
    const {owner,editor}=staleSavedEditor(f,file,baseline,stale);
    if(reason==='typed-after-save')editor.getValue=()=>stale+'User draft';
    else if(reason==='dirty')owner.dirty=true;
    else if(reason==='saving-again')owner.saveAgain=true;
    else if(reason==='unknown-clean-state')delete owner.dirty;
    else if(reason==='wrong-current-data')owner.data=stale;
    else if(reason==='missing-current-data')delete owner.data;
    else delete owner.lastSavedData;
    const marker=f.view.undoStack.at(-1);await f.view.undoTransaction();
    assert.equal(f.files.get(file.path),file,reason);assert.equal(f.calls.trash.length,0,reason);assert.equal(f.view.undoStack.at(-1),marker,reason);
  }
});

test('an unknown child with its own distinct editor still blocks deletion beside a recognized stale editor',async t=>{
  const f=fixture(t),file=await f.created(),baseline=f.content.get(file),stale='---\n领域: ["AI"]\n---\n';
  const {owner}=staleSavedEditor(f,file,baseline,stale);
  owner._children.push({file,editor:{getValue:()=>stale+'Unsaved child document'}});
  await f.view.undoTransaction();assert.equal(f.files.get(file.path),file);assert.equal(f.calls.trash.length,0);
});

test('a different open editor draft blocks deletion even when the popup editor is only stale saved display',async t=>{
  const f=fixture(t),file=await f.created(),baseline=f.content.get(file),stale='---\n领域: ["AI"]\n---\n';
  staleSavedEditor(f,file,baseline,stale);f.leaves.push({file,editor:{getValue:()=>baseline+'Unsaved independent editor'},dirty:true});
  await f.view.undoTransaction();assert.equal(f.files.get(file.path),file);assert.equal(f.calls.trash.length,0);
});

test('closing a recognized stale popup must not delete a file whose close handler flushes changed content',async t=>{
  const f=fixture(t),file=await f.created(),baseline=f.content.get(file),stale='---\n领域: ["AI"]\n---\n';
  staleSavedEditor(f,file,baseline,stale);const originalClose=f.menu.close;let closed=0;
  f.menu.close=function(){closed++;f.content.set(file,stale);return originalClose.call(this);};
  const marker=f.view.undoStack.at(-1);await f.view.undoTransaction();
  assert.equal(closed,1,'clean stale popup reaches normal native close');assert.equal(f.content.get(file),stale);
  assert.equal(f.files.get(file.path),file);assert.equal(f.calls.trash.length,0);assert.equal(f.view.undoStack.at(-1),marker);
});

test('explicit dirty evidence on a shared editor overrides a clean stale-display owner',async t=>{
  const f=fixture(t),file=await f.created(),baseline=f.content.get(file),stale='---\n领域: ["AI"]\n---\n';
  const {owner,editor}=staleSavedEditor(f,file,baseline,stale);
  owner._children.push({file,editor,dirty:true});await f.view.undoTransaction();
  assert.equal(f.files.get(file.path),file);assert.equal(f.calls.trash.length,0);assert.equal(f.view.undoStack.length,1);
});

function changeScope(f,change){
  const original={name:f.view.config.name,type:f.view.type,base:f.view.config.query.file};
  if(change==='name')f.view.config.name='Other view';else if(change==='type')f.view.type='cards';else f.view.config.query.file='Bases/Other.base';
  f.history.attach(f.view);
  return()=>{f.view.config.name=original.name;f.view.type=original.type;f.view.config.query.file=original.base;f.history.attach(f.view);};
}

test('switching a reused view scope parks both property and creation undo, then restores their order on return',async t=>{
  for(const change of ['name','type','base']){
    const f=fixture(t,{type:'kanban'}),ui=mountSurface(f);ownSession(f,ui);const file=await f.created();f.menu.close();
    await f.edit(file,'---\n领域: ["Blender"]\n---\n');const restore=changeScope(f,change);
    assert.equal(f.view.undoStack.length,0,change);assert.equal(f.view.redoStack.length,0,change);
    assert.equal(f.key(ui.footer).handled,false,change);assert.deepEqual(f.props(file).领域,['Blender'],change);
    restore();assert.equal(f.view.undoStack.length,2,change);
    assert.equal(f.key(ui.footer).handled,true);await drain(f);assert.deepEqual(f.props(file).领域,[]);assert.equal(f.files.get(file.path),file);
    assert.equal(f.key(ui.footer).handled,true);await drain(f);assert.equal(f.files.has(file.path),false);
  }
});

test('switching a reused view scope parks redo transactions as well as the remaining creation undo',async t=>{
  for(const change of ['name','type','base']){
    const f=fixture(t,{type:'kanban'}),ui=mountSurface(f);ownSession(f,ui);const file=await f.created();f.menu.close();
    await f.edit(file,'---\n领域: ["Blender"]\n---\n');await f.view.undoTransaction();assert.deepEqual(f.props(file).领域,[]);
    const restore=changeScope(f,change);assert.equal(f.view.undoStack.length,0,change);assert.equal(f.view.redoStack.length,0,change);
    assert.equal(f.key(ui.footer,{shiftKey:true}).handled,false,change);assert.deepEqual(f.props(file).领域,[]);
    restore();assert.equal(f.view.undoStack.length,1,change);assert.equal(f.view.redoStack.length,1,change);
    assert.equal(f.key(ui.footer,{shiftKey:true}).handled,true);await drain(f);assert.deepEqual(f.props(file).领域,['Blender']);assert.equal(f.view.undoStack.length,2);
  }
});

test('unowned native transactions follow their suspended scope instead of leaking into a reused view',async t=>{
  for(const change of ['name','type','base']){
    const f=fixture(t,{type:'kanban'}),ui=mountSurface(f);ownSession(f,ui);const file=f.put('Projects/Existing.md','---\nstate: "old"\n---\nBody');
    await f.edit(file,'new',true);const original=f.view.undoStack.at(-1),restore=changeScope(f,change);
    assert.equal(f.view.undoStack.length,0,change);assert.equal(f.key(ui.footer).handled,false,change);assert.equal(f.props(file).state,'new');
    restore();assert.equal(f.view.undoStack.at(-1),original);assert.equal(f.key(ui.footer).handled,true);await drain(f);
    assert.equal(f.props(file).state,'old');assert.equal(f.calls.nativeUndo,1,'unowned native history remains native after return');
  }
});

test('reusing a Base instance after switching its owning Markdown note clears prior creation and property history',async t=>{
  const f=fixture(t,{type:'kanban'}),ui=mountSurface(f),owner=ownSession(f,ui),source=owner.view.file,file=await f.created();f.menu.close();
  await f.edit(file,'---\n领域: ["Blender"]\n---\n');await f.view.undoTransaction();
  owner.view.file=f.put('Another dashboard.md','Another body');f.history.attach(f.view);
  assert.equal(f.view.undoStack.length,0);assert.equal(f.view.redoStack.length,0);assert.equal(f.key(ui.footer).handled,false);assert.equal(f.key(ui.footer,{shiftKey:true}).handled,false);
  owner.view.file=source;f.history.attach(f.view);f.history.prune();
  assert.equal(f.view.undoStack.length,0);assert.equal(f.view.redoStack.length,0);assert.deepEqual(f.props(file).领域,[]);assert.equal(f.files.get(file.path),file);
});

test('creation completed in an off-screen instance migrates to an already-mounted replacement in the same session',async t=>{
  const f=fixture(t,{type:'kanban'}),ui=mountSurface(f),owner=ownSession(f,ui);let release,started;
  const creating=new Promise(resolve=>{started=resolve;});f.setCreateHook(()=>new Promise(resolve=>{release=resolve;started();}));
  const opening=f.created();await creating;ui.host.remove();f.history.prune();
  const fresh=rebuildView(f,owner);assert.equal(fresh.view.undoStack.length,0);
  f.setCreateHook(null);release();const file=await opening;f.menu.close();f.history.prune();f.history.attach(fresh.view);
  await drain(fresh);
  assert.equal(fresh.view.undoStack.length,1);assert.equal(f.key(fresh.ui.footer).handled,true);await drain(fresh);
  assert.equal(f.files.has(file.path),false);assert.equal(f.calls.trash.length,1);
  assert.equal(f.key(fresh.ui.footer,{shiftKey:true}).handled,true);await drain(fresh);assert.equal(f.files.has(file.path),true);
});

test('undo from a newly mounted replacement can wait for the original pending creation to finish',async t=>{
  const f=fixture(t,{type:'kanban'}),ui=mountSurface(f),owner=ownSession(f,ui);let release,started;
  const creating=new Promise(resolve=>{started=resolve;});f.setCreateHook(()=>new Promise(resolve=>{release=resolve;started();}));
  const opening=f.created();await creating;ui.host.remove();f.history.prune();const fresh=rebuildView(f,owner);
  const undo=f.key(fresh.ui.footer);assert.equal(undo.handled,true);assert.equal(undo.event.defaultPrevented,true);
  f.setCreateHook(null);release();const file=await opening;await drain(fresh);
  assert.equal(f.files.has(file.path),false);assert.equal(f.calls.trash.length,1);assert.equal(fresh.view.redoStack.length,1);
  assert.equal(f.key(fresh.ui.footer,{shiftKey:true}).handled,true);await drain(fresh);assert.equal(f.files.has(file.path),true);
});

test('a replacement view queues its second creation after the original pending creation and retains chronological undo',async t=>{
  const f=fixture(t,{type:'kanban'}),ui=mountSurface(f),owner=ownSession(f,ui);let release,started;
  const creating=new Promise(resolve=>{started=resolve;});f.setCreateHook(()=>new Promise(resolve=>{release=resolve;started();}));
  const opening=f.created();await creating;ui.host.remove();f.history.prune();const fresh=rebuildView(f,owner);
  const next=fresh.menu.open();await Promise.resolve();assert.equal(f.calls.create.length,1,'replacement has not created ahead of the suspended capture');
  f.setCreateHook(null);release();const first=await opening;await next;const second=fresh.menu.newlyCreatedFile;f.menu.close();fresh.menu.close();await drain(fresh);
  assert.notEqual(second,first);assert.equal(f.files.size,3);assert.equal(fresh.view.undoStack.length,2);
  assert.equal(f.key(fresh.ui.footer).handled,true);await drain(fresh);assert.equal(f.files.has(second.path),false);assert.equal(f.files.get(first.path),first);
  assert.equal(f.key(fresh.ui.footer).handled,true);await drain(fresh);assert.deepEqual([...f.files.values()],[owner.view.file]);
  assert.deepEqual(f.calls.trash.map(item=>item.file),[second,first]);
});

test('explicit mobile actions target their own Base even when another database was used last',async t=>{
  const f=fixture(t,{type:'kanban'}),ui=mountSurface(f),owner=ownSession(f,ui);
  const first=await f.created();f.menu.close();
  const second=rebuildView(f,owner,{base:'Bases/Second.base',name:'Other database'});
  await second.menu.open();const other=second.menu.newlyCreatedFile;second.menu.close();
  assert.equal(f.history.forView(f.view,false,true),true);assert.equal(f.history.forView(second.view,false,true),true);
  assert.equal(f.calls.trash.length,0,'availability checks cannot mutate either database');
  assert.equal(f.history.forView(f.view,false,false),true);await drain(f);
  assert.equal(f.files.has(first.path),false);assert.equal(f.files.get(other.path),other);assert.equal(second.view.undoStack.length,1);
  assert.equal(f.history.forView(f.view,true,false),true);await drain(f);
  assert.equal(f.files.has(first.path),true);assert.equal(f.files.get(other.path),other);
});

test('explicit mobile history actions reject unowned, read-only, unloaded and replaced query views',async t=>{
  for(const blocked of ['unknown','read-only-view','read-only-query','unloaded','replaced-owner']){
    const f=fixture(t),file=await f.created();f.menu.close();let target=f.view;
    if(blocked==='unknown')target={...f.view};
    else if(blocked==='read-only-view')f.view.isReadOnly=true;
    else if(blocked==='read-only-query')f.controller.isReadOnly=true;
    else if(blocked==='unloaded')f.view._loaded=false;
    else f.controller.view={};
    assert.equal(f.history.forView(target,false,true),false,blocked);assert.equal(f.history.forView(target,false,false),false,blocked);
    assert.equal(f.files.get(file.path),file,blocked);assert.equal(f.calls.trash.length,0,blocked);
  }
});

test('mobile undo queued before native creation completes removes precisely that newly captured file',async t=>{
  const f=fixture(t,{type:'kanban'}),ui=mountSurface(f);ownSession(f,ui);let release,started;
  const began=new Promise(resolve=>{started=resolve;});f.setCreateHook(()=>new Promise(resolve=>{release=resolve;started();}));
  const opening=f.created();await began;
  assert.equal(f.view.undoStack.length,0);assert.equal(f.history.forView(f.view,false,true),true);
  assert.equal(f.history.forView(f.view,true,true),false,'a pending creation is not a redo');
  assert.equal(f.history.forView(f.view,false,false),true);release();f.setCreateHook(null);const file=await opening;await drain(f);
  assert.equal(f.files.has(file.path),false);assert.equal(f.view.undoStack.length,0);assert.equal(f.view.redoStack.length,1);
});

test('mobile undo honours the existing unsaved-draft guard instead of deleting the newly created note',async t=>{
  const f=fixture(t),file=await f.created();f.menu.popover.embed.editor.getValue=()=>f.content.get(file)+'Draft from the soft keyboard';
  assert.equal(f.history.forView(f.view,false,false),true);await drain(f);
  assert.equal(f.files.get(file.path),file);assert.equal(f.calls.trash.length,0);assert.equal(f.view.undoStack.length,1);
});


function externalBase(f,ui,id='phone-base') {
  const file=f.put(f.view.config.query.file,'views: []');file.extension='base';
  return ownSession(f,ui,id,file);
}
function anotherBaseTab(f,options={}) {
  const container=f.doc.createElement('div'),element=f.doc.createElement('div');
  container.className='bases-view';element.className='workspace-leaf';element.append(container);f.doc.body.append(element);
  const path=options.base??f.view.config.query.file;
  let file=options.file??f.files.get(path);
  if(!file){file=f.put(path,'views: []');file.extension='base';}
  const owner={__leaf:true,id:`tab-${f.leaves.length}`,view:{file,containerEl:container}};f.leaves.push(owner);
  return {...rebuildView(f,owner,options),owner,element};
}
async function editIn(f,view,file,value) {
  return view.createTransaction(async changes=>{
    const start=splitNote(f.content.get(file)).properties,end={...start,领域:[value]};
    changes.push({file,start:structuredClone(start),end:structuredClone(end)});
    await f.app.fileManager.processFrontMatter(file,properties=>{Object.assign(properties,end);});
  });
}

test('phone external Base reopened through another tab shares creation and properties in chronological undo and redo',async t=>{
  const f=fixture(t,{phone:true}),ui=mountSurface(f);externalBase(f,ui);
  f.setOpenFileHook(()=>ui.leaf.remove());
  const file=await f.created(),baseline=f.content.get(file),second=anotherBaseTab(f);
  assert.equal(f.history.forView(second.view,false,true),true,'sidebar-opened tab immediately sees creation history');
  f.changed.length=0;await editIn(f,second.view,file,'Blender');
  assert(f.changed.includes(f.view));assert(f.changed.includes(second.view),'all peer buttons refresh');
  const property=second.view.undoStack.at(-1);
  await second.view.undoTransaction();assert.equal(f.content.get(file),baseline);
  await f.view.undoTransaction();assert.equal(f.files.has(file.path),false);
  await second.view.redoTransaction();const restored=f.files.get(file.path);
  assert.notEqual(restored,file);assert.equal(property.changes[0].file,restored);assert.equal(f.content.get(restored),baseline);
  await f.view.redoTransaction();assert.deepEqual(f.props(restored).领域,['Blender']);
  assert.equal(f.view.undoStack,second.view.undoStack);assert.equal(f.view.redoStack,second.view.redoStack);
  assert.deepEqual(f.calls.notices,[]);assert.equal(f.calls.phoneOpen.length,1,'native phone tab opening remains unchanged');
});

test('phone tabs serialize interleaved creation and property transactions and invalidate redo in every peer',async t=>{
  const f=fixture(t,{phone:true}),ui=mountSurface(f);externalBase(f,ui);
  const second=anotherBaseTab(f),third=anotherBaseTab(f);let release,started;
  const began=new Promise(resolve=>{started=resolve;});f.setCreateHook(()=>new Promise(resolve=>{release=resolve;started();}));
  const firstOpening=f.created();await began;
  const secondOpening=second.menu.open();const edited=third.view.createTransaction(async changes=>{
    const file=f.calls.phoneOpen[0].file,start=splitNote(f.content.get(file)).properties,end={...start,领域:['Blender']};
    changes.push({file,start,end});await f.app.fileManager.processFrontMatter(file,props=>Object.assign(props,end));
  });
  await Promise.resolve();assert.equal(f.calls.create.length,1);
  f.setCreateHook(null);release();const first=await firstOpening;await secondOpening;await edited;
  const secondFile=f.calls.phoneOpen[1].file;assert.equal(third.view.undoStack.length,3);
  await f.view.undoTransaction();assert.deepEqual(f.props(first).领域,[]);
  await second.view.undoTransaction();assert.equal(f.files.has(secondFile.path),false);
  await third.view.undoTransaction();assert.equal(f.files.has(first.path),false);
  assert.deepEqual(f.calls.trash.map(item=>item.file),[secondFile,first]);
  await second.view.redoTransaction();const restored=f.files.get(first.path);
  await editIn(f,third.view,restored,'Other');
  for(const peer of [f,second,third]){assert.equal(peer.view.redoStack.length,0);assert.equal(f.history.forView(peer.view,true,true),false);}
  await f.view.undoTransaction();assert.deepEqual(f.props(restored).领域,[]);
  await third.view.undoTransaction();assert.equal(f.files.has(first.path),false);
});

test('phone shared history survives source close and remount while another Base tab is open, then expires on last close',async t=>{
  const f=fixture(t,{phone:true}),ui=mountSurface(f),source=externalBase(f,ui),file=await f.created();
  const second=anotherBaseTab(f);f.leaves.splice(f.leaves.indexOf(source),1);f.history.prune();
  assert.equal(f.history.forView(f.view,false,true),false);assert.equal(second.view.undoStack.length,1);
  second.view._loaded=false;second.ui.host.remove();f.history.prune();
  const replacement=rebuildView(f,second.owner);assert.equal(replacement.view.undoStack.length,1);
  await replacement.view.undoTransaction();assert.equal(f.files.has(file.path),false);
  await replacement.view.redoTransaction();assert(f.files.has(file.path));
  f.leaves.splice(f.leaves.indexOf(second.owner),1);f.history.prune();
  const fresh=anotherBaseTab(f);assert.equal(fresh.view.undoStack.length,0);assert.equal(fresh.view.redoStack.length,0);
});

test('phone replacement tab can queue undo behind a pending creation after its source instance unloads',async t=>{
  const f=fixture(t,{phone:true}),ui=mountSurface(f),source=externalBase(f,ui);let release,started;
  const began=new Promise(resolve=>{started=resolve;});f.setCreateHook(()=>new Promise(resolve=>{release=resolve;started();}));
  const opening=f.created();await began;
  const second=anotherBaseTab(f);f.view._loaded=false;f.leaves.splice(f.leaves.indexOf(source),1);f.history.prune();
  assert.equal(f.history.forView(second.view,false,false),true,'shared pending count enables immediate undo');
  f.setCreateHook(null);release();const file=await opening;await drain(second);
  assert.equal(f.files.has(file.path),false);assert.equal(second.view.redoStack.length,1);assert.equal(f.calls.trash.length,1);
  await second.view.redoTransaction();assert(f.files.has(file.path));
});

test('phone Base sharing excludes other files, view names/types, placeholders, inline Bases and desktop tabs',async t=>{
  for(const variant of ['base','name','type','placeholder','inline','desktop']) {
    const f=fixture(t,{phone:variant!=='desktop'}),ui=mountSurface(f);externalBase(f,ui);const file=await f.created();
    const options=variant==='base'?{base:'Bases/Other.base'}:variant==='name'?{name:'Other view'}:
      variant==='type'?{type:'cards'}:variant==='placeholder'?{placeholder:true}:
      variant==='inline'?{base:'Dashboard.md',file:f.put('Dashboard.md','body')}:{};
    const other=anotherBaseTab(f,options);assert.equal(other.view.undoStack.length,0,variant);
    assert.equal(f.history.forView(other.view,false,true),false,variant);assert.equal(f.files.get(file.path),file,variant);
  }
});

test('phone shared history keeps read-only and unsaved-body protections when invoked from another tab',async t=>{
  const f=fixture(t,{phone:true}),ui=mountSurface(f);externalBase(f,ui);const file=await f.created(),second=anotherBaseTab(f);
  second.view.isReadOnly=true;assert.equal(f.history.forView(second.view,false,false),false);
  let edited=false;await second.view.createTransaction(async()=>{edited=true;});assert.equal(edited,false);
  second.view.isReadOnly=false;const editor={file,dirty:true,editor:{getValue:()=>f.content.get(file)+'unsaved body'}};f.leaves.push(editor);
  await second.view.undoTransaction();assert.equal(f.files.get(file.path),file);assert.equal(f.calls.trash.length,0);
  f.leaves.splice(f.leaves.indexOf(editor),1);await second.view.undoTransaction();assert.equal(f.files.has(file.path),false);
});

test('plugin clear discards phone shared records and cannot let an in-flight create resurrect them',async t=>{
  const f=fixture(t,{phone:true}),ui=mountSurface(f);externalBase(f,ui);let release,started;
  const began=new Promise(resolve=>{started=resolve;});f.setCreateHook(()=>new Promise(resolve=>{release=resolve;started();}));
  const opening=f.created();await began;const second=anotherBaseTab(f);f.history.clear();
  f.setCreateHook(null);release();const file=await opening;f.history.attach(second.view);
  assert.equal(second.view.undoStack.length,0);assert.equal(f.files.get(file.path),file);assert.equal(f.calls.trash.length,0);
});

test('phone property transaction completed after its source closes remains undoable from its peer',async t=>{
  const f=fixture(t,{phone:true}),ui=mountSurface(f),source=externalBase(f,ui),file=await f.created();
  const baseline=f.content.get(file),second=anotherBaseTab(f);let release,started;
  const began=new Promise(resolve=>{started=resolve;});
  const editing=f.view.createTransaction(async changes=>{
    const start=splitNote(baseline).properties,end={...start,领域:['Blender']};
    await new Promise(resolve=>{release=resolve;started();});
    changes.push({file,start,end});await f.app.fileManager.processFrontMatter(file,props=>Object.assign(props,end));
  });
  await began;f.leaves.splice(f.leaves.indexOf(source),1);f.history.prune();release();await editing;
  assert.equal(second.view.undoStack.length,2,'completed native property keeps its position after creation');
  await second.view.undoTransaction();assert.equal(f.content.get(file),baseline);
  await second.view.undoTransaction();assert.equal(f.files.has(file.path),false);
  await second.view.redoTransaction();await second.view.redoTransaction();assert.deepEqual(f.props(f.files.get(file.path)).领域,['Blender']);
});

test('phone native redo-stack replacement survives attachment before its transaction promise resolves',async t=>{
  const f=fixture(t,{phone:true}),ui=mountSurface(f);externalBase(f,ui);f.history.clear();
  let attached;
  f.view.createTransaction=async function(callback) {
    await f.original.transaction.call(this,callback);
    f.history.attach(f.view);attached=anotherBaseTab(f);
  };
  f.history.attach(f.view);const file=await f.created();await editIn(f,f.view,file,'Before');await f.view.undoTransaction();
  assert.equal(f.view.redoStack.length,1);
  await editIn(f,f.view,file,'After');
  assert.equal(f.view.redoStack.length,0);assert.equal(attached.view.redoStack.length,0);
  await attached.view.undoTransaction();assert.deepEqual(f.props(file).领域,[]);
  await attached.view.undoTransaction();assert.equal(f.files.has(file.path),false);
});


test('phone Home embeds of a real external Base share history with reopened Home and standalone Base tabs',async t=>{
  const f=fixture(t,{phone:true,type:'kanban'}),ui=mountSurface(f),base=f.put(f.view.config.query.file,'views: []');base.extension='base';
  const home=f.put('Home.md','External Base embed'),source=ownSession(f,ui,'home-source',home),file=await f.created();
  const reopened=anotherBaseTab(f,{file:home}),standalone=anotherBaseTab(f);
  assert.equal(reopened.view.undoStack.length,1);assert.equal(standalone.view.undoStack.length,1);
  await editIn(f,reopened.view,file,'Blender');await standalone.view.undoTransaction();await reopened.view.undoTransaction();
  assert.equal(f.files.has(file.path),false);
  f.leaves.splice(f.leaves.indexOf(source),1);f.leaves.splice(f.leaves.indexOf(standalone.owner),1);f.history.prune();
  await reopened.view.redoTransaction();await reopened.view.redoTransaction();assert.deepEqual(f.props(f.files.get(file.path)).领域,['Blender']);
  f.leaves.splice(f.leaves.indexOf(reopened.owner),1);f.history.prune();
  const fresh=anotherBaseTab(f,{file:home});assert.equal(fresh.view.undoStack.length,0);assert.equal(fresh.view.redoStack.length,0);
});

test('phone shared creation undo and redo finish their history transition when the invoking source closes during vault work',async t=>{
  const f=fixture(t,{phone:true}),ui=mountSurface(f),source=externalBase(f,ui),file=await f.created(),second=anotherBaseTab(f);
  await editIn(f,second.view,file,'Blender');await second.view.undoTransaction();const property=second.view.redoStack.at(-1);
  f.setTrashHook(()=>{f.leaves.splice(f.leaves.indexOf(source),1);f.history.prune();});
  await f.view.undoTransaction();assert.equal(f.files.has(file.path),false);assert.equal(second.view.redoStack.length,2);
  const third=anotherBaseTab(f);f.setCreateHook(()=>{f.leaves.splice(f.leaves.indexOf(second.owner),1);f.history.prune();});
  await second.view.redoTransaction();const restored=f.files.get(file.path);
  assert(restored);assert.equal(third.view.undoStack.length,1);assert.equal(third.view.redoStack.length,1);assert.equal(property.changes[0].file,restored);
  await third.view.redoTransaction();assert.deepEqual(f.props(restored).领域,['Blender']);assert.deepEqual(f.calls.notices,[]);
});

test('phone property undo completed while its source closes advances shared history exactly once',async t=>{
  const f=fixture(t,{phone:true}),ui=mountSurface(f),source=externalBase(f,ui),file=await f.created(),second=anotherBaseTab(f);
  await editIn(f,f.view,file,'Blender');const process=f.app.fileManager.processFrontMatter;
  f.app.fileManager.processFrontMatter=async function(...args){
    await process.apply(this,args);f.leaves.splice(f.leaves.indexOf(source),1);f.history.prune();
  };
  await f.view.undoTransaction();assert.deepEqual(f.props(file).领域,[]);assert.equal(second.view.undoStack.length,1);assert.equal(second.view.redoStack.length,1);
  f.app.fileManager.processFrontMatter=process;await second.view.undoTransaction();assert.equal(f.files.has(file.path),false);
});

test('phone placeholder promoted in place to the real query owner joins existing shared history',async t=>{
  const f=fixture(t,{phone:true}),ui=mountSurface(f);externalBase(f,ui);const file=await f.created();
  const placeholder=anotherBaseTab(f,{placeholder:true});assert.equal(placeholder.view.undoStack.length,0);
  f.changed.length=0;placeholder.menu.queryController=placeholder.controller;f.history.attach(placeholder.view);
  assert.equal(placeholder.view.undoStack.length,1);assert.equal(placeholder.view.undoStack,f.view.undoStack);
  assert(f.changed.includes(placeholder.view),'promotion refreshes the newly available undo button');
  f.history.attach(placeholder.view);assert.equal(placeholder.view.undoStack.length,1,'repeated attachment cannot duplicate history');
  await placeholder.view.undoTransaction();assert.equal(f.files.has(file.path),false);
  await f.view.redoTransaction();assert(f.files.has(file.path));assert.equal(placeholder.view.redoStack.length,0);
});


test('partially initialized native config getters cannot abort creation and are retried after initialization',async t=>{
  const f=fixture(t);f.history.clear();
  const config=f.view.config;let getterReads=0;
  delete f.view.config;
  Object.defineProperty(f.view,'isGroupedByFolder',{configurable:true,get(){getterReads++;return this.config.groupBy?.property==='file.folder';}});
  assert.doesNotThrow(()=>f.history.attach(f.view));
  assert.equal(getterReads,0,'config readiness is checked before computed native flags');
  assert.equal(f.menu.open,f.original.open);assert.equal(f.view.undoTransaction,f.original.undo);
  // The native constructor may fill config before another dependent field.
  f.view.config=config;let ready=false;
  Object.defineProperty(f.view,'isReadOnly',{configurable:true,get(){if(!ready)throw Error('controller initializing');return false;}});
  assert.doesNotThrow(()=>f.history.attach(f.view));assert.equal(f.menu.open,f.original.open);
  ready=true;f.history.attach(f.view);assert.notEqual(f.menu.open,f.original.open);
  const file=await f.created();await f.view.undoTransaction();assert.equal(f.files.has(file.path),false);
  await f.view.redoTransaction();assert.equal(f.files.has(file.path),true);
});

test('newly profiled and renamed tables keep native creation then property undo and redo order',async t=>{
  const f=fixture(t),profile={titleColumn:'formula.新条目',titleProperty:'条目标题',tags:{领域:'multi'},wrap:true,attachments:[]};
  f.view.config.name='新的项目素材库';f.view.config.nebulaTable=profile;f.view.config.query.file='Bases/新的项目素材库.base';
  const file=await f.created(),baseline=f.content.get(file);
  assert.equal(f.calls.save,1);assert.equal(f.view.config.sort.at(-1).property,'file.ctime');
  assert.equal(f.view.config.sort.at(-1).direction,'ASC');
  await f.edit(file,'---\n领域: ["参考"]\n---\n');
  f.view.config.name='重命名后的素材库';
  await f.view.undoTransaction();assert.equal(f.content.get(file),baseline);
  await f.view.undoTransaction();assert.equal(f.files.has(file.path),false);
  await f.view.redoTransaction();const restored=f.files.get(file.path);assert.ok(restored);assert.equal(f.content.get(restored),baseline);
  await f.view.redoTransaction();assert.deepEqual(f.props(restored).领域,['参考']);
  assert.equal(f.calls.save,1,'undo and redo do not rewrite display configuration');
});

test('single-record views block new records while native property editing and undo remain available',async t=>{
  for(const phone of [false,true]){
    const f=fixture(t,{phone});let allow=false;
    f.view.config.get=function(key){assert.equal(this,f.view.config);return key==='nebulaAllowCreate'?allow:undefined;};
    const file=f.put('Notes/Single.md','---\nstate: "before"\n---\nBody');
    await f.menu.open();
    assert.equal(f.calls.open,0);assert.equal(f.calls.create.length,0);assert.equal(f.calls.save,0);
    assert.equal(f.view.isReadOnly,undefined);assert.equal(f.container.hasAttribute('aria-readonly'),false);
    await f.edit(file,'after');assert.equal(f.props(file).state,'after');
    await f.view.undoTransaction();assert.equal(f.props(file).state,'before');
    await f.view.redoTransaction();assert.equal(f.props(file).state,'after');
    allow=true;await f.menu.open();assert.equal(f.calls.open,1);assert.equal(f.calls.create.length,1);
    allow=false;await f.menu.open();assert.equal(f.calls.open,1);
  }
});

test('disabling new-record creation does not block undo or redo of a previously created record',async t=>{
  const f=fixture(t),file=await f.created(),content=f.content.get(file);
  f.view.config.get=key=>key==='nebulaAllowCreate'?false:undefined;
  await f.menu.open();assert.equal(f.calls.open,1);
  await f.view.undoTransaction();assert.equal(f.files.has(file.path),false);
  await f.view.redoTransaction();const restored=f.files.get(file.path);assert.ok(restored);assert.equal(f.content.get(restored),content);
  assert.equal(f.calls.open,1,'history restoration does not reopen the create menu');
});

test('filename renames share chronological property history without writing note content or frontmatter',async t=>{
  const f=fixture(t),file=f.put('Ideas/Existing.md','---\nstate: "before"\n---\nExact body\n');
  await f.edit(file,'after');const content=f.content.get(file),property=f.view.undoStack.at(-1),writes=f.calls.frontmatter;
  await f.history.rename(f.view,file,'新的中文标题');const marker=f.view.undoStack.at(-1);
  assert.equal(file.path,'Ideas/新的中文标题.md');assert.equal(f.content.get(file),content);assert.equal(f.calls.frontmatter,writes);
  assert.equal(marker.changes.length,1);assert.equal(marker.changes[0].file,file);
  assert.equal(marker.changes[0].fromPath,'Ideas/Existing.md');assert.equal(marker.changes[0].toPath,'Ideas/新的中文标题.md');
  await f.view.undoTransaction();assert.equal(file.path,'Ideas/Existing.md');assert.equal(f.view.undoStack.at(-1),property);
  await f.view.undoTransaction();assert.equal(f.props(file).state,'before');
  await f.view.redoTransaction();await f.view.redoTransaction();assert.equal(file.path,'Ideas/新的中文标题.md');assert.equal(f.content.get(file),content);
  assert.deepEqual(f.calls.notices,[]);assert.equal(f.calls.nativeUndo,0);assert.equal(f.calls.nativeRedo,0);
});

test('create then rename can undo twice and redo twice against the restored file identity',async t=>{
  const f=fixture(t),file=await f.created(),originalPath=file.path,baseline=f.content.get(file);f.menu.close();
  await f.history.rename(f.view,file,'发布标题');const rename=f.view.undoStack.at(-1);
  await f.view.undoTransaction();assert.equal(file.path,originalPath);
  await f.view.undoTransaction();assert.equal(f.files.has(originalPath),false);
  await f.view.redoTransaction();const restored=f.files.get(originalPath);
  assert.ok(restored);assert.notEqual(restored,file);assert.equal(rename.changes[0].file,restored);
  await f.view.redoTransaction();assert.equal(restored.path,'Ideas/发布标题.md');assert.equal(f.files.get(restored.path),restored);
  assert.equal(f.content.get(restored),baseline);assert.deepEqual(f.calls.notices,[]);
});

test('rename validation rejects traversal, invalid names, non-Markdown files, stale identities and existing destinations',async t=>{
  const f=fixture(t),file=f.put('Ideas/Existing.md','Exact body');
  for(const name of ['', '.', '..', '../Other', 'Folder/File','Folder\\File','Name:', 'a*', 'a?', 'a"', '<a>', 'a|b','a\nb','a\u0000b','a.', ' a','a ', 'CON','lpt1.txt'])
    await assert.rejects(f.history.rename(f.view,file,name),/笔记名称/,name);
  await assert.rejects(f.history.rename(f.view,{...file},'Other'),/替换/);
  const other=f.put('Ideas/Other.md','Do not replace');await assert.rejects(f.history.rename(f.view,file,'Other'),/已有文件/);
  file.extension='png';await assert.rejects(f.history.rename(f.view,file,'Other2'),/替换/);file.extension='md';
  assert.equal(f.calls.rename.length,0);assert.equal(f.view.undoStack.length,0);assert.equal(f.files.get(other.path),other);
  await f.history.rename(f.view,file,'Existing');assert.equal(f.calls.rename.length,0);assert.equal(f.view.undoStack.length,0);
  assert.equal(f.content.get(file),'Exact body');
});

test('rename undo and redo retain their marker on external path changes, collisions and native failures',async t=>{
  const f=fixture(t),file=f.put('Ideas/Original.md','Exact body');await f.history.rename(f.view,file,'Changed');const marker=f.view.undoStack.at(-1);
  const collision=f.put('Ideas/Original.md','Other file');await f.view.undoTransaction();
  assert.equal(f.files.get(collision.path),collision);assert.equal(file.path,'Ideas/Changed.md');assert.equal(f.view.undoStack.at(-1),marker);
  f.files.delete(collision.path);f.setRenameHook(()=>{throw Error('native rename failed');});await f.view.undoTransaction();
  assert.equal(file.path,'Ideas/Changed.md');assert.equal(f.view.undoStack.at(-1),marker);
  f.setRenameHook(null);await f.view.undoTransaction();assert.equal(file.path,'Ideas/Original.md');
  const redoCollision=f.put('Ideas/Changed.md','Preserve');await f.view.redoTransaction();
  assert.equal(f.files.get(redoCollision.path),redoCollision);assert.equal(f.view.redoStack.at(-1),marker);
  f.files.delete(redoCollision.path);await f.view.redoTransaction();
  await f.app.fileManager.renameFile(file,'Ideas/External.md');await f.view.undoTransaction();
  assert.equal(file.path,'Ideas/External.md');assert.equal(f.view.undoStack.at(-1),marker);assert.equal(f.content.get(file),'Exact body');
});

test('queued rename and immediate undo execute in order and recheck readonly eligibility',async t=>{
  const f=fixture(t),file=f.put('Ideas/Original.md','Body');let release,started;
  const active=new Promise(resolve=>{started=resolve;});f.setRenameHook(()=>new Promise(resolve=>{release=resolve;started();}));
  const rename=f.history.rename(f.view,file,'Changed');await active;
  assert.equal(f.history.forView(f.view,false,false),true,'a pending rename is undoable as soon as it commits');
  f.setRenameHook(null);release();await rename;await drain(f);
  assert.equal(file.path,'Ideas/Original.md');assert.equal(f.view.redoStack.length,1);
  const blocked=f.history.rename(f.view,file,'Blocked');f.view.isReadOnly=true;
  await assert.rejects(blocked,/不可编辑/);assert.equal(file.path,'Ideas/Original.md');
  f.view.isReadOnly=false;f.controller.isReadOnly=true;await assert.rejects(f.history.rename(f.view,file,'Blocked'),/不可编辑/);
});

test('rename history survives desktop remount and stays in its original view scope',async t=>{
  const f=fixture(t),ui=mountSurface(f),owner=ownSession(f,ui),file=f.put('Ideas/Original.md','Body');
  await f.history.rename(f.view,file,'Changed');const marker=f.view.undoStack.at(-1);
  const restore=changeScope(f,'name');assert.equal(f.view.undoStack.length,0);
  restore();assert.equal(f.view.undoStack.at(-1),marker);
  unmountView(f,ui);const fresh=rebuildView(f,owner);assert.equal(fresh.view.undoStack.at(-1),marker);
  await fresh.view.undoTransaction();assert.equal(file.path,'Ideas/Original.md');
  await fresh.view.redoTransaction();assert.equal(file.path,'Ideas/Changed.md');
});

test('phone tabs share filename rename and creation history, including restored TFile references',async t=>{
  const f=fixture(t,{phone:true}),ui=mountSurface(f);externalBase(f,ui);const file=await f.created(),path=file.path;
  const second=anotherBaseTab(f);await f.history.rename(second.view,file,'手机标题');
  await f.view.undoTransaction();assert.equal(file.path,path);
  await second.view.undoTransaction();assert.equal(f.files.has(path),false);
  await f.view.redoTransaction();const restored=f.files.get(path);assert.ok(restored);
  await second.view.redoTransaction();assert.equal(restored.path,'Ideas/手机标题.md');
  assert.equal(f.view.undoStack,second.view.undoStack);assert.deepEqual(f.calls.notices,[]);
});

test('clear removes owned rename markers while preserving native property history',async t=>{
  const f=fixture(t),file=f.put('Ideas/Original.md','---\nstate: "before"\n---\nBody');
  await f.edit(file,'after');const property=f.view.undoStack.at(-1);
  await f.history.rename(f.view,file,'Changed');await f.view.undoTransaction();
  assert.equal(f.view.redoStack.length,1);f.history.clear();
  assert.deepEqual([...f.view.undoStack],[property]);assert.equal(f.view.redoStack.length,0);
  assert.equal(f.view.undoTransaction,f.original.undo);assert.equal(file.path,'Ideas/Original.md');
});

test('rename finishing after a same-session remount records in the replacement and cannot revive cleared history',async t=>{
  for(const clear of [false,true]){
    const f=fixture(t),ui=mountSurface(f),owner=ownSession(f,ui),file=f.put('Ideas/Original.md','Body');let release,started;
    const active=new Promise(resolve=>{started=resolve;});f.setRenameHook(()=>new Promise(resolve=>{release=resolve;started();}));
    const pending=f.history.rename(f.view,file,'Changed');await active;unmountView(f,ui);
    const fresh=rebuildView(f,owner);if(clear)f.history.clear();f.setRenameHook(null);release();await pending;
    assert.equal(file.path,'Ideas/Changed.md');assert.equal(fresh.view.undoStack.length,clear?0:1);
    if(!clear){await fresh.view.undoTransaction();assert.equal(file.path,'Ideas/Original.md');}
  }
});

test('single-record creation restriction covers folder-group bypasses and plain native config data',async t=>{
  const f=fixture(t,{folder:true});f.view.config.nebulaAllowCreate=false;
  f.folders.set('Projects',{path:'Projects'});
  await f.view.createNoteInGroup({key:new f.StringValue('Projects')});
  assert.equal(f.calls.groupCreate,0);assert.equal(f.calls.create.length,0);assert.equal(f.calls.open,0);
  delete f.view.config.nebulaAllowCreate;
  await f.view.createNoteInGroup({key:new f.StringValue('Projects')});assert.equal(f.calls.create.length,1);
});

test('create → property → delete undo and redo stay chronological across both restored file identities',async t=>{
  const f=fixture(t),file=await f.created(),path=file.path,baseline=f.content.get(file),creation=f.view.undoStack.at(-1);
  await f.edit(file,'---\n领域: ["Blender"]\n---\n');const property=f.view.undoStack.at(-1),edited=f.content.get(file);
  await f.history.remove(f.view,file);const deletion=f.view.undoStack.at(-1);
  assert.deepEqual([...f.view.undoStack],[creation,property,deletion]);assert.equal(f.files.has(path),false);
  assert.equal(f.menu.newlyCreatedFile,null,'the deleted new-item editor is closed');
  await f.view.undoTransaction();const firstRestore=f.files.get(path);
  assert.ok(firstRestore);assert.notEqual(firstRestore,file);assert.equal(f.content.get(firstRestore),edited);
  assert.equal(property.changes[0].file,firstRestore);
  await f.view.undoTransaction();assert.equal(f.content.get(firstRestore),baseline);
  await f.view.undoTransaction();assert.equal(f.files.has(path),false);
  await f.view.redoTransaction();const secondRestore=f.files.get(path);
  assert.ok(secondRestore);assert.notEqual(secondRestore,firstRestore);assert.equal(property.changes[0].file,secondRestore);
  await f.view.redoTransaction();assert.equal(f.content.get(secondRestore),edited);
  await f.view.redoTransaction();assert.equal(f.files.has(path),false);
  assert.deepEqual([...f.view.undoStack],[creation,property,deletion]);
  assert.equal(f.calls.trash.length,3);assert.ok(f.calls.trash.every(call=>call.system===false));
  assert.deepEqual(f.calls.notices,[],'successful file history stays silent');
});

test('deleting an existing renamed page restores its exact bytes, statistics and earlier history after remount',async t=>{
  const f=fixture(t),ui=mountSurface(f),owner=ownSession(f,ui);
  const bytes='---\r\nstate: "before"\r\n---\r\n# 中文正文\r\n\r\n![image](asset.png)\r\n';
  const file=f.put('Ideas/Original.md',bytes),stats={...file.stat};
  await f.history.rename(f.view,file,'新标题');const rename=f.view.undoStack.at(-1),path=file.path;
  await f.history.remove(f.view,file);const deletion=f.view.undoStack.at(-1);assert.equal(f.files.has(path),false);
  unmountView(f,ui);const fresh=rebuildView(f,owner);
  assert.equal(fresh.view.undoStack.at(-1),deletion);
  await fresh.view.undoTransaction();const restored=f.files.get(path);
  assert.ok(restored);assert.notEqual(restored,file);assert.equal(f.content.get(restored),bytes);assert.deepEqual(restored.stat,stats);
  assert.equal(rename.changes[0].file,restored);
  await fresh.view.undoTransaction();assert.equal(restored.path,'Ideas/Original.md');
  await fresh.view.redoTransaction();await fresh.view.redoTransaction();assert.equal(f.files.has(path),false);
  assert.equal(f.calls.frontmatter,0,'deletion and restoration do not rewrite Markdown or properties');
  assert.deepEqual(f.calls.notices,[]);
});

test('deletion history preserves collisions and later edits, retaining the marker for a safe retry',async t=>{
  const f=fixture(t),file=f.put('Ideas/Existing.md','Original body'),path=file.path;
  await f.history.remove(f.view,file);const marker=f.view.undoStack.at(-1);
  const collision=f.put(path,'Unrelated replacement');await f.view.undoTransaction();
  assert.equal(f.files.get(path),collision);assert.equal(f.content.get(collision),'Unrelated replacement');
  assert.equal(f.view.undoStack.at(-1),marker);assert.equal(f.calls.create.length,0);
  f.files.delete(path);f.setCreateHook(()=>{throw Error('restore failed');});await f.view.undoTransaction();
  assert.equal(f.view.undoStack.at(-1),marker);assert.equal(f.files.has(path),false);
  f.setCreateHook(null);await f.view.undoTransaction();const restored=f.files.get(path);
  f.view.readOnly=true;await f.view.redoTransaction();
  assert.equal(f.files.get(path),restored,'a view made readonly cannot redo deletion');
  assert.equal(f.view.redoStack.at(-1),marker);delete f.view.readOnly;
  f.content.set(restored,'User edit after restoring');await f.view.redoTransaction();
  assert.equal(f.files.get(path),restored);assert.equal(f.content.get(restored),'User edit after restoring');
  assert.equal(f.view.redoStack.at(-1),marker);assert.equal(f.calls.trash.length,1);
  f.content.set(restored,'Original body');await f.view.redoTransaction();assert.equal(f.files.has(path),false);
  assert.equal(f.view.undoStack.at(-1),marker);assert.equal(f.calls.trash.length,2);
});

test('explicit row deletion rejects stale, non-Markdown, readonly and invalidated views before touching files',async t=>{
  const f=fixture(t),file=f.put('Ideas/Existing.md','Keep this body');
  assert.equal(f.history.canRemove(f.view,file),true);
  await assert.rejects(f.history.remove(f.view,{...file}),/不可删除/);
  file.extension='png';await assert.rejects(f.history.remove(f.view,file),/不可删除/);file.extension='md';
  for(const [target,key] of [[f.view,'readOnly'],[f.view,'isReadOnly'],[f.controller,'isReadOnly']]){
    target[key]=true;assert.equal(f.history.canRemove(f.view,file),false);
    await assert.rejects(f.history.remove(f.view,file),/不可删除/);delete target[key];
  }
  const queued=f.history.remove(f.view,file);f.view.isReadOnly=true;
  await assert.rejects(queued,/已移动或数据库已关闭/);f.view.isReadOnly=false;
  f.controller.view={};await assert.rejects(f.history.remove(f.view,file),/不可删除/);
  assert.equal(f.calls.trash.length,0);assert.equal(f.view.undoStack.length,0);
  assert.equal(f.files.get(file.path),file);assert.equal(f.content.get(file),'Keep this body');
});

test('row deletion protects unsaved drafts, last-moment disk changes and failed trash without inventing history',async t=>{
  const f=fixture(t),file=f.put('Ideas/Existing.md','Saved body');
  f.leaves.push({file,editor:{getValue:()=> 'Unsaved body'}});
  await assert.rejects(f.history.remove(f.view,file),/正在编辑/);f.leaves.length=0;
  let reads=0;f.setReadHook(()=>{if(++reads===2)f.content.set(file,'Concurrent edit');return f.content.get(file);});
  await assert.rejects(f.history.remove(f.view,file),/内容已变化/);f.setReadHook(null);
  assert.equal(f.calls.trash.length,0);assert.equal(f.content.get(file),'Concurrent edit');
  f.setTrashHook(()=>{throw Error('trash unavailable');});await assert.rejects(f.history.remove(f.view,file),/trash unavailable/);
  assert.equal(f.view.undoStack.length,0);assert.equal(f.files.get(file.path),file);
  f.setTrashHook(null);await f.history.remove(f.view,file);assert.equal(f.view.undoStack.length,1);
  await f.view.undoTransaction();assert.equal(f.content.get(f.files.get(file.path)),'Concurrent edit');
});

test('row deletion ignores a dormant reading-mode source cache after a saved property update and restores the latest bytes',async t=>{
  const f=fixture(t),bytes='---\n标题: 已改名\n---\nKeep the body\n',file=f.put('Ideas/Renamed.md',bytes);
  const editor={getValue:()=> '---\n标题: 原名称\n---\nKeep the body\n'};
  const child={file,editor},owner={file,editor,dirty:false,data:bytes,lastSavedData:bytes,getMode:()=> 'preview',_children:[child]};
  // The same dormant editor is discovered through its child before its owner.
  f.leaves.push({_children:[child,owner]});
  await f.history.remove(f.view,file);
  assert.equal(f.files.has(file.path),false);assert.equal(f.calls.trash.length,1);
  await f.view.undoTransaction();
  assert.equal(f.content.get(f.files.get(file.path)),bytes);
  assert.equal(f.calls.frontmatter,0,'deletion does not flush or rewrite the stale source cache');
});

test('reading-mode cache recognition still rejects dirty, unsaved or independent source drafts',async t=>{
  for(const reason of ['source-mode','dirty','saving-again','unsaved-data','unsaved-snapshot','independent-draft']) {
    const f=fixture(t),bytes='Saved body',file=f.put('Ideas/Existing.md',bytes);
    const owner={file,editor:{getValue:()=> 'Different source text'},dirty:false,data:bytes,lastSavedData:bytes,getMode:()=> 'preview'};
    if(reason==='source-mode')owner.getMode=()=> 'source';
    if(reason==='dirty')owner.dirty=true;
    if(reason==='saving-again')owner.saveAgain=true;
    if(reason==='unsaved-data')owner.data='Not saved yet';
    if(reason==='unsaved-snapshot')owner.lastSavedData='Previous disk content';
    if(reason==='independent-draft')f.leaves.push({file,editor:{getValue:()=> 'Independent draft'},dirty:true});
    f.leaves.push(owner);
    await assert.rejects(f.history.remove(f.view,file),/正在编辑/,reason);
    assert.equal(f.calls.trash.length,0,reason);assert.equal(f.files.get(file.path),file);
  }
});

test('duplicate row-delete clicks serialize into one deletion and a queued undo restores it once',async t=>{
  const f=fixture(t),file=f.put('Ideas/Existing.md','Body');let release,started;
  const active=new Promise(resolve=>{started=resolve;});f.setTrashHook(()=>new Promise(resolve=>{release=resolve;started();}));
  const first=f.history.remove(f.view,file);await active;
  const second=assert.rejects(f.history.remove(f.view,file),/已移动或数据库已关闭/);
  const undo=f.view.undoTransaction();f.setTrashHook(null);release();await first;await second;await undo;
  const restored=f.files.get(file.path);assert.ok(restored);assert.notEqual(restored,file);
  assert.equal(f.content.get(restored),'Body');assert.equal(f.calls.trash.length,1);
  assert.equal(f.view.undoStack.length,0);assert.equal(f.view.redoStack.length,1);
  assert.deepEqual(f.calls.notices,[]);
});

test('explicit deletion waits for the native new-item editor to flush before its final content check',async t=>{
  const f=fixture(t),file=await f.created(),creation=f.view.undoStack.at(-1),close=f.menu.close.bind(f.menu);
  let flushed;const flush=new Promise(resolve=>{flushed=resolve;});
  f.menu.close=()=>{close();f.win.setTimeout(()=>{f.content.set(file,'Saved while closing the editor');flushed();},0);};
  const result=await Promise.allSettled([f.history.remove(f.view,file),flush]);
  assert.equal(result[0].status,'rejected','a native close flush must cancel deletion');
  assert.equal(f.files.get(file.path),file);assert.equal(f.content.get(file),'Saved while closing the editor');
  assert.equal(f.calls.trash.length,0);assert.deepEqual([...f.view.undoStack],[creation]);
});

test('phone row deletion shares chronology across tabs of the same Base without crossing database scopes',async t=>{
  const f=fixture(t,{phone:true}),ui=mountSurface(f);externalBase(f,ui);
  const file=await f.created(),path=file.path,baseline=f.content.get(file),second=anotherBaseTab(f);
  const other=anotherBaseTab(f,{base:'Bases/Other.base'});
  await editIn(f,second.view,file,'Blender');const property=second.view.undoStack.at(-1);
  await f.history.remove(second.view,file);assert.equal(f.files.has(path),false);
  assert.equal(f.view.undoStack,second.view.undoStack);assert.equal(other.view.undoStack.length,0);
  await other.view.undoTransaction();assert.equal(f.files.has(path),false);
  await f.view.undoTransaction();const restored=f.files.get(path);assert.equal(property.changes[0].file,restored);
  await second.view.undoTransaction();assert.equal(f.content.get(restored),baseline);
  second.controller.isReadOnly=true;await assert.rejects(f.history.remove(second.view,restored),/不可删除/);
  await f.view.undoTransaction();assert.equal(f.files.has(path),false);second.controller.isReadOnly=false;
  await second.view.redoTransaction();await f.view.redoTransaction();await second.view.redoTransaction();
  assert.equal(f.files.has(path),false);assert.equal(other.view.undoStack.length,0);
  assert.deepEqual(f.calls.notices,[]);
});
