const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {buildSync}=require('esbuild');
const {JSDOM}=require('jsdom');
const code=buildSync({stdin:{contents:"export {IdeaTagEditors} from './src/idea-tag-editor'; export {IdeaHeaders} from './src/idea-header';",resolveDir:process.cwd()},
  bundle:true,write:false,platform:'node',format:'cjs',external:['obsidian']}).outputFiles[0].text;

function fixture({failed=false,renameFailed=false,saveWait,name='想法收集箱',profile,records}={}) {
  const dom=new JSDOM('<!doctype html><body><button id="outside">Outside</button><div class="host"><div class="bases-view" tabindex="0"><div class="bases-thead"></div><div class="bases-tbody"></div></div></div></body>',{pretendToBeVisual:true});
  const win=dom.window,doc=win.document,container=doc.querySelector('.bases-view'),head=doc.querySelector('.bases-thead'),tbody=doc.querySelector('.bases-tbody');
  const cells=new Map(),configs=new Map(),saved=[],writes=[],displayWrites=[],data=new Map(),notices=[];
  const entry={file:{path:'ideas/one.md',extension:'md'},raw:records?.[0]??{领域:['Blender'],类型:'技术',重要性:'!'},getRawProperty(name){return this.raw[name];}};
  const other={file:{path:'ideas/two.md',extension:'md'},raw:records?.[1]??{领域:['AI','编程','C4D'],类型:'流程',重要性:'! !'},getRawProperty(name){return this.raw[name];}};
  const view={_loaded:true,type:'table',containerEl:container,theadEl:head,
    config:{name,nebulaTable:profile,query:{file:{path:'Bases/Ideas.base'},saveFn(){if(renameFailed)throw Error('save failure');}},getPropertyConfig:prop=>configs.get(prop)},
    queryController:{viewContainerEl:doc.querySelector('.host'),results:new Map([[entry.file,entry],[other.file,other]]),requestNotifyView(){}},
    getCellFromDom:el=>cells.get(el.closest('.bases-td')),focus:()=>container.focus(),
    async updateProperty(file,property,value){writes.push({file,property,value:structuredClone(value)});entry.raw[property]=structuredClone(value);}};
  view.queryController.view=view;
  const geometry=el=>el.getBoundingClientRect=()=>({left:100,right:250,top:70,bottom:100,width:150,height:30});
  for(const prop of Object.keys(entry.raw)){
    let label=prop; configs.set('note.'+prop,{getDisplayName:()=>label,setDisplayName(value){label=value;displayWrites.push({prop,value});}});
    const el=doc.createElement('div');el.className='bases-td';el.dataset.property='note.'+prop;
    el.innerHTML='<span class="bases-table-header-name">'+prop+'</span><span class="bases-table-header-resizer"></span>';head.append(el);geometry(el);
    cells.set(el,{el,prop:'note.'+prop});
    const cell=doc.createElement('div');cell.className='bases-td';cell.dataset.property='note.'+prop;
    cell.innerHTML='<div class="bases-table-cell"><div class="metadata-input-longtext" contenteditable="true"></div></div>';
    tbody.append(cell);geometry(cell);cells.set(cell,{el:cell,prop:'note.'+prop,renderer:{entry,propertyEditor:{}}});
  }
  let sorts=0;head.addEventListener('click',()=>sorts++);
  const module={exports:{}};
  new vm.Script(code).runInContext(vm.createContext({module,exports:module.exports,HTMLElement:win.HTMLElement,Element:win.Element,
    require:name=>{assert.equal(name,'obsidian');return {Notice:class{constructor(m){notices.push(m);}},setIcon(el,name){el.dataset.icon=name;}};},console}));
  const store={read:key=>data.get(key)?.order,readOptions:key=>data.get(key),
    write(key,order){data.set(key,{...data.get(key),order:structuredClone(order)});},
    async writeOptions(key,options){if(saveWait)await saveWait;if(failed)throw Error('disk failure');const value=structuredClone(options);saved.push({key,...value});data.set(key,value);}};
  let editor,headers;
  const start=()=>{editor=new module.exports.IdeaTagEditors(store);headers=new module.exports.IdeaHeaders({},(v,p,a,k)=>editor.manage(v,p,a,k));editor.attach(view);headers.attach(view);};start();
  const click=(el,extra={})=>el.dispatchEvent(new win.MouseEvent('click',{bubbles:true,cancelable:true,button:0,...extra}));
  const key=(el,key,extra={})=>el.dispatchEvent(new win.KeyboardEvent('keydown',{bubbles:true,cancelable:true,key,...extra}));
  const open=(property='领域')=>{click(head.querySelector(`[data-property="note.${property}"]`));return doc.querySelector('.bui-tag-manager');};
  const openCell=(property='领域')=>{click(tbody.querySelector(`[data-property="note.${property}"]`));return doc.querySelector('.bui-tag-editor');};
  const options=()=>[...doc.querySelectorAll('.bui-tag-manager-option')].map(x=>x.dataset.value);
  const cellOptions=()=>[...doc.querySelectorAll('.bui-tag-editor-option')].map(x=>x.dataset.value);
  const option=value=>[...doc.querySelectorAll('.bui-tag-manager-option')].find(x=>x.dataset.value===value);
  const add=value=>{doc.querySelector('.bui-tag-manager-input').value=value;doc.querySelector('.bui-tag-manager-add').dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}));};
  const tick=()=>new Promise(resolve=>win.setTimeout(resolve,0));
  const pointer=(el,type,extra={})=>{const e=new win.MouseEvent(type,{bubbles:true,cancelable:true,button:0,clientX:120,clientY:136,...extra});Object.defineProperties(e,{pointerId:{value:extra.pointerId??1},pointerType:{value:extra.pointerType??'mouse'}});return el.dispatchEvent(e);};
  const dragGeometry=()=>{
    const list=doc.querySelector('.bui-tag-manager-list');list.getBoundingClientRect=()=>({left:100,right:380,top:120,bottom:248,width:280,height:128});
    for(const row of list.children)row.getBoundingClientRect=()=>{const top=120+[...list.children].indexOf(row)*32;return{left:100,right:380,top,bottom:top+32,width:280,height:32};};
  };
  return {win,doc,view,entry,other,head,configs,saved,writes,displayWrites,data,notices,open,openCell,options,cellOptions,option,add,tick,click,key,pointer,dragGeometry,
    get sorts(){return sorts;},get editor(){return editor;},
    reload(){headers.clear();editor.clear();start();},close(){headers.clear();editor.clear();win.close();}};
}

