const {test} = require('node:test');
const assert = require('node:assert/strict');
const {buildSync} = require('esbuild');
const {JSDOM} = require('jsdom');
const code = buildSync({entryPoints:['src/reminders.ts'], bundle:true, platform:'node', format:'cjs', external:['obsidian'], write:false}).outputFiles[0].text;
const copy = value => JSON.parse(JSON.stringify(value));
const taskCache = (line=0) => ({listItems:[{task:' ',position:{start:{line},end:{line}}}]});
const deferred = () => {let resolve; const promise = new Promise(fn => {resolve=fn;}); return {promise,resolve};};

function fixture(initial, options={}) {
  const dom = new JSDOM('<!doctype html><body></body>'), win=dom.window, doc=win.document;
  win.HTMLElement.prototype.createEl=function(tag,opts={}) {const el=doc.createElement(tag); if(opts.cls)el.className=opts.cls; if(opts.text!==undefined)el.textContent=opts.text; for(const [key,value] of Object.entries(opts.attr??{}))el.setAttribute(key,value); this.append(el); return el;};
  win.HTMLElement.prototype.createDiv=function(opts){return this.createEl('div',opts);};
  win.HTMLElement.prototype.createSpan=function(opts){return this.createEl('span',opts);};
  const timers=new Map(),intervals=new Map();let nextTimer=0;
  const clock={setTimeout(fn){timers.set(++nextTimer,fn);return nextTimer;},clearTimeout(id){timers.delete(id);},setInterval(fn){intervals.set(++nextTimer,fn);return nextTimer;},clearInterval(id){intervals.delete(id);}};
  class Component {
    constructor(){this.children=new Set();this.cleanup=[];this.unloaded=false;}
    addChild(child){this.children.add(child);return child;}
    removeChild(child){this.children.delete(child);child.unload();return child;}
    registerEvent(ref){this.cleanup.push(()=>ref.off());}
    registerInterval(id){this.cleanup.push(()=>clock.clearInterval(id));}
    unload(){if(this.unloaded)return;this.unloaded=true;for(const clean of this.cleanup)clean();for(const child of this.children)child.unload();this.onunload?.();}
  }
  class TFile {constructor(path,text){this.path=path;this.stat={mtime:1,size:text.length};}get basename(){return this.path.split('/').at(-1).replace(/\.[^.]+$/,'');}get extension(){return this.path.split('.').at(-1);}}
  class WorkspaceTabs {constructor(){this.children=[];}}
  class ItemView extends Component {constructor(leaf){super();this.leaf=leaf;this.app=app;this.contentEl=doc.createElement('div');doc.body.append(this.contentEl);}}
  class FuzzySuggestModal {constructor(app){this.app=app;}setPlaceholder(){}open(){pickers.push(this);}}
  const files=new Map(),content=new Map(),metadata=new Map(),reads=[],fileWrites=[],saves=[],notices=[],renders=[],commands=[],factories=new Map(),ready=[],leaves=[],revealed=[],activated=[],pickers=[],navigation=[];
  const events=new Map(),rootSplit={},mainTabs=new WorkspaceTabs();let failSave=false,readHook,renderHook,stateHook,active;
  const on=(scope,name,fn)=>{const key=scope+':'+name; if(!events.has(key))events.set(key,new Set());events.get(key).add(fn);return {off:()=>events.get(key).delete(fn)};};
  const emit=(scope,name,...args)=>{for(const fn of events.get(scope+':'+name)??[])fn(...args);};
  const mutate=(...args)=>{fileWrites.push(args);throw Error('Unexpected source write');};
  const app={vault:{getFileByPath:path=>files.get(path)??null,getFiles:()=>[...files.values()],getMarkdownFiles:()=>[...files.values()].filter(f=>f.extension==='md'),
    async cachedRead(file){reads.push(file.path);const text=content.get(file.path);return readHook?await readHook(file,text):text;},
    modify:mutate,create:mutate,delete:mutate,process:mutate,trash:mutate,on:(name,fn)=>on('vault',name,fn)},
    metadataCache:{getFileCache:file=>metadata.get(file.path),on:(name,fn)=>on('metadata',name,fn)},
    workspace:{rootSplit,iterateRootLeaves:fn=>{for(const leaf of leaves)if(fn(leaf))break;},createLeafInParent(parent,index){const leaf=addLeaf('empty',undefined,parent);parent.children.splice(parent.children.indexOf(leaf),1);parent.children.splice(index,0,leaf);return leaf;},
      getLeaf:()=>addLeaf('empty'),getMostRecentLeaf:()=>active,revealLeaf:async leaf=>{revealed.push(leaf);},setActiveLeaf(leaf,options){active=leaf;activated.push({leaf,options});},onLayoutReady:fn=>ready.push(fn),leftSplit:{collapse(){}}}};
  const plugin={app,registerView:(type,factory)=>factories.set(type,factory),addCommand:command=>commands.push(command)};
  const api={Component,ItemView,WorkspaceTabs,TFile,FuzzySuggestModal,Platform:{isMobileApp:!!options.mobile},Plugin:class{},Notice:class{constructor(message){notices.push(message);}},setIcon:(el,icon)=>{el.dataset.icon=icon;},
    MarkdownRenderer:{async render(...args){renders.push(args);return renderHook?.(...args);}}};
  const module={exports:{}};
  new Function('require','module','exports','window','console',code)(name=>{assert.equal(name,'obsidian');return api;},module,module.exports,clock,{error(){}});
  const controller=new module.exports.RemindersController(plugin,initial,async prefs=>{if(failSave)throw Error('Save unavailable');saves.push(copy(prefs));},
    {async openFileFromElement(file,source,event){navigation.push({file,source,event});return {getViewState:()=>({state:{file:file.path}}),setEphemeralState:state=>{navigation.at(-1).ephemeral=state;}};}},options.enabled!==false,!!options.cold);
  function addLeaf(type='markdown',path='Existing.md',parent=mainTabs) {
    const leaf={parent,state:{type,state:path?{file:path}:{}},view:{},getViewState(){return this.state;},getContainer:()=>rootSplit,
      async setViewState(state){this.state=state;await stateHook?.(leaf,state);if(this.state!==state)return;await this.view.onClose?.();this.view=factories.get(state.type)?.(leaf)??{};await this.view.onOpen?.();}};
    leaves.push(leaf);parent.children.push(leaf);return leaf;
  }
  const put=(path,text='',cache={})=>{const file=new TFile(path,text);files.set(path,file);content.set(path,text);metadata.set(path,cache);return file;};
  const settle=()=>new Promise(resolve=>setImmediate(resolve));
  const flush=async()=>{for(let round=0;timers.size&&round<10;round++){const batch=[...timers.values()];timers.clear();for(const fn of batch)fn();await settle();}};
  const mount=async()=>{const leaf=addLeaf('empty');const view=new module.exports.RemindersView(leaf,controller);leaf.view=view;leaf.state={type:module.exports.REMINDERS_VIEW};await view.onOpen();return view;};
  const rename=(file,path)=>{const old=file.path;files.delete(old);files.set(path,file);content.set(path,content.get(old));content.delete(old);metadata.set(path,metadata.get(old));metadata.delete(old);file.path=path;emit('vault','rename',file,old);};
  return {controller,app,win,doc,files,content,metadata,reads,fileWrites,saves,notices,renders,commands,factories,ready,leaves,revealed,activated,pickers,navigation,put,emit,settle,flush,mount,rename,addLeaf,
    failSave:value=>{failSave=value;},readHook:fn=>{readHook=fn;},renderHook:fn=>{renderHook=fn;},stateHook:fn=>{stateHook=fn;},
    async close(){controller.unload();for(const view of [...controller.views])await view.onClose();win.close();}};
}

