const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {buildSync} = require('esbuild');
const {JSDOM} = require('jsdom');
const code = buildSync({entryPoints:['src/idea-tag-editor.ts'],bundle:true,write:false,
  platform:'node',format:'cjs',external:['obsidian']}).outputFiles[0].text;

function fixture({delayed=false, failed=false, orderStore, basePath='Bases/想法收集箱.base', sourcePath='Dashboard.md',
  name='想法收集箱', profile, records}={}) {
  const dom = new JSDOM('<!doctype html><body><button id="outside">Outside</button><div class="bases-view"><div class="bases-table-container" tabindex="0"></div></div></body>', {pretendToBeVisual:true});
  const win=dom.window, doc=win.document, host=doc.querySelector('.bases-view'), container=doc.querySelector('.bases-table-container');
  const writes=[], notices=[], native={pointerdown:0,click:0,keydown:0}, cells=new Map();
  const makeEntry=(path,raw)=>({file:{path,extension:'md'},raw,getRawProperty(name){return this.raw[name];}});
  const entry=makeEntry('ideas/one.md',records?.[0]??{领域:['Blender'],类型:'技术',重要性:'!'});
  const other=makeEntry('ideas/two.md',records?.[1]??{领域:['AI','编程','C4D'],类型:'内容选题',重要性:'! !'});
  const filteredOut=makeEntry('ideas/three.md',records?.[2]??{领域:['Blender'],类型:'流程',重要性:'! ! !'});
  const view={type:'table',_loaded:true,containerEl:container,config:{name,nebulaTable:profile,query:{file:{path:basePath}}},
    queryController:{sourcePath:()=>sourcePath,viewContainerEl:host,results:new Map([[entry.file,entry],[other.file,other],[filteredOut.file,filteredOut]])},
    data:{data:[entry,other],groupedData:[{entries:[entry,other]}]},
    getCellFromDom:el=>cells.get(el.closest('.bases-td')),
    getCellIndex:cell=>({groupIdx:0,row:0,column:view.rows[0].cells.indexOf(cell)}),
    focus:()=>container.focus(),
    async updateProperty(file,property,value){
      writes.push({file,property,value:structuredClone(value)});
      if (failed) throw Error('native failure');
      if (!delayed) entry.raw[property]=structuredClone(value);
    },
    app:{vault:{modify(){throw Error('Direct vault write');},process(){throw Error('Direct vault write');}}},
  };
  view.queryController.view=view;
  const row={entry,cells:[]}; view.rows=[row];
  for (const property of Object.keys(entry.raw)) {
    const anchor=doc.createElement('div'); anchor.className='bases-td'; anchor.dataset.property='note.'+property;
    anchor.innerHTML='<div class="bases-table-cell"><div class="metadata-input-longtext" tabindex="0" contenteditable="true"></div></div>';
    anchor.querySelector('.metadata-input-longtext').textContent=String(entry.raw[property]);
    const cell={el:anchor,prop:'note.'+property,renderer:{entry,propertyEditor:{},el:anchor.firstElementChild}};
    row.cells.push(cell); cells.set(anchor,cell); container.append(anchor);
    anchor.getBoundingClientRect=()=>({left:120,right:260,top:90,bottom:120,width:140,height:30});
  }
  for (const type of Object.keys(native)) container.addEventListener(type,()=>native[type]++,true);
  const module={exports:{}};
  new vm.Script(code).runInContext(vm.createContext({module,exports:module.exports,
    require:name=>{assert.equal(name,'obsidian');return {Notice:class{constructor(message){notices.push(message);}},setIcon(el,name){el.dataset.icon=name;}};},
    console,
  }));
  const editor=new module.exports.IdeaTagEditors(orderStore); editor.attach(view);
  const mouse=(el,type='click',extra={})=>el.dispatchEvent(new win.MouseEvent(type,{bubbles:true,cancelable:true,button:0,...extra}));
  const anchor=property=>container.querySelector(`[data-property="note.${property}"]`);
  const open=(property='类型')=>{mouse(anchor(property),'pointerdown');mouse(anchor(property),'mousedown');mouse(anchor(property));return doc.querySelector('.bui-tag-editor');};
  const input=()=>doc.querySelector('.bui-tag-editor-search');
  const type=value=>{input().value=value;input().dispatchEvent(new win.Event('input',{bubbles:true}));};
  const key=(key,extra={})=>input().dispatchEvent(new win.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...extra}));
  const option=value=>[...doc.querySelectorAll('.bui-tag-editor-option')].find(el=>el.querySelector('.bui-tag-editor-chip').firstChild.textContent===value);
  const remove=value=>doc.querySelector(`[aria-label="移除 ${value}"]`);
  const options=()=>[...doc.querySelectorAll('.bui-tag-editor-option')].map(el=>el.dataset.value);
  const pointer=(el,eventType,extra={})=>{
    const event=new win.MouseEvent(eventType,{bubbles:true,cancelable:true,button:0,clientX:140,clientY:176,...extra});
    Object.defineProperties(event,{pointerId:{value:extra.pointerId??1},pointerType:{value:extra.pointerType??'mouse'}}); return el.dispatchEvent(event);
  };
  const geometry=()=>{
    const list=doc.querySelector('.bui-tag-editor-options');
    list.getBoundingClientRect=()=>({left:120,right:360,top:160,bottom:280,width:240,height:120});
    for (const row of list.children) row.getBoundingClientRect=()=>{
      const index=[...list.children].indexOf(row),top=160+index*32;
      return {left:120,right:360,top,bottom:top+32,width:240,height:32};
    };
    return list;
  };
  const tick=()=>new Promise(resolve=>win.setTimeout(resolve,0));
  return {dom,win,doc,view,entry,other,filteredOut,editor,writes,notices,native,container,host,anchor,open,input,type,key,option,options,remove,mouse,pointer,geometry,tick,
    close(){editor.clear();dom.window.close();}};
}

test('popover snapshots the actual cell typography once and preserves mobile text scaling',()=>{
  const f=fixture();try{
    f.doc.body.classList.add('is-mobile');
    const value=f.anchor('类型').querySelector('.metadata-input-longtext');
    value.style.cssText='font-size:19px;font-family:"Source Han Sans";font-weight:400;line-height:25px';
    const popup=f.open();
    assert.equal(popup.style.getPropertyValue('--bui-source-tag-font-size'),'19px');
    assert.equal(popup.style.getPropertyValue('--bui-source-tag-font-family'),'"Source Han Sans"');
    assert.equal(popup.style.getPropertyValue('--bui-source-tag-font-weight'),'400');
    assert.equal(popup.style.getPropertyValue('--bui-source-tag-line-height'),'25px');
    value.style.fontSize='22px';
    f.win.dispatchEvent(new f.win.Event('resize'));
    assert.equal(popup.style.getPropertyValue('--bui-source-tag-font-size'),'19px','viewport movement does not remeasure fonts');
    f.key('Escape');
    assert.equal(f.open().style.getPropertyValue('--bui-source-tag-font-size'),'22px','reopening picks up the current user font setting');
    assert.deepEqual(f.writes,[]);
  }finally{f.close();}
});

