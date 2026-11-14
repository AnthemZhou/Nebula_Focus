const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildSync}=require('esbuild');
const {JSDOM}=require('jsdom');
const code=buildSync({entryPoints:['src/native-title-sync.ts'],bundle:true,write:false,platform:'node',format:'cjs',external:['obsidian']}).outputFiles[0].text;

function fixture(t,{property='流水摘要',value='导入时的标题',enabled=true,basename='原文件名',aliases=['保留的别名'],remember=true}={}) {
  const dom=new JSDOM('<body><div class="workspace"><div class="markdown-view"><div class="view-header-title-parent">Records /</div><div class="view-header-title" contenteditable="true" tabindex="0">原文件名</div><div class="inline-title" contenteditable="true" tabindex="0">原文件名</div><h1 contenteditable="true">正文标题</h1></div><div class="bases-view"></div></div></body>');
  const doc=dom.window.document,el=doc.querySelector('.inline-title'),heading=doc.querySelector('.view-header-title'),events={},writes=[],notices=[],nativeSaves=[],nativeAttempts=[];
  const file={path:'Records/'+basename+'.md',basename,extension:'md'};el.textContent=basename;heading.textContent=basename;
  const raw={aliases,status:'active'};if(value!==undefined)raw[property]=value;
  class MarkdownView {
    constructor(){this.file=file;this.containerEl=doc.querySelector('.markdown-view');this.inlineTitleEl=el;this.titleEl=heading;this.fileBeingRenamed=null;}
    getDisplayText(){return this.file?.basename??'空白';}
    saveTitle(title){
      assert.equal(this,view);assert.ok(title===el||title===heading);
      nativeAttempts.push(title.textContent);
      if(this.fileBeingRenamed!==file||title.textContent.trim()===file.basename)return Promise.resolve(true);
      return new Promise(resolve=>nativeSaves.push(resolve));
    }
  }
  const view=new MarkdownView(),leaves=[{view,header:basename,updateHeader(){this.header=this.view.getDisplayText();}}],source={type:'table',config:{name:'收支流水',nebulaTable:{titleColumn:'formula.标题',titleProperty:property,tags:{},wrap:true,attachments:[]}},containerEl:doc.querySelector('.bases-view')};
  const app={workspace:{containerEl:doc.querySelector('.workspace'),iterateAllLeaves:fn=>leaves.forEach(fn),on:(name,fn)=>{events[name]=fn;}},
    metadataCache:{getFileCache:()=>({frontmatter:raw}),on:(name,fn)=>{events[name]=fn;}},vault:{on:(name,fn)=>{events[name]=fn;},getFileByPath:path=>path===file.path?file:null},
    fileManager:{async processFrontMatter(file,fn){if(app.beforeProcess)await app.beforeProcess();const next=structuredClone(raw);fn(next);writes.push(next);for(const key of Object.keys(raw))delete raw[key];Object.assign(raw,next);}}};
  const module={exports:{}};
  new Function('module','exports','require',code)(module,module.exports,()=>({Component:class {registerEvent(){}},MarkdownView,Notice:class{constructor(text){notices.push(text);}}}));
  const sync=new module.exports.NativeTitleSync({app},enabled);sync.onload();if(remember)sync.remember(source,file,property);
  for(const target of [el,heading]) {
  target.addEventListener('focus',()=>{view.fileBeingRenamed=file;});
  target.addEventListener('keydown',event=>{
    if(event.isComposing)return;
    if(event.key==='Escape')view.fileBeingRenamed=null;
    else if(event.key==='Enter')void view.saveTitle(target);
  });
  target.addEventListener('blur',()=>{void view.saveTitle(target);});
  }
  const event=(type,options={})=>{const Event=type==='keydown'?dom.window.KeyboardEvent:dom.window.Event;el.dispatchEvent(new Event(type,{bubbles:true,...options}));};
  const focus=()=>{el.dispatchEvent(new dom.window.FocusEvent('focus'));};
  const input=text=>{el.textContent=text;event('input');};
  const commit=(key='Enter')=>key==='blur'?event('blur'):event('keydown',{key});
  const flush=()=>new Promise(resolve=>setImmediate(resolve));
  const finishNative=async(value=true)=>{for(const resolve of nativeSaves.splice(0))resolve(value);await flush();};
  const rename=async(name,oldPath=file.path)=>{file.basename=name;file.path=folder(oldPath)+name+'.md';events.rename(file,oldPath);await flush();await finishNative();};
  const folder=path=>path.slice(0,path.lastIndexOf('/')+1);
  t.after(()=>{sync.onunload();dom.window.close();});
  return {sync,doc,el,heading,source,file,view,raw,events,writes,notices,app,focus,input,commit,rename,event,flush,leaves,finishNative,MarkdownView,nativeAttempts};
}

