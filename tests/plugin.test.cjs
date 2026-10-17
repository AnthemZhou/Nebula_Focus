const {test} = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const {createHost} = require('./host.cjs');
const {transformSync} = require('esbuild');
const modelCode = transformSync(readFileSync('src/model.ts','utf8'),{loader:'ts',format:'cjs'}).code;
const model = {exports:{}}; new Function('module','exports',modelCode)(model,model.exports);
const delay = ms => new Promise(resolve => setTimeout(resolve,ms));
async function boot(seed) {
  const dom = new JSDOM('<!doctype html><body class="is-mobile"><div class="workspace"></div><div class="mobile-navbar">Native</div></body>',{url:'https://fixture.invalid/',pretendToBeVisual:true});
  const host = createHost(dom.window,{renderMarkdown:text=>new (require('markdown-it'))({html:true}).render(text),...seed}); const module={exports:{}};
  const context=vm.createContext({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,MutationObserver:dom.window.MutationObserver,console,module,exports:module.exports,require:name=>{assert.equal(name,'obsidian');return host.api;}});
  new vm.Script(readFileSync('main.js','utf8')).runInContext(context);
  const plugin=new module.exports.default(); await plugin.onload(); await delay(90);
  return {...host,plugin,doc:dom.window.document,close(){plugin.cleanup();dom.window.close();}};
}
test('opening and reading do not modify any note; edit/done are explicit', async()=>{
  const h=await boot();try {
    const original=h.vault.getMarkdownFiles().map(f=>f.text);
    assert.equal(h.leaf.view.getMode(),'preview');
    assert.equal(h.doc.querySelectorAll('.nf-bar').length,1);
    assert(h.doc.body.classList.contains('nf-reading'));
    await h.plugin.toggleEditing(h.leaf.view);assert.equal(h.leaf.view.getMode(),'source');assert(!h.doc.body.classList.contains('nf-reading'));
    await h.plugin.toggleEditing(h.leaf.view);assert.equal(h.leaf.view.getMode(),'preview');
    assert.deepEqual(h.vault.getMarkdownFiles().map(f=>f.text),original);assert.deepEqual(h.vault.writes,[]);
  }finally{h.close();}
});
test('pause and unload restore every native control gate and remove observers/UI',async()=>{
  const h=await boot();
  h.plugin.setPaused(true);assert(!h.doc.body.classList.contains('nf-active'));assert.equal(h.doc.querySelectorAll('.nf-bar').length,0);assert(h.doc.querySelector('.nf-resume'));
  h.doc.querySelector('.nf-resume').click();assert(h.doc.querySelector('.nf-bar'));assert(!h.doc.querySelector('.nf-resume'));
  h.plugin.openNavigator();h.plugin.cleanup();
  assert.equal(h.doc.querySelectorAll('.nf-bar,.nf-resume,.nf-managed,.nf-navigator').length,0);
  assert(!h.doc.body.className.includes('nf-')); h.close();
});
test('desktop and non-Markdown views retain native interface',async()=>{
  const desktop=await boot({mobile:false});try{assert.equal(desktop.doc.querySelectorAll('.nf-bar').length,0);assert.equal(desktop.leaf.view.getMode(),'source');}finally{desktop.close();}
  const h=await boot();try{h.setView('bases');assert(!h.doc.body.classList.contains('nf-quiet'));assert(!h.doc.body.classList.contains('nf-reading'));}finally{h.close();}
});
test('navigator opens without focusing input; supports searching, folders and opening notes',async()=>{
  const h=await boot();try {
    h.plugin.openNavigator();await delay(20);assert.notEqual(h.doc.activeElement?.tagName,'INPUT');
    const input=h.doc.querySelector('.nf-search');input.value='制作';input.dispatchEvent(new h.doc.defaultView.Event('input'));
    assert.equal(h.doc.querySelectorAll('.nf-file-row').length,1);h.doc.querySelector('.nf-file-row').click();await delay(80);
    assert.equal(h.leaf.view.file.path,'项目/制作笔记.md');assert.equal(h.leaf.view.getMode(),'preview');assert.equal(h.vault.writes.length,0);
  }finally{h.close();}
});
test('rapid file changes and explicit new-note editing are not overridden',async()=>{
  const h=await boot();try{
    const files=h.vault.getMarkdownFiles();await h.plugin.openFile(files[1]);await h.plugin.openFile(files[2],true);await delay(120);
    assert.equal(h.leaf.view.file.path,files[2].path);assert.equal(h.leaf.view.getMode(),'source');
  }finally{h.close();}
});
test('renaming the configured home tracks the link; no homepage created',async()=>{
  const h=await boot({settings:{homePath:'Home.md'}});try{
    const home=h.vault.getAbstractFileByPath('Home.md');home.path='Start.md';h.app.vault.trigger('rename',home,'Home.md');await delay(10);
    assert.equal(h.plugin.settings.homePath,'Start.md');assert.equal(h.vault.writes.length,0);
  }finally{h.close();}
});
test('restored settings are validated and path traversal is rejected',()=>{
  const {readSettings,childPath,matchesQuery}=model.exports;
  assert.equal(readSettings({mobileOnly:'false'}).mobileOnly,true);
  for(const name of ['../secret','a/b','a\\b','.hidden','..','hello.','a:note'])assert.throws(()=>childPath('项目',name,true));
  assert.equal(childPath('项目','新笔记',true),'项目/新笔记.md');assert.equal(childPath('','Note.md',true),'Note.md');
  assert(matchesQuery('项目/Video １２.md','video 12'));
});
test('portable page reads without writes; direct section edit saves on Done',async()=>{
 const h=await boot({files:{'Home.md':'---\nnf-title: "我的项目"\nnf-columns: 2\nnf-ratio: 35\n---\n## 项目\n\nOld\n\n## 灵感\n\nKeep\n'}});
 try {
  assert.equal(h.doc.querySelector('.nf-page-heading h1').textContent,'我的项目');assert.equal(h.doc.querySelector('.nf-section-grid').dataset.columns,'2');assert.equal(h.vault.writes.length,0);
  h.doc.querySelector('.nf-section-body p').click();const editor=h.doc.querySelector('.nf-block-editor');assert(editor);editor.textContent='New';editor.dispatchEvent(new h.doc.defaultView.Event('input'));
  [...h.doc.querySelectorAll('.nf-edit-controls button')].find(b=>b.getAttribute('aria-label')==='完成').click();await delay(40);
  assert(h.leaf.view.file.text.includes('New'));assert(h.leaf.view.file.text.endsWith('## 灵感\n\nKeep\n'));assert(h.leaf.view.file.text.includes('nf-ratio: 35'));assert.equal(h.doc.querySelectorAll('.nf-block-editor').length,0);
 }finally{h.close();}
});
test('external edits are not overwritten and a recovery draft is retained',async()=>{
 const h=await boot({files:{'Home.md':'## A\n\nOriginal\n'}});try{
  h.doc.querySelector('.nf-section-body p').click();const editor=h.doc.querySelector('.nf-block-editor');editor.textContent='My draft';editor.dispatchEvent(new h.doc.defaultView.Event('input'));
  h.leaf.view.file.text='## A\n\nExternal edit\n';h.vault.trigger('modify',h.leaf.view.file);await delay(10);
  [...h.doc.querySelectorAll('.nf-edit-controls button')].find(b=>b.getAttribute('aria-label')==='完成').click();await delay(30);
  assert.equal(h.leaf.view.file.text,'## A\n\nExternal edit\n');assert(h.doc.querySelector('.nf-block-editor'));assert(h.doc.defaultView.localStorage.getItem('test-vault:nebula-focus-draft:Home.md').includes('My draft'));assert.equal(h.vault.writes.length,0);
 }finally{h.close();}
});
test('preset cover is an actual vault attachment and metadata restores after reopening',async()=>{
 const h=await boot();try{
  h.doc.querySelector('[aria-label="页面外观"]').click();[...h.doc.querySelectorAll('.menu-item')].find(b=>b.textContent==='封面与裁切').click();
  h.doc.querySelector('.nf-cover-presets button').click();await delay(60);
  assert(h.vault.getAllLoadedFiles().some(f=>f.path.endsWith('.svg')));assert(h.leaf.view.file.text.includes('nf-cover:'));assert(h.doc.querySelector('.nf-cover img'));
  const original=h.leaf.view.file.text;h.plugin.setPaused(true);h.plugin.setPaused(false);await delay(60);assert(h.doc.querySelector('.nf-cover img'));assert.equal(h.leaf.view.file.text,original);
 }finally{h.close();}
});
test('section menu reorders content and card links open target without editing',async()=>{
 const h=await boot({files:{'Home.md':'## A\n\nHello\n\n## B\n\n<!-- nf:view=cards -->\n\n- [[Target]]\n','Target.md':'## Target\n\nContent\n'}});try{
  h.doc.querySelector('.nf-drag-handle').click();[...h.doc.querySelectorAll('.menu-item')].find(b=>b.textContent==='下移').click();await delay(40);
  assert(h.leaf.view.file.text.startsWith('## B'));assert.equal(h.doc.querySelectorAll('.nf-card').length,1);h.doc.querySelector('.nf-card').click();await delay(90);assert.equal(h.leaf.view.file.path,'Target.md');assert.equal(h.doc.querySelectorAll('.nf-block-editor').length,0);
 }finally{h.close();}
});
test('pointer drag moves a section and preserves the Markdown content',async()=>{
 const h=await boot({files:{'Home.md':'## A\n\nFirst\n\n## B\n\nSecond\n'}});try{
  const w=h.doc.defaultView,handle=h.doc.querySelector('.nf-drag-handle');h.doc.elementFromPoint=()=>h.doc.querySelectorAll('.nf-section')[1];
  handle.dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,button:0,clientY:100}));h.doc.dispatchEvent(new w.MouseEvent('pointermove',{bubbles:true,clientY:220}));h.doc.dispatchEvent(new w.MouseEvent('pointerup',{bubbles:true,clientY:220}));await delay(40);
  assert.equal(h.leaf.view.file.text,'## B\n\nSecond\n\n## A\n\nFirst\n');assert.equal(h.doc.querySelectorAll('.nf-dragging,.nf-drop-target').length,0);
 }finally{h.close();}
});
test('title input survives a background refresh and refuses conflicting save',async()=>{
 const h=await boot({files:{'Home.md':'## A\n\nOriginal\n'}});try{
  h.doc.querySelector('.nf-page-heading h1').click();const input=h.doc.querySelector('.nf-page-heading .nf-block-editor');input.textContent='Unfinished title';input.dispatchEvent(new h.doc.defaultView.Event('input'));
  h.leaf.view.file.text='## A\n\nExternal\n';h.vault.trigger('modify',h.leaf.view.file);await delay(30);
  assert.equal(h.doc.querySelector('.nf-page-heading .nf-block-editor'),input);assert.equal(input.textContent,'Unfinished title');
  input.dispatchEvent(new h.doc.defaultView.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await delay(30);
  assert.equal(h.leaf.view.file.text,'## A\n\nExternal\n');assert(h.doc.querySelector('.nf-page-heading .nf-block-editor'));assert.equal(h.vault.writes.length,0);
 }finally{h.close();}
});
test('a delayed save cannot clear another page draft or editor state',async()=>{
 const h=await boot({files:{'Home.md':'## A\n\nOriginal\n','Other.md':'## B\n\nOther\n'}});try{
  h.doc.querySelector('.nf-section-body p').click();let input=h.doc.querySelector('.nf-block-editor');input.textContent='Saved A';input.dispatchEvent(new h.doc.defaultView.Event('input'));
  const process=h.vault.process.bind(h.vault);let release;h.vault.process=async(file,fn)=>{await new Promise(r=>release=r);return process(file,fn);};
  [...h.doc.querySelectorAll('.nf-edit-controls button')].find(b=>b.getAttribute('aria-label')==='完成').click();await delay(10);
  await h.plugin.openFile(h.vault.getAbstractFileByPath('Other.md'));await delay(70);
  release();await delay(40);
  assert.equal(h.leaf.view.file.path,'Other.md');assert.equal(h.leaf.view.file.text,'## B\n\nOther\n');assert.equal(h.doc.querySelector('.nf-page-heading h1').textContent,'Other');
  assert.equal(h.vault.getAbstractFileByPath('Home.md').text,'## A\n\nSaved A\n');
 }finally{h.close();}
});
test('code examples do not turn into cards or activate a gallery',async()=>{
 const h=await boot({files:{'Home.md':'## A\n\n<!-- nf:view=cards -->\n\n```md\n- [[Example]]\n```\n\n- [[Real]]\n\n## B\n\n```md\n<!-- nf:view=cards -->\n- [[Example]]\n```\n','Real.md':'## Real\n'}});try{
  assert.equal(h.doc.querySelectorAll('.nf-card').length,1);assert.equal(h.doc.querySelector('.nf-card-label').textContent,'Real');
 }finally{h.close();}
});
test('opening and leaving an unchanged section does not write the note',async()=>{
 const h=await boot({files:{'Home.md':'## A\n\nOriginal\n\n## B\n\nKeep\n'}});try{
  h.doc.querySelector('.nf-section-body p').click();[...h.doc.querySelectorAll('.nf-edit-controls button')].find(b=>b.getAttribute('aria-label')==='完成').click();await delay(30);assert.equal(h.vault.writes.length,0);
 }finally{h.close();}
});
test('a draft-cache cleanup failure does not turn a successful note save into failure',async()=>{
 const h=await boot({files:{'Home.md':'## A\n\nOriginal\n'}});try{
  h.doc.querySelector('.nf-section-body p').click();const input=h.doc.querySelector('.nf-block-editor');input.textContent='Saved';input.dispatchEvent(new h.doc.defaultView.Event('input'));
  const save=h.app.saveLocalStorage;h.app.saveLocalStorage=(key,data)=>{if(data===null)throw Error('Storage blocked');save(key,data);};
  [...h.doc.querySelectorAll('.nf-edit-controls button')].find(b=>b.getAttribute('aria-label')==='完成').click();await delay(30);
  assert.equal(h.leaf.view.file.text,'## A\n\nSaved\n');assert.equal(h.doc.querySelector('.nf-block-editor'),null);assert.equal(h.vault.writes.length,1);
 }finally{h.close();}
});
test('IME confirmation Enter does not submit a title prematurely',async()=>{
 const h=await boot();try{
  h.doc.querySelector('.nf-page-heading h1').click();const input=h.doc.querySelector('.nf-page-heading .nf-block-editor');input.textContent='中文标题';input.dispatchEvent(new h.doc.defaultView.Event('input'));
  input.dispatchEvent(new h.doc.defaultView.KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true}));await delay(20);
  assert.equal(h.vault.writes.length,0);assert.equal(h.doc.querySelector('.nf-page-heading .nf-block-editor'),input);
  input.dispatchEvent(new h.doc.defaultView.KeyboardEvent('keydown',{key:'Enter',isComposing:false,bubbles:true}));await delay(30);assert(h.leaf.view.file.text.includes('nf-title: "中文标题"'));
 }finally{h.close();}
});
test('an appearance dialog opened on one file cannot write to a different file',async()=>{
 const h=await boot({files:{'Home.md':'## A\n','Other.md':'## B\n'}});try{
  h.doc.querySelector('[aria-label="页面外观"]').click();[...h.doc.querySelectorAll('.menu-item')].find(b=>b.textContent==='封面与裁切').click();
  await h.plugin.openFile(h.vault.getAbstractFileByPath('Other.md'));await delay(70);
  [...h.doc.querySelectorAll('.nf-cover-dialog button')].find(b=>b.textContent==='保存裁切位置').click();await delay(20);
  assert.equal(h.vault.writes.length,0);assert.equal(h.leaf.view.file.text,'## B\n');assert(h.doc.querySelector('.nf-cover-dialog'));
 }finally{h.close();}
});
test('an empty note ending at YAML delimiter remains valid after its first inline edit',async()=>{
 const h=await boot({files:{'Home.md':'---\nnf-title: "Empty"\n---'}});try{
  h.doc.querySelector('.nf-empty-block').click();const input=h.doc.querySelector('.nf-block-editor');input.textContent='Content';input.dispatchEvent(new h.doc.defaultView.Event('input'));
  [...h.doc.querySelectorAll('.nf-edit-controls button')].find(b=>b.getAttribute('aria-label')==='完成').click();await delay(30);
  assert.equal(h.leaf.view.file.text,'---\nnf-title: "Empty"\n---\nContent');
 }finally{h.close();}
});
test('horizontal drag can reorder side-by-side sections',async()=>{
 const h=await boot({files:{'Home.md':'---\nnf-columns: 2\n---\n## A\n\nFirst\n\n## B\n\nSecond\n'}});try{
  const w=h.doc.defaultView,handle=h.doc.querySelector('.nf-drag-handle');h.doc.elementFromPoint=()=>h.doc.querySelectorAll('.nf-section')[1];
  handle.dispatchEvent(new w.MouseEvent('pointerdown',{bubbles:true,button:0,clientX:100,clientY:100}));h.doc.dispatchEvent(new w.MouseEvent('pointermove',{bubbles:true,clientX:450,clientY:100}));h.doc.dispatchEvent(new w.MouseEvent('pointerup',{bubbles:true,clientX:450,clientY:100}));await delay(30);
  assert(h.leaf.view.file.text.indexOf('## B')<h.leaf.view.file.text.indexOf('## A'));
 }finally{h.close();}
});
test('switching to native mode preserves a recoverable unsaved section draft',async()=>{
 const h=await boot();try{
  h.doc.querySelector('.nf-section-body p').click();const input=h.doc.querySelector('.nf-block-editor');input.textContent='Unsaved local text';input.dispatchEvent(new h.doc.defaultView.Event('input'));
  await h.plugin.setMode(h.leaf.view,'source');await h.plugin.setMode(h.leaf.view,'preview');await delay(30);
  assert.equal(h.doc.querySelector('.nf-block-editor'),null);assert.equal(h.vault.writes.length,0);assert.equal(h.app.loadLocalStorage('nebula-focus-draft:Home.md').value,'Unsaved local text');
  assert([...h.doc.querySelectorAll('.nf-page-action')].some(b=>b.textContent==='恢复未保存草稿'));
 }finally{h.close();}
});

