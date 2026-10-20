const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const {buildSync}=require('esbuild');
const vm=require('node:vm');
const code=buildSync({entryPoints:['src/format-guide.ts'],bundle:true,write:false,platform:'browser',format:'cjs',external:['obsidian']}).outputFiles[0].text;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const HOLD=650;

async function boot() {
  const dom=new JSDOM('<!doctype html><body><div id="a" class="nf-writing"><div class="cm-content" contenteditable="true" tabindex="0">Original text</div></div><div id="b" class="nf-writing"><div class="cm-content" contenteditable="true" tabindex="0">Other text</div></div><input id="outside"></body>',{url:'https://fixture.invalid/',pretendToBeVisual:true});
  const win=dom.window,doc=win.document,module={exports:{}};
  // Public Obsidian DOM helpers are available in the app; keep this fixture
  // independent of its simulated Vault, plugin lifecycle and native editor.
  win.HTMLElement.prototype.createEl=function(tag,options={}){if(typeof options==='string')options={cls:options};const el=doc.createElement(tag);if(options.cls)el.className=options.cls;if(options.text!==undefined)el.textContent=options.text;for(const[key,value]of Object.entries(options.attr||{}))el.setAttribute(key,value);this.append(el);return el;};
  win.HTMLElement.prototype.createDiv=function(options){return this.createEl('div',options);};
  win.HTMLElement.prototype.createSpan=function(options){return this.createEl('span',options);};
  win.HTMLElement.prototype.setText=function(text){this.textContent=text;};
  win.HTMLElement.prototype.empty=function(){this.replaceChildren();};
  const context=vm.createContext({window:win,document:doc,HTMLElement:win.HTMLElement,Element:win.Element,Node:win.Node,
    KeyboardEvent:win.KeyboardEvent,Event:win.Event,console,module,exports:module.exports,
    setTimeout:win.setTimeout.bind(win),clearTimeout:win.clearTimeout.bind(win),
    require:name=>{assert.equal(name,'obsidian');return {setIcon(el,name){el.dataset.icon=name;}};}});
  new vm.Script(code).runInContext(context);
  let target=doc.querySelector('#a'),inputs=0;
  const editor=doc.querySelector('#a .cm-content'),other=doc.querySelector('#b .cm-content');
  for(const el of [editor,other])for(const event of ['input','beforeinput'])el.addEventListener(event,()=>inputs++);
  const initial=[editor.innerHTML,other.innerHTML];
  editor.focus();const range=doc.createRange();range.setStart(editor.firstChild,0);range.collapse(true);win.getSelection().removeAllRanges();win.getSelection().addRange(range);
  await delay(0); // Drain the browser's initial focus/selection notifications.
  const guide=new module.exports.FormatGuide({target:()=>target,text:(zh,en)=>zh});
  return {doc,win,editor,other,guide,target(value){target=value;},panel:()=>doc.querySelector('.nf-format-guide'),
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
    press(pending);press(open);pending.guide.open();open.guide.open();await delay(HOLD);
    assert.equal(pending.panel(),null);assert.equal(open.panel(),null);pending.unchanged();open.unchanged();
  }finally{pending.close();open.close();}
});
