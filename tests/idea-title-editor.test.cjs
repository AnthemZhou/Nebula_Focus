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

test('plain title clicks edit the original link at the clicked caret; only native updateProperty commits and remains undoable',()=>{
  const f=fixture();try {
    const original=f.link.firstChild;
    f.doc.caretRangeFromPoint=()=>{const range=f.doc.createRange();range.setStart(original,2);return range;};
    f.titles.refresh(f.view);f.titles.refresh(f.view);
    assert.equal(f.cell.querySelectorAll('button').length,1);assert.deepEqual(f.writes,[]);
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

test('renderer whitespace and outer cell padding start the same frameless editor at the end before native click handlers consume them',()=>{
  const f=fixture();try {
    let nativeClicks=0;
    f.cell.addEventListener('click',event=>{nativeClicks++;event.stopImmediatePropagation();},true);
    f.doc.caretRangeFromPoint=()=>{throw new Error('Whitespace must place the caret at the end without a coordinate lookup');};
    f.titles.refresh(f.view);
    for (const target of [f.cell,f.cell.parentElement]) {
      f.click(target,{clientX:280,clientY:12});
      assert.equal(f.link.getAttribute('contenteditable'),'plaintext-only');assert.equal(f.doc.activeElement,f.link);
      assert.equal(f.doc.querySelector('input'),null);assert.equal(f.doc.querySelector('[role="dialog"]'),null);
      const expected=f.doc.createRange();expected.selectNodeContents(f.link);expected.collapse(false);
      const actual=f.doc.getSelection().getRangeAt(0);
      assert.equal(actual.collapsed,true);assert.equal(actual.compareBoundaryPoints(0,expected),0);
      f.key(f.link,'Escape');
    }
    assert.equal(nativeClicks,0);assert.deepEqual(f.opens,[]);assert.deepEqual(f.writes,[]);
    f.titles.clear();f.click(f.cell);assert.equal(nativeClicks,1);assert.equal(f.link.hasAttribute('contenteditable'),false);
  } finally {f.close();}
});

test('blank padding preserves modifier selection, entire drag gestures, cancelled gestures and read-only cells',()=>{
  const f=fixture();try {
    f.titles.refresh(f.view);
    const outer=f.cell.parentElement;
    for (const modifiers of [{metaKey:true},{ctrlKey:true},{altKey:true},{shiftKey:true},{button:2}]) {
      assert.equal(f.click(outer,modifiers),true);assert.equal(f.link.hasAttribute('contenteditable'),false);
    }
    // Moving away and back still counts as a drag, even when the final click
    // has the same position as pointerdown.
    outer.dispatchEvent(new f.win.MouseEvent('pointerdown',{bubbles:true,button:0,clientX:200,clientY:12}));
    f.win.dispatchEvent(new f.win.MouseEvent('pointermove',{clientX:240,clientY:12}));
    f.win.dispatchEvent(new f.win.MouseEvent('pointerup',{button:0,clientX:200,clientY:12}));
    f.click(outer,{clientX:200,clientY:12});assert.equal(f.link.hasAttribute('contenteditable'),false);
    outer.dispatchEvent(new f.win.MouseEvent('pointerdown',{bubbles:true,button:0,clientX:200,clientY:12}));
    f.win.dispatchEvent(new f.win.MouseEvent('pointercancel',{clientX:200,clientY:12}));
    f.click(outer,{clientX:200,clientY:12});assert.equal(f.link.hasAttribute('contenteditable'),false);
    f.view.selection={top:0,bottom:2};f.click(outer);assert.equal(f.link.hasAttribute('contenteditable'),false);
    f.view.selection=null;f.view.isReadOnly=true;f.click(outer);assert.equal(f.link.hasAttribute('contenteditable'),false);
    assert.deepEqual(f.writes,[]);assert.deepEqual(f.opens,[]);
  } finally {f.close();}
});

test('empty space inside a block-width title link goes to the end while actual text still uses the click location',()=>{
  const f=fixture();try {
    f.win.Range.prototype.getClientRects=()=>[
      {left:20,right:220,top:10,bottom:30,width:200,height:20},
      {left:20,right:120,top:30,bottom:50,width:100,height:20},
    ];
    let hitTests=0;
    f.doc.caretRangeFromPoint=()=>{hitTests++;const range=f.doc.createRange();range.setStart(f.link.firstChild,2);return range;};
    f.titles.refresh(f.view);
    f.click(f.link,{clientX:280,clientY:12});
    const end=f.doc.createRange();end.selectNodeContents(f.link);end.collapse(false);
    assert.equal(f.doc.getSelection().getRangeAt(0).compareBoundaryPoints(0,end),0);assert.equal(hitTests,0);
    f.key(f.link,'Escape');
    f.click(f.link,{clientX:80,clientY:40});assert.equal(f.doc.getSelection().anchorOffset,2);assert.equal(hitTests,1);
    assert.deepEqual(f.writes,[]);assert.deepEqual(f.opens,[]);
  } finally {f.close();}
});

test('clicking blank space while editing moves the caret without blur-saving, and does not disturb IME composition',()=>{
  const f=fixture();try {
    f.titles.refresh(f.view);f.click(f.link);f.edit('正在编辑的想法');
    const atStart=f.doc.createRange();atStart.setStart(f.link.firstChild,1);atStart.collapse(true);
    f.doc.getSelection().removeAllRanges();f.doc.getSelection().addRange(atStart);
    const down=new f.win.MouseEvent('mousedown',{bubbles:true,cancelable:true,button:0});f.cell.dispatchEvent(down);
    assert.equal(down.defaultPrevented,true);f.click(f.cell);
    assert.equal(f.doc.activeElement,f.link);assert.equal(f.link.textContent,'正在编辑的想法');assert.deepEqual(f.writes,[]);
    const end=f.doc.createRange();end.selectNodeContents(f.link);end.collapse(false);
    assert.equal(f.doc.getSelection().getRangeAt(0).compareBoundaryPoints(0,end),0);
    f.doc.getSelection().removeAllRanges();f.doc.getSelection().addRange(atStart);
    f.link.dispatchEvent(new f.win.CompositionEvent('compositionstart'));
    f.click(f.cell.parentElement);
    assert.equal(f.doc.getSelection().anchorOffset,1);assert.equal(f.doc.activeElement,f.link);assert.deepEqual(f.writes,[]);
    f.link.dispatchEvent(new f.win.CompositionEvent('compositionend'));f.key(f.link,'Escape');
    assert.equal(f.link.textContent,'原来的想法');assert.deepEqual(f.writes,[]);assert.deepEqual(f.opens,[]);
  } finally {f.close();}
});

test('the sole page icon and modified link clicks delegate navigation, while native context menus and hover remain attached',()=>{
  const f=fixture();try {
    f.titles.refresh(f.view);
    const icon=f.cell.querySelector('.bui-idea-page-button');
    assert.equal(f.cell.querySelector('.bui-idea-open-button'),null);
    assert.equal(f.cell.lastElementChild,f.link);
    assert.equal(f.cell.querySelectorAll('button').length,1);
    assert.equal(icon.tagName,'BUTTON');assert.equal(icon.type,'button');assert.equal(icon.getAttribute('aria-label'),'打开笔记');
    icon.focus();assert.equal(f.doc.activeElement,icon);
    // A native button's Enter/Space activation dispatches a click; preserve its zero-detail navigation.
    f.click(icon,{detail:0});f.click(icon,{metaKey:true});f.click(f.link,{metaKey:true});
    icon.dispatchEvent(new f.win.MouseEvent('auxclick',{bubbles:true,cancelable:true,button:1}));
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
    f.click(f.link);f.key(f.link,'Enter');f.click(f.cell);f.click(f.cell.parentElement);
    assert.equal(f.link.hasAttribute('contenteditable'),false);assert.deepEqual(f.writes,[]);
    assert.equal(f.link.textContent,'原来的想法');assert.deepEqual(f.opens,[]);
    f.click(f.cell.querySelector('.bui-idea-page-button'));
    f.click(f.cell.querySelector('.bui-idea-page-button'),{metaKey:true});
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
    assert.deepEqual(f.writes,[]);assert.equal(f.cell.querySelectorAll('button').length,1);
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

function filename(f) {
  f.view.config.name='发布记录';f.view.config.getOrder=()=>['file.name'];
  f.row.cells[0].prop='file.name';f.cell.parentElement.dataset.property='file.name';f.link.textContent='a';
}

test('plain publishing and grouped native file-name tables get one page icon and use the rename adapter rather than frontmatter',()=>{
  const renames=[];
  const f=fixture({rename(view,file,basename){renames.push({view,file,basename});}});try{
    filename(f);f.titles.refresh(f.view);f.titles.refresh(f.view);
    assert.equal(f.cell.querySelectorAll('.bui-idea-page-button').length,1);
    f.click(f.link);assert.equal(f.link.getAttribute('contenteditable'),'plaintext-only');assert.deepEqual(f.opens,[]);
    f.edit('新的发布标题');f.key(f.link,'Enter');
    assert.deepEqual(renames,[{view:f.view,file:f.file,basename:'新的发布标题'}]);assert.deepEqual(f.writes,[]);
    assert.equal(f.raw['file.name'],undefined);assert.equal(f.raw[''],undefined);
    f.click(f.cell.querySelector('.bui-idea-page-button'));assert.equal(f.opens.length,1);
    f.view.config.name='按平台分组';f.titles.refresh(f.view);f.click(f.cell);
    assert.equal(f.link.getAttribute('contenteditable'),'plaintext-only');f.key(f.link,'Escape');
    assert.equal(renames.length,1);assert.equal(f.view.config.nebulaTable,undefined);
  }finally{f.close();}
});

test('file-name drafts discard on Escape or stale file changes; failed renames restore the display',async()=>{
  const renames=[];
  const f=fixture({rename(view,file,basename){renames.push(basename);return Promise.reject(Error('duplicate filename'));}});try{
    filename(f);f.titles.refresh(f.view);f.click(f.link);f.edit('不保存');f.key(f.link,'Escape');assert.deepEqual(renames,[]);
    f.click(f.link);f.edit('撞名');f.key(f.link,'Enter');await new Promise(resolve=>f.win.setTimeout(resolve,0));
    assert.equal(f.link.textContent,'a');assert.equal(f.notices.length,1);assert.deepEqual(f.writes,[]);
    f.click(f.link);f.edit('过期');f.file.path='Ideas/renamed.md';f.key(f.link,'Enter');
    assert.deepEqual(renames,['撞名']);
  }finally{f.close();}
});

test('plain current-record title formulas edit their declared source and reject related or scalar-derived links',()=>{
  const f=fixture();try{
    f.view.config.name='其他数据库';f.view.config.getOrder=()=>['formula.想法'];
    f.view.config.query.formulas={想法:{text:'link(file.path, note["这里写想法"])'}};
    f.titles.refresh(f.view);assert.ok(f.cell.querySelector('.bui-idea-page-button'));
    f.click(f.link);f.edit('公式标题');f.key(f.link,'Enter');assert.equal(f.writes[0].key,'这里写想法');
    f.link.dataset.href='Projects/other.md';f.titles.refresh(f.view);
    assert.equal(f.cell.querySelector('.bui-idea-page-button'),null);f.click(f.link);assert.equal(f.opens.length,1);
    f.link.dataset.href=f.file.path;f.view.config.query.formulas.想法.text='link(file.path, note["这里写想法"] + "!")';
    f.titles.refresh(f.view);assert.equal(f.cell.querySelector('.bui-idea-page-button'),null);
    f.view.config.query.formulas.想法.text='link(file.path, note["这里写想法"])';f.raw['这里写想法']=['非标量'];
    f.titles.refresh(f.view);f.click(f.link);assert.equal(f.link.hasAttribute('contenteditable'),false);assert.equal(f.writes.length,1);
  }finally{f.close();}
});

test('explicit native note-title editors retain native input saving and use only the page icon for opening',()=>{
  const opened=[];
  const f=fixture({rename(){throw Error('Not a filename');},open(view,file,event){opened.push({view,file,meta:event.metaKey});}});try{
    f.view.config.name='属性标题';f.view.config.titleProperty='这里写想法';f.view.config.getOrder=()=>['note.这里写想法'];
    f.row.cells[0].prop='note.这里写想法';f.row.cells[0].renderer.propertyEditor={};
    f.cell.parentElement.dataset.property='note.这里写想法';f.link.remove();
    const native=f.doc.createElement('div');native.className='metadata-input-longtext';native.setAttribute('contenteditable','true');native.textContent='原生标题';native.tabIndex=0;f.cell.append(native);
    let inputs=0;native.addEventListener('input',()=>inputs++);
    f.titles.refresh(f.view);assert.ok(f.cell.querySelector('.bui-idea-page-button'));
    f.click(native);native.textContent='原生编辑';native.dispatchEvent(new f.win.InputEvent('input',{bubbles:true}));
    assert.equal(inputs,1);assert.equal(native.getAttribute('contenteditable'),'true');assert.deepEqual(f.writes,[]);
    f.click(f.cell.querySelector('.bui-idea-page-button'),{metaKey:true});
    assert.deepEqual(opened,[{view:f.view,file:f.file,meta:true}]);
    f.click(f.cell);assert.equal(f.doc.activeElement,native);
    f.titles.clear();assert.equal(native.getAttribute('contenteditable'),'true');assert.equal(native.textContent,'原生编辑');
    assert.equal(f.cell.querySelector('.bui-idea-page-button'),null);
  }finally{f.close();}
});

function finance(f) {
  const profile={titleColumn:'formula.Nebula流水',titleProperty:'流水摘要',tags:{收支类型:'single'},wrap:true,attachments:[]};
  f.view.config.name='收支流水';f.view.config.nebulaTable=profile;
  f.row.cells[0].prop=profile.titleColumn;
  f.cell.parentElement.dataset.property=profile.titleColumn;
  f.raw['流水摘要']='原来的想法';delete f.raw['这里写想法'];
  return profile;
}

test('opted-in financial tables edit the mapped source property and keep icon navigation and native undo',()=>{
  const f=fixture();try {
    finance(f);f.titles.refresh(f.view);
    f.click(f.link);assert.equal(f.link.getAttribute('contenteditable'),'plaintext-only');assert.deepEqual(f.opens,[]);
    f.edit('新的流水摘要');f.key(f.link,'Enter');
    assert.deepEqual(f.writes,[{file:f.file,key:'流水摘要',value:'新的流水摘要'}]);
    assert.equal(f.raw['这里写想法'],undefined);
    f.key(f.link,'z',{ctrlKey:true});assert.equal(f.raw['流水摘要'],'原来的想法');
    f.click(f.cell.querySelector('.bui-idea-page-button'));assert.equal(f.opens.length,1);
    f.click(f.cell.parentElement);assert.equal(f.link.getAttribute('contenteditable'),'plaintext-only');
    const expected=f.doc.createRange();expected.selectNodeContents(f.link);expected.collapse(false);
    assert.equal(f.doc.getSelection().getRangeAt(0).compareBoundaryPoints(0,expected),0);
  } finally {f.close();}
});

test('profile changes, concurrent mapped-property changes and readOnly flags cannot commit stale financial edits',()=>{
  const f=fixture();try {
    const profile=finance(f);f.titles.refresh(f.view);f.click(f.link);f.edit('不可写入');
    f.raw['流水摘要']='另一窗口修改';f.link.blur();assert.deepEqual(f.writes,[]);
    f.click(f.link);f.edit('不可写入其他字段');profile.titleProperty='项目名称';f.key(f.link,'Enter');
    assert.deepEqual(f.writes,[]);assert.equal(f.link.hasAttribute('contenteditable'),false);
    profile.titleProperty='流水摘要';f.titles.refresh(f.view);f.view.readOnly=true;f.click(f.link);
    assert.equal(f.link.hasAttribute('contenteditable'),false);f.view.readOnly=false;
    f.click(f.link);f.edit('不可写入卸载视图');f.view.queryController={view:{}};f.link.blur();assert.deepEqual(f.writes,[]);
    delete f.view.queryController;f.titles.refresh(f.view);f.click(f.link);f.edit('失去授权');
    delete f.view.config.nebulaTable;f.titles.refresh(f.view);
    assert.deepEqual(f.writes,[]);assert.equal(f.cell.querySelector('button'),null);
    f.click(f.link);assert.equal(f.opens.length,1);
  } finally {f.close();}
});
