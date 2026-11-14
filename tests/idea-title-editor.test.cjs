const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const {buildSync}=require('esbuild');
const code=buildSync({entryPoints:['src/idea-title-editor.ts'],bundle:true,write:false,
  platform:'node',format:'cjs',external:['obsidian']}).outputFiles[0].text;

function fixture(actions) {
  const dom=new JSDOM('<!doctype html><body><div class="bases-view"><div class="bases-table-container"><div class="bases-tr"><div class="bases-td" data-property="formula.想法"><div class="bases-table-cell"><span class="internal-link" data-href="Ideas/a.md" draggable="true">原来的想法</span></div></div></div></div></div></body>');
  const win=dom.window,doc=win.document;
  win.HTMLElement.prototype.createEl=function(tag){const el=this.ownerDocument.createElement(tag);this.append(el);return el;};
  win.HTMLElement.prototype.createSpan=function(){return this.createEl('span');};
  const host=doc.querySelector('.bases-table-container'),cell=doc.querySelector('.bases-table-cell'),link=cell.firstElementChild;
  const file={path:'Ideas/a.md',basename:'a',extension:'md'},raw={'这里写想法':'原来的想法'};
  const writes=[],opens=[],notices=[],history=[];let contextMenus=0,hovers=0,gridCopies=0;
  const nativeCell={prop:'formula.想法',el:cell.parentElement,renderer:{el:cell}};
  const entry={file,getRawProperty:key=>raw[key]};
  const row={entry,cells:[nativeCell]};
  const view={_loaded:true,type:'table',config:{name:'想法收集箱',query:{}},containerEl:host,rows:[row],selection:null,
    getCellFromDom:el=>cell.contains(el)?nativeCell:null,getCellIndex:()=>({groupIdx:0,row:0,column:0}),
    updateProperty(file,key,value){writes.push({file,key,value});history.push({...raw});raw[key]=value;return Promise.resolve();},
    undoTransaction(){Object.assign(raw,history.pop());}};
  const addNative=el=>{
    el.addEventListener('click',event=>opens.push({button:event.button,metaKey:event.metaKey,shiftKey:event.shiftKey,type:event.type}));
    el.addEventListener('auxclick',event=>opens.push({button:event.button,type:event.type}));
    el.addEventListener('contextmenu',()=>contextMenus++);el.addEventListener('mouseover',()=>hovers++);
    el.addEventListener('keydown',event=>{if(event.key==='Enter')opens.push({type:'native-key'});});
  };
  addNative(link);
  host.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='z')view.undoTransaction();});
  host.addEventListener('copy',event=>{gridCopies++;event.preventDefault();});
  const mod={exports:{}};
  new vm.Script(code)
    .runInContext(vm.createContext({module:mod,exports:mod.exports,HTMLElement:win.HTMLElement,Element:win.Element,
      require:name=>{assert.equal(name,'obsidian');return {setIcon(el,name){el.dataset.icon=name;},Notice:class{constructor(text){notices.push(text);}}};}}));
  const titles=new mod.exports.IdeaTitleEditors(actions);
  const click=(el,options={})=>el.dispatchEvent(new win.MouseEvent('click',{bubbles:true,cancelable:true,...options}));
  const key=(el,key,options={})=>el.dispatchEvent(new win.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...options}));
  const edit=text=>{link.textContent=text;link.dispatchEvent(new win.InputEvent('input',{bubbles:true,inputType:'insertText'}));};
  return {win,doc,host,cell,link,file,raw,row,view,titles,writes,opens,notices,history,click,key,edit,addNative,
    get contextMenus(){return contextMenus;},get hovers(){return hovers;},get gridCopies(){return gridCopies;},close:()=>{titles.clear();win.close();}};
}


function filename(f) {
  f.view.config.name='发布记录';f.view.config.order=['file.name'];
  f.row.cells[0].prop='file.name';f.cell.parentElement.dataset.property='file.name';
}
function finance(f) {
  const profile={titleColumn:'formula.流水',titleProperty:'流水摘要',tags:{方向:'single'},wrap:true,attachments:[]};
  f.view.config.name='收支流水';f.view.config.nebulaTable=profile;f.row.cells[0].prop=profile.titleColumn;
  f.cell.parentElement.dataset.property=profile.titleColumn;f.raw['流水摘要']='原来的想法';
  return profile;
}
function nativeTitle(f) {
  f.view.config.name='属性标题';f.view.config.titleProperty='这里写想法';f.view.config.order=['note.这里写想法'];
  f.row.cells[0].prop='note.这里写想法';f.row.cells[0].renderer.propertyEditor={};
  f.cell.parentElement.dataset.property='note.这里写想法';f.link.remove();
  const title=f.doc.createElement('div');title.className='metadata-input-longtext';
  title.setAttribute('contenteditable','true');title.setAttribute('role','textbox');title.tabIndex=0;title.textContent='原生标题';f.cell.append(title);
  return title;
}
function pointer(f,target,type,extra={}) {
  const event=new f.win.MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:15,clientY:20,...extra});
  Object.defineProperties(event,{pointerId:{value:1},pointerType:{value:'touch'}});target.dispatchEvent(event);return event;
}

