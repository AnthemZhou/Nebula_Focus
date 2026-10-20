const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildSync}=require('esbuild');
const {JSDOM}=require('jsdom');
const code=buildSync({entryPoints:['src/emphasis.ts'],bundle:true,write:false,format:'cjs',platform:'node',external:['@codemirror/state','@codemirror/view']}).outputFiles[0].text;
const mod={exports:{}};new Function('module','exports','require',code)(mod,mod.exports,require);
const {findUnclosedEmphasis,unclosedEmphasisExtension}=mod.exports;
const {EditorState}=require('@codemirror/state');
const {EditorView,Decoration}=require('@codemirror/view');
const empty={markers:[],plain:[]};
function slices(source,ranges){return ranges.map(({from,to})=>source.slice(from,to));}

test('only an unmatched leading single star in top-level prose is corrected',()=>{
 for(const source of ['*普通文字。','  *indented','*one\ncontinued','*one\\*two']){
  const result=findUnclosedEmphasis(source);assert.equal(result.markers.length,1,source);assert.deepEqual(slices(source,result.markers),['*']);
  assert.equal(result.plain[0].from,source.indexOf('*'));assert.equal(result.plain.at(-1).to,source.length);
 }
 for(const source of ['ordinary *later','\\*escaped','**bold','***nested','* item','- *item','> *quote','# *heading','    *code',''])assert.deepEqual(findUnclosedEmphasis(source),empty,source);
});
test('complete emphasis including soft-linebreak pairs and nested runs remains native',()=>{
 for(const source of ['*paired*','*first\nsecond*','*word **bold** end*','*text `*` more*','***bold italic***','*first* and *unfinished','*word _nested_ end*'])assert.deepEqual(findUnclosedEmphasis(source),empty,source);
});
test('stars in inline code and escapes are not considered closing delimiters',()=>{
 for(const source of ['*word `code*` tail','*word ``code `*` `` tail','*word \\*tail']){
  const ranges=findUnclosedEmphasis(source);assert.equal(ranges.markers.length,1,source);
  for(const text of slices(source,ranges.plain))assert(!text.includes('code'),source);
 }
 assert.deepEqual(findUnclosedEmphasis('`*literal code`'),empty);
 assert.deepEqual(findUnclosedEmphasis('```md\n*literal code\n```'),empty);
});
test('independent emphasis, nested emphasis and emphasized link text retain their own ranges',()=>{
 for(const [source,keep]of [
  ['*unclosed **bold** and _valid_',['_valid_']],
  ['*unclosed **bold and _nested_** tail',['_nested_']],
  ['*unclosed [link *valid*](https://example.com)',['*valid*']],
 ]){
  const ranges=findUnclosedEmphasis(source);assert.equal(ranges.markers.length,1,source);
  for(const retained of keep){const start=source.indexOf(retained),end=start+retained.length;assert(ranges.plain.every(r=>r.to<=start||r.from>=end),'Legitimate emphasis would be reset: '+source);}
  assert(slices(source,ranges.plain).join('').includes('unclosed'));
 }
});
test('paragraph boundaries, frontmatter and renderer-owned syntax stay outside correction',()=>{
 const source='---\nvalue: *literal\n---\n\n*first\n\n*paired*\n\n*third';
 const ranges=findUnclosedEmphasis(source);assert.deepEqual(slices(source,ranges.plain),['*first','*third']);assert.equal(ranges.markers.length,2);
 for(const source of ['---\n*unclosed YAML','*word [[file*]]','*word %%comment%%','*word $math$','*word <span>HTML</span>'])assert.deepEqual(findUnclosedEmphasis(source),empty,source);
});
test('source ranges preserve CRLF and non-ASCII source offsets',()=>{
 const source='前言😀\r\n\r\n*中文😀\r\n继续 _有效_';const ranges=findUnclosedEmphasis(source);
 assert.equal(ranges.markers[0].from,source.indexOf('*'));assert.deepEqual(slices(source,ranges.plain),['*中文😀\r\n继续 ']);assert.equal(source,'前言😀\r\n\r\n*中文😀\r\n继续 _有效_');
});

