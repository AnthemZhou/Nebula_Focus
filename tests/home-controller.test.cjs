const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildSync}=require('esbuild');
const {JSDOM}=require('jsdom');
const compiled=buildSync({entryPoints:['src/home-controller.ts'],bundle:true,write:false,platform:'node',format:'cjs',external:['obsidian','./home-view']}).outputFiles[0].text;
const copy=value=>JSON.parse(JSON.stringify(value));
const SOURCE={filters:{and:['file.inFolder("Records")','note.状态 != "归档"']},formulas:{标题:'link(file.path, note.名称)'},properties:{'note.金额':{displayName:'预算'}},
  views:[{name:'工作视图',type:'table',order:['formula.标题','note.状态','note.金额'],filters:{and:['note.类型 == "项目"']},
    sort:[{property:'note.金额',direction:'DESC'}],columnSize:{'formula.标题':340},nebulaTable:{titleColumn:'formula.标题',titleProperty:'名称',tags:{状态:'single'},wrap:true,attachments:[]}},
    {name:'另一视图',type:'cards',order:['formula.标题'],groupBy:{property:'note.状态'}}],extra:{preserved:['unknown-settings']}};
function fixture(initial,environment){
  const dom=new JSDOM('<main></main>',{pretendToBeVisual:true}),win=dom.window,doc=win.document;doc.win=win;
  win.createEl=tag=>doc.createElement(tag);win.createFragment=()=>doc.createDocumentFragment();
  win.HTMLElement.prototype.createDiv=function(options={}){const el=doc.createElement('div');el.className=options.cls??'';el.textContent=options.text??'';this.append(el);return el;};
  class Component{
    constructor(){this._children=[];this.clean=[];}
    register(fn){this.clean.push(fn);}
    registerEvent(ref){this.register(()=>ref.off?.());}
    unload(){for(const fn of this.clean.splice(0).reverse())fn();for(const child of this._children)child.unload?.();this.onunload?.();}
  }
  class TFolder{constructor(path){this.path=path;}}
  class Value{constructor(value){this.value=value;}toString(){return String(this.value);}}
  class NumberValue extends Value{}class StringValue extends Value{}class BooleanValue extends Value{}class NullValue{}
  const files=new Map(),folders=new Map(),content=new Map(),saved=[],notices=[],errors=[],creates=[],reads=[],renders=[],opened=[],renames=new Set(),metadata=new Set();
  const leaves=[],layoutReady=[],states=[],revealed=[],factories=new Map(),workspaceEvents=new Map();
  let failSave=false,failCreate=false,nextId=0,renderHook,stateHook;
  class HomeView{constructor(leaf,host){this.leaf=leaf;this.host=host;}getViewType(){return'nebula-home';}}
  const addLeaf=(type='empty',live=false)=>{
    const leaf={state:{type,state:{preserved:true}},view:{getViewType:()=>type},
      getViewState(){return this.state;},
      async setViewState(state){
        const previous=this.state.type;this.state=state;states.push({leaf,state});await stateHook?.(leaf,state);
        if(this.state!==state)return; // A later user navigation supersedes this pending operation.
        // Match the host's same-type shortcut: a ghost cannot repair itself
        // without first resetting the leaf to another type.
        if(previous!==state.type)this.view=factories.get(state.type)?.(this)??{getViewType:()=>state.type};
      },openFile:async file=>opened.push(file.path)};
    if(live)leaf.view=new HomeView(leaf,controller);
    leaves.push(leaf);return leaf;
  };
  const put=(path,value)=>{const file={path,extension:path.split('.').at(-1)};files.set(path,file);content.set(path,typeof value==='string'?value:JSON.stringify(value));return file;};
  const event=(listeners,callback)=>{listeners.add(callback);return{off:()=>listeners.delete(callback)};};
  const app={vault:{
    getFileByPath:path=>files.get(path)??null,getAbstractFileByPath:path=>files.get(path)??folders.get(path)??null,getFiles:()=>[...files.values()],
    read:async file=>{assert.equal(files.get(file.path),file);reads.push(file.path);return content.get(file.path);},
    createFolder:async path=>{assert.ok(!files.has(path));folders.set(path,new TFolder(path));},
    create:async(path,value)=>{if(failCreate)throw Error('disk unavailable');assert.ok(!files.has(path),'no existing source or module can be overwritten');creates.push({path,value});return put(path,value);},
    modify(){throw Error('Unexpected file overwrite');},process(){throw Error('Unexpected Markdown or Base mutation');},delete(){throw Error('Unexpected file deletion');},trash(){throw Error('Unexpected file deletion');},
    on:(name,callback)=>{assert.equal(name,'rename');return event(renames,callback);},
  },workspace:{getLeavesOfType:type=>leaves.filter(leaf=>leaf.view.getViewType()===type),iterateAllLeaves:callback=>leaves.forEach(callback),
    getLeaf:()=>addLeaf(),revealLeaf:async leaf=>revealed.push(leaf),onLayoutReady:fn=>layoutReady.push(fn),
    on(name,callback){if(!workspaceEvents.has(name))workspaceEvents.set(name,new Set());return event(workspaceEvents.get(name),callback);}},
    metadataCache:{on:(name,callback)=>{assert.equal(name,'changed');return event(metadata,callback);},offref:ref=>ref.off()}};
  const plugin={app,registerView(type,factory){factories.set(type,factory);},addCommand(){}};
  const api={Component,Plugin:class{},TFolder,NumberValue,StringValue,BooleanValue,NullValue,
    Notice:class{constructor(message){notices.push(message);}},parseYaml:JSON.parse,stringifyYaml:value=>JSON.stringify(value),
    MarkdownRenderer:{async render(...args){renders.push(args);await renderHook?.(...args);}}};
  const mod={exports:{}};
  new Function('require','module','exports','crypto','console','MutationObserver','window',compiled)(name=>{
    if(name==='obsidian')return api;
    if(name==='./home-view')return{HOME_VIEW_TYPE:'nebula-home',HomeView};
    throw Error(`Unexpected dependency ${name}`);
  },mod,mod.exports,environment?environment.crypto:{randomUUID:()=>`test-clone-${++nextId}`},{error:(...args)=>errors.push(args)},win.MutationObserver,win);
  const controller=new mod.exports.HomeController(plugin,initial,async config=>{if(failSave)throw Error('settings unavailable');saved.push(copy(config));});
  const source=put('Bases/项目.base',SOURCE),note=put('Records/示例.md','# 原始笔记\n\n内容保持原样。');
  const module=(id='module_a',extra={})=>({kind:'view',id,title:'项目模块',collapsed:false,source:source.path,view:'工作视图',basePath:'',height:420,...extra});
  const current=id=>controller.config.modules.find(module=>module.id===id);
  const read=path=>JSON.parse(content.get(path));
  const tick=()=>new Promise(resolve=>win.setTimeout(resolve,5));
  const emitRename=async(oldPath,newPath)=>{
    const file=files.get(oldPath);assert.ok(file);files.delete(oldPath);const text=content.get(oldPath);content.delete(oldPath);file.path=newPath;files.set(newPath,file);content.set(newPath,text);
    for(const callback of renames)callback(file,oldPath);await controller.writes;
  };
  return{dom,win,doc,Component,NumberValue,HomeView,controller,files,folders,content,saved,notices,errors,creates,reads,renders,opened,metadata,put,module,current,read,tick,emitRename,source,note,
    leaves,layoutReady,states,revealed,addLeaf,setStateHook:hook=>{stateHook=hook;},
    workspaceEvent(name){for(const callback of workspaceEvents.get(name)??[])callback();},
    setFailSave:value=>{failSave=value;},setFailCreate:value=>{failCreate=value;},setRenderHook:hook=>{renderHook=hook;},
    close(){controller.unload();dom.window.close();}};
}

