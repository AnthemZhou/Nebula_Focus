const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const {buildSync}=require('esbuild');
const MarkdownIt=require('markdown-it');
const {createHost}=require('./host.cjs');
const pageCode=buildSync({entryPoints:['src/page.ts'],bundle:true,write:false,format:'cjs',platform:'browser',external:['obsidian']}).outputFiles[0].text;
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
async function boot(files={'Home.md':'## A\n\nOriginal\n','Other.md':'## B\n\nOther\n'}){
  const dom=new JSDOM('<!doctype html><body><div class="workspace"></div></body>',{url:'https://fixture.invalid/',pretendToBeVisual:true});
  const host=createHost(dom.window,{files,renderMarkdown:text=>new MarkdownIt({html:true}).render(text)});
  const mod={exports:{}};
  const context=vm.createContext({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,TextEncoder,console,module:mod,exports:mod.exports,require:name=>{assert.equal(name,'obsidian');return host.api;}});
  new vm.Script(pageCode).runInContext(context);
  const page=new mod.exports.FocusPage(host.app,host.leaf.view);await page.update();
  return {...host,page,doc:dom.window.document,async navigate(path){await host.leaf.openFile(host.vault.getAbstractFileByPath(path));await page.update();},close(){page.destroy();dom.window.close();}};
}
async function edit(h,text){
  const input=h.doc.querySelector('.nf-section-body p');await h.page.editBlock(input);
  input.textContent=text;input.dispatchEvent(new h.doc.defaultView.Event('input'));
  assert.equal(await h.page.saveEdit(h.page.session),true);
}
function delayNextWrite(h){
  const entered=deferred(),release=deferred(),original=h.vault.process.bind(h.vault);let delayed=false;
  h.vault.process=async(...args)=>{if(!delayed){delayed=true;entered.resolve();await release.promise;}return original(...args);};
  return {entered:entered.promise,release:release.resolve};
}
function delayNextRender(h){
  const entered=deferred(),release=deferred(),original=h.api.MarkdownRenderer.render;let delayed=false;
  h.api.MarkdownRenderer.render=async(...args)=>{if(!delayed){delayed=true;entered.resolve();await release.promise;}return original(...args);};
  return {entered:entered.promise,release:release.resolve};
}

test('navigation during a pending undo or redo shows the destination after the write finishes',{timeout:5000},async()=>{
  for(const direction of ['undo','redo']){
    const h=await boot();try{
      await edit(h,'Changed');
      if(direction==='redo'){await h.page.undo();await h.page.saveEdit(h.page.session);}
      const gate=delayNextWrite(h),operation=h.page[direction]();await gate.entered;
      await h.navigate('Other.md');gate.release();await operation;
      assert.equal(h.doc.querySelector('.nf-page-heading h1')?.textContent,'Other');
      assert.equal(h.doc.querySelector('.nf-section-body p')?.textContent,'Other');
      assert.equal(h.doc.querySelector('.nf-block-editor'),null);
      assert.equal(h.vault.getAbstractFileByPath('Home.md').text,direction==='undo'?'## A\n\nOriginal\n':'## A\n\nChanged\n');
      assert.equal(h.vault.getAbstractFileByPath('Other.md').text,'## B\n\nOther\n');
    }finally{h.close();}
  }
});

test('a structure render interrupted by navigation cannot resume its caret in the new note',{timeout:5000},async()=>{
  const h=await boot();try{
    await h.page.editBlock(h.doc.querySelector('.nf-section-body p'));
    const gate=delayNextRender(h),operation=h.page.formatBlock('h3');await gate.entered;
    await h.navigate('Other.md');gate.release();await operation;
    assert.equal(h.doc.querySelector('.nf-page-heading h1')?.textContent,'Other');
    assert.equal(h.doc.querySelector('.nf-block-editor'),null);
    assert.equal(h.doc.querySelectorAll('.nf-section-body p').length,1);
    assert.equal(h.vault.getAbstractFileByPath('Home.md').text,'## A\n\n### Original\n');
    assert.equal(h.vault.getAbstractFileByPath('Other.md').text,'## B\n\nOther\n');
  }finally{h.close();}
});

