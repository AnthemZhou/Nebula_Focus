const {test}=require('node:test');
const assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const {buildSync}=require('esbuild');
const vm=require('node:vm');
const code=buildSync({entryPoints:['src/desktop-header.ts'],bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text;
function fixture(){
  const dom=new JSDOM('<body><div class="workspace"><div class="mod-left-split"><div class="workspace-tabs"><div class="workspace-tab-header-container"><div class="workspace-tab-header-container-inner">Native tabs</div></div></div></div><div class="mod-root"><div class="workspace-tabs nf-main-region"><div class="workspace-tab-header-container"><span>Current title</span></div><div class="workspace-tab-container"></div></div></div></div></body>');
  const doc=dom.window.document,m={exports:{}};vm.runInNewContext(code,{module:m,exports:m.exports});
  const controller=new m.exports.DesktopHeader(),side=doc.querySelector('.mod-left-split'),host=side.querySelector('.workspace-tab-header-container'),top=doc.querySelector('.nf-main-region > .workspace-tab-header-container');
  const add=(hidden=false)=>{
    const leaf=doc.createElement('div');leaf.className='workspace-leaf';leaf.style.display=hidden?'none':'flex';
    leaf.innerHTML='<div class="view-header"><div class="view-header-left"><div class="view-header-nav-buttons"><button>Back</button><button>Forward</button></div></div><div class="view-header-title-container">Repeated title</div><div class="view-actions"><button>Edit</button></div></div>';
    doc.querySelector('.workspace-tab-container').append(leaf);return leaf;
  };
  return {dom,doc,controller,side,host,top,add,close(){controller.clear();dom.window.close();}};
}
test('native navigation and edit controls retain their listeners and original order on restoration',()=>{
  const f=fixture();try{
    const leaf=f.add(),before=leaf.innerHTML,nav=leaf.querySelector('.view-header-nav-buttons'),actions=leaf.querySelector('.view-actions');let back=0,edit=0;
    nav.firstChild.addEventListener('click',()=>back++);actions.firstChild.addEventListener('click',()=>edit++);
    f.controller.refresh(f.doc);assert.equal(nav.parentElement,f.host);assert.equal(actions.parentElement,f.top);
    nav.firstChild.click();actions.firstChild.click();assert.equal(back,1);assert.equal(edit,1);
    f.controller.refresh(f.doc);assert.equal(f.doc.querySelectorAll('.view-header-nav-buttons').length,1);
    f.controller.clear();assert.equal(leaf.innerHTML,before);nav.firstChild.click();assert.equal(back,2);
    assert.ok(!f.host.classList.contains('bui-desktop-navigation-host'));
  }finally{f.close();}
});
test('visible main tab owns history, even when focus is in a sidebar; switching restores the previous tab',()=>{
  const f=fixture();try{
    const first=f.add(),second=f.add(true),firstBefore=first.innerHTML,nav2=second.querySelector('.view-header-nav-buttons');
    f.side.classList.add('mod-active');f.controller.refresh(f.doc);
    first.style.display='none';second.style.display='flex';f.controller.refresh(f.doc);
    assert.equal(first.innerHTML,firstBefore);assert.equal(nav2.parentElement,f.host);
    f.side.classList.add('is-sidedock-collapsed');f.controller.refresh(f.doc);assert.equal(nav2.parentElement,f.top);
    f.side.classList.remove('is-sidedock-collapsed');f.controller.refresh(f.doc);assert.equal(nav2.parentElement,f.host);
  }finally{f.close();}
});
test('replaced headers, mobile appearance and detached views leave no orphan native controls',()=>{
  const f=fixture();try{
    const leaf=f.add(),native=leaf.innerHTML;f.controller.refresh(f.doc);
    leaf.innerHTML=native;f.controller.refresh(f.doc);
    assert.equal(f.doc.querySelectorAll('.view-header-nav-buttons').length,1);
    f.doc.body.classList.add('is-mobile');f.controller.refresh(f.doc);assert.equal(leaf.innerHTML,native);
    f.doc.body.classList.remove('is-mobile');f.controller.refresh(f.doc);leaf.remove();f.controller.refresh(f.doc);
    assert.equal(f.host.querySelector('.view-header-nav-buttons'),null);assert.equal(f.top.querySelector('.view-actions'),null);
  }finally{f.close();}
});
