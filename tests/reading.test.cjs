const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {transformSync} = require('esbuild');
const {JSDOM} = require('jsdom');
const moduleValue = {exports: {}};
new Function('module', 'exports', transformSync(fs.readFileSync('src/model.ts', 'utf8'), {loader:'ts',format:'cjs'}).code)(moduleValue,moduleValue.exports);
const {overdue, firstImage, isEmpty, compactLink, isDueProperty} = moduleValue.exports;

test('date-only deadline expires at the next local midnight; today is not overdue', () => {
  assert.equal(overdue('2026-10-21', new Date(2026,9,21,23,59,59)), false);
  assert.equal(overdue('2026-10-20', new Date(2026,9,21,0,0,0)), true);
  assert.equal(overdue('2026/10/21', new Date(2026,9,21,9)), false);
});
test('explicit timezones, completed work, malformed dates and future deadlines', () => {
  assert.equal(overdue('2026-10-21T12:00:00+08:00', new Date('2026-10-21T04:00:01Z')), true);
  assert.equal(overdue('2026-10-21T12:00:00+08:00', new Date('2026-10-21T03:59:00Z')), false);
  assert.equal(overdue('2026-01-01', new Date(2026,9,21), '完成'), false);
  for (const value of ['2026-02-31', 'not a date', null, '', '2026-13-01'])
    assert.equal(overdue(value, new Date(2026,9,21)), false);
  assert.equal(overdue('2027-01-01', new Date(2026,9,21)), false);
  assert.equal(isDueProperty('note.截止日期'), true);
  assert.equal(isDueProperty('发布时间'), false);
});
test('first image follows embed order, skips PDF and missing files, handles paths and aliases', () => {
  const files = {'paper.pdf':'paper.pdf','first image.png':'images/first image.png','second.jpg':'images/second.jpg'};
  const resolve = link => files[link] || null;
  assert.equal(firstImage([{link:'paper.pdf'},{link:'missing.png'},{link:'first image.png|200'},{link:'second.jpg'}], resolve), 'images/first image.png');
  assert.equal(firstImage([{link:'https://example.org/photo.jpg?token=example'},{link:'second.jpg'}], resolve), 'https://example.org/photo.jpg?token=example');
  assert.equal(firstImage([], resolve), null);
});
test('meaningful false and zero values stay visible; URL labels accept only web addresses', () => {
  assert.equal(isEmpty(false), false); assert.equal(isEmpty(0), false); assert.equal(isEmpty([]), true);
  assert.equal(compactLink('javascript:alert(1)'), null);
  assert.equal(compactLink('https://www.bilibili.com/video/a'), '查看 B 站视频 ↗');
});

