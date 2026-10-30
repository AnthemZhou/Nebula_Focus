const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {transformSync} = require('esbuild');
const {JSDOM} = require('jsdom');

function fixture() {
  const dom = new JSDOM('<!doctype html><body><div class="bases-thead"></div></body>');
  const win = dom.window, doc = win.document;
  const writes = [], notices = [];
  const mod = {exports:{}};
  new vm.Script(transformSync(fs.readFileSync('src/idea-header.ts','utf8'), {loader:'ts',format:'cjs'}).code)
    .runInContext(vm.createContext({module:mod,exports:mod.exports,HTMLElement:win.HTMLElement,Element:win.Element,
      require:name => {assert.equal(name, 'obsidian');return {Notice:class {constructor(text) {notices.push(text);}}};}}));
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
  head.addEventListener('click', event => {if (!event.defaultPrevented && event.button === 0) sorts++;});
  const headers = new mod.exports.IdeaHeaders({});
  const cell = prop => [...cells.values()].find(cell=>cell.prop===prop);
  const click = (el,options={})=>el.dispatchEvent(new win.MouseEvent('click',{bubbles:true,cancelable:true,...options}));
  const key = (el,key,options={})=>el.dispatchEvent(new win.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...options}));
  const edit = (el,text)=>{el.textContent=text;el.dispatchEvent(new win.InputEvent('input',{bubbles:true,inputType:'insertText'}));};
  return {win,doc,view,head,headers,cell,click,key,edit,writes,notices,get sorts(){return sorts;},close:()=>dom.window.close()};
}

test('the native text becomes editable with a click-positioned caret, without an input, frame, tooltip or select-all',()=>{
  const f=fixture();
  try {
    const label=f.cell('formula.想法').nameEl, text=label.firstChild;
    label.title='Old title';label.setAttribute('aria-label','Old tooltip');
    f.headers.attach(f.view);
    assert.equal(label.hasAttribute('title'),false);assert.equal(label.hasAttribute('aria-label'),false);
    f.doc.caretRangeFromPoint=(x,y)=>{assert.equal(x,42);assert.equal(y,11);const range=f.doc.createRange();range.setStart(text,2);return range;};
    f.click(label,{clientX:42,clientY:11});
    assert.equal(f.doc.querySelector('input'),null);assert.equal(label.getAttribute('contenteditable'),'plaintext-only');
    assert.equal(label.firstChild,text);assert.equal(f.doc.activeElement,label);
    const selection=f.doc.getSelection();assert.equal(selection.isCollapsed,true);
    assert.equal(selection.anchorNode,text);assert.equal(selection.anchorOffset,2);
    assert.equal(label.hasAttribute('title'),false);assert.equal(label.hasAttribute('aria-label'),false);
    assert.equal(f.click(label),true);assert.equal(selection.anchorOffset,2);assert.equal(f.sorts,0);
    f.headers.clear();assert.equal(label.title,'Old title');assert.equal(label.getAttribute('aria-label'),'Old tooltip');
  } finally {f.headers.clear();f.close();}
});

test('Enter and blur save only that base display name, preserve natural typography and do not sort',()=>{
  const f = fixture();
  try {
    f.headers.attach(f.view);f.headers.attach(f.view);
    const label = f.cell('formula.想法').nameEl;
    f.click(label);
    assert.equal(f.sorts,0);assert.deepEqual(f.writes,[]);
    assert.equal(f.doc.activeElement,label);assert.equal(f.doc.querySelector('[role="dialog"]'),null);
    f.edit(label,'我的想法');f.headers.attach(f.view);assert.equal(label.getAttribute('contenteditable'),'plaintext-only');
    assert.deepEqual(f.writes,[]);f.key(label,'Enter');
    assert.deepEqual(f.writes,[{prop:'formula.想法',value:'我的想法'}]);assert.equal(f.doc.querySelector('input'),null);
    assert.equal(label.textContent,'我的想法');assert.equal(label.hasAttribute('contenteditable'),false);assert.equal(label.getAttribute('style'),null);
    f.click(f.cell('note.领域').nameEl);
    const domain=f.cell('note.领域').nameEl;assert.equal(domain.textContent,'领域');f.edit(domain,'创作领域');domain.blur();
    assert.deepEqual(f.writes,[{prop:'formula.想法',value:'我的想法'},{prop:'note.领域',value:'创作领域'}]);
    assert.equal(f.cell('note.领域').nameEl.textContent,'创作领域');
    assert.equal(f.sorts,0);
  } finally {f.headers.clear();f.close();}
});

test('Escape cancels, empty labels cannot save and keyboard entry starts with one caret',()=>{
  const f = fixture();
  try {
    const label=f.cell('formula.想法').nameEl;
    f.headers.attach(f.view);f.click(label);f.edit(label,'discarded');
    f.key(label,'Escape');assert.deepEqual(f.writes,[]);assert.equal(label.textContent,'这里写想法');
    f.key(label,'Enter');assert.equal(f.doc.getSelection().isCollapsed,true);
    f.edit(label,' ');f.key(label,'Enter');
    assert.equal(label.getAttribute('contenteditable'),'plaintext-only');assert.equal(label.getAttribute('aria-invalid'),'true');
    label.blur();assert.equal(label.hasAttribute('contenteditable'),false);assert.deepEqual(f.writes,[]);
    f.click(f.cell('formula.想法').el);assert.equal(label.hasAttribute('contenteditable'),false);assert.equal(f.sorts,0);
  } finally {f.headers.clear();f.close();}
});