test('reminders read only parsed open tasks and deadline metadata, reuse unchanged reads and respond to metadata changes',async()=>{
  const f=fixture();try{
    const task=f.put('Tasks.md','- [ ] Prepare deck\n- [x] Finished\n- [ ] Not parsed',taskCache());
    const dated=f.put('Project.md','Body unchanged',{frontmatter:{title:'Review',截止日期:'2026-12-01'}});
    f.put('Plain.md','- [ ] Code sample without task cache',{});f.put('Unknown.md','Unindexed',undefined);f.metadata.delete('Unknown.md');
    f.controller.onload();const view=await f.mount();await f.flush();
    assert.deepEqual(f.controller.rows.map(row=>row.title).sort(),['Prepare deck','Review']);assert.deepEqual(f.reads,['Tasks.md']);
    await f.controller.refresh();assert.deepEqual(f.reads,['Tasks.md']);
    f.metadata.set(task.path,{listItems:[{task:'x',position:{start:{line:0}}}]});f.emit('metadata','changed',task);await f.flush();
    assert.deepEqual(f.controller.rows.map(row=>row.title),['Review']);
    f.metadata.set(dated.path,{frontmatter:{title:'Review revised',截止日期:'2026-12-02'}});f.emit('metadata','changed',dated);await f.flush();
    assert.equal(f.controller.rows[0].due,'2026-12-02');assert.match(view.contentEl.textContent,/Review revised/);
    assert.deepEqual(f.fileWrites,[]);assert.equal(f.content.get(dated.path),'Body unchanged');
  }finally{await f.close();}
});