test('Home source clones can be created repeatedly when mobile Web Crypto is unavailable',async()=>{
  const f=fixture(undefined,{});try{
    assert.deepEqual(await Promise.all([f.controller.saveModule(f.module('one')),f.controller.saveModule(f.module('two'))]),[true,true]);
    assert.equal(f.creates.length,2);assert.notEqual(f.current('one').basePath,f.current('two').basePath);
    assert.deepEqual(f.read(f.current('one').basePath).filters,SOURCE.filters);
    assert.equal(f.content.get(f.note.path),'# 原始笔记\n\n内容保持原样。');
  }finally{f.close();}
});

test('saving a view module clones one independent Base and preserves source filters, profile and every Markdown byte',async()=>{
  const f=fixture();try{
    const originalSource=f.content.get(f.source.path),originalNote=f.content.get(f.note.path),candidate=f.module();
    assert.equal(await f.controller.saveModule(candidate),true);const saved=f.current(candidate.id),clone=f.read(saved.basePath);
    assert.ok(saved.basePath.startsWith('Nebula Views/Home/'));assert.notEqual(saved.basePath,f.source.path);assert.equal(candidate.basePath,'','caller-owned module is not mutated');
    assert.deepEqual(clone.filters,SOURCE.filters);assert.deepEqual(clone.formulas,SOURCE.formulas);assert.deepEqual(clone.properties,SOURCE.properties);assert.deepEqual(clone.extra,SOURCE.extra);
    assert.equal(clone.views.length,1);assert.equal(clone.views[0].name,'首页视图');
    assert.deepEqual(clone.views[0].filters,SOURCE.views[0].filters);assert.deepEqual(clone.views[0].nebulaTable,SOURCE.views[0].nebulaTable);
    assert.deepEqual(clone.nebulaHomeModule,{version:1,id:candidate.id});
    assert.equal(f.content.get(f.source.path),originalSource);assert.equal(f.content.get(f.note.path),originalNote);assert.equal(f.creates.length,1);assert.equal(f.saved.length,1);
  }finally{f.close();}
});

