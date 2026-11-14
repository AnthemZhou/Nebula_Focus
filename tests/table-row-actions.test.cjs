const {test} = require('node:test');
const assert = require('node:assert/strict');
const {buildSync} = require('esbuild');
const {JSDOM} = require('jsdom');
const code = buildSync({entryPoints:['src/table-row-actions.ts'],bundle:true,write:false,platform:'node',format:'cjs',external:['obsidian']}).outputFiles[0].text;
function fixture(t) {
  const dom = new JSDOM('<body><div class="bases-td"><div class="bases-table-cell">Title</div></div></body>');
  t.after(()=>dom.window.close());
  const doc=dom.window.document, cell=doc.querySelector('.bases-td'), menus=[], removed=[], notices=[];
  dom.window.HTMLElement.prototype.createEl=function(tag){const el=doc.createElement(tag);this.append(el);return el;};
  dom.window.HTMLElement.prototype.createSpan=function(){return this.createEl('span');};
  let editable=true;
  const file={path:'A.md',extension:'md'}, view={type:'table',config:{name:'Any table'},rows:[{entry:{file},cells:[{el:cell,prop:'file.name',renderer:{el:cell.firstElementChild}}]}]};
  class Menu {constructor(){this.items=[];menus.push(this);}addItem(fn){const item={setTitle(v){this.title=v;return this;},setIcon(){return this;},setWarning(){return this;},onClick(fn){this.click=fn;return this;}};fn(item);this.items.push(item);}showAtPosition(){}}
  const mod={exports:{}};
  new Function('module','exports','require',code)(mod,mod.exports,()=>({Menu,Notice:class{constructor(m){notices.push(m);}},setIcon(){}}));
  const actions=new mod.exports.TableRowActions({canRemove:()=>editable,remove:async(v,f)=>removed.push(f)});
  t.after(()=>actions.clear());
  const click=el=>el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,cancelable:true}));
  return {dom,doc,cell,file,view,actions,menus,removed,notices,click,lock:()=>editable=false};
}

test('one explicit action per row; opening the menu is not deletion and cleanup restores the cell',async t=>{
  const f=fixture(t);f.actions.refresh(f.view);f.actions.refresh(f.view);
  assert.equal(f.cell.querySelectorAll('button').length,1);
  f.click(f.cell.querySelector('button'));assert.equal(f.menus.length,1);assert.equal(f.removed.length,0);
  assert.equal(f.menus[0].items[0].title,'将页面移到回收站');
  f.menus[0].items[0].click();await Promise.resolve();assert.deepEqual(f.removed,[f.file]);
  f.actions.clear();assert.equal(f.cell.querySelector('button'),null);assert.equal(f.cell.className,'bases-td');
  assert.equal(f.cell.textContent,'Title');
});

test('stale menus cannot delete a recycled row, replaced file, or newly readonly view',t=>{
  for(const mode of ['recycled','renamed','readonly','unloaded']) {
    const f=fixture(t);f.actions.refresh(f.view);f.click(f.cell.querySelector('button'));
    if(mode==='recycled') {f.view.rows[0].entry.file={path:'B.md',extension:'md'};f.actions.refresh(f.view);}
    if(mode==='renamed') f.file.path='B.md';
    if(mode==='readonly') f.lock();
    if(mode==='unloaded') f.view._loaded=false;
    f.menus[0].items[0].click();assert.equal(f.removed.length,0,mode);
  }
});

test('touch scrolling across an action never opens the menu or selects the record',t=>{
  const f=fixture(t);f.actions.refresh(f.view);const button=f.cell.querySelector('button');let selected=0;
  f.cell.addEventListener('pointerdown',()=>selected++);
  const pointer=(type,x)=>{const e=new f.dom.window.Event(type,{bubbles:true});Object.assign(e,{pointerType:'touch',pointerId:1,clientX:x,clientY:0});button.dispatchEvent(e);};
  pointer('pointerdown',0);pointer('pointermove',35);pointer('pointerup',35);f.click(button);
  assert.equal(selected,0);assert.equal(f.menus.length,0);
  pointer('pointerdown',0);pointer('pointerup',0);f.click(button);assert.equal(f.menus.length,1);
});


