const {test} = require('node:test');
const assert = require('node:assert/strict');
const {buildSync} = require('esbuild');
const {JSDOM} = require('jsdom');
const code=buildSync({entryPoints:['src/native-table-details.ts'],bundle:true,write:false,platform:'node',format:'cjs'}).outputFiles[0].text;
const mod={exports:{}};new Function('module','exports',code)(mod,mod.exports);
const {NativeTableDetails}=mod.exports;

function scopeFixture({intro = '<p>已确认流水，现金收支不等于利润。</p>', summary = true} = {}) {
  const dom = new JSDOM(`<main><div class="callout" data-callout="info"><div class="callout-content">${intro}<div class="bases-embed"><div id="root"></div></div></div></div><aside></aside></main>`);
  dom.window.HTMLElement.prototype.createEl = function(tag, options = {}) {
    const el = this.ownerDocument.createElement(tag); el.className = options.cls || '';
    if (options.text !== undefined) el.textContent = options.text;
    this.append(el); return el;
  };
  dom.window.HTMLElement.prototype.createDiv = function(options) {return this.createEl('div', options);};
  const root = dom.window.document.querySelector('#root');
  const profile = {titleProperty: '摘要', titleColumn: 'formula.摘要', tags: {}, wrap: true, attachments: [], scopeNote: '仅本地样例，不代表完整月账。'};
  const settings = {nebulaTable: profile, showSummaries: summary};
  const view = {type: 'table', config: {name: '月度收支', get: key => settings[key]}};
  const details = new NativeTableDetails(() => undefined);
  const refresh = () => details.refresh(view, root);
  const note = () => dom.window.document.querySelector('.bui-table-scope');
  return {dom, root, profile, settings, view, details, refresh, note};
}

test('finance scope becomes an accessible disclosure only beside an existing callout explanation', () => {
  const f = scopeFixture(); f.refresh();
  const note = f.note(), disclosure = note.querySelector('details');
  assert.equal(note.classList.contains('is-collapsible'), true);
  assert.equal(disclosure.open, false);
  assert.equal(disclosure.querySelector('summary').textContent, '数据范围');
  assert.equal(disclosure.querySelector('.bui-table-scope-text').textContent, f.profile.scopeNote);
  assert.equal(f.dom.window.document.querySelector('.callout-content > p').textContent, '已确认流水，现金收支不等于利润。');
  f.details.clear(); assert.equal(f.note(), null); f.dom.window.close();
});

test('ordinary tables, isolated warnings, nested or embed-only paragraphs keep the complete scope visible', () => {
  for (const options of [
    {summary: false}, {intro: ''}, {intro: '<p>  </p>'},
    {intro: '<p><span class="internal-embed">Embedded table text</span></p>'},
    {intro: '<div class="callout"><div class="callout-content"><p>Nested explanation</p></div></div>'},
    {intro: '<p hidden>Hidden explanation</p>'}, {intro: '<p style="display:none">Hidden explanation</p>'},
  ]) {
    const f = scopeFixture(options); f.refresh();
    assert.equal(f.note().querySelector('details'), null);
    assert.equal(f.note().textContent, f.profile.scopeNote);
    f.details.clear(); f.dom.window.close();
  }
});

test('repeated scope refresh preserves disclosure and sibling order without mutation churn', () => {
  const f = scopeFixture(); f.refresh();
  const note = f.note(), disclosure = note.querySelector('details'); disclosure.open = true;
  const summary = f.dom.window.document.createElement('section'); f.root.before(summary);
  const observer = new f.dom.window.MutationObserver(() => {});
  observer.observe(f.root.parentElement, {childList: true, subtree: true, attributes: true});
  f.refresh(); f.refresh();
  assert.equal(f.note(), note); assert.equal(note.querySelector('details'), disclosure);
  assert.equal(disclosure.open, true); assert.equal(note.nextElementSibling, summary);
  assert.equal(observer.takeRecords().length, 0);
  f.profile.scopeNote = '更新后的完整范围说明。'; f.refresh();
  assert.equal(note.querySelector('details'), disclosure); assert.equal(disclosure.open, true);
  assert.equal(note.querySelector('.bui-table-scope-text').textContent, f.profile.scopeNote);
  observer.disconnect(); f.details.clear(); f.dom.window.close();
});

