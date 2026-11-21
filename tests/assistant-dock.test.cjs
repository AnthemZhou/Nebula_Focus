const {test} = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const {buildSync} = require('esbuild');
const code = buildSync({entryPoints:['src/assistant-dock.ts'],bundle:true,write:false,platform:'node',format:'cjs',external:['obsidian']}).outputFiles[0].text;
function fixture() {
  const dom = new JSDOM('<body><div class="mobile-navbar"><div class="mobile-navbar-actions"><div class="mobile-navbar-action"><button aria-label="返回">back</button></div></div></div></body>');
  const doc=dom.window.document, host=doc.querySelector('.mobile-navbar'), menus=[], actions=[];
  const m={exports:{}};new Function('require','module','exports',code)(()=>({setIcon:(el,icon)=>el.dataset.icon=icon}),m,m.exports);
  let dock;
  const controller={state:{draft:'',busy:false,attachments:[]},config:{imageInput:true},setDraft(value){this.state.draft=value;dock?.render();},
    open(){actions.push('open');},openSettings(){actions.push('settings');},send(){actions.push(['send',this.state.draft]);return Promise.resolve();},
    cancel(){actions.push('cancel');},addFiles(files){this.state.attachments.push(...files);actions.push('files');}};
  dock=new m.exports.MobileAssistantDock(host,controller);
  const input=doc.querySelector('textarea'), send=doc.querySelector('.bui-ai-dock-send');
  const enter=options=>input.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true,...options}));
  return {doc,win:dom.window,host,dock,controller,actions,menus,input,send,enter,close(){dock.destroy();dom.window.close();}};
}
test('mobile composer shares a draft, sends explicitly and never sends while IME is composing',()=>{
  const f=fixture();try {
    assert.equal(f.send.disabled,true);
    f.input.dispatchEvent(new f.win.CompositionEvent('compositionstart'));
    f.input.value='报销';f.input.dispatchEvent(new f.win.Event('input'));
    f.enter({ctrlKey:true,isComposing:true});assert.deepEqual(f.actions,[]);
    assert.equal(f.controller.state.draft,'');
    f.input.dispatchEvent(new f.win.CompositionEvent('compositionend'));
    assert.equal(f.controller.state.draft,'报销');assert.equal(f.send.disabled,false);
    f.enter({});assert.deepEqual(f.actions,[],'plain Enter remains a newline');
    f.enter({metaKey:true});assert.deepEqual(f.actions,['open',['send','报销']]);
    f.controller.state.busy=true;f.dock.render();assert.equal(f.input.disabled,true);
    f.send.click();assert.equal(f.actions.at(-1),'cancel');
  }finally{f.close();}
});
test('attachment menu retains native page controls and unmount restores their original host',()=>{
  const f=fixture();try {
    let back=0;const native=f.host.querySelector('.mobile-navbar-actions');native.querySelector('button').addEventListener('click',()=>back++);
    f.doc.querySelector('[aria-label="附件与页面操作"]').click();
    const items=()=>[...f.doc.querySelectorAll('.bui-ai-dock-menu button')];
    assert.deepEqual(items().map(i=>i.textContent),['添加截图','AI 设置','返回']);
    items().find(i=>i.textContent==='返回').click();assert.equal(back,1);
    f.doc.querySelector('[aria-label="附件与页面操作"]').click();
    items().find(i=>i.textContent==='AI 设置').click();assert.equal(f.actions.at(-1),'settings');
    f.controller.config.imageInput=false;f.doc.querySelector('[aria-label="附件与页面操作"]').click();
    assert.equal(items().find(i=>i.textContent==='添加截图').disabled,true);
    f.dock.destroy();assert.equal(f.host.className,'mobile-navbar');assert.equal(native.parentElement,f.host);assert.equal(f.doc.querySelector('.bui-ai-dock'),null);
  }finally{f.close();}
});
test('choosing screenshots opens the existing chat with the same draft and attachments',()=>{
  const f=fixture();try {
    f.controller.setDraft('补上发票');const picker=f.doc.querySelector('input[type=file]');
    Object.defineProperty(picker,'files',{value:[new f.win.File(['image'],'receipt.png',{type:'image/png'})]});
    picker.dispatchEvent(new f.win.Event('change'));
    assert.equal(f.controller.state.draft,'补上发票');assert.equal(f.controller.state.attachments.length,1);
    assert.deepEqual(f.actions,['files','open']);assert.equal(f.actions.some(a=>Array.isArray(a)&&a[0]==='send'),false);
  }finally{f.close();}
});

test('screenshot picker opens synchronously from the menu click and outside pointer closes it',()=>{
  const f=fixture();try {
    let picked=0;f.doc.querySelector('input[type=file]').click=()=>picked++;
    const plus=f.doc.querySelector('[aria-label="附件与页面操作"]');plus.click();
    f.doc.querySelector('.bui-ai-dock-menu button').click();assert.equal(picked,1);
    assert.ok(f.doc.querySelector('.bui-ai-dock-menu'),'keep the activating node mounted for the iOS picker');
    f.doc.querySelector('input[type=file]').dispatchEvent(new f.win.Event('cancel'));
    assert.equal(f.doc.querySelector('.bui-ai-dock-menu'),null);
    plus.click();f.doc.body.dispatchEvent(new f.win.Event('pointerdown',{bubbles:true}));
    assert.equal(f.doc.querySelector('.bui-ai-dock-menu'),null);
    assert.equal(plus.getAttribute('aria-expanded'),'false');
  }finally{f.close();}
});

test('independent composer follows native drawer motion even while the navbar is detached', async () => {
  const f = fixture(); try {
    const surface = f.doc.querySelector('.bui-ai-dock-host');
    f.input.focus(); f.input.value = '继续输入'; f.input.dispatchEvent(new f.win.Event('input'));
    f.host.remove();
    f.host.style.transform = 'translateX(280px)'; f.host.style.transition = 'none';
    await Promise.resolve();
    assert.equal(surface.style.transform, 'translateX(280px)'); assert.equal(surface.style.transition, 'none');
    assert.equal(f.doc.activeElement, f.input); assert.equal(f.input.value, '继续输入');
    f.host.style.transform = ''; f.host.style.transition = '';
    await Promise.resolve();
    assert.equal(surface.style.transform, ''); assert.equal(surface.style.transition, '');
    f.dock.destroy(); f.host.style.transform = 'translateX(100px)'; await Promise.resolve();
    assert.equal(surface.style.transform, '', 'destroy disconnects the native motion observer');
    assert.equal(surface.isConnected, false); assert.equal(f.host.classList.contains('bui-ai-docked'), false);
  } finally {f.close();}
});
