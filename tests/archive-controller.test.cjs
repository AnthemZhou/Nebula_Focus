const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const {buildSync, transformSync} = require('esbuild');
const {JSDOM} = require('jsdom');
const controllerScript = new vm.Script(buildSync({entryPoints:['src/archive-controller.ts'],bundle:true,write:false,
  platform:'node',format:'cjs',external:['obsidian','node:*']}).outputFiles[0].text);
// Run the real startup wiring, stubbing unrelated feature modules rather than
// compiling/initializing every visual subsystem for this platform boundary.
const startupScript = new vm.Script(transformSync(readFileSync('src/main.ts','utf8'),{loader:'ts',format:'cjs'}).code);

function fixture({desktop=true,local=true,mobile=!desktop}={}) {
  const dom=new JSDOM('<!doctype html><body></body>',{pretendToBeVisual:true}),win=dom.window,doc=win.document;
  const files=new Map(),folders=new Map(),embeds=new Map(),destinations=new Map(),trash=[],requests=[],nodeLoads=[],commands=[],children=[],modals=[];
  let pending;
  win.HTMLElement.prototype.createEl=function(tag,options={}) {
    const el=doc.createElement(tag);el.textContent=options.text??'';
    if(options.cls)el.className=options.cls;
    for(const [name,value] of Object.entries(options.attr??{}))el.setAttribute(name,value);
    this.append(el);return el;
  };
  win.HTMLElement.prototype.createDiv=function(options={}){return this.createEl('div',options);};
  class Component {register(){}registerEvent(){} }
  class FileSystemAdapter {getBasePath(){return '/vault';}}
  class TFile {constructor(path){this.path=path;this.name=path.split('/').at(-1);this.basename=this.name.replace(/\.[^.]+$/,'');this.extension=path.split('.').at(-1);}}
  class TFolder {constructor(path){this.path=path;this.name=path.split('/').at(-1);this.children=[];}}
  class Modal {
    constructor(){this.contentEl=doc.createElement('section');modals.push(this);}
    setTitle(title){this.title=title;}
    open(){doc.body.append(this.contentEl);}
    close(){this.contentEl.remove();}
  }
  class Setting {
    constructor(host){this.host=host;}
    addButton(build){
      const el=this.host.createEl('button');
      const control={setButtonText(text){el.textContent=text;return control;},setCta(){return control;},setDisabled(value){el.disabled=value;return control;},
        onClick(callback){el.addEventListener('click',()=>{pending=callback();});return control;}};
      build(control);return this;
    }
  }
  class Plugin extends Component {
    constructor(){super();this.manifest={id:'nebula-focus'};}
    async loadData(){return {};}
    addChild(child){children.push(child);child.onload?.();return child;}
    addCommand(command){commands.push(command);}
    registerDomEvent(){}registerInterval(id){win.clearInterval(id);}
  }
  const api={Component,Plugin,FileSystemAdapter,Platform:{isDesktopApp:desktop,isMobile:mobile},TFile,TFolder,Modal,Setting};
  const mod={exports:{}};
  controllerScript.runInNewContext({module:mod,exports:mod.exports,console,navigator:win.navigator,
    require(name){if(name==='obsidian')return api;nodeLoads.push(name);throw Error('Unexpected Node load: '+name);}});
  const plugin=new Plugin();
  plugin.app={isMobile:mobile,vault:{configDir:'.obsidian',adapter:local?new FileSystemAdapter():{},getName:()=> 'Test',
    getFileByPath:path=>files.get(path)??null,getFolderByPath:path=>folders.get(path)??null,
    async trash(file,system){
      trash.push({path:file.path,system});files.delete(file.path);folders.delete(file.path);
      if(file.parent)file.parent.children=file.parent.children.filter(child=>child!==file);
    },on(){return {};},getFiles:()=>[]},
    // Obsidian's configurable trash helper must never select permanent deletion.
    fileManager:{trashFile(){throw Error('Do not delegate to the deletion preference');}},
    metadataCache:{getFileCache:file=>({embeds:embeds.get(file.path)??[]}),getFirstLinkpathDest:link=>destinations.get(link)??null,on(){return {};}},
    workspace:{on(){return {};},onLayoutReady(){},getActiveFile:()=>null,containerEl:doc.body}};
  const controller=new mod.exports.ArchiveController(plugin,{directory:'/archives'},async()=>{},()=>{});
  const result={format:'nebula-focus-archive',version:1,packagePath:'/archives/nebula-archive-example',label:'Project',createdAt:'2026-11-12T00:00:00Z',status:'archived',entries:[],errors:[]};
  controller.engine={async archiveFiles(request){
    requests.push(request);
    for(const item of request.items)if(item.removeSource)await request.trashSource(item.path);
    return result;
  }};
  const putFolder=(path,parent)=>{const value=new TFolder(path);value.parent=parent;parent?.children.push(value);folders.set(path,value);return value;};
  const putFile=(path,parent)=>{const value=new TFile(path);value.parent=parent;parent?.children.push(value);files.set(path,value);return value;};
  return {dom,win,doc,api,mod,plugin,controller,files,folders,embeds,destinations,trash,requests,nodeLoads,commands,children,modals,putFile,putFolder,
    async click(text){const button=[...doc.querySelectorAll('button')].find(el=>el.textContent===text);assert.ok(button,text);button.click();await pending;},
    close(){controller.onunload();dom.window.close();}};
}

