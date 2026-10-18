const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const {transformSync}=require('esbuild');
const {createHost}=require('./host.cjs');
const drafts={exports:{}};
new Function('module','exports',transformSync(readFileSync('src/drafts.ts','utf8'),{loader:'ts',format:'cjs'}).code)(drafts,drafts.exports);
const {DraftStore}=drafts.exports;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

async function boot(source) {
  const dom=new JSDOM('<!doctype html><body class="is-mobile"><div class="workspace"></div></body>',{url:'https://fixture.invalid/',pretendToBeVisual:true});
  const host=createHost(dom.window,{files:{'Home.md':source},renderMarkdown:text=>new(require('markdown-it'))({html:true}).render(text)}),module={exports:{}};
  const context=vm.createContext({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Node:dom.window.Node,
    NodeFilter:dom.window.NodeFilter,MutationObserver:dom.window.MutationObserver,TextEncoder,console,module,exports:module.exports,
    require:name=>{assert.equal(name,'obsidian');return host.api;}});
  new vm.Script(readFileSync('main.js','utf8')).runInContext(context);
  const plugin=new module.exports.default();await plugin.onload();await delay(90);
  return {...host,plugin,doc:dom.window.document,win:dom.window,
    page:()=>plugin.bars.get(host.leaf.view).page,
    editor:()=>dom.window.document.querySelector('.nf-block-editor[contenteditable="true"]'),
    source:()=>host.leaf.view.file.text,
    drafts:()=>new DraftStore(host.app).list('nebula-focus-draft:Home.md'),
    close(){plugin.cleanup();dom.window.close();}};
}

function caret(h,element,offset) {
  const range=h.doc.createRange(),walker=h.doc.createTreeWalker(element,h.win.NodeFilter.SHOW_TEXT);
  let node,remaining=offset;
  while((node=walker.nextNode())) {
    if(remaining<=node.textContent.length){range.setStart(node,remaining);break;}
    remaining-=node.textContent.length;
  }
  if(!node){range.selectNodeContents(element);range.collapse(false);}
  range.collapse(true);const selection=h.win.getSelection();selection.removeAllRanges();selection.addRange(range);
}

function type(h,element,text,replace=false) {
  element.focus();
  if(replace){const range=h.doc.createRange();range.selectNodeContents(element);h.win.getSelection().removeAllRanges();h.win.getSelection().addRange(range);}
  const before=new h.win.InputEvent('beforeinput',{inputType:'insertText',data:text,bubbles:true,cancelable:true});
  if(!element.dispatchEvent(before))return;
  const range=h.win.getSelection().getRangeAt(0);range.deleteContents();const node=h.doc.createTextNode(text);range.insertNode(node);
  range.setStartAfter(node);range.collapse(true);h.win.getSelection().removeAllRanges();h.win.getSelection().addRange(range);
  element.dispatchEvent(new h.win.InputEvent('input',{inputType:'insertText',data:text,bubbles:true}));
}

function key(h,element,key,options={}) {
  const event=new h.win.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...options});element.dispatchEvent(event);return event;
}

async function done(h) {h.doc.querySelector('.nf-edit-controls [aria-label="完成"]').click();await delay(35);}

test('a cancelled block draft survives another block being edited and saved',async()=>{
  const h=await boot('## Title\n\nOne\n\nTwo\n');try{
    h.doc.querySelector('.nf-section-body p').click();type(h,h.editor(),'Recovery A',true);
    h.doc.querySelector('.nf-edit-controls [aria-label="取消"]').click();await delay(25);
    h.doc.querySelectorAll('.nf-section-body p')[1].click();type(h,h.editor(),'Saved B',true);await done(h);
    assert.equal(h.source(),'## Title\n\nOne\n\nSaved B\n');
    assert(h.drafts().some(d=>d.value==='Recovery A'),'cancelled recovery text was removed by saving another block');
    assert(!h.drafts().some(d=>d.value==='Saved B'),'successful save left its own draft behind');
  }finally{h.close();}
});