async function withView(source,run){
 const dom=new JSDOM('<!doctype html><style>.nf-writing .is-live-preview .cm-formatting-em{display:none}.cm-em{font-style:italic}</style><div class="workspace-leaf-content nf-writing"><div class="is-live-preview" id="editor"></div></div>',{pretendToBeVisual:true});
 const names=['window','document','MutationObserver','HTMLElement','Node','Text','Window','requestAnimationFrame','cancelAnimationFrame'],previous=new Map(names.map(name=>[name,global[name]]));
 for(const name of names)global[name]=typeof dom.window[name]==='function'&&/AnimationFrame/.test(name)?dom.window[name].bind(dom.window):dom.window[name];
 dom.window.Range.prototype.getClientRects=()=>[];
 dom.window.Range.prototype.getBoundingClientRect=()=>({left:0,right:0,top:0,bottom:0,width:0,height:0});
 const enabled=view=>!!view.dom.closest('.nf-writing')&&!!view.dom.closest('.is-live-preview');
 const native=EditorView.decorations.of(Decoration.set([
  Decoration.mark({class:'cm-em'}).range(0,source.length),
  Decoration.mark({class:'cm-formatting-em'}).range(0,1),
 ],true));
 const state=EditorState.create({doc:source,extensions:[native,unclosedEmphasisExtension(enabled)]});
 const view=new EditorView({state,parent:dom.window.document.querySelector('#editor')});
 try{await run({view,dom,root:dom.window.document.querySelector('.workspace-leaf-content')});}
 finally{view.destroy();dom.window.close();for(const name of names){if(previous.get(name)===undefined)delete global[name];else global[name]=previous.get(name);}}
}
function decoratedRanges(view){
 const ranges={markers:[],plain:[]};
 for(const provider of view.state.facet(EditorView.decorations)){
  const decorations=typeof provider==='function'?provider(view):provider;
  decorations.between(0,view.state.doc.length,(from,to,value)=>{
   const key=value.spec.class==='nf-literal-asterisk'?'markers':value.spec.class==='nf-unclosed-emphasis'?'plain':null;
   if(key)ranges[key].push({from,to});
  });
 }
 for(const key of ['markers','plain'])ranges[key].sort((a,b)=>a.from-b.from||a.to-b.to);
 return ranges;
}
test('real CM decorations expose the unmatched marker, correct surrounding text, and retain valid inline emphasis',async()=>{
 await withView('*unclosed _valid_',async({view,dom})=>{
  assert.equal(view.state.doc.toString(),'*unclosed _valid_');
  const star=view.dom.querySelector('.nf-literal-asterisk');assert.equal(star.textContent,'*');
  const nativeMarker=view.dom.querySelector('.cm-formatting-em');assert.equal(dom.window.getComputedStyle(nativeMarker).display,'inline');
  const plain=view.dom.querySelector('.nf-unclosed-emphasis');assert(plain.textContent.includes('unclosed'));assert(!plain.textContent.includes('valid'));
  assert.equal(dom.window.getComputedStyle(plain).fontStyle,'normal');
  const valid=[...view.dom.querySelectorAll('.cm-em')].find(el=>el.textContent.includes('valid')&&!el.textContent.includes('unclosed'));
  assert(valid,'Native inline emphasis was swallowed by the correction');assert.equal(dom.window.getComputedStyle(valid).fontStyle,'italic');
 });
});
test('real CM updates remove the correction when a closing star is entered and restore it on deletion',async()=>{
 await withView('*unclosed',async({view})=>{
  view.dispatch({changes:{from:view.state.doc.length,insert:'*'}});assert(!view.dom.querySelector('.nf-literal-asterisk'));assert.equal(view.state.doc.toString(),'*unclosed*');
  view.dispatch({changes:{from:view.state.doc.length-1,to:view.state.doc.length}});assert(view.dom.querySelector('.nf-literal-asterisk'));assert.equal(view.state.doc.toString(),'*unclosed');
 });
});
test('mode and pause classes disable decorations without touching source or selection',async()=>{
 await withView('*unclosed',async({view,root})=>{
  view.dispatch({selection:{anchor:4}});root.classList.remove('nf-writing');await new Promise(resolve=>setTimeout(resolve,0));
  assert(!view.dom.querySelector('.nf-literal-asterisk'));assert.equal(view.state.selection.main.head,4);assert.equal(view.state.doc.toString(),'*unclosed');
  root.classList.add('nf-writing');await new Promise(resolve=>setTimeout(resolve,0));assert(view.dom.querySelector('.nf-literal-asterisk'));assert.equal(view.state.selection.main.head,4);
 });
});
test('incremental trees agree with fresh parsing after offset, paragraph, fence, and simultaneous edits',async()=>{
 const source=('这是一段足够长的普通文字。'.repeat(8)+'\n\n').repeat(40)+'*unclosed\nmore _valid_\n\n*second';
 await withView(source,async({view})=>{
  const check=label=>assert.deepEqual(decoratedRanges(view),findUnclosedEmphasis(view.state.doc.toString()),label);
  const edit=(changes,label)=>{view.dispatch({changes});check(label);};
  const index=text=>view.state.doc.toString().indexOf(text);
  check('initial');
  edit({from:0,insert:'开篇😀\n\n'},'shift all source offsets');
  edit({from:index('unclosed')+8,insert:'*'},'close the first emphasis');
  edit({from:index('unclosed')+8,to:index('unclosed')+9},'reopen the first emphasis');
  edit({from:index('_valid_')+7,insert:'*'},'close across soft linebreak');
  edit({from:index('_valid_')+7,to:index('_valid_')+8},'reopen across soft linebreak');
  edit({from:index('more'),insert:'\n'},'split one paragraph into two');
  edit({from:index('more')-1,to:index('more')},'join the split paragraph');
  edit({from:index('*unclosed')-1,to:index('*unclosed')},'remove preceding paragraph boundary');
  edit({from:index('*unclosed'),insert:'\n'},'restore preceding paragraph boundary');
  edit({from:index('*unclosed'),insert:'```md\n'},'open a fence that consumes later paragraphs');
  edit({from:index('*second'),insert:'```\n\n'},'close the fence before the second star');
  edit({from:index('```md'),to:index('```md')+6},'removing opening fence changes following block roles');
  edit({from:index('```\n\n'),to:index('```\n\n')+5},'remove remaining fence');
  edit([{from:0,insert:'---\ntitle: note\n---\n\n'},{from:view.state.doc.length,insert:'*'}],'simultaneous frontmatter and closing edits');
  const closing=index('\n---\n')+1;
  edit({from:closing,to:closing+4},'unterminated frontmatter suppresses all corrections');
  edit({from:closing,insert:'---\n'},'restore frontmatter boundary');
 });
});
test('cached trees stay correct when candidates disappear and when documents change while paused',async()=>{
 await withView(('普通段落。'.repeat(40)+'\n\n').repeat(12)+'*unclosed',async({view,root})=>{
  const check=()=>assert.deepEqual(decoratedRanges(view),findUnclosedEmphasis(view.state.doc.toString()));
  let star=view.state.doc.toString().indexOf('*');
  view.dispatch({changes:{from:star,to:star+1}});check();
  view.dispatch({changes:{from:0,insert:'新增内容\n\n'}});check();
  star=view.state.doc.toString().indexOf('unclosed');
  view.dispatch({changes:{from:star,insert:'*'}});check();
  root.classList.remove('nf-writing');await new Promise(resolve=>setTimeout(resolve,0));
  view.dispatch({changes:[{from:0,insert:'```\n'},{from:view.state.doc.length,insert:'*'}]});
  assert.deepEqual(decoratedRanges(view),empty);
  root.classList.add('nf-writing');await new Promise(resolve=>setTimeout(resolve,0));check();
  view.dispatch({changes:{from:0,to:4}});check();
  view.dispatch({changes:{from:view.state.doc.length-1,to:view.state.doc.length}});check();
  assert.equal(decoratedRanges(view).markers.length,1);
 });
});
