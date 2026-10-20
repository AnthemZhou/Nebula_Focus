const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const {buildSync}=require('esbuild');
const vm=require('node:vm');
const code=buildSync({entryPoints:['src/format-guide.ts'],bundle:true,write:false,platform:'browser',format:'cjs',external:['obsidian']}).outputFiles[0].text;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const HOLD=650;

async function boot(options={}) {
  const dom=new JSDOM('<!doctype html><body><div id="a" class="nf-writing"><div class="cm-content" contenteditable="true" tabindex="0">Original text</div></div><div id="b" class="nf-writing"><div class="cm-content" contenteditable="true" tabindex="0">Other text</div></div><input id="outside"></body>',{url:'https://fixture.invalid/',pretendToBeVisual:true});
  const win=dom.window,doc=win.document,module={exports:{}};
  const viewport={width:1200,height:900,...options.viewport},observers=[],animations=[];
  Object.defineProperty(win,'innerWidth',{value:viewport.width,configurable:true});
  Object.defineProperty(win,'innerHeight',{value:viewport.height,configurable:true});
  const setBounds=(element,{left=0,top=0,width=viewport.width,height=viewport.height}={})=>{
    element.getBoundingClientRect=()=>({x:left,y:top,left,top,width,height,right:left+width,bottom:top+height,toJSON(){return this;}});
  };
  setBounds(doc.querySelector('#a'),options.bounds);
  setBounds(doc.querySelector('#b'),{left:600,width:600});
  win.matchMedia=query=>({matches:query==='(prefers-reduced-motion: reduce)'&&!!options.reducedMotion,media:query,
    addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});
  win.ResizeObserver=class {
    constructor(callback){this.callback=callback;this.observed=new Set();this.disconnected=false;observers.push(this);}
    observe(element){this.observed.add(element);}
    unobserve(element){this.observed.delete(element);}
    disconnect(){this.disconnected=true;this.observed.clear();}
    fire(){this.callback([...this.observed].map(target=>({target,contentRect:target.getBoundingClientRect()})),this);}
  };
  if(options.animate)win.HTMLElement.prototype.animate=function(keyframes,timing){
    let resolve,reject;
    const animation=new win.EventTarget();
    Object.assign(animation,{node:this,keyframes,timing,playState:'running',onfinish:null,oncancel:null,
      finished:new Promise((done,fail)=>{resolve=done;reject=fail;}),
      finish(){this.playState='finished';resolve(this);const event=new win.Event('finish');this.dispatchEvent(event);this.onfinish?.(event);},
      cancel(){this.playState='idle';reject(new win.DOMException('Animation cancelled','AbortError'));const event=new win.Event('cancel');this.dispatchEvent(event);this.oncancel?.(event);}});
    // The browser only exposes the rejected promise when finished is read;
    // prevent this eager test promise from creating a spurious rejection.
    animation.finished.catch(()=>{});
    animations.push(animation);return animation;
  };
  // Public Obsidian DOM helpers are available in the app; keep this fixture
  // independent of its simulated Vault, plugin lifecycle and native editor.
  win.HTMLElement.prototype.createEl=function(tag,options={}){if(typeof options==='string')options={cls:options};const el=doc.createElement(tag);if(options.cls)el.className=options.cls;if(options.text!==undefined)el.textContent=options.text;for(const[key,value]of Object.entries(options.attr||{}))el.setAttribute(key,value);this.append(el);return el;};
  win.HTMLElement.prototype.createDiv=function(options){return this.createEl('div',options);};
  win.HTMLElement.prototype.createSpan=function(options){return this.createEl('span',options);};
  win.HTMLElement.prototype.setText=function(text){this.textContent=text;};
  win.HTMLElement.prototype.empty=function(){this.replaceChildren();};
  const context=vm.createContext({window:win,document:doc,HTMLElement:win.HTMLElement,Element:win.Element,Node:win.Node,
    KeyboardEvent:win.KeyboardEvent,Event:win.Event,ResizeObserver:win.ResizeObserver,console,module,exports:module.exports,
    setTimeout:win.setTimeout.bind(win),clearTimeout:win.clearTimeout.bind(win),
    requestAnimationFrame:win.requestAnimationFrame.bind(win),cancelAnimationFrame:win.cancelAnimationFrame.bind(win),
    require:name=>{assert.equal(name,'obsidian');return {setIcon(el,name){el.dataset.icon=name;}};}});
  new vm.Script(code).runInContext(context);
  let target=doc.querySelector('#a'),inputs=0;
  const editor=doc.querySelector('#a .cm-content'),other=doc.querySelector('#b .cm-content');
  for(const el of [editor,other])for(const event of ['input','beforeinput'])el.addEventListener(event,()=>inputs++);
  const initial=[editor.innerHTML,other.innerHTML];
  editor.focus();const range=doc.createRange();range.setStart(editor.firstChild,0);range.collapse(true);win.getSelection().removeAllRanges();win.getSelection().addRange(range);
  await delay(0); // Drain the browser's initial focus/selection notifications.
  const guide=new module.exports.FormatGuide({target:()=>target,text:(zh,en)=>zh});
  return {doc,win,editor,other,guide,observers,animations,setBounds,target(value){target=value;},
    panel:()=>doc.querySelector('.nf-format-guide:not([data-closing])'),
    unchanged(){assert.deepEqual([editor.innerHTML,other.innerHTML],initial);assert.equal(inputs,0,'the guide emitted an editing event');},
    close(){guide.destroy();dom.window.close();}};
}

