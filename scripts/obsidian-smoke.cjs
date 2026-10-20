// Runs against the actual Obsidian app, never the simulated host.
// Usage: node scripts/obsidian-smoke.cjs /absolute/path/from/prepare-test-vault
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
  p.settings.legacyPages=true;if(app.vault.getAbstractFileByPath('Legacy Home.md'))p.settings.homePath='Legacy Home.md';await p.saveSettings(true);
  const root='QA-'+Date.now();await app.vault.createFolder(root);
  window.__nfQA={root,p,seq:0,
    assert(value,message){if(!value)throw Error(message);},
    async wait(fn){for(let n=0;n<100;n++){if(fn())return;await new Promise(r=>setTimeout(r,30));}throw Error('Timed out: '+fn);},
    input(el,value){if(el.hasAttribute('contenteditable'))el.textContent=value;else el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},
    button(text,parent=document){const el=[...parent.querySelectorAll('button')].find(b=>b.textContent===text || b.getAttribute('aria-label')===text);if(!el)throw Error('Missing button '+text);el.click();},
    async note(text){
      const q=window.__nfQA;for(const bar of q.p.bars.values())for(const modal of bar.page.modals)modal.close();q.p.setPaused(false);
      const file=await app.vault.create(q.root+'/Case-'+(++q.seq)+'.md',text);
      await q.p.openFile(file);await q.wait(()=>q.view()?.file===file&&q.page()?.querySelector('.nf-page-tail'));
      return file;
    },
    view(){return app.workspace.getMostRecentLeaf()?.view;},
    page(){return this.view()?.containerEl.querySelector('.nf-page');},
    controller(){return this.p.bars.get(this.view()).page;},
    async done(){this.button('完成',this.view().containerEl);await this.wait(()=>this.page().querySelector('.nf-page-tail')&&!this.page().querySelector('.nf-block-editor'));},
    async cancel(){this.button('取消',this.view().containerEl);await this.wait(()=>this.page().querySelector('.nf-page-tail')&&!this.page().querySelector('.nf-block-editor'));},
    closeDialogs(){for(const modal of this.controller().modals)modal.close();}
  };return {root};
`);
check('reading preserves source and mounts replacement', String.raw`
 const q=window.__nfQA,text='---\ncustom: keep\n---\n## 测试\n\n中文阅读。\n',file=await q.note(text);
 q.assert(await app.vault.read(file)===text,'Read mutated Markdown');
 q.assert(getComputedStyle(q.view().contentEl).display==='none','Native content remains visible');
 q.assert(q.page().getBoundingClientRect().height>100,'Page has no layout');return {height:q.page().clientHeight};
`);
check('Chinese title, Enter, no-op save and reopen', String.raw`
 const q=window.__nfQA,file=await q.note('## 正文\n\n保留正文\n');
 q.page().querySelector('h1').click();q.input(q.page().querySelector('.nf-page-heading [contenteditable]'),'中文标题 · Mac');await q.done();
 const saved=await app.vault.read(file);q.assert(saved.includes('nf-title: "中文标题 · Mac"'),'Missing persisted title');
 q.page().querySelector('h1').click();await q.done();q.assert(await app.vault.read(file)===saved,'No-op changed bytes');
 await q.note('Other');await q.p.openFile(file);await q.wait(()=>q.page()?.querySelector('h1')?.textContent==='中文标题 · Mac');return {source:saved};
`);
check('section Done, blur and Cancel recovery', String.raw`
 const q=window.__nfQA,file=await q.note('## 一\n\n原文\n\n## 二\n\n保留\n');
 q.page().querySelector('.nf-section-body p').click();q.input(q.page().querySelector('[contenteditable]'),'完成保存');await q.done();
 q.assert((await app.vault.read(file)).includes('完成保存\n\n## 二\n\n保留'),'Changed wrong section');
 q.page().querySelector('.nf-section-body p').click();q.input(q.page().querySelector('[contenteditable]'),'失焦保存');q.page().querySelector('[contenteditable]').focus();q.assert(document.activeElement===q.page().querySelector('[contenteditable]'),'Textarea did not acquire focus');q.page().querySelector('h1').focus();
 await q.wait(()=>!q.page().querySelector('[contenteditable]'));q.assert((await app.vault.read(file)).includes('失焦保存'),'Blur did not save');
 q.page().querySelector('.nf-section-body p').click();q.input(q.page().querySelector('[contenteditable]'),'取消后的恢复草稿');await q.cancel();
 q.assert(!(await app.vault.read(file)).includes('取消后的恢复草稿'),'Cancel saved');q.button('恢复未保存草稿',q.page());
 q.assert(document.querySelector('[aria-label="草稿内容"]').value==='取消后的恢复草稿','Recovery differs');q.closeDialogs();
