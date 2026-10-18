// Runs against the actual Obsidian app, never the simulated host.
// Usage: node scripts/obsidian-editor-smoke.cjs /absolute/path/from/prepare-test-vault
const {execFileSync} = require('node:child_process');
const {readFileSync, writeFileSync, mkdirSync, realpathSync} = require('node:fs');
const {basename, join, resolve} = require('node:path');
const assert = require('node:assert/strict');
const vault = realpathSync(process.argv[2] || '');
assert.match(basename(vault), /^Nebula-Focus-/);
assert.equal(JSON.parse(readFileSync(join(vault, '.nebula-focus-test-vault'))).plugin, 'nebula-focus');
const executable = process.env.OBSIDIAN_CLI || '/Applications/Obsidian.app/Contents/MacOS/obsidian-cli';
const outputDir = resolve('test-results');
mkdirSync(outputDir, {recursive:true});
const results = [];
const transportWarnings = [];
const filter = process.argv.find(arg=>arg.startsWith('--only='))?.slice(7);
function cli(...args) {
  try{return execFileSync(executable, [`vault=${basename(vault)}`, ...args], {encoding:'utf8', timeout:15000, killSignal:'SIGKILL'}).trim();}
  catch(error){
    // Some CLI children print the complete app response but fail to exit on macOS.
    // Accept only a complete structured evaluation/CDP response or a screenshot path; never retry a write.
    const out=String(error.stdout || '').trim();
    let cdpResponse=false;try{cdpResponse=args[0]==='dev:cdp' && typeof JSON.parse(out)==='object';}catch{}
    if(error.code==='ETIMEDOUT' && (cdpResponse || (args[0]==='eval' && out.split('\n').some(line=>line.startsWith('=> '))) || (args[0]==='dev:screenshot' && out===args[1]?.slice(5)))){
      transportWarnings.push({command:args[0],reason:'CLI child timed out after returning its response'});return out;
    }
    throw error;
  }
}
function evaluate(code) {
  // Obsidian expands literal \\n in CLI arguments, including JavaScript strings.
  // Encode the complete program so Markdown fixtures keep their exact bytes.
  const program = `(async()=>{try{return JSON.stringify({ok:true,value:await(async()=>{${code}})()})}catch(e){return JSON.stringify({ok:false,error:e.stack||String(e)})}})()`;
  const encoded = Buffer.from(program).toString('base64');
  const result = cli('eval', `code=eval(new TextDecoder().decode(Uint8Array.from(atob('${encoded}'),c=>c.charCodeAt(0))))`);
  const line = result.split('\n').find(line => line.startsWith('=> '));
  if (!line) throw Error(result);
  const data = JSON.parse(line.slice(3));
  if (!data.ok) throw Error(data.error);
  return data.value;
}
function check(name, code) {
  if(filter && !name.includes(filter))return;
  try { const details=evaluate(code); results.push({name,passed:true,details}); console.log(`PASS ${name}`); }
  catch(error) { results.push({name,passed:false,error:error.message}); console.error(`FAIL ${name}: ${error.message}`); }
}
const environment = {platform:process.platform, version:cli('version'), vault:basename(vault)};
cli('dev:debug', 'on');
// The CLI can run while Codex owns OS focus. Chromium otherwise suppresses blur events.
// Emulate renderer focus during automation; always restore it and detach the debugger.
try {
cli('dev:cdp', 'method=Emulation.setFocusEmulationEnabled', 'params={"enabled":true}');
cli('dev:errors', 'clear');
evaluate(String.raw`
  if(app.vault.getName()!==${JSON.stringify(basename(vault))})throw Error('Wrong vault');
  const p=app.plugins.plugins['nebula-focus'];if(!p)throw Error('Plugin must be enabled');
  const root='QA-Editor-'+Date.now();await app.vault.createFolder(root);
  window.__nfEditorQA={root,p,seq:0,
    assert(value,message){if(!value)throw Error(message);},
    async wait(fn){for(let n=0;n<100;n++){if(fn())return;await new Promise(r=>setTimeout(r,30));}throw Error('Timed out: '+fn);},
    input(el,value){if(el.hasAttribute('contenteditable'))el.textContent=value;else el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},
    button(text,parent=document){const el=[...parent.querySelectorAll('button')].find(b=>b.textContent===text || b.getAttribute('aria-label')===text);if(!el)throw Error('Missing button '+text);el.click();},
    async note(text){
      const q=window.__nfEditorQA;for(const bar of q.p.bars.values())for(const modal of bar.page.modals)modal.close();q.p.setPaused(false);
      const file=await app.vault.create(q.root+'/Case-'+(++q.seq)+'.md',text);
      await q.p.openFile(file);await q.wait(()=>q.view()?.file===file&&q.controller()?.file===file&&q.controller()?.source===text&&q.page()?.querySelector('.nf-page-tail'));
      return file;
    },
    view(){return app.workspace.getMostRecentLeaf()?.view;},
    page(){return this.view()?.containerEl.querySelector('.nf-page');},
    controller(){return this.p.bars.get(this.view())?.page;},
    async done(){this.button('完成',this.view().containerEl);await this.wait(()=>this.page().querySelector('.nf-page-tail')&&!this.page().querySelector('.nf-block-editor'));},
    async cancel(){this.button('取消',this.view().containerEl);await this.wait(()=>this.page().querySelector('.nf-page-tail')&&!this.page().querySelector('.nf-block-editor'));},
    leaves(){return [...this.page().querySelectorAll('.nf-section-body .nf-block')];},
    active(){return this.page()?.querySelector('[contenteditable=true]');},
    async edit(text){const el=this.leaves().find(node=>node.textContent.trim()===text.trim());this.assert(el,'Missing leaf '+text+'; available: '+JSON.stringify(this.leaves().map(node=>({tag:node.tagName,text:node.textContent})))+'; list HTML: '+(this.page().querySelector('ul,ol')?.outerHTML||'none'));el.click();await this.wait(()=>this.active()===el);return el;},
    caret(el,offset=0){const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node,left=offset;const range=document.createRange();while(node=walker.nextNode()){if(left<=node.textContent.length){range.setStart(node,left);break;}left-=node.textContent.length;}if(!node){range.selectNodeContents(el);range.collapse(false);}range.collapse(true);getSelection().removeAllRanges();getSelection().addRange(range);},
    key(el,key,options={}){el.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...options}));},
    paste(el,text){const data=new DataTransfer();data.setData('text/plain',text);data.setData('text/html','<b>Clipboard HTML ignored</b>');el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));},
    drafts(file=this.view().file){return this.controller().drafts.list('nebula-focus-draft:'+file.path);},
    closeDialogs(){for(const modal of this.controller().modals)modal.close();}
  };return {root};
`);
check('local typing undo and redo preserve the live block and do not write early',String.raw`
 const q=window.__nfEditorQA,file=await q.note('## Local\n\nOriginal');const el=await q.edit('Original');
 q.input(el,'Changed 中文');q.caret(el,4);await q.controller().undo();q.assert(q.active()===el&&el.textContent==='Original','Undo replaced or lost the live block');
 q.assert(await app.vault.read(file)==='## Local\n\nOriginal','Local undo wrote the note');await q.controller().redo();q.assert(el.textContent==='Changed 中文','Redo lost typing');
 await q.done();q.assert(await app.vault.read(file)==='## Local\n\nChanged 中文','Redone typing not saved');
`);
check('saved edits undo and redo exact original bytes including CRLF',String.raw`
 const q=window.__nfEditorQA,source='---\r\ncustom: untouched\r\n---\r\n## Section\r\n\r\nOriginal\r\n\r\n**Keep**\r\n',file=await q.note(source);
 const el=await q.edit('Original');q.input(el,'Edited');await q.done();const saved=await app.vault.read(file);
 await q.controller().undo();q.assert(await app.vault.read(file)===source,'Undo changed original bytes');await q.controller().redo();q.assert(await app.vault.read(file)===saved,'Redo did not restore saved bytes');
 await q.done();return {lineEndings:'CRLF retained'};
`);
check('Enter split is one reversible source operation with caret restored',String.raw`
 const q=window.__nfEditorQA,source='## Split\n\nAlphaBeta\n\nTail',file=await q.note(source),el=await q.edit('AlphaBeta');q.caret(el,5);q.key(el,'Enter');
 await q.wait(()=>!q.controller().busy&&q.active()?.textContent==='Beta');const split=await app.vault.read(file);q.assert(split==='## Split\n\nAlpha\n\nBeta\n\nTail','Split changed adjacent text');
 await q.controller().undo();q.assert(await app.vault.read(file)===source,'Split undo failed');await q.controller().redo();q.assert(await app.vault.read(file)===split&&q.active()?.textContent==='Beta','Split redo/caret target failed');await q.done();
`);
check('Backspace merges paragraphs without losing formatting and undo restores both',String.raw`
 const q=window.__nfEditorQA,source='## Merge\n\nFirst **bold**\n\nSecond\n\nTail',file=await q.note(source),el=await q.edit('Second');q.caret(el,0);q.key(el,'Backspace');
 await q.wait(()=>!q.controller().busy&&q.active()?.textContent==='First boldSecond');q.assert(q.active().querySelector('strong')?.textContent==='bold','Merge lost bold text');
 q.assert(await app.vault.read(file)==='## Merge\n\nFirst **bold**Second\n\nTail','Merge changed unrelated bytes');await q.controller().undo();q.assert(await app.vault.read(file)===source,'Merge undo failed');await q.done();
`);
check('Delete at a block end merges forward and arrows traverse block boundaries',String.raw`
 const q=window.__nfEditorQA,file=await q.note('One\n\nTwo\n\nThree'),el=await q.edit('One');q.caret(el,3);q.key(el,'Delete');await q.wait(()=>!q.controller().busy&&q.active()?.textContent==='OneTwo');
 q.assert(await app.vault.read(file)==='OneTwo\n\nThree','Forward merge failed');const current=q.active();q.caret(current,current.textContent.length);q.key(current,'ArrowRight');await q.wait(()=>q.active()?.textContent==='Three');
 q.assert(getSelection().anchorOffset===0,'ArrowRight did not enter at start');q.key(q.active(),'ArrowLeft');await q.wait(()=>q.active()?.textContent==='OneTwo');q.assert(getSelection().anchorOffset===6,'ArrowLeft did not enter at end');await q.done();
`);
check('style conversion preserves nearby text and remains directly editable',String.raw`
 const q=window.__nfEditorQA,file=await q.note('Before\n\nTarget\n\nAfter');await q.edit('Target');
 for(const [style,tag,marker]of [['h3','H3','### Target'],['task','SPAN','- [ ] Target'],['quote','P','> Target'],['paragraph','P','Target']]){
  await q.controller().formatBlock(style);q.assert(q.active()?.textContent==='Target','Conversion lost edit target: '+style);q.assert(q.active().tagName===tag,'Wrong rendered type: '+style);
  const text=await app.vault.read(file);q.assert(text.includes(marker)&&text.startsWith('Before\n\n')&&text.endsWith('\n\nAfter'),'Conversion changed surrounding text: '+style);q.assert(!q.active().textContent.includes('#'),'Markdown marker visible');
 }
 const final=await app.vault.read(file);await q.controller().undo();q.assert((await app.vault.read(file)).includes('> Target'),'Format undo failed');await q.controller().redo();q.assert(await app.vault.read(file)===final,'Format redo failed');await q.done();
`);
check('nested children are preserved when unsupported structural conversion is refused',String.raw`
 const q=window.__nfEditorQA,source='- Parent\n  - Child\n- Sibling',file=await q.note(source);await q.edit('Parent');await q.controller().formatBlock('h2');
 q.assert(await app.vault.read(file)===source,'Nested structure was rewritten');q.assert(q.view().containerEl.querySelector('.nf-edit-status').textContent.includes('嵌套'),'Missing explanatory status');await q.cancel();
`);
check('empty list Enter exits to a paragraph and leaves previous items intact',String.raw`
 const q=window.__nfEditorQA,file=await q.note('- Item'),el=await q.edit('Item');q.caret(el,4);q.key(el,'Enter');await q.wait(()=>!q.controller().busy&&q.active()?.textContent==='');
 q.assert(q.active().closest('li'),'Enter did not create a list item');q.key(q.active(),'Enter');await q.wait(()=>!q.controller().busy&&q.active()?.tagName==='P'&&!q.active()?.closest('li'));
 q.input(q.active(),'Outside');await q.done();q.assert(await app.vault.read(file)==='- Item\n\nOutside','List exit source differs');return {source:await app.vault.read(file)};
`);
check('multiple recovery drafts survive unrelated saves and can be deleted separately',String.raw`
 const q=window.__nfEditorQA,file=await q.note('One\n\nTwo\n\nThree');
 q.input(await q.edit('One'),'Draft one');await q.cancel();q.input(await q.edit('Two'),'Draft two');await q.cancel();
 q.input(await q.edit('Three'),'Saved three');await q.done();const drafts=q.drafts(file);q.assert(drafts.length===2,'Unrelated save removed an older draft');
 q.assert(drafts.some(d=>d.value==='Draft one')&&drafts.some(d=>d.value==='Draft two'),'Draft contents differ');q.button('恢复未保存草稿',q.page());
 const dialog=document.querySelector('.nf-drafts-dialog');q.assert(dialog?.querySelectorAll('.nf-draft-item').length===2,'Draft list missing rows');const row=dialog.querySelector('.nf-draft-item'),removed=row.querySelector('textarea').value;q.button('删除这份缓存',row);
 q.assert(q.drafts(file).length===1&&q.drafts(file)[0].value!==removed,'Deleting one draft removed the wrong record');q.assert(await app.vault.read(file)==='One\n\nTwo\n\nSaved three','Recovery UI wrote file content');q.closeDialogs();
`);
check('failed multiline paste keeps the complete intended result and Done retries it',String.raw`
 const q=window.__nfEditorQA,source='LeftRight\n\nKeep',file=await q.note(source),el=await q.edit('LeftRight');q.caret(el,4);
 const process=app.vault.process;let reject=true;
 app.vault.process=async function(target,fn){if(target===file&&reject){reject=false;throw Error('Simulated write failure');}return process.call(this,target,fn);};
 try{
  q.paste(el,'First\nSecond');await q.wait(()=>!q.controller().busy&&q.view().containerEl.querySelector('.nf-edit-status')?.textContent.includes('重试'));
  q.assert(await app.vault.read(file)===source,'Failed paste wrote a partial note');q.assert(q.drafts(file).some(d=>d.kind==='replacement'&&d.value.includes('LeftFirst\n\nSecondRight')),'Clipboard text missing from complete draft');
 }finally{app.vault.process=process;}
 q.button('完成',q.view().containerEl);await q.wait(()=>!q.controller().busy&&q.active()?.textContent==='SecondRight');
 q.assert(await app.vault.read(file)==='LeftFirst\n\nSecondRight\n\nKeep','Retry did not save complete paste');q.assert(!q.drafts(file).some(d=>d.kind==='replacement'),'Successful retry left stale operation draft');await q.done();
`);
check('undo cannot overwrite a concurrent external file edit',String.raw`
 const q=window.__nfEditorQA,file=await q.note('Original');q.input(await q.edit('Original'),'Edited');await q.done();
 await app.vault.modify(file,'External update');await q.controller().update(true);await q.controller().undo();q.assert(await app.vault.read(file)==='External update','Undo overwrote an external update');
`);
check('cleared setext heading remains a heading and an empty-left split is safe',String.raw`
 const q=window.__nfEditorQA,file=await q.note('Title\n=====\n\nTail');q.input(await q.edit('Title'),'');await q.done();
 q.assert(!q.page().querySelector('hr'),'Empty heading became a horizontal rule');q.assert(q.page().querySelector('.nf-section-body h1'),'Empty heading lost its block');
 const empty=q.page().querySelector('.nf-section-body h1');empty.click();await q.wait(()=>q.active()===empty);q.input(empty,'New title');await q.done();q.assert((await app.vault.read(file)).includes('# New title'),'Re-edit did not retain heading');
 const other=await q.note('Title\n=====\n\nTail'),heading=await q.edit('Title');q.caret(heading,0);q.key(heading,'Enter');await q.wait(()=>!q.controller().busy&&q.active()?.textContent==='Title');
 q.assert(q.active().tagName==='P'&&q.page().querySelector('.nf-section-body h1')&&!q.page().querySelector('hr'),'Empty-left setext split corrupted structure');q.assert((await app.vault.read(other)).endsWith('\n\nTail'),'Split changed tail');await q.done();
`);
check('real rendered hard breaks and literal entity labels survive editing and reopening',String.raw`
 const q=window.__nfEditorQA,file=await q.note('## Syntax\n\nLine  \nBreak **bold** &amp;copy;\n\nKeep');
 const el=q.page().querySelector('.nf-section-body p');el.click();await q.wait(()=>q.active()===el);el.append(' extra');el.dispatchEvent(new Event('input',{bubbles:true}));await q.done();
 const saved=await app.vault.read(file);q.assert(saved.includes('Line  \nBreak **bold**'),'Hard break or bold changed');await q.note('Other');await q.p.openFile(file);await q.wait(()=>q.view()?.file===file&&q.page()?.querySelector('strong'));
 const p=q.page().querySelector('.nf-section-body p');q.assert(p.querySelector('br')&&p.textContent.includes('&copy; extra'),'Rendered entity or hard break lost');q.assert(q.page().querySelectorAll('.nf-section-body p').length===2,'Hard break split a paragraph');return {source:saved};
`);
if(!filter || filter.includes('320px')) {
 evaluate(String.raw`window.__nfEditorTheme=app.vault.getConfig('theme');app.workspace.leftSplit.collapse();app.workspace.rightSplit.collapse();`);
 try {
 cli('dev:cdp','method=Emulation.setDeviceMetricsOverride','params={"width":320,"height":852,"deviceScaleFactor":1,"mobile":false}');
 for(const theme of ['light','dark']) {
  check(`320px ${theme} style control and draft recovery fit without text movement`,String.raw`
   const q=window.__nfEditorQA;app.changeTheme(${JSON.stringify(theme==='dark'?'obsidian':'moonstone')});app.updateTheme();await q.note('### 保持原处\n\n每段文字独立编辑，样式和位置保持一致。\n\n下一段继续写。');
   const metrics=()=>q.leaves().map(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return [r.x,r.y,r.width,r.height,s.fontSize,s.lineHeight,s.fontWeight];});
   const before=JSON.stringify(metrics()),el=await q.edit('每段文字独立编辑，样式和位置保持一致。');q.assert(JSON.stringify(metrics())===before,'Style control shifted the text');
   const controls=q.view().containerEl.querySelector('.nf-edit-controls'),style=controls.querySelector('.nf-text-style');q.assert(style?.textContent.includes('正文'),'Style chip missing');
   const rect=controls.getBoundingClientRect();q.assert(rect.left>=0&&rect.right<=innerWidth+1,'Toolbar overflows');
   q.view().containerEl.querySelector('.nf-edit-status').textContent='文件已变化，完整操作草稿已保留。请点击完成重试，或恢复未保存草稿。';
   const errorRect=controls.getBoundingClientRect();q.assert(errorRect.left>=0&&errorRect.right<=innerWidth+1&&controls.scrollWidth<=controls.clientWidth+1,'Status overflows narrow pane');
   q.input(el,'第一份待恢复草稿');await q.cancel();q.input(await q.edit('下一段继续写。'),'第二份待恢复草稿');await q.cancel();q.button('恢复未保存草稿',q.page());
   const modal=document.querySelector('.nf-drafts-dialog'),r=modal.getBoundingClientRect();q.assert(r.left>=0&&r.right<=innerWidth+1,'Draft dialog overflows');q.assert(modal.querySelectorAll('.nf-draft-item').length===2,'Draft rows missing');
   q.assert(modal.scrollWidth<=modal.clientWidth+1,'Draft content horizontal overflow');return {width:innerWidth,geometry:'identical entering edit',drafts:2};
  `);
  cli('dev:screenshot',`path=${join(outputDir,`editor-320-${theme}-drafts.png`)}`);
  evaluate(String.raw`const q=window.__nfEditorQA;q.closeDialogs();await q.edit('每段文字独立编辑，样式和位置保持一致。');`);
  cli('dev:screenshot',`path=${join(outputDir,`editor-320-${theme}-editing.png`)}`);
  evaluate(String.raw`await window.__nfEditorQA.cancel();`);
 }
 }finally{cli('dev:cdp','method=Emulation.clearDeviceMetricsOverride');evaluate(String.raw`app.changeTheme(window.__nfEditorTheme);app.updateTheme();`);}
}
check('new editor runtime error buffer',String.raw`const errors=${JSON.stringify(cli('dev:errors'))};window.__nfEditorQA.assert(errors==='No errors captured.',errors);return {errors};`);
writeFileSync(join(outputDir,filter?'obsidian-editor-focused.json':'obsidian-editor.json'),JSON.stringify({environment,transportWarnings,results},null,2)+'\n');
console.log(`${results.filter(r=>r.passed).length}/${results.length} editor-workflow checks passed`);
if(results.some(r=>!r.passed))process.exitCode=1;
}finally{try{cli('dev:cdp','method=Emulation.setFocusEmulationEnabled','params={"enabled":false}');}finally{cli('dev:debug','off');}}
