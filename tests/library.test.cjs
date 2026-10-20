const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {transformSync}=require('esbuild');
const {JSDOM}=require('jsdom');
const vm=require('node:vm');
const {createHost}=require('./host.cjs');
const code=transformSync(readFileSync('src/library-model.ts','utf8'),{loader:'ts',format:'cjs'}).code;
const mod={exports:{}};new Function('module','exports',code)(mod,mod.exports);
const {newLibrary,libraryMembers,updateMembers,renameMembers,addLibraryField}=mod.exports;
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function boot(){
  const dom=new JSDOM('<!doctype html><body><div class="workspace"></div></body>',{url:'https://fixture.invalid/',pretendToBeVisual:true});
  const host=createHost(dom.window,{files:{'A.md':'### Title\n\nPlain text','B.md':'---\nowner: me\n---\nKeep'},settings:{mobileOnly:false}});
  const mod={exports:{}};
  new vm.Script(readFileSync('main.js','utf8')).runInContext(vm.createContext({
    window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,MutationObserver:dom.window.MutationObserver,TextEncoder,console,
    module:mod,exports:mod.exports,require:name=>{assert.equal(name,'obsidian');return host.api;}
  }));
  const plugin=new mod.exports.default();await plugin.onload();await delay(70);
  return {...host,plugin,doc:dom.window.document,close(){plugin.cleanup();dom.window.close();}};
}