test('a metadata invalidation during a pending read cannot repopulate an old cache with unchanged file stamps',async()=>{
  const f=fixture();try{
    const file=f.put('Task.md','- [ ] Old task',taskCache()),gate=deferred();let held=true;
    f.readHook(async(_file,text)=>{if(held){held=false;await gate.promise;}return text;});
    f.controller.onload();await f.mount();const pending=f.controller.refresh();await f.settle();
    f.content.set(file.path,'- [ ] New task');f.emit('metadata','changed',file);gate.resolve();await pending;await f.flush();
    assert.deepEqual(f.controller.rows.map(row=>row.title),['New task']);
    await f.controller.refresh();assert.deepEqual(f.controller.rows.map(row=>row.title),['New task']);assert.deepEqual(f.fileWrites,[]);
  }finally{await f.close();}
});

test('renaming or deleting a note during a read does not leave a reminder pointing at the old path',async()=>{
  const f=fixture();try{
    const file=f.put('Old.md','- [ ] Move me',taskCache()),gate=deferred();let held=true;
    f.readHook(async(_file,text)=>{if(held){held=false;await gate.promise;}return text;});
    f.controller.onload();await f.mount();const pending=f.controller.refresh();await f.settle();
    f.rename(file,'New.md');gate.resolve();await pending;await f.flush();
    assert.deepEqual(f.controller.rows.map(row=>row.path),['New.md']);
    f.files.delete(file.path);f.emit('vault','delete',file);await f.flush();assert.deepEqual(f.controller.rows,[]);
    assert.deepEqual(f.fileWrites,[]);
  }finally{await f.close();}
});

test('cold startup adds one reminders tab without overwriting notes; hot reload and disabled startup do not steal focus',async()=>{
  for(const config of [{cold:true,enabled:true,expected:1},{cold:false,enabled:true,expected:0},{cold:true,enabled:false,expected:0},{cold:true,enabled:true,initial:{openOnStartup:false},expected:0}]){
    const f=fixture(config.initial,config);try{
      const note=f.addLeaf('markdown','Keep.md');const original=copy(note.state);f.controller.onload();f.ready[0]();await f.settle();await f.settle();
      assert.equal(f.leaves.length,1+config.expected);assert.deepEqual(note.state,original);assert.equal(f.revealed.length,config.expected);
      if(config.expected){await Promise.all([f.controller.open(),f.controller.open()]);assert.equal(f.leaves.length,2);}
      assert.deepEqual(f.fileWrites,[]);
    }finally{await f.close();}
  }
});

test('cold startup loads an existing deferred reminders leaf without resetting it or creating another tab',async()=>{
  const f=fixture(undefined,{cold:true});try{
    const note=f.addLeaf('markdown','Keep.md'),existing=f.addLeaf('nebula-reminders',undefined);
    const original=copy(note.state),states=[];let loads=0;
    existing.isDeferred=true;
    // Obsidian 1.15 DeferredView retains its saved type even before its factory mounts.
    existing.view={getViewType:()=>existing.state.type};
    existing.loadIfDeferred=async()=>{loads++;existing.isDeferred=false;existing.view=f.factories.get('nebula-reminders')(existing);await existing.view.onOpen();};
    f.stateHook((leaf,state)=>{if(leaf===existing)states.push(state.type);});
    f.controller.onload();f.ready[0]();await f.settle();await f.settle();
    assert.equal(loads,1);assert.deepEqual(states,[]);assert.equal(f.leaves.length,2);
    assert.deepEqual(note.state,original);assert.deepEqual(f.revealed,[existing]);
    await Promise.all([f.controller.open(),f.controller.open()]);assert.equal(f.leaves.length,2);assert.equal(loads,1);
  }finally{await f.close();}
});

