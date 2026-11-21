const {test}=require('node:test');
const assert=require('node:assert/strict');
const {EventEmitter}=require('node:events');
const {buildSync}=require('esbuild');
const code=buildSync({entryPoints:['src/notion-rule-view.ts'],bundle:true,write:false,format:'cjs',platform:'node',external:['obsidian']}).outputFiles[0].text;
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('registered rule block selects fields, refreshes after related edits and disconnects across reloads',async()=>{
  class Element {
    constructor(tag){this.tag=tag;this.children=[];this.text='';}
    createEl(tag,options){const child=new Element(tag);child.text=options?.text??'';this.children.push(child);return child;}
    empty(){this.children=[];this.text='';}
    setText(value){this.empty();this.text=value;}
  }
  const el=new Element('div');
  const events = new EventEmitter();
  const on=(event,fn)=>{events.on(event,fn);return ()=>events.off(event,fn);};
  class Child {
    constructor(containerEl){this.containerEl=containerEl;this.clean=[];}
    registerEvent(fn){this.clean.push(fn);}
    register(fn){this.clean.push(fn);}
    load(){this.onload();}
    unload(){this.onunload();for(const fn of this.clean)fn();}
  }
  const m={exports:{}};
  new Function('module','exports','require',code)(m,m.exports,()=>({MarkdownRenderChild:Child,Modal:class{},debounce(fn){fn.cancel=()=>{};return fn;}}));
  const account={path:'Book/A.md'},payment={path:'Book/P.md'},rules={path:'Book/nebula-notion-rules.json'};
  const props=new Map([[account,{nf_source_collection:'accounts',nf_source_id:'account-one',Entries:['[[P]]']}],
    [payment,{nf_source_collection:'entries',Amount:4}]]);
  const sources={accounts:{properties:{Entries:{type:'relation',relation:{data_source_id:'entries'}},
    Total:{type:'rollup',rollup:{function:'sum',relation_property_name:'Entries',rollup_property_name:'Amount'}},
    Double:{type:'formula',formula:{expression:'prop("Total") * 2'}},
    Other:{type:'formula',formula:{expression:'1'}}}},entries:{properties:{Amount:{type:'number'}}}};
  const app={vault:{on,getFileByPath:path=>path===rules.path?rules:null,cachedRead:async()=>JSON.stringify({version:1,sources}),getMarkdownFiles:()=>[account,payment]},
    metadataCache:{on,getFileCache:file=>({frontmatter:props.get(file)}),getFirstLinkpathDest:name=>name==='P'?payment:null}};
  let block,child;
  const plugin={app,register(){},registerMarkdownCodeBlockProcessor(name,fn){assert.equal(name,'nebula-notion-rules');block=fn;},addCommand(){}};
  function mount(source,path){m.exports.registerNotionRules(plugin);block(source,el,{sourcePath:path,addChild(item){child=item;child.load();}});}
  const cells=()=>el.children[0].children.find(e=>e.tag==='tbody').children.map(row=>row.children.map(c=>c.text));
    mount('account-one\nDouble\nTotal','Book/Dashboard.md');await tick();
    assert.deepEqual(cells(),[['Double','8'],['Total','4']]);
    props.get(payment).Amount=6;events.emit('changed',payment);await tick();
    assert.deepEqual(cells(),[['Double','12'],['Total','6']]);
    sources.accounts.properties.Double.formula.expression='prop("Total") * 3';events.emit('modify',rules);await tick();
    assert.equal(cells()[0][1],'18');
    child.unload();assert.equal(events.listenerCount('changed'),0);
    mount('.\nOther\nmissing',account.path);await tick();
    assert.deepEqual(cells(),[['Other','1'],['missing','未取得 · 字段不是已定义的公式或汇总']]);
    child.unload();assert.equal(events.listenerCount('modify'),0);
});
