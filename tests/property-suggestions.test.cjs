const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {transformSync}=require('esbuild');
const {JSDOM}=require('jsdom');
const source=transformSync(fs.readFileSync('src/property-suggestions.ts','utf8'),{loader:'ts',format:'cjs'}).code;
function fixture() {
  const dom=new JSDOM('<!doctype html><body></body>',{pretendToBeVisual:true});
  const win=dom.window,doc=win.document,commits=[],selections=[];
  const stack={scope:null};const app={keymap:{getWindowStack:()=>stack}};
  class AbstractInputSuggest {
    constructor(app,input){
      this.app=app;this.textInputEl=input;this.suggestEl=doc.createElement('div');this.suggestEl.className='suggestion-container';
      this.isOpen=false;this.closeCount=0;this.historyCalls=0;this.linkCalls=0;this.cancelled=0;
      this.suggestions={values:[],setSuggestions:values=>{this.suggestions.values=values;}};
      this.manager={runnable:{cancel:()=>this.cancelled++}};
      const owner=this;
      this.scope={keys:['ArrowUp','ArrowDown','Enter','Tab','#','^'].map(key=>({key,func(){}}))};
      // The real native closure closes the popover, not the contenteditable.
      this.scope.keys.push({key:'Escape',func:function(event){return owner.onEscapeKey(event),false;}});
      this.bound=this.onInputChange.bind(this);input.addEventListener('input',this.bound);
      input.addEventListener('focus',()=>this.onInputChange());
    }
    getValue(){return this.textInputEl.textContent;}
    getSuggestions(value){if(value.startsWith('[[')){this.linkCalls++;return [{type:'file',text:'picked.md'}];}this.historyCalls++;return [{type:'text',text:'unwanted old value'}];}
    onInputChange(){
      this.runnable?.cancel();const runnable={cancelled:false,cancel(){this.cancelled=true;}};this.runnable=runnable;
      const result=this.getSuggestions(this.getValue());
      Promise.resolve(result).then(values=>{if(!runnable.cancelled)this.showSuggestions(values);});
    }
    showSuggestions(values){if(!values.length){this.close();return;}this.suggestions.setSuggestions(values);this.isOpen=true;stack.scope=this.scope;doc.body.append(this.suggestEl);}
    close(){this.closeCount++;this.isOpen=false;this.suggestions.setSuggestions([]);this.suggestEl.remove();if(stack.scope===this.scope)stack.scope=null;}
    onEscapeKey(){this.close();}
  }
  class PropertySuggest extends AbstractInputSuggest {
    constructor(key,input,ownerApp=app){super(ownerApp,input);this.context={key};this.suggestEl.classList.add('mod-property-value');this.suggestEl.dataset.propertyKey=key.toLowerCase();}
    // Native property suggest overrides this method and calls the base method.
    showSuggestions(values){super.showSuggestions(values);}
  }
  doc.addEventListener('keydown',event=>{
    if(event.key==='Enter'&&!event.isComposing&&stack.scope){
      const instance=instances.find(instance=>instance.scope===stack.scope);
      if(instance?.suggestions.values.length){selections.push(instance.suggestions.values[0].text);event.preventDefault();}
    }
  },true);
  const instances=[];
  const make=(key,{base=false,list=false,value='正在输入的新文字',ownerApp=app,attach=true}={})=>{
    const row=doc.createElement('div');row.className=base?'bases-td':'metadata-property';
    row.dataset[base?'property':'propertyKey']=base?'note.'+key:key;
    const input=row.appendChild(doc.createElement('div'));input.className=list?'multi-select-input':'metadata-input-longtext';input.contentEditable='true';input.tabIndex=0;input.textContent=value;
    if(attach)doc.body.append(row);
    input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing&&!event.defaultPrevented){event.preventDefault();commits.push(input.textContent);}});
    const suggest=new PropertySuggest(key,input,ownerApp);instances.push(suggest);return {row,input,suggest};
  };
  const mod={exports:{}};
  new vm.Script(source).runInContext(vm.createContext({module:mod,exports:mod.exports,require:name=>{assert.equal(name,'obsidian');return {AbstractInputSuggest};}}));
  const policy=new mod.exports.PropertySuggestions(app);
  return {dom,win,doc,app,stack,policy,make,AbstractInputSuggest,PropertySuggest,commits,selections,
    flush:async()=>{await Promise.resolve();await Promise.resolve();},close(){policy.clear();dom.window.close();}};
}