test('native page context menus add recoverable deletion only for their originating row', async t=>{
  const f=fixture(t);f.actions.refresh(f.view);
  const menu={items:[],addItem(fn){const item={setTitle(v){this.title=v;return this;},setIcon(){return this;},setWarning(){return this;},onClick(fn){this.click=fn;return this;}};fn(item);this.items.push(item);}};
  assert.equal(f.actions.addToFileMenu(menu,f.file),false);
  f.cell.addEventListener('contextmenu',()=>{
    assert.equal(f.actions.addToFileMenu(menu,{path:'Other.md',extension:'md'}),false);
    assert.equal(f.actions.addToFileMenu(menu,f.file),true);
  });
  f.cell.dispatchEvent(new f.dom.window.MouseEvent('contextmenu',{bubbles:true}));
  assert.equal(menu.items.length,1);assert.equal(f.removed.length,0);
  await Promise.resolve();
  assert.equal(f.actions.addToFileMenu(menu,f.file),false);
  menu.items[0].click();await Promise.resolve();assert.deepEqual(f.removed,[f.file]);
});

test('an ancestor capture file-menu receives row deletion before cell handlers run and expires after dispatch',async t=>{
  const f=fixture(t);
  const menu={items:[],addItem(fn){const item={setTitle(v){this.title=v;return this;},setIcon(){return this;},setWarning(){return this;},onClick(fn){this.click=fn;return this;}};fn(item);this.items.push(item);}};
  let additions=0;
  // Register the host first. Its capture callback runs before the cell's own
  // capture listener, as native Bases does when it emits workspace:file-menu.
  f.doc.addEventListener('contextmenu',()=>{
    menu.items.push({title:'原生打开'});
    if(f.actions.addToFileMenu(menu,f.file))additions++;
  },true);
  f.actions.refresh(f.view);
  f.cell.firstElementChild.dispatchEvent(new f.dom.window.MouseEvent('contextmenu',{bubbles:true}));
  assert.equal(additions,1);
  assert.deepEqual(menu.items.map(item=>item.title),['原生打开','将页面移到回收站']);
  f.doc.body.dispatchEvent(new f.dom.window.MouseEvent('contextmenu',{bubbles:true}));
  assert.equal(additions,1,'another surface cannot borrow the pending row association');
  f.cell.firstElementChild.dispatchEvent(new f.dom.window.MouseEvent('contextmenu',{bubbles:true}));
  assert.equal(additions,2);
  await Promise.resolve();
  assert.equal(f.actions.addToFileMenu(menu,f.file),false);
  menu.items[1].click();await Promise.resolve();assert.deepEqual(f.removed,[f.file]);
  f.actions.clear();
  f.cell.firstElementChild.dispatchEvent(new f.dom.window.MouseEvent('contextmenu',{bubbles:true}));
  assert.equal(additions,2);
});

test('trusted-input microtask checkpoints preserve only the actively dispatching context event',async t=>{
  const f=fixture(t),nativeAdd=f.dom.window.addEventListener.bind(f.dom.window);
  let capture;
  f.dom.window.addEventListener=(type,listener,options)=>{
    if(type==='contextmenu'&&options===true)capture=listener;
    nativeAdd(type,listener,options);
  };
  f.actions.refresh(f.view);
  const event=new f.dom.window.MouseEvent('contextmenu',{bubbles:true});
  let phase=1;
  Object.defineProperty(event,'eventPhase',{get:()=>phase});
  Object.defineProperty(event,'composedPath',{value:()=>[f.cell.firstElementChild,f.cell,f.doc.body,f.doc,f.dom.window]});
  // Chromium may checkpoint after the Window capture listener while this same
  // trusted event is still on its way to the table's native file-menu handler.
  capture(event);
  await Promise.resolve();
  const menu={items:[],addItem(fn){const item={setTitle(v){this.title=v;return this;},setIcon(){return this;},setWarning(){return this;},onClick(fn){this.click=fn;return this;}};fn(item);this.items.push(item);}};
  phase=3;
  assert.equal(f.actions.addToFileMenu(menu,f.file),true);
  assert.equal(menu.items.length,1);
  // End of dispatch must close the association immediately, before timers or
  // another microtask, so unrelated file menus cannot inherit row deletion.
  phase=0;
  assert.equal(f.actions.addToFileMenu(menu,f.file),false);
  assert.equal(menu.items.length,1);
});
