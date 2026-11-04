const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {buildSync} = require('esbuild');
const {JSDOM} = require('jsdom');
const loadGeometryStyles = require('./load-geometry-styles.cjs');
const source = buildSync({entryPoints:['src/idea-row-heights.ts'],bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text;
const widthsSource = buildSync({entryPoints:['src/idea-widths.ts'],bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text;
function load(extra={}) {
  const module = {exports:{}};
  new vm.Script(source).runInContext(vm.createContext({module,exports:module.exports,console,...extra}));
  return module.exports;
}
const geometry = load();
test('variable-height boundaries agree for hit testing, clipped viewports and empty tables', () => {
  const offsets = geometry.heightOffsets([32,56,76,32]);
  assert.deepEqual([...offsets], [0,32,88,164,196]);
  for (const [y,index] of [[-4,0],[0,0],[31.9,0],[32,1],[87.9,1],[88,2],[164,3],[500,3]])
    assert.equal(geometry.rowIndexAt(offsets,y),index);
  assert.deepEqual([...geometry.visibleRowRange(offsets,33,100)],[1,3]);
  assert.deepEqual([...geometry.visibleRowRange(offsets,196,230)],[0,0]);
  assert.deepEqual([...geometry.visibleRowRange([0],0,100)],[0,0]);
});
function fixture() {
  const dom = new JSDOM('<!doctype html><body><div class="bases-view"><div class="bases-thead"></div><div class="bases-table-container"></div></div></body>', {pretendToBeVisual:true});
  const win=dom.window, doc=win.document;
  loadGeometryStyles(doc);
  win.ResizeObserver=class {observe(){}disconnect(){}};
  win.HTMLElement.prototype.setChildrenInPlace=function(nodes) {
    for (const child of [...this.children]) if (!nodes.includes(child)) child.remove();
    nodes.forEach((child,i)=>{if(this.children[i]!==child)this.insertBefore(child,this.children[i]??null);});
  };
  const box=(el,width,height,top=0,left=0)=>{
    Object.defineProperty(el,'offsetWidth',{configurable:true,get:()=>width});
    Object.defineProperty(el,'clientWidth',{configurable:true,get:()=>width});
    el.getBoundingClientRect=()=>({top,left,width,height:typeof height==='function'?height():height,
      right:left+width,bottom:top+(typeof height==='function'?height():height),x:left,y:top});
  };
  const host=doc.querySelector('.bases-view'),container=doc.querySelector('.bases-table-container'),thead=doc.querySelector('.bases-thead');
  box(host,400,300);box(container,400,()=>parseFloat(container.style.height)||300);box(thead,400,30);
  const entries=[32,56,76,32,100].map((height,id)=>({height,file:{path:`${id}.md`},getValue(){return `row ${id}:${this.height}`;}}));
  const props=['formula.想法','note.领域'];
  class Row {
    constructor(view){this.view=view;this.el=doc.createElement('div');this.el.className='bases-tr';this.cells=[];}
    render(entry,properties){
      this.entry=entry;
      if(!this.cells.length)this.cells=properties.map(prop=>{
        const el=doc.createElement('div');el.className='bases-td';el.dataset.property=prop;
        const inner=el.appendChild(doc.createElement('div'));inner.className='bases-table-cell';
        inner.contentEditable='true';inner.setAttribute('tabindex','0');
        this.view.cellLookup.set(el,{prop,el});return {prop,el,inner};
      });
      for(const cell of this.cells)if(!cell.inner.contains(doc.activeElement))cell.inner.textContent=entry.file.path;
    }
    virtualize(widths,left,right){
      let x=0;const cells=[];
      for(let i=0;i<widths.length;i++){const end=x+widths[i];if(end>=left&&x<=right)cells.push(this.cells[i].el);x=end;}
      this.el.setChildrenInPlace(cells);
    }
  }
  const table=container.appendChild(doc.createElement('div')),tbody=table.appendChild(doc.createElement('div'));
  tbody.style.height='300px';box(table,400,()=>parseFloat(tbody.style.height));box(tbody,400,()=>parseFloat(tbody.style.height));
  const nativeCalls={update:0,rect:0,closest:0};
  const original={
    updateVirtualDisplay(){nativeCalls.update++;},
    getCellRect(){nativeCalls.rect++;return 'native';},
    getClosestCellIndexWithinGroup(){nativeCalls.closest++;return 'native';}
  };
  const view={...original,type:'table',_loaded:true,config:Object.freeze({name:'想法收集箱'}),
    queryController:{viewContainerEl:host},containerEl:container,scrollEl:host,theadEl:thead,
    data:{properties:props,data:entries,groupedData:[{entries}]},rows:[],unusedRows:[],cellLookup:new WeakMap(),
    groups:[{tableEl:table,tbodyEl:tbody,virtualize(){}}],columnInfo:Object.fromEntries(props.map(prop=>[prop,{customWidth:200,getWidth(){return this.customWidth;}}])),
    minColWidth:40,maxColWidth:300,header:{cells:[],virtualize(){}},footerSummary:{shouldDisplay:()=>false,virtualize(){}},
    getRowBaseHeight:()=>30,getRowHeightMult:()=>2,isGroupCollapsed:g=>!!g.collapsed,
    activeCell:null,selection:null,activeCellEl:doc.createElement('div'),selectionEl:doc.createElement('div')};
  for(const entry of entries){const row=new Row(view);row.render(entry,props);row.virtualize([200,200],0,400);tbody.append(row.el);view.rows.push(row);}
  const {IdeaRowHeights}=load({HTMLElement:win.HTMLElement,console:{warn(){}}});
  const adapter=new IdeaRowHeights();
  // JSDOM does not calculate text layout. Feed measured CSS-pixel heights into
  // the production layout, hit-testing, selection and cleanup paths.
  adapter.readHeight=row=>entries.find(entry=>row.querySelector('.bases-table-cell').textContent===entry.file.path)?.height??32;
  return {dom,doc,view,adapter,entries,original,nativeCalls,tbody,container,host,box,close(){adapter.clear();dom.window.close();}};
}

test('inert row measurements compact only the same supported tag cells as the live picker',()=>{
  const f=fixture();try{
    f.view.queryController.view=f.view;f.view.updateProperty=()=>{};
    for(const entry of f.entries){entry.file.extension='md';entry.getRawProperty=()=>['Blender'];}
    const prototype=f.view.rows[0].constructor.prototype,render=prototype.render;
    prototype.render=function(entry,properties){render.call(this,entry,properties);for(const cell of this.cells)cell.renderer={entry,propertyEditor:{}};};
    const observed=[];
    f.adapter.readHeight=row=>{observed.push([...row.querySelectorAll('.bui-tag-picker-cell')].map(el=>el.dataset.property));return 32;};
    f.adapter.refresh(f.view);f.view.updateVirtualDisplay();
    assert.equal(observed.length,f.entries.length);assert.ok(observed.every(values=>values.length===1&&values[0]==='note.领域'));
    observed.length=0;f.view.isReadOnly=true;f.adapter.invalidate();f.view.updateVirtualDisplay();
    assert.equal(observed.length,f.entries.length);assert.ok(observed.every(values=>values.length===0));
  }finally{f.close();}
});

test('inert height probes retain native flex overflow so long tags wrap at the live column width',()=>{
  const f=fixture();try{
    const style=f.doc.head.appendChild(f.doc.createElement('style'));
    // Relevant native rules: hidden overflow makes the flex item's automatic
    // minimum inline size zero; visible overflow would use tag min-content.
    style.textContent='.bases-table-cell,.multi-select-container{overflow:hidden}.multi-select-container{display:flex;flex:1 1 auto;flex-wrap:wrap}';
    const prototype=f.view.rows[0].constructor.prototype,render=prototype.render;
    prototype.render=function(entry,properties){
      render.call(this,entry,properties);
      const inner=this.cells[1].inner;
      inner.innerHTML='<div class="multi-select-container"><div class="multi-select-pill">Blender</div><div class="multi-select-pill">很长的自定义标签名称</div></div>';
    };
    let reads=0;
    f.adapter.readHeight=row=>{
      reads++;
      const cell=row.querySelector('[data-property="note.领域"]');
      assert.equal(cell.style.width,'200px');
      for(const item of cell.querySelectorAll('.bases-table-cell,.multi-select-container')){
        assert.equal(f.dom.window.getComputedStyle(item).overflow,'hidden');
        assert.equal(f.dom.window.getComputedStyle(item).height,'auto');
        assert.equal(f.dom.window.getComputedStyle(item).maxHeight,'none');
      }
      return 76;
    };
    f.adapter.refresh(f.view);f.view.updateVirtualDisplay();
    const first=f.tbody.style.height;
    // Native metadata/query updates can replace entries while retaining files.
    f.view.data.groupedData[0].entries=f.entries.map(entry=>({...entry}));
    f.adapter.invalidate();f.view.updateVirtualDisplay();
    assert.equal(f.tbody.style.height,first);assert.equal(reads,f.entries.length*2);
    assert.equal(f.container.querySelector('[aria-hidden="true"]'),null);
  }finally{f.close();}
});

test('native rows keep their editor nodes while layout, hit testing and selection share measured heights',()=>{
  const f=fixture();
  try {
    const oldRow=f.view.rows[1], oldEditor=oldRow.cells[1].inner;
    oldEditor.focus();f.view.activeCell={groupIdx:0,row:1,column:1};
    f.view.selection={groupIdx:0,top:1,bottom:2,start:0,end:1};
    assert.equal(f.adapter.refresh(f.view),true);f.view.updateVirtualDisplay();
    assert.equal(f.view.rows.find(row=>row.entry===f.entries[1]),oldRow);
    assert.equal(f.doc.activeElement,oldEditor);
    assert.equal(f.tbody.style.height,'296px');
    assert.deepEqual([...f.view.rows].map(row=>row.el.style.top),['0px','32px','88px','164px','196px']);
    assert.equal(f.view.activeCellEl.style.height,'55px');
    assert.equal(f.view.selectionEl.style.insetBlockStart,'32px');
    assert.equal(f.view.selectionEl.style.height,'132px');
    const hit=f.view.getClosestCellIndexWithinGroup({clientX:240,clientY:90},0);
    assert.deepEqual({...hit},{groupIdx:0,row:2,column:1});
    const rect=f.view.getCellRect({groupIdx:0,row:2,column:1});
    assert.deepEqual({...rect},{top:58,bottom:164,left:200,right:400});
    f.adapter.clear();
    assert.equal(f.view.updateVirtualDisplay,f.original.updateVirtualDisplay);
    assert.equal(f.view.getCellRect,f.original.getCellRect);
    assert.equal(f.view.getClosestCellIndexWithinGroup,f.original.getClosestCellIndexWithinGroup);
    assert.equal(f.host.classList.contains('bui-ideas-auto'),false);
    assert.equal(oldRow.el.style.getPropertyValue('--bases-table-row-height'),'');
    assert.equal(f.nativeCalls.update,1);
  } finally {f.close();}
});

test('reordering, filtering, content changes and collapsed groups rebuild a consistent vertical index',()=>{
  const f=fixture();
  try {
    f.adapter.refresh(f.view);f.view.updateVirtualDisplay();
    f.entries[0].height=80;
    f.view.data.groupedData=[{entries:[f.entries[2],f.entries[0],f.entries[4]]}];
    f.view.updateVirtualDisplay();
    assert.deepEqual([...f.view.rows].map(row=>row.el.style.top),['0px','76px','156px']);
    assert.equal(f.tbody.style.height,'256px');
    assert.equal(f.view.getClosestCellIndexWithinGroup({clientX:20,clientY:155},0).row,1);
    assert.equal(f.view.getClosestCellIndexWithinGroup({clientX:20,clientY:156},0).row,2);
    f.view.data.groupedData[0].collapsed=true;f.view.updateVirtualDisplay();
    assert.equal(f.tbody.style.height,'0px');assert.equal(f.view.rows.length,0);
    f.view.data.groupedData[0].collapsed=false;f.view.updateVirtualDisplay();
    assert.equal(f.view.rows.length,3);assert.equal(f.tbody.style.height,'256px');
  } finally {f.close();}
});

test('unsupported native group changes restore all geometry methods together',()=>{
  const f=fixture();
  try {
    f.adapter.refresh(f.view);f.view.updateVirtualDisplay();
    f.view.groups[0].virtualize=null;
    f.view.updateVirtualDisplay();
    assert.equal(f.view.updateVirtualDisplay,f.original.updateVirtualDisplay);
    assert.equal(f.view.getCellRect,f.original.getCellRect);
    assert.equal(f.view.getClosestCellIndexWithinGroup,f.original.getClosestCellIndexWithinGroup);
    assert.equal(f.nativeCalls.update,1);
    assert.equal(f.adapter.refresh(f.view),false);
  } finally {f.close();}
});

test('page navigation nearest scrolling preserves header margins and handles oversized rows',()=>{
  assert.equal(geometry.nearestScroll(100,120,180,200,1000),100);
  assert.equal(geometry.nearestScroll(100,60,90,200,1000),60);
  assert.equal(geometry.nearestScroll(100,270,350,200,1000),150);
  assert.equal(geometry.nearestScroll(100,80,400,200,1000),80);
  assert.equal(geometry.nearestScroll(0,-30,50,200,1000),0);
  assert.equal(geometry.nearestScroll(900,1100,1150,200,950),950);
});

test('offscreen rows stay virtualized while a horizontally scrolled native editor remains mounted',()=>{
  const f=fixture();
  try {
    Object.defineProperty(f.dom.window,'innerHeight',{value:40,configurable:true});
    Object.defineProperty(f.dom.window,'innerWidth',{value:180,configurable:true});
    const editor=f.view.rows[1].cells[1].inner;
    f.box(editor,150,20,40,220);editor.focus();
    f.view.activeCell={groupIdx:0,row:1,column:1};
    f.adapter.refresh(f.view);f.view.updateVirtualDisplay();
    assert.equal(f.view.rows.length,3);
    assert.equal(f.doc.activeElement,editor);
    assert.equal(editor.isConnected,true);
    assert.equal(f.view.rows.some(row=>row.entry===f.entries[4]),false);
  } finally {f.close();}
});

test('continuous native column resize does no row measurement and commits exact heights once on release',()=>{
  const f=fixture();
  try {
    const resizer=f.view.theadEl.appendChild(f.doc.createElement('div'));
    resizer.className='bases-table-header-resizer';
    f.adapter.refresh(f.view);f.view.updateVirtualDisplay();
    const before=f.adapter.stats()[0];
    resizer.dispatchEvent(new f.dom.window.MouseEvent('pointerdown',{button:0,bubbles:true}));
    resizer.dispatchEvent(new f.dom.window.Event('dragstart',{bubbles:true}));
    // Chromium transfers the pointer stream to HTML drag-and-drop here.
    f.dom.window.dispatchEvent(new f.dom.window.Event('pointercancel'));
    f.dom.window.dispatchEvent(new f.dom.window.Event('pointerup'));
    assert.equal(f.adapter.isResizing(),true);
    assert.equal(f.adapter.stats()[0].resizeKind,'drag');
    assert.equal(f.adapter.stats()[0].dragStarts,1);
    assert.equal(f.adapter.stats()[0].ignoredPointerCancels,1);
    f.entries[0].height=128; // Text now wraps at the narrower final native width.
    for(let step=0;step<30;step++) {
      f.view.columnInfo['formula.想法'].customWidth=100+step;
      f.view.updateVirtualDisplay();
      assert.equal(f.adapter.refresh(f.view),false);
    }
    let stats=f.adapter.stats()[0];
    assert.equal(stats.previewLayouts-before.previewLayouts,30);
    assert.equal(stats.measurementBatches,before.measurementBatches);
    assert.equal(stats.measuredRows,before.measuredRows);
    assert.equal(f.view.rows[1].el.style.top,'32px');
    assert.equal(f.view.getClosestCellIndexWithinGroup({clientX:20,clientY:33},0).row,1);
    // Unrelated editor blur does not end a desktop/mobile resize gesture.
    f.view.rows[0].cells[0].inner.dispatchEvent(new f.dom.window.FocusEvent('blur'));
    assert.equal(f.adapter.isResizing(),true);
    f.dom.window.dispatchEvent(new f.dom.window.Event('drop'));
    assert.equal(f.adapter.isResizing(),false);
    assert.equal(f.adapter.stats()[0].lastResizeEnd,'drop');
    f.view.updateVirtualDisplay();
    stats=f.adapter.stats()[0];
    assert.equal(stats.measurementBatches,before.measurementBatches+1);
    assert.equal(stats.measuredRows,before.measuredRows+f.entries.length);
    assert.equal(f.view.rows[1].el.style.top,'128px');
    assert.equal(f.view.getClosestCellIndexWithinGroup({clientX:20,clientY:127},0).row,0);
    assert.equal(f.view.getClosestCellIndexWithinGroup({clientX:20,clientY:128},0).row,1);
    assert.equal(f.view.columnInfo['formula.想法'].customWidth,129);
    f.view.updateVirtualDisplay();
    assert.equal(f.adapter.stats()[0].measurementBatches,stats.measurementBatches);
  } finally {f.close();}
});

test('invalid rows are mounted together before dimension reads; unchanged selection and scroll reuse the cache',()=>{
  const f=fixture();
  try {
    let fragmentWrites=0, reads=0;
    const append=f.container.append.bind(f.container);
    f.container.append=(...nodes)=>{if(nodes.some(node=>node.nodeType===11))fragmentWrites++;append(...nodes);};
    const read=f.adapter.readHeight.bind(f.adapter);
    f.adapter.readHeight=(row,width)=>{
      reads++;
      assert.equal(f.container.querySelectorAll('.bases-tr[aria-hidden="true"]').length,f.entries.length);
      return read(row,width);
    };
    f.adapter.refresh(f.view);f.view.updateVirtualDisplay();
    assert.equal(fragmentWrites,1);assert.equal(reads,f.entries.length);
    f.view.selection={groupIdx:0,top:1,bottom:3,start:0,end:1};
    f.view.updateVirtualDisplay();f.view.updateVirtualDisplay();
    assert.equal(fragmentWrites,1);assert.equal(reads,f.entries.length);
    assert.equal(f.container.querySelectorAll('[aria-hidden="true"]').length,0);
  } finally {f.close();}
});

test('pointer resize cancel and unload remove transient preview state and pending final measurements',()=>{
  const f=fixture();
  try {
    const resizer=f.view.theadEl.appendChild(f.doc.createElement('div'));resizer.className='bases-table-header-resizer';
    f.adapter.refresh(f.view);f.view.updateVirtualDisplay();
    resizer.dispatchEvent(new f.dom.window.MouseEvent('pointerdown',{button:0,bubbles:true}));
    assert.equal(f.adapter.isResizing(),true);
    f.dom.window.dispatchEvent(new f.dom.window.Event('pointercancel'));
    assert.equal(f.adapter.isResizing(),false);
    resizer.dispatchEvent(new f.dom.window.MouseEvent('pointerdown',{button:0,bubbles:true}));
    f.adapter.clear();
    assert.equal(f.host.classList.contains('bui-ideas-resizing'),false);
    assert.equal(f.adapter.isResizing(),false);
    resizer.dispatchEvent(new f.dom.window.Event('dragstart',{bubbles:true}));
    assert.equal(f.host.classList.contains('bui-ideas-resizing'),false);
    assert.equal(f.view.updateVirtualDisplay,f.original.updateVirtualDisplay);
  } finally {f.close();}
});

test('classification minima reuse unchanged fonts and unique labels; native resizing performs no measurement',()=>{
  const dom=new JSDOM('<!doctype html><body><div class="bases-view"><div class="bases-thead"><div class="bases-td"><div class="header-inner" style="padding:0 8px;gap:4px"><span class="bases-table-header-name" style="font-size:14px">领域</span></div></div></div><div class="bases-table-container"><div class="bases-td" data-property="note.领域"><div class="bases-table-cell" data-property-type="multitext"><div class="multi-select-container" style="padding:6px 8px;gap:2px"><div class="multi-select-pill" style="gap:2px"><span class="multi-select-pill-content" style="font-size:14px;padding:1px 6px">AI</span><span class="multi-select-pill-remove-button" style="width:14px"></span></div><div class="multi-select-input" style="font-size:14px;min-width:8px"></div></div></div></div></div></div></body>');
  const win=dom.window,doc=win.document;
  loadGeometryStyles(doc);
  let rectangles=0,textReads=0,styleReads=0;
  const nativeStyle=win.getComputedStyle.bind(win);win.getComputedStyle=el=>{styleReads++;return nativeStyle(el);};
  win.HTMLElement.prototype.getBoundingClientRect=function(){
    rectangles++;
    if(this.classList.contains('bases-view'))return {width:800,height:300};
    if(nativeStyle(this).position==='fixed'){textReads++;return {width:[...this.textContent].length*8,height:18};}
    return {width:this.classList.contains('multi-select-pill-remove-button')?14:0,height:14};
  };
  const host=doc.querySelector('.bases-view'),container=doc.querySelector('.bases-table-container'),header=doc.querySelector('.bases-thead .bases-td');
  const values=Array.from({length:50},()=>['AI']);
  const info={customWidth:65,getWidth(min,max){return Math.max(min,Math.min(max,this.customWidth));}};
  const original=info.getWidth;
  const view={type:'table',_loaded:true,queryController:{viewContainerEl:host},containerEl:container,config:{name:'想法收集箱'},
    data:{properties:['note.领域'],data:values.map(tags=>({getValue:()=>({data:tags})}))},columnInfo:{'note.领域':info},
    header:{cells:[{prop:'note.领域',el:header,innerEl:header.firstElementChild}]},updateVirtualDisplay(){}};
  const module={exports:{}};
  new vm.Script(widthsSource)
    .runInContext(vm.createContext({module,exports:module.exports,HTMLElement:win.HTMLElement}));
  const widths=new module.exports.IdeaColumnWidths();
  try {
    assert.equal(widths.refresh(view),true);
    assert.equal(textReads,2); // Header plus AI, although AI occurs in 50 rows.
    const before={rectangles,textReads,styleReads};
    for(let i=0;i<30;i++)assert.equal(widths.refresh(view),false);
    assert.equal(rectangles,before.rectangles);
    assert.equal(textReads,before.textReads);
    assert.equal(styleReads-before.styleReads,30); // One host-font signature, no per-label style reads.
    const normal=info.getWidth(40,300);
    host.classList.add('bui-ideas-resizing');
    const drag={rectangles,styleReads};
    values[0].push('一条新的很长的分类标签');
    for(let i=0;i<30;i++){info.customWidth=65+i;assert.equal(widths.refresh(view),false);}
    assert.equal(rectangles,drag.rectangles);assert.equal(styleReads,drag.styleReads);
    host.classList.remove('bui-ideas-resizing');
    assert.equal(widths.refresh(view),true);
    assert(info.getWidth(40,300)>normal);
    assert.equal(info.customWidth,94);
    widths.clear();assert.equal(info.getWidth,original);assert.equal(info.customWidth,94);
  } finally {widths.clear();dom.window.close();}
});

test('classification width is stable across empty first rows, metadata refresh and virtualized tag cells',()=>{
  const dom=new JSDOM(`<!doctype html><body><style>
    .multi-select-pill-content,.multi-select-input{font-size:16px}
    .multi-select-container{padding:5px 8px 6px;gap:4px 6px}
    .multi-select-pill{padding:0;gap:0}
    .multi-select-pill-content{padding:1px 6px}
    .bui-tag-picker-cell .multi-select-pill-remove-button{display:none}
  </style><div class="bases-view bui-ideas-base"><div class="bases-thead"><div class="bases-td"><div class="header-inner"><span class="bases-table-header-name" style="font-size:16px">领域</span></div></div></div><div class="bases-table-container"><div class="bases-td" data-property="note.领域"><div class="bases-table-cell" data-property-type="multitext"><div class="multi-select-container"><div class="multi-select-input"></div></div></div></div></div></div></body>`);
  const win=dom.window,doc=win.document;
  loadGeometryStyles(doc);
  win.HTMLElement.prototype.getBoundingClientRect=function(){
    if(this.classList.contains('bases-view'))return {width:430,height:300};
    if(win.getComputedStyle(this).position==='fixed')return {width:[...this.textContent].length*16,height:20};
    return {width:this.classList.contains('multi-select-pill-remove-button')?12:0,height:20};
  };
  const host=doc.querySelector('.bases-view'),container=doc.querySelector('.bases-table-container'),cell=container.firstElementChild,header=doc.querySelector('.bases-thead .bases-td');
  const info={customWidth:130,getWidth(){return this.customWidth;}};
  const labels=['Blender','编程','C4D','很长的自定义标签名称'];
  const entries=[[],labels].map((value,index)=>({file:{path:`${index}.md`,extension:'md'},getValue:()=>({data:value}),getRawProperty:()=>value}));
  const view={type:'table',_loaded:true,queryController:{viewContainerEl:host},containerEl:container,config:{name:'想法收集箱'},
    data:{properties:['note.领域'],data:entries},rows:[{cells:[{prop:'note.领域',el:cell,renderer:{entry:entries[0],propertyEditor:{}}}]}],columnInfo:{'note.领域':info},
    header:{cells:[{prop:'note.领域',el:header,innerEl:header.firstElementChild}]},updateVirtualDisplay(){}};
  const module={exports:{}};
  new vm.Script(widthsSource)
    .runInContext(vm.createContext({module,exports:module.exports,HTMLElement:win.HTMLElement}));
  const widths=new module.exports.IdeaColumnWidths();
  view.queryController.view=view;view.updateProperty=()=>{};
  try{
    widths.refresh(view);const initial=info.getWidth(40,300);
    assert.equal(cell.classList.contains('bui-tag-picker-cell'),false,'measurement does not mark live cells');
    cell.classList.add('bui-tag-picker-cell');
    assert.equal(widths.refresh(view),false,'later picker decoration must not change the cached clamp');
    assert.equal(info.getWidth(40,300),initial,'first frame and decorated frame use identical widths');
    const list=cell.querySelector('.multi-select-container');
    list.insertAdjacentHTML('afterbegin','<div class="multi-select-pill"><div class="multi-select-pill-content">Blender</div><div class="multi-select-pill-remove-button"></div></div>');
    widths.invalidate();widths.refresh(view);
    assert.equal(info.getWidth(40,300),initial,'populated first row uses the same tag box as an empty row');
    // A new empty entry/query identity does not change the same label-set width.
    view.data.data=[...entries,{getValue:()=>({data:[]})}];
    info.customWidth=130;widths.invalidate();widths.refresh(view);
    assert.equal(info.getWidth(40,300),initial);
    cell.remove();widths.invalidate();widths.refresh(view);
    assert.equal(info.getWidth(40,300),initial,'offscreen native cells retain the same schema and styles');
    container.append(cell);view.isReadOnly=true;widths.refresh(view);
    assert.equal(info.getWidth(40,300),initial+12,'a native fallback reserves its visible remove control even before stale picker decoration is removed');
    assert.equal(container.querySelector('[aria-hidden="true"]'),null);assert.equal(info.customWidth,130);
  }finally{widths.clear();dom.window.close();}
});


test('unrecognized native layout shapes fall back without wrapping geometry methods',()=>{
  const f=fixture();try {
    f.view.groups[0].tbodyEl={};
    assert.equal(f.adapter.refresh(f.view),false);
    assert.equal(f.view.updateVirtualDisplay,f.original.updateVirtualDisplay);
    assert.equal(f.host.classList.contains('bui-ideas-auto'),false);
    assert.equal(f.container.querySelector('[aria-hidden="true"]'),null);
  }finally{f.close();}
});