test('existing and new free-text editors close native history suggestions without changing Enter commits or IME',async()=>{
  const f=fixture();
  try {
    const existing=f.make('项目下一步'); // Constructor bound the old onInputChange.
    f.policy.refresh(f.doc);
    existing.input.dispatchEvent(new f.win.InputEvent('input',{bubbles:true,inputType:'insertText'}));await f.flush();
    assert.equal(existing.suggest.historyCalls,1);assert.equal(existing.suggest.isOpen,false);
    assert.deepEqual([...existing.suggest.suggestions.values],[]);assert.equal(f.stack.scope,null);
    existing.input.dispatchEvent(new f.win.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
    assert.deepEqual(f.commits,['正在输入的新文字']);assert.deepEqual(f.selections,[]);
    const next=f.make('项目摘要');next.input.focus();await f.flush();
    assert.equal(next.suggest.historyCalls,0);
    next.input.dispatchEvent(new f.win.CompositionEvent('compositionstart',{bubbles:true}));
    next.input.textContent='输入法候选尚未结束';
    next.input.dispatchEvent(new f.win.InputEvent('input',{bubbles:true,isComposing:true}));
    next.input.dispatchEvent(new f.win.KeyboardEvent('keydown',{key:'Enter',isComposing:true,bubbles:true,cancelable:true}));
    assert.equal(f.doc.activeElement,next.input);assert.equal(next.input.textContent,'输入法候选尚未结束');
    assert.deepEqual(f.commits,['正在输入的新文字']);
  }finally{f.close();}
});

test('media history is suppressed in notes and Bases while explicit links and classification suggestions remain native',async()=>{
  const f=fixture();
  try {
    f.policy.refresh(f.doc);
    for(const base of [false,true]) {
      const media=f.make('文件和媒体',{base,list:true,value:'https://example.test/new.png'});
      media.input.dispatchEvent(new f.win.InputEvent('input'));await f.flush();
      assert.equal(media.suggest.isOpen,false);assert.equal(media.suggest.historyCalls,0);
      assert.equal(media.input.textContent,'https://example.test/new.png');
      media.input.textContent='[[新素材';media.input.dispatchEvent(new f.win.InputEvent('input'));await f.flush();
      assert.equal(media.suggest.linkCalls,1);assert.equal(media.suggest.isOpen,true);
      assert.equal(media.suggest.suggestions.values[0].type,'file');media.suggest.close();
    }
    for(const key of ['状态','类型','重要性','领域','发布平台','内容类型']) {
      const classification=f.make(key,{base:true,list:key==='领域'});
      classification.input.dispatchEvent(new f.win.InputEvent('input'));await f.flush();
      assert.equal(classification.suggest.historyCalls,1);assert.equal(classification.suggest.isOpen,true);
      classification.suggest.close();
    }
    const proseLink=f.make('项目下一步',{value:'[[参考文档'});
    proseLink.input.dispatchEvent(new f.win.InputEvent('input'));await f.flush();
    assert.equal(proseLink.suggest.isOpen,true);assert.equal(proseLink.suggest.linkCalls,1);
  }finally{f.close();}
});

test('late async suggestions are cancelled and cleared after changing from a link to plain prose',async()=>{
  const f=fixture();
  try {
    f.policy.refresh(f.doc);const item=f.make('项目下一步',{value:'[[pending'});
    let finish;item.suggest.getSuggestions=()=>new Promise(resolve=>finish=resolve);
    item.input.dispatchEvent(new f.win.InputEvent('input'));
    item.input.textContent='继续写自己的句子';item.input.dispatchEvent(new f.win.InputEvent('input'));
    finish([{type:'file',text:'stale.md'}]);await f.flush();
    assert.equal(item.suggest.isOpen,false);assert.deepEqual([...item.suggest.suggestions.values],[]);
    assert.equal(f.stack.scope,null);assert.equal(item.input.textContent,'继续写自己的句子');
    assert(item.suggest.cancelled>0);assert.deepEqual(f.commits,[]);
  }finally{f.close();}
});

test('enabling on an already-open property popup closes only its native scope without Escape reaching the editor',async()=>{
  const f=fixture();
  try {
    const item=f.make('项目下一步');item.input.focus();await f.flush();
    assert.equal(item.suggest.isOpen,true);
    let editorEscapes=0;item.input.addEventListener('keydown',event=>{if(event.key==='Escape')editorEscapes++;});
    f.policy.refresh(f.doc);
    assert.equal(item.suggest.isOpen,false);assert.equal(f.stack.scope,null);
    assert.equal(editorEscapes,0);assert.equal(f.doc.activeElement,item.input);
    assert.equal(item.input.textContent,'正在输入的新文字');assert.deepEqual(f.commits,[]);
  }finally{f.close();}
});

test('unrelated suggesters and other apps are unaffected; clear restores native behavior and later wrappers',async()=>{
  const f=fixture();
  try {
    const originalInput=f.AbstractInputSuggest.prototype.onInputChange,originalShow=f.AbstractInputSuggest.prototype.showSuggestions;
    f.policy.refresh(f.doc);
    const other=f.make('项目下一步',{ownerApp:{}});
    other.input.dispatchEvent(new f.win.InputEvent('input'));await f.flush();assert.equal(other.suggest.isOpen,true);other.suggest.close();
    const unrelated=f.make('项目下一步');unrelated.suggest.suggestEl.classList.remove('mod-property-value');
    unrelated.input.dispatchEvent(new f.win.InputEvent('input'));await f.flush();assert.equal(unrelated.suggest.isOpen,true);unrelated.suggest.close();
    f.policy.clear();
    assert.equal(f.AbstractInputSuggest.prototype.onInputChange,originalInput);assert.equal(f.AbstractInputSuggest.prototype.showSuggestions,originalShow);
    const ordinary=f.make('项目摘要');ordinary.input.dispatchEvent(new f.win.InputEvent('input'));await f.flush();assert.equal(ordinary.suggest.isOpen,true);ordinary.suggest.close();
    f.policy.refresh(f.doc);
    const ours=f.AbstractInputSuggest.prototype.showSuggestions;
    const later=function(...args){return ours.apply(this,args);};f.AbstractInputSuggest.prototype.showSuggestions=later;
    f.policy.clear();assert.equal(f.AbstractInputSuggest.prototype.showSuggestions,later);
    ordinary.suggest.showSuggestions([{type:'text',text:'native again'}]);assert.equal(ordinary.suggest.isOpen,true);
  }finally{f.close();}
});

test('older runtime or fixtures without the exported input-suggest class safely skip installation',()=>{
  const dom=new JSDOM('<!doctype html><body></body>');const mod={exports:{}};
  try {
    new vm.Script(source).runInContext(vm.createContext({module:mod,exports:mod.exports,require:()=>({})}));
    const policy=new mod.exports.PropertySuggestions({});policy.refresh(dom.window.document);policy.clear();
  }finally{dom.window.close();}
});