test('catalog typography follows a value in its column instead of the header font',()=>{
  const f=fixture();try{
    f.head.querySelector('[data-property="note.领域"]').style.fontSize='11px';
    f.doc.querySelector('.bases-tbody [data-property="note.领域"] .metadata-input-longtext').style.cssText=
      'font-size:18px;font-family:"Custom CJK";font-weight:400;line-height:24px';
    const popup=f.open();
    assert.equal(popup.style.getPropertyValue('--bui-source-tag-font-size'),'18px');
    assert.equal(popup.style.getPropertyValue('--bui-source-tag-font-family'),'"Custom CJK"');
    assert.equal(popup.style.getPropertyValue('--bui-source-tag-line-height'),'24px');
    assert.deepEqual(f.writes,[]);assert.deepEqual(f.saved,[]);
  }finally{f.close();}
});

test('classification header opens compact management with colored values, and opening/closing never changes notes or sort',()=>{
  const f=fixture();try{
    const panel=f.open();assert.ok(panel);assert.equal(panel.style.width,'280px');
    assert.deepEqual(f.options(),['Blender','AI','编程','C4D']);
    assert.equal(f.option('AI').querySelector('.bui-native-tag').dataset.buiTone,'orange');
    assert.match(panel.textContent,/已有笔记中的标签会保留/);assert.equal(f.sorts,0);
    f.key(f.doc.querySelector('.bui-tag-manager-input'),'Escape');assert.equal(f.doc.querySelector('.bui-tag-manager'),null);
    assert.deepEqual(f.saved,[]);assert.deepEqual(f.writes,[]);assert.deepEqual(f.displayWrites,[]);
  }finally{f.close();}
});

test('the tag manager remains inside the keyboard viewport and removes listeners on close',()=>{
  const f=fixture();try{
    const viewport=new f.win.EventTarget();Object.assign(viewport,{width:320,height:568,offsetTop:0,offsetLeft:0});
    Object.defineProperty(f.win,'visualViewport',{value:viewport});const panel=f.open();panel.getBoundingClientRect=()=>({height:400});
    viewport.height=240;viewport.offsetTop=40;viewport.dispatchEvent(new f.win.Event('resize'));
    assert.equal(panel.style.width,'280px');assert.equal(panel.style.left,'32px');assert.equal(panel.style.maxHeight,'224px');assert.equal(panel.style.top,'48px');
    f.key(f.doc.querySelector('.bui-tag-manager-input'),'Escape');viewport.offsetTop=100;viewport.dispatchEvent(new f.win.Event('scroll'));
    assert.equal(panel.style.top,'48px');assert.deepEqual(f.saved,[]);assert.deepEqual(f.writes,[]);
  }finally{f.close();}
});

