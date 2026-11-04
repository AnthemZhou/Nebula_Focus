const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {transformSync} = require('esbuild');
const {JSDOM} = require('jsdom');
const loadGeometryStyles = require('./load-geometry-styles.cjs');

function fixture(manage) {
  const dom = new JSDOM('<!doctype html><body><div class="bases-thead"></div></body>');
  const win = dom.window, doc = win.document;
  loadGeometryStyles(doc);
  const writes = [], notices = [];
  const loaded = new Map();
  function load(name) {
    if (loaded.has(name)) return loaded.get(name);
    const mod = {exports:{}};
    new vm.Script(transformSync(fs.readFileSync(`src/${name}.ts`,'utf8'), {loader:'ts',format:'cjs'}).code)
      .runInContext(vm.createContext({module:mod,exports:mod.exports,HTMLElement:win.HTMLElement,Element:win.Element,
        require:dependency => dependency === 'obsidian' ? {setIcon(el, icon){el.dataset.icon=icon;}} : load(dependency.slice(2))}));
    loaded.set(name, mod.exports);return mod.exports;
  }
  const mod = {exports:load('idea-header')};
  const head = doc.querySelector('.bases-thead');
  const cells = new Map(), props = new Map();
  for (const [prop,label] of [['formula.想法','这里写想法'],['note.领域','领域']]) {
    const el = head.appendChild(doc.createElement('div'));el.className = 'bases-td';el.draggable=true;
    const nameEl = el.appendChild(doc.createElement('span'));nameEl.className = 'bases-table-header-name';nameEl.textContent = label;
    const resize = el.appendChild(doc.createElement('span'));resize.className = 'bases-table-header-resizer';resize.draggable=true;
    cells.set(el, {prop,el,nameEl,resize});
    let displayName = label;
    props.set(prop, {getDisplayName:()=>displayName,setDisplayName:value=>{writes.push({prop,value});displayName=value;}});
  }
  const view = {_loaded:true,type:'table',theadEl:head,
    config:{name:'想法收集箱',query:{saveFn(){}},getPropertyConfig:prop=>props.get(prop),getOrder:()=>[...props.keys()]},
    getCellFromDom:el=>cells.get(el.closest('.bases-td'))};
  let sorts = 0;
  head.addEventListener('click', event => {if (!event.defaultPrevented && event.button === 0 && !event.target.closest('.bases-table-header-resizer')) sorts++;});
  const headers = new mod.exports.IdeaHeaders({}, manage);
  const cell = prop => [...cells.values()].find(cell=>cell.prop===prop);
  const click = (el,options={})=>el.dispatchEvent(new win.MouseEvent('click',{bubbles:true,cancelable:true,...options}));
  const key = (el,key,options={})=>el.dispatchEvent(new win.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...options}));
  const edit = (el,text)=>{el.value=text;el.dispatchEvent(new win.InputEvent('input',{bubbles:true,inputType:'insertText'}));};
  return {win,doc,view,head,headers,cell,click,key,edit,writes,notices,get sorts(){return sorts;},close:()=>dom.window.close()};
}

const input = f => f.doc.querySelector('.bui-header-editor input');
const panel = f => f.doc.querySelector('.bui-header-editor');
const tick = async () => {await Promise.resolve();await Promise.resolve();};

test('classification columns delegate to tag manager while title text and blank header area open the same anchored rename style',()=>{
  const calls=[];
  const f=fixture((view,prop,anchor)=>{calls.push({view,prop,anchor});return prop==='note.领域';});
  try {
    f.headers.attach(f.view); const domain=f.cell('note.领域');
    f.click(domain.el);assert.equal(calls.at(-1).anchor,domain.el);assert.equal(panel(f),null);
    f.click(domain.nameEl);f.key(domain.nameEl,'Enter');f.key(domain.el,' ');assert.equal(calls.length,4);
    f.click(domain.resize);assert.equal(calls.length,4);
    f.click(f.cell('formula.想法').nameEl);
    assert.equal(panel(f).classList.contains('bui-tag-manager'),true);
    assert.equal(panel(f).getAttribute('role'),'dialog');assert.equal(f.win.getComputedStyle(panel(f)).position,'fixed');
    assert.equal(input(f).value,'这里写想法');assert.ok(panel(f).querySelector('[data-icon="check"]'));
    assert.ok(panel(f).querySelector('[data-icon="x"]'));
    assert.equal(f.cell('formula.想法').nameEl.hasAttribute('contenteditable'),false);
    f.key(input(f),'Escape');f.click(f.cell('formula.想法').el);assert.ok(panel(f));assert.equal(f.sorts,0);
  } finally {f.headers.clear();f.close();}
});

