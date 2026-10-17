const {test}=require('node:test');const assert=require('node:assert/strict');const {readFileSync}=require('node:fs');const {transformSync}=require('esbuild');
const code=transformSync(readFileSync('src/page-model.ts','utf8'),{loader:'ts',format:'cjs'}).code;const mod={exports:{}};new Function('module','exports',code)(mod,mod.exports);
const {sections,metadata,setMeta,moveSection,replaceSection}=mod.exports;
test('layout updates preserve unrelated frontmatter and all body bytes including CRLF',()=>{
 const text='---\r\nproject: "Demo"\r\nnotes: |\r\n  keep this\r\n---\r\n## A\r\n\r\nhello\r\n';
 const changed=setMeta(text,'nf-cover','[[Nebula Assets/a.svg]]');assert(changed.includes('notes: |\r\n  keep this'));assert(changed.endsWith('## A\r\n\r\nhello\r\n'));assert.equal(metadata(changed)['nf-cover'],'[[Nebula Assets/a.svg]]');
 assert.equal((setMeta(changed,'nf-cover','[[other.svg]]').match(/nf-cover:/g)||[]).length,1);
 assert.throws(()=>setMeta('---\nnot closed','nf-title','x'));
 assert.throws(()=>setMeta('---\nnf-title: a\nnf-title: b\n---\nBody','nf-title','x'));
});
test('section reorder preserves code fences, nested headings, links and attachments',()=>{
 const text='---\nnf-columns: 2\n---\n## A\n\n```md\n## This is code\n```\n\n### Inner\n\n![[a.png]]\n\n## B\n\n[[A]]\n';
 const list=sections(text);assert.equal(list.length,2);const moved=moveSection(text,0,1);assert.equal(sections(moved)[0].title,'B');assert.equal(sections(moved)[1].text.trim(),list[0].text.trim());assert.equal(metadata(moved)['nf-columns'],'2');
});
test('inline edits affect only chosen section and safely separate the next heading',()=>{
 const text='## A\n\nOld\n\n## B\n\nKeep\n';const next=replaceSection(text,0,'## A\n\nNew');assert(next.endsWith('## B\n\nKeep\n'));assert.equal(sections(next).length,2);assert.equal(sections(next)[0].text,'## A\n\nNew\n\n');
});
test('leading introduction cannot merge into another section by dragging',()=>{
 const text='# Title\n\nIntro\n\n## A\n\nBody\n';assert.throws(()=>moveSection(text,0,1));assert.throws(()=>moveSection(text,1,0));assert.equal(sections(text).length,2);
});
test('empty, BOM and YAML end-marker frontmatter remain portable',()=>{
 for(const source of ['---\n---\n## A\n','\uFEFF---\r\n---\r\n## A\r\n','---\ntags: [x]\n...\n## A\n']) {
  const changed=setMeta(source,'nf-title','Title');assert.equal(metadata(changed)['nf-title'],'Title');assert.equal(sections(changed).length,1);assert.equal(sections(changed)[0].title,'A');assert(changed.endsWith(source.slice(source.indexOf('## A'))));
 }
});
test('comments and display math do not create draggable sections',()=>{
 const text='## A\n\n<!--\n## Hidden\n-->\n\n%%\n## Also hidden\n%%\n\n$$\n## Math\n$$\n\n## B\n\nEnd\n';
 assert.deepEqual(sections(text).map(s=>s.title),['A','B']);
});
test('moving sections preserves meaningful trailing spaces',()=>{
 const text='## A\n\nHard break  \n\n## B\n\nEnd\n';assert(moveSection(text,0,1).includes('Hard break  \n'));
});
test('changing layout preserves mixed header line endings and rejects multiline owned keys',()=>{
 const source='---\r\ncustom: keep\nnotes: |\r\n  unchanged\n---\r\nBody\n';
 assert.equal(setMeta(source,'nf-icon','📁'),source.replace('---\r\nBody','nf-icon: "📁"\r\n---\r\nBody'));
 assert.throws(()=>setMeta('---\nnf-title: |\n\n  keep\n---\nBody','nf-title','new'));
 assert.throws(()=>setMeta('---\nnf-title: old\n"nf-title": duplicate\n---\nBody','nf-title','new'));
});