test('phone header taps open management without keyboard; hardware-keyboard activation still focuses add input',()=>{
  const f=fixture();try{
    f.doc.body.classList.add('is-mobile');const panel=f.open(),input=panel.querySelector('.bui-tag-manager-input');
    assert.equal(f.doc.activeElement,panel);
    assert.equal(f.pointer(input,'pointerdown',{pointerType:'touch'}),true,'direct input focus remains native');
    input.focus();assert.equal(f.doc.activeElement,input);
    f.open();assert.equal(f.doc.activeElement,panel,'repeated taps do not request the soft keyboard');
    f.key(panel,'Escape');const label=f.head.querySelector('.bases-table-header-name');label.focus();f.key(label,'Enter');
    assert.equal(f.doc.activeElement,f.doc.querySelector('.bui-tag-manager-input'));
  }finally{f.close();}
});

test('a phone preference save keeps a directly focused input enabled and never steals a later input focus or draft',async()=>{
  let release;const saveWait=new Promise(resolve=>{release=resolve;});const f=fixture({saveWait});
  try{
    f.doc.body.classList.add('is-mobile');const panel=f.open(),input=panel.querySelector('.bui-tag-manager-input');
    input.focus();let inputFocuses=0;const focus=input.focus.bind(input);input.focus=(...args)=>{inputFocuses++;focus(...args);};
    f.add('摄影');assert.equal(input.disabled,false);assert.equal(f.doc.activeElement,input);
    input.value='下一个标签';const name=panel.querySelector('.bui-tag-manager-name-input');name.focus();
    release();await f.tick();assert.equal(f.doc.activeElement,name);assert.equal(input.value,'下一个标签');
    assert.equal(inputFocuses,0);assert.deepEqual(f.saved[0].added,['摄影']);assert.deepEqual(f.writes,[]);
  }finally{f.close();}
});

test('quick phone list movement scrolls while its grip reorders immediately without focusing an input',async()=>{
  const f=fixture();try{
    f.doc.body.classList.add('is-mobile');f.open();f.dragGeometry();const input=f.doc.querySelector('.bui-tag-manager-input');
    let inputFocuses=0;const focus=input.focus.bind(input);input.focus=(...args)=>{inputFocuses++;focus(...args);};
    const chip=f.option('AI').querySelector('.bui-tag-manager-chip');
    assert.equal(f.pointer(chip,'pointerdown',{pointerType:'touch'}),true);
    f.pointer(chip,'pointermove',{pointerType:'touch',clientY:236});f.pointer(chip,'pointerup',{pointerType:'touch',clientY:236});
    assert.deepEqual(f.options(),['Blender','AI','编程','C4D']);assert.deepEqual(f.saved,[]);
    const grip=f.option('AI').querySelector('.bui-tag-manager-grip');
    assert.equal(f.pointer(grip,'pointerdown',{pointerType:'touch'}),false);
    f.pointer(f.doc,'pointermove',{pointerType:'touch',clientY:236});f.pointer(f.doc,'pointerup',{pointerType:'touch',clientY:236});await f.tick();
    assert.deepEqual(f.options(),['Blender','编程','C4D','AI']);assert.equal(f.saved.length,1);assert.equal(inputFocuses,0);
  }finally{f.close();}
});

test('finishing a delayed phone reorder preserves an input the user tapped while saving',async()=>{
  let release;const saveWait=new Promise(resolve=>{release=resolve;});const f=fixture({saveWait});
  try{
    f.doc.body.classList.add('is-mobile');f.open();f.dragGeometry();
    const grip=f.option('AI').querySelector('.bui-tag-manager-grip');
    f.pointer(grip,'pointerdown',{pointerType:'touch'});f.pointer(f.doc,'pointermove',{pointerType:'touch',clientY:236});
    f.pointer(f.doc,'pointerup',{pointerType:'touch',clientY:236});
    const input=f.doc.querySelector('.bui-tag-manager-input');
    f.pointer(input,'pointerdown',{pointerType:'touch'});input.focus();input.value='正在输入';
    release();await f.tick();assert.equal(f.doc.activeElement,input);assert.equal(input.value,'正在输入');
    assert.deepEqual(f.options(),['Blender','编程','C4D','AI']);assert.equal(f.saved.length,1);
  }finally{f.close();}
});