function fixture() {
  const dom = new JSDOM('<!doctype html><body><div class="workspace"><div class="bases-view"><div class="native">Original native cards</div></div></div></body>', {pretendToBeVisual:true});
  const win = dom.window, doc = win.document;
  function make(tag, options) {
    const el = doc.createElement(tag);
    if (typeof options === 'string') el.className = options;
    else if (options) {
      el.className = options.cls || '';
      if (options.text !== undefined) el.textContent = options.text;
      for (const [key,value] of Object.entries(options.attr || {})) el.setAttribute(key,value);
    }
    this.appendChild(el); return el;
  }
  win.HTMLElement.prototype.createEl = make;
  win.HTMLElement.prototype.createDiv = function(options) { return make.call(this,'div',options); };
  win.HTMLElement.prototype.createSpan = function(options) { return make.call(this,'span',options); };
  class Component {load(){} unload(){}}
  class Plugin {}
  class TFile {}
  class MarkdownView {}
  class Modal {
    constructor() {
      this.modalEl=doc.createElement('div');this.modalEl.className='modal';
      this.contentEl=this.modalEl.createDiv('modal-content');
    }
    open(){doc.body.append(this.modalEl);}
    close(){this.onClose?.();this.modalEl.remove();}
  }
  const api = {Plugin, TFile, MarkdownView, Component, Modal, Notice:class{}, Menu:class{}, setIcon(){}};
  const mod = {exports:{}};
  new vm.Script(fs.readFileSync('main.js','utf8')).runInContext(vm.createContext({
    module:mod,exports:mod.exports,require:name => {assert.equal(name,'obsidian'); return api;},
    document:doc,window:win,HTMLElement:win.HTMLElement,HTMLInputElement:win.HTMLInputElement,Element:win.Element,Node:win.Node,
    MutationObserver:win.MutationObserver,console,URL,
  }));
  const plugin = new mod.exports.default();
  const writes = [], originalText = '# A\n\n![First](first.png)\n';
  const file = {path:'A.md',basename:'A',stat:{mtime:1}};
  const fm = {截止日期:'2020-01-01',状态:'制作中',项目下一步:'Read the paper',项目摘要:'',次数:0};
  const app = plugin.app = {
    metadataCache: {getFileCache:() => ({frontmatter:fm,embeds:[{link:'first.png'},{link:'second.png'}]}), getFirstLinkpathDest:(link) => ({path:link})},
    vault: {getResourcePath:file => 'app://local/'+file.path,getFileByPath:path=>({path}),read:async()=>originalText,
      modify:(...args)=>writes.push(args),process:(...args)=>writes.push(args)},
    workspace:{openLinkText(){},trigger(){}},
    renderContext:{},
  };
  const value = data => typeof data === 'string' && /^\d{4}-\d\d-\d\d$/.test(data)
    ? {date:{},time:null,toString:()=>data,renderTo:el=>el.textContent=data}
    : ({data,type:data===null?'null':typeof data,toString:()=>String(data??''),renderTo:el=>el.textContent=String(data)});
  const entry = {file,getValue:prop=>value(prop==='file.name'?'A':fm[prop.replace(/^note\./,'')]??null)};
  const host = doc.querySelector('.bases-view'), native = doc.querySelector('.native');
  const view = {
    _loaded:true,type:'kanban',containerEl:native,queryController:{viewContainerEl:host},
    data:{data:[entry]},orderedGroups:[{key:value('制作中'),entries:[entry]}],
    config:{getOrder:()=>['file.name','note.截止日期','note.项目下一步','note.项目摘要','note.次数'],get:()=>undefined,getDisplayName:p=>p.replace(/^note\./,''),groupBy:{property:'note.状态'}},
    onDataUpdated(){},moveCardToColumn(){throw Error('Unexpected automatic status write');},canMoveCard:()=>true,
    updateVirtualDisplay(){},register(){},
  };
  return {dom,doc,plugin,view,entry,fm,file,writes,app,native,originalText,close:()=>dom.window.close()};
}
test('presentation uses first image and original fields; no automatic Markdown or base writes', async() => {
  const f = fixture();
  try {
    f.plugin.attach(f.view);
    assert.equal(f.doc.querySelectorAll('.bui-card').length,1);
    assert.match(f.doc.querySelector('img').src,/first\.png$/);
    assert(f.doc.querySelector('.bui-overdue'));
    assert.equal(f.doc.querySelector('[data-property="项目摘要"]'),null);
    assert.equal(f.doc.querySelector('[data-property="次数"] .bui-field-value').textContent,'0');
    assert.equal(await f.app.vault.read(f.file),f.originalText);
    assert.deepEqual(f.writes,[]);
    const adapter = f.plugin.adapters.get(f.view);
    f.fm.项目下一步 = 'Changed via native data';
    f.view.onDataUpdated();
    assert.match(f.doc.querySelector('.bui-next-step').textContent,/Changed via native data/);
    adapter.destroy();
    assert.equal(f.doc.querySelector('.bui-presentation'),null);
    assert.equal(f.native.hidden,false);
    assert.deepEqual(f.writes,[]);
  } finally {f.close();}
});
test('unknown group configuration and oversized datasets keep native view', () => {
  const f=fixture();
  try {
    f.view.config.groupBy=null;
    f.plugin.attach(f.view);
    assert.equal(f.native.hidden,false);
    assert.equal(f.doc.querySelector('.bui-presentation').hidden,true);
    f.view.config.groupBy={property:'状态'};
    f.view.data.data=Array(501).fill(f.entry);
    f.view.onDataUpdated();
    assert.equal(f.native.hidden,false);
  } finally {f.close();}
});
test('display-only URL label keeps native editable text intact', () => {
  const f=fixture();
  try {
    const cell=f.doc.createElement('div');cell.className='bases-td';cell.dataset.property='视频链接';
    const link=f.doc.createElement('div');link.className='metadata-link-inner';link.contentEditable='true';
    const original='https://www.bilibili.com/video/BV-example';
    link.textContent=original;cell.append(link);f.doc.body.append(cell);
    f.plugin.decorateTables();
    assert.equal(link.textContent,original);
    assert.equal(link.dataset.buiLabel,'查看 B 站视频 ↗');
    f.plugin.clearPresentation();
    assert.equal(link.textContent,original);
    assert.equal(link.dataset.buiLabel,undefined);
    assert.deepEqual(f.writes,[]);
  }finally{f.close();}
});
test('deadline refresh retains card nodes and keyboard focus', () => {
  const f=fixture();
  try {
    f.plugin.attach(f.view);
    const adapter=f.plugin.adapters.get(f.view);
    const card=f.doc.querySelector('.bui-card');
    const title=card.querySelector('a');
    title.focus();
    const date=card.querySelector('[data-bui-due]');
    date.dataset.buiDue='2999-01-01';
    adapter.refreshDeadlines();
    assert.equal(date.classList.contains('bui-overdue'),false);
    assert.equal(f.doc.querySelector('.bui-card'),card);
    assert.equal(f.doc.activeElement,title);
    assert.deepEqual(f.writes,[]);
  }finally{f.close();}
});
test('only explicit card/column drops delegate to native Bases mutations', () => {
  const f=fixture();
  try {
    const calls=[];
    const second={key:{toString:()=> '完成'},entries:[]};
    f.view.orderedGroups.push(second);
    f.view.moveCardToColumn=(...args)=>calls.push(['card',...args]);
    f.view.moveColumn=(...args)=>calls.push(['column',...args]);
    f.plugin.attach(f.view);
    const fire=(el,type)=>el.dispatchEvent(new f.dom.window.Event(type,{bubbles:true,cancelable:true}));
    const columns=f.doc.querySelectorAll('.bui-column');
    assert.deepEqual(calls,[]);
    fire(columns[1],'drop');
    assert.deepEqual(calls,[]);
    fire(f.doc.querySelector('.bui-card'),'dragstart');
    fire(columns[1],'drop');
    assert.deepEqual(calls[0],['card',f.file,second.key]);
    fire(columns[0].querySelector('.bui-group-heading'),'dragstart');
    fire(columns[1],'drop');
    assert.deepEqual(calls[1],['column',f.view.orderedGroups[0],1]);
    assert.deepEqual(f.writes,[]);
  }finally{f.close();}
});
test('column footer creates in its own group only after a click and is absent in read-only views', () => {
  const f=fixture();
  try {
    const calls=[];
    f.view.createNoteInGroup=group=>calls.push(group);
    f.plugin.attach(f.view);
    const button=f.doc.querySelector('.bui-column-new');
    assert(button);
    assert.equal(button.textContent,'新建');
    assert.equal(button.previousElementSibling.className,'bui-column-cards');
    assert.deepEqual(calls,[]);
    button.click();
    assert.deepEqual(calls,[f.view.orderedGroups[0]]);
    f.view.isReadOnly=true;
    f.view.onDataUpdated();
    assert.equal(f.doc.querySelector('.bui-column-new'),null);
    assert.deepEqual(f.writes,[]);
  }finally{f.close();}
});
test('table image preview uses the original source and restores attributes without writing notes', () => {
  const f=fixture();
  try {
    const root=f.doc.body.createDiv('workspace-leaf-content');
    root.innerHTML='<table><tbody><tr><td><img src="app://local/full-size.png" alt="原图" title="原来的提示"></td></tr></tbody></table><img class="outside" src="app://local/body.png">';
    f.doc.body.append(root);
    const img=root.querySelector('td img'),originalSrc=img.getAttribute('src');
    f.plugin.decorateTableImages();
    assert.equal(img.getAttribute('role'),'button');
    assert.equal(root.querySelector('.outside').hasAttribute('role'),false);
    let target;
    const listener=event=>{target=f.plugin.tableImageTarget(event);};
    f.doc.addEventListener('click',listener);
    img.dispatchEvent(new f.dom.window.MouseEvent('click',{bubbles:true,ctrlKey:true}));
    assert.equal(target,null);
    img.dispatchEvent(new f.dom.window.MouseEvent('click',{bubbles:true}));
    assert.equal(target,img);
    f.plugin.openTableImage(img);
    const full=f.doc.querySelector('.bui-image-preview img');
    assert.equal(full.getAttribute('src'),originalSrc);
    assert.equal(full.alt,'原图');
    f.plugin.clearPresentation();
    assert.equal(f.doc.querySelector('.bui-image-preview'),null);
    assert.equal(img.getAttribute('src'),originalSrc);
    assert.equal(img.title,'原来的提示');
    assert.equal(img.hasAttribute('role'),false);
    assert.equal(img.hasAttribute('tabindex'),false);
    assert.deepEqual(f.writes,[]);
  }finally{f.close();}
});