`);
check('card captions fit actual Obsidian button styles', String.raw`
 const q=window.__nfQA;await q.p.openHome();await q.wait(()=>q.page()?.querySelectorAll('.nf-card').length===2);
 const cards=[...q.page().querySelectorAll('.nf-card')];await q.wait(()=>cards.every(c=>c.querySelector('img')?.complete));
 for(const card of cards){const r=card.getBoundingClientRect(),label=card.querySelector('.nf-card-label');q.assert(label,'Missing caption');
  q.assert(label.getBoundingClientRect().bottom<=r.bottom,'Card caption clipped');q.assert(card.scrollHeight<=card.clientHeight+2,'Card overflows');}
 return cards.map(c=>({height:c.clientHeight,label:c.textContent}));
`);
check('preset cover, crop and icon persist', String.raw`
 const q=window.__nfQA,file=await q.note('## 封面\n\n正文\n');q.controller().coverDialog();
 for(const button of document.querySelectorAll('.nf-cover-presets button')){
  const range=document.createRange();range.selectNodeContents(button.firstChild);const label=range.getBoundingClientRect(),r=button.getBoundingClientRect();
  q.assert(label.left>=r.left&&label.right<=r.right,'Preset name clipped');q.assert(button.querySelector('img').getBoundingClientRect().top>=label.bottom,'Preset name overlaps image');
 }
 document.querySelectorAll('.nf-cover-presets button')[1].click();await q.wait(()=>!document.querySelector('.nf-cover-dialog'));
 q.assert((await app.vault.read(file)).includes('暮色山峦.svg'),'Preset not persisted');q.assert(q.page().querySelector('.nf-cover img'),'No cover');
 q.controller().coverDialog();document.querySelector('[aria-label="封面裁切位置"]').value='83';q.button('保存裁切位置');await q.wait(()=>!document.querySelector('.nf-cover-dialog'));
 q.assert(q.page().querySelector('.nf-cover img').style.objectPosition==='50% 83%','Crop not rendered');
 q.controller().iconDialog();q.input(document.querySelector('input[aria-label="页面图标"]'),'🌌');q.button('保存');await q.wait(()=>q.page()?.querySelector('.nf-page-icon')?.textContent==='🌌');
 return {source:await app.vault.read(file)};
`);
check('uploaded cover and body image create vault attachments', String.raw`
 const q=window.__nfQA,file=await q.note('## 图片\n\n正文\n');
 const png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII='),c=>c.charCodeAt(0));
 const upload=selector=>{const transfer=new DataTransfer();transfer.items.add(new File([png],'本机测试.png',{type:'image/png'}));const input=document.querySelector(selector);input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));};
 q.controller().coverDialog();upload('[aria-label="上传封面"]');await q.wait(()=>!document.querySelector('.nf-cover-dialog'));
 q.assert((await app.vault.read(file)).includes('本机测试.png'),'Upload cover reference missing');
 q.controller().insertImage();upload('[aria-label="上传正文图片"]');await q.wait(()=>!document.querySelector('[aria-label="上传正文图片"]'));
 const text=await app.vault.read(file);q.assert(text.includes('![[Nebula Assets/'),'Body embed missing');
 return {attachments:app.vault.getFiles().filter(f=>f.name.endsWith('本机测试.png')).length};
`);
check('vertical and horizontal pointer drag update source order', String.raw`
 const q=window.__nfQA,file=await q.note('## A\n\n一\n\n## B\n\n二\n\n## C\n\n三\n');
 const drag=()=>{const items=[...q.page().querySelectorAll('.nf-section')],handle=items[0].querySelector('.nf-drag-handle');
 const a=handle.getBoundingClientRect(),b=items[1].getBoundingClientRect();
 handle.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,pointerId:41,clientX:a.x+10,clientY:a.y+10}));
 document.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:41,clientX:b.x+20,clientY:b.y+20}));
 document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:41,clientX:b.x+20,clientY:b.y+20}));};
 drag();await q.wait(()=>q.page().querySelector('h2')?.textContent==='B');
 await q.controller().meta('nf-columns',2);await q.controller().meta('nf-ratio',50);await q.wait(()=>q.page().querySelector('.nf-section-grid')?.dataset.columns==='2');drag();
 await q.wait(()=>q.page().querySelector('h2')?.textContent==='A');const text=await app.vault.read(file);
 q.assert(text.indexOf('## A')<text.indexOf('## B'),'Horizontal drop lost');return {source:text};