test('modules using one source remain isolated, while presentation edits preserve their native custom settings',async()=>{
  const f=fixture();try{
    assert.deepEqual(await Promise.all([f.controller.saveModule(f.module('a')),f.controller.saveModule(f.module('b'))]),[true,true]);
    const a=f.current('a'),b=f.current('b');assert.notEqual(a.basePath,b.basePath);
    const customized=f.read(a.basePath);customized.views[0].filters={and:['note.状态 == "完成"']};customized.views[0].columnSize={'formula.标题':610};customized.views[0].sort=[];
    const before=JSON.stringify(customized);f.content.set(a.basePath,before);
    assert.equal(await f.controller.saveModule({...a,title:'新的标题',height:600,collapsed:true}),true);
    assert.equal(f.current('a').basePath,a.basePath);assert.equal(f.content.get(a.basePath),before);assert.equal(f.creates.length,2);
    assert.deepEqual(f.read(b.basePath).views[0].filters,SOURCE.views[0].filters);assert.deepEqual(f.read(f.source.path),SOURCE);
  }finally{f.close();}
});

test('changing source or selected view creates a new clone and never overwrites the previously customized module file',async()=>{
  const f=fixture();try{
    await f.controller.saveModule(f.module());const original=f.current('module_a'),before=f.content.get(original.basePath);
    await f.controller.saveModule({...original,view:'另一视图'});const alternate=f.current('module_a');assert.notEqual(alternate.basePath,original.basePath);
    assert.equal(f.read(alternate.basePath).views[0].type,'cards');assert.equal(f.content.get(original.basePath),before);
    f.put('Bases/另一来源.base',{...SOURCE,filters:{and:['file.inFolder("Other")']}});
    await f.controller.saveModule({...alternate,source:'Bases/另一来源.base',view:'工作视图'});const changed=f.current('module_a');
    assert.notEqual(changed.basePath,alternate.basePath);assert.deepEqual(f.read(changed.basePath).filters,{and:['file.inFolder("Other")']});assert.ok(f.files.has(alternate.basePath));
  }finally{f.close();}
});

test('failed settings or file writes preserve the last committed Home and do not damage source data',async()=>{
  const f=fixture();try{
    await f.controller.saveModule(f.module());const previous=copy(f.controller.config),source=f.content.get(f.source.path);
    f.setFailSave(true);assert.equal(await f.controller.saveModule(f.module('new')),false);assert.deepEqual(f.controller.config,previous);
    assert.equal(f.saved.length,1);assert.equal(f.content.get(f.source.path),source);
    f.setFailSave(false);f.setFailCreate(true);assert.equal(await f.controller.saveModule(f.module('another')),false);assert.deepEqual(f.controller.config,previous);
    f.setFailCreate(false);assert.equal(await f.controller.saveModule({...f.current('module_a'),title:'重试成功'}),true);
    assert.equal(f.current('module_a').title,'重试成功');
  }finally{f.close();}
});