test('Enter or check saves only the display-name configuration; header DOM and native property key stay intact',async()=>{
  const f=fixture();
  try {
    f.headers.attach(f.view);f.headers.attach(f.view);const label=f.cell('formula.想法').nameEl;
    f.click(label);assert.equal(f.doc.activeElement,input(f));assert.equal(f.sorts,0);
    f.edit(input(f),'我的想法');f.headers.attach(f.view);assert.equal(input(f).value,'我的想法');
    assert.equal(label.textContent,'这里写想法');assert.deepEqual(f.writes,[]);
    f.key(input(f),'Enter');await tick();
    assert.deepEqual(f.writes,[{prop:'formula.想法',value:'我的想法'}]);assert.equal(panel(f),null);
    assert.equal(label.textContent,'我的想法');assert.equal(f.doc.activeElement,label);
    assert.equal(label.hasAttribute('contenteditable'),false);assert.equal(label.getAttribute('style'),null);
    f.click(f.cell('note.领域').nameEl);f.edit(input(f),'创作领域');
    f.click(panel(f).querySelector('.bui-tag-manager-save-name'));await tick();
    assert.deepEqual(f.writes,[{prop:'formula.想法',value:'我的想法'},{prop:'note.领域',value:'创作领域'}]);
    assert.equal(f.sorts,0);
  } finally {f.headers.clear();f.close();}
});

test('Escape, close and outside click cancel drafts; an empty label keeps its validation in the panel',async()=>{
  const f=fixture();
  try {
    f.headers.attach(f.view);const label=f.cell('formula.想法').nameEl;
    f.key(label,'Enter');f.edit(input(f),'discard');f.key(input(f),'Escape');assert.equal(panel(f),null);
    f.click(label);f.edit(input(f),' ');f.key(input(f),'Enter');await tick();
    assert.equal(input(f).getAttribute('aria-invalid'),'true');assert.equal(panel(f).querySelector('[role="status"]').hidden,false);
    f.edit(input(f),'another');f.click(panel(f).querySelector('.bui-tag-manager-close'));assert.equal(panel(f),null);
    f.click(label);f.edit(input(f),'outside');f.doc.body.dispatchEvent(new f.win.MouseEvent('mousedown',{bubbles:true}));
    assert.equal(panel(f),null);assert.equal(label.textContent,'这里写想法');assert.deepEqual(f.writes,[]);
  } finally {f.headers.clear();f.close();}
});

test('Chinese IME candidate Enter and immediate composition-end Enter never commit prematurely',async()=>{
  const f=fixture();
  try {
    f.headers.attach(f.view);f.click(f.cell('formula.想法').nameEl);const field=input(f);
    field.dispatchEvent(new f.win.CompositionEvent('compositionstart'));f.edit(field,'xiang');
    f.key(field,'Enter',{isComposing:true});f.key(field,'Enter',{keyCode:229});
    f.click(panel(f).querySelector('.bui-tag-manager-save-name'));await tick();assert.deepEqual(f.writes,[]);
    field.dispatchEvent(new f.win.CompositionEvent('compositionend'));f.edit(field,'想法');f.key(field,'Enter');
    await tick();assert.deepEqual(f.writes,[]);assert.ok(panel(f));
    await new Promise(resolve=>f.win.setTimeout(resolve,1));f.key(field,'Enter');await tick();
    assert.deepEqual(f.writes,[{prop:'formula.想法',value:'想法'}]);assert.equal(panel(f),null);
  } finally {f.headers.clear();f.close();}
});