test('a real native page-title rename updates only the mapped existing field after the rename succeeds',async t=>{
  for(const property of ['流水摘要','这里写想法','title']) {
    const f=fixture(t,{property});f.focus();f.input('新的中文标题');assert.equal(f.writes.length,0);
    f.commit(property==='title'?'blur':'Enter');assert.equal(f.writes.length,0);
    await f.rename('新的中文标题');assert.equal(f.raw[property],'新的中文标题');
    assert.deepEqual(f.raw.aliases,['保留的别名']);assert.equal(f.raw.status,'active');assert.equal(f.doc.querySelector('h1').textContent,'正文标题');
    assert.equal(f.writes.length,1);assert.equal(f.notices.length,0);
    // Mobile navigation unloads its source Base; the remembered explicit field
    // remains valid without requiring that Base to stay visible.
    f.source._loaded=false;f.focus();f.input('第二个标题');f.commit('blur');await f.rename('第二个标题');assert.equal(f.raw[property],'第二个标题');
  }
});

test('Chinese composition commits only the final native title and Escape never updates metadata',async t=>{
  const f=fixture(t);f.focus();f.event('compositionstart');f.input('中');f.commit();
  f.event('compositionend');f.input('中文标题');assert.equal(f.writes.length,0);
  f.commit();await f.rename('中文标题');assert.equal(f.raw['流水摘要'],'中文标题');
  f.focus();f.input('取消的名字');f.commit('Escape');f.commit('blur');await f.rename('取消的名字');assert.equal(f.raw['流水摘要'],'中文标题');
});

test('external renames, folder moves, body headings and failed or mismatched native edits never change mapped data',async t=>{
  for(const kind of ['external','uncommitted','body','move','different-name','different-view','no-native-session','mapping-change']) {
    const f=fixture(t);const initial=f.raw['流水摘要'];
    if(!['external','body'].includes(kind)){f.focus();f.input('新标题');if(kind!=='uncommitted')f.commit();}
    if(kind==='body'){const h=f.doc.querySelector('h1');h.dispatchEvent(new f.doc.defaultView.FocusEvent('focus'));h.textContent='新标题';h.dispatchEvent(new f.doc.defaultView.Event('input',{bubbles:true}));}
    if(kind==='move'){const old=f.file.path;f.file.path='Other/新标题.md';f.file.basename='新标题';f.events.rename(f.file,old);await f.flush();}
    else if(kind==='mapping-change'){f.source.config.nebulaTable.titleProperty='其他属性';await f.rename('新标题');}
    else{if(kind==='different-view')f.view.file={...f.file};if(kind==='no-native-session')f.view.fileBeingRenamed=null;await f.rename(kind==='different-name'?'其他标题':'新标题');}
    assert.equal(f.writes.length,0,kind);assert.equal(f.raw['流水摘要'],initial,kind);
  }
  const f=fixture(t);f.sync.remember({...f.source,readOnly:true},f.file,'流水摘要');f.focus();f.input('不应同步');f.commit();await f.rename('不应同步');assert.equal(f.writes.length,0,'a later read-only navigation revokes an older writable mapping');
});

test('missing, blank, non-string, aliases and ambiguous mapped fields remain untouched',async t=>{
  for(const variant of ['missing','empty','space','number','list','aliases','conflict']) {
    const options=variant==='aliases'?{property:'aliases',value:'别名'}:variant==='empty'?{value:''}:variant==='space'?{value:' '}:variant==='number'?{value:3}:variant==='list'?{value:['标题']}:{};
    const f=fixture(t,options);
    if(variant==='missing')delete f.raw['流水摘要'];
    if(variant==='conflict') {
      f.raw['另一个名称']='不同的语义';const other={...f.source,config:{...f.source.config,nebulaTable:{...f.source.config.nebulaTable,titleProperty:'另一个名称'}}};
      f.sync.remember(other,f.file,'另一个名称');
    }
    const before=structuredClone(f.raw);f.focus();f.input('新标题');f.commit();await f.rename('新标题');assert.deepEqual(f.raw,before,variant);assert.equal(f.writes.length,0,variant);
  }
});