test('unknown config versions, missing sources, unsafe ownership and context-dependent filters cannot create or overwrite views',async()=>{
  const future=fixture({version:99,title:'future',modules:[]});try{
    assert.equal(await future.controller.saveModule(future.module()),false);assert.equal(await future.controller.update(config=>({...config,title:'changed'})),false);
    assert.deepEqual(future.creates,[]);assert.deepEqual(future.saved,[]);assert.equal(future.folders.size,0);
  }finally{future.close();}
  const f=fixture();try{
    assert.equal(await f.controller.saveModule(f.module('missing',{source:'Bases/missing.base'})),false);assert.equal(f.folders.size,0);
    assert.equal(await f.controller.saveModule(f.module('md',{source:f.note.path})),false);assert.equal(f.creates.length,0);
    f.put('Bases/context.base',{...SOURCE,filters:{and:['file.path == this.file.path']}});
    assert.equal(await f.controller.saveModule(f.module('context',{source:'Bases/context.base'})),false);assert.equal(f.creates.length,0);
    await f.controller.saveModule(f.module());const old=f.current('module_a'),config=copy(f.controller.config),foreign={...f.read(old.basePath),nebulaHomeModule:{version:1,id:'someone_else'}};
    f.content.set(old.basePath,JSON.stringify(foreign));assert.equal(await f.controller.saveModule({...old,height:500}),false);assert.deepEqual(f.controller.config,config);assert.deepEqual(f.read(old.basePath),foreign);
  }finally{f.close();}
});

test('rename events update references and module removal only edits Home configuration',async()=>{
  const f=fixture();try{
    f.controller.onload();await f.controller.saveModule(f.module());const original=f.current('module_a'),basePath=original.basePath;
    await f.controller.saveModule({kind:'links',id:'links',title:'链接',collapsed:false,paths:[f.source.path,f.note.path]});
    await f.emitRename(f.source.path,'Bases/重命名.base');assert.equal(f.current('module_a').source,'Bases/重命名.base');assert.equal(f.current('links').paths[0],'Bases/重命名.base');
    await f.emitRename(basePath,'Nebula Views/Home/重命名模块.base');assert.equal(f.current('module_a').basePath,'Nebula Views/Home/重命名模块.base');
    const bytes=[...f.content.entries()];assert.equal(await f.controller.update(config=>({...config,modules:config.modules.filter(module=>module.id!=='module_a')})),true);
    assert.equal(f.current('module_a'),undefined);assert.deepEqual([...f.content.entries()],bytes);assert.ok(f.files.has('Nebula Views/Home/重命名模块.base'));
  }finally{f.close();}
});

test('summary source clones use native tables without creation and listSources omits private module copies',async()=>{
  const f=fixture();try{
    const module=f.module('summary',{kind:'summary',operation:'sum',property:'note.金额',groupBy:'',view:'另一视图'});delete module.height;
    assert.equal(await f.controller.saveModule(module),true);const clone=f.read(f.current('summary').basePath);
    assert.equal(clone.views[0].type,'table');assert.equal(clone.views[0].nebulaAllowCreate,false);assert.deepEqual(clone.views[0].groupBy,SOURCE.views[1].groupBy);
    f.put('Bases/broken.base','not JSON');const sources=await f.controller.listSources();assert.deepEqual(sources.map(source=>source.path),[f.source.path]);
    assert.ok(sources[0].properties.includes('formula.标题'));assert.ok(sources[0].properties.includes('note.金额'));
  }finally{f.close();}
});