test('a cancelled manager touch drag cannot delete a tag via its trailing click',async()=>{
  const f=fixture();try{
    f.open();f.dragGeometry();const grip=f.option('Blender').querySelector('.bui-tag-manager-grip');
    f.pointer(grip,'pointerdown',{pointerType:'touch'});f.pointer(f.doc,'pointermove',{pointerType:'touch',clientY:236});
    const list=f.doc.querySelector('.bui-tag-manager-list');f.pointer(list,'lostpointercapture',{pointerType:'touch'});
    assert.deepEqual(f.options(),['Blender','AI','编程','C4D']);
    let remove=f.option('AI').querySelector('.bui-tag-manager-remove');f.click(remove);await f.tick();assert.deepEqual(f.saved,[]);
    f.pointer(remove,'pointerdown',{pointerType:'touch'});f.pointer(remove,'pointerup',{pointerType:'touch'});f.click(remove);await f.tick();
    assert.equal(f.saved.length,1);assert.ok(!f.options().includes('AI'));assert.deepEqual(f.writes,[]);
  }finally{f.close();}
});

test('scrolling the manager list over a delete button cannot remove its option',async()=>{
  const f=fixture();try{
    f.open();const remove=f.option('AI').querySelector('.bui-tag-manager-remove');
    f.pointer(remove,'pointerdown',{pointerType:'touch'});f.pointer(remove,'pointermove',{pointerType:'touch',clientY:210});
    f.doc.querySelector('.bui-tag-manager-list').dispatchEvent(new f.win.Event('scroll'));
    f.pointer(remove,'pointerup',{pointerType:'touch',clientY:210});f.click(remove);await f.tick();
    assert.deepEqual(f.saved,[]);assert.ok(f.options().includes('AI'));
  }finally{f.close();}
});

test('adding a candidate persists without assigning it; reload and cell editor both expose it',async()=>{
  const f=fixture();try{
    f.open();f.add('摄影');await f.tick();assert.deepEqual(f.options(),['Blender','AI','编程','C4D','摄影']);
    assert.deepEqual(f.saved[0],{key:JSON.stringify(['Bases/Ideas.base','领域']),order:['Blender','AI','编程','C4D','摄影'],added:['摄影'],hidden:[]});
    assert.deepEqual(f.entry.raw.领域,['Blender']);assert.deepEqual(f.writes,[]);
    f.reload();f.openCell();assert.ok(f.cellOptions().includes('摄影'));
    assert.equal(f.doc.querySelectorAll('.bui-tag-editor-selected .bui-tag-editor-chip').length,1);
  }finally{f.close();}
});

test('removing a used candidate keeps note values and selected chips; re-adding restores it across reload',async()=>{
  const f=fixture();try{
    f.open();f.click(f.option('Blender').querySelector('.bui-tag-manager-remove'));await f.tick();
    assert.ok(!f.options().includes('Blender'));assert.deepEqual(f.entry.raw.领域,['Blender']);assert.deepEqual(f.writes,[]);
    f.reload();f.openCell();assert.ok(f.cellOptions().includes('Blender'),'selected hidden values remain available to uncheck');
    assert.equal(f.doc.querySelector('.bui-tag-editor-option[data-value="Blender"]').getAttribute('aria-selected'),'true');
    assert.equal(f.doc.querySelector('.bui-tag-editor-selected button'),null);
    f.open();f.add('Blender');await f.tick();assert.ok(f.options().includes('Blender'));assert.deepEqual(f.saved.at(-1).hidden,[]);
    f.reload();f.openCell();assert.ok(f.cellOptions().includes('Blender'));assert.deepEqual(f.writes,[]);
  }finally{f.close();}
});

test('Alt arrow reorder persists candidate order shared with the cell picker and keeps keyboard focus',async()=>{
  const f=fixture();try{
    f.open();const grip=f.option('AI').querySelector('.bui-tag-manager-grip');grip.focus();f.key(grip,'ArrowUp',{altKey:true});await f.tick();
    assert.deepEqual(f.options(),['AI','Blender','编程','C4D']);assert.equal(f.doc.activeElement,f.option('AI').querySelector('.bui-tag-manager-grip'));
    f.openCell();assert.deepEqual(f.cellOptions(),['AI','Blender','编程','C4D']);assert.deepEqual(f.writes,[]);
  }finally{f.close();}
});