function nativeIdeaMarkup(name='想法收集箱') {
  return '<div class="bases-view" data-view-type="table" data-view-name="'+name+'">' +
    '<div class="bases-td" data-property="note.领域"><span class="multi-select-pill native-pill" data-bui-tone="existing-tone">' +
    '<span class="multi-select-pill-content">Blender</span><button class="multi-select-pill-remove">×</button></span></div>' +
    '<div class="bases-td" data-property="note.类型"><div class="metadata-input-longtext" contenteditable="true" tabindex="0">技术</div></div>' +
    '<div class="bases-td" data-property="重要性"><div class="metadata-input-longtext" contenteditable="true" tabindex="0">! !</div></div>' +
    '<div class="bases-td" data-property="note.备注"><div class="metadata-input-longtext" contenteditable="true">技术</div></div></div>';
}
test('idea styling preserves native editable nodes, text, handlers and focus; cleanup retains user edits', () => {
  const f=fixture();
  try {
    const root=f.doc.body.createDiv('workspace-leaf-content');
    root.innerHTML=nativeIdeaMarkup();
    const view=root.querySelector('.bases-view');
    const pill=view.querySelector('.multi-select-pill'), label=pill.querySelector('.multi-select-pill-content');
    const remove=pill.querySelector('button');
    const type=view.querySelector('[data-property="note.类型"] .metadata-input-longtext');
    const priority=view.querySelector('[data-property="重要性"] .metadata-input-longtext');
    const originalText=view.textContent;
    let inputEvents=0, removeEvents=0;
    type.addEventListener('input',()=>{inputEvents++;});
    remove.addEventListener('click',()=>{removeEvents++;});
    type.focus();
    f.plugin.ideaTables.refresh(f.doc);
    assert.equal(view.textContent,originalText);
    assert.equal(view.querySelector('[data-property="note.类型"] .metadata-input-longtext'),type);
    assert.equal(type.getAttribute('contenteditable'),'true');
    assert.equal(f.doc.activeElement,type);
    assert.equal(pill.dataset.buiTone,'green');
    assert.equal(type.dataset.buiTone,'green');
    assert.equal(priority.dataset.buiTone,'yellow');
    assert.equal(view.querySelectorAll('.bui-native-tag').length,3);
    assert.equal(inputEvents,0);
    assert.equal(removeEvents,0);
    const styled=view.innerHTML;
    f.plugin.ideaTables.refresh(f.doc);
    assert.equal(view.innerHTML,styled);
    assert.equal(f.doc.activeElement,type);
    // Native editors own the value and their input listeners remain live.
    type.textContent='流程';
    type.dispatchEvent(new f.dom.window.Event('input',{bubbles:true}));
    label.textContent='AI';
    priority.textContent='! ! !';
    pill.classList.add('native-selected');
    f.plugin.ideaTables.refresh(f.doc);
    assert.equal(inputEvents,1);
    assert.equal(type.dataset.buiTone,'blue');
    assert.equal(pill.dataset.buiTone,'orange');
    assert.equal(priority.dataset.buiTone,'orange');
    assert.equal(f.doc.activeElement,type);
    assert.equal(pill.querySelector('button'),remove);
    f.plugin.ideaTables.clear();
    assert.equal(root.querySelector('.bui-native-tag'),null);
    assert.equal(view.classList.contains('bui-ideas-base'),false);
    assert.equal(type.hasAttribute('data-bui-tone'),false);
    assert.equal(priority.hasAttribute('data-bui-tone'),false);
    assert.equal(pill.dataset.buiTone,'existing-tone');
    assert.equal(pill.classList.contains('native-pill'),true);
    assert.equal(pill.classList.contains('native-selected'),true);
    assert.equal(type.textContent,'流程');
    assert.equal(label.textContent,'AI');
    assert.equal(priority.textContent,'! ! !');
    assert.equal(f.doc.activeElement,type);
    remove.click();assert.equal(removeEvents,1);
    assert.deepEqual(f.writes,[]);
  }finally{f.close();}
});
test('semantic styling follows native property keys across views and safely handles unknown values, empty cells and rerenders', () => {
  const f=fixture();
  try {
    const root=f.doc.body.createDiv('workspace-leaf-content');
    root.innerHTML='<div class="markdown-rendered"><table><thead><tr><th>领域</th><th>类型</th></tr></thead><tbody><tr><td>Blender</td><td>技术</td></tr></tbody></table></div>' +
      nativeIdeaMarkup('发布记录')+nativeIdeaMarkup();
    const markdown=root.querySelector('.markdown-rendered'), other=root.querySelector('[data-view-name="发布记录"]');
    const untouched=[markdown.innerHTML,other.innerHTML], otherText=other.textContent;
    const view=root.querySelector('[data-view-name="想法收集箱"]');
    const note=view.querySelector('[data-property="note.备注"]');
    const originalNote=note.innerHTML;
    const unknown=view.querySelector('[data-property="note.类型"] .metadata-input-longtext');
    unknown.textContent='用户新建的类型';
    f.plugin.ideaTables.refresh(f.doc);
    assert.equal(markdown.innerHTML,untouched[0]);
    assert.equal(other.textContent,otherText);
    assert.equal(other.querySelectorAll('.bui-native-tag').length,3);
    assert.equal(other.classList.contains('bui-ideas-base'),false);
    assert.equal(note.innerHTML,originalNote);
    assert.equal(unknown.textContent,'用户新建的类型');
    assert(['green','orange','blue','purple','yellow'].includes(unknown.dataset.buiTone));
    const assignedTone=unknown.dataset.buiTone;
    f.plugin.ideaTables.clear();
    f.plugin.ideaTables.refresh(f.doc);
    assert.equal(unknown.dataset.buiTone,assignedTone);
    assert.equal(unknown.getAttribute('contenteditable'),'true');
    unknown.textContent='';
    f.plugin.ideaTables.refresh(f.doc);
    assert.equal(unknown.classList.contains('bui-native-tag'),false);
    assert.equal(unknown.hasAttribute('data-bui-tone'),false);
    assert.equal(unknown.textContent,'');
    // A native rerender may replace controls; old nodes are cleaned up.
    const oldPill=view.querySelector('.multi-select-pill');
    oldPill.parentElement.innerHTML='<span class="multi-select-pill"><span class="multi-select-pill-content">编程</span></span>';
    f.plugin.ideaTables.refresh(f.doc);
    assert.equal(oldPill.classList.contains('bui-native-tag'),false);
    assert.equal(oldPill.dataset.buiTone,'existing-tone');
    const newPill=view.querySelector('.multi-select-pill');
    assert.equal(newPill.dataset.buiTone,'purple');
    view.dataset.viewName='另一个视图';
    f.plugin.ideaTables.refresh(f.doc);
    assert.equal(view.classList.contains('bui-ideas-base'),false);
    assert.equal(newPill.classList.contains('bui-native-tag'),true);
    assert.equal(newPill.dataset.buiTone,'purple');
    newPill.closest('.bases-td').dataset.property='note.备注';
    f.plugin.ideaTables.refresh(f.doc);
    assert.equal(newPill.classList.contains('bui-native-tag'),false);
    assert.equal(newPill.hasAttribute('data-bui-tone'),false);
    assert.equal(newPill.textContent,'编程');
    f.plugin.ideaTables.clear();
    assert.deepEqual([markdown.innerHTML,other.innerHTML],untouched);
    assert.deepEqual(f.writes,[]);
  }finally{f.close();}
});