test('user navigation while deferred reminders load wins over an outstanding open request',async()=>{
  const f=fixture();try{
    const existing=f.addLeaf('nebula-reminders',undefined),gate=deferred(),states=[];
    existing.isDeferred=true;existing.view={getViewType:()=>existing.state.type};
    existing.loadIfDeferred=async()=>{await gate.promise;existing.isDeferred=false;};
    f.stateHook((leaf,state)=>{if(leaf===existing)states.push(state.type);});
    f.controller.onload();const opening=f.controller.open();await f.settle();
    await existing.setViewState({type:'markdown',state:{file:'Chosen.md'}});gate.resolve();await opening;
    assert.deepEqual(existing.getViewState(),{type:'markdown',state:{file:'Chosen.md'}});
    assert.deepEqual(states,['markdown']);assert.deepEqual(f.revealed,[]);assert.equal(f.leaves.length,1);
  }finally{await f.close();}
});

test('native history can restore a previous reminders tab but later open requests do not add another',async()=>{
  const f=fixture();try{
    f.controller.onload();await f.controller.open();const original=f.leaves[0],saved=copy(original.getViewState());
    await original.setViewState({type:'markdown',state:{file:'Chosen.md'}});
    await f.controller.open();assert.equal(f.leaves.length,2);
    // Native Back reapplies the prior saved view in that original leaf.
    await original.setViewState(saved);assert.equal(f.leaves.filter(leaf=>leaf.getViewState().type==='nebula-reminders').length,2);
    await f.controller.open();await f.controller.open();assert.equal(f.leaves.length,2);
    assert.deepEqual(f.fileWrites,[]);
  }finally{await f.close();}
});

test('database preference writes compose serially, failed saves retain committed references, and renames update references',async()=>{
  const f=fixture({databases:['A.base']});try{
    const a=f.put('A.base','views: []');f.put('B.base','views: []');f.controller.onload();
    assert.deepEqual(await Promise.all([f.controller.update(state=>({...state,databases:[...state.databases,'B.base']})),f.controller.setOpenOnStartup(false)]),[true,true]);
    assert.deepEqual(f.saves.at(-1),{openOnStartup:false,databases:['A.base','B.base']});
    f.failSave(true);assert.equal(await f.controller.update(state=>({...state,databases:[]})),false);assert.deepEqual(f.controller.preferences.databases,['A.base','B.base']);
    f.failSave(false);f.rename(a,'Moved/A.base');await f.settle();assert.deepEqual(f.controller.preferences.databases,['Moved/A.base','B.base']);
    assert.deepEqual(f.fileWrites,[]);
  }finally{await f.close();}
});

test('database embeds reference original Bases, preserve live mounts across reminders refresh and unload render owners',async()=>{
  const f=fixture({databases:['Databases/Ideas.base']});try{
    const source=f.put('Databases/Ideas.base','views: [{name: Ideas}]');f.controller.onload();const view=await f.mount();await f.flush();
    assert.equal(f.renders.length,1);const [app,markdown,embed,path,owner]=f.renders[0];
    assert.equal(app,f.app);assert.equal(markdown,'![[Databases/Ideas.base]]');assert.equal(path,source.path);assert.ok(embed.isConnected);
    await f.controller.refresh();view.renderDatabases();assert.equal(f.renders.length,1);assert.equal(owner.unloaded,false);
    await f.controller.update(state=>({...state,databases:[]}));assert.equal(owner.unloaded,true);assert.equal(embed.isConnected,false);
    await f.controller.update(state=>({...state,databases:[source.path]}));const mounted=f.renders.at(-1)[4];await view.onClose();
    assert.equal(mounted.unloaded,true);assert.equal(f.controller.views.has(view),false);assert.deepEqual(f.fileWrites,[]);
    assert.equal(f.content.get(source.path),'views: [{name: Ideas}]');
  }finally{await f.close();}
});