test('pointer reorder previews without writes, cancels on Escape, and commits once on drop',async()=>{
  const f=fixture();try{
    f.open();f.dragGeometry();let grip=f.option('Blender').querySelector('.bui-tag-manager-grip');
    f.pointer(grip,'pointerdown');f.pointer(f.doc,'pointermove',{clientY:236});assert.deepEqual(f.options(),['AI','编程','C4D','Blender']);assert.equal(f.saved.length,0);
    f.key(grip,'Escape');assert.deepEqual(f.options(),['Blender','AI','编程','C4D']);assert.equal(f.saved.length,0);
    f.dragGeometry();grip=f.option('Blender').querySelector('.bui-tag-manager-grip');f.pointer(grip,'pointerdown');f.pointer(f.doc,'pointermove',{clientY:236});f.pointer(f.doc,'pointerup',{clientY:236});await f.tick();
    assert.deepEqual(f.options(),['AI','编程','C4D','Blender']);assert.equal(f.saved.length,1);assert.deepEqual(f.writes,[]);
  }finally{f.close();}
});

test('failed preference saves leave candidates and note values intact and report the failure inside the panel',async()=>{
  const f=fixture({failed:true});try{
    f.open();f.add('摄影');await f.tick();assert.ok(!f.options().includes('摄影'));
    assert.match(f.doc.querySelector('.bui-tag-manager-status').textContent,/未能保存/);assert.deepEqual(f.notices,[]);
    f.click(f.option('Blender').querySelector('.bui-tag-manager-remove'));await f.tick();assert.ok(f.options().includes('Blender'));
    assert.deepEqual(f.saved,[]);assert.deepEqual(f.writes,[]);assert.deepEqual(f.entry.raw.领域,['Blender']);
  }finally{f.close();}
});

test('renaming changes only native display config, and persistence failure rolls it back',async()=>{
  for(const failed of [false,true]){
    const f=fixture({renameFailed:failed});try{
      f.open();const input=f.doc.querySelector('.bui-tag-manager-name-input');input.value='创作领域';f.key(input,'Enter');await f.tick();
      assert.equal(f.configs.get('note.领域').getDisplayName(),failed?'领域':'创作领域');assert.deepEqual(f.writes,[]);assert.deepEqual(f.saved,[]);
      if(failed)assert.match(f.doc.querySelector('.bui-tag-manager-status').textContent,/未能保存/);
    }finally{f.close();}
  }
});

test('IME confirmation does not add a candidate and stale/read-only views cannot use management to write',async()=>{
  const f=fixture();try{
    f.open();const input=f.doc.querySelector('.bui-tag-manager-input');input.dispatchEvent(new f.win.CompositionEvent('compositionstart',{bubbles:true}));f.add('拼音候选');await f.tick();assert.equal(f.saved.length,0);
    input.dispatchEvent(new f.win.CompositionEvent('compositionend',{bubbles:true}));f.add('拼音候选');await f.tick();assert.equal(f.saved.length,0);
    f.view.isReadOnly=true;f.add('不应保存');await f.tick();assert.equal(f.saved.length,0);f.editor.prune();assert.equal(f.doc.querySelector('.bui-tag-manager'),null);
    assert.equal(f.open(),null);assert.deepEqual(f.writes,[]);
  }finally{f.close();}
});

test('controller-only read-only changes and owner replacement block catalog and column-name changes',async()=>{
  for(const invalidate of [view=>{view.queryController.isReadOnly=true;},view=>{view.queryController.view={};}]){
    const f=fixture();try{
      invalidate(f.view);assert.equal(f.open(),null);
      f.view.queryController.isReadOnly=false;f.view.queryController.view=f.view;
      assert.ok(f.open());invalidate(f.view);
      f.add('不应新增');
      f.click(f.option('AI').querySelector('.bui-tag-manager-remove'));
      f.key(f.option('AI').querySelector('.bui-tag-manager-grip'),'ArrowUp',{altKey:true});
      const name=f.doc.querySelector('.bui-tag-manager-name-input');name.value='不应改名';f.key(name,'Enter');
      await f.tick();
      assert.deepEqual(f.saved,[]);assert.deepEqual(f.displayWrites,[]);assert.deepEqual(f.writes,[]);
      f.editor.prune();assert.equal(f.doc.querySelector('.bui-tag-manager'),null);
    }finally{f.close();}
  }
});