async function mountedSummary(f){
  const definition=f.module('summary',{kind:'summary',operation:'sum',property:'note.金额',groupBy:''});delete definition.height;await f.controller.saveModule(definition);
  const component=new f.Component(),host=f.doc.querySelector('main');let updates=0;
  const one={file:{path:'one.md'},getValue:()=>new f.NumberValue(0.1)},two={file:{path:'two.md'},getValue:()=>new f.NumberValue(0.2)};
  let view,original;
  f.setRenderHook(async(app,markdown,embed,source,owner)=>{
    assert.equal(owner,component);assert.equal(source,f.source.path);assert.equal(markdown,`![[${f.current('summary').basePath}]]`);
    const root=embed.createDiv({cls:'bases-table-container'});
    original=function(...args){assert.equal(this,view);updates++;return args[0]??'native-result';};
    view={type:'table',containerEl:root,queryData:{data:[one,two]},rows:[{entry:one}],onDataUpdated:original};component._children.push({controller:{view}});
  });
  await f.controller.mountModule(host,f.current('summary'),component);
  return{component,host,get view(){return view;},original,one,two,get updates(){return updates;}};
}
test('mounted summaries use filtered native queries, refresh on native lifecycle, and restore wrappers on unload',async()=>{
  const f=fixture();try{
    const mounted=await mountedSummary(f),output=mounted.host.querySelector('.nf-home-summary-output');
    assert.equal(output.querySelector('dd').textContent,'0.3');assert.match(output.textContent,/2 条/);assert.notEqual(mounted.view.onDataUpdated,mounted.original);
    const label=output.querySelector('dt');assert.equal(mounted.view.onDataUpdated('passthrough'),'passthrough');assert.equal(output.querySelector('dt'),label);
    mounted.view.queryData={data:[mounted.one]};mounted.view.onDataUpdated();assert.equal(output.querySelector('dd').textContent,'0.1');
    assert.equal(mounted.updates,2);assert.equal(f.metadata.size,1);
    mounted.component.unload();assert.equal(mounted.view.onDataUpdated,mounted.original);assert.equal(f.metadata.size,0);
    mounted.view.queryData={data:[mounted.two]};mounted.view.onDataUpdated();assert.equal(output.querySelector('dd').textContent,'0.1','unloaded summary cannot update detached UI');
  }finally{f.close();}
});

test('mounted summaries show unavailable for incomplete queries and recover when the identical filtered result returns',async()=>{
  const f=fixture();try{
    const mounted=await mountedSummary(f),output=mounted.host.querySelector('.nf-home-summary-output');
    assert.equal(output.querySelector('dd').textContent,'0.3');
    mounted.view.queryData={data:[undefined]};mounted.view.onDataUpdated();assert.equal(output.querySelector('dd'),null);assert.match(output.textContent,/暂未取得/);
    mounted.view.queryData={data:[mounted.one,mounted.two]};mounted.view.onDataUpdated();
    assert.equal(output.querySelector('dd')?.textContent,'0.3');mounted.component.unload();
  }finally{f.close();}
});

test('hidden summary metadata notifications refresh the full query and unload respects a later native wrapper',async()=>{
  const f=fixture();try{
    const mounted=await mountedSummary(f),output=mounted.host.querySelector('.nf-home-summary-output');
    mounted.view.queryData={data:[mounted.two]};for(const notify of f.metadata)notify();await f.tick();
    assert.equal(output.querySelector('dd').textContent,'0.2');
    const installed=mounted.view.onDataUpdated,later=function(...args){return installed.apply(this,args);};mounted.view.onDataUpdated=later;
    mounted.component.unload();assert.equal(mounted.view.onDataUpdated,later,'teardown must not replace a subsequent owner');assert.equal(f.metadata.size,0);
    mounted.view.queryData={data:[mounted.one]};assert.equal(mounted.view.onDataUpdated('still-native'),'still-native');assert.equal(output.querySelector('dd').textContent,'0.2');
  }finally{f.close();}
});

test('a module cannot mount an unowned source file and a stopped controller cannot persist further changes',async()=>{
  const f=fixture();try{
    await assert.rejects(f.controller.mountModule(f.doc.querySelector('main'),f.module('foreign',{basePath:f.source.path}),new f.Component()),/不是此模块/);
    assert.equal(f.renders.length,0);assert.equal(f.creates.length,0);
    f.controller.unload();assert.equal(await f.controller.saveModule(f.module()),false);assert.equal(await f.controller.update(config=>({...config,title:'new'})),false);
    assert.equal(f.creates.length,0);assert.equal(f.saved.length,0);
  }finally{f.close();}
});

test('layout readiness restores ghost Home leaves in place without opening or rebuilding a live Home',async()=>{
  const f=fixture();try{
    const ghost=f.addLeaf('nebula-home');f.controller.onload();const live=f.addLeaf('nebula-home',true),liveView=live.view;
    assert.deepEqual(f.states,[]);for(const ready of f.layoutReady)ready();await f.tick();
    assert.equal(f.leaves.length,2);assert.ok(ghost.view instanceof f.HomeView);assert.equal(ghost.view.host,f.controller);
    assert.equal(live.view,liveView);assert.deepEqual(f.states.map(item=>item.state.type),['empty','nebula-home']);
    assert.ok(f.states.every(item=>item.leaf===ghost&&item.state.active===false));
    assert.deepEqual(ghost.state.state,{preserved:true});assert.deepEqual(f.revealed,[]);assert.deepEqual(f.creates,[]);
  }finally{f.close();}
});