test('native attachment thumbnails retain editable values, link and remove handlers, and cleanly toggle off', () => {
  const f=fixture();
  try {
    const root=f.doc.body.createDiv('workspace-leaf-content');
    root.innerHTML='<div class="bases-view bui-ideas-base" data-view-type="table" data-view-name="想法收集箱">' +
      '<div class="bases-td bases-table-cell" data-property="note.文件和媒体"><span class="multi-select-pill">' +
      '<span class="multi-select-pill-content internal-link" data-href="attachments/full.png">完整图片.png</span>' +
      '<button class="multi-select-pill-remove" aria-label="删除附件">×</button></span></div></div>';
    const original=root.innerHTML;
    const pill=root.querySelector('.multi-select-pill');
    const link=pill.querySelector('.internal-link');
    const remove=pill.querySelector('button');
    let opens=0, removals=0;
    link.addEventListener('click',()=>{opens++;});
    remove.addEventListener('click',()=>{removals++;});
    f.plugin.decorateIdeaAttachments();
    f.plugin.decorateTableImages();
    const image=pill.querySelector('img');
    assert(image);
    assert.equal(image.getAttribute('src'),'app://local/attachments/full.png');
    assert.equal(image.parentNode,pill);
    assert.equal(image.closest('.internal-link'),null);
    assert.equal(pill.querySelector('.internal-link'),link);
    assert.equal(link.textContent,'完整图片.png');
    assert.equal(link.dataset.href,'attachments/full.png');
    assert.equal(pill.querySelector('button'),remove);
    assert.equal(image.getAttribute('role'),'button');
    assert.equal(opens,0);
    assert.equal(removals,0);
    f.plugin.decorateIdeaAttachments();
    f.plugin.decorateTableImages();
    assert.equal(pill.querySelectorAll('img').length,1);
    assert.equal(pill.querySelector('img'),image);
    link.click();assert.equal(opens,1);
    f.plugin.clearPresentation();
    assert.equal(root.querySelector('img'),null);
    assert.equal(root.innerHTML,original);
    assert.equal(pill.querySelector('.internal-link'),link);
    assert.equal(pill.querySelector('button'),remove);
    remove.click();assert.equal(removals,1);
    assert.deepEqual(f.writes,[]);
  }finally{f.close();}
});

