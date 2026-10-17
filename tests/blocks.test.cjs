const {test}=require('node:test');const assert=require('node:assert/strict');const {readFileSync}=require('node:fs');const {transformSync}=require('esbuild');const {JSDOM}=require('jsdom');
const mod={exports:{}};new Function('module','exports','require',transformSync(readFileSync('src/blocks.ts','utf8'),{loader:'ts',format:'cjs'}).code)(mod,mod.exports,require);
const {textBlocks,replaceBlock,inlineMarkdown}=mod.exports;
test('atomic source ranges separate headings, paragraphs, nested list items and quotes',()=>{
 const source='### Heading\r\n\r\nOne **bold**\r\ncontinued\r\n\r\nTwo\r\n\r\n- [x] Task\r\n  - Child\r\n\r\n> Quote\r\n';
 const blocks=textBlocks(source,7);assert.deepEqual(blocks.map(b=>b.text),['Heading','One bold\ncontinued','Two','Task','Child','Quote']);
 for(const b of blocks)assert.equal(source.slice(b.start-7,b.end-7),b.source);
 const wrapped='PREFIX!'+source,task=blocks[3];assert.equal(replaceBlock(wrapped,task,'Changed'),wrapped.replace('- [x] Task','- [x] Changed'));
});
test('setext headings, empty headings and trailing closing hashes preserve syntax',()=>{
 for(const [source,next] of [['Title\n=====', 'New\n====='],['### Title ###','### New ###'],['## ','## New']]) {
  const block=textBlocks(source)[0];assert.equal(replaceBlock(source,block,'New'),next);
 }
});
test('renderer-owned features are excluded from direct editing',()=>{
 const source='```md\n## Code\n```\n\n![[image.png]]\n\nInline $math$\n\nFootnote[^1]\n\n<div>HTML</div>\n\nNormal\n';
 assert.deepEqual(textBlocks(source).map(b=>b.text),['Normal']);
});
test('inline serialization retains formatting and links while escaping structural plaintext',()=>{
 const dom=new JSDOM('<p># Literal <strong>bold</strong> and <em>italic</em> <a class="internal-link" data-href="Note">Label</a><br><code>a`b</code></p>');
 assert.equal(inlineMarkdown(dom.window.document.querySelector('p')),'\\# Literal **bold** and *italic* [[Note|Label]]  \n``a`b``');dom.window.close();
});
