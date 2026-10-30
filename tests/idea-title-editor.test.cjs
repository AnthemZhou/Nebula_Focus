const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const {transformSync}=require('esbuild');

function fixture() {
  const dom=new JSDOM('<!doctype html><body><div class="bases-view"><div class="bases-table-container"><div class="bases-tr"><div class="bases-td" data-property="formula.想法"><div class="bases-table-cell"><span class="internal-link" data-href="Ideas/a.md" draggable="true">原来的想法</span></div></div></div></div></div></body>');
  const win=dom.window,doc=win.document;
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
  new vm.Script(transformSync(fs.readFileSync('src/idea-title-editor.ts','utf8'),{loader:'ts',format:'cjs'}).code)
    .runInContext(vm.createContext({module:mod,exports:mod.exports,HTMLElement:win.HTMLElement,Element:win.Element,
      require:name=>{assert.equal(name,'obsidian');return {setIcon(el,name){el.dataset.icon=name;},Notice:class{constructor(text){notices.push(text);}}};}}));
  const titles=new mod.exports.IdeaTitleEditors();
  const click=(el,options={})=>el.dispatchEvent(new win.MouseEvent('click',{bubbles:true,cancelable:true,...options}));
  const key=(el,key,options={})=>el.dispatchEvent(new win.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...options}));
  const edit=text=>{link.textContent=text;link.dispatchEvent(new win.InputEvent('input',{bubbles:true,inputType:'insertText'}));};
  return {win,doc,host,cell,link,file,raw,row,view,titles,writes,opens,notices,history,click,key,edit,addNative,
    get contextMenus(){return contextMenus;},get hovers(){return hovers;},get gridCopies(){return gridCopies;},close:()=>{titles.clear();win.close();}};
}

test('plain title clicks edit the original link at the clicked caret; only native updateProperty commits and remains undoable',()=>{
  const f=fixture();try {
    const original=f.link.firstChild;
    f.doc.caretRangeFromPoint=()=>{const range=f.doc.createRange();range.setStart(original,2);return range;};
    f.titles.refresh(f.view);f.titles.refresh(f.view);
    assert.equal(f.cell.querySelectorAll('button').length,2);assert.deepEqual(f.writes,[]);
    f.click(f.link,{clientX:40,clientY:10});assert.deepEqual(f.opens,[]);
    assert.equal(f.link.firstChild,original);assert.equal(f.link.getAttribute('contenteditable'),'plaintext-only');
    assert.equal(f.doc.getSelection().isCollapsed,true);assert.equal(f.doc.getSelection().anchorOffset,2);
    f.edit('新的想法');f.titles.refresh(f.view);assert.deepEqual(f.writes,[]);
    f.key(f.link,'Enter');assert.equal(f.writes.length,1);
    assert.equal(f.writes[0].file,f.file);assert.equal(f.writes[0].key,'这里写想法');assert.equal(f.writes[0].value,'新的想法');
    assert.equal(f.file.path,'Ideas/a.md');assert.equal(f.link.dataset.href,'Ideas/a.md');assert.equal(f.link.textContent,'新的想法');
    assert.equal(f.link.hasAttribute('contenteditable'),false);assert.deepEqual(f.opens,[]);
    f.key(f.link,'z',{ctrlKey:true});assert.equal(f.raw['这里写想法'],'原来的想法');
  } finally {f.close();}
});

test('both real buttons and modified link clicks delegate navigation, while native context menus and hover remain attached',()=>{
  const f=fixture();try {
    f.titles.refresh(f.view);
    const icon=f.cell.querySelector('.bui-idea-page-button'),open=f.cell.querySelector('.bui-idea-open-button');
    assert.equal(icon.tagName,'BUTTON');assert.equal(icon.type,'button');assert.equal(icon.getAttribute('aria-label'),'打开想法笔记');
    f.click(icon);f.click(open,{metaKey:true});f.click(f.link,{metaKey:true});
    open.dispatchEvent(new f.win.MouseEvent('auxclick',{bubbles:true,cancelable:true,button:1}));
    assert.deepEqual(f.opens.map(x=>[x.type,x.button,!!x.metaKey]),[['click',0,false],['click',0,true],['click',0,true],['auxclick',1,false]]);
    f.link.dispatchEvent(new f.win.Event('contextmenu',{bubbles:true,cancelable:true}));
    f.link.dispatchEvent(new f.win.MouseEvent('mouseover',{bubbles:true}));
    assert.equal(f.contextMenus,1);assert.equal(f.hovers,1);assert.deepEqual(f.writes,[]);
    f.view.isReadOnly=true;f.click(f.link);assert.equal(f.link.hasAttribute('contenteditable'),false);
    f.click(icon);assert.equal(f.opens.length,5);
  } finally {f.close();}
});