function key(h,target,key,type='keydown',options={}) {
  const event=new h.win.KeyboardEvent(type,{key,code:key==='Shift'?'ShiftLeft':undefined,bubbles:true,cancelable:true,shiftKey:key==='Shift' && type==='keydown',...options});
  target.dispatchEvent(event);return event;
}
const press=h=>key(h,h.editor,'Shift');
const release=h=>key(h,h.editor,'Shift','keyup');

test('holding Shift shows a read-only guide after 600ms and releasing removes it without moving focus or caret',async()=>{
  const h=await boot();try{
    const event=press(h);assert.equal(event.defaultPrevented,false);assert.equal(h.panel(),null);
    await delay(540);assert.equal(h.panel(),null,'guide opened before the hold threshold');
    await delay(110);assert(h.panel());assert.equal(h.doc.activeElement,h.editor);
    assert.equal(h.win.getSelection().anchorNode,h.editor.firstChild);assert.equal(h.win.getSelection().anchorOffset,0);
    assert.match(h.panel().textContent,/#/);assert.match(h.panel().textContent,/>/);
    assert.equal(release(h).defaultPrevented,false);assert.equal(h.panel(),null);h.unchanged();
  }finally{h.close();}
});

test('a quick Shift tap or repeat event alone does not open the guide',async()=>{
  const h=await boot();try{
    press(h);release(h);await delay(HOLD);assert.equal(h.panel(),null);
    key(h,h.editor,'Shift','keydown',{repeat:true});await delay(HOLD);assert.equal(h.panel(),null);h.unchanged();
  }finally{h.close();}
});

test('Shift+8 and Shift+Arrow remain unblocked and cancel the pending guide',async()=>{
  const fixtures=await Promise.all(['*','ArrowRight'].map(()=>boot()));
  try{
    for(const [index,h]of fixtures.entries()){
      press(h);const k=index===0?'*':'ArrowRight';
      const event=key(h,h.editor,k,'keydown',{code:index===0?'Digit8':'ArrowRight',shiftKey:true});
      assert.equal(event.defaultPrevented,false,`${k} was intercepted`);
      assert.equal(key(h,h.editor,k,'keyup',{shiftKey:true}).defaultPrevented,false);
    }
    await delay(HOLD);
    for(const h of fixtures){assert.equal(h.panel(),null);release(h);h.unchanged();}
  }finally{fixtures.forEach(h=>h.close());}
});

test('a second key dismisses an already visible hold guide without intercepting typing or selection',async()=>{
  const h=await boot();try{
    press(h);await delay(HOLD);assert(h.panel());
    const event=key(h,h.editor,'*','keydown',{code:'Digit8',shiftKey:true});assert.equal(event.defaultPrevented,false);assert.equal(h.panel(),null);
    release(h);h.unchanged();
  }finally{h.close();}
});

test('IME composition cancels a pending hold and composing Shift cannot arm it',async()=>{
  const h=await boot();try{
    press(h);h.editor.dispatchEvent(new h.win.CompositionEvent('compositionstart',{bubbles:true}));
    h.editor.dispatchEvent(new h.win.CompositionEvent('compositionend',{bubbles:true}));await delay(HOLD);assert.equal(h.panel(),null);release(h);
    key(h,h.editor,'Shift','keydown',{isComposing:true});await delay(HOLD);assert.equal(h.panel(),null);h.unchanged();
  }finally{h.close();}
});

test('blur, selection changes and pointer interactions cancel pending and visible holds',async()=>{
  const cancel=[h=>h.win.dispatchEvent(new h.win.Event('blur')),h=>h.doc.dispatchEvent(new h.win.Event('selectionchange')),h=>h.editor.dispatchEvent(new h.win.MouseEvent('pointerdown',{bubbles:true}))];
  const fixtures=await Promise.all(cancel.map(()=>boot()));
  try{
    for(const [index,h]of fixtures.entries()){press(h);cancel[index](h);}
    await delay(HOLD);for(const h of fixtures){assert.equal(h.panel(),null);release(h);h.editor.dispatchEvent(new h.win.MouseEvent('pointerup',{bubbles:true}));press(h);}
    await delay(HOLD);
    for(const [index,h]of fixtures.entries()){assert(h.panel());cancel[index](h);assert.equal(h.panel(),null);release(h);h.unchanged();}
  }finally{fixtures.forEach(h=>h.close());}
});

test('only the active native editor can start a hold, never an input or another view',async()=>{
  const fixtures=await Promise.all([boot(),boot(),boot()]);try{
    key(fixtures[0],fixtures[0].doc.querySelector('#outside'),'Shift');
    key(fixtures[1],fixtures[1].other,'Shift');
    key(fixtures[2],fixtures[2].editor,'Shift','keydown',{ctrlKey:true});
    await delay(HOLD);for(const h of fixtures){assert.equal(h.panel(),null);h.unchanged();}
  }finally{fixtures.forEach(h=>h.close());}
});

test('dragging, an existing selection, and active IME composition prevent Shift from arming a guide',async()=>{
  const [drag,selected,ime]=await Promise.all([boot(),boot(),boot()]);
  try{
    drag.editor.dispatchEvent(new drag.win.MouseEvent('pointerdown',{bubbles:true}));press(drag);
    const range=selected.doc.createRange();range.setStart(selected.editor.firstChild,0);range.setEnd(selected.editor.firstChild,3);
    selected.win.getSelection().removeAllRanges();selected.win.getSelection().addRange(range);await delay(0);press(selected);
    ime.editor.dispatchEvent(new ime.win.CompositionEvent('compositionstart',{bubbles:true}));press(ime);
    await delay(HOLD);
    for(const h of [drag,selected,ime]){assert.equal(h.panel(),null);h.unchanged();}
    release(drag);drag.editor.dispatchEvent(new drag.win.MouseEvent('pointerup',{bubbles:true}));press(drag);await delay(HOLD);
    assert(drag.panel(),'a completed pointer gesture left Shift permanently disabled');release(drag);
  }finally{for(const h of [drag,selected,ime])h.close();}
});

test('pressing both Shift keys cancels help both before and after the hold guide appears',async()=>{
  const [pending,visible]=await Promise.all([boot(),boot()]);try{
    press(pending);key(pending,pending.editor,'Shift','keydown',{code:'ShiftRight',shiftKey:true});
    press(visible);await delay(HOLD);assert.equal(pending.panel(),null);assert(visible.panel());
    key(visible,visible.editor,'Shift','keydown',{code:'ShiftRight',shiftKey:true});assert.equal(visible.panel(),null);
    pending.unchanged();visible.unchanged();
  }finally{pending.close();visible.close();}
});

test('sync closes guides and cancels timers when the view switches or writing is paused',async()=>{
  const h=await boot();try{
    press(h);h.target(h.doc.querySelector('#b'));h.guide.sync();await delay(HOLD);assert.equal(h.panel(),null);release(h);
    h.other.focus();await delay(0);key(h,h.other,'Shift');await delay(HOLD);assert(h.panel());
    h.target(null);h.guide.sync();assert.equal(h.panel(),null);h.guide.open();assert.equal(h.panel(),null);h.unchanged();
  }finally{h.close();}
});

test('a pinned guide stays on Shift release, closes on Escape or an outside pointer, and never writes',async()=>{
  const h=await boot();try{
    h.guide.open();assert(h.panel());release(h);assert(h.panel());
    h.panel().dispatchEvent(new h.win.MouseEvent('pointerdown',{bubbles:true}));assert(h.panel(),'inside pointer closed the pinned guide');
    key(h,h.doc.activeElement,'Escape');assert.equal(h.panel(),null);assert.equal(h.doc.activeElement,h.editor);
    h.guide.open(true);assert(h.panel());h.doc.body.dispatchEvent(new h.win.MouseEvent('pointerdown',{bubbles:true}));assert.equal(h.panel(),null);h.unchanged();
  }finally{h.close();}
});

test('destroy removes open UI, clears pending timers and disables future triggers',async()=>{
  const [pending,open]=await Promise.all([boot(),boot()]);try{
    press(pending);pending.guide.destroy();open.guide.open();assert(open.panel());open.guide.destroy();assert.equal(open.panel(),null);
    assert.equal(open.doc.querySelector('.nf-format-guide'),null,'destroy retained a closing panel');
    press(pending);press(open);pending.guide.open();open.guide.open();await delay(HOLD);
    assert.equal(pending.panel(),null);assert.equal(open.panel(),null);pending.unchanged();open.unchanged();
  }finally{pending.close();open.close();}
});

test('the two guide groups support keyboard tabs, wraparound and clicks without changing the note',async()=>{
  const h=await boot();try{
    h.guide.open();
    const list=h.panel().querySelector('[role="tablist"]');
    assert(list,'guide groups need a named tab list');
    assert(list.getAttribute('aria-label')||list.getAttribute('aria-labelledby'),'tab list has no accessible name');
    const tabs=[...list.querySelectorAll('[role="tab"]')];assert.equal(tabs.length,2);
    assert.match(tabs[0].textContent,/段首/);assert.match(tabs[1].textContent,/文字/);
    const selected=index=>{
      tabs.forEach((tab,i)=>{
        assert.equal(tab.getAttribute('aria-selected'),String(i===index));
        assert.equal(tab.tabIndex,i===index?0:-1,'tabs do not have one keyboard entry point');
      });
      const content=h.doc.getElementById(tabs[index].getAttribute('aria-controls'));
      assert(content,'selected tab does not identify its content');
      assert.equal(content.getAttribute('role'),'tabpanel');
      assert.equal(content.getAttribute('aria-labelledby'),tabs[index].id);
      assert.equal(content.hidden,false);
      for(const other of h.panel().querySelectorAll('[role="tabpanel"]'))if(other!==content)assert.equal(other.hidden,true);
      return content;
    };
    assert.match(selected(0).textContent,/#/);
    tabs[0].focus();
    for(const [name,index]of [['ArrowRight',1],['ArrowRight',0],['ArrowLeft',1],['Home',0],['End',1]]){
      const event=key(h,h.doc.activeElement,name);
      assert.equal(event.defaultPrevented,true,`${name} did not behave as tab navigation`);
      assert.equal(h.doc.activeElement,tabs[index]);
      selected(index);h.unchanged();
    }
    assert.match(selected(1).textContent,/斜体/);assert.match(selected(1).textContent,/加粗/);assert.match(selected(1).textContent,/高亮/);
    tabs[0].click();selected(0);tabs[1].click();selected(1);
    h.unchanged();
    key(h,h.doc.activeElement,'Escape');assert.equal(h.panel(),null);assert.equal(h.doc.activeElement,h.editor);
  }finally{h.close();}
});

function assertPosition(h,{left,top,width,height}) {
  const panel=h.panel();assert(panel);
  const visibleLeft=Math.max(0,left),visibleTop=Math.max(0,top);
  const visibleRight=Math.min(h.win.innerWidth,left+width),visibleBottom=Math.min(h.win.innerHeight,top+height);
  const expectedWidth=Math.min(640,visibleRight-visibleLeft-24),actualLeft=parseFloat(panel.style.left),actualWidth=parseFloat(panel.style.width);
  assert.equal(actualWidth,expectedWidth,'the guide width must leave 12px on each side of its pane');
  assert.equal(actualLeft+actualWidth/2,(visibleLeft+visibleRight)/2,'guide is not centered in the visible pane');
  assert.equal(parseFloat(panel.style.bottom),h.win.innerHeight-visibleBottom+12,'guide is not 12px above the visible pane bottom');
  assert.equal(parseFloat(panel.style.maxHeight),visibleBottom-visibleTop-24,'guide can grow beyond its pane');
}

test('the guide centers within full, split and narrow panes and clamps an offscreen pane to the viewport',async()=>{
  const h=await boot();try{
    h.guide.open();
    for(const bounds of [
      {left:100,top:60,width:1000,height:720},
      {left:600,top:80,width:560,height:700},
      {left:810,top:100,width:300,height:620},
      {left:-100,top:-30,width:500,height:650},
      {left:40,top:50,width:900,height:200},
      {left:40,top:50,width:900,height:700},
    ]){
      h.setBounds(h.editor.parentElement,bounds);
      h.win.dispatchEvent(new h.win.Event('resize'));await delay(25);
      assertPosition(h,bounds);
      assert.equal(h.panel().classList.contains('nf-guide-short'),bounds.height-24<280);
    }
    h.unchanged();
  }finally{h.close();}
});

test('pane resize observation follows the open guide and is released on close, view changes and destroy',async()=>{
  const h=await boot({bounds:{left:40,top:50,width:900,height:750}});try{
    const origin=h.editor.parentElement;
    h.guide.open();
    const watcher=h.observers.find(observer=>observer.observed.has(origin));
    assert(watcher,'the active pane is not observed for split resizing');
    const bounds={left:40,top:50,width:420,height:600};
    h.setBounds(origin,bounds);watcher.fire();await delay(25);assertPosition(h,bounds);
    h.guide.close();assert.equal(h.panel(),null);
    assert(h.observers.every(observer=>observer.disconnected),'close left a ResizeObserver connected');
    h.guide.open();assert(h.observers.some(observer=>observer.observed.has(origin)));
    h.target(h.other.parentElement);h.guide.sync();assert.equal(h.panel(),null);
    assert(h.observers.every(observer=>observer.disconnected),'switching views left an observer connected');
    h.guide.open();assert(h.observers.some(observer=>observer.observed.has(h.other.parentElement)));
    h.guide.destroy();assert(h.observers.every(observer=>observer.disconnected),'destroy left an observer connected');
    assert.equal(h.doc.querySelector('.nf-format-guide'),null);h.unchanged();
  }finally{h.close();}
});

test('finishing an old exit animation cannot remove a freshly reopened guide',async()=>{
  const h=await boot({animate:true});try{
    h.guide.open();const old=h.panel();assert(old);assert(h.animations.length,'entry did not animate');
    for(const animation of h.animations)animation.finish();
    await Promise.resolve();
    h.guide.close();
    assert.equal(h.panel(),null);
    assert.equal(old.hasAttribute('data-closing'),true);
    assert.equal(old.getAttribute('aria-hidden'),'true');
    const exit=h.animations.filter(animation=>animation.node===old).at(-1);
    assert.equal(exit.playState,'running','closing did not start an exit animation');
    h.guide.open();const current=h.panel();assert(current);assert.notEqual(current,old);
    exit.finish();await Promise.resolve();
    assert.equal(h.panel(),current,'the old animation removed the new guide');
    assert.equal(old.isConnected,false);
    h.guide.close();assert.equal(h.panel(),null);
    assert(h.doc.querySelector('.nf-format-guide[data-closing]'),'fixture should retain an unfinished exit');
    h.guide.destroy();
    assert.equal(h.doc.querySelector('.nf-format-guide'),null,'destroy retained an animated exit');
    for(const animation of h.animations)animation.finish();
    await Promise.resolve();assert.equal(h.doc.querySelector('.nf-format-guide'),null);h.unchanged();
  }finally{h.close();}
});

test('reduced motion opens and removes the guide immediately without animations',async()=>{
  const h=await boot({animate:true,reducedMotion:true});try{
    h.guide.open();assert(h.panel());h.guide.close();
    assert.equal(h.doc.querySelector('.nf-format-guide'),null);assert.equal(h.animations.length,0);h.unchanged();
  }finally{h.close();}
});
