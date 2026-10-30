const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {buildSync} = require('esbuild');
const {JSDOM} = require('jsdom');
const code = buildSync({entryPoints:['src/idea-tag-editor.ts'],bundle:true,write:false,
  platform:'node',format:'cjs',external:['obsidian']}).outputFiles[0].text;

function fixture({delayed=false, failed=false, orderStore, basePath='Bases/想法收集箱.base', sourcePath='Dashboard.md'}={}) {
  const dom = new JSDOM('<!doctype html><body><button id="outside">Outside</button><div class="bases-view"><div class="bases-table-container" tabindex="0"></div></div></body>', {pretendToBeVisual:true});
  const win=dom.window, doc=win.document, host=doc.querySelector('.bases-view'), container=doc.querySelector('.bases-table-container');
  const writes=[], notices=[], native={pointerdown:0,click:0,keydown:0}, cells=new Map();
  const makeEntry=(path,raw)=>({file:{path,extension:'md'},raw,getRawProperty(name){return this.raw[name];}});
  const entry=makeEntry('ideas/one.md',{领域:['Blender'],类型:'技术',重要性:'!'});
  const other=makeEntry('ideas/two.md',{领域:['AI','编程','C4D'],类型:'内容选题',重要性:'! !'});
  const filteredOut=makeEntry('ideas/three.md',{领域:['Blender'],类型:'流程',重要性:'! ! !'});
  const view={type:'table',_loaded:true,containerEl:container,config:{name:'想法收集箱',query:{file:{path:basePath}}},
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
  const row={entry,cells:[]}; view.rows=[row];
  for (const property of ['领域','类型','重要性']) {
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
    Object.defineProperty(event,'pointerId',{value:extra.pointerId??1}); return el.dispatchEvent(event);
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

test('options use this database query results, including entries outside the visible filtered data',()=>{
  const f=fixture();
  try {
    f.open(); assert.ok(f.option('技术')); assert.ok(f.option('内容选题')); assert.ok(f.option('流程'));
    assert.equal(f.doc.querySelectorAll('.bui-tag-editor-option').length,3);
    assert.equal(f.option('内容选题').getAttribute('role'),'option');
    assert.ok(f.option('内容选题').querySelector('.bui-native-tag[data-bui-tone="yellow"]'));
  } finally {f.close();}
});

test('single selection calls the native undo-aware property API with a string; same value is a no-op',async()=>{
  const f=fixture();
  try {
    f.open(); f.mouse(f.option('技术')); await f.tick(); assert.equal(f.writes.length,0);
    f.open(); f.mouse(f.option('内容选题')); await f.tick();
    assert.equal(f.writes.length,1); assert.equal(f.writes[0].file,f.entry.file);
    assert.equal(f.writes[0].property,'类型'); assert.equal(f.writes[0].value,'内容选题');
    assert.equal(f.doc.querySelector('.bui-tag-editor'),null);
    f.open('重要性'); f.mouse(f.option('! ! !')); await f.tick();
    assert.equal(f.writes[1].property,'重要性'); assert.equal(f.writes[1].value,'! ! !');
  } finally {f.close();}
});

test('multi selection remains open and only remove buttons remove; arrays stay arrays',async()=>{
  const f=fixture();
  try {
    f.open('领域'); f.mouse(f.option('Blender')); await f.tick(); assert.equal(f.writes.length,0);
    f.mouse(f.option('AI')); await f.tick();
    assert.deepEqual(f.writes[0].value,['Blender','AI']); assert.ok(f.doc.querySelector('.bui-tag-editor'));
    assert.ok(f.remove('AI')); f.mouse(f.remove('Blender')); await f.tick();
    assert.deepEqual(f.writes[1].value,['AI']);
    f.mouse(f.remove('AI')); await f.tick(); assert.deepEqual(f.writes[2].value,[]);
    assert.equal(f.doc.querySelector('.bui-tag-editor-selected').hidden,true);
  } finally {f.close();}
});

test('rapid multi selections survive asynchronous query refresh and preserve explicit earlier selections',async()=>{
  const f=fixture({delayed:true});
  try {
    f.open('领域'); f.mouse(f.option('AI')); await f.tick();
    f.mouse(f.option('编程')); await f.tick();
    assert.deepEqual(f.writes[1].value,['Blender','AI','编程']);
    // The first native update becomes visible after the second write finishes.
    f.entry.raw.领域=['Blender','AI'];
    f.mouse(f.option('C4D')); await f.tick();
    assert.deepEqual(f.writes[2].value,['Blender','AI','编程','C4D']);
    // A genuinely different external edit is the starting point for the next action.
    f.entry.raw.领域=['外部修改']; f.mouse(f.option('AI')); await f.tick();
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
    f.key('Escape'); f.open('类型'); f.mouse(f.remove('技术')); await f.tick();
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
    assert.equal(f.remove('AI'),null); assert.ok(f.remove('Blender')); assert.deepEqual(f.entry.raw.领域,['Blender']);
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
    f.pointer(f.option('流程'),'pointerdown'); f.mouse(f.option('流程')); await f.tick();
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