test('missing database references recover on source creation, update on rename and release their owner on deletion',async()=>{
  const f=fixture({databases:['Ideas.base']});try{
    f.controller.onload();const view=await f.mount();assert.match(view.contentEl.textContent,/找不到原数据库/);assert.equal(f.renders.length,0);
    const file=f.put('Ideas.base','views: []');f.emit('vault','create',file);await f.settle();
    assert.equal(f.renders.length,1);assert.doesNotMatch(view.contentEl.textContent,/找不到原数据库/);
    const first=f.renders[0][4];f.rename(file,'Views/Ideas.base');await f.settle();
    assert.equal(first.unloaded,true);assert.equal(f.renders.at(-1)[1],'![[Views/Ideas.base]]');
    const second=f.renders.at(-1)[4];f.files.delete(file.path);f.emit('vault','delete',file);await f.settle();
    assert.equal(second.unloaded,true);assert.match(view.contentEl.textContent,/找不到原数据库/);
    assert.deepEqual(f.controller.preferences.databases,['Views/Ideas.base'],'a missing source does not erase the saved reference');
    const replacement=f.put(file.path,'views: []');f.emit('vault','create',replacement);await f.settle();
    assert.doesNotMatch(view.contentEl.textContent,/找不到原数据库/);await view.onClose();await view.onOpen();
    assert.equal(view.contentEl.querySelectorAll('.nf-reminder-base').length,1);assert.ok(f.renders.at(-1)[2].isConnected);
    assert.deepEqual(f.fileWrites,[]);
  }finally{await f.close();}
});

test('reminder clicks delegate navigation and reveal source task line; stopped reads cannot redraw closed views',async()=>{
  const f=fixture();try{
    const file=f.put('Task.md','Intro\n- [ ] Task',taskCache(1));f.controller.onload();const view=await f.mount();await f.flush();
    const button=view.contentEl.querySelector('.nf-reminder-row');button.dispatchEvent(new f.win.MouseEvent('click',{bubbles:true,metaKey:true}));await f.settle();
    assert.equal(f.navigation[0].file,file);assert.equal(f.navigation[0].event.metaKey,true);assert.deepEqual(f.navigation[0].ephemeral,{line:1,focus:true});
    const gate=deferred();f.readHook(async()=>{await gate.promise;return '- [ ] Late';});f.emit('metadata','changed',file);const pending=f.controller.refresh();
    f.controller.unload();await view.onClose();gate.resolve();await pending;assert.equal(view.contentEl.textContent,'');assert.deepEqual(f.fileWrites,[]);
  }finally{await f.close();}
});

test('scheduled date sections keep overdue dates next to their source and retain collapsed state across refreshes',async()=>{
  const f=fixture();try{
    f.controller.onload();const view=await f.mount();await f.flush();
    const now=new Date(),today=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-');
    f.controller.rows=[
      {id:'past',path:'Past.md',title:'Old task 📅 2000-01-01',source:'Past',kind:'task',due:'2000-01-01'},
      {id:'today',path:'Today.md',title:'Due today',source:'Today',kind:'deadline',due:today},
      {id:'future',path:'Future.md',title:'Future task',source:'Future',kind:'task',due:'2099-01-02'},
      {id:'undated',path:'Notes.md',title:'No date',source:'Notes',kind:'task'}
    ];
    view.renderReminders();
    const sections=[...view.contentEl.querySelectorAll('.nf-reminder-section')];
    assert.deepEqual(sections.map(el=>el.dataset.section),['overdue',`date:${today}`,'date:2099-01-02','undated']);
    assert.equal(sections[0].querySelector('.nf-reminder-label').textContent,'Old task');
    assert.equal(sections[0].querySelector('.nf-reminder-meta time').getAttribute('datetime'),'2000-01-01');
    assert.match(sections[0].querySelector('.nf-reminder-meta').textContent,/2000年1月1日.*Past/);
    assert.equal(sections[1].querySelector('.nf-reminder-section-label').textContent,'今天');
    assert.match(sections[2].querySelector('summary').textContent,/2099年1月2日/);
    assert.equal(sections[2].querySelector('time'),null,'date headings avoid repeated per-row dates');
    assert.equal(sections[3].open,false);
    sections[2].open=false;sections[2].dispatchEvent(new f.win.Event('toggle'));view.renderReminders();
    assert.equal(view.contentEl.querySelector('[data-section="date:2099-01-02"]').open,false);
    assert.equal(f.controller.rows[0].title,'Old task 📅 2000-01-01','display formatting does not mutate data');
    assert.deepEqual(f.fileWrites,[]);
  }finally{await f.close();}
});