test('an undo render interrupted by navigation cannot activate the old source offset',{timeout:5000},async()=>{
  const h=await boot();try{
    await edit(h,'Changed');
    const gate=delayNextRender(h),operation=h.page.undo();await gate.entered;
    await h.navigate('Other.md');gate.release();await operation;
    assert.equal(h.doc.querySelector('.nf-page-heading h1')?.textContent,'Other');
    assert.equal(h.doc.querySelector('.nf-block-editor'),null);
    assert.equal(h.doc.querySelectorAll('.nf-section-body p').length,1);
    assert.equal(h.vault.getAbstractFileByPath('Home.md').text,'## A\n\nOriginal\n');
    assert.equal(h.vault.getAbstractFileByPath('Other.md').text,'## B\n\nOther\n');
  }finally{h.close();}
});

test('a redo waiting for an unsaved edit cannot apply another file’s redo after navigation',{timeout:5000},async()=>{
  const h=await boot();try{
    await h.navigate('Other.md');await edit(h,'Changed other');await h.page.undo();await h.page.saveEdit(h.page.session);
    await h.navigate('Home.md');
    const input=h.doc.querySelector('.nf-section-body p');await h.page.editBlock(input);
    input.textContent='Changed home';input.dispatchEvent(new h.doc.defaultView.Event('input'));
    const gate=delayNextWrite(h),operation=h.page.redo();await gate.entered;
    await h.navigate('Other.md');gate.release();await operation;
    assert.equal(h.vault.getAbstractFileByPath('Home.md').text,'## A\n\nChanged home\n');
    assert.equal(h.vault.getAbstractFileByPath('Other.md').text,'## B\n\nOther\n');
    assert.equal(h.page.history.peekRedo('Other.md').after,'## B\n\nChanged other\n');
    assert.equal(h.doc.querySelector('.nf-section-body p')?.textContent,'Other');
  }finally{h.close();}
});

test('moving back after clearing a section heading keeps the earlier paragraph source offset',{timeout:5000},async()=>{
  const h=await boot({'Home.md':'## A\n\nAlpha\n\n## B\n\nTail\n'});try{
    const heading=[...h.doc.querySelectorAll('.nf-section-body h2')].find(el=>el.textContent==='B');
    await h.page.editBlock(heading);heading.textContent='';heading.dispatchEvent(new h.doc.defaultView.Event('input'));
    await h.page.moveCaret(h.page.session,-1);
    const editor=h.doc.querySelector('.nf-block-editor');assert.equal(editor?.textContent,'Alpha');assert.equal(editor?.dataset.blockStart,'6');
    editor.textContent='Earlier';editor.dispatchEvent(new h.doc.defaultView.Event('input'));await h.page.saveEdit(h.page.session);
    assert.equal(h.leaf.view.file.text,'## A\n\nEarlier\n\n## \n\nTail\n');
  }finally{h.close();}
});

test('retrying a failed structural write completes and resumes without waiting on itself',{timeout:5000},async()=>{
  const h=await boot();try{
    await h.page.editBlock(h.doc.querySelector('.nf-section-body p'));
    const original=h.vault.process.bind(h.vault);let attempts=0;
    h.vault.process=async(...args)=>{if(++attempts===1)throw Error('Temporary write failure');return original(...args);};
    await h.page.formatBlock('h3');assert(h.page.session.pending);assert.equal(h.leaf.view.file.text,'## A\n\nOriginal\n');
    assert.equal(await h.page.saveEdit(h.page.session),true);
    assert.equal(h.leaf.view.file.text,'## A\n\n### Original\n');
    assert.equal(h.doc.querySelector('.nf-block-editor')?.textContent,'Original');
    assert.equal(h.page.pendingSave,undefined);
  }finally{h.close();}
});
