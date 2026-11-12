const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {buildSync} = require('esbuild');
const {JSDOM} = require('jsdom');
const code = buildSync({entryPoints:['src/table-render-sync.ts'],bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text;
function fixture(prepare, {foreignRealm=false}={}) {
  const dom = new JSDOM('<!doctype html><body><div class="bases-view"><div class="bases-table-container"></div></div></body>',{pretendToBeVisual:true});
  const primary = foreignRealm ? new JSDOM('<!doctype html><body></body>') : dom;
  const doc = dom.window.document, mod = {exports:{}};
  new vm.Script(code).runInContext(vm.createContext({module:mod,exports:mod.exports,HTMLElement:primary.window.HTMLElement}));
  const root = doc.querySelector('.bases-view'), container = root.firstElementChild;
  const view = {type:'table',_loaded:true,containerEl:container,scrollEl:root,updateVirtualDisplay(value) {
    const row = doc.createElement('div'); row.className='native-row'; row.textContent=value;
    container.replaceChildren(row); return 'native result';
  }};
  let enabled=true, paints=0;
  const sync = new mod.exports.TableRenderSync((current, target) => {
    assert.equal(current, view); assert.equal(target, root); paints++;
    for(const row of container.querySelectorAll('.native-row')) {
      if(row.querySelector('.icon')) continue;
      const icon=doc.createElement('span');icon.className='icon';row.prepend(icon);
    }
  },()=>enabled,prepare ? view => prepare(view,doc,sync) : undefined);
  const native = view.updateVirtualDisplay;
  return {dom,doc,root,container,view,sync,native,get paints(){return paints;},disable(){enabled=false;},close(){sync.clear();dom.window.close();if(primary!==dom)primary.window.close();}};
}
const microtasks = async () => {await Promise.resolve();await Promise.resolve();};

test('new virtual rows are decorated synchronously before native update returns, without a second observer pass',async()=>{
  const f=fixture();try{
    f.sync.attach(f.view);const initial=f.paints;
    assert.equal(f.view.updateVirtualDisplay('first'),'native result');
    assert.equal(f.container.querySelectorAll('.icon').length,1);
    assert.equal(f.paints,initial+1);
    await microtasks();assert.equal(f.paints,initial+1);
    for(let i=0;i<20;i++) f.view.updateVirtualDisplay(`row ${i}`);
    assert.equal(f.container.querySelectorAll('.icon').length,1);
    await microtasks();assert.equal(f.paints,initial+21);
  }finally{f.close();}
});

test('tables and explicit scroll roots in a second window render, observe and tear down in their own DOM realm',async()=>{
  const f=fixture(undefined,{foreignRealm:true});
  try {
    // No matching fallback ancestor: the explicit foreign-realm scrollEl must
    // be accepted, not silently replaced with the narrower table container.
    f.root.className='popout-table-scroll';
    f.sync.attach(f.view);assert.notEqual(f.view.updateVirtualDisplay,f.native);
    assert.equal(f.sync.owns(f.root),true);const initial=f.paints;
    assert.equal(f.view.updateVirtualDisplay('popout'),'native result');
    assert.ok(f.container.querySelector('.icon'));assert.equal(f.paints,initial+1);
    await microtasks();assert.equal(f.paints,initial+1);
    f.container.innerHTML='<div class="native-row">async popout data</div>';
    await microtasks();assert.equal(f.paints,initial+2);assert.ok(f.container.querySelector('.icon'));
    f.sync.clear();assert.equal(f.view.updateVirtualDisplay,f.native);assert.equal(f.sync.owns(f.root),false);
    f.view.updateVirtualDisplay('native after clear');await microtasks();
    assert.equal(f.container.querySelector('.icon'),null);assert.equal(f.paints,initial+2);
  }finally{f.close();}
});

test('direct cell and row mutations finish in a microtask, without recursive decoration loops',async()=>{
  const f=fixture();try{
    f.sync.attach(f.view);const initial=f.paints;
    f.container.innerHTML='<div class="native-row">new cell</div>';
    await microtasks();assert.equal(f.paints,initial+1);assert.equal(f.container.querySelectorAll('.icon').length,1);
    await microtasks();assert.equal(f.paints,initial+1);
    f.container.firstElementChild.lastChild.textContent='updated';
    await microtasks();assert.equal(f.paints,initial+2);assert.equal(f.container.querySelectorAll('.icon').length,1);
  }finally{f.close();}
});

test('only owned viewport mutations skip global discovery and disconnected views do not paint',async()=>{
  const f=fixture();try{
    f.sync.attach(f.view);assert.equal(f.sync.owns(f.container),true);assert.equal(f.sync.owns(f.doc.body),false);
    const initial=f.paints;f.root.remove();f.view.updateVirtualDisplay('detached');await microtasks();
    assert.equal(f.paints,initial);
    f.sync.prune();assert.equal(f.view.updateVirtualDisplay,f.native);assert.equal(f.sync.owns(f.container),false);
  }finally{f.close();}
});

test('attach is idempotent and teardown restores inherited and own native methods',async()=>{
  const f=fixture();try{
    f.sync.attach(f.view);const wrapped=f.view.updateVirtualDisplay;
    f.sync.attach(f.view);assert.equal(f.view.updateVirtualDisplay,wrapped);
    f.sync.clear();assert.equal(f.view.updateVirtualDisplay,f.native);
    delete f.view.updateVirtualDisplay;Object.setPrototypeOf(f.view,{updateVirtualDisplay:f.native});
    f.sync.attach(f.view);assert.equal(Object.hasOwn(f.view,'updateVirtualDisplay'),true);
    f.sync.clear();assert.equal(Object.hasOwn(f.view,'updateVirtualDisplay'),false);
    assert.equal(f.view.updateVirtualDisplay,f.native);
    const initial=f.paints;f.container.textContent='after clear';await microtasks();assert.equal(f.paints,initial);
  }finally{f.close();}
});

test('height adapter layered above native sync restores in reverse order and can paint its direct RAF path',async()=>{
  const f=fixture();try{
    f.sync.attach(f.view);const syncWrapper=f.view.updateVirtualDisplay;
    const heightWrapper=()=>{f.container.innerHTML='<div class="native-row">height layout</div>';f.sync.refreshView(f.view);};
    f.view.updateVirtualDisplay=heightWrapper;
    const initial=f.paints;heightWrapper();assert.equal(f.paints,initial+1);assert.ok(f.container.querySelector('.icon'));
    await microtasks();assert.equal(f.paints,initial+1);
    f.view.updateVirtualDisplay=syncWrapper;f.sync.clear();assert.equal(f.view.updateVirtualDisplay,f.native);
  }finally{f.close();}
});

test('paused appearance leaves native rendering intact and resumes decoration without recreating the view',async()=>{
  const f=fixture();try{
    f.sync.attach(f.view);const initial=f.paints;f.disable();
    assert.equal(f.view.updateVirtualDisplay('native'),'native result');await microtasks();
    assert.equal(f.paints,initial);assert.equal(f.container.querySelector('.icon'),null);
  }finally{f.close();}
});

test('same view changing its root is rebound and old root no longer triggers work',async()=>{
  const f=fixture();try{
    f.sync.attach(f.view);const old=f.root;
    const next=f.doc.createElement('div');f.doc.body.append(next);f.view.scrollEl=next;
    // No child paint in this fixture after replacement: detach and reattach is
    // verified with the renderer disabled, keeping callback root assertions local.
    f.disable();f.sync.attach(f.view);const initial=f.paints;
    old.append(f.doc.createElement('span'));await microtasks();assert.equal(f.paints,initial);
    assert.equal(f.sync.owns(old),false);assert.equal(f.sync.owns(next),true);
    f.sync.clear();assert.equal(f.view.updateVirtualDisplay,f.native);
  }finally{f.close();}
});

test('root rebinding preserves the native-sync-height method chain for reverse-order teardown',()=>{
  const f=fixture();try{
    f.sync.attach(f.view);const syncWrapper=f.view.updateVirtualDisplay;
    let heightLive=true;
    const heightWrapper=()=>heightLive?syncWrapper.call(f.view,'height'):undefined;
    f.view.updateVirtualDisplay=heightWrapper;
    const next=f.doc.createElement('div');f.doc.body.append(next);f.view.scrollEl=next;
    f.disable();f.sync.attach(f.view);
    assert.equal(f.view.updateVirtualDisplay,heightWrapper);
    // Match the height adapter's identity-based restore, then sync cleanup.
    if(f.view.updateVirtualDisplay===heightWrapper)f.view.updateVirtualDisplay=syncWrapper;
    heightLive=false;f.sync.clear();
    assert.equal(f.view.updateVirtualDisplay,f.native);
    assert.equal(f.view.updateVirtualDisplay('native after clear'),'native result');
    assert.equal(f.container.textContent,'native after clear');
  }finally{f.close();}
});

test('delayed native rows finish one-time geometry and final decoration in the same render',async()=>{
  let attempts=0,ready=false;
  const f=fixture((view,doc,sync)=>{
    attempts++;
    if(!ready || !view.containerEl.querySelector('.native-row')) return false;
    // Model a geometry adapter virtualizing a new set of rows and notifying
    // afterRender. Neither the nested native wrapper nor refreshView recurses.
    assert.ok(view.containerEl.querySelector('.icon'));
    view.updateVirtualDisplay('content-sized');sync.refreshView(view);
    return true;
  });
  try{
    f.sync.attach(f.view);const wrapper=f.view.updateVirtualDisplay;
    assert.equal(attempts,1);
    f.view.updateVirtualDisplay('native first batch');assert.equal(attempts,2);
    ready=true;f.view.updateVirtualDisplay('native ready');
    assert.equal(attempts,3);assert.equal(f.container.textContent,'content-sized');
    assert.equal(f.container.querySelectorAll('.icon').length,1);
    const paints=f.paints;await microtasks();assert.equal(f.paints,paints);
    f.sync.attach(f.view);assert.equal(f.view.updateVirtualDisplay,wrapper);
    for(let i=0;i<10;i++)f.view.updateVirtualDisplay(`scroll ${i}`);
    assert.equal(attempts,3);assert.equal(f.container.querySelectorAll('.icon').length,1);
    await microtasks();assert.equal(f.paints,paints+10);
  }finally{f.close();}
});

test('a detached factory view prepares only when mounted and later rows become ready',async()=>{
  let attempts=0;
  const f=fixture(view=>{attempts++;return !!view.containerEl.querySelector('.native-row');});
  try{
    f.root.remove();f.sync.attach(f.view);const wrapper=f.view.updateVirtualDisplay;
    f.view.updateVirtualDisplay('detached');await microtasks();assert.equal(attempts,0);
    f.doc.body.append(f.root);f.sync.attach(f.view);
    assert.equal(f.view.updateVirtualDisplay,wrapper);assert.equal(attempts,1);
    assert.equal(f.container.querySelectorAll('.icon').length,1);
    f.sync.attach(f.view);assert.equal(attempts,1);
    f.root.remove();f.view.updateVirtualDisplay('detached again');await microtasks();
    assert.equal(attempts,1);
    f.doc.body.append(f.root);f.view.updateVirtualDisplay('returned');
    assert.equal(attempts,1);assert.equal(f.container.querySelectorAll('.icon').length,1);
  }finally{f.close();}
});

test('direct async native rows can complete preparation before the next paint',async()=>{
  let completed=0;
  const f=fixture(view=>{
    if(!view.containerEl.querySelector('.native-row'))return false;
    completed++;view.containerEl.firstElementChild.textContent='ready';return true;
  });
  try{
    f.sync.attach(f.view);
    f.container.innerHTML='<div class="native-row">async data</div>';
    await microtasks();
    assert.equal(completed,1);assert.equal(f.container.textContent,'ready');
    assert.equal(f.container.querySelectorAll('.icon').length,1);
    const paints=f.paints;await microtasks();assert.equal(f.paints,paints);
  }finally{f.close();}
});