test('record titles and icons open once through the existing route, retaining modifiers and the owning surface',()=>{
  for(const kind of ['idea','filename','finance','native']) {
    const routed=[],renames=[];
    const f=fixture({rename(...args){renames.push(args);},open(view,file,event,titleProperty){routed.push({view,file,titleProperty,source:event.currentTarget,meta:event.metaKey,ctrl:event.ctrlKey,button:event.button,type:event.type});}});
    try {
      const title=kind==='native'?nativeTitle(f):f.link;
      if(kind==='filename')filename(f);if(kind==='finance')finance(f);
      const text=title.textContent;f.titles.refresh(f.view);f.titles.refresh(f.view);
      const icon=f.cell.querySelector('.bui-idea-page-button');assert.ok(icon);assert.equal(f.cell.querySelectorAll('button').length,1);
      for(const target of [title,icon]) for(const options of [{},{metaKey:true},{ctrlKey:true}])f.click(target,options);
      title.dispatchEvent(new f.win.MouseEvent('auxclick',{bubbles:true,cancelable:true,button:1}));
      assert.equal(routed.length,7,kind);assert.ok(routed.every(item=>item.view===f.view&&item.file===f.file&&item.source.isConnected));
      assert.ok(routed.every(item=>item.titleProperty===(kind==='filename'?undefined:kind==='finance'?'流水摘要':'这里写想法')));
      assert.deepEqual(routed.slice(0,3).map(item=>[item.meta,item.ctrl]),[[false,false],[true,false],[false,true]]);
      assert.equal(routed.at(-1).button,1);assert.equal(title.getAttribute('role'),'link');
      assert.notEqual(title.getAttribute('contenteditable'),'plaintext-only');assert.notEqual(title.getAttribute('contenteditable'),'true');
      assert.equal(title.textContent,text);assert.deepEqual(f.writes,[]);assert.deepEqual(renames,[]);assert.deepEqual(f.opens,[]);
    } finally {f.close();}
  }
});

test('without a configured route original native links handle pointer and keyboard navigation once',()=>{
  const f=fixture();try {
    f.titles.refresh(f.view);const icon=f.cell.querySelector('.bui-idea-page-button');
    f.click(f.link);f.click(f.link,{metaKey:true});f.click(icon);
    f.key(f.link,'Enter');f.key(f.link,' ',{ctrlKey:true});
    icon.dispatchEvent(new f.win.MouseEvent('auxclick',{bubbles:true,cancelable:true,button:1}));
    assert.deepEqual(f.opens.map(x=>[x.type,x.button,!!x.metaKey]),[
      ['click',0,false],['click',0,true],['click',0,false],['click',0,false],['click',0,false],['auxclick',1,false]]);
    f.link.dispatchEvent(new f.win.Event('contextmenu',{bubbles:true,cancelable:true}));
    f.link.dispatchEvent(new f.win.MouseEvent('mouseover',{bubbles:true}));
    assert.equal(f.contextMenus,1);assert.equal(f.hovers,1);assert.deepEqual(f.writes,[]);
  } finally {f.close();}
});

test('title keyboard activation forwards modifiers while input, Delete, cut and paste cannot edit a record',()=>{
  for(const native of [false,true]) {
    const routed=[],f=fixture({open(view,file,event){routed.push({view,file,source:event.currentTarget,ctrl:event.ctrlKey,meta:event.metaKey});}});
    try {
      const title=native?nativeTitle(f):f.link;f.titles.refresh(f.view);title.focus();
      f.key(title,'Enter',{metaKey:true});f.key(title,' ',{ctrlKey:true});
      assert.equal(routed.length,2);assert.equal(routed[0].meta,true);assert.equal(routed[1].ctrl,true);
      let gridEdits=0;f.host.addEventListener('keydown',()=>gridEdits++);
      for(const key of ['Backspace','Delete','F2','x'])assert.equal(f.key(title,key),false);
      f.key(title,'Enter',{isComposing:true,keyCode:229});assert.equal(routed.length,2);assert.equal(gridEdits,0);
      for(const type of ['cut','paste']) {
        const event=new f.win.Event(type,{bubbles:true,cancelable:true});title.dispatchEvent(event);assert.equal(event.defaultPrevented,true);
      }
      f.key(title,'ArrowDown');assert.equal(gridEdits,1,'grid navigation remains native');
      const copy=new f.win.Event('copy',{bubbles:true,cancelable:true});title.dispatchEvent(copy);assert.equal(f.gridCopies,1);
      assert.deepEqual(f.writes,[]);
    }finally{f.close();}
  }
});