`);
check('native source, pause and unload preserve drafts and restore controls', String.raw`
 const q=window.__nfQA,file=await q.note('## 草稿\n\n原文\n'),key='nebula-focus-draft:'+file.path;
 const edit=value=>{q.page().querySelector('.nf-section-body p').click();q.input(q.page().querySelector('[contenteditable]'),value);};
 edit('切换原文草稿');await q.p.setMode(q.view(),'source');q.assert(app.loadLocalStorage(key)?.drafts.some(d=>d.value==='切换原文草稿'),'Source switch lost draft');
 q.assert(getComputedStyle(q.view().contentEl).display!=='none','Native source hidden');await q.p.setMode(q.view(),'preview');await q.wait(()=>q.page()?.querySelector('.nf-page-tail'));
 edit('暂停草稿');q.p.setPaused(true);q.assert(!document.querySelector('.nf-managed'),'Pause did not restore view');q.assert(app.loadLocalStorage(key)?.drafts.some(d=>d.value==='暂停草稿'),'Pause lost draft');
 q.p.setPaused(false);await q.wait(()=>q.page()?.querySelector('.nf-page-tail'));edit('卸载草稿');await app.plugins.disablePlugin('nebula-focus');
 q.assert(!document.querySelector('.nf-page,.nf-bar,.nf-resume,.nf-managed'),'Unload left plugin UI');q.assert(app.loadLocalStorage(key)?.drafts.some(d=>d.value==='卸载草稿'),'Unload lost draft');
 q.assert(getComputedStyle(q.view().containerEl.querySelector('.view-header')).display!=='none','Header not restored');
 await app.plugins.enablePlugin('nebula-focus');q.p=app.plugins.plugins['nebula-focus'];await q.wait(()=>q.page()?.querySelector('.nf-page-tail'));
`);
check('switching notes preserves pending input', String.raw`
 const q=window.__nfQA,file=await q.note('## 原文\n\n保留\n');q.page().querySelector('.nf-section-body p').click();q.input(q.page().querySelector('[contenteditable]'),'切页时的草稿');
 await q.note('## 另一页\n\n不覆盖\n');q.assert(q.controller().drafts.list('nebula-focus-draft:'+file.path).some(d=>d.value==='切页时的草稿'),'Navigation lost draft');
 q.assert(await app.vault.read(file)==='## 原文\n\n保留\n','Navigation wrote pending input');
`);
check('native Markdown features and internal navigation', String.raw`
 const q=window.__nfQA,target=await q.note('## 目标\n\n嵌入正文\n');
 await q.note('## 渲染\n\n[['+target.path+'|内部链接]]\n\n![['+target.path+']]\n\n- [ ] 待办\n\n| A | B |\n|---|---|\n| 一 | 二 |\n\n代码：\n\n'+String.fromCharCode(96).repeat(3)+'js\nconst x = 1;\n'+String.fromCharCode(96).repeat(3)+'\n\n脚注[^1]\n\n[^1]: 说明\n');
 const page=q.page();q.assert(page.querySelector('table'),'Table missing');q.assert(page.querySelector('pre code'),'Code missing');q.assert(page.querySelector('input[type=checkbox]'),'Task missing');
 await q.wait(()=>page.querySelector('.internal-embed')?.textContent.includes('嵌入正文'));
 q.assert(page.querySelector('.footnote-ref'),'Same-section footnote missing');page.querySelector('a.internal-link').click();await q.wait(()=>q.view().file===target);return {target:target.path};
