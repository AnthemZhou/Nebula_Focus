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

const {blockMarkdown,continuationPrefix,nextBlockPrefix,safeInline}=mod.exports;
const markdown=require('markdown-it')({html:true});
function serializeHTML(html) {
 const dom=new JSDOM(`<main>${html}</main>`), element=dom.window.document.querySelector('main');
 try {return inlineMarkdown(element);} finally {dom.window.close();}
}
function parsedInline(source) {
 const dom=new JSDOM(`<main>${markdown.renderInline(source)}</main>`);
 const element=dom.window.document.querySelector('main');
 return {dom,element};
}
test('heading marker-like text and empty ATX headings never consume structural hashes',()=>{
 for(const [source,next] of [['## # ###','## Updated ###'],['> - ### # ###','> - ### Updated ###'],['###','### Updated'],['## ###','## Updated ###']]) {
  const blocks=textBlocks(source);assert.equal(blocks.length,1,source);
  assert.equal(replaceBlock(source,blocks[0],'Updated'),next);
 }
});
test('setext source span includes its underline and stays with the old heading when splitting',()=>{
 for(const source of ['Title\n=====', '> Title\n> -----', '- Title\n  -----', 'First\r\nsecond\r\n=====']) {
  const block=textBlocks(source)[0];assert.equal(block.source,source);
  assert.equal(block.end,source.length);
  const split=blockMarkdown(block,'Left')+'\n\n'+nextBlockPrefix(block)+'Right';
  const parsed=markdown.parse(split,{}).filter(token=>token.type==='inline');
  assert.equal(parsed[0].content,'Left');assert.equal(parsed[1].content,'Right');
 }
});
test('line and next-block prefixes retain quotes, nested lists and checkbox indentation',()=>{
 for(const [source,continuation,next] of [
  ['- - Leaf','    ','  - '], ['> - [x] Task','>   ','> - [ ] '],
  ['- > ## Heading','  > ','  > '], ['> ## Heading','> ','> '],
  ['12. Task','    ','12. '], ['- First\n\n  Second','  ','  ']
 ]) {
  const block=textBlocks(source).at(-1);
  assert.equal(continuationPrefix(block),continuation,source);assert.equal(nextBlockPrefix(block),next,source);
  assert.equal(blockMarkdown(block,'one  \ntwo').split('\n')[1],continuation+'two');
 }
});
test('reference links resolve with the original document environment; wiki labels are literal',()=>{
 const blocks=textBlocks('Read [the guide][docs].\n\n[docs]: https://example.com\n\n[[A_B_&copy;|A *literal* &copy; label]]');
 assert.deepEqual(blocks.map(b=>b.text),['Read the guide.','A *literal* &copy; label']);
});
test('rendered hard-break newlines are not duplicated and soft breaks remain soft',()=>{
 const source='First  \nsecond\nthird';
 const serialized=serializeHTML(markdown.renderInline(source));
 assert.equal(serialized,source);
 const edited=serialized.replace('second','changed');
 assert.equal(markdown.parse(edited,{}).filter(t=>t.type==='paragraph_open').length,1);
 assert.equal(markdown.renderInline(edited),markdown.renderInline(source).replace('second','changed'));
});
test('literal entities and Obsidian syntax stay literal after serialization',()=>{
 const text='&copy; &#65; $x$ %%hidden%% ^block-id # heading | cell';
 const dom=new JSDOM('<p></p>'), element=dom.window.document.querySelector('p');element.textContent=text;
 const {dom: rendered,element: parsed}=parsedInline(inlineMarkdown(element));
 assert.equal(parsed.textContent,text);assert.equal(parsed.children.length,0);
 dom.window.close();rendered.window.close();
});
test('adjacent and redundant emphasis is normalized without mutating the live DOM',()=>{
 for(const [html,expected] of [
  ['<strong>one</strong><b>two</b>','<strong>onetwo</strong>'],
  ['<em>one<i>two</i>three</em>','<em>onetwothree</em>'],
  ['<b><i>one</i></b><strong><em>two</em></strong>','<em><strong>onetwo</strong></em>'],
  ['<strong>  bold  </strong>','  <strong>bold</strong>  '],
  ['<strong><em> nested </em></strong>',' <em><strong>nested</strong></em> ']
 ]) {
  const dom=new JSDOM(`<p>${html}</p>`),element=dom.window.document.querySelector('p'),before=element.innerHTML;
  assert.equal(markdown.renderInline(inlineMarkdown(element)),expected,html);
  assert.equal(element.innerHTML,before);dom.window.close();
 }
});
test('code spans preserve all spaces, edge spaces, backticks, and nonbreaking spaces',()=>{
 for(const text of ['   ',' leading and trailing ','`tick`','a``b','\u00a0']) {
  const dom=new JSDOM('<p><code></code></p>');dom.window.document.querySelector('code').textContent=text;
  const {dom: rendered,element}=parsedInline(inlineMarkdown(dom.window.document.querySelector('p')));
  assert.equal(element.querySelector('code').textContent,text);dom.window.close();rendered.window.close();
 }
 assert.equal(serializeHTML('<code></code>'),'');
});
test('external URL and title entities survive editing without changing link targets',()=>{
 const dom=new JSDOM('<p><a>label</a></p>'),link=dom.window.document.querySelector('a');
 link.setAttribute('href','https://example.com/&copy;?a=1&b=2');link.setAttribute('title','Literal &copy; "title"');
 const {dom: rendered,element}=parsedInline(inlineMarkdown(dom.window.document.querySelector('p')));
 assert.equal(element.querySelector('a').getAttribute('href'),link.getAttribute('href'));
 assert.equal(element.querySelector('a').getAttribute('title'),link.getAttribute('title'));
 dom.window.close();rendered.window.close();
});
test('unsupported inline widgets are not made editable and stale source is never overwritten',()=>{
 const dom=new JSDOM('<p>Text <span contenteditable="false">widget</span></p>');
 assert.equal(safeInline(dom.window.document.querySelector('p')),false);dom.window.close();
 const block=textBlocks('## Heading\n\nOriginal\n\nAfter')[1];
 assert.throws(()=>replaceBlock('## Heading\n\nExternal\n\nAfter',block,'Edited'),/变化/);
 assert.equal(replaceBlock('## Heading\n\nOriginal\n\nAfter',block,'Edited'),'## Heading\n\nEdited\n\nAfter');
});
test('escaped renderer syntax and code remain editable while actual math and embeds stay native',()=>{
 const source=String.raw`Literal \$value\$ and \%\%comment\%\% and \^block`;
 assert.equal(textBlocks(source)[0].text,'Literal $value$ and %%comment%% and ^block');
 assert.equal(textBlocks('Code `cost $5` and `![[literal]]`')[0].text,'Code cost $5 and ![[literal]]');
 assert.equal(textBlocks('[[Budget $5]]')[0].text,'Budget $5');
 assert.equal(textBlocks('Real $x$ and ![[embed]]').length,0);
});
test('pasted leading spaces stay paragraph text instead of becoming an indented code block',()=>{
 for(const text of ['    Four spaces','\tTab indentation','  Two spaces\n    Continued']) {
  const dom=new JSDOM('<p></p>'),element=dom.window.document.querySelector('p');element.textContent=text;
  const source=inlineMarkdown(element),rendered=new JSDOM(markdown.render(source));
  assert.equal(rendered.window.document.querySelector('pre'),null);
  assert.equal(rendered.window.document.querySelector('p').textContent,text);
  assert.equal(textBlocks(source)[0].text,text);
  dom.window.close();rendered.window.close();
 }
});