test('finishing an unchanged editor displays an external update deferred during editing',async()=>{
  const h=await boot('## Title\n\nOne\n');try{
    h.doc.querySelector('.nf-section-body p').click();
    h.leaf.view.file.text='## Title\n\nExternal update\n';h.vault.trigger('modify',h.leaf.view.file);await delay(20);
    await done(h);
    assert.equal(h.doc.querySelector('.nf-section-body p').textContent,'External update');
    assert.equal(h.editor(),null);assert.equal(h.vault.writes.length,0);
  }finally{h.close();}
});

test('failed multiline paste retains the full replacement and can be retried',async()=>{
  const h=await boot('## Title\n\nLeftRight\n');try{
    const original=h.source();h.doc.querySelector('.nf-section-body p').click();const editor=h.editor();caret(h,editor,4);
    const process=h.vault.process.bind(h.vault);h.vault.process=async()=>{throw Error('Disk unavailable');};
    const paste=new h.win.Event('paste',{bubbles:true,cancelable:true});
    Object.defineProperty(paste,'clipboardData',{value:{getData:()=> 'PASTED FIRST\nPASTED SECOND'}});editor.dispatchEvent(paste);await delay(30);
    assert.equal(h.source(),original);assert(h.editor(),'write failure should leave an editable recovery state');
    const recovery=h.drafts().find(d=>d.kind==='replacement');
    assert(recovery,'structural paste was not retained as a replacement draft');
    for(const part of ['Left','PASTED FIRST','PASTED SECOND','Right'])assert(recovery.value.includes(part),`missing ${part} from failed-paste draft`);
    h.vault.process=process;await done(h);
    assert.match(h.source(),/LeftPASTED FIRST\r?\n\r?\nPASTED SECONDRight/);
    assert(!h.drafts().some(d=>d.id===recovery.id),'successful retry did not clear its matching draft');
  }finally{h.close();}
});

test('Cmd-Z and Ctrl-Z undo local typing without saving, and redo restores it',async()=>{
  for(const modifier of ['metaKey','ctrlKey']){
    const h=await boot('## Title\n\nOne\n');try{
      h.doc.querySelector('.nf-section-body p').click();caret(h,h.editor(),3);type(h,h.editor(),' A');type(h,h.editor(),' B');
      key(h,h.editor(),'z',{[modifier]:true});await delay(20);
      assert(h.editor());assert.notEqual(h.editor().textContent,'One A B');assert(h.editor().textContent.startsWith('One'));
      assert.equal(h.source(),'## Title\n\nOne\n');assert.equal(h.vault.writes.length,0);
      key(h,h.editor(),'z',{[modifier]:true,shiftKey:true});await delay(20);
      assert.equal(h.editor().textContent,'One A B');assert.equal(h.vault.writes.length,0);
    }finally{h.close();}
  }
});

test('committed undo and redo restore source while refusing to overwrite an external edit',async()=>{
  const original='## Title\n\nOne\n\nUntouched  \n';
  const h=await boot(original);try{
    h.doc.querySelector('.nf-section-body p').click();caret(h,h.editor(),3);type(h,h.editor(),' changed');await done(h);
    const changed=h.source();await h.page().undo();await delay(20);assert.equal(h.source(),original);
    await h.page().redo();await delay(20);assert.equal(h.source(),changed);
    const external=changed+'\nExternal addition\n';h.leaf.view.file.text=external;h.vault.trigger('modify',h.leaf.view.file);await delay(20);
    await h.page().undo();await delay(20);assert.equal(h.source(),external);
  }finally{h.close();}
});

