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