test('native range selection, shift-click and pointer drags never navigate or enter editing',()=>{
  const f=fixture();try {
    f.titles.refresh(f.view);f.view.selection={top:0,bottom:1};
    f.click(f.link);assert.deepEqual(f.opens,[]);assert.equal(f.link.hasAttribute('contenteditable'),false);
    f.view.selection=null;f.click(f.link,{shiftKey:true});assert.equal(f.link.hasAttribute('contenteditable'),false);
    f.link.dispatchEvent(new f.win.MouseEvent('pointerdown',{bubbles:true,button:0,clientX:0,clientY:0}));
    f.click(f.link,{clientX:50,clientY:0});assert.equal(f.link.hasAttribute('contenteditable'),false);
    const range=f.doc.createRange();range.selectNodeContents(f.link);f.doc.getSelection().addRange(range);
    f.click(f.link);assert.equal(f.link.hasAttribute('contenteditable'),false);assert.deepEqual(f.opens,[]);
  } finally {f.close();}
});

test('non-Markdown entries cannot edit or write title properties, while their native navigation remains available',()=>{
  const f=fixture();try {
    f.file.extension='png';f.file.path='Ideas/a.png';f.link.dataset.href=f.file.path;
    f.titles.refresh(f.view);
    f.click(f.link);f.key(f.link,'Enter');
    assert.equal(f.link.hasAttribute('contenteditable'),false);assert.deepEqual(f.writes,[]);
    assert.equal(f.link.textContent,'原来的想法');assert.deepEqual(f.opens,[]);
    f.click(f.cell.querySelector('.bui-idea-page-button'));
    f.click(f.cell.querySelector('.bui-idea-open-button'),{metaKey:true});
    f.click(f.link,{metaKey:true});
    assert.equal(f.opens.length,3);assert.equal(f.opens[1].metaKey,true);assert.equal(f.opens[2].metaKey,true);
    assert.deepEqual(f.writes,[]);assert.equal(f.file.path,'Ideas/a.png');
  } finally {f.close();}
});

test('Escape and clear discard drafts; blur saves; native table clipboard handlers cannot replace edited text selections',()=>{
  const f=fixture();try {
    f.titles.refresh(f.view);f.key(f.link,'Enter');f.edit('放弃');f.key(f.link,'Escape');
    assert.deepEqual(f.writes,[]);assert.equal(f.link.textContent,'原来的想法');assert.deepEqual(f.opens,[]);
    f.key(f.link,'Enter');f.edit('失焦保存');
    const copy=new f.win.Event('copy',{bubbles:true,cancelable:true});f.link.dispatchEvent(copy);
    assert.equal(copy.defaultPrevented,false);assert.equal(f.gridCopies,0);
    f.link.blur();assert.equal(f.writes.length,1);assert.equal(f.writes[0].value,'失焦保存');
    f.key(f.link,'Enter');f.edit('关闭时丢弃');f.titles.clear();
    assert.equal(f.writes.length,1);assert.equal(f.link.textContent,'失焦保存');assert.equal(f.link.getAttribute('draggable'),'true');
    assert.equal(f.link.hasAttribute('contenteditable'),false);assert.equal(f.link.hasAttribute('role'),false);
    assert.equal(f.cell.querySelectorAll('button').length,0);assert.equal(f.cell.classList.contains('bui-idea-title-cell'),false);
    f.click(f.link);assert.equal(f.opens.length,1);
  } finally {f.close();}
});