test('saved Home state repairs a different-type placeholder and late layout arrivals without creating or activating leaves',async()=>{
  const f=fixture();try{
    const ghost=f.addLeaf('nebula-home');ghost.view={getViewType:()=> 'empty'};
    const other=f.addLeaf('markdown'),otherView=other.view;
    assert.equal(f.controller.app.workspace.getLeavesOfType('nebula-home').length,0);
    f.controller.onload();for(const ready of f.layoutReady)ready();await f.tick();
    assert.ok(ghost.view instanceof f.HomeView);assert.equal(other.view,otherView);
    const later=f.addLeaf('nebula-home');later.view={getViewType:()=> 'unknown'};
    f.workspaceEvent('layout-change');f.workspaceEvent('active-leaf-change');f.workspaceEvent('layout-change');await f.tick();
    assert.ok(later.view instanceof f.HomeView);assert.equal(f.leaves.length,3);
    assert.deepEqual(f.states.map(item=>item.state.type),['empty','nebula-home','empty','nebula-home']);
    assert.deepEqual(f.revealed,[]);assert.deepEqual(f.creates,[]);
    f.workspaceEvent('layout-change');await f.tick();assert.equal(f.states.length,4,'valid views are not rebuilt by later events');
  }finally{f.close();}
});

test('deferred Home loads through the native lifecycle before considering a placeholder reset',async()=>{
  const f=fixture();try{
    const deferred=f.addLeaf('nebula-home');deferred.isDeferred=true;deferred.view={getViewType:()=> 'deferred'};
    let loads=0;deferred.loadIfDeferred=async()=>{loads++;deferred.isDeferred=false;deferred.view=new f.HomeView(deferred,f.controller);};
    f.controller.onload();for(const ready of f.layoutReady)ready();await f.tick();
    assert.equal(loads,1);assert.ok(deferred.view instanceof f.HomeView);assert.deepEqual(f.states,[]);assert.deepEqual(f.revealed,[]);
    const failedFactory=f.addLeaf('nebula-home');failedFactory.isDeferred=true;
    failedFactory.loadIfDeferred=async()=>{failedFactory.isDeferred=false;failedFactory.view={getViewType:()=> 'unknown'};};
    f.workspaceEvent('layout-change');await f.tick();
    assert.ok(failedFactory.view instanceof f.HomeView);assert.deepEqual(f.states.map(item=>item.state.type),['empty','nebula-home']);
  }finally{f.close();}
});

test('user navigation during deferred loading or a temporary empty reset is never overwritten or revealed',async()=>{
  for(const phase of ['deferred','reset']){
    const f=fixture();let release;try{
      const ghost=f.addLeaf('nebula-home'),pause=new Promise(resolve=>{release=resolve;});
      if(phase==='deferred'){
        ghost.isDeferred=true;ghost.loadIfDeferred=async()=>{await pause;ghost.isDeferred=false;};
      }else f.setStateHook(async(_leaf,state)=>{if(state.type==='empty')await pause;});
      f.controller.onload();for(const ready of f.layoutReady)ready();await f.tick();
      await ghost.setViewState({type:'markdown',state:{file:'Notes/Chosen.md'},active:true});
      const chosen=ghost.view;release();await f.tick();
      assert.equal(ghost.state.type,'markdown');assert.deepEqual(ghost.state.state,{file:'Notes/Chosen.md'});assert.equal(ghost.view,chosen);
      assert.equal(f.states.filter(item=>item.state.type==='nebula-home').length,0);assert.deepEqual(f.revealed,[]);assert.equal(f.leaves.length,1);
      f.workspaceEvent('layout-change');await f.tick();assert.equal(ghost.view,chosen);
    }finally{release?.();f.close();}
  }
});