test('scope follows a moved table, restores direct warnings, retains expansion and cleans detached hosts', () => {
  const f = scopeFixture(); f.refresh();
  const note = f.note(); note.querySelector('details').open = true;
  const originalParent = f.root.parentElement;
  f.dom.window.document.querySelector('aside').append(f.root); f.refresh();
  assert.equal(f.note(), note); assert.equal(note.parentElement, f.root.parentElement);
  assert.equal(note.querySelector('details'), null); assert.equal(note.textContent, f.profile.scopeNote);
  originalParent.append(f.root); f.refresh();
  assert.equal(note.querySelector('details').open, true);
  assert.equal(f.dom.window.document.querySelectorAll('.bui-table-scope').length, 1);
  f.root.remove(); f.refresh(); assert.equal(f.note(), null);
  originalParent.append(f.root); f.refresh(); assert.ok(f.note());
  delete f.profile.scopeNote; f.refresh(); assert.equal(f.note(), null);
  f.details.clear(); f.dom.window.close();
});

test('unavailable source stays explicit without changing values or native edits; later real zero and recycled cells restore native DOM',()=>{
  const dom=new JSDOM('<div id="root"><div class="bases-table-cell"><span>formulaResult://source</span></div></div>');
  for (const [method,tag] of [['createDiv','div'],['createSpan','span']]) dom.window.HTMLElement.prototype[method]=function(options) {
    const el=this.ownerDocument.createElement(tag);el.className=options.cls;el.textContent=options.text??'';this.append(el);return el;
  };
  const root=dom.window.document.querySelector('#root'),el=root.firstElementChild,native=el.firstElementChild;
  const profile={titleProperty:'摘要',titleColumn:'formula.摘要',tags:{},wrap:true,attachments:[],scopeNote:'代表性样例'};
  let value='formulaResult://source';
  const view={type:'table',config:{name:'流水',nebulaTable:profile},rows:[{entry:{file:{path:'Record.md'},getRawProperty:()=>value},cells:[{prop:'note.净额',innerEl:el}]}]};
  const fields={nf_unavailable_fields:['净额']};
  const details=new NativeTableDetails(()=>fields);details.refresh(view,root);
  assert.equal(dom.window.document.querySelector('.bui-table-scope').textContent,'代表性样例');
  const note=dom.window.document.querySelector('.bui-table-scope'),summary=dom.window.document.createElement('section');
  root.before(summary);details.refresh(view,root);
  assert.equal(note.nextElementSibling,summary,'refresh must not reorder scope and summary siblings and trigger a mutation loop');
  assert.equal(el.querySelector('.bui-unavailable-value').textContent,'未取得');assert.equal(native.textContent,'formulaResult://source');
  let nativeEdits=0;el.addEventListener('click',()=>nativeEdits++);
  el.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true,cancelable:true}));assert.equal(nativeEdits,1);
  details.refresh(view,root);assert.equal(el.querySelectorAll('.bui-unavailable-value').length,1);
  value=0;details.refresh(view,root);assert.equal(el.querySelector('.bui-unavailable-value'),null);
  value=null;details.refresh(view,root);assert.equal(el.querySelectorAll('.bui-unavailable-value').length,1);
  fields.nf_unavailable_fields=[];details.refresh(view,root);
  assert.equal(el.querySelector('.bui-unavailable-value'),null);assert.equal(el.hasAttribute('aria-readonly'),false);
  el.click();assert.equal(nativeEdits,2);details.clear();assert.equal(dom.window.document.querySelector('.bui-table-scope'),null);
  assert.equal(native.textContent,'formulaResult://source');dom.window.close();
});