test('a new library is explicitly empty and has only file-name columns',()=>{
  const base=newLibrary('Table','Cards');
  assert.deepEqual(libraryMembers(base),[]);
  assert.deepEqual(base.filters.and,['file.ext == "md"',{or:['false']}]);
  assert.deepEqual(base.views.map(v=>v.order),[['file.name'],['file.name']]);
  assert.equal(base.views[1].type,'cards');
});
test('membership round trips quotes, unicode and expression-like filenames without evaluating them',()=>{
  const base=newLibrary('Table','Cards'),paths=['Nested/A.md','中文.md','a" or true == "x.md','slash\\name.md'];
  updateMembers(base,paths,[]);
  assert.deepEqual(libraryMembers(base).sort(),paths.sort());
  updateMembers(base,[],paths);
  assert.deepEqual(base.filters.and[1].or,['false']);
});
test('membership deltas preserve concurrent additions, view filters and custom settings',()=>{
  const base=newLibrary('Table','Cards');
  base.filters.and.push('note.done != true');base.views[0].filters='note.priority > 2';base.formulas={count:'1+1'};
  updateMembers(base,['A.md'],[]);
  updateMembers(base,['Concurrent.md'],[]);
  updateMembers(base,['B.md'],['A.md']);
  assert.deepEqual(libraryMembers(base),['B.md','Concurrent.md']);
  assert.equal(base.filters.and[2],'note.done != true');assert.equal(base.views[0].filters,'note.priority > 2');
  assert.deepEqual(base.formulas,{count:'1+1'});
});
test('ordinary bases and externally replaced membership filters are never rewritten',()=>{
  for(const mutate of [
    b=>delete b['nebula-focus'],
    b=>b.filters='true',
    b=>b.filters.and[1].or.push('file.inFolder("Everything")'),
    b=>b.filters.and[1].or.push('file.path == nope'),
    b=>b.filters.and[1].not=['true'],
  ]){
    const base=newLibrary('Table','Cards');mutate(base);const before=JSON.stringify(base);
    assert.throws(()=>updateMembers(base,['A.md'],[]));
    assert.equal(JSON.stringify(base),before);
  }
});
test('file and folder renames update only exact members and preserve other scopes',()=>{
  const base=newLibrary('Table','Cards');
  updateMembers(base,['Folder/A.md','Folder/Sub/B.md','Folder sibling/C.md','Other.md'],[]);
  assert.equal(renameMembers(base,'Folder','Moved'),true);
  assert.deepEqual(libraryMembers(base),['Folder sibling/C.md','Moved/A.md','Moved/Sub/B.md','Other.md']);
  assert.equal(renameMembers(base,'Missing.md','Else.md'),false);
  renameMembers(base,'Other.md','Other.txt');
  assert(!libraryMembers(base).includes('Other.md'));
});
test('adding a column changes view configuration only and refuses malformed or reserved names',()=>{
  const base=newLibrary('Table','Cards');updateMembers(base,['A.md'],[]);
  addLibraryField(base,' 阅读状态 ');addLibraryField(base,'阅读状态');
  assert.deepEqual(base.views.map(v=>v.order),[['file.name','note.阅读状态'],['file.name','note.阅读状态']]);
  assert.deepEqual(libraryMembers(base),['A.md']);
  for(const field of ['','__proto__','constructor','file.name','bad\nname'])assert.throws(()=>addLibraryField(base,field));
});
test('default writing uses one native editor, no legacy surface and no note writes',async()=>{
  const h=await boot();try{
    assert.equal(h.leaf.view.getMode(),'source');
    assert.equal(h.leaf.view.getState().source,false);
    assert(h.doc.querySelector('.nf-writing'));
    assert.equal(h.doc.querySelector('.nf-page'),null);
    assert.equal(h.doc.querySelector('[aria-label="页面外观"]'),null);
    assert.deepEqual(h.vault.writes,[]);
    await h.plugin.toggleEditing(h.leaf.view);
    h.app.workspace.trigger('file-open',h.leaf.view.file);
    await delay(80);
    assert.equal(h.leaf.view.getState().source,true);assert(!h.doc.querySelector('.nf-writing'));
    assert.equal(h.doc.querySelector('.nf-bar-right button').textContent,'返回写作');
    await h.plugin.toggleEditing(h.leaf.view);
    assert.equal(h.leaf.view.getState().source,false);assert(h.doc.querySelector('.nf-writing'));
    assert.deepEqual(h.vault.writes,[]);
  }finally{h.close();}
});
test('creating, collecting, adding fields and removing membership never writes Markdown',async()=>{
  const h=await boot();try{
    const originals=h.vault.getMarkdownFiles().map(f=>f.text),l=h.plugin.libraries;
    const a=await l.create('Research'),b=await l.create('Writing');
    await l.changeMembers(a,['A.md'],[]);await l.changeMembers(b,['A.md'],[]);
    await l.addField(a,'Status');await l.changeMembers(a,[],['A.md']);
    assert.deepEqual(Array.from(await l.members(a)),[]);assert.deepEqual(Array.from(await l.members(b)),['A.md']);
    assert.deepEqual(h.vault.getMarkdownFiles().map(f=>f.text),originals);
    assert(h.vault.writes.every(path=>path.endsWith('.base')));
    await h.plugin.openFile(b);await delay(15);
    assert(h.doc.querySelector('.nf-library-managed'));assert(h.doc.querySelector('[aria-label="收录笔记"]'));
    await h.plugin.openFile(h.vault.getAbstractFileByPath('A.md'));await delay(70);
    assert.equal(h.doc.querySelectorAll('.nf-library-managed').length,0);assert(h.doc.querySelector('.nf-writing'));
  }finally{h.close();}
});
test('a failed/missing selection preserves the base and note data',async()=>{
  const h=await boot();try{
    const base=await h.plugin.libraries.create('Library'),source=base.text;
    await assert.rejects(h.plugin.libraries.changeMembers(base,['Missing.md'],[]));
    assert.equal(base.text,source);
    base.text='{"views":[]}';await assert.rejects(h.plugin.libraries.changeMembers(base,['A.md'],[]));
    assert.equal(base.text,'{"views":[]}');
    assert.equal(h.vault.getAbstractFileByPath('A.md').text,'### Title\n\nPlain text');
  }finally{h.close();}
});
test('native delayed saves and immediate navigation cannot revert membership updates',async()=>{
  const h=await boot();try{
    const l=h.plugin.libraries,base=await l.create('Library');
    await l.changeMembers(base,['A.md'],[]);
    await h.plugin.openFile(base);await delay(10);
    const view=h.leaf.view,native=JSON.parse(view.getViewData());
    native.views[0].name='Renamed in Obsidian';view.memory=JSON.stringify(native);
    await Promise.all([l.changeMembers(base,['B.md'],[]),l.addField(base,'Status')]);
    assert.equal(view.data,base.text);assert.equal(view.getViewData(),base.text);
    await h.plugin.openFile(h.vault.getAbstractFileByPath('B.md'));
    assert.deepEqual(Array.from(await l.members(base)),['A.md','B.md']);
    const saved=JSON.parse(base.text);
    assert.equal(saved.views[0].name,'Renamed in Obsidian');
    assert(saved.views[0].order.includes('note.Status'));
  }finally{h.close();}
});
test('a failed base write leaves the native editor cache intact',async()=>{
  const h=await boot();try{
    const l=h.plugin.libraries,base=await l.create('Library');
    await h.plugin.openFile(base);const view=h.leaf.view,original=view.getViewData();
    h.vault.process=async()=>{throw Error('disk full');};
    await assert.rejects(l.changeMembers(base,['A.md'],[]));
    assert.equal(base.text,original);assert.equal(view.getViewData(),original);assert.equal(view.data,original);
  }finally{h.close();}
});
test('closing an async library dialog and unloading removes late UI and stops later writes',async()=>{
  const h=await boot();try{
    const base=await h.plugin.libraries.create('Library');
    h.plugin.libraries.editMembers(base);
    h.plugin.cleanup();await delay(20);
    assert.equal(h.doc.querySelector('.nf-members-dialog'),null);
    assert.equal(h.doc.querySelector('.nf-managed'),null);
    await assert.rejects(h.plugin.libraries.addField(base,'Status'));
  }finally{h.doc.defaultView.close();}
});