test('Chinese composition Enter never commits, and a composition blur waits for the final input value',async()=>{
  const f=fixture();try {
    f.titles.refresh(f.view);f.click(f.link);f.edit('xiang');
    f.link.dispatchEvent(new f.win.CompositionEvent('compositionstart'));
    f.key(f.link,'Enter',{isComposing:true});f.key(f.link,'Enter',{keyCode:229});assert.deepEqual(f.writes,[]);
    f.link.blur();assert.deepEqual(f.writes,[]);
    f.link.dispatchEvent(new f.win.CompositionEvent('compositionend'));f.edit('想法完成');
    await Promise.resolve();assert.equal(f.writes.length,1);assert.equal(f.writes[0].value,'想法完成');assert.deepEqual(f.opens,[]);
  } finally {f.close();}
});

test('read-only, changed source data, reused rows and changed bases cannot save stale drafts',()=>{
  const f=fixture();try {
    f.titles.refresh(f.view);f.click(f.link);f.edit('不要保存');f.view.isReadOnly=true;f.link.blur();assert.deepEqual(f.writes,[]);
    f.view.isReadOnly=false;f.click(f.link);f.edit('过期');f.raw['这里写想法']='外部更新';f.link.blur();assert.deepEqual(f.writes,[]);
    f.click(f.link);f.edit('其他base');f.view.config.query={};f.link.blur();assert.deepEqual(f.writes,[]);
    f.titles.refresh(f.view);f.click(f.link);f.edit('其他行');f.row.entry={file:{path:'other.md'}};f.titles.prune();
    assert.deepEqual(f.writes,[]);assert.equal(f.link.hasAttribute('contenteditable'),false);assert.equal(f.cell.querySelectorAll('button').length,0);
  } finally {f.close();}
});

test('native formula rerenders replace decorations once and unloading leaves the reused cell clean',()=>{
  const f=fixture();try {
    f.titles.refresh(f.view);f.click(f.link);f.edit('草稿');
    const replacement=f.doc.createElement('span');replacement.className='internal-link';replacement.textContent='原生更新';replacement.dataset.href=f.file.path;
    f.addNative(replacement);f.cell.replaceChildren(replacement);f.titles.refresh(f.view);
    assert.deepEqual(f.writes,[]);assert.equal(f.cell.querySelectorAll('button').length,2);
    assert.equal(f.cell.classList.contains('bui-idea-title-cell'),true);assert.equal(replacement.textContent,'原生更新');
    f.titles.clear();assert.equal(f.cell.querySelectorAll('button').length,0);assert.equal(f.cell.classList.contains('bui-idea-title-cell'),false);
    f.click(replacement);assert.equal(f.opens.length,1);
  } finally {f.close();}
});

test('unchanged fallback titles do not add properties; explicit clearing uses the native property transaction',()=>{
  const f=fixture();try {
    delete f.raw['这里写想法'];f.link.textContent='a';f.titles.refresh(f.view);f.click(f.link);f.key(f.link,'Enter');
    assert.deepEqual(f.writes,[]);
    f.click(f.link);f.edit('新增标题');f.key(f.link,'Enter');assert.equal(f.writes.length,1);
    f.click(f.link);f.edit('');f.key(f.link,'Enter');assert.equal(f.writes.length,2);assert.equal(f.writes[1].value,'');
    assert.equal(f.link.textContent,'a');assert.equal(f.file.path,'Ideas/a.md');
  } finally {f.close();}
});

test('failed native saves report failure without retaining a false successful label',async()=>{
  const f=fixture();try {
    f.view.updateProperty=()=>Promise.reject(new Error('read-only file'));
    f.titles.refresh(f.view);f.click(f.link);f.edit('失败');f.key(f.link,'Enter');await new Promise(resolve=>f.win.setTimeout(resolve,0));
    assert.equal(f.notices.length,1);assert.equal(f.link.textContent,'原来的想法');assert.equal(f.link.hasAttribute('contenteditable'),false);
  } finally {f.close();}
});