test('undoing Enter removes the split while preserving text typed before it',async()=>{
  const h=await boot('## Title\n\nOneTail\n');try{
    h.doc.querySelector('.nf-section-body p').click();caret(h,h.editor(),3);type(h,h.editor(),' added');
    key(h,h.editor(),'Enter');await delay(35);assert.equal(h.source(),'## Title\n\nOne added\n\nTail\n');
    await h.page().undo();await delay(25);assert.equal(h.source(),'## Title\n\nOne addedTail\n');
    assert.equal(h.doc.querySelectorAll('.nf-section-body p').length,1);
  }finally{h.close();}
});

test('Backspace at a paragraph start joins adjacent text and keeps following content intact',async()=>{
  const h=await boot('## Title\n\nOne **bold**\n\nTwo *italic*\n\nUntouched  \n');try{
    h.doc.querySelectorAll('.nf-section-body p')[1].click();caret(h,h.editor(),0);key(h,h.editor(),'Backspace');await delay(35);
    assert.equal(h.source(),'## Title\n\nOne **bold**Two *italic*\n\nUntouched  \n');
    assert.equal(h.editor()?.textContent,'One boldTwo italic');assert(h.editor().querySelector('strong'));assert(h.editor().querySelector('em'));
    const selection=h.win.getSelection(),prefix=h.doc.createRange();prefix.selectNodeContents(h.editor());prefix.setEnd(selection.anchorNode,selection.anchorOffset);
    assert.equal(prefix.toString(),'One bold');
  }finally{h.close();}
});

test('boundary arrows move between editable paragraphs without writing the note',async()=>{
  const h=await boot('## Title\n\nOne\n\nTwo\n');try{
    h.doc.querySelector('.nf-section-body p').click();caret(h,h.editor(),3);key(h,h.editor(),'ArrowRight');await delay(25);
    assert.equal(h.editor()?.textContent,'Two');
    const selection=h.win.getSelection();assert.equal(selection.anchorOffset,0);
    key(h,h.editor(),'ArrowLeft');await delay(25);assert.equal(h.editor()?.textContent,'One');assert.equal(h.vault.writes.length,0);
  }finally{h.close();}
});

test('Enter on an empty list item exits the list into a normal paragraph',async()=>{
  const h=await boot('## Title\n\n- Item\n');try{
    h.doc.querySelector('.nf-list-text').click();caret(h,h.editor(),4);key(h,h.editor(),'Enter');await delay(30);
    assert.equal(h.editor()?.textContent,'');assert(h.editor().closest('li'));
    key(h,h.editor(),'Enter');await delay(35);assert.equal(h.editor()?.tagName,'P');assert.equal(h.editor().closest('li'),null);
    type(h,h.editor(),'After list');await done(h);
    assert.match(h.source(),/- Item\n\nAfter list/);assert(!h.source().includes('- \n- '));
  }finally{h.close();}
});

test('block formatting changes only the chosen block and retains its inline formatting',async()=>{
  const forms=[['paragraph','','### '],['h1','# ',''],['h2','## ',''],['h3','### ',''],['bullet','- ',''],['ordered','1. ',''],['task','- [ ] ',''],['quote','> ','']];
  for(const [kind,prefix,initial] of forms){
    const h=await boot(`${initial}Content **bold**\n\nUntouched  \n`);try{
      h.doc.querySelector('.nf-section-body .nf-block').click();
      if(kind==='h2'){
        h.doc.querySelector('.nf-edit-controls [aria-label="文字样式"]').click();
        [...h.doc.querySelectorAll('.menu-item')].find(item=>item.textContent==='二级标题').click();
      }else await h.page().formatBlock(kind);
      await delay(25);
      assert.equal(h.source(),`${prefix}Content **bold**\n\nUntouched  \n`,kind);
      assert(h.doc.querySelector('.nf-section-body strong'),`${kind} discarded bold formatting`);
    }finally{h.close();}
  }
});

