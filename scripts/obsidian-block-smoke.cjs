// Runs against the actual Obsidian app, never the simulated host.
// Usage: node scripts/obsidian-block-smoke.cjs /absolute/path/from/prepare-test-vault
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
check('heading and paragraph are independent; formatted content survives save and reopen',String.raw`
 const q=window.__nfQA,source='---\ncustom: untouched\n---\n## Section\n\n### 小标题\n\n正文 **加粗** 和 [官网](https://example.com)，保留格式。\n\n下一段保持不动。\n',file=await q.note(source);
 const heading=q.page().querySelector('h3'),paragraph=q.page().querySelector('.nf-section-body p');
 heading.click();q.assert(q.page().querySelector('[contenteditable=true]')===heading,'Editing is not the heading itself');q.assert(!heading.textContent.includes('#'),'Source markers visible');
 q.input(heading,'修改后的小标题');await q.done();q.assert(await app.vault.read(file)===source.replace('### 小标题','### 修改后的小标题'),'Heading changed other bytes');
 paragraph.click();q.assert(q.page().querySelectorAll('[contenteditable=true]').length===1,'Multiple editable blocks');q.assert(paragraph.querySelector('strong')&&paragraph.querySelector('a'),'Formatting disappeared');
 paragraph.append('新增文字');paragraph.dispatchEvent(new Event('input',{bubbles:true}));await q.done();
 const saved=await app.vault.read(file);q.assert(saved.includes('**加粗**')&&saved.includes('[官网](<https://example.com>)'),'Formatting lost');q.assert(saved.endsWith('下一段保持不动。\n'),'Adjacent paragraph changed');
 await q.note('Other');await q.p.openFile(file);await q.wait(()=>q.page()?.querySelector('strong'));q.assert(q.page().querySelector('strong').textContent==='加粗','Reopened formatting lost');return {source:saved};
`);
check('single list items and nested items keep exact source spans',String.raw`
 const q=window.__nfQA,source='## 清单\n\n- 第一项\n  - 子项目\n- 第二项\n\n- [ ] 待办项目\n',file=await q.note(source);
 const items=[...q.page().querySelectorAll('li .nf-block')];q.assert(items.length===4,'Missing atomic list wrappers: '+items.length);
 const first=items.find(el=>el.textContent.trim()==='第一项');first.click();q.input(first,'已改第一项');await q.done();
 q.assert(await app.vault.read(file)===source.replace('第一项','已改第一项'),'List edit changed nested or next item');
 const task=[...q.page().querySelectorAll('li .nf-block')].find(el=>el.textContent.trim()==='待办项目');q.assert(task?.classList.contains('nf-block'),'Task not editable');task.click();q.input(task,'已改待办');await q.done();
 q.assert((await app.vault.read(file)).includes('- [ ] 已改待办'),'Task marker lost');q.page().querySelector('input[type=checkbox]').click();await q.wait(()=>!q.controller().busy);
 q.assert((await app.vault.read(file)).includes('- [x] 已改待办'),'Checkbox not persisted');return {source:await app.vault.read(file)};
`);
check('multiline paste creates separate paragraphs and ignores clipboard HTML',String.raw`
 const q=window.__nfQA,file=await q.note('## 粘贴\n\n前后\n\n保留\n');const p=q.page().querySelector('.nf-section-body p');p.click();
 const range=document.createRange();range.setStart(p.firstChild,1);range.collapse(true);getSelection().removeAllRanges();getSelection().addRange(range);
 const data=new DataTransfer();data.setData('text/plain','第一行\n第二行');data.setData('text/html','<img src=x onerror=alert(1)>');
 p.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));await q.wait(()=>q.page().querySelector('[contenteditable=true]') && q.page().querySelector('[contenteditable=true]')!==p);
 q.assert(!q.page().querySelector('img'),'Clipboard HTML inserted');q.assert(q.page().querySelector('[contenteditable=true]').textContent==='第二行后','Caret paragraph differs');
 await q.done();q.assert(await app.vault.read(file)==='## 粘贴\n\n前第一行\n\n第二行后\n\n保留\n','Paste source differs');return {source:await app.vault.read(file)};
`);
check('quoted text, setext and empty headings retain their Markdown structure',String.raw`
 const q=window.__nfQA,file=await q.note('标题\n====\n\n> 引用文字\n\n### \n');
 const leaves=[...q.page().querySelectorAll('.nf-section-body .nf-block')];q.assert(leaves.length===3,'Missing special heading/quote leaf');
 for(const el of leaves){el.click();q.input(el,el.textContent+'修改');await q.done();}
 const saved=await app.vault.read(file);q.assert(saved==='标题修改\n====\n\n> 引用文字修改\n\n### 修改\n','Structure changed');return {source:saved};
`);
check('clearing a section heading updates layout; Shift-Enter in a heading starts a paragraph',String.raw`
 const q=window.__nfQA,file=await q.note('## One\n\nFirst\n\n## Two\n\nSecond\n\n## Three\n\nThird\n');
 const middle=q.page().querySelectorAll('.nf-section-body h2')[1];middle.click();q.input(middle,'');await q.done();q.assert(q.page().querySelectorAll('.nf-section').length===2,'Stale layout groups');
 const heading=q.page().querySelector('.nf-section-body h2');heading.click();const range=document.createRange();range.selectNodeContents(heading);range.collapse(false);getSelection().removeAllRanges();getSelection().addRange(range);
 heading.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',shiftKey:true,bubbles:true,cancelable:true}));await q.wait(()=>q.page().querySelector('[contenteditable=true]')?.tagName==='P');
 q.input(q.page().querySelector('[contenteditable=true]'),'New paragraph');await q.done();q.assert((await app.vault.read(file)).startsWith('## One\n\nNew paragraph\n\nFirst'),'Heading line break corrupted structure');
`);
check('complex Markdown remains renderer-owned',String.raw`
 const q=window.__nfQA;await q.note('## 复杂内容\n\n'+String.fromCharCode(96).repeat(3)+'js\nconst x=1;\n'+String.fromCharCode(96).repeat(3)+'\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n公式 $x^2$\n');
 for(const el of q.page().querySelectorAll('pre,td,.math')){el.click();q.assert(!q.page().querySelector('[contenteditable=true]'),'Complex block activated');}
`);
if(!filter) {
 evaluate(String.raw`const q=window.__nfQA;await q.note('### 标题\n\n正文');const h=q.page().querySelector('h3');h.click();const r=document.createRange();r.selectNodeContents(h);r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r);`);
 cli('dev:cdp','method=Input.dispatchKeyEvent','params={"type":"keyDown","key":"Enter","code":"Enter","windowsVirtualKeyCode":13}');
 check('real Enter creates a paragraph and typing persists only in that paragraph',String.raw`
  const q=window.__nfQA;await q.wait(()=>q.page().querySelector('[contenteditable=true]')?.tagName==='P');q.assert(q.page().querySelector('h3').textContent==='标题','Heading changed');
 `);
 cli('dev:cdp','method=Input.insertText','params={"text":"新段落"}');
 check('real typing into a new paragraph saves and can be edited again',String.raw`
  const q=window.__nfQA;await q.done();const file=q.view().file;q.assert(await app.vault.read(file)==='### 标题\n\n新段落\n\n正文','New paragraph not saved');
  const p=[...q.page().querySelectorAll('p')].find(el=>el.textContent==='新段落');p.click();q.input(p,'再次修改');await q.done();q.assert((await app.vault.read(file)).includes('再次修改'),'Re-edit failed');return {source:await app.vault.read(file)};
 `);
 evaluate(String.raw`const q=window.__nfQA;await q.note('## 输入法\n\n原文');const p=q.page().querySelector('.nf-section-body p');p.click();const r=document.createRange();r.selectNodeContents(p);getSelection().removeAllRanges();getSelection().addRange(r);`);
 cli('dev:cdp','method=Input.imeSetComposition','params={"text":"中文输入法","selectionStart":5,"selectionEnd":5}');
 cli('dev:cdp','method=Input.dispatchKeyEvent','params={"type":"keyDown","key":"Enter","code":"Enter","windowsVirtualKeyCode":13}');
 check('real paragraph IME confirmation does not split or save',String.raw`
  const q=window.__nfQA;q.assert(q.page().querySelectorAll('.nf-section-body p').length===1,'IME split paragraph');q.assert(q.page().querySelector('[contenteditable=true]')?.textContent==='中文输入法','IME editor missing');q.assert(await app.vault.read(q.view().file)==='## 输入法\n\n原文','IME saved early');
 `);
 cli('dev:cdp','method=Input.insertText','params={"text":"中文输入法"}');
 evaluate(String.raw`const q=window.__nfQA;await q.done();q.assert((await app.vault.read(q.view().file)).includes('中文输入法'),'Committed IME not saved');`);
}
if(!filter || filter.includes('px')) {
 evaluate(String.raw`const q=window.__nfQA;window.__nfOriginalTheme=app.vault.getConfig('theme');app.workspace.leftSplit.collapse();app.workspace.rightSplit.collapse();await q.note('---\nnf-title: 安静地写下去\nnf-columns: 2\n---\n## 今天的想法\n\n### 留一点空间\n\n文字留在原处，点击就可以继续写。**重点仍然清晰**，阅读与编辑之间只多一个光标。\n\n每段文字独立编辑，不会把标题和正文一起展开。\n\n## 慢慢整理\n\n- 记下一个想法\n- 完成一件小事\n');`);
 try {
 for(const width of [320,393,1024].filter(w=>!filter || filter.includes(String(w)))) {
  cli('dev:cdp','method=Emulation.setDeviceMetricsOverride',`params=${JSON.stringify({width,height:852,deviceScaleFactor:1,mobile:false})}`);
  for(const theme of ['light','dark']) {
   check(`${width}px ${theme} zero-shift reading and editing`,String.raw`
    const q=window.__nfQA;app.changeTheme(${JSON.stringify(theme==='dark'?'obsidian':'moonstone')});app.updateTheme();await new Promise(r=>setTimeout(r,100));
    const page=q.page();q.assert(page.scrollWidth<=page.clientWidth+1,'Horizontal overflow');
    const leaves=[page.querySelector('.nf-page-heading h1'),...page.querySelectorAll('.nf-section-body .nf-block')];
    const metrics=()=>leaves.map(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return [r.x,r.y,r.width,r.height,s.fontSize,s.lineHeight,s.fontWeight,s.margin,s.padding,s.borderWidth,s.backgroundColor];});
    const before=JSON.stringify(metrics());
    for(const el of leaves){el.click();await q.wait(()=>el.hasAttribute('contenteditable'));q.assert(JSON.stringify(metrics())===before,'Geometry/style shifted entering '+el.tagName);q.assert(page.querySelectorAll('[contenteditable=true]').length===1,'More than one editable block');await q.done();q.assert(JSON.stringify(metrics())===before,'Geometry/style shifted leaving '+el.tagName);}
    q.assert(!page.querySelector('textarea'),'Textarea returned');return {width:page.clientWidth,leaves:leaves.length,geometry:'identical before, during and after editing'};
   `);
   cli('dev:screenshot',`path=${join(outputDir,`blocks-${width}-${theme}-reading.png`)}`);
   evaluate(String.raw`const q=window.__nfQA;q.page().querySelector('h3').click();`);
   cli('dev:screenshot',`path=${join(outputDir,`blocks-${width}-${theme}-editing.png`)}`);
   evaluate(String.raw`await window.__nfQA.done();`);
  }
 }
 }finally{cli('dev:cdp','method=Emulation.clearDeviceMetricsOverride');evaluate(String.raw`app.changeTheme(window.__nfOriginalTheme);app.updateTheme();`);}
}
check('block editing runtime error buffer',String.raw`const errors=${JSON.stringify(cli('dev:errors'))};window.__nfQA.assert(errors==='No errors captured.',errors);return {errors};`);
writeFileSync(join(outputDir,filter?'obsidian-blocks-focused.json':'obsidian-blocks.json'),JSON.stringify({environment,transportWarnings,results},null,2)+'\n');
console.log(`${results.filter(r=>r.passed).length}/${results.length} block-editing checks passed`);
if(results.some(r=>!r.passed))process.exitCode=1;
}finally{try{cli('dev:cdp','method=Emulation.setFocusEmulationEnabled','params={"enabled":false}');}finally{cli('dev:debug','off');}}
