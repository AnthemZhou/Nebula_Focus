const {test} = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const {buildSync} = require('esbuild');
const vm = require('node:vm');
const moduleSource = buildSync({entryPoints:['src/overflow-fades.ts'],bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text;
function fixture() {
  const dom = new JSDOM('<body><div class="mod-root"><div class="markdown-preview-view"><div></div></div></div></body>');
  const doc=dom.window.document, el=doc.querySelector('.markdown-preview-view'), observers=[];
  dom.window.ResizeObserver=class {
    constructor(callback){this.callback=callback;this.targets=new Set();observers.push(this);}
    observe(el){this.targets.add(el);} unobserve(el){this.targets.delete(el);} disconnect(){this.targets.clear();}
  };
  const m={exports:{}};vm.runInNewContext(moduleSource,{module:m,exports:m.exports});
  const fades=new m.exports.OverflowFades();
  let width=400,content=800;
  Object.defineProperties(el,{clientWidth:{get:()=>width},scrollWidth:{get:()=>content}});
  const scroll=left=>{el.scrollLeft=left;el.dispatchEvent(new dom.window.Event('scroll'));};
  return {dom,doc,el,observers,fades,scroll,resize(w,c=content){width=w;content=c;observers.forEach(o=>o.callback());},close(){fades.clear();dom.window.close();}};
}
test('fades track both scroll edges and reveal the final border without changing content geometry',()=>{
  const f=fixture();try{
    f.fades.refresh(f.doc);
    assert.ok(f.el.classList.contains('bui-overflow-right'));
    f.scroll(100);assert.ok(f.el.classList.contains('bui-overflow-left'));
    f.scroll(400);assert.ok(!f.el.classList.contains('bui-overflow-right'));
    assert.equal(f.el.scrollWidth,800);assert.equal(f.el.style.cssText,'');
    f.scroll(0);f.resize(900);assert.equal(f.el.className,'markdown-preview-view');
    f.resize(0);assert.equal(f.el.className,'markdown-preview-view');
  }finally{f.close();}
});
test('content resize, replacement and teardown retain no stale fade or listeners',()=>{
  const f=fixture();try{
    f.fades.refresh(f.doc);const old=f.el.firstElementChild;
    f.el.replaceChildren(f.doc.createElement('section'));f.fades.refresh(f.doc);
    assert.equal(f.observers.length,1);assert.ok(!f.observers[0].targets.has(old));
    assert.ok(f.observers[0].targets.has(f.el.firstElementChild));
    f.resize(400,300);assert.equal(f.el.className,'markdown-preview-view');
    f.resize(400,900);assert.ok(f.el.classList.contains('bui-overflow-right'));
    f.fades.clear();f.scroll(100);
    assert.equal(f.el.className,'markdown-preview-view');assert.equal(f.observers[0].targets.size,0);
  }finally{f.close();}
});
test('right-to-left scrollers fade their hidden start/end correctly',()=>{
  const f=fixture();try{
    f.el.style.direction='rtl';f.fades.refresh(f.doc);
    assert.ok(f.el.classList.contains('bui-overflow-left'));assert.ok(!f.el.classList.contains('bui-overflow-right'));
    f.scroll(-400);assert.ok(!f.el.classList.contains('bui-overflow-left'));assert.ok(f.el.classList.contains('bui-overflow-right'));
  }finally{f.close();}
});
test('mobile and detached views do not retain desktop observers',()=>{
  const f=fixture();try{
    f.doc.body.classList.add('is-mobile');f.fades.refresh(f.doc);assert.equal(f.observers.length,0);
    f.doc.body.classList.remove('is-mobile');f.fades.refresh(f.doc);f.el.remove();f.fades.refresh(f.doc);
    assert.equal(f.observers[0].targets.size,0);assert.equal(f.el.className,'markdown-preview-view');
  }finally{f.close();}
});

test('minor board overflow does not fade, and the last few pixels reveal the end',()=>{
  const f=fixture();try{
    f.fades.refresh(f.doc);
    for(const extra of [1,2,8,24]){f.resize(400,400+extra);assert.equal(f.el.className,'markdown-preview-view');}
    f.resize(400,450);assert.ok(f.el.classList.contains('bui-overflow-right'));
    f.scroll(43);assert.ok(!f.el.classList.contains('bui-overflow-right'));
    f.scroll(5);assert.ok(!f.el.classList.contains('bui-overflow-left'));
  }finally{f.close();}
});