test('a retried split resumes editing against the saved source and accepts further typing',async()=>{
  const h=await boot('## Title\n\nLeftRight\n');try{
    h.doc.querySelector('.nf-section-body p').click();caret(h,h.editor(),4);
    const process=h.vault.process.bind(h.vault);h.vault.process=async()=>{throw Error('Disk unavailable');};
    const paste=new h.win.Event('paste',{bubbles:true,cancelable:true});
    Object.defineProperty(paste,'clipboardData',{value:{getData:()=> 'First\nSecond'}});h.editor().dispatchEvent(paste);await delay(25);
    h.vault.process=process;await done(h);
    assert.equal(h.editor()?.textContent,'SecondRight');
    type(h,h.editor(),' continued');await done(h);
    assert.equal(h.source(),'## Title\n\nLeftFirst\n\nSecond continuedRight\n');
    assert.equal(h.drafts().length,0);
  }finally{h.close();}
});

test('Enter on an empty quote exits it and subsequent text is a normal paragraph',async()=>{
  const h=await boot('## Title\n\n> Quote\n');try{
    h.doc.querySelector('blockquote .nf-block').click();caret(h,h.editor(),5);key(h,h.editor(),'Enter');await delay(30);
    assert.equal(h.editor()?.textContent,'');assert(h.editor().closest('blockquote'));
    key(h,h.editor(),'Enter');await delay(30);
    assert.equal(h.editor()?.tagName,'P');assert.equal(h.editor().closest('blockquote'),null);
    type(h,h.editor(),'After quote');await done(h);
    assert.match(h.source(),/^## Title\n\n> Quote\n\nAfter quote\n+$/);
  }finally{h.close();}
});

test('exiting a middle list item preserves the order of both remaining lists',async()=>{
  const h=await boot('## Title\n\n- First\n- Middle\n- Last\n');try{
    h.doc.querySelectorAll('.nf-list-text')[1].click();type(h,h.editor(),'',true);key(h,h.editor(),'Enter');await delay(30);
    assert.equal(h.editor()?.tagName,'P');assert.equal(h.editor().closest('li'),null);
    type(h,h.editor(),'Between');await done(h);
    assert.equal(h.source(),'## Title\n\n- First\n\nBetween\n\n- Last\n');
    const flow=[...h.doc.querySelector('.nf-section-body').children].filter(el=>el.matches('ul,p')).map(el=>el.textContent.trim());
    assert.deepEqual(flow,['First','Between','Last']);
  }finally{h.close();}
});

test('boundary navigation keeps the destination caret after an asynchronous dirty save',async()=>{
  const h=await boot('## Title\n\nOne\n\nTwo\n');try{
    const process=h.vault.process.bind(h.vault);h.vault.process=async(...args)=>{await delay(15);return process(...args);};
    h.doc.querySelector('.nf-section-body p').click();caret(h,h.editor(),3);type(h,h.editor(),'A');key(h,h.editor(),'ArrowRight');await delay(50);
    assert.equal(h.editor()?.textContent,'Two');type(h,h.editor(),'X');assert.equal(h.editor().textContent,'XTwo');
    caret(h,h.editor(),0);key(h,h.editor(),'ArrowLeft');await delay(50);
    assert.equal(h.editor()?.textContent,'OneA');type(h,h.editor(),'Y');assert.equal(h.editor().textContent,'OneAY');await done(h);
    assert.equal(h.source(),'## Title\n\nOneAY\n\nXTwo\n');
  }finally{h.close();}
});

test('clearing a setext heading preserves heading structure and following paragraph bytes',async()=>{
  const h=await boot('Title\n=====\n\nKeep  \n');try{
    h.doc.querySelector('.nf-section-body h1').click();type(h,h.editor(),'',true);await done(h);
    assert.equal(h.source(),'# \n\nKeep  \n');
    const heading=h.doc.querySelector('.nf-section-body h1');assert(heading);assert.equal(heading.textContent,'');
    heading.click();type(h,h.editor(),'Restored');await done(h);
    assert.equal(h.source(),'# Restored\n\nKeep  \n');
  }finally{h.close();}
});