`);
// Write from the filesystem rather than the Obsidian API, exercising its real watcher.
let conflictFile;
try {
  conflictFile=evaluate(String.raw`const q=window.__nfQA,file=await q.note('## 冲突\n\n原文\n');q.page().querySelector('.nf-section-body p').click();q.input(q.page().querySelector('[contenteditable]'),'本机未保存草稿');return file.path;`);
  writeFileSync(join(vault,conflictFile),'## 冲突\n\n外部磁盘修改\n');
  check('external filesystem conflict refuses overwrite and retains draft', String.raw`
    const q=window.__nfQA,file=q.view().file;await q.wait(()=>q.view().containerEl.querySelector('.nf-edit-controls')?.textContent.includes('其他位置更新'));
    q.button('完成',q.view().containerEl);await new Promise(r=>setTimeout(r,150));
    q.assert(await app.vault.read(file)==='## 冲突\n\n外部磁盘修改\n','Overwrote external change');
    q.assert(q.controller().drafts.list('nebula-focus-draft:'+file.path).some(d=>d.value==='本机未保存草稿'),'Conflict draft missing');await q.cancel();
  `);
} catch(error) {results.push({name:'external filesystem conflict setup',passed:false,error:error.message});}
check('card navigation, metadata refresh and native search', String.raw`
 const q=window.__nfQA,target=await q.note('---\nnf-title: "原始卡片"\n---\n## 项目\n\n正文\n');
 const source=await q.note('## 卡片\n\n<!-- nf:view=cards -->\n\n- [['+target.path+']]\n');
 await q.wait(()=>q.page().querySelector('.nf-card-label')?.textContent==='原始卡片');
 await app.vault.modify(target,'---\nnf-title: "更新的卡片"\n---\n## 项目\n\n正文\n');await q.wait(()=>q.page().querySelector('.nf-card-label')?.textContent==='更新的卡片');
 q.page().querySelector('.nf-card').click();await q.wait(()=>q.view().file===target);
 await q.p.setMode(q.view(),'source');q.view().showSearch();
 await q.wait(()=>q.view().getMode()==='source');q.assert(q.view().containerEl.querySelector('.document-search-container'),'Native search missing');
`);
check('runtime error buffer', String.raw`const errors=${JSON.stringify(cli('dev:errors'))};window.__nfQA.assert(errors==='No errors captured.',errors);return {errors};`);
check('narrow native split panes use one column', String.raw`
 const q=window.__nfQA,file=await q.note('---\nnf-columns: 2\n---\n## Left\n\n正文\n\n## Right\n\n正文\n');
 const original=q.view().leaf,split=app.workspace.getLeaf('split','vertical');
 try {
  await split.openFile(file,{state:{mode:'preview'}});
  await q.wait(()=>split.view.containerEl.querySelector('.nf-page-tail'));
  const page=split.view.containerEl.querySelector('.nf-page'),grid=page.querySelector('.nf-section-grid');
  q.assert(page.clientWidth<=650,'Test requires a narrow native pane');
  q.assert(getComputedStyle(grid).gridTemplateColumns.split(' ').length===1,'Narrow split stayed in two columns');
  q.assert(page.scrollWidth<=page.clientWidth+1,'Narrow pane overflows');return {width:page.clientWidth,columns:getComputedStyle(grid).gridTemplateColumns};
 }finally{split.detach();app.workspace.setActiveLeaf(original,{focus:true});}
`);
check('navigator search and non-Markdown fallback', String.raw`
 const q=window.__nfQA,file=await q.note('## Find me\n\n正文\n');q.p.openNavigator();
 await q.wait(()=>document.querySelector('.nf-search'));await new Promise(r=>setTimeout(r,60));
 q.assert(!document.activeElement.matches('.nf-search'),'Navigator opened the keyboard');
 q.input(document.querySelector('.nf-search'),file.path);
 q.assert(document.querySelectorAll('.nf-file-row').length===1,'Search did not filter');document.querySelector('.nf-file-row').click();
 await q.wait(()=>!document.querySelector('.nf-navigator'));
 const canvas=await app.vault.create(q.root+'/Native.canvas','{"nodes":[],"edges":[]}');await q.p.openFile(canvas);
 await q.wait(()=>q.view().getViewType()==='canvas');q.assert(!document.body.classList.contains('nf-active'),'Canvas still has focus gates');
 q.assert(!q.view().containerEl.querySelector('.nf-page'),'Canvas has custom Markdown UI');
 await q.p.openFile(file);await q.wait(()=>q.page()?.querySelector('.nf-page-tail'));