test('reminder title renames persist only plugin preferences; IME Enter and Escape never commit', async()=>{
  const f=fixture();try{
    f.controller.onload();let view=await f.mount();
    view.beginRename();let input=f.doc.querySelector('.nf-reminders-title-input');
    input.dispatchEvent(new f.win.CompositionEvent('compositionstart'));
    input.value='我的待办';input.dispatchEvent(new f.win.KeyboardEvent('keydown',{key:'Enter',bubbles:true,isComposing:true}));
    await f.settle();assert.equal(f.saves.length,0);assert.equal(f.doc.activeElement,input);
    input.dispatchEvent(new f.win.CompositionEvent('compositionend'));
    input.dispatchEvent(new f.win.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await f.settle();
    assert.equal(f.controller.displayName,'我的待办');assert.equal(f.saves.at(-1).name,'我的待办');
    view=[...f.controller.views][0];assert.equal(view.getDisplayText(),'我的待办');
    view.beginRename();input=f.doc.querySelector('.nf-reminders-title-input');input.value='不保存';
    input.dispatchEvent(new f.win.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await f.settle();
    assert.equal(f.controller.displayName,'我的待办');assert.equal(f.saves.length,1);
    f.failSave(true);view.beginRename();input=f.doc.querySelector('.nf-reminders-title-input');input.value='失败的名称';
    input.dispatchEvent(new f.win.Event('blur'));await f.settle();
    assert.equal(f.controller.displayName,'我的待办');assert.equal(f.doc.querySelector('.nf-reminders-header h1').textContent,'我的待办');
    assert.deepEqual(f.fileWrites,[]);
  }finally{await f.close();}
});

test('title composition commits once after blur but never after the view closes or refocuses', async()=>{
  for(const action of ['blur','close','refocus']){
    const f=fixture();try{
      f.controller.onload();const view=await f.mount();view.beginRename();
      const input=f.doc.querySelector('.nf-reminders-title-input');
      input.dispatchEvent(new f.win.CompositionEvent('compositionstart'));input.value='我的';input.blur();
      assert.equal(f.saves.length,0);
      if(action==='close')await view.onClose();
      if(action==='refocus')input.focus();
      input.value='我的计划';input.dispatchEvent(new f.win.CompositionEvent('compositionend'));await f.settle();
      assert.equal(f.saves.length,action==='blur'?1:0);
      assert.equal(f.controller.displayName,action==='blur'?'我的计划':'提醒事项');
      if(action==='close'){
        await view.onOpen();view.beginRename();
        assert.equal(f.doc.activeElement,f.doc.querySelector('.nf-reminders-title-input'),'reopening the same view has no stale editor reference');
      }
      assert.deepEqual(f.fileWrites,[]);
    }finally{await f.close();}
  }
});

test('sidebar rename activates the opened reminder page and does not focus a stale view after disable', async()=>{
  const f=fixture();try{
    f.controller.onload();const view=await f.mount();await f.controller.rename();
    assert.deepEqual(f.activated.at(-1),{leaf:view.leaf,options:{focus:false}});
    assert.equal(f.doc.activeElement,f.doc.querySelector('.nf-reminders-title-input'));
    await view.onClose();const gate=deferred();
    f.app.workspace.revealLeaf=async()=>{await gate.promise;};
    const pending=f.controller.rename();await f.settle();f.controller.setEnabled(false);gate.resolve();await pending;
    assert.equal(f.doc.querySelector('.nf-reminders-title-input'),null);
    assert.equal(f.activated.length,1,'disabled pending navigation cannot change the active page');
    assert.deepEqual(f.fileWrites,[]);
  }finally{await f.close();}
});

test('a failed native header refresh does not misreport an already-saved rename or block sidebar updates', async()=>{
  const f=fixture();try{
    f.controller.onload();const view=await f.mount();let sidebar=0,headers=0;
    f.controller.onNameChange=()=>{sidebar++;};
    f.stateHook(()=>{headers++;throw Error('Header unavailable');});
    assert.equal(await f.controller.update(state=>({...state,name:'待推进'})),true);
    assert.equal(f.controller.displayName,'待推进');assert.equal(sidebar,1);assert.equal(headers,1);
    assert.deepEqual(f.notices,[]);assert.deepEqual(f.fileWrites,[]);
    assert.equal(view.contentEl.querySelector('h1').textContent,'待推进');
    assert.equal(await f.controller.setOpenOnStartup(false),true);assert.equal(headers,1,'ordinary preferences never re-enter header refresh');
  }finally{await f.close();}
});