test('native resize, drag and right-click survive; clear restores attributes and releases popup and viewport listeners',()=>{
  const f=fixture();
  try {
    const cell=f.cell('formula.想法');cell.nameEl.title='original';cell.nameEl.setAttribute('aria-label','tooltip');
    cell.nameEl.style.setProperty('position','static','important');f.headers.attach(f.view);
    assert.equal(cell.nameEl.hasAttribute('title'),false);assert.equal(cell.nameEl.hasAttribute('aria-label'),false);
    let native=0;
    for(const type of ['pointerdown','dragstart','contextmenu']) {
      f.head.addEventListener(type,()=>native++);
      (type==='pointerdown'?cell.resize:cell.nameEl).dispatchEvent(new f.win.Event(type,{bubbles:true,cancelable:true}));
    }
    assert.equal(native,3);f.click(cell.resize);f.click(cell.nameEl,{button:2});assert.equal(panel(f),null);
    f.click(cell.nameEl);f.edit(input(f),'discard');assert.equal(cell.el.draggable,true);assert.equal(cell.resize.draggable,true);
    f.headers.clear();assert.equal(panel(f),null);assert.deepEqual(f.writes,[]);
    assert.equal(cell.nameEl.title,'original');assert.equal(cell.nameEl.getAttribute('aria-label'),'tooltip');
    assert.equal(cell.nameEl.hasAttribute('tabindex'),false);assert.equal(cell.nameEl.hasAttribute('role'),false);
    assert.equal(cell.nameEl.style.position,'static');assert.equal(cell.nameEl.style.getPropertyPriority('position'),'important');
    assert.equal(cell.nameEl.textContent,'这里写想法');const before=f.sorts;f.click(cell.nameEl);assert.equal(f.sorts,before+1);
    f.win.dispatchEvent(new f.win.Event('resize'));assert.equal(panel(f),null);
  } finally {f.headers.clear();f.close();}
});

test('stale query, readonly, rerendered, removed property and unloaded view discard drafts without writes',async()=>{
  const f=fixture();
  try {
    f.headers.attach(f.view);const label=f.cell('formula.想法').nameEl;
    const open=()=>{f.click(label);f.edit(input(f),'stale');};
    open();f.view.config.query={saveFn(){}};f.key(input(f),'Enter');await tick();assert.equal(panel(f),null);
    open();f.view.isReadOnly=true;f.key(input(f),'Enter');await tick();assert.equal(panel(f),null);
    f.view.isReadOnly=false;open();label.textContent='Native refresh';f.headers.attach(f.view);assert.equal(panel(f),null);
    open();f.view.config.getOrder=()=>['note.领域'];f.headers.prune();assert.equal(panel(f),null);
    f.view.config.getOrder=()=>['formula.想法','note.领域'];open();f.view._loaded=false;f.headers.prune();assert.equal(panel(f),null);
    assert.deepEqual(f.writes,[]);assert.equal(label.hasAttribute('role'),false);
  } finally {f.headers.clear();f.close();}
});

test('phone opens a keyboard-safe anchored panel; keyboard activation focuses the rename field',()=>{
  const f=fixture();
  try {
    f.doc.body.classList.add('is-mobile');f.headers.attach(f.view);const label=f.cell('formula.想法').nameEl;
    f.click(label);assert.equal(f.doc.activeElement,panel(f));f.click(panel(f).querySelector('.bui-tag-manager-close'));
    f.key(label,'Enter');assert.equal(f.doc.activeElement,input(f));
    Object.defineProperty(f.win,'visualViewport',{value:{offsetLeft:0,offsetTop:0,width:260,height:300,addEventListener(){},removeEventListener(){}}});
    f.win.dispatchEvent(new f.win.Event('resize'));assert.equal(panel(f).style.width,'244px');
    assert.equal(panel(f).style.maxHeight,'284px');
  } finally {f.headers.clear();f.close();}
});

test('failed save remains retryable and duplicate save clicks are serialized',async()=>{
  const f=fixture();
  try {
    let reject;const config=f.view.config.getPropertyConfig('formula.想法');const original=config.setDisplayName;
    let attempts=0;config.setDisplayName=()=>{attempts++;return new Promise((_,fail)=>{reject=fail;});};
    f.headers.attach(f.view);f.click(f.cell('formula.想法').nameEl);f.edit(input(f),'重试名称');
    const save=panel(f).querySelector('.bui-tag-manager-save-name');f.click(save);f.click(save);assert.equal(attempts,1);
    reject(Error('disk'));await tick();assert.ok(panel(f));assert.match(panel(f).querySelector('[role="status"]').textContent,/重试/);
    config.setDisplayName=original;f.click(save);await tick();assert.equal(panel(f),null);
    assert.deepEqual(f.writes,[{prop:'formula.想法',value:'重试名称'}]);
  } finally {f.headers.clear();f.close();}
});
