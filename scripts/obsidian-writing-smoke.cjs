// Actual Mac Obsidian integration: continuous writing + native Bases, isolated vault only.
const {mkdirSync,writeFileSync}=require('node:fs');
const {resolve}=require('node:path');
const c=require('./obsidian-client.cjs')(process.argv[2]);
const results=[],out=resolve('test-results');mkdirSync(out,{recursive:true});
const assert=require('node:assert/strict');
function check(name,run){try{const details=typeof run==='string'?c.evaluate(run):run();results.push({name,passed:true,details});console.log('PASS '+name);}catch(error){results.push({name,passed:false,error:error.stack});console.error('FAIL '+name+': '+error.message);}}
function key(key,code,modifiers=0){const windowsVirtualKeyCode={KeyZ:90,Enter:13,Backspace:8,Tab:9}[code];c.cdp('Input.dispatchKeyEvent',{type:'keyDown',key,code,modifiers,windowsVirtualKeyCode});c.cdp('Input.dispatchKeyEvent',{type:'keyUp',key,code,modifiers,windowsVirtualKeyCode});}
const environment={platform:process.platform,version:c.cli('version'),vault:c.name};
c.cli('dev:debug','on');
try{
 c.cdp('Emulation.setFocusEmulationEnabled',{enabled:true});c.cli('dev:errors','clear');
 c.evaluate(`
 if(app.vault.getName()!==${JSON.stringify(c.name)})throw Error('Wrong vault');
 const p=app.plugins.plugins['nebula-focus'];if(!p)throw Error('Missing plugin');p.settings.legacyPages=false;p.settings.mobileOnly=false;await p.saveSettings(true);p.setPaused(false);
 const root='QA-Writing-'+Date.now();await app.vault.createFolder(root);
 window.__nfWriting={root,p,seq:0,theme:document.body.classList.contains('theme-dark')?'obsidian':'moonstone',
  assert(value,message){if(!value)throw Error(message);},
  async wait(fn){for(let i=0;i<120;i++){if(await fn())return;await new Promise(r=>setTimeout(r,25));}throw Error('Timed out: '+fn);},
  view(){return app.workspace.getMostRecentLeaf().view;},
  async note(text){const file=await app.vault.create(this.root+'/Note-'+(++this.seq)+'.md',text);await this.p.openFile(file);await this.wait(()=>this.view().file===file&&this.view().containerEl.classList.contains('nf-writing')&&this.view().editor.getValue()===text&&this.view().containerEl.querySelector('.cm-content'));await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return file;},
  button(label,parent=document){const e=[...parent.querySelectorAll('button,.menu-item,[role=button]')].find(e=>e.textContent===label||e.getAttribute('aria-label')===label);if(!e)throw Error('Missing button '+label);e.click();return e;},
  close(){for(const m of [...this.p.dialogs])m.close();},
  async base(){await this.p.openFile(this.library);await this.wait(()=>this.view().getViewType()==='bases'&&this.view().containerEl.classList.contains('nf-library-managed'));},
  async saved(){await this.view().save();return app.vault.read(this.view().file);}
 };return {root};`);
 check('normal notes open as one continuous editor without adding frontmatter',String.raw`
 const q=window.__nfWriting,source='### 安静地写下去\n\n第一段。\n\n第二段。\n',file=await q.note(source);
 q.assert(q.view().getState().source===false,'Not Live Preview');q.assert(!q.view().containerEl.querySelector('.nf-page,.nf-edit-controls'),'Legacy editing controls mounted');
 q.assert(await app.vault.read(file)===source,'Opening changed Markdown');
 q.assert(getComputedStyle(q.view().containerEl.querySelector('.metadata-container')).display==='none','Properties visible');
 return {mode:q.view().getState()};`);
 check('heading and inline emphasis retain their geometry when the caret enters them',String.raw`
 const q=window.__nfWriting;await q.note('### 连续书写\n\n这是 **加粗** 和 *斜体*。\n\n末尾');const v=q.view();
 const measure=selector=>{const e=v.containerEl.querySelector(selector),r=e.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,font:getComputedStyle(e).font};};
 v.editor.setCursor({line:4,ch:0});v.editor.focus();await new Promise(r=>setTimeout(r,80));const before=measure('.cm-header-3:not(.cm-formatting)');
 v.editor.setCursor({line:0,ch:6});await new Promise(r=>setTimeout(r,80));const after=measure('.cm-header-3:not(.cm-formatting)');
 q.assert(JSON.stringify(before)===JSON.stringify(after),'Heading moved');const marker=v.containerEl.querySelector('.cm-formatting-header');q.assert(marker&&marker.getBoundingClientRect().width===0,'Heading marker visible');
 v.editor.setCursor({line:4,ch:0});await new Promise(r=>setTimeout(r,50));const boldBefore=measure('.cm-strong:not(.cm-formatting)');
 v.editor.setCursor({line:2,ch:7});await new Promise(r=>setTimeout(r,50));const boldAfter=measure('.cm-strong:not(.cm-formatting)');
 q.assert(JSON.stringify(boldBefore)===JSON.stringify(boldAfter),'Bold text moved');return {before,after};`);
 check('Chinese IME commits inside a heading without a replacement edit box',()=>{
  c.evaluate(String.raw`const q=window.__nfWriting;await q.note('### 标题\n\n正文');q.view().editor.setCursor({line:0,ch:6});q.view().editor.focus();`);
  c.cdp('Input.imeSetComposition',{text:'中文输入',selectionStart:4,selectionEnd:4});c.cdp('Input.insertText',{text:'中文输入'});
  return c.evaluate(String.raw`const q=window.__nfWriting;await q.wait(()=>q.view().editor.getValue().includes('标题中文输入'));const saved=await q.saved();q.assert(saved==='### 标题中文输入\n\n正文','IME damaged Markdown');q.assert(!q.view().containerEl.querySelector('.nf-block-editor'),'Second editor mounted');return {saved};`);
 });
 check('real Enter and Backspace split and rejoin text within the same editor',()=>{
  c.evaluate(String.raw`const q=window.__nfWriting;await q.note('AlphaBeta\n\nTail');q.view().editor.setCursor({line:0,ch:5});q.view().editor.focus();`);
  key('Enter','Enter');c.evaluate(String.raw`const q=window.__nfWriting;await q.wait(()=>q.view().editor.getValue()==='Alpha\nBeta\n\nTail');`);
  key('Backspace','Backspace');return c.evaluate(String.raw`const q=window.__nfWriting;await q.wait(()=>q.view().editor.getValue()==='AlphaBeta\n\nTail');const saved=await q.saved();q.assert(saved==='AlphaBeta\n\nTail','Backspace failed');return {saved};`);
 });
 check('cross-paragraph selection, replacement, undo and redo use native history',()=>{
  c.evaluate(String.raw`const q=window.__nfWriting;await q.note('First\n\nSecond\n\nUntouched');q.view().editor.setSelection({line:0,ch:0},{line:2,ch:6});q.view().editor.focus();`);
  c.cdp('Input.insertText',{text:'替换后的段落'});c.evaluate(String.raw`const q=window.__nfWriting;q.assert(q.view().editor.getValue()==='替换后的段落\n\nUntouched','Cross paragraph replacement failed');`);
  key('z','KeyZ',4);c.evaluate(String.raw`const q=window.__nfWriting;q.assert(q.view().editor.getValue()==='First\n\nSecond\n\nUntouched','Undo failed');`);
  key('Z','KeyZ',12);return c.evaluate(String.raw`const q=window.__nfWriting;const saved=await q.saved();q.assert(saved==='替换后的段落\n\nUntouched','Redo failed: '+JSON.stringify({saved,editor:q.view().editor.getValue()}));return {saved};`);
 });
 check('raw Markdown escape and return preserve body, properties and native selection',String.raw`
 const q=window.__nfWriting,source='---\nowner: me\n---\n### Heading\n\nBody',file=await q.note(source);
 await q.p.toggleEditing(q.view());await new Promise(r=>setTimeout(r,150));q.assert(q.view().getState().source===true&&!q.view().containerEl.classList.contains('nf-writing'),'Raw escape failed');
 await q.p.toggleEditing(q.view());q.assert(q.view().getState().source===false&&q.view().containerEl.classList.contains('nf-writing'),'Return failed');q.assert(await app.vault.read(file)===source,'Toggle wrote content');
 q.button('更多',q.view().containerEl);await q.wait(()=>document.querySelector('.menu'));q.button('显示笔记属性',document.querySelector('.menu'));await q.wait(()=>q.view().containerEl.classList.contains('nf-show-properties')&&!document.querySelector('.menu'));q.assert(getComputedStyle(q.view().containerEl.querySelector('.metadata-container')).display!=='none','Explicit properties unavailable');
 q.button('更多',q.view().containerEl);await q.wait(()=>document.querySelector('.menu'));q.button('显示笔记属性',document.querySelector('.menu'));await q.wait(()=>!q.view().containerEl.classList.contains('nf-show-properties')&&!document.querySelector('.menu'));q.assert(getComputedStyle(q.view().containerEl.querySelector('.metadata-container')).display==='none','Could not hide properties');`);
 check('library creation and adding blank columns leave every collected note unchanged',String.raw`
 const q=window.__nfWriting;q.a=await q.note('### 读书笔记\n\n这篇尚未填写任何属性。');q.b=await q.note('独立的普通文稿。');q.aSource=await app.vault.read(q.a);q.bSource=await app.vault.read(q.b);
 q.library=await q.p.libraries.create(q.root+' Library');q.assert((await q.p.libraries.members(q.library)).length===0,'New library not empty');
 await q.p.libraries.changeMembers(q.library,[q.a.path],[]);await q.p.libraries.addField(q.library,'阅读状态');
 q.assert(await app.vault.read(q.a)===q.aSource&&await app.vault.read(q.b)===q.bSource,'Collected notes were rewritten');await q.base();
 await q.wait(()=>document.querySelector('.bases-tbody [data-property="note.阅读状态"]'));
 q.assert(document.querySelectorAll('.bases-tbody .bases-tr').length===1,'Library leaked unrelated notes');
 q.assert(getComputedStyle(document.querySelector('.bases-toolbar-new-item-menu')).display==='none','Native New not replaced');
 return {base:await app.vault.read(q.library),note:await app.vault.read(q.a)};`);
 check('focusing and leaving an empty native property cell adds no frontmatter',String.raw`
 const q=window.__nfWriting,cell=document.querySelector('.bases-tbody [data-property="note.阅读状态"] [contenteditable]');cell.focus();document.querySelector('.nf-bar button').focus();await new Promise(r=>setTimeout(r,400));
 q.assert(await app.vault.read(q.a)===q.aSource,'Empty focus/blur created metadata');`);
 check('typing a native table value writes only that note property',()=>{
  c.evaluate(String.raw`const cell=document.querySelector('.bases-tbody [data-property="note.阅读状态"] [contenteditable]');cell.focus();`);
  c.cdp('Input.insertText',{text:'在读'});key('Tab','Tab');
  return c.evaluate(String.raw`const q=window.__nfWriting;await q.wait(async()=> (await app.vault.read(q.a)).includes('阅读状态: 在读'));q.assert(await app.vault.read(q.b)===q.bSource,'Uncollected note changed');q.assert((await app.vault.read(q.a)).endsWith(q.aSource),'Body changed');return {note:await app.vault.read(q.a)};`);
 });
 check('native view configuration keeps membership and optional columns interoperable',String.raw`
 const q=window.__nfWriting;document.querySelector('.bases-toolbar-views-menu [role=button]').click();
 const row=[...document.querySelectorAll('.bases-toolbar-menu-item')].find(e=>e.querySelector('.bases-toolbar-menu-item-name')?.textContent==='列表');row.querySelector('.bases-toolbar-menu-item-icon').click();
 const input=document.querySelector('.view-config-menu input');input.focus();input.value='我的列表';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));input.blur();
 document.querySelector('.bases-toolbar-menu .close-icon').click();await q.wait(async()=> (await app.vault.read(q.library)).includes('我的列表'));
 q.assert((await q.p.libraries.members(q.library))[0]===q.a.path,'Native save removed membership');await q.p.libraries.addField(q.library,'评分');
 q.assert(!(await app.vault.read(q.a)).includes('评分:'),'New column added a blank property');return {base:await app.vault.read(q.library)};`);
 check('native card view shows the same collected note and opens continuous writing',()=>{
 const position=c.evaluate(String.raw`
 const q=window.__nfWriting;await q.base();await q.wait(()=>document.querySelector('.bases-toolbar-views-menu [role=button]'));document.querySelector('.bases-toolbar-views-menu [role=button]').click();
 const row=[...document.querySelectorAll('.bases-toolbar-menu-item')].find(e=>e.querySelector('.bases-toolbar-menu-item-name')?.textContent==='卡片');row.querySelector('.bases-toolbar-menu-item-info').click();
 await q.wait(()=>document.querySelector('.bases-view[data-view-type="cards"]'));
 await q.wait(()=>document.querySelector('.bases-view').textContent.includes(q.a.basename));
 const card=[...document.querySelectorAll('.bases-cards-item')].find(e=>e.querySelector('[data-property="file.name"] .bases-cards-line')?.textContent===q.a.basename);q.assert(card,'Missing card');const r=card.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+20};`);
 c.cdp('Input.dispatchMouseEvent',{type:'mousePressed',...position,button:'left',clickCount:1});
 c.cdp('Input.dispatchMouseEvent',{type:'mouseReleased',...position,button:'left',clickCount:1});
 return c.evaluate(String.raw`const q=window.__nfWriting;await q.wait(()=>q.view().file===q.a&&q.view().containerEl.classList.contains('nf-writing')&&q.view().containerEl.querySelector('.metadata-container'));
 q.assert(getComputedStyle(q.view().containerEl.querySelector('.metadata-container')).display==='none','Writing exposes property panel');`);
 });
 check('membership picker saves selection deltas and removing a note preserves its property',String.raw`
 const q=window.__nfWriting,saved=await app.vault.read(q.a);q.p.libraries.editMembers(q.library);await q.wait(()=>document.querySelector('.nf-member-row'));
 const row=[...document.querySelectorAll('.nf-member-row')].find(e=>e.textContent===q.a.path.replace(/\.md$/,''));q.assert(row,'Missing selected note');const checkbox=row.querySelector('input');checkbox.checked=false;checkbox.dispatchEvent(new Event('change',{bubbles:true}));q.button('保存收录');
 await q.wait(()=>!document.querySelector('.nf-members-dialog'));q.assert((await q.p.libraries.members(q.library)).length===0,'Removal failed');q.assert(await app.vault.read(q.a)===saved,'Removal erased note/metadata');
 await q.base();await q.wait(()=>document.querySelector('.bases-toolbar-result-count')?.textContent.includes('0'));`);
 check('one note can join multiple libraries with no additional metadata',String.raw`
 const q=window.__nfWriting,saved=await app.vault.read(q.a);q.second=await q.p.libraries.create(q.root+' Second');
 await q.p.libraries.changeMembers(q.library,[q.a.path],[]);await q.p.libraries.changeMembers(q.second,[q.a.path],[]);
 q.assert((await q.p.libraries.members(q.second))[0]===q.a.path,'Second membership failed');q.assert(await app.vault.read(q.a)===saved,'Recollection changed note');`);
 check('renaming a collected note updates both library references without changing content',String.raw`
 const q=window.__nfWriting,saved=await app.vault.read(q.a),newPath=q.root+'/Renamed.md';await app.fileManager.renameFile(q.a,newPath);
 await q.wait(async()=> (await q.p.libraries.members(q.library)).includes(newPath)&&(await q.p.libraries.members(q.second)).includes(newPath));q.assert(await app.vault.read(q.a)===saved,'Rename changed content');return {members:await q.p.libraries.members(q.library)};`);
 check('new library note is blank and collected before it opens for writing',String.raw`
 const q=window.__nfWriting;q.p.libraries.askNewNote(q.library);const modal=document.querySelector('.nf-dialog');const input=modal.querySelector('input[type=text]');input.value=q.root+' New';modal.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
 await q.wait(()=>q.view().file?.basename===q.root+' New'&&q.view().containerEl.classList.contains('nf-writing'));q.created=q.view().file;
 q.assert(await app.vault.read(q.created)==='','New note has template/metadata');q.assert((await q.p.libraries.members(q.library)).includes(q.created.path),'New note not collected');`);
 check('ordinary native bases remain openable and retain their own New control',String.raw`
 const q=window.__nfWriting,file=await app.vault.create(q.root+'/Native.base','filters: false\nviews:\n  - type: table\n    name: Native\n');await q.p.openFile(file);await q.wait(()=>q.view().getViewType()==='bases');
 q.assert(!q.view().containerEl.classList.contains('nf-library-managed'),'Ordinary base was treated as managed');q.assert(getComputedStyle(document.querySelector('.bases-toolbar-new-item-menu')).display!=='none','Native base New hidden');`);
 check('pause and resume remove custom controls and keep the native editor contents',String.raw`
 const q=window.__nfWriting;await q.p.openFile(q.a);await q.wait(()=>q.view().containerEl.classList.contains('nf-writing'));const saved=await app.vault.read(q.a);
 q.p.setPaused(true);q.assert(!document.querySelector('.nf-managed,.nf-writing,.nf-library-managed'),'Paused controls remain');q.p.setPaused(false);q.assert(q.view().containerEl.classList.contains('nf-writing'),'Resume failed');q.assert(await app.vault.read(q.a)===saved,'Pause wrote Markdown');`);
 for(const theme of ['moonstone','obsidian'])for(const width of [320,393,1024]){
  check(`real app ${theme} ${width}px writing and library layout`,()=>{
   c.cdp('Emulation.setDeviceMetricsOverride',{width,height:852,deviceScaleFactor:1,mobile:false});
   c.evaluate(`const q=window.__nfWriting;app.changeTheme('${theme}');app.updateTheme();q.close();await q.p.openFile(q.a);await q.wait(()=>q.view().containerEl.classList.contains('nf-writing'));`);
   const writing=c.evaluate(String.raw`const q=window.__nfWriting,v=q.view(),r=v.containerEl.getBoundingClientRect(),bar=v.containerEl.querySelector('.nf-bar');
    for(const b of bar.querySelectorAll('button'))if(getComputedStyle(b).display!=='none'){const bRect=b.getBoundingClientRect();q.assert(bRect.left>=r.left-1&&bRect.right<=r.right+1,'Toolbar action clipped');}
    const content=v.containerEl.querySelector('.cm-content');q.assert(content.getBoundingClientRect().width>100,'Writing column collapsed');q.assert(!v.containerEl.querySelector('.nf-page'),'Legacy surface visible');return {pane:r.width,column:content.getBoundingClientRect().width};`);
   c.cli('dev:screenshot',`path=${out}/writing-0.9.0-${theme}-${width}.png`);
   c.evaluate('const q=window.__nfWriting;await q.base();');
   const library=c.evaluate(String.raw`const q=window.__nfWriting,v=q.view(),r=v.containerEl.getBoundingClientRect();for(const b of v.containerEl.querySelectorAll('.nf-bar button')){const bRect=b.getBoundingClientRect();q.assert(bRect.left>=r.left-1&&bRect.right<=r.right+1,'Library action clipped');}return {pane:r.width};`);
   c.cli('dev:screenshot',`path=${out}/library-0.9.0-${theme}-${width}.png`);return {writing,library};
  });
 }
 check('new interface produces no captured runtime errors',()=>{const errors=c.cli('dev:errors');assert(/No errors captured|^\[\]$|^$/.test(errors),errors);return {errors};});
}finally{
 try{c.evaluate('const q=window.__nfWriting;if(q){q.close();app.changeTheme(q.theme);app.updateTheme();await q.p.openHome();}');}catch{}
 c.cdp('Emulation.clearDeviceMetricsOverride');c.cdp('Emulation.setFocusEmulationEnabled',{enabled:false});c.cli('dev:debug','off');
 writeFileSync(out+'/obsidian-writing-smoke.json',JSON.stringify({environment,transportWarnings:c.warnings,results},null,2));
}
console.log(`${results.filter(r=>r.passed).length}/${results.length} passed`);if(results.some(r=>!r.passed))process.exitCode=1;