function nativeIdeaWithToolbar() {
  return '<div class="bases-embed"><div class="bases-header"><div class="bases-toolbar-new-item-menu">' +
    '<div class="text-icon-button" role="button" tabindex="0">原生新建</div></div></div>' + nativeIdeaMarkup() + '</div>';
}
test('idea footer delegates only user clicks to the current native create control and leaves editable rows intact', () => {
  const f=fixture();
  try {
    const root=f.doc.body.createDiv('workspace-leaf-content');root.innerHTML=nativeIdeaWithToolbar();
    const original=root.innerHTML, view=root.querySelector('.bases-view');
    const input=view.querySelector('[contenteditable="true"]');
    const native=root.querySelector('.text-icon-button');
    const calls=[];native.addEventListener('click',()=>calls.push('old'));
    input.focus();
    f.plugin.ideaTables.refresh(f.doc);
    const footer=root.querySelector('.bui-ideas-new-row'), button=footer.querySelector('button');
    assert.equal(footer.previousElementSibling,view);
    assert.equal(view.querySelector('.bui-ideas-new-row'),null);
    assert.equal(button.textContent,'新建条目');
    assert.equal(button.type,'button');
    assert.equal(view.querySelector('[contenteditable="true"]'),input);
    assert.equal(f.doc.activeElement,input);
    assert.deepEqual(calls,[]);
    f.plugin.ideaTables.refresh(f.doc);
    assert.equal(root.querySelectorAll('.bui-ideas-new-row').length,1);
    assert.equal(root.querySelector('.bui-ideas-new-row'),footer);
    button.click();assert.deepEqual(calls,['old']);
    const replacement=native.cloneNode(true);
    replacement.addEventListener('click',()=>calls.push('current'));
    native.replaceWith(replacement);
    button.click();assert.deepEqual(calls,['old','current']);
    replacement.setAttribute('aria-disabled','true');
    button.click();assert.deepEqual(calls,['old','current']);
    f.plugin.ideaTables.refresh(f.doc);
    assert.equal(root.querySelector('.bui-ideas-new-row'),null);
    replacement.removeAttribute('aria-disabled');
    f.plugin.ideaTables.refresh(f.doc);
    const currentButton=root.querySelector('.bui-ideas-new-button');
    f.plugin.ideaTables.clear();
    assert.equal(root.innerHTML,original);
    currentButton.click();assert.deepEqual(calls,['old','current']);
    assert.deepEqual(f.writes,[]);
  }finally{f.close();}
});
test('idea footer is absent for missing, hidden and read-only native creation; rerenders and view changes remove it', () => {
  const f=fixture();
  try {
    const root=f.doc.body.createDiv('workspace-leaf-content');root.innerHTML=nativeIdeaWithToolbar();
    let view=root.querySelector('.bases-view');
    const native=root.querySelector('.text-icon-button'), header=root.querySelector('.bases-header');
    header.hidden=true;f.plugin.ideaTables.refresh(f.doc);
    assert.equal(root.querySelector('.bui-ideas-new-row'),null);
    header.hidden=false;native.style.display='none';f.plugin.ideaTables.refresh(f.doc);
    assert.equal(root.querySelector('.bui-ideas-new-row'),null);
    native.style.display='';view.setAttribute('aria-readonly','true');f.plugin.ideaTables.refresh(f.doc);
    assert.equal(root.querySelector('.bui-ideas-new-row'),null);
    view.removeAttribute('aria-readonly');f.plugin.ideaTables.refresh(f.doc);
    const oldFooter=root.querySelector('.bui-ideas-new-row');assert(oldFooter);
    const newView=f.doc.createElement('div');newView.innerHTML=nativeIdeaMarkup();
    const replacement=newView.firstElementChild;view.replaceWith(replacement);view=replacement;
    f.plugin.ideaTables.refresh(f.doc);
    assert.equal(oldFooter.isConnected,false);
    assert.equal(root.querySelectorAll('.bui-ideas-new-row').length,1);
    assert.equal(view.nextElementSibling.className,'bui-ideas-new-row');
    view.dataset.viewName='发布记录';f.plugin.ideaTables.refresh(f.doc);
    assert.equal(root.querySelector('.bui-ideas-new-row'),null);
    view.dataset.viewName='想法收集箱';header.remove();f.plugin.ideaTables.refresh(f.doc);
    assert.equal(root.querySelector('.bui-ideas-new-row'),null);
    assert.deepEqual(f.writes,[]);
  }finally{f.close();}
});

