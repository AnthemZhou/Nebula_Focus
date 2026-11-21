const {test} = require('node:test');
const assert = require('node:assert/strict');
const {buildSync} = require('esbuild');
const compiled = buildSync({entryPoints: ['src/notion-export.ts'], external: ['obsidian'], bundle: true, platform: 'node', format: 'cjs', write: false}).outputFiles[0].text;
const moduleResult = {exports: {}};
class TFile {constructor(path, parent) {this.path = path; this.basename = path.split('/').pop().replace(/\.[^.]+$/, ''); this.extension = path.split('.').pop(); this.parent = parent; parent?.children.push(this);}}
class TFolder {constructor(path, parent) {this.path = path; this.name = path.split('/').pop(); this.parent = parent; this.children = []; parent?.children.push(this);} isRoot() {return this.path === '';}}
const notices = [];
new Function('require', 'module', 'exports', compiled)(() => ({TFile, TFolder, Notice: class {constructor(message) {notices.push(message);}}}), moduleResult, moduleResult.exports);
const {readExportTable, recognizeNotionMarkdown, registerNotionExport} = moduleResult.exports;
const id = '11111111111141118111111111111111', stem = 'Example '+id;

test('Markdown & CSV exports preserve YAML strings, relative links, original title, BOM and CRLF', () => {
  const table = readExportTable('db', '\ufeffTitle,Amount,Reference,Type\r\n"Trip, A",003,"One ""quoted""\nitem",Travel\r\n');
  const block = '# Trip, A\r\n\r\nAmount: 003\r\nType: Travel\r\n\r\n[Invoice](Invoice%20page.md)\r\n';
  const result = recognizeNotionMarkdown(stem, '\ufeff'+block, table);
  assert.ok(result.startsWith('\ufeff---\r\n')); assert.ok(result.includes('"Amount": "003"'));
  assert.ok(result.includes('"Reference": "One \\"quoted\\"\\nitem"')); assert.ok(result.includes('"nf_source_collection": "db"'));
  assert.ok(result.endsWith('# Trip, A\r\n\r\n[Invoice](Invoice%20page.md)\r\n'));
  assert.equal(recognizeNotionMarkdown(stem, result, table), null);
});

test('leaves narrative, unverified or duplicate-title properties, and existing frontmatter intact', () => {
  const table = readExportTable('db', 'Title,Note,aliases\nTrip,0001,reserved\nRepeat,A,B\nRepeat,C,D');
  for (const source of ['# Trip\n\nNote: this is normal prose.\n', '# Trip\n\nNote: 0001\nMore details here.\n', '# Trip\n\naliases: reserved\n', '# Repeat\n\nNote: A\n']) {
    const note = recognizeNotionMarkdown(stem, source, table);
    assert.ok(note.endsWith(source)); assert.ok(!note.includes('"aliases": "reserved"'));
  }
  const standalone = '# Trip\n\nNote: 0001\n';
  assert.ok(recognizeNotionMarkdown(stem, standalone).endsWith(standalone));
  assert.equal(recognizeNotionMarkdown('Trip', standalone, table), null);
  assert.equal(recognizeNotionMarkdown(stem, '---\nTitle: Mine\n---\n'+standalone, table), null);
  assert.throws(() => readExportTable('db', 'Title,Title\nX,Y')); assert.throws(() => readExportTable('db', 'Title,X\nA,"broken'));
});

test('folder action resolves exported table CSV once, keeps non-export files and is idempotent', async () => {
  const root = new TFolder(''), folder = new TFolder('Import',root), db = new TFolder('Import/Costs',folder);
  const csv = new TFile(`Import/Costs ${id}.csv`,folder);
  const page = new TFile(`Import/Costs/Trip ${id}.md`,db), plain = new TFile('Import/Costs/mine.md',db);
  const contents = new Map([[csv,'Title,Amount\nTrip,0'],[page,'# Trip\n\nAmount: 0\n'],[plain,'# My own note']]);
  const written=[]; let fileMenu;
  const plugin={app:{vault:{getMarkdownFiles:()=>[plain,page],read: async f=>contents.get(f),process:async (f,fn)=>{contents.set(f,fn(contents.get(f)));written.push(f);}},workspace:{on(_name,fn){fileMenu=fn;}}},addCommand(){},registerEvent(){}};
  registerNotionExport(plugin);
  const menu = {addItem(fn){fn(this);},setTitle(){return this;},setIcon(){return this;},onClick(run){this.run=run;}};
  fileMenu(menu,folder); await menu.run(); await menu.run();
  assert.deepEqual(written,[page]); assert.ok(contents.get(page).includes('"Amount": "0"')); assert.equal(contents.get(plain),'# My own note');
});
