const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {transformSync}=require('esbuild');
const mod={exports:{}};
new Function('module','exports',transformSync(readFileSync('src/history.ts','utf8'),{loader:'ts',format:'cjs'}).code)(mod,mod.exports);
const {EditHistory}=mod.exports;
const tx=(before,after)=>({before,after});

test('source history restores exact Markdown and immutable logical carets',()=>{
  const history=new EditHistory();
  const before='\uFEFF---\r\ntitle: 原文\r\n---\r\n## Title\r\n\r\nKeep **bold**  \r\n[[Note|Label]]\r\n';
  const after=before.replace('Title','Changed');
  const transaction={before,after,beforeCaret:{kind:'block',start:29,offset:3},afterCaret:{kind:'block',start:29,offset:7}};
  assert.equal(history.push('A.md',transaction),true);
  transaction.before='mutated';transaction.beforeCaret.offset=99;
  const undo=history.peekUndo('A.md');
  assert.equal(undo.before,before);assert.equal(undo.after,after);assert.equal(undo.beforeCaret.offset,3);
  assert(Object.isFrozen(undo));assert(Object.isFrozen(undo.beforeCaret));
  assert.equal(history.markUndone('A.md'),undo);assert.equal(history.peekUndo('A.md'),undefined);
  assert.equal(history.peekRedo('A.md').before,before);
  assert.equal(history.markRedone('A.md'),undo);assert.equal(history.peekRedo('A.md'),undefined);
  assert.equal(history.peekUndo('A.md').after,after);
});

test('files have independent undo stacks and peeking never commits an undo',()=>{
  const history=new EditHistory();
  history.push('A.md',tx('A','AA'));history.push('B.md',tx('B','BB'));history.push('A.md',tx('AA','AAA'));
  assert.equal(history.peekUndo('A.md').before,'AA');assert.equal(history.peekUndo('A.md').before,'AA');
  history.markUndone('A.md');
  assert.equal(history.peekUndo('A.md').before,'A');assert.equal(history.peekUndo('B.md').after,'BB');
  history.reset('A.md');assert.equal(history.peekRedo('A.md'),undefined);assert.equal(history.peekUndo('B.md').after,'BB');
  assert.equal(history.markUndone('missing'),undefined);assert.equal(history.markRedone('missing'),undefined);
});

test('new edits branch at the current source, including after every edit was undone',()=>{
  const history=new EditHistory();
  history.push('A',tx('0','1'));history.push('A',tx('1','2'));history.markUndone('A');
  history.push('A',tx('1','3'));assert.equal(history.peekRedo('A'),undefined);
  assert.equal(history.markUndone('A').after,'3');assert.equal(history.markUndone('A').after,'1');
  history.push('A',tx('0','new'));assert.equal(history.peekRedo('A'),undefined);
  assert.equal(history.markUndone('A').before,'0');assert.equal(history.peekUndo('A'),undefined);
});

test('typing can discard redo while unchanged commits leave a valid redo available',()=>{
  const history=new EditHistory();
  history.push('A',tx('0','1'));history.push('A',tx('1','2'));history.markUndone('A');
  assert.equal(history.push('A',tx('1','1')),false);assert.equal(history.peekRedo('A').after,'2');
  history.clearRedo('A');assert.equal(history.peekRedo('A'),undefined);assert.equal(history.peekUndo('A').after,'1');
  history.markUndone('A');history.clearRedo('A');history.push('A',tx('0','new'));
  assert.equal(history.peekUndo('A').after,'new');assert.equal(history.markUndone('A').before,'0');
});

test('an external source change cuts history instead of overwriting it on later undo',()=>{
  const history=new EditHistory();
  history.push('A',tx('0','1'));history.push('A',tx('1','2'));history.markUndone('A');
  history.push('A',tx('external','edited external'));
  assert.equal(history.peekRedo('A'),undefined);assert.equal(history.markUndone('A').before,'external');
  assert.equal(history.peekUndo('A'),undefined);
  history.push('A',tx('another external','another external'));
  assert.equal(history.peekRedo('A'),undefined);
});

test('entry limits retain the most recent contiguous transactions',()=>{
  const history=new EditHistory({maxEntries:2});
  history.push('A',tx('0','1'));history.push('A',tx('1','2'));history.push('A',tx('2','3'));
  assert.equal(history.markUndone('A').before,'2');assert.equal(history.markUndone('A').before,'1');
  assert.equal(history.markUndone('A'),undefined);
  assert.equal(history.markRedone('A').after,'2');assert.equal(history.markRedone('A').after,'3');
});

test('the UTF-8 byte budget covers all files and evicts inactive histories first',()=>{
  const history=new EditHistory({maxBytes:12});
  history.push('A',tx('中','文'));history.push('B',tx('甲','乙'));
  history.markUndone('A');history.markRedone('A'); // A was used most recently.
  history.push('C',tx('a','b'));
  assert.equal(history.peekUndo('B'),undefined);assert.equal(history.peekUndo('A').before,'中');
  assert.equal(history.peekUndo('C').after,'b');
  history.push('A',tx('文','字'));history.push('A',tx('字','新'));
  assert.equal(history.peekUndo('C'),undefined);
  assert.equal(history.markUndone('A').before,'字');assert.equal(history.markUndone('A').before,'文');
  assert.equal(history.peekUndo('A'),undefined);
});

test('oversized edits clear their earlier history without evicting other files',()=>{
  const history=new EditHistory({maxBytes:8});
  history.push('A',tx('a','b'));history.push('B',tx('c','d'));
  assert.equal(history.push('A',tx('b','😀😀')),false);
  assert.equal(history.peekUndo('A'),undefined);assert.equal(history.peekUndo('B').after,'d');
  history.push('A',tx('😀😀',''));assert.equal(history.peekUndo('A').before,'😀😀');
  assert.equal(history.peekUndo('B'),undefined);
});

test('zero limits disable retention and invalid limits fail explicitly',()=>{
  for(const options of [{maxEntries:0},{maxBytes:0}]) {
    const history=new EditHistory(options);assert.equal(history.push('A',tx('a','b')),false);
    assert.equal(history.peekUndo('A'),undefined);
  }
  for(const value of [-1,NaN,Infinity,1.5]) assert.throws(()=>new EditHistory({maxEntries:value}),RangeError);
});
