const {test} = require('node:test');
const assert = require('node:assert/strict');
const {buildSync} = require('esbuild');
const YAML = require('yaml');
const mod = {exports: {}};
const getFrontMatterInfo = content => {
  const match = /^---\r?\n([^]*?)\r?\n---(?:\r?\n|$)/.exec(content);
  return {exists: !!match, frontmatter: match?.[1] ?? '', contentStart: match?.[0].length ?? 0};
};
new Function('require', 'module', 'exports', buildSync({entryPoints: ['src/note-source.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['obsidian']}).outputFiles[0].text)(() => ({getFrontMatterInfo, parseYaml: YAML.parse}), mod, mod.exports);
const {noteSource} = mod.exports;

test('Markdown Base destinations retain balanced and escaped parentheses', () => {
  const source = noteSource('![](Records(2026).base)\n![nested](Views/Finance((actual)).base#Table)\n![escaped](Views/Records\\(old\\).base)');
  assert.deepEqual(source.bases, ['Records(2026).base', 'Views/Finance((actual)).base', 'Views/Records(old).base']);
  assert.equal(source.inlineBase, false);
});

test('optional Markdown titles and angle-bracket destinations do not become part of the path', () => {
  const source = noteSource('![](Records.base "Ledger")\n![Alt [label]](Other.base \'Table\')\n![](<Views/Space (draft).base> (Descriptive title))\n![](Encoded%20Name.base#Table "Title with \\\"quotes\\\"")');
  assert.deepEqual(source.bases, ['Records.base', 'Other.base', 'Views/Space (draft).base', 'Encoded Name.base']);
});

test('inline Base fences are detected while external Base references remain available in source order', () => {
  const source = noteSource('![[First.base#View|Label]]\n```base\nviews:\n  - type: table\n```\n![](Second.base "Open table")\n![[First.base]]');
  assert.equal(source.inlineBase, true);
  assert.deepEqual(source.bases, ['First.base', 'Second.base']);
});

test('native Base fences inside blockquotes and tildes are recognized without reading their content as links', () => {
  const source = noteSource('> [!info]\n> ~~~ base\n> ![[Inside.base]]\n> ~~~\n![[Actual.base]]');
  assert.equal(source.inlineBase, true);
  assert.deepEqual(source.bases, ['Actual.base']);
});

test('ordinary fenced code examples do not expose nested Base fences or embed examples', () => {
  const source = noteSource('````markdown\n```base\n![[Example.base]]\n```\n````\n~~~text\n![](AlsoExample.base)\n~~~\n![[Actual.base]]');
  assert.equal(source.inlineBase, false);
  assert.deepEqual(source.bases, ['Actual.base']);
});

test('inline code, indented code and escaped images are not real database references', () => {
  const source = noteSource('`![[Inline.base]]`\n``![](Code.base "Title")``\n    ![[Indented.base]]\n\t![](Tabbed.base)\n\\![[Escaped.base]]\n![[Actual.base]]');
  assert.equal(source.inlineBase, false);
  assert.deepEqual(source.bases, ['Actual.base']);
});

test('closed and unfinished HTML comments cannot expose Base fences or embeds', () => {
  const source = noteSource('<!--\n```base\n![[Comment.base]]\n```\n-->\n![[Actual.base]]\n<!-- unfinished\n![[Hidden.base]]\n```base');
  assert.equal(source.inlineBase, false);
  assert.deepEqual(source.bases, ['Actual.base']);
});

test('literal comment markers inside inline or fenced code do not hide later real embeds', () => {
  const source = noteSource('`<!-- literal`\n![[First.base]]\n```md\n<!-- example\n```\n![[Second.base]]');
  assert.equal(source.inlineBase, false);
  assert.deepEqual(source.bases, ['First.base', 'Second.base']);
});

test('frontmatter stays separate and unsupported or malformed links are not accepted as Bases', () => {
  const source = noteSource('---\ntitle: Example\nreference: "![[Metadata.base]]"\n---\n![](https://example.test/Remote.base "Remote")\n![](file:///Local.base)\n![](Unclosed(2026.base)\n![](Bad.base "Unclosed title)\n[Normal](Ordinary.base)\n![[Actual.base]]');
  assert.deepEqual(source.properties, {title: 'Example', reference: '![[Metadata.base]]'});
  assert.deepEqual(source.bases, ['Actual.base']);
  assert.equal(source.inlineBase, false);
  assert.throws(() => noteSource('---\n- invalid\n---\nText'), /键值/);
});

test('unclosed native Base fences still block generation and unclosed ordinary fences do not expose their sample links', () => {
  assert.equal(noteSource('```base\nviews:\n  - type: table').inlineBase, true);
  const ordinary = noteSource('```md\n![[Example.base]]\n```base');
  assert.equal(ordinary.inlineBase, false);
  assert.deepEqual(ordinary.bases, []);
});