test('padding and double-clicks never start native title editors or rename files',()=>{
  for(const native of [false,true]) {
    const routed=[],f=fixture({open(){routed.push(true);}});try {
      const title=native?nativeTitle(f):f.link;let nativeClicks=0;
      f.cell.addEventListener('click',()=>nativeClicks++,true);
      f.cell.addEventListener('dblclick',()=>nativeClicks++,true);
      f.titles.refresh(f.view);
      f.click(f.cell);f.click(f.cell.parentElement);
      title.dispatchEvent(new f.win.MouseEvent('dblclick',{bubbles:true,cancelable:true}));
      assert.equal(nativeClicks,0);assert.deepEqual(routed,[]);assert.deepEqual(f.writes,[]);
      if(native){const down=new f.win.MouseEvent('mousedown',{bubbles:true,cancelable:true,button:0});title.dispatchEvent(down);assert.equal(down.defaultPrevented,true);}
      f.click(title);assert.equal(routed.length,1);
    }finally{f.close();}
  }
});

test('title and icon touch drags and cancelled gestures never navigate through a trailing click',()=>{
  const routed=[],f=fixture({open(){routed.push(true);}});try {
    f.doc.body.classList.add('is-mobile');filename(f);f.titles.refresh(f.view);
    for(const target of [f.link,f.cell.querySelector('.bui-idea-page-button')]) {
      const before=routed.length;
      assert.equal(pointer(f,target,'pointerdown').defaultPrevented,false);
      assert.equal(pointer(f,target,'pointermove',{clientY:100}).defaultPrevented,false);
      pointer(f,target,'pointerup',{clientY:100});f.click(target,{clientY:100});assert.equal(routed.length,before);
      pointer(f,target,'pointerdown');pointer(f,target,'pointercancel');f.click(target);assert.equal(routed.length,before);
      pointer(f,target,'pointerdown');pointer(f,target,'pointerup');f.click(target,{clientX:15,clientY:20});assert.equal(routed.length,before+1);
    }
  }finally{f.close();}
});

test('native range selection, shift clicks and mouse drags remain non-navigating',()=>{
  const routed=[],f=fixture({open(){routed.push(true);}});try {
    f.titles.refresh(f.view);f.view.selection={top:0,bottom:1};f.click(f.link);assert.equal(routed.length,0);
    f.view.selection=null;f.click(f.link,{shiftKey:true});f.key(f.link,'Enter',{shiftKey:true});assert.equal(routed.length,0);
    pointer(f,f.link,'pointerdown');pointer(f,f.link,'pointermove',{clientX:80});pointer(f,f.link,'pointerup',{clientX:80});f.click(f.link);assert.equal(routed.length,0);
    const range=f.doc.createRange();range.selectNodeContents(f.link);f.doc.getSelection().addRange(range);f.click(f.link);assert.equal(routed.length,0);
    f.doc.getSelection().removeAllRanges();f.click(f.link);assert.equal(routed.length,1);
  }finally{f.close();}
});

test('read-only and non-Markdown record titles still open without writing any property',()=>{
  for(const readonly of ['isReadOnly','readOnly','controller','dom','attachment']) {
    const routed=[],f=fixture({open(view,file){routed.push(file);}});try {
      if(readonly==='controller')f.view.queryController={view:f.view,isReadOnly:true};
      else if(readonly==='dom')f.cell.setAttribute('aria-readonly','true');
      else if(readonly==='attachment'){f.file.extension='png';f.file.path='Ideas/a.png';f.link.dataset.href=f.file.path;}
      else f.view[readonly]=true;
      f.titles.refresh(f.view);f.click(f.link);assert.deepEqual(routed,[f.file]);assert.deepEqual(f.writes,[]);
    }finally{f.close();}
  }
});

test('stale row, file, controller, query and title profile cannot redirect navigation',()=>{
  for(const change of ['row','path','controller','query','profile','unloaded','removed']) {
    const routed=[],f=fixture({open(){routed.push(true);}});try {
      const profile=finance(f);f.titles.refresh(f.view);
      if(change==='row')f.row.entry.file={path:'Other.md',extension:'md'};
      if(change==='path')f.file.path='Renamed.md';
      if(change==='controller')f.view.queryController={view:{}};
      if(change==='query')f.view.config.query={};
      if(change==='profile')profile.titleProperty='Different';
      if(change==='unloaded')f.view._loaded=false;
      if(change==='removed')f.view.rows=[];
      f.click(f.link);f.click(f.cell.querySelector('button'));assert.deepEqual(routed,[],change);assert.deepEqual(f.writes,[]);
    }finally{f.close();}
  }
});

