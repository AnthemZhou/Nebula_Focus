const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {buildSync}=require('esbuild');
const {JSDOM}=require('jsdom');
const loadGeometryStyles=require('./load-geometry-styles.cjs');
const code=buildSync({entryPoints:['src/mobile-popover.ts'],bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text;
const moduleValue={exports:{}};
new vm.Script(code).runInContext(vm.createContext({module:moduleValue,exports:moduleValue.exports}));
const {positionAnchoredPopover,watchPopoverViewport,guardTouchScrollClicks}=moduleValue.exports;
function setup(t){
  const dom=new JSDOM('<!doctype html><body><div id="anchor"></div><div id="popup"><div id="list"><button>Choice</button></div></div></body>',{pretendToBeVisual:true});
  const win=dom.window,doc=win.document,anchor=doc.querySelector('#anchor'),popup=doc.querySelector('#popup');
  loadGeometryStyles(doc);
  Object.defineProperties(win,{innerWidth:{value:390,writable:true},innerHeight:{value:844,writable:true}});
  const viewport=new win.EventTarget();Object.assign(viewport,{width:390,height:844,offsetLeft:0,offsetTop:0});
  Object.defineProperty(win,'visualViewport',{value:viewport,configurable:true});
  anchor.getBoundingClientRect=()=>({left:300,right:390,top:650,bottom:690,width:90,height:40});
  popup.getBoundingClientRect=()=>({height:360,width:Number.parseFloat(popup.style.width)||280});
  t.after(()=>win.close());return{win,doc,anchor,popup,viewport};
}

test('keyboard shrinking the visual viewport keeps a covered anchor editor visible above the keyboard',t=>{
  const f=setup(t);assert.equal(positionAnchoredPopover(f.anchor,f.popup,280),true);
  assert.equal(f.win.getComputedStyle(f.popup).position,'fixed');
  assert.equal(f.popup.style.left,'102px');assert.equal(f.popup.style.top,'286px');
  f.viewport.height=320;
  assert.equal(positionAnchoredPopover(f.anchor,f.popup,280),true,'anchor under keyboard must not close the active editor');
  assert.equal(f.popup.style.maxHeight,'304px');assert.equal(f.popup.style.top,'8px');
  assert.ok(parseFloat(f.popup.style.top)+Math.min(360,parseFloat(f.popup.style.maxHeight))<=312);
});

test('zoomed and panned visual viewport offsets constrain both horizontal and vertical popup edges',t=>{
  const f=setup(t);Object.assign(f.viewport,{width:195,height:300,offsetLeft:90,offsetTop:180});
  assert.equal(positionAnchoredPopover(f.anchor,f.popup,280),true);
  assert.equal(f.popup.style.width,'179px');assert.equal(f.popup.style.left,'98px');assert.equal(f.popup.style.top,'188px');
  assert.equal(f.popup.style.maxHeight,'284px');
});

test('missing or transient zero visual viewport falls back to layout dimensions and an off-screen anchor closes',t=>{
  const f=setup(t);f.viewport.height=0;
  assert.equal(positionAnchoredPopover(f.anchor,f.popup,240),true);assert.equal(f.popup.style.maxHeight,'828px');
  Object.defineProperty(f.win,'visualViewport',{value:undefined});
  assert.equal(positionAnchoredPopover(f.anchor,f.popup,240),true);
  f.anchor.getBoundingClientRect=()=>({top:-80,bottom:-30,left:50,right:150});
  assert.equal(positionAnchoredPopover(f.anchor,f.popup,240),false);
});

test('keyboard resize, visual viewport pan and document scrolling reposition until cleanup; list scrolling stays local',t=>{
  const f=setup(t);let calls=0;const stop=watchPopoverViewport(f.popup,()=>{calls++;positionAnchoredPopover(f.anchor,f.popup,280);});
  f.viewport.height=300;f.viewport.dispatchEvent(new f.win.Event('resize'));
  assert.equal(calls,1);assert.equal(f.popup.style.maxHeight,'284px');
  f.viewport.offsetTop=100;f.viewport.dispatchEvent(new f.win.Event('scroll'));assert.equal(calls,2);assert.equal(f.popup.style.top,'108px');
  f.doc.querySelector('#list').dispatchEvent(new f.win.Event('scroll'));assert.equal(calls,2);
  f.doc.dispatchEvent(new f.win.Event('scroll'));f.win.dispatchEvent(new f.win.Event('resize'));assert.equal(calls,4);
  stop();f.viewport.dispatchEvent(new f.win.Event('resize'));f.viewport.dispatchEvent(new f.win.Event('scroll'));
  f.doc.dispatchEvent(new f.win.Event('scroll'));f.win.dispatchEvent(new f.win.Event('resize'));assert.equal(calls,4);
});

function pointer(f,el,type,extra={}){
  const event=new f.win.MouseEvent(type,{bubbles:true,cancelable:true,clientX:30,clientY:30,...extra});
  Object.defineProperties(event,{pointerId:{value:extra.pointerId??1},pointerType:{value:extra.pointerType??'touch'}});
  el.dispatchEvent(event);return event;
}
test('touch pan and pointercancel suppress only their trailing activation while preserving scrolling and the next tap',t=>{
  const f=setup(t),button=f.popup.querySelector('button');let selected=0;
  const stop=guardTouchScrollClicks(f.popup);button.addEventListener('click',()=>selected++);
  const down=pointer(f,button,'pointerdown');assert.equal(down.defaultPrevented,false);
  const move=pointer(f,button,'pointermove',{clientY:70});assert.equal(move.defaultPrevented,false);
  pointer(f,button,'pointerup',{clientY:70});button.click();assert.equal(selected,0);
  pointer(f,button,'pointerdown');pointer(f,button,'pointerup');button.click();assert.equal(selected,1);
  pointer(f,button,'pointerdown');pointer(f,button,'pointercancel');button.click();assert.equal(selected,1);
  pointer(f,button,'pointerdown',{pointerType:'mouse'});button.click();assert.equal(selected,2);
  stop();pointer(f,button,'pointerdown');pointer(f,button,'pointermove',{clientY:80});button.click();assert.equal(selected,3);
});

test('a touch scroll event prevents a trailing delete click without swallowing a keyboard activation',t=>{
  const f=setup(t),button=f.popup.querySelector('button');let deleted=0;guardTouchScrollClicks(f.popup);
  button.addEventListener('click',()=>deleted++);
  pointer(f,button,'pointerdown');f.doc.querySelector('#list').dispatchEvent(new f.win.Event('scroll'));
  pointer(f,button,'pointerup');button.click();assert.equal(deleted,0);
  pointer(f,button,'pointerdown');pointer(f,button,'pointercancel');
  button.dispatchEvent(new f.win.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));button.click();assert.equal(deleted,1);
});