test('compact cell markers only cover working pickers and restore native controls on fallback or teardown',()=>{
  const f=fixture();try{
    const area=f.anchor('领域'),type=f.anchor('类型'),importance=f.anchor('重要性');
    const marked=el=>el.classList.contains('bui-tag-picker-cell');
    assert.ok(marked(area)&&marked(type)&&marked(importance));
    f.entry.raw.领域='unexpected scalar';f.editor.attach(f.view);
    assert.equal(marked(area),false,'unsupported values keep native controls');
    assert.equal(marked(type),true);
    f.entry.raw.领域=['Blender'];f.view.rows[0].cells[1].renderer.propertyEditor=null;
    importance.firstElementChild.setAttribute('disabled','true');f.editor.attach(f.view);
    assert.equal(marked(area),true);assert.equal(marked(type),false);assert.equal(marked(importance),false);
    f.view.isReadOnly=true;f.editor.attach(f.view);
    assert.equal(marked(area),false,'read-only changes remove the compact marker');
    f.view.isReadOnly=false;f.editor.attach(f.view);assert.equal(marked(area),true);
    area.remove();f.editor.attach(f.view);assert.equal(marked(area),false,'recycled cells do not retain picker styling');
    f.container.append(area);f.editor.attach(f.view);assert.equal(marked(area),true);
    f.view.updateProperty=undefined;f.editor.attach(f.view);assert.equal(marked(area),false,'unknown adapters restore native controls');
    assert.deepEqual(f.writes,[]);
  }finally{f.close();}
});

test('related-page values never enter the classification picker even with an incorrect select hint',()=>{
  const f=fixture();try{
    const area=f.anchor('领域');
    f.entry.raw.领域=['[[Projects/A|项目 A]]'];f.editor.attach(f.view);
    assert.equal(area.classList.contains('bui-tag-picker-cell'),false);
    assert.equal(f.open('领域'),null);assert.equal(f.writes.length,0);
    f.entry.raw.领域=['Blender'];area.firstElementChild.innerHTML='<a class="internal-link" href="Projects/A">项目 A</a>';
    f.editor.attach(f.view);assert.equal(area.classList.contains('bui-tag-picker-cell'),false);
    assert.equal(f.open('领域'),null);
    assert.ok(f.open('类型'),'ordinary classification cells retain the picker');
  }finally{f.close();}
});

test('clearing the picker removes compact markers from every guarded cell',()=>{
  const f=fixture();try{
    assert.equal(f.doc.querySelectorAll('.bui-tag-picker-cell').length,3);
    f.editor.clear();assert.equal(f.doc.querySelectorAll('.bui-tag-picker-cell').length,0);
  }finally{f.close();}
});

test('open, search, Escape and outside close do not write or enter native whole-cell editing',async()=>{
  const f=fixture();
  try {
    const popup=f.open(); assert.ok(popup); assert.equal(popup.style.left,'120px'); assert.equal(popup.style.width,'240px');
    assert.equal(f.native.pointerdown,0); assert.equal(f.native.click,0);
    assert.equal(f.input().placeholder,'选择或创建一个选项');
    assert.equal(popup.querySelector('.bui-tag-editor-chip').dataset.buiTone,'green');
    f.type('未保存的选项'); f.key('Escape');
    assert.equal(f.doc.querySelector('.bui-tag-editor'),null); assert.equal(f.doc.activeElement,f.container); assert.deepEqual(f.writes,[]);
    f.open(); f.type('另一个未保存的选项'); f.mouse(f.doc.querySelector('#outside'),'pointerdown');
    assert.equal(f.doc.querySelector('.bui-tag-editor'),null); assert.deepEqual(f.writes,[]);
  } finally {f.close();}
});

test('a touch pan starting on a tag cell stays scrollable and does not open the editor on release',()=>{
  const f=fixture();try{
    const cell=f.anchor('领域');
    assert.equal(f.pointer(cell,'pointerdown',{pointerType:'touch'}),true,'touch default scroll is not cancelled');
    f.pointer(cell,'pointermove',{pointerType:'touch',clientY:220});f.pointer(cell,'pointerup',{pointerType:'touch',clientY:220});f.mouse(cell);
    assert.equal(f.doc.querySelector('.bui-tag-editor'),null);assert.deepEqual(f.writes,[]);
    f.pointer(cell,'pointerdown',{pointerType:'touch'});f.pointer(cell,'pointerup',{pointerType:'touch'});f.mouse(cell);
    assert.ok(f.doc.querySelector('.bui-tag-editor'),'the next intentional tap still opens the picker');
  }finally{f.close();}
});

test('touch scrolling options or pointer cancellation never selects a tag, and a subsequent tap still saves',async()=>{
  const f=fixture();try{
    f.open('领域');let option=f.option('AI');
    f.pointer(option,'pointerdown',{pointerType:'touch'});f.pointer(option,'pointermove',{pointerType:'touch',clientY:220});
    f.pointer(option,'pointercancel',{pointerType:'touch'});f.mouse(option);await f.tick();assert.deepEqual(f.writes,[]);
    f.pointer(option,'pointerdown',{pointerType:'touch'});f.pointer(option,'pointerup',{pointerType:'touch'});f.mouse(option);await f.tick();
    assert.deepEqual(f.writes[0].value,['Blender','AI']);
  }finally{f.close();}
});

test('a phone tap opens choices without focusing search; selecting or removing values never requests the keyboard',async()=>{
  const f=fixture();try{
    f.doc.body.classList.add('is-mobile');const popup=f.open('领域'),input=f.input();
    assert.equal(f.doc.activeElement,popup);let inputFocuses=0;const focus=input.focus.bind(input);
    input.focus=(...args)=>{inputFocuses++;focus(...args);};
    assert.equal(f.pointer(input,'pointerdown',{pointerType:'touch'}),true,'direct input taps retain native focus');
    input.focus();assert.equal(f.doc.activeElement,input);
    f.mouse(f.anchor('领域'));assert.equal(f.doc.activeElement,popup,'repeated cell activation returns to choices');
    f.pointer(f.option('AI'),'pointerdown',{pointerType:'touch'});f.pointer(f.option('AI'),'pointerup',{pointerType:'touch'});f.mouse(f.option('AI'));await f.tick();
    assert.deepEqual(f.writes[0].value,['Blender','AI']);assert.equal(f.doc.activeElement,popup);
    f.mouse(f.option('AI'));await f.tick();assert.deepEqual(f.writes[1].value,['Blender']);
    assert.equal(inputFocuses,1,'only the explicit input tap focused search');
  }finally{f.close();}
});

