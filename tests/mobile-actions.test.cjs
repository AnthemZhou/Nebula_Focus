const {test}=require('node:test');
const assert=require('node:assert/strict');
const {buildSync}=require('esbuild');
const {JSDOM}=require('jsdom');
const vm=require('node:vm');
const code=buildSync({entryPoints:['src/mobile-actions.ts'],bundle:true,write:false,format:'cjs',external:['obsidian']}).outputFiles[0].text;
function fixture(t){
 const dom=new JSDOM('<body><header></header><header></header></body>');t.after(()=>dom.window.close());const mod={exports:{}};
 new vm.Script(code).runInNewContext({module:mod,exports:mod.exports,require:()=>({setIcon(){}})});
 const calls=[],surfaces=[],state=new Map();const history={forView(view,redo,checking){calls.push({view,redo,checking});return !!state.get(view)?.[redo?'redo':'undo'];},registerSurface(view,root){const item={view,root,released:false};surfaces.push(item);return()=>item.released=true;}};
 const actions=new mod.exports.MobileHistoryActions(history),views=[...dom.window.document.querySelectorAll('header')].map(host=>{const view={_loaded:true,queryController:{viewHeaderEl:host}};view.queryController.view=view;return view;});t.after(()=>actions.clear());return{dom,actions,views,state,calls,surfaces};
}
test('mobile undo toolbar uses its own database, refreshes disabled state and does not duplicate',t=>{
 const f=fixture(t),[a,b]=f.views;f.state.set(a,{undo:true,redo:false});f.state.set(b,{undo:false,redo:true});
 for(const v of f.views){f.actions.refresh(v);f.actions.refresh(v);}const roots=[...f.dom.window.document.querySelectorAll('.bui-mobile-actions')];assert.equal(roots.length,2);
 assert.equal(roots[0].children[0].textContent,'撤销');assert.equal(roots[0].children[1].textContent,'重做');
 assert.equal(roots[0].children[0].getAttribute('aria-label'),'撤销数据库操作');
 assert.equal(roots[0].children[0].disabled,false);assert.equal(roots[0].children[1].disabled,true);
 roots[0].children[0].click();roots[1].children[1].click();assert.deepEqual(f.calls.filter(c=>!c.checking),[{view:a,redo:false,checking:false},{view:b,redo:true,checking:false}]);
 f.state.set(a,{undo:false,redo:true});f.actions.refresh(a);assert.equal(roots[0].children[0].disabled,true);assert.equal(roots[0].children[1].disabled,false);
});
test('mobile toolbar follows native header replacement and releases history surfaces on teardown',t=>{
 const f=fixture(t),v=f.views[0];f.actions.refresh(v);v.queryController.viewHeaderEl.remove();const header=f.dom.window.document.createElement('header');f.dom.window.document.body.append(header);v.queryController.viewHeaderEl=header;
 f.actions.refresh(v);assert.equal(f.surfaces[0].released,true);assert.equal(header.querySelectorAll('.bui-mobile-actions').length,1);
 v.queryController.view={};f.actions.prune();assert.equal(f.surfaces[1].released,true);assert.equal(header.children.length,0);
});