`);
// CDP drives Chromium's actual IME composition, rather than synthetic DOM events.
if(!filter)try {
 evaluate(String.raw`const q=window.__nfQA;await q.note('IME fixture');q.page().querySelector('h1').click();const el=q.page().querySelector('.nf-page-heading [contenteditable]');const range=document.createRange();range.selectNodeContents(el);getSelection().removeAllRanges();getSelection().addRange(range);window.__nfIme=[];for(const type of ['compositionstart','compositionend','keydown'])el.addEventListener(type,e=>window.__nfIme.push({type:e.type,key:e.key,isComposing:e.isComposing}));`);
 cli('dev:cdp','method=Input.imeSetComposition','params={"text":"中文输入法","selectionStart":5,"selectionEnd":5}');
 cli('dev:cdp','method=Input.dispatchKeyEvent','params={"type":"keyDown","key":"Enter","code":"Enter","windowsVirtualKeyCode":13}');
 check('real Chromium IME Enter keeps composition open',String.raw`const q=window.__nfQA;q.assert(q.page().querySelector('.nf-page-heading .nf-block-editor')?.textContent==='中文输入法','Composition saved early');q.assert(window.__nfIme.some(e=>e.key==='Enter'&&e.isComposing),'No real composition key event');return window.__nfIme;`);
 cli('dev:cdp','method=Input.insertText','params={"text":"中文输入法"}');
 cli('dev:cdp','method=Input.dispatchKeyEvent','params={"type":"keyDown","key":"Enter","code":"Enter","windowsVirtualKeyCode":13}');
 check('committed IME title saves on subsequent Enter',String.raw`const q=window.__nfQA;await q.wait(()=>q.page().querySelector('h1')?.textContent==='中文输入法');q.assert((await app.vault.read(q.view().file)).includes('nf-title: "中文输入法"'),'Committed title missing');return window.__nfIme;`);
}catch(error){results.push({name:'real IME setup',passed:false,error:error.message});}
// Viewport emulation is still desktop Electron, not an iPhone certification.
if(!filter || filter.includes('px')){
evaluate(String.raw`const q=window.__nfQA;await q.p.openHome();await q.wait(()=>q.page()?.querySelector('.nf-card'));await q.controller().meta('nf-columns',2);app.workspace.leftSplit.collapse();app.workspace.rightSplit.collapse();window.__nfOriginalTheme=app.vault.getConfig('theme');`);
try {
 for(const width of [320,393,1024].filter(w=>!filter || filter.includes(String(w)))) {
  cli('dev:cdp','method=Emulation.setDeviceMetricsOverride',`params=${JSON.stringify({width,height:852,deviceScaleFactor:1,mobile:false})}`);
  for(const theme of ['light','dark']) {
   check(`${width}px ${theme} actual renderer layout`,String.raw`
    const q=window.__nfQA;app.changeTheme(${JSON.stringify(theme==='dark'?'obsidian':'moonstone')});app.updateTheme();
    await q.wait(()=>innerWidth===${width});await new Promise(r=>setTimeout(r,60));const page=q.page(),grid=page.querySelector('.nf-section-grid');
    q.assert(page.scrollWidth<=page.clientWidth+1,'Horizontal overflow');const columns=getComputedStyle(grid).gridTemplateColumns.split(' ').length;
    q.assert(columns===(page.clientWidth<=650?1:2),'Wrong responsive columns');
    for(const card of page.querySelectorAll('.nf-card'))q.assert(card.scrollHeight<=card.clientHeight+2,'Caption clipped');
    return {viewport:innerWidth,pane:page.clientWidth,columns,background:getComputedStyle(page).backgroundColor};
   `);
   cli('dev:screenshot',`path=${join(outputDir,`obsidian-${width}-${theme}.png`)}`);
  }
 }
}finally{
 cli('dev:cdp','method=Emulation.clearDeviceMetricsOverride');
 evaluate(String.raw`app.changeTheme(window.__nfOriginalTheme);app.updateTheme();`);
}
}
evaluate(String.raw`const q=window.__nfQA;await q.p.openHome();return true;`);
cli('dev:screenshot', `path=${join(outputDir,'obsidian-desktop.png')}`);
check('final runtime error buffer', String.raw`const errors=${JSON.stringify(cli('dev:errors'))};window.__nfQA.assert(errors==='No errors captured.',errors);return {errors};`);
const report={environment,transportWarnings,results};
writeFileSync(join(outputDir,filter?'obsidian-smoke-focused.json':'obsidian-smoke.json'),JSON.stringify(report,null,2)+'\n');
console.log(`${results.filter(r=>r.passed).length}/${results.length} real Obsidian checks passed`);
if(results.some(r=>!r.passed))process.exitCode=1;

} finally {
 try { cli('dev:cdp', 'method=Emulation.setFocusEmulationEnabled', 'params={"enabled":false}'); }
 finally { cli('dev:debug', 'off'); }
}