test('phone hardware-keyboard activation keeps search focus while a touch grip drag cannot reopen it',async()=>{
  const f=fixture();try{
    f.doc.body.classList.add('bui-touch');f.view.activeCell={groupIdx:0,row:0,column:0};f.container.focus();
    f.container.dispatchEvent(new f.win.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
    const input=f.input(),popup=f.doc.querySelector('.bui-tag-editor');assert.equal(f.doc.activeElement,input);
    let inputFocuses=0;const focus=input.focus.bind(input);input.focus=(...args)=>{inputFocuses++;focus(...args);};
    f.geometry();const grip=f.option('Blender').querySelector('.bui-tag-editor-grip');
    f.pointer(grip,'pointerdown',{pointerType:'touch'});f.pointer(f.doc,'pointermove',{pointerType:'touch',clientY:278});
    f.pointer(f.doc,'pointerup',{pointerType:'touch',clientY:278});await f.tick();
    assert.deepEqual(f.options(),['AI','编程','C4D','Blender']);assert.equal(f.doc.activeElement,popup);
    assert.equal(inputFocuses,0);assert.deepEqual(f.writes,[],'reordering changes candidate order only');
  }finally{f.close();}
});

test('the cell picker follows keyboard visualViewport changes and unsubscribes after Escape',()=>{
  const f=fixture();try{
    const viewport=new f.win.EventTarget();Object.assign(viewport,{width:320,height:568,offsetTop:0,offsetLeft:0});
    Object.defineProperty(f.win,'visualViewport',{value:viewport});const popup=f.open('领域');
    popup.getBoundingClientRect=()=>({height:300});viewport.height=240;viewport.offsetTop=40;viewport.dispatchEvent(new f.win.Event('resize'));
    assert.equal(popup.style.maxHeight,'224px');assert.equal(popup.style.top,'48px');assert.equal(popup.style.left,'72px');
    f.key('Escape');const top=popup.style.top;viewport.offsetTop=100;viewport.dispatchEvent(new f.win.Event('scroll'));
    assert.equal(popup.style.top,top);assert.deepEqual(f.writes,[]);
  }finally{f.close();}
});

test('options use this database query results, including entries outside the visible filtered data',()=>{
  const f=fixture();
  try {
    f.open(); assert.ok(f.option('技术')); assert.ok(f.option('内容选题')); assert.ok(f.option('流程'));
    assert.equal(f.doc.querySelectorAll('.bui-tag-editor-option').length,3);
    assert.equal(f.option('内容选题').getAttribute('role'),'option');
    assert.ok(f.option('内容选题').querySelector('.bui-native-tag[data-bui-tone="yellow"]'));
  } finally {f.close();}
});

test('clicking a checked single option clears it through the native string transaction',async()=>{
  const f=fixture();
  try {
    f.open(); assert.equal(f.option('技术').getAttribute('aria-selected'),'true');
    assert.equal(f.doc.querySelector('.bui-tag-editor-selected button'),null);
    f.mouse(f.option('技术')); await f.tick(); assert.equal(f.writes[0].value,'');
    assert.equal(f.doc.querySelector('.bui-tag-editor'),null);
    f.open(); f.mouse(f.option('内容选题')); await f.tick();
    assert.equal(f.writes.length,2); assert.equal(f.writes[1].file,f.entry.file);
    assert.equal(f.writes[1].property,'类型'); assert.equal(f.writes[1].value,'内容选题');
    f.open('重要性'); f.mouse(f.option('! ! !')); await f.tick();
    assert.equal(f.writes[2].property,'重要性'); assert.equal(f.writes[2].value,'! ! !');
  } finally {f.close();}
});

test('checked multi options toggle off without chip remove buttons and arrays stay arrays',async()=>{
  const f=fixture();
  try {
    f.open('领域'); assert.equal(f.doc.querySelector('.bui-tag-editor-selected button'),null);
    f.mouse(f.option('AI')); await f.tick();
    assert.deepEqual(f.writes[0].value,['Blender','AI']); assert.ok(f.doc.querySelector('.bui-tag-editor'));
    assert.equal(f.option('AI').getAttribute('aria-selected'),'true');
    f.mouse(f.option('Blender')); await f.tick(); assert.deepEqual(f.writes[1].value,['AI']);
    assert.equal(f.option('Blender').getAttribute('aria-selected'),'false');
    f.mouse(f.option('AI')); await f.tick(); assert.deepEqual(f.writes[2].value,[]);
    assert.equal(f.doc.querySelector('.bui-tag-editor-selected').hidden,true);
  } finally {f.close();}
});

test('query acknowledgement serializes rapid selections and preserves earlier committed values',async()=>{
  const f=fixture({delayed:true});
  try {
    f.open('领域'); f.mouse(f.option('AI')); await f.tick();
    f.mouse(f.option('编程')); await f.tick();
    assert.equal(f.writes.length,1,'no second write before the first selection is visible');
    f.entry.raw.领域=['Blender','AI']; f.editor.attach(f.view);
    f.mouse(f.option('编程')); await f.tick();
    assert.deepEqual(f.writes[1].value,['Blender','AI','编程']);
    f.entry.raw.领域=['Blender','AI','编程'];f.editor.attach(f.view);
    f.mouse(f.option('C4D')); await f.tick();
    assert.deepEqual(f.writes[2].value,['Blender','AI','编程','C4D']);
    // A genuinely different acknowledged external edit wins over a pending
    // notification, without replaying our earlier transaction.
    f.entry.raw.领域=['外部修改']; f.editor.attach(f.view);
    f.mouse(f.option('AI')); await f.tick();
    assert.deepEqual(f.writes[3].value,['外部修改','AI']);
  } finally {f.close();}
});

test('creating a custom option requires explicit confirmation and ignores IME confirmation Enter',async()=>{
  const f=fixture();
  try {
    f.open(); f.type('  新的类型  ');
    assert.ok(f.option('新的类型').classList.contains('bui-tag-editor-create'));
    assert.equal(f.writes.length,0);
    f.input().dispatchEvent(new f.win.CompositionEvent('compositionstart',{bubbles:true}));
    f.key('Enter'); assert.equal(f.writes.length,0);
    f.input().dispatchEvent(new f.win.CompositionEvent('compositionend',{bubbles:true}));
    f.key('Enter'); assert.equal(f.writes.length,0);
    await f.tick(); f.key('Enter'); await f.tick();
    assert.equal(f.writes[0].value,'新的类型');
    assert.equal(typeof f.writes[0].value,'string');
  } finally {f.close();}
});

test('creating a domain preserves an array, while clearing a scalar preserves text type',async()=>{
  const f=fixture();
  try {
    f.open('领域'); f.type('新的领域'); f.key('Enter'); await f.tick();
    assert.deepEqual(f.writes[0].value,['Blender','新的领域']);
    f.key('Escape'); f.open('类型'); f.mouse(f.option('技术')); await f.tick();
    assert.equal(f.writes[1].property,'类型'); assert.equal(f.writes[1].value,'');
    assert.equal(f.doc.querySelector('.bui-tag-editor'),null);
  } finally {f.close();}
});

test('an in-flight explicit save is not duplicated, and closing cannot reopen the editor on completion',async()=>{
  const f=fixture();
  try {
    let finish;
    f.view.updateProperty=(file,property,value)=>{
      f.writes.push({file,property,value:structuredClone(value)});
      return new Promise(resolve=>{finish=resolve;});
    };
    f.open('领域'); f.mouse(f.option('AI')); f.mouse(f.option('编程'));
    assert.equal(f.writes.length,1); assert.equal(f.doc.querySelector('.bui-tag-editor').getAttribute('aria-busy'),'true');
    f.key('Escape'); finish(); await f.tick();
    assert.equal(f.doc.querySelector('.bui-tag-editor'),null); assert.equal(f.writes.length,1);
  } finally {f.close();}
});

test('keyboard opens the native active tag cell and navigates list choices without native Enter handling',async()=>{
  const f=fixture();
  try {
    f.view.activeCell={groupIdx:0,row:0,column:1}; f.container.focus();
    f.container.dispatchEvent(new f.win.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
    assert.ok(f.input()); assert.equal(f.native.keydown,0);
    f.key('ArrowDown'); assert.equal(f.option('内容选题').classList.contains('is-active'),true);
    f.key('Enter'); await f.tick(); assert.equal(f.writes[0].value,'内容选题');
    f.open(); f.doc.querySelector('#outside').focus();
    assert.equal(f.doc.querySelector('.bui-tag-editor'),null);
  } finally {f.close();}
});

test('read-only, unsupported and unrecognised cells keep their native editor; changing permissions prevents writes',async()=>{
  const f=fixture();
  try {
    f.view.isReadOnly=true; assert.equal(f.open(),null); assert.ok(f.native.click>0);
    f.view.isReadOnly=false; f.anchor('类型').firstElementChild.setAttribute('disabled',''); assert.equal(f.open(),null);
    f.anchor('类型').firstElementChild.removeAttribute('disabled');
    f.entry.raw.领域='unexpected scalar'; assert.equal(f.open('领域'),null);
    f.entry.raw.领域=['Blender']; f.open(); f.view.isReadOnly=true;
    f.mouse(f.option('流程')); await f.tick(); assert.equal(f.writes.length,0); assert.equal(f.doc.querySelector('.bui-tag-editor'),null);
  } finally {f.close();}
});

test('controller-only read-only changes and owner replacement block open and pending tag selection',async()=>{
  for (const invalidate of [view=>{view.queryController.isReadOnly=true;},view=>{view.queryController.view={};}]) {
    const f=fixture();
    try {
      invalidate(f.view); assert.equal(f.open(),null);
      f.view.queryController.isReadOnly=false; f.view.queryController.view=f.view;
      assert.ok(f.open()); invalidate(f.view);
      f.mouse(f.option('流程')); await f.tick();
      assert.equal(f.writes.length,0); assert.equal(f.doc.querySelector('.bui-tag-editor'),null);
      assert.equal(f.entry.raw.类型,'技术');
    } finally {f.close();}
  }
});

test('recycled virtual cells, removed records and unloaded views cannot submit to a stale target',async()=>{
  const f=fixture();
  try {
    f.open(); const cell=f.view.getCellFromDom(f.anchor('类型')); cell.renderer.entry=f.other;
    f.mouse(f.option('流程')); await f.tick(); assert.equal(f.writes.length,0);
    cell.renderer.entry=f.entry; f.open(); f.view.queryController.results.delete(f.entry.file); f.editor.prune();
    assert.equal(f.doc.querySelector('.bui-tag-editor'),null);
    f.view.queryController.results.set(f.entry.file,f.entry); f.open(); f.view._loaded=false; f.editor.prune();
    assert.equal(f.doc.querySelector('.bui-tag-editor'),null); assert.equal(f.writes.length,0);
  } finally {f.close();}
});

test('failed native saves retain the selected data and expose a retry message',async()=>{
  const f=fixture({failed:true});
  try {
    f.open('领域'); f.mouse(f.option('AI')); await f.tick();
    assert.equal(f.writes.length,1); assert.ok(f.doc.querySelector('.bui-tag-editor'));
    assert.equal(f.doc.querySelector('.bui-tag-editor-status').textContent,'未能保存，请重试');
    assert.equal(f.option('AI').getAttribute('aria-selected'),'false'); assert.equal(f.option('Blender').getAttribute('aria-selected'),'true'); assert.deepEqual(f.entry.raw.领域,['Blender']);
  } finally {f.close();}
});

test('clear removes the popover and interceptors; modified clicks always remain native',()=>{
  const f=fixture();
  try {
    f.mouse(f.anchor('类型'),'click',{metaKey:true}); assert.equal(f.doc.querySelector('.bui-tag-editor'),null); assert.equal(f.native.click,1);
    f.open(); f.editor.clear(); assert.equal(f.doc.querySelector('.bui-tag-editor'),null);
    const before=f.native.click; f.mouse(f.anchor('类型')); assert.equal(f.native.click,before+1);
  } finally {f.close();}
});

test('pointer grip previews candidate order and persists only on drop, without changing note values',async()=>{
  const saved=[];
  const f=fixture({orderStore:{read:()=>undefined,write:(key,values)=>saved.push({key,values:structuredClone(values)})}});
  try {
    f.open(); f.geometry();
    const grip=f.option('技术').querySelector('.bui-tag-editor-grip');
    assert.ok(grip); assert.equal(grip.dataset.icon,'grip-vertical');
    f.pointer(grip,'pointerdown'); f.pointer(f.doc,'pointermove',{clientY:260});
    assert.deepEqual(f.options(),['内容选题','流程','技术']); assert.equal(saved.length,0); assert.equal(f.writes.length,0);
    assert.ok(f.option('技术').classList.contains('is-dragging'));
    f.pointer(f.doc,'pointerup',{clientY:260}); await f.tick();
    assert.deepEqual(saved,[{key:JSON.stringify(['Bases/想法收集箱.base','类型']),values:['内容选题','流程','技术']}]);
    assert.deepEqual(f.options(),['内容选题','流程','技术']); assert.equal(f.writes.length,0);
    // A platform-synthesized post-drag click must not select the dropped option.
    f.mouse(f.option('流程')); await f.tick(); assert.equal(f.writes.length,0);
    // A new intentional press still selects normally.
    f.pointer(f.option('流程'),'pointerdown'); f.pointer(f.option('流程'),'pointerup'); f.mouse(f.option('流程')); await f.tick();
    assert.equal(f.writes.length,1); assert.equal(f.writes[0].value,'流程');
  } finally {f.close();}
});

test('Escape, pointer cancellation, outside drop and a stationary grip never persist a preview',async()=>{
  const saved=[];
  const f=fixture({orderStore:{read:()=>undefined,write:(...args)=>saved.push(args)}});
  try {
    for (const cancel of ['escape','pointercancel','outside','stationary']) {
      f.open(); f.geometry();
      f.pointer(f.option('技术').querySelector('.bui-tag-editor-grip'),'pointerdown');
      if (cancel!=='stationary') f.pointer(f.doc,'pointermove',{clientY:260});
      if (cancel==='escape') f.key('Escape');
      else if (cancel==='pointercancel') f.pointer(f.doc,'pointercancel');
      else f.pointer(f.doc,'pointerup',{clientX:cancel==='outside'?500:140,clientY:cancel==='stationary'?176:260});
      await f.tick(); assert.deepEqual(f.options(),['技术','内容选题','流程']);
      assert.equal(saved.length,0); assert.equal(f.writes.length,0); f.key('Escape');
    }
  } finally {f.close();}
});

test('Alt arrows reorder from search or a focused grip, retain focus, and do not change selected arrays',async()=>{
  const saved=[];
  const f=fixture({orderStore:{read:()=>undefined,write:(key,values)=>saved.push({key,values:structuredClone(values)})}});
  try {
    f.open('领域'); f.key('ArrowDown',{altKey:true}); await f.tick();
    assert.deepEqual(f.options(),['AI','Blender','编程','C4D']); assert.deepEqual(f.entry.raw.领域,['Blender']);
    const grip=f.option('C4D').querySelector('.bui-tag-editor-grip'); grip.focus();
    grip.dispatchEvent(new f.win.KeyboardEvent('keydown',{key:'ArrowUp',altKey:true,bubbles:true,cancelable:true})); await f.tick();
    assert.deepEqual(f.options(),['AI','Blender','C4D','编程']);
    assert.equal(f.doc.activeElement,f.option('C4D').querySelector('.bui-tag-editor-grip'));
    assert.equal(saved.length,2); assert.equal(f.writes.length,0);
    f.key('Escape'); f.open('领域'); assert.deepEqual(f.options(),['AI','Blender','C4D','编程']);
  } finally {f.close();}
});

test('search hides grips and cannot reorder partial results; clearing search restores complete order',async()=>{
  const saved=[];
  const f=fixture({orderStore:{read:()=>['流程','技术','内容选题'],write:(...args)=>saved.push(args)}});
  try {
    f.open(); assert.deepEqual(f.options(),['流程','技术','内容选题']);
    f.type('技'); assert.equal(f.doc.querySelector('.bui-tag-editor-grip'),null);
    f.key('ArrowDown',{altKey:true}); await f.tick(); assert.equal(saved.length,0); assert.equal(f.writes.length,0);
    f.type(''); assert.deepEqual(f.options(),['流程','技术','内容选题']); assert.ok(f.doc.querySelector('.bui-tag-editor-grip'));
  } finally {f.close();}
});

test('stored order is scoped by Base path and field, shared by embeds, and preserves temporarily absent options',async()=>{
  const data=new Map([[JSON.stringify(['Bases/想法收集箱.base','类型']),['技术','暂不可见','流程','内容选题']]]),saved=[];
  const store={read:key=>data.get(key),write:(key,values)=>{data.set(key,structuredClone(values));saved.push(key);}};
  const f=fixture({orderStore:store,sourcePath:'Embedding.md'});
  try {
    f.open(); assert.deepEqual(f.options(),['技术','流程','内容选题']);
    f.key('ArrowDown',{altKey:true}); await f.tick();
    assert.deepEqual(data.get(JSON.stringify(['Bases/想法收集箱.base','类型'])),['流程','暂不可见','技术','内容选题']);
    f.key('Escape'); f.open('领域'); assert.deepEqual(f.options(),['Blender','AI','编程','C4D']);
    assert.equal(saved.length,1);
  } finally {f.close();}
  const standalone=fixture({orderStore:store,sourcePath:'Bases/想法收集箱.base'}),other=fixture({orderStore:store,basePath:'Bases/Other.base'});
  try {
    standalone.open(); assert.deepEqual(standalone.options(),['流程','技术','内容选题']);
    other.open(); assert.deepEqual(other.options(),['技术','内容选题','流程']);
  } finally {standalone.close();other.close();}
});

test('without a persistent adapter, confirmed order survives reopening during this plugin instance',async()=>{
  const f=fixture();
  try {
    f.open(); f.key('ArrowDown',{altKey:true}); f.key('Escape'); f.open();
    assert.deepEqual(f.options(),['内容选题','技术','流程']); assert.equal(f.writes.length,0);
  } finally {f.close();}
});

test('a failed preference save restores the prior order without touching notes',async()=>{
  const f=fixture({orderStore:{read:()=>['流程','技术','内容选题'],write:async()=>{throw Error('disk failure');}}});
  try {
    f.open(); f.key('ArrowDown',{altKey:true}); await f.tick();
    assert.deepEqual(f.options(),['流程','技术','内容选题']); assert.equal(f.writes.length,0);
    assert.equal(f.doc.querySelector('.bui-tag-editor-status').textContent,'选项顺序未能保存，请重试');
  } finally {f.close();}
});

test('clearing the plugin during a drag cancels preview and removes pointer listeners',async()=>{
  const saved=[];
  const f=fixture({orderStore:{read:()=>undefined,write:(...args)=>saved.push(args)}});
  try {
    f.open(); f.geometry(); f.pointer(f.option('技术').querySelector('.bui-tag-editor-grip'),'pointerdown');
    f.pointer(f.doc,'pointermove',{clientY:260}); f.editor.clear();
    f.pointer(f.doc,'pointerup',{clientY:260}); await f.tick();
    assert.equal(saved.length,0); assert.equal(f.writes.length,0); assert.equal(f.doc.querySelector('.bui-tag-editor'),null);
  } finally {f.close();}
});

test('a stationary row pointer tap toggles selection while dragging row text only reorders candidates',async()=>{
  const saved=[],f=fixture({orderStore:{read:()=>[],write:(key,order)=>saved.push([...order])}});
  try {
    f.open('领域');const original=f.option('Blender');
    f.pointer(original.querySelector('.bui-tag-editor-chip'),'pointerdown');
    f.pointer(f.doc,'pointerup');
    assert.equal(f.option('Blender'),original,'tap keeps the same DOM click target');
    f.mouse(original);await f.tick();assert.deepEqual(f.writes[0].value,[]);
    f.geometry();const row=f.option('AI');
    f.pointer(row.querySelector('.bui-tag-editor-chip'),'pointerdown');
    f.pointer(f.doc,'pointermove',{clientY:278});
    assert.ok(f.doc.querySelector('.bui-tag-drag-overlay'));
    f.pointer(f.doc,'pointerup',{clientY:278});await f.tick();
    assert.deepEqual(saved,[['编程','C4D','Blender','AI']]);
    f.mouse(f.option('Blender'));await f.tick();assert.equal(f.writes.length,1,'drag release cannot toggle');
  }finally{f.close();}
});

test('a whole-row touch hold lifts, reorders and cancels native panning only while the drag is active',async()=>{
  const saved=[],f=fixture({orderStore:{read:()=>[],write:(key,order)=>saved.push([...order])}});
  try {
    f.doc.body.classList.add('is-mobile');f.open('领域');f.geometry();
    const chip=f.option('Blender').querySelector('.bui-tag-editor-chip');
    const touchmove=()=>{const event=new f.win.Event('touchmove',{bubbles:true,cancelable:true});
      Object.defineProperty(event,'touches',{value:[{}]});chip.dispatchEvent(event);return event.defaultPrevented;};
    assert.equal(f.pointer(chip,'pointerdown',{pointerType:'touch'}),true);
    assert.equal(touchmove(),false);assert.equal(f.doc.querySelector('.bui-tag-drag-overlay'),null);
    await new Promise(resolve=>f.win.setTimeout(resolve,200));
    assert.ok(f.doc.querySelector('.bui-tag-drag-overlay'),'holding any part of the row lifts it');
    assert.equal(touchmove(),true,'active touchmove is non-passive to keep iOS from beginning a native pan');
    f.pointer(f.doc,'pointermove',{pointerType:'touch',clientY:278});
    f.pointer(f.doc,'pointerup',{pointerType:'touch',clientY:278});await f.tick();
    assert.deepEqual(saved,[['AI','编程','C4D','Blender']]);assert.deepEqual(f.writes,[]);
    assert.equal(touchmove(),false,'touchmove interception is removed after drop');
    assert.equal(f.doc.activeElement,f.doc.querySelector('.bui-tag-editor'));
  }finally{f.close();}
});

test('scrolling, pointer cancellation and closing before the hold cannot create a delayed drag',async()=>{
  for(const mode of ['scroll','cancel','close']){
    const f=fixture();try{
      f.open('领域');f.geometry();const chip=f.option('Blender').querySelector('.bui-tag-editor-chip');
      f.pointer(chip,'pointerdown',{pointerType:'touch'});
      if(mode==='scroll')assert.equal(f.pointer(chip,'pointermove',{pointerType:'touch',clientY:220}),true);
      else if(mode==='cancel')f.pointer(chip,'pointercancel',{pointerType:'touch'});
      else f.editor.clear();
      await new Promise(resolve=>f.win.setTimeout(resolve,200));
      assert.equal(f.doc.querySelector('.bui-tag-drag-overlay'),null,mode);
      f.pointer(chip,'pointerup',{pointerType:'touch',clientY:220});f.mouse(chip);await f.tick();
      assert.deepEqual(f.writes,[],mode);
    }finally{f.close();}
  }
});

test('a hidden selected candidate can still be unchecked and then leaves the option list',async()=>{
  const f=fixture({orderStore:{read:()=>[],readOptions:()=>({hidden:['Blender']}),write(){}}});
  try{
    f.open('领域');assert.equal(f.option('Blender').getAttribute('aria-selected'),'true');
    f.mouse(f.option('Blender'));await f.tick();
    assert.deepEqual(f.writes[0].value,[]);assert.equal(f.option('Blender'),undefined);
    assert.equal(f.doc.querySelector('.bui-tag-editor-selected button'),null);
  }finally{f.close();}
});

test('selected chips and option checks wait for both the current query entry and native cell render',async()=>{
  const f=fixture({delayed:true});try{
    f.open('领域');const cell=f.view.rows[0].cells[0],popup=f.doc.querySelector('.bui-tag-editor');
    cell.renderer.val=JSON.stringify(['Blender']);
    const selected=f.doc.querySelector('.bui-tag-editor-selected'),originalChip=selected.firstElementChild,originalOption=f.option('AI');
    f.mouse(originalOption);await f.tick();
    assert.equal(selected.firstElementChild,originalChip,'busy does not rebuild the old selection');
    assert.equal(f.option('AI'),originalOption,'busy does not rebuild the old options');
    assert.equal(originalOption.getAttribute('aria-selected'),'false');assert.equal(popup.getAttribute('aria-busy'),'true');
    const newer={...f.entry,raw:{...f.entry.raw,领域:['Blender','AI']}};
    f.view.queryController.results.set(f.entry.file,newer);f.editor.attach(f.view);
    assert.equal(originalOption.getAttribute('aria-selected'),'false','query alone is not a rendered-cell acknowledgement');
    cell.renderer.entry=newer;cell.renderer.val=JSON.stringify(newer.raw.领域);f.editor.attach(f.view);
    assert.deepEqual([...selected.children].map(x=>x.textContent),['Blender','AI']);
    assert.equal(f.option('AI').getAttribute('aria-selected'),'true');assert.equal(popup.hasAttribute('aria-busy'),false);
    assert.equal(f.writes.length,1);assert.deepEqual(f.entry.raw.领域,['Blender'],'old query objects were never mutated');
  }finally{f.close();}
});

test('native render acknowledgement before the write resolves does not publish an uncommitted popup state',async()=>{
  const f=fixture();try{
    let resolve;const cell=f.view.rows[0].cells[0];cell.renderer.val=JSON.stringify(['Blender']);
    f.view.updateProperty=(file,property,value)=>{f.writes.push({file,property,value:structuredClone(value)});return new Promise(r=>{resolve=r;});};
    f.open('领域');f.mouse(f.option('AI'));
    f.entry.raw.领域=['Blender','AI'];cell.renderer.val=JSON.stringify(f.entry.raw.领域);f.editor.attach(f.view);
    assert.equal(f.option('AI').getAttribute('aria-selected'),'false');
    resolve();await f.tick();assert.equal(f.option('AI').getAttribute('aria-selected'),'true');
    assert.deepEqual([...f.doc.querySelector('.bui-tag-editor-selected').children].map(x=>x.textContent),['Blender','AI']);
  }finally{f.close();}
});

test('a pending save preserves a later IME draft and its input focus when rendered acknowledgement arrives',async()=>{
  const f=fixture({delayed:true});try{
    f.open('领域');const input=f.input();f.mouse(f.option('AI'));await f.tick();
    input.dispatchEvent(new f.win.CompositionEvent('compositionstart',{bubbles:true}));
    input.value='正在输入';input.dispatchEvent(new f.win.Event('input',{bubbles:true}));input.focus();
    f.entry.raw.领域=['Blender','AI'];f.editor.attach(f.view);
    assert.equal(input.value,'正在输入');assert.equal(f.doc.activeElement,input);
    assert.deepEqual([...f.doc.querySelector('.bui-tag-editor-selected').children].map(x=>x.textContent),['Blender','AI']);
    assert.equal(f.doc.querySelector('.bui-tag-editor').hasAttribute('aria-busy'),false);
    input.dispatchEvent(new f.win.CompositionEvent('compositionend',{bubbles:true}));
    f.key('Enter');assert.equal(f.writes.length,1,'IME confirmation is still not another save');
  }finally{f.close();}
});

test('a delayed native notification is flushed once only after real query data is ready',async()=>{
  const f=fixture({delayed:true});try{
    const cell=f.view.rows[0].cells[0];cell.renderer.val=JSON.stringify(['Blender']);let flushes=0;
    const notify=()=>{};notify.run=()=>{flushes++;cell.renderer.val=JSON.stringify(f.entry.raw.领域);f.editor.attach(f.view);};
    f.view.queryController.requestNotifyView=notify;
    f.open('领域');f.mouse(f.option('AI'));await f.tick();f.entry.raw.领域=['Blender','AI'];
    await new Promise(resolve=>f.win.setTimeout(resolve,530));
    assert.equal(flushes,1);assert.equal(f.option('AI').getAttribute('aria-selected'),'true');assert.equal(f.writes.length,1);
  }finally{f.close();}
});

test('a slow query cannot freeze the picker or replay writes, and a later render still synchronizes it',async()=>{
  const f=fixture({delayed:true});try{
    const cell=f.view.rows[0].cells[0];cell.renderer.val=JSON.stringify(['Blender']);let flushes=0;
    const notify=()=>{};notify.run=()=>flushes++;f.view.queryController.requestNotifyView=notify;
    f.open('领域');f.mouse(f.option('AI'));await f.tick();
    await new Promise(resolve=>f.win.setTimeout(resolve,530));
    assert.equal(flushes,0,'do not rerender stale query data');assert.equal(f.writes.length,1);
    assert.equal(f.doc.querySelector('.bui-tag-editor').hasAttribute('aria-busy'),false);
    assert.equal(f.option('AI').getAttribute('aria-selected'),'false','keep the actually rendered cell state');
    f.entry.raw.领域=['Blender','AI'];cell.renderer.val=JSON.stringify(f.entry.raw.领域);f.editor.attach(f.view);
    assert.equal(f.option('AI').getAttribute('aria-selected'),'true');assert.equal(f.doc.querySelector('.bui-tag-editor-status').hidden,true);
  }finally{f.close();}
});

test('closing during acknowledgement wait cancels timers and cannot reopen or repaint the editor',async()=>{
  const f=fixture({delayed:true});try{
    let flushes=0;const notify=()=>{};notify.run=()=>flushes++;f.view.queryController.requestNotifyView=notify;
    f.open('领域');f.mouse(f.option('AI'));await f.tick();f.key('Escape');
    f.entry.raw.领域=['Blender','AI'];f.editor.attach(f.view);
    await new Promise(resolve=>f.win.setTimeout(resolve,530));
    assert.equal(flushes,0);assert.equal(f.doc.querySelector('.bui-tag-editor'),null);assert.equal(f.writes.length,1);
  }finally{f.close();}
});

test('unknown renderer cache formats fall back to current native query data without hanging the picker',async()=>{
  for(const value of ['not a JSON cache',JSON.stringify({changed:'format'})]){
    const f=fixture();try{
      f.view.rows[0].cells[0].renderer.val=value;f.open('领域');f.mouse(f.option('AI'));await f.tick();
      assert.equal(f.option('AI').getAttribute('aria-selected'),'true');assert.equal(f.doc.querySelector('.bui-tag-editor').hasAttribute('aria-busy'),false);
      assert.equal(f.writes.length,1);
    }finally{f.close();}
  }
});

test('a scalar picker closes only when its new value is also rendered in the native cell',async()=>{
  const f=fixture({delayed:true});try{
    const cell=f.view.rows[0].cells[1];cell.renderer.val=JSON.stringify('技术');
    f.open();f.mouse(f.option('流程'));await f.tick();assert.ok(f.doc.querySelector('.bui-tag-editor'));
    f.entry.raw.类型='流程';f.editor.attach(f.view);assert.ok(f.doc.querySelector('.bui-tag-editor'));
    cell.renderer.val=JSON.stringify('流程');f.editor.attach(f.view);assert.equal(f.doc.querySelector('.bui-tag-editor'),null);
  }finally{f.close();}
});

test('a failed later scalar save stays visible when an older successful write is acknowledged',async()=>{
  const f=fixture({delayed:true});try{
    const cell=f.view.rows[0].cells[1];cell.renderer.val=JSON.stringify('技术');
    f.open();f.mouse(f.option('流程'));await f.tick();
    await new Promise(resolve=>f.win.setTimeout(resolve,530));
    f.view.updateProperty=async(file,property,value)=>{
      f.writes.push({file,property,value});
      f.entry.raw.类型='流程';cell.renderer.val=JSON.stringify('流程');
      throw Error('later save failed');
    };
    f.mouse(f.option('内容选题'));await f.tick();
    assert.ok(f.doc.querySelector('.bui-tag-editor'),'old scalar acknowledgement cannot close the failed latest attempt');
    const status=f.doc.querySelector('.bui-tag-editor-status');
    assert.equal(status.hidden,false);assert.match(status.textContent,/未能保存/);
    assert.equal(f.option('流程').getAttribute('aria-selected'),'true','the older committed native value is still displayed');
    assert.equal(f.doc.querySelector('.bui-tag-editor').hasAttribute('aria-busy'),false);
    assert.equal(f.writes.length,2);
  }finally{f.close();}
});

test('an old acknowledgement timeout cannot replace a later failed-save error with a saved message',async()=>{
  const f=fixture({delayed:true});try{
    f.open('领域');f.mouse(f.option('AI'));await f.tick();
    await new Promise(resolve=>f.win.setTimeout(resolve,530));
    f.view.updateProperty=async(file,property,value)=>{f.writes.push({file,property,value});throw Error('later save failed');};
    f.mouse(f.option('编程'));await f.tick();
    await new Promise(resolve=>f.win.setTimeout(resolve,530));
    const status=f.doc.querySelector('.bui-tag-editor-status');
    assert.equal(status.hidden,false);assert.match(status.textContent,/未能保存/);
    assert.equal(f.doc.querySelector('.bui-tag-editor').hasAttribute('aria-busy'),false);
    f.entry.raw.领域=['Blender','AI'];f.editor.attach(f.view);
    assert.equal(f.option('AI').getAttribute('aria-selected'),'true');assert.match(status.textContent,/未能保存/);
    assert.equal(status.hidden,false,'even a late successful older acknowledgement preserves the newer failure');
    assert.equal(f.writes.length,2);
  }finally{f.close();}
});

test('intermediate acknowledgements advance the observed baseline so a native undo wins over pending values',async()=>{
  const f=fixture({delayed:true});try{
    const cell=f.view.rows[0].cells[0];cell.renderer.val=JSON.stringify(['Blender']);
    f.open('领域');f.mouse(f.option('AI'));await f.tick();
    await new Promise(resolve=>f.win.setTimeout(resolve,530));
    f.mouse(f.option('编程'));await f.tick();
    assert.deepEqual(f.writes[1].value,['Blender','AI','编程']);
    f.entry.raw.领域=['Blender','AI'];cell.renderer.val=JSON.stringify(f.entry.raw.领域);f.editor.attach(f.view);
    assert.equal(f.option('AI').getAttribute('aria-selected'),'true');
    assert.equal(f.option('编程').getAttribute('aria-selected'),'false');
    f.entry.raw.领域=['Blender'];cell.renderer.val=JSON.stringify(f.entry.raw.领域);f.editor.attach(f.view);
    assert.equal(f.option('AI').getAttribute('aria-selected'),'false','native undo is newer than the intermediate acknowledgement');
    assert.equal(f.doc.querySelector('.bui-tag-editor').hasAttribute('aria-busy'),false);
    f.mouse(f.option('C4D'));await f.tick();
    assert.deepEqual(f.writes[2].value,['Blender','C4D'],'next edit must not replay AI or 编程');
  }finally{f.close();}
});

test('a query acknowledged during a newer click is still published when its cell render catches up',async()=>{
  const f=fixture({delayed:true});try{
    const cell=f.view.rows[0].cells[0];cell.renderer.val=JSON.stringify(['Blender']);
    f.open('领域');f.mouse(f.option('AI'));await f.tick();
    await new Promise(resolve=>f.win.setTimeout(resolve,530));
    f.entry.raw.领域=['Blender','AI'];f.editor.attach(f.view);
    assert.equal(f.option('AI').getAttribute('aria-selected'),'false','cell has not rendered this query yet');
    f.mouse(f.option('编程'));await f.tick();assert.deepEqual(f.writes[1].value,['Blender','AI','编程']);
    cell.renderer.val=JSON.stringify(['Blender','AI']);f.editor.attach(f.view);
    assert.equal(f.option('AI').getAttribute('aria-selected'),'true','query-only bookkeeping must not suppress its later rendered acknowledgement');
    assert.equal(f.option('编程').getAttribute('aria-selected'),'false');
    assert.equal(f.doc.querySelector('.bui-tag-editor').getAttribute('aria-busy'),'true','the newer committed value still awaits its own render');
    f.entry.raw.领域=['Blender','AI','编程'];cell.renderer.val=JSON.stringify(f.entry.raw.领域);f.editor.attach(f.view);
    assert.equal(f.option('编程').getAttribute('aria-selected'),'true');
    assert.equal(f.doc.querySelector('.bui-tag-editor').hasAttribute('aria-busy'),false);
    assert.equal(f.writes.length,2);
  }finally{f.close();}
});


test('unknown native cell and row structures retain native handlers without property writes',()=>{
  const f=fixture();try {
    f.editor.clear();
    f.view.rows=[{cells:[{el:42,prop:'note.类型'}]}];
    assert.doesNotThrow(()=>f.editor.attach(f.view));
    assert.equal(f.open('类型'),null);
    assert.deepEqual(f.writes,[]);
    assert.equal(f.native.click,1);
  }finally{f.close();}
});

const financeProfile={titleColumn:'formula.流水页面',titleProperty:'流水摘要',
  tags:{方向:'single',入账状态:'single',税务分类:'multi'},wrap:true,attachments:[]};
function financeFixture(extra={}) {
  return fixture({name:'收支流水',profile:structuredClone(financeProfile),basePath:'Bases/财务.base',
    records:[{方向:'支出',入账状态:'待确认',税务分类:['服务']},{方向:'收入',入账状态:'已入账',税务分类:['差旅','设备']},
      {方向:'转账',入账状态:'已取消',税务分类:['服务','其他']}],...extra});
}

test('configured finance tags open the native transaction picker with scalar and multi-value semantics',async()=>{
  const f=financeFixture();try{
    assert.ok(f.open('方向'));assert.equal(f.doc.querySelector('[role="listbox"]').hasAttribute('aria-multiselectable'),false);
    f.mouse(f.option('收入'));await f.tick();
    assert.equal(f.writes[0].property,'方向');assert.equal(f.writes[0].value,'收入');
    assert.equal(f.doc.querySelector('.bui-tag-editor'),null,'single selection closes after the native acknowledgement');
    assert.ok(f.open('税务分类'));assert.equal(f.doc.querySelector('[role="listbox"]').getAttribute('aria-multiselectable'),'true');
    f.mouse(f.option('设备'));await f.tick();
    assert.deepEqual(f.writes[1].value,['服务','设备']);assert.ok(f.doc.querySelector('.bui-tag-editor'));
    f.mouse(f.option('服务'));await f.tick();assert.deepEqual(f.writes[2].value,['设备']);
    assert.equal(f.writes.every(write=>write.file===f.entry.file),true);
  }finally{f.close();}
});

test('finance tag schema is opt-in and rejects stale, disabled or incompatible native cells',async()=>{
  const plain=financeFixture({profile:undefined});try{assert.equal(plain.open('方向'),null);assert.equal(plain.writes.length,0);}finally{plain.close();}
  const f=financeFixture();try{
    f.entry.raw.方向=['支出'];assert.equal(f.open('方向'),null);
    f.entry.raw.方向='支出';f.entry.raw.税务分类='服务';assert.equal(f.open('税务分类'),null);
    f.entry.raw.税务分类=['服务'];f.anchor('入账状态').setAttribute('aria-readonly','true');assert.equal(f.open('入账状态'),null);
    assert.ok(f.open('方向'));f.view.config.nebulaTable.tags.方向='multi';
    f.mouse(f.option('收入'));await f.tick();assert.deepEqual(f.writes,[]);assert.equal(f.doc.querySelector('.bui-tag-editor'),null);
    f.view.config.nebulaTable.tags.方向='single';assert.ok(f.open('方向'));
    f.view.isReadOnly=true;f.mouse(f.option('收入'));await f.tick();assert.deepEqual(f.writes,[]);
  }finally{f.close();}
});