test('read-only navigation and later read-only changes block synchronization',async t=>{
  for(const kind of ['source','controller','late','dom']) {
    const f=fixture(t);f.sync.setEnabled(false);f.sync.setEnabled(true);
    if(kind==='source')f.source.readOnly=true;
    if(kind==='controller')f.source.queryController={isReadOnly:true};
    if(kind==='dom')f.source.containerEl.setAttribute('aria-readonly','true');
    f.sync.remember(f.source,f.file,'流水摘要');f.focus();f.input('新标题');f.commit();
    if(kind==='late')f.source.isReadOnly=true;
    await f.rename('新标题');assert.equal(f.writes.length,0,kind);
  }
});

test('concurrent property edits fail closed and do not add back removed fields',async t=>{
  for(const operation of ['change','remove']) {
    const f=fixture(t);f.focus();f.input('新标题');f.commit();
    f.app.beforeProcess=()=>{if(operation==='change')f.raw['流水摘要']='AI刚编辑的内容';else delete f.raw['流水摘要'];};
    await f.rename('新标题');assert.equal(f.writes.length,0);assert.equal(f.raw['流水摘要'],operation==='change'?'AI刚编辑的内容':undefined);
    assert.equal(f.notices.length,1);assert.match(f.notices[0],/属性同时发生变化/);
  }
});

test('native mode, unloading and disabling during an in-flight write cancel synchronization',async t=>{
  for(const operation of ['disabled','unloaded','pending','document']) {
    const f=fixture(t);f.focus();f.input('新标题');f.commit();
    if(operation==='disabled')f.sync.setEnabled(false);
    if(operation==='unloaded')f.sync.onunload();
    if(operation==='pending')f.app.beforeProcess=()=>f.sync.setEnabled(false);
    if(operation==='document')f.events['window-close']({}, {document:f.doc});
    await f.rename('新标题');assert.equal(f.writes.length,0,operation);assert.equal(f.notices.length,0,operation);
  }
});

test('unrelated records and plain filename columns do not register synchronization',async t=>{
  const f=fixture(t);f.sync.setEnabled(false);f.sync.setEnabled(true);
  f.sync.remember({...f.source,config:{name:'普通文件',order:['file.name']}},f.file,'流水摘要');
  f.focus();f.input('新标题');f.commit();await f.rename('新标题');assert.equal(f.writes.length,0);
});

test('failed native saves expire their intent even when the host retains fileBeingRenamed',async t=>{
  const f=fixture(t);f.focus();f.input('失败的名称');f.commit('blur');await f.finishNative(false);
  assert.equal(f.view.fileBeingRenamed,f.file,'the real MarkdownView leaves this flag set after inline blur');
  assert.equal(Object.hasOwn(f.view,'saveTitle'),true,'the readable-title projection keeps its no-op-save guard');
  await f.rename('失败的名称');assert.equal(f.writes.length,0,'a later unrelated rename cannot reuse the failed intent');
});

test('renaming back, repeated focus sessions and retrying a failed save without refocusing retain correct originals',async t=>{
  const f=fixture(t);f.focus();f.input('临时名称');f.commit();await f.rename('临时名称');
  f.event('blur');await f.flush();assert.equal(Object.hasOwn(f.view,'saveTitle'),true);
  f.focus();f.input('原文件名');f.commit('blur');await f.rename('原文件名');assert.equal(f.raw['流水摘要'],'原文件名');
  f.focus();f.input('再次名称');f.commit();await f.finishNative(false);assert.equal(f.writes.length,2);
  f.input('最终名称');f.commit();await f.rename('最终名称');assert.equal(f.raw['流水摘要'],'最终名称');assert.equal(f.writes.length,3);
  f.sync.setEnabled(false);assert.equal(Object.hasOwn(f.view,'saveTitle'),false);
});