test('only current-record title formulas gain navigation decoration, related links retain their own native target',()=>{
  const routed=[],f=fixture({open(){routed.push(true);}});try {
    f.view.config.name='其他数据库';f.view.config.order=['formula.想法'];
    f.view.config.query.formulas={想法:{text:'link(file.path, note["这里写想法"])'}};
    f.titles.refresh(f.view);f.click(f.link);assert.equal(routed.length,1);
    f.link.dataset.href='Projects/other.md';f.titles.refresh(f.view);
    assert.equal(f.cell.querySelector('.bui-idea-page-button'),null);f.click(f.link);assert.equal(f.opens.length,1);
    f.link.dataset.href=f.file.path;f.view.config.query.formulas.想法.text='link(file.path, note["这里写想法"] + "!")';
    f.titles.refresh(f.view);assert.equal(f.cell.querySelector('.bui-idea-page-button'),null);
  }finally{f.close();}
});

test('refreshes preserve native title nodes and values; replacing or unloading a renderer removes its decorations',()=>{
  const f=fixture();try {
    const text=f.link.firstChild;f.titles.refresh(f.view);f.titles.refresh(f.view);assert.equal(f.link.querySelector('.bui-idea-title-text').firstChild,text);
    const next=f.link.cloneNode(true);next.textContent='新的渲染';next.className='internal-link';next.removeAttribute('role');next.removeAttribute('tabindex');
    f.addNative(next);f.link.replaceWith(next);f.titles.refresh(f.view);
    assert.equal(f.cell.querySelectorAll('button').length,1);f.click(next);assert.equal(f.opens.length,1);
    f.view._loaded=false;f.titles.prune();assert.equal(f.cell.querySelector('button'),null);assert.equal(next.classList.contains('bui-idea-title'),false);
    assert.equal(next.textContent,'新的渲染');
  }finally{f.close();}
});

test('title hit regions preserve native text nodes and follow renderer replacements without nesting',()=>{
  const routed=[],f=fixture({open(){routed.push(true);}});try {
    const original=f.link.firstChild;f.titles.refresh(f.view);
    const text=f.link.querySelector('.bui-idea-title-text');
    assert.ok(text);assert.equal(text.firstChild,original);
    f.click(text,{detail:1});assert.equal(routed.length,1);
    f.click(f.cell,{detail:1});assert.equal(routed.length,1);
    f.link.textContent='更新后的标题';const replacement=f.link.firstChild;
    f.titles.refresh(f.view);f.titles.refresh(f.view);
    const next=f.link.querySelector('.bui-idea-title-text');
    assert.equal(next.firstChild,replacement);assert.equal(f.link.querySelectorAll('.bui-idea-title-text').length,1);
    f.click(next,{detail:1});assert.equal(routed.length,2);
    f.titles.clear();assert.equal(f.link.firstChild,replacement);assert.equal(f.link.textContent,'更新后的标题');
    assert.equal(f.link.querySelector('.bui-idea-title-text'),null);
  }finally{f.close();}
});

test('clearing restores native contenteditable, roles and tabindex and leaves native editing listeners intact',()=>{
  for(const native of [false,true]) {
    const routed=[],f=fixture({open(){routed.push(true);}});try {
      const title=native?nativeTitle(f):f.link,original=title.outerHTML;
      let input=0;title.addEventListener('input',()=>input++);
      f.titles.refresh(f.view);
      if(native){title.setAttribute('contenteditable','true');f.titles.refresh(f.view);assert.equal(title.getAttribute('contenteditable'),'false');}
      f.titles.clear();assert.equal(title.outerHTML,original);assert.equal(f.cell.querySelector('button'),null);
      title.dispatchEvent(new f.win.InputEvent('input',{bubbles:true}));assert.equal(input,1);assert.deepEqual(routed,[]);
      if(!native){f.click(title);assert.equal(f.opens.length,1);}
    }finally{f.close();}
  }
});

test('failed navigation reports an error without editing or replacing title data',async()=>{
  for(const asynchronous of [false,true]) {
    const f=fixture({open(){if(asynchronous)return Promise.reject(Error('closed'));throw Error('closed');}});try {
      f.titles.refresh(f.view);const original=f.link.textContent;f.click(f.link);
      await new Promise(resolve=>setImmediate(resolve));
      assert.equal(f.notices.length,1);assert.equal(f.link.textContent,original);assert.deepEqual(f.writes,[]);
    }finally{f.close();}
  }
});