test('cards and boards derive covers from the first body image even with an old cover property', () => {
  const f=fixture();
  try {
    f.fm.封面='[[old-cover.png]]';
    f.view.config.get=key=>key==='image'?'note.封面':undefined;
    for (const type of ['kanban','cards']) {
      f.view.type=type;
      assert.equal(f.plugin.cover(f.entry,f.view),'app://local/first.png');
    }
    assert.equal(f.fm.封面,'[[old-cover.png]]');
    assert.deepEqual(f.writes,[]);
  }finally{f.close();}
});

test('reading hides cover without an auxiliary entry, editing and disabling restore the original property', () => {
  const f=fixture();
  try {
    const root=f.doc.body.createDiv('workspace-leaf-content');
    root.innerHTML='<div class="metadata-container"><div class="metadata-property" data-property-key="封面">[[old.png]]</div><div class="metadata-property" data-property-key="类型">角色</div></div>';
    const row=root.querySelector('[data-property-key="封面"]');
    let mode='preview';
    const view={containerEl:root,getMode:()=>mode};
    f.plugin.decorateNote(view);
    assert(row.classList.contains('bui-cover-property'));
    assert.equal(root.querySelector('.bui-aux-toggle'),null);
    assert.equal(row.textContent,'[[old.png]]');
    mode='source';f.plugin.decorateNote(view);
    assert(!row.classList.contains('bui-cover-property'));
    mode='preview';f.plugin.decorateNote(view);
    f.plugin.clearPresentation();
    assert(!row.classList.contains('bui-cover-property'));
    assert.deepEqual(f.writes,[]);
  }finally{f.close();}
});