test('unload while deferred Home loads cancels restoration and removes subsequent layout observers',async()=>{
  const f=fixture();let release;try{
    const ghost=f.addLeaf('nebula-home'),pause=new Promise(resolve=>{release=resolve;});
    ghost.isDeferred=true;ghost.loadIfDeferred=async()=>{await pause;ghost.isDeferred=false;};
    f.controller.onload();for(const ready of f.layoutReady)ready();await f.tick();
    f.controller.unload();release();await f.tick();f.workspaceEvent('layout-change');f.workspaceEvent('active-leaf-change');await f.tick();
    assert.deepEqual(f.states,[]);assert.deepEqual(f.revealed,[]);assert.equal(f.leaves.length,1);
  }finally{release?.();f.close();}
});

test('opening a ghost while layout recovery is in flight shares its leaf and repair operation',async()=>{
  const f=fixture();let release;try{
    const ghost=f.addLeaf('nebula-home');f.controller.onload();
    const paused=new Promise(resolve=>{release=resolve;});f.setStateHook(async(_leaf,state)=>{if(state.type==='empty')await paused;});
    for(const ready of f.layoutReady)ready();await f.tick();
    assert.equal(ghost.state.type,'empty','exercise the temporary-type interval');
    const one=f.controller.open(),two=f.controller.open();assert.equal(one,two);assert.equal(f.leaves.length,1);
    release();await Promise.all([one,two]);
    assert.ok(ghost.view instanceof f.HomeView);assert.equal(f.leaves.length,1);
    assert.deepEqual(f.states.map(item=>item.state.type),['empty','nebula-home']);assert.deepEqual(f.revealed,[ghost]);
    await f.controller.open();assert.equal(f.states.length,2,'a valid Home does not remount on each open');
  }finally{release?.();f.close();}
});

test('concurrent first opens create one Home tab, and unloading cancels deferred ghost recovery',async()=>{
  const f=fixture();try{
    f.controller.onload();await Promise.all([f.controller.open(),f.controller.open()]);
    assert.equal(f.leaves.length,1);assert.equal(f.leaves[0].state.type,'nebula-home');assert.equal(f.states.length,1);
  }finally{f.close();}
  const stopped=fixture();try{
    const ghost=stopped.addLeaf('nebula-home'),original=ghost.view;stopped.controller.onload();
    for(const ready of stopped.layoutReady)ready();stopped.controller.unload();await stopped.tick();
    assert.equal(ghost.view,original);assert.deepEqual(stopped.states,[]);await stopped.controller.open();assert.equal(stopped.leaves.length,1);
  }finally{stopped.close();}
});

test('openInto opens exactly the requested leaf while preserving an existing Home and sharing its configuration',async()=>{
  const initial={version:1,title:'My dashboard',modules:[{kind:'links',id:'links',title:'Useful pages',collapsed:false,paths:['Records/示例.md']}]};
  const f=fixture(initial);try{
    f.controller.onload();const left=f.addLeaf('nebula-home',true),leftView=left.view,target=f.addLeaf();
    const config=f.controller.config,before=copy(config),files=[...f.content];
    await f.controller.openInto(target);
    assert.equal(f.leaves.length,2);assert.equal(left.view,leftView);assert.ok(target.view instanceof f.HomeView);
    assert.equal(target.view.host,leftView.host);assert.equal(target.view.host.config,config);assert.deepEqual(config,before);
    assert.deepEqual(f.states.map(item=>item.leaf),[target]);assert.deepEqual(f.revealed,[target]);
    assert.deepEqual([...f.content],files);assert.deepEqual(f.saved,[]);assert.deepEqual(f.creates,[]);
    const targetView=target.view;await f.controller.openInto(target);
    assert.equal(target.view,targetView);assert.equal(f.states.length,1,'an already loaded Home is not rebuilt');
  }finally{f.close();}
});

test('openInto replaces a deferred non-Home destination without loading its old content or inheriting its state',async()=>{
  const f=fixture();try{
    f.controller.onload();const target=f.addLeaf('markdown');target.isDeferred=true;
    target.state={type:'markdown',state:{file:'Notes/Old.md',mode:'source'},pinned:true,group:'old-group'};
    target.loadIfDeferred=async()=>{throw Error('The discarded deferred file must not load');};
    await f.controller.openInto(target);
    assert.ok(target.view instanceof f.HomeView);
    assert.deepEqual(f.states.map(item=>item.state),[{type:'nebula-home',state:{},active:false}]);
    assert.deepEqual(f.revealed,[target]);assert.deepEqual(f.saved,[]);assert.deepEqual(f.creates,[]);
  }finally{f.close();}
});