test('closing or unloading during pointer reorder cancels preview and clears document listeners',async()=>{
  const f=fixture();try{
    f.open();f.dragGeometry();f.pointer(f.option('AI').querySelector('.bui-tag-manager-grip'),'pointerdown');f.pointer(f.doc,'pointermove',{clientY:236});
    f.editor.clear();f.pointer(f.doc,'pointerup',{clientY:236});await f.tick();assert.equal(f.doc.querySelector('.bui-tag-manager'),null);assert.equal(f.saved.length,0);assert.deepEqual(f.writes,[]);
  }finally{f.close();}
});

test('a slow save keeps focus within the dialog before disabling controls, then restores the input',async()=>{
  let release;const saveWait=new Promise(resolve=>{release=resolve;});
  const f=fixture({saveWait});try{
    const panel=f.open(),input=f.doc.querySelector('.bui-tag-manager-input');
    assert.equal(f.doc.activeElement,input);f.add('摄影');
    assert.equal(input.disabled,true);assert.equal(f.doc.activeElement,panel);assert.equal(panel.isConnected,true);
    release();await f.tick();assert.equal(panel.isConnected,true);assert.equal(input.disabled,false);assert.equal(f.doc.activeElement,input);
    assert.equal(f.saved.length,1);assert.deepEqual(f.writes,[]);
  }finally{release();f.close();}
});

test('the manager supports a held row-body drag while keeping its delete action separate',async()=>{
  const f=fixture();try{
    f.doc.body.classList.add('is-mobile');f.open();f.dragGeometry();
    const chip=f.option('Blender').querySelector('.bui-tag-manager-chip');
    assert.equal(f.pointer(chip,'pointerdown',{pointerType:'touch'}),true);
    await new Promise(resolve=>f.win.setTimeout(resolve,200));
    assert.ok(f.doc.querySelector('.bui-tag-drag-overlay'));
    f.pointer(f.doc,'pointermove',{pointerType:'touch',clientY:236});
    f.pointer(f.doc,'pointerup',{pointerType:'touch',clientY:236});await f.tick();
    assert.deepEqual(f.saved[0].order,['AI','编程','C4D','Blender']);assert.deepEqual(f.writes,[]);
    const remove=f.option('AI').querySelector('.bui-tag-manager-remove');
    f.pointer(remove,'pointerdown',{pointerType:'touch'});
    await new Promise(resolve=>f.win.setTimeout(resolve,200));
    assert.equal(f.doc.querySelector('.bui-tag-drag-overlay'),null,'delete is not a drag handle');
    f.pointer(remove,'pointerup',{pointerType:'touch'});f.click(remove);await f.tick();
    assert.ok(!f.options().includes('AI'));
  }finally{f.close();}
});

test('closing a manager before a row hold expires leaves no delayed ghost or write',async()=>{
  const f=fixture();try{
    f.open();f.dragGeometry();f.pointer(f.option('AI').querySelector('.bui-tag-manager-chip'),'pointerdown',{pointerType:'touch'});
    f.editor.clear();await new Promise(resolve=>f.win.setTimeout(resolve,200));
    assert.equal(f.doc.querySelector('.bui-tag-drag-overlay'),null);assert.deepEqual(f.saved,[]);assert.deepEqual(f.writes,[]);
  }finally{f.close();}
});


test('finance classification headers open the catalog, manage options and rename without editing records',async()=>{
  const profile={titleColumn:'formula.流水页面',titleProperty:'流水摘要',tags:{方向:'single'},wrap:true,attachments:[]};
  const f=fixture({name:'收支流水',profile,records:[{方向:'支出'},{方向:'收入'}]});try{
    assert.ok(f.open('方向'));assert.equal(f.sorts,0);assert.deepEqual(f.options(),['支出','收入']);
    f.add('转账');await f.tick();assert.deepEqual(f.options(),['支出','收入','转账']);assert.deepEqual(f.writes,[]);
    const input=f.doc.querySelector('.bui-tag-manager-name-input');input.value='收支方向';f.key(input,'Enter');await f.tick();
    assert.equal(f.configs.get('note.方向').getDisplayName(),'收支方向');assert.deepEqual(f.writes,[]);
    profile.tags={};f.add('不能添加');await f.tick();assert.equal(f.saved.length,1,'removed classification schema cannot keep an active manager write path');
  }finally{f.close();}
});