test('native tag suggestions share stable colors with new values while preserving selection and callbacks', () => {
  const f=fixture();
  try {
    const root=f.doc.body.createDiv('workspace-leaf-content');root.innerHTML=nativeIdeaMarkup();
    const cell=root.querySelector('[data-property="note.类型"]');
    const input=cell.querySelector('.metadata-input-longtext');
    input.textContent='新建研究领域';input.focus();
    const popup=f.doc.body.createDiv('suggestion-container mod-property-value');popup.dataset.propertyKey='类型';
    const option=popup.createDiv('suggestion-item is-selected');option.textContent='新建研究领域';
    let clicks=0;option.addEventListener('click',()=>clicks++);
    f.plugin.ideaTables.refresh(f.doc);
    assert.equal(option.dataset.buiTone,input.dataset.buiTone);
    assert(option.classList.contains('is-selected'));
    assert.equal(f.doc.activeElement,input);
    option.click();assert.equal(clicks,1);
    input.blur();f.plugin.ideaTables.refresh(f.doc);
    assert(!option.classList.contains('bui-native-tag'));
    assert(option.classList.contains('is-selected'));
    assert.equal(option.textContent,'新建研究领域');
    assert.deepEqual(f.writes,[]);
  }finally{f.close();}
});

test('classification widths use native geometry, include unseen new labels, preserve wider choices and restore accessors', () => {
  const f=fixture();
  try {
    const host=f.view.queryController.viewContainerEl;
    host.dataset.viewName='想法收集箱';host.dataset.viewType='table';
    host.getBoundingClientRect=()=>({width:800,height:300});
    f.native.innerHTML='<div class="bases-td" data-property="note.领域"><div class="multi-select-container" style="padding:2px 8px;gap:2px"><div class="multi-select-pill" style="gap:2px"><span class="multi-select-pill-content" style="font-size:14px">AI</span><span class="multi-select-pill-remove-button" style="width:14px"></span></div><div class="multi-select-input" style="font-size:14px;min-width:8px"></div></div></div>';
    const originalRect=f.dom.window.HTMLElement.prototype.getBoundingClientRect;
    f.dom.window.HTMLElement.prototype.getBoundingClientRect=function() {
      if (this.tagName==='SPAN' && this.style.position==='fixed') return {width:[...this.textContent].reduce((sum,c)=>sum+(c.charCodeAt(0)>127?14:8),0),height:18};
      if (this.classList.contains('multi-select-pill-remove-button')) return {width:14,height:14};
      return originalRect.call(this);
    };
    const header=f.doc.createElement('div');header.innerHTML='<div class="header-inner" style="padding:0 8px;gap:4px"><span class="bases-table-header-icon"></span><span class="bases-table-header-name" style="font-size:14px">领域</span></div>';host.prepend(header);
    const nativeWidth=function(min,max){assert.equal(this.marker,'native');return Math.max(min,Math.min(max,this.customWidth));};
    const info=Object.assign(Object.create({getWidth:nativeWidth}),{marker:'native',customWidth:65});
    const titleInfo={getWidth:()=>329};
    const items=[['AI'],['离屏新增的中文标签']];
    Object.assign(f.view,{type:'table',config:{name:'想法收集箱'},data:{properties:['note.领域','formula.想法'],data:items.map(tags=>({getValue:()=>({data:tags.map(data=>({data}))})}))},columnInfo:{'note.领域':info,'formula.想法':titleInfo},header:{cells:[{prop:'note.领域',el:header,innerEl:header.firstElementChild}]},getRowHeightMult:()=>2,getRowBaseHeight:()=>22});
    assert.equal(f.plugin.ideaWidths.refresh(f.view),true);
    assert(info.getWidth(50,400)>65);
    const minimum=info.getWidth(50,400);
    assert.equal(f.plugin.ideaWidths.refresh(f.view),false);
    assert.equal(info.customWidth,65);
    assert.equal(titleInfo.getWidth(),329);
    items[1].push('另外一个很长的标签','第三个特别长的新增标签');
    assert.equal(f.plugin.ideaWidths.refresh(f.view),true);
    assert(info.getWidth(50,400)>minimum);
    info.customWidth=1000;
    assert.equal(info.getWidth(50,2000),1000);
    f.plugin.ideaWidths.clear();
    assert.equal(info.getWidth,nativeWidth);
    assert.equal(Object.hasOwn(info,'getWidth'),false);
    assert.equal(info.customWidth,1000);
    assert.deepEqual(f.writes,[]);
  }finally{f.close();}
});