test('openInto deduplicates one target without merging separate targets or racing layout recovery',async()=>{
  const f=fixture();let release;try{
    f.controller.onload();for(const ready of f.layoutReady)ready();const one=f.addLeaf(),two=f.addLeaf();
    const pause=new Promise(resolve=>{release=resolve;});
    f.setStateHook(async(leaf,state)=>{if(leaf===one&&state.type==='nebula-home')await pause;});
    const first=f.controller.openInto(one),duplicate=f.controller.openInto(one);assert.equal(first,duplicate);
    f.workspaceEvent('layout-change');await f.tick();
    await f.controller.openInto(two);assert.deepEqual(f.revealed,[two]);assert.equal(f.states.length,2);
    release();await Promise.all([first,duplicate]);
    assert.ok(one.view instanceof f.HomeView);assert.ok(two.view instanceof f.HomeView);
    assert.equal(f.states.filter(item=>item.leaf===one).length,1);assert.deepEqual(f.revealed,[two,one]);
  }finally{release?.();f.close();}
});

test('openInto joins an in-flight ghost repair and reveals only that specific Home',async()=>{
  const f=fixture();let release;try{
    const left=f.addLeaf('nebula-home',true),target=f.addLeaf('nebula-home'),pause=new Promise(resolve=>{release=resolve;});
    f.controller.onload();f.setStateHook(async(leaf,state)=>{if(leaf===target&&state.type==='empty')await pause;});
    for(const ready of f.layoutReady)ready();await f.tick();
    assert.equal(target.state.type,'empty');const opening=f.controller.openInto(target);release();await opening;
    assert.ok(target.view instanceof f.HomeView);assert.ok(left.view instanceof f.HomeView);
    assert.deepEqual(f.states.map(item=>item.state.type),['empty','nebula-home']);assert.deepEqual(f.revealed,[target]);
  }finally{release?.();f.close();}
});

test('openInto never reveals a replaced or closed target and never continues after unloading',async()=>{
  for(const interruption of ['navigate','close','unload']){
    const f=fixture();let release;try{
      f.controller.onload();const target=f.addLeaf(),pause=new Promise(resolve=>{release=resolve;});
      f.setStateHook(async(leaf,state)=>{if(leaf===target&&state.type==='nebula-home')await pause;});
      const opening=f.controller.openInto(target);
      if(interruption==='navigate')await target.setViewState({type:'markdown',state:{file:'Chosen.md'},active:true});
      if(interruption==='close')f.leaves.splice(f.leaves.indexOf(target),1);
      if(interruption==='unload')f.controller.unload();
      release();await opening;assert.deepEqual(f.revealed,[]);assert.deepEqual(f.saved,[]);assert.deepEqual(f.creates,[]);
      if(interruption==='navigate')assert.equal(target.state.state.file,'Chosen.md');
      if(interruption==='unload'){
        const other=f.addLeaf(),count=f.states.length;await f.controller.openInto(other);
        assert.equal(f.states.length,count);assert.equal(other.state.type,'empty');
      }
    }finally{release?.();f.close();}
  }
});

test('openInto propagates mount/config failures to its caller and allows a later retry',async()=>{
  const f=fixture();try{
    f.controller.onload();const target=f.addLeaf();
    f.setStateHook(async()=>{throw Error('mount failed');});
    await assert.rejects(f.controller.openInto(target),/mount failed/);
    assert.deepEqual(f.revealed,[]);assert.deepEqual(f.notices,[]);
    f.setStateHook(undefined);await f.controller.openInto(target);
    assert.ok(target.view instanceof f.HomeView);assert.deepEqual(f.revealed,[target]);assert.deepEqual(f.saved,[]);
  }finally{f.close();}
  const invalid=fixture({version:99,title:'Future',modules:[]});try{
    invalid.controller.onload();const target=invalid.addLeaf();
    await assert.rejects(invalid.controller.openInto(target),/版本/);
    assert.deepEqual(invalid.states,[]);assert.deepEqual(invalid.saved,[]);assert.deepEqual(invalid.notices,[]);
  }finally{invalid.close();}
});