test('headings and paragraphs edit in their original DOM and preserve neighbouring bytes',async()=>{
 const original='## Heading\n\nA **bold** paragraph with [link](https://example.com).\n\nSecond paragraph\n';
 const h=await boot({files:{'Home.md':original}});try{
  const heading=h.doc.querySelector('.nf-section-body h2'),paragraph=h.doc.querySelector('.nf-section-body p');
  heading.click();assert.equal(h.doc.querySelector('.nf-block-editor'),heading);assert.equal(heading.textContent,'Heading');
  heading.textContent='Changed';heading.dispatchEvent(new h.doc.defaultView.Event('input'));
  paragraph.focus();paragraph.click();await delay(30);
  assert.equal(h.doc.querySelector('.nf-block-editor'),paragraph);assert(paragraph.querySelector('strong'));assert(paragraph.querySelector('a'));
  paragraph.append(' Added');paragraph.dispatchEvent(new h.doc.defaultView.Event('input'));
  h.doc.querySelector('.nf-edit-controls [aria-label="完成"]').click();await delay(30);
  assert.equal(h.doc.querySelector('.nf-section-body p'),paragraph);
  assert.equal(h.leaf.view.file.text,'## Changed\n\nA **bold** paragraph with [link](<https://example.com>)\\. Added\n\nSecond paragraph\n');
 }finally{h.close();}
});
test('clicking another paragraph while blur save is pending opens exactly that paragraph',async()=>{
 const h=await boot({files:{'Home.md':'## Title\n\nOne\n\nTwo\n'}});try{
  const [first,second]=h.doc.querySelectorAll('.nf-section-body p');first.click();first.textContent='Edited';
  const process=h.vault.process.bind(h.vault);let release;h.vault.process=async(f,fn)=>{await new Promise(r=>release=r);return process(f,fn);};
  second.focus();second.click();await delay(5);assert(release);release();await delay(30);
  assert.equal(h.doc.querySelectorAll('[contenteditable=true]').length,1);assert.equal(h.doc.querySelector('.nf-block-editor'),second);
  assert.equal(h.leaf.view.file.text,'## Title\n\nEdited\n\nTwo\n');
 }finally{h.close();}
});
test('Enter splits a heading into an independent paragraph without revealing its marker',async()=>{
 const h=await boot({files:{'Home.md':'### Head tail\n\nKeep\n'}});try{
  const w=h.doc.defaultView,heading=h.doc.querySelector('.nf-section-body h3');heading.click();
  const range=h.doc.createRange();range.setStart(heading.firstChild,4);range.collapse(true);w.getSelection().removeAllRanges();w.getSelection().addRange(range);
  heading.dispatchEvent(new w.InputEvent('beforeinput',{inputType:'insertParagraph',bubbles:true,cancelable:true}));await delay(30);
  assert.equal(h.leaf.view.file.text,'### Head\n\n tail\n\nKeep\n');
  assert.equal(h.doc.querySelector('.nf-block-editor').tagName,'P');assert.equal(h.doc.querySelector('.nf-block-editor').textContent,' tail');
  assert.equal(heading.textContent,'Head');assert.equal(h.doc.querySelectorAll('[contenteditable=true]').length,1);
 }finally{h.close();}
});
test('empty paragraph can be edited again after saving, including a YAML-only note',async()=>{
 const h=await boot({files:{'Home.md':'---\nnf-title: Empty\n---'}});try{
  let el=h.doc.querySelector('.nf-empty-block');el.click();el.textContent='First';h.doc.querySelector('[aria-label="完成"]').click();await delay(20);
  el.click();el.textContent='Second';h.doc.querySelector('[aria-label="完成"]').click();await delay(20);
  assert.equal(h.leaf.view.file.text,'---\nnf-title: Empty\n---\nSecond');
 }finally{h.close();}
});
test('clearing a section heading keeps following duplicate paragraphs mapped to their own source',async()=>{
 const h=await boot({files:{'Home.md':'## First\n\nSame\n\n## Second\n\nSame\n'}});try{
  const heading=h.doc.querySelector('.nf-section-body h2');heading.click();heading.textContent='';h.doc.querySelector('[aria-label="完成"]').click();await delay(30);
  const second=h.doc.querySelectorAll('.nf-section-body p')[1];second.click();second.textContent='Edited second';h.doc.querySelector('[aria-label="完成"]').click();await delay(30);
  assert.equal(h.leaf.view.file.text,'## \n\nSame\n\n## Second\n\nEdited second\n');
 }finally{h.close();}
});
test('clearing a middle section heading rebuilds layout groups before subsequent reordering',async()=>{
 const h=await boot({files:{'Home.md':'## First\n\nOne\n\n## Second\n\nTwo\n\n## Third\n\nThree\n'}});try{
  const heading=h.doc.querySelectorAll('.nf-section-body h2')[1];heading.click();heading.textContent='';h.doc.querySelector('[aria-label="完成"]').click();await delay(30);
  assert.equal(h.doc.querySelectorAll('.nf-section').length,2);
  h.doc.querySelector('.nf-drag-handle').click();[...h.doc.querySelectorAll('.menu-item')].find(b=>b.textContent==='下移').click();await delay(30);
  assert(h.leaf.view.file.text.startsWith('## Third\n'));assert(h.leaf.view.file.text.includes('One\n\n## \n\nTwo'));
 }finally{h.close();}
});