test('folder archive includes its companion page, only copies shared embeds, and always uses recoverable local trash',async()=>{
  const f=fixture();try{
    const folder=f.putFolder('Projects/A'),nested=f.putFolder('Projects/A/Notes',folder);
    const page=f.putFile('Projects/A.md'),note=f.putFile('Projects/A/Notes/Plan.md',nested);
    f.putFile('Projects/A/local.png',folder);
    const shared=f.putFile('Assets/shared.png'),linked=f.putFile('Other project.md');
    f.embeds.set(note.path,[{link:'shared.png'},{link:'shared.png'},{link:'Other project'}]);
    f.embeds.set(page.path,[{link:'shared.png'}]);
    f.destinations.set('shared.png',shared);f.destinations.set('Other project',linked);
    f.controller.open({id:folder.path,title:'A',kind:'folder',parent:'Projects',folderPath:folder.path,filePath:page.path,children:[]});
    assert.equal(f.requests.length,0);assert.equal(f.trash.length,0);
    assert.match(f.doc.body.textContent,/外部目录：\/archives/);
    await f.controller.setDirectory('/different-directory');
    await f.click('保存到外部并归档');
    assert.equal(f.requests.length,1);
    assert.equal(f.requests[0].archiveRoot,'/archives','execution uses the destination shown in this confirmation');
    assert.deepEqual([...f.requests[0].protectedPaths],['.obsidian']);
    assert.deepEqual(JSON.parse(JSON.stringify(f.requests[0].items)).sort((a,b)=>a.path.localeCompare(b.path)),[
      {path:shared.path,removeSource:false},{path:page.path,removeSource:true},{path:'Projects/A/local.png',removeSource:true},{path:note.path,removeSource:true},
    ].sort((a,b)=>a.path.localeCompare(b.path)));
    assert.ok(f.trash.every(item=>item.system===false));
    assert.deepEqual(f.trash.map(item=>item.path).sort(),[page.path,note.path,'Projects/A/local.png',folder.path].sort());
    assert.equal(f.files.get(shared.path),shared);assert.equal(f.files.get(linked.path),linked);
    assert.match(f.doc.querySelector('[role="status"]').textContent,/归档完成/);assert.deepEqual(f.nodeLoads,[]);
  }finally{f.close();}
});

test('cancelling and callbacks retained after unload never start an archive',async()=>{
  const f=fixture();try{
    const page=f.putFile('A.md'),node={id:page.path,title:'A',kind:'page',parent:'',filePath:page.path,children:[]};
    f.controller.open(node);await f.click('取消');assert.equal(f.doc.querySelector('section'),null);
    f.controller.open(node);f.controller.onunload();await f.click('保存到外部并归档');
    assert.equal(f.requests.length,0);assert.deepEqual(f.trash,[]);assert.equal(f.files.get(page.path),page);
    assert.match(f.doc.querySelector('[role="status"]').textContent,/插件已关闭/);
  }finally{f.close();}
});

test('unloading while backup is pending stops later trash callbacks and preserves source files',async()=>{
  const f=fixture();try{
    const page=f.putFile('A.md');let finishBackup;
    f.controller.engine={async archiveFiles(request){
      await new Promise(resolve=>{finishBackup=resolve;});await request.trashSource(page.path);
      throw Error('The stopped controller should never reach this point');
    }};
    f.controller.open({id:page.path,title:'A',kind:'page',parent:'',filePath:page.path,children:[]});
    const saving=f.click('保存到外部并归档');
    assert.equal(typeof finishBackup,'function');f.controller.onunload();finishBackup();await saving;
    assert.deepEqual(f.trash,[]);assert.equal(f.files.get(page.path),page);
    assert.match(f.doc.querySelector('[role="status"]').textContent,/关闭|停止/);
  }finally{f.close();}
});

test('real plugin startup registers external archives only for desktop filesystem vaults and imports no Node modules on mobile',async()=>{
  for(const [desktop,local,mobile,expected] of [[false,false,true,false],[false,true,true,false],[true,false,false,false],[true,true,true,false],[true,true,false,true]]){
    const f=fixture({desktop,local,mobile});try{
      class Noop {}
      const noopModules=new Proxy({}, {get:()=>Noop});
      const module={exports:{}};
      startupScript.runInNewContext({module,exports:module.exports,console,document:f.doc,window:f.win,
        MutationObserver:class{observe(){}disconnect(){}},ResizeObserver:class{observe(){}disconnect(){}},
        require(name){
          if(name==='obsidian')return f.api;
          if(name==='./archive-controller')return f.mod.exports;
          if(name==='./page-sidebar')return {PageSidebar:class {
            onload(){this.indexedSettings={ribbon:!!this.ribbon,archives:!!this.archives,rightWorkspace:!!this.rightWorkspace};}
          }};
          if(name==='./finance-native-migration')return {migrateFinanceBases:async()=>({failed:[]})};
          if(name==='./native-presentation')return {record:value=>!!value&&typeof value==='object',nativeAppField:(app,key)=>app[key]};
          if(name.includes('.woff2'))return '';
          if(name.startsWith('node:')){f.nodeLoads.push(name);throw Error('Node loaded during startup');}
          return noopModules;
        }});
      const plugin=new module.exports.default();plugin.app=f.plugin.app;
      plugin.installShortcutGuides=()=>{};plugin.syncTouchMode=()=>{};plugin.syncAppearanceDocuments=()=>{};
      await plugin.onload();
      assert.ok(f.commands.some(command=>command.id==='open-note-database'),'startup must complete past unrelated commands');
      assert.equal(f.commands.some(command=>command.id==='open-external-archives'),expected);
      assert.equal(!!plugin.pageSidebar.archives,expected);assert.deepEqual(f.nodeLoads,[]);
      assert.equal(plugin.pageSidebar.indexedSettings.ribbon,true,'ribbon must exist before the settings tab is indexed');
      assert.equal(plugin.pageSidebar.indexedSettings.rightWorkspace,true);
      assert.equal(plugin.pageSidebar.indexedSettings.archives,expected,'archive settings must not be omitted by early indexing');
    }finally{f.close();}
  }
});