test('Chinese IME Enter does not submit a candidate; composition blur waits for final text',async()=>{
  const f = fixture();
  try {
    f.headers.attach(f.view);f.click(f.cell('formula.想法').nameEl);
    let label=f.cell('formula.想法').nameEl;f.edit(label,'xiang');
    label.dispatchEvent(new f.win.CompositionEvent('compositionstart'));
    f.key(label,'Enter',{isComposing:true});f.key(label,'Enter',{keyCode:229});
    assert.deepEqual(f.writes,[]);assert.equal(label.getAttribute('contenteditable'),'plaintext-only');
    label.blur();assert.deepEqual(f.writes,[]);
    label.dispatchEvent(new f.win.CompositionEvent('compositionend'));f.edit(label,'想法');
    await Promise.resolve();
    assert.deepEqual(f.writes,[{prop:'formula.想法',value:'想法'}]);assert.equal(label.hasAttribute('contenteditable'),false);
    label=f.cell('note.领域').nameEl;f.click(label);f.edit(label,'设计领域');
    label.dispatchEvent(new f.win.CompositionEvent('compositionstart'));
    label.dispatchEvent(new f.win.CompositionEvent('compositionend'));f.key(label,'Enter');
    assert.equal(f.writes.length,1);assert.equal(label.getAttribute('contenteditable'),'plaintext-only');
    await new Promise(resolve=>f.win.setTimeout(resolve,1));f.key(label,'Enter');
    assert.deepEqual(f.writes,[{prop:'formula.想法',value:'想法'},{prop:'note.领域',value:'设计领域'}]);
  } finally {f.headers.clear();f.close();}
});

test('native resize, drag and context menus survive; clear restores attributes, styles and original click behavior',()=>{
  const f = fixture();
  try {
    const cell = f.cell('formula.想法');cell.nameEl.setAttribute('title','original');
    cell.nameEl.style.setProperty('position','static','important');
    f.headers.attach(f.view);
    let native = 0;
    for (const type of ['pointerdown','dragstart','contextmenu']) {
      f.head.addEventListener(type,()=>native++);
      const target = type==='pointerdown' ? cell.resize : cell.nameEl;
      target.dispatchEvent(new f.win.Event(type,{bubbles:true,cancelable:true}));
    }
    assert.equal(native,3);assert.equal(f.doc.querySelector('input'),null);
    f.click(cell.resize);assert.equal(f.doc.querySelector('input'),null);
    f.click(cell.nameEl,{button:2});assert.equal(f.doc.querySelector('input'),null);
    f.click(cell.nameEl);f.edit(cell.nameEl,'discarded');
    assert.equal(cell.el.draggable,false);assert.equal(cell.resize.draggable,true);
    cell.resize.dispatchEvent(new f.win.Event('dragstart',{bubbles:true,cancelable:true}));assert.equal(native,4);
    cell.nameEl.dispatchEvent(new f.win.Event('contextmenu',{bubbles:true,cancelable:true}));assert.equal(native,5);
    f.headers.clear();
    assert.equal(f.doc.querySelector('input'),null);assert.deepEqual(f.writes,[]);
    assert.equal(cell.nameEl.title,'original');assert.equal(cell.nameEl.hasAttribute('tabindex'),false);
    assert.equal(cell.nameEl.hasAttribute('role'),false);assert.equal(cell.nameEl.hasAttribute('aria-label'),false);
    assert.equal(cell.nameEl.style.position,'static');assert.equal(cell.nameEl.style.getPropertyPriority('position'),'important');
    assert.equal(cell.nameEl.style.visibility,'');assert.equal(cell.nameEl.textContent,'这里写想法');
    assert.equal(cell.el.draggable,true);assert.equal(cell.nameEl.hasAttribute('contenteditable'),false);
    assert.equal(cell.nameEl.classList.contains('bui-header-name-editing'),false);
    const before=f.sorts;f.click(cell.nameEl);assert.equal(f.sorts,before+1);assert.equal(f.doc.querySelector('input'),null);
  } finally {f.headers.clear();f.close();}
});

test('stale, read-only, rerendered or removed native headers discard drafts without base writes',()=>{
  const f = fixture();
  try {
    f.headers.attach(f.view);f.click(f.cell('formula.想法').nameEl);
    const label=f.cell('formula.想法').nameEl;
    f.edit(label,'wrong base');f.view.config.query={saveFn(){}};
    label.blur();assert.deepEqual(f.writes,[]);assert.equal(label.hasAttribute('contenteditable'),false);
    f.click(label);f.edit(label,'read only');f.view.isReadOnly=true;
    label.blur();assert.deepEqual(f.writes,[]);
    f.view.isReadOnly=false;f.click(f.cell('formula.想法').nameEl);
    f.cell('formula.想法').nameEl.textContent='Native refresh';f.headers.attach(f.view);
    assert.deepEqual(f.writes,[]);assert.equal(f.doc.querySelector('input'),null);
    assert.equal(f.cell('formula.想法').nameEl.style.visibility,'');
    f.view.isReadOnly=false;f.click(f.cell('formula.想法').nameEl);
    f.head.remove();f.headers.prune();assert.equal(f.doc.querySelector('input'),null);assert.deepEqual(f.writes,[]);
    assert.equal(f.cell('formula.想法').nameEl.hasAttribute('role'),false);
  } finally {f.headers.clear();f.close();}
});