test('mapped labels replace native UUID headers and inline titles without renaming on open, focus or blur',async t=>{
  const id='40f8af0b-ac3f-811c-af67-c1c6e5f190af';
  const f=fixture(t,{basename:id,aliases:['导入时旧别名'],value:'LUXURY MAPPING｜外包付款8000元'});
  assert.equal(f.el.textContent,f.raw['流水摘要']);assert.equal(f.leaves[0].header,f.raw['流水摘要']);
  f.focus();f.commit('blur');await f.flush();
  assert.equal(f.nativeAttempts.length,0,'projecting a label is never a native rename request');
  assert.equal(f.file.basename,id);assert.equal(f.writes.length,0);
  f.el.textContent=id;await f.flush();assert.equal(f.el.textContent,f.raw['流水摘要'],'a native mode redraw recovers the label');
  f.raw['流水摘要']='AI 改过的摘要';f.events.changed(f.file);await f.flush();
  assert.equal(f.el.textContent,'AI 改过的摘要');assert.equal(f.leaves[0].header,'AI 改过的摘要');
  f.sync.setEnabled(false);assert.equal(f.el.textContent,id);assert.equal(f.leaves[0].header,id);
  assert.equal(Object.hasOwn(f.view,'getDisplayText'),false);assert.equal(Object.hasOwn(f.view,'saveTitle'),false);
});

test('already-open imported IDs use aliases after restart; ordinary names and arbitrary fields are not guessed',async t=>{
  const id='40f8af0bac3f811caf67c1c6e5f190af';
  const f=fixture(t,{basename:id,aliases:['来自已有别名的标题'],remember:false});
  assert.equal(f.el.textContent,'来自已有别名的标题');assert.equal(f.leaves[0].header,'来自已有别名的标题');
  f.focus();f.input('用户给的新名字');f.commit();await f.rename('用户给的新名字');f.event('blur');await f.flush();
  assert.equal(f.el.textContent,'用户给的新名字');assert.equal(f.writes.length,0);
  assert.deepEqual(f.raw.aliases,['来自已有别名的标题']);assert.equal(f.raw['流水摘要'],'导入时的标题');
  const named=fixture(t,{remember:false,aliases:['另一个别名']});assert.equal(named.el.textContent,'原文件名');
  const opaque=fixture(t,{basename:id,aliases:[],remember:false});assert.equal(opaque.el.textContent,id);
  const declared=fixture(t,{basename:id,property:'title',value:'明确声明的标题',remember:false});
  assert.equal(declared.el.textContent,'明确声明的标题');
  declared.focus();declared.input('新的声明标题');declared.commit();await declared.rename('新的声明标题');
  assert.equal(declared.raw.title,'新的声明标题');
});

test('metadata refresh preserves a focused IME draft and Escape restores the readable title without a write',async t=>{
  const f=fixture(t);f.focus();f.event('compositionstart');f.input('标题输入中');
  f.events.changed(f.file);f.events['layout-change']();await f.flush();
  assert.equal(f.el.textContent,'标题输入中');assert.equal(f.nativeAttempts.length,0);
  f.commit();await f.flush();assert.equal(f.nativeAttempts.length,0,'Enter during composition cannot invoke native rename');
  f.event('compositionend');f.commit('Escape');f.commit('blur');await f.flush();
  assert.equal(f.el.textContent,'导入时的标题');assert.equal(f.nativeAttempts.length,0);assert.equal(f.writes.length,0);
});

test('the breadcrumb final title shares the readable label and safe native editing, without changing path prefixes',async t=>{
  const id='40f8af0b-ac3f-811c-af67-c1c6e5f190af',f=fixture(t,{basename:id});
  assert.equal(f.heading.textContent,'导入时的标题');assert.equal(f.doc.querySelector('.view-header-title-parent').textContent,'Records /');
  const dispatch=(type,options={})=>{const Event=type==='keydown'?f.doc.defaultView.KeyboardEvent:f.doc.defaultView.Event;f.heading.dispatchEvent(new Event(type,{bubbles:true,...options}));};
  dispatch('focus');dispatch('blur');await f.flush();assert.equal(f.nativeAttempts.length,0);assert.equal(f.file.basename,id);
  f.heading.textContent=id;await f.flush();assert.equal(f.heading.textContent,'导入时的标题');
  dispatch('focus');f.heading.textContent='从标题栏修改';dispatch('input');dispatch('keydown',{key:'Enter'});await f.rename('从标题栏修改');
  dispatch('blur');await f.flush();assert.equal(f.raw['流水摘要'],'从标题栏修改');assert.equal(f.el.textContent,'从标题栏修改');
  f.raw['流水摘要']='外部标题更新';f.events.changed(f.file);await f.flush();assert.equal(f.heading.textContent,'外部标题更新');
  f.sync.setEnabled(false);assert.equal(f.heading.textContent,'从标题栏修改');assert.equal(f.doc.querySelector('.view-header-title-parent').textContent,'Records /');
});
