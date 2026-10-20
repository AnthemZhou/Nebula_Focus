// Real Mac Obsidian keyboard and visual checks, only in a marked disposable vault.
const {mkdirSync,writeFileSync}=require('node:fs');
const {resolve}=require('node:path');
const assert=require('node:assert/strict');
const c=require('./obsidian-client.cjs')(process.argv[2]);
const results=[],out=resolve('test-results');mkdirSync(out,{recursive:true});
const version=require('../manifest.json').version;
function check(name,run){try{const details=typeof run==='string'?c.evaluate(run):run();results.push({name,passed:true,details});console.log('PASS '+name);}catch(error){results.push({name,passed:false,error:error.stack});console.error('FAIL '+name+': '+error.message);}}
function down(key,code,modifiers=0,text){c.cdp('Input.dispatchKeyEvent',{type:'keyDown',key,code,modifiers,text,windowsVirtualKeyCode:{ShiftLeft:16,Digit8:56,ArrowRight:39,Escape:27,KeyZ:90}[code]});}
function up(key,code,modifiers=0){c.cdp('Input.dispatchKeyEvent',{type:'keyUp',key,code,modifiers,windowsVirtualKeyCode:{ShiftLeft:16,Digit8:56,ArrowRight:39,Escape:27,KeyZ:90}[code]});}
function hold(){down('Shift','ShiftLeft',8);}
function release(){up('Shift','ShiftLeft');}
function star(){hold();down('*','Digit8',8,'*');up('*','Digit8',8);release();}
const environment={platform:process.platform,version:c.cli('version'),vault:c.name};
c.cli('dev:debug','on');
try{
 c.cdp('Emulation.setFocusEmulationEnabled',{enabled:true});c.cli('dev:errors','clear');
 c.evaluate(`
 const p=app.plugins.plugins['nebula-focus'];p.settings.legacyPages=false;p.settings.mobileOnly=false;await p.saveSettings(true);p.setPaused(false);
 app.workspace.leftSplit.collapse();app.workspace.rightSplit.collapse();
 const root='QA-Format-'+Date.now();await app.vault.createFolder(root);
 window.__nfFormat={p,root,seq:0,theme:document.body.classList.contains('theme-dark')?'obsidian':'moonstone',
 assert(value,message){if(!value)throw Error(message);},
 async wait(fn){for(let i=0;i<120;i++){if(await fn())return;await new Promise(r=>setTimeout(r,25));}throw Error('Timed out: '+fn);},
 view(){return app.workspace.getMostRecentLeaf().view;},
 async note(text){const f=await app.vault.create(this.root+'/Note-'+(++this.seq)+'.md',text);await this.p.openFile(f);await this.wait(()=>this.view().file===f&&this.view().editor?.getValue()===text&&this.view().containerEl.querySelector('.cm-content'));await new Promise(r=>setTimeout(r,100));this.view().editor.setCursor({line:0,ch:0});this.view().editor.focus();return f;},
 guide(){return document.querySelector('.nf-format-guide');},
 textStyle(text){const walk=document.createTreeWalker(this.view().containerEl.querySelector('.cm-content'),4);while(walk.nextNode()){if(walk.currentNode.textContent.includes(text))return getComputedStyle(walk.currentNode.parentElement).fontStyle;}return null;},
 button(label,parent=document){const e=[...parent.querySelectorAll('button,.menu-item')].find(e=>e.textContent===label||e.getAttribute('aria-label')===label);if(!e)throw Error('Missing '+label);e.click();},
 async saved(){await this.view().save();return app.vault.read(this.view().file);}
 };return {root};`);
 check('a lone leading star stays visible and does not italicize the paragraph',()=>{
  c.evaluate(`await window.__nfFormat.note('普通文字 Alpha。');`);star();
  return c.evaluate(`const q=window.__nfFormat;await new Promise(r=>setTimeout(r,100));const v=q.view();q.assert(v.editor.getValue()==='*普通文字 Alpha。','Input changed');q.assert(q.textStyle('普通文字 Alpha。')==='normal','Lone star still italic');const marker=v.containerEl.querySelector('.cm-formatting-em');q.assert(marker&&marker.getBoundingClientRect().width>0,'Lone star hidden');q.assert(!q.guide(),'Shift+8 opened guide');return {saved:await q.saved(),style:q.textStyle('普通文字 Alpha。')};`);
 });
 check('closing the star restores real italic and native undo restores literal display',()=>{
  c.evaluate(`const v=window.__nfFormat.view();v.editor.setCursor({line:0,ch:v.editor.getLine(0).length});`);star();
  const paired=c.evaluate(`const q=window.__nfFormat;await new Promise(r=>setTimeout(r,100));q.assert(q.view().editor.getValue()==='*普通文字 Alpha。*','Pair not completed');q.assert(q.textStyle('普通文字 Alpha。')==='italic','Paired italic lost');return {saved:await q.saved()};`);
  down('z','KeyZ',4);up('z','KeyZ',4);
  return c.evaluate(`const q=window.__nfFormat;await q.wait(()=>q.view().editor.getValue()==='*普通文字 Alpha。');q.assert(q.textStyle('普通文字 Alpha。')==='normal','Undo left stale italic');return {paired:${JSON.stringify(paired)},undone:await q.saved()};`);
 });
 check('star plus space still creates a native list',()=>{
  c.evaluate(`await window.__nfFormat.note('列表正文');`);star();c.cdp('Input.insertText',{text:' '});
  return c.evaluate(`const q=window.__nfFormat;await q.wait(()=>q.view().containerEl.querySelector('.HyperMD-list-line'));q.assert(q.view().editor.getValue()==='* 列表正文','List source changed');q.assert(!q.guide(),'Guide intercepted star');return {saved:await q.saved()};`);
 });
 check('valid multiline and nested italics retain their native style',String.raw`
 const q=window.__nfFormat;await q.note('*第一行\n第二行*');q.view().editor.setCursor({line:0,ch:2});await new Promise(r=>setTimeout(r,100));
 let spans=[...q.view().containerEl.querySelectorAll('.cm-em:not(.cm-formatting)')];q.assert(spans.length&&spans.every(e=>getComputedStyle(e).fontStyle==='italic'),'Multiline italic lost');
 await q.note('*普通文字和 _真正斜体_。');q.view().editor.setCursor({line:0,ch:11});await new Promise(r=>setTimeout(r,100));
 q.assert(q.textStyle('真正斜体')==='italic','Nested italic lost');return {saved:await q.saved()};`);
 check('escaped stars and code remain literal and source remains unchanged',String.raw`
 const q=window.__nfFormat,source='\\*保留星号\n\n\`\`\`text\n*代码内不配对\n\`\`\`\n\n行内 \`*代码\`';await q.note(source);q.assert(await q.saved()===source,'Literal source changed');q.assert(!q.view().containerEl.querySelector('.nf-literal-asterisk'),'Code or escaped star marked as prose');return {saved:await q.saved()};`);
 check('holding Shift opens help without moving focus, selection or text; release closes it',()=>{
  c.evaluate(`const q=window.__nfFormat;await q.note('长按 Shift 查看格式');q.before=q.view().editor.getCursor();`);hold();
  const opened=c.evaluate(`const q=window.__nfFormat;await q.wait(()=>q.guide());q.assert(document.activeElement.matches('.cm-content'),'Guide stole editor focus');q.assert(q.view().editor.getValue()==='长按 Shift 查看格式','Help changed text');q.assert(JSON.stringify(q.before)===JSON.stringify(q.view().editor.getCursor()),'Cursor moved');return {rows:q.guide().querySelectorAll('dt').length};`);
  release();assert.equal(c.evaluate(`return !!window.__nfFormat.guide();`),false);return opened;
 });
 check('Shift+Arrow selects text normally and suppresses the guide',()=>{
  hold();down('ArrowRight','ArrowRight',8);up('ArrowRight','ArrowRight',8);
  const selected=c.evaluate(`const q=window.__nfFormat;await new Promise(r=>setTimeout(r,700));q.assert(!q.guide(),'Selection opened help');q.assert(q.view().editor.getSelection()==='长','Shift selection failed');return {selected:q.view().editor.getSelection()};`);release();return selected;
 });
 check('Chinese composition cancels pending help and commits unchanged text',()=>{
  c.evaluate(`const q=window.__nfFormat;await q.note('');`);hold();
  c.cdp('Input.imeSetComposition',{text:'中文输入',selectionStart:4,selectionEnd:4});
  c.cdp('Input.insertText',{text:'中文输入'});release();
  return c.evaluate(`const q=window.__nfFormat;await new Promise(r=>setTimeout(r,650));q.assert(!q.guide(),'IME opened help');q.assert(await q.saved()==='中文输入','IME damaged text');return {saved:await q.saved()};`);
 });
 check('More menu pins the guide; Escape returns focus to writing',()=>{
  c.evaluate(`const q=window.__nfFormat;q.button('更多',q.view().containerEl);await q.wait(()=>document.querySelector('.menu'));q.button('格式速查（长按 Shift）',document.querySelector('.menu'));await q.wait(()=>q.guide()&&!document.querySelector('.menu'));q.assert(q.guide().contains(document.activeElement),'Pinned guide not keyboard accessible');`);
  down('Escape','Escape');up('Escape','Escape');return c.evaluate(`const q=window.__nfFormat;q.assert(!q.guide(),'Escape left guide');q.assert(document.activeElement.matches('.cm-content'),'Focus not restored');`);
 });
 check('changing files and pausing close pending and visible guides',()=>{
  hold();c.evaluate(`const q=window.__nfFormat;await q.note('另一个文件');await new Promise(r=>setTimeout(r,650));q.assert(!q.guide(),'Guide survived file switch');`);release();
  c.evaluate(`const q=window.__nfFormat;q.p.formatGuide.open();q.assert(q.guide(),'No pinned guide');q.p.setPaused(true);q.assert(!q.guide(),'Pause left guide');q.p.setPaused(false);q.view().editor.focus();`);
 });
 check('raw source keeps native formatting and disables the hold guide',()=>{
  c.evaluate(`const q=window.__nfFormat;await q.note('*源文');await q.p.setWritingMode(q.view(),true,true);`);hold();
  const raw=c.evaluate(`const q=window.__nfFormat;await new Promise(r=>setTimeout(r,650));q.assert(!q.guide(),'Guide in source mode');q.assert(q.view().getState().source===true,'Source mode lost');return {saved:await q.saved()};`);release();c.evaluate(`const q=window.__nfFormat;return q.p.setWritingMode(q.view(),false,true);`);return raw;
 });
 for(const theme of ['light','dark'])for(const width of [320,393,1024]){
  check(`guide fits ${theme} ${width}px without moving the document`,()=>{
   c.cdp('Emulation.setDeviceMetricsOverride',{width,height:852,deviceScaleFactor:1,mobile:false});
   const details=c.evaluate(`const q=window.__nfFormat;q.p.formatGuide.close();app.changeTheme('${theme==='dark'?'obsidian':'moonstone'}');app.updateTheme();await q.note('### 安静地写\\n\\n按住 Shift，随时查看格式。\\n\\n先写下来，整理可以晚一点。');const content=q.view().containerEl.querySelector('.cm-content'),before=content.getBoundingClientRect().toJSON();q.p.formatGuide.open();await new Promise(r=>setTimeout(r,80));const r=q.guide().getBoundingClientRect();q.assert(r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight,'Guide clipped');q.assert(q.guide().scrollWidth<=q.guide().clientWidth+1,'Guide horizontal overflow');q.assert(JSON.stringify(before)===JSON.stringify(content.getBoundingClientRect().toJSON()),'Help shifted text');return {bounds:r.toJSON(),scrollable:q.guide().scrollHeight>q.guide().clientHeight};`);
   c.cli('dev:screenshot',`path=${resolve(`docs/ui-${version}-guide-${theme}-${width}.png`)}`);return details;
  });
 }
 check('unloading removes the guide and all hold listeners',()=>{
  c.evaluate(`window.__nfFormat.p.formatGuide.open();`);
  c.cli('plugin:reload','id=nebula-focus');
  return c.evaluate(`const old=window.__nfFormat.p;if(document.querySelector('.nf-format-guide')||!old.disposed)throw Error('Unload left guide');return {guidePresent:false,oldDisposed:old.disposed};`);
 });
 check('Obsidian reports no runtime errors',()=>{const errors=c.cli('dev:errors');assert(/No errors captured|^\[\]$|^$/.test(errors),errors);return {errors};});
}finally{
 try{release();c.evaluate(`const q=window.__nfFormat;if(q){const p=app.plugins.plugins['nebula-focus'];app.changeTheme(q.theme);app.updateTheme();const f=app.vault.getAbstractFileByPath(p.settings.homePath||'Home.md');if(f)await p.openFile(f);}`);c.cdp('Emulation.clearDeviceMetricsOverride');c.cdp('Emulation.setFocusEmulationEnabled',{enabled:false});c.cli('dev:debug','off');}catch(error){results.push({name:'cleanup',passed:false,error:error.message});}
 writeFileSync(resolve(out,'obsidian-format-smoke.json'),JSON.stringify({environment,results,warnings:c.warnings},null,2)+'\n');
}
if(results.some(r=>!r.passed))process.exitCode=1;