test('new tag names cannot collide with JavaScript object prototype properties', () => {
  const f=fixture();
  try {
    f.doc.body.innerHTML=nativeIdeaMarkup();
    const input=f.doc.querySelector('[data-property="note.类型"] .metadata-input-longtext');
    for(const text of ['constructor','toString','__proto__']) {
      input.textContent=text;f.plugin.ideaTables.refresh(f.doc);
      assert(['green','orange','blue','purple','yellow'].includes(input.dataset.buiTone));
    }
  }finally{f.close();}
});

test('explicit option order saves are serialized, preserve other settings, and recover after a failed save', async () => {
  const f = fixture();
  try {
    const saved = []; let release;
    f.plugin.uiSettings = {otherPreference: true, tagOptionOrder: {existing: ['kept']}};
    f.plugin.saveData = async value => {
      if (!saved.length) await new Promise(resolve => {release = resolve;});
      saved.push(JSON.parse(JSON.stringify(value)));
    };
    const first = f.plugin.saveTagOrder('domain', ['AI', 'Blender']);
    const second = f.plugin.saveTagOrder('type', ['流程', '技术']);
    await Promise.resolve(); assert.equal(saved.length, 0); release();
    await Promise.all([first, second]);
    assert.deepEqual(saved[1], {otherPreference:true, tagOptionOrder:{existing:['kept'],domain:['AI','Blender'],type:['流程','技术']}});
    f.plugin.saveData = async () => {throw Error('disk unavailable');};
    await assert.rejects(f.plugin.saveTagOrder('domain', ['Blender']), /disk unavailable/);
    assert.deepEqual(Array.from(f.plugin.uiSettings.tagOptionOrder.domain), ['AI', 'Blender']);
    f.plugin.saveData = async value => saved.push(JSON.parse(JSON.stringify(value)));
    await f.plugin.saveTagOrder('domain', ['Blender', 'AI']);
    assert.deepEqual(saved.at(-1).tagOptionOrder.domain, ['Blender', 'AI']);
    f.plugin.settingsAvailable = false;
    await assert.rejects(f.plugin.saveTagOrder('domain', ['AI']), /unavailable/);
    assert.equal(saved.length, 3);
    assert.deepEqual(f.writes, []);
  } finally {f.close();}
});


test('unloading during settings load cannot resurrect decorations or listeners', async () => {
  const f = fixture();
  let resolve;
  f.plugin.loadData = () => new Promise(done => { resolve = done; });
  const loading = f.plugin.onload();
  f.plugin.onunload();
  resolve({tagOptionOrder: {}});
  await loading;
  assert.equal(f.doc.body.classList.contains('bui-enabled'), false);
  assert.equal(f.plugin.adapters.size, 0);
  assert.equal(f.plugin.disposed, true);
});
