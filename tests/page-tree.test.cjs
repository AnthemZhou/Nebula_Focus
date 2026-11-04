const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {transformSync} = require('esbuild');
const mod = {exports: {}};
new Function('module', 'exports', transformSync(readFileSync('src/page-tree.ts', 'utf8'), {loader: 'ts', format: 'cjs'}).code)(mod, mod.exports);
const {buildPageTree, readPageTreeSettings, flattenPages, filterPages, reorderPages, remapPageSettings, validPageName} = mod.exports;
const file = path => ({path, name: path.split('/').pop(), extension: path.split('.').pop()});
const folder = (path, children) => ({path, name: path.split('/').pop(), children});
const state = value => readPageTreeSettings(value);

test('sibling and internal folder notes each appear once, with page and folder siblings intermixed', () => {
  const root = folder('/', [file('Home.md'), folder('Home', [file('Home/Child.md')]), file('Beta.md'),
    folder('Alpha', [file('Alpha/Alpha.md'), file('Alpha/Nested.md')]), file('10.md'), file('2.md')]);
  const before = JSON.stringify(root), nodes = buildPageTree(root, state());
  assert.deepEqual(nodes.map(n => n.title), ['2', '10', 'Alpha', 'Beta', 'Home']);
  assert.equal(nodes[2].filePath, 'Alpha/Alpha.md'); assert.equal(nodes[4].filePath, 'Home.md');
  assert.deepEqual(nodes[2].children.map(n => n.id), ['Alpha/Nested.md']);
  assert.equal(flattenPages(nodes).filter(n => n.filePath === 'Home.md').length, 1);
  assert.equal(JSON.stringify(root), before);
});

test('a sibling and an internal note with the same title both remain reachable when both exist', () => {
  const nodes = buildPageTree(folder('/', [file('A.md'), folder('A', [file('A/A.md')])]), state());
  assert.equal(nodes[0].filePath, 'A.md'); assert.equal(nodes[0].children[0].filePath, 'A/A.md');
});

test('only exact matching names merge; attachments, empty folders, bases and canvases retain their identity', () => {
  const root = folder('/', [folder('Alpha', []), file('alpha.md'), folder('Media', [file('Media/a.png')]), file('Export.csv'), file('Data.base'), file('Board.canvas')]);
  const pages = buildPageTree(root, state());
  assert.equal(pages.find(n => n.id === 'Alpha').filePath, undefined);
  assert.ok(pages.some(n => n.id === 'alpha.md'));
  assert.ok(!pages.some(n => n.id === 'Media' || n.id === 'Export.csv'));
  assert.equal(pages.find(n => n.id === 'Data.base').kind, 'database');
  assert.equal(pages.find(n => n.id === 'Board.canvas').kind, 'canvas');
  const all = flattenPages(buildPageTree(root, state({showAttachments: true})));
  assert.ok(all.some(n => n.id === 'Media/a.png')); assert.ok(all.some(n => n.id === 'Export.csv'));
});

test('manual order is per parent, supports a leaf becoming a folder note and retains new pages', () => {
  const root = folder('/', [file('A.md'), folder('A', [file('A/Z.md'), file('A/Y.md')]), file('B.md'), file('C.md')]);
  const nodes = buildPageTree(root, state({order: {'/': ['missing', 'B.md', 'A.md'], A: ['A/Z.md']}}));
  assert.deepEqual(nodes.map(n => n.id), ['B.md', 'A', 'C.md']);
  assert.deepEqual(nodes[1].children.map(n => n.id), ['A/Z.md', 'A/Y.md']);
  const alpha = buildPageTree(root, state({sort: 'name', order: {'/': ['B.md']}}));
  assert.deepEqual(alpha.map(n => n.id), ['A', 'B.md', 'C.md']);
});

test('search finds collapsed descendants while retaining ancestors and never mutates the tree', () => {
  const nodes = buildPageTree(folder('/', [folder('Parent', [file('Parent/Needle.md'), file('Parent/Other.md')]), file('Else.md')]), state());
  const before = JSON.stringify(nodes), matches = filterPages(nodes, 'NEEDLE');
  assert.deepEqual(flattenPages(matches).map(n => n.id), ['Parent', 'Parent/Needle.md']);
  assert.equal(filterPages(nodes, 'parent')[0].children.length, 2);
  assert.deepEqual(filterPages(nodes, 'missing'), []); assert.equal(JSON.stringify(nodes), before);
});

test('manual sorting never accepts missing targets, self-drops or cross-parent moves', () => {
  const nodes = ['A', 'B', 'C'].map(id => ({id, parent: '/'}));
  assert.deepEqual(reorderPages(nodes, 'C', 'A', false), ['C', 'A', 'B']);
  assert.deepEqual(reorderPages(nodes, 'A', 'C', true), ['B', 'C', 'A']);
  assert.equal(reorderPages(nodes, 'A', 'A', false), null);
  assert.equal(reorderPages(nodes, 'A', 'X', false), null);
  assert.equal(reorderPages([...nodes, {id: 'D', parent: 'Nested'}], 'D', 'A', false), null);
});

test('folder rename migrates favorites, expanded paths and per-folder order without touching prefix siblings', () => {
  const initial = state({favorites: ['A/X.md', 'AB/X.md'], expanded: ['A', 'A/Child', 'AB'], order: {'/': ['A', 'AB'], A: ['A/X.md']}});
  const next = remapPageSettings(initial, 'A', 'New');
  assert.deepEqual(next.favorites, ['New/X.md', 'AB/X.md']);
  assert.deepEqual(next.expanded, ['New', 'New/Child', 'AB']);
  assert.deepEqual(next.order, {'/': ['New', 'AB'], New: ['New/X.md']});
  assert.equal(initial.favorites[0], 'A/X.md');
});

test('settings tolerate partial/malformed values and filesystem-like special names', () => {
  assert.deepEqual(state(null), {expanded: [], favorites: [], order: {}, sort: 'manual', showAttachments: false});
  const settings = state({expanded: ['a', 3, 'a'], favorites: false, order: JSON.parse('{"__proto__":["A"],"/":true}'), sort: 'unknown'});
  assert.deepEqual(settings.expanded, ['a']); assert.deepEqual(settings.order.__proto__, ['A']);
  assert.equal(Object.hasOwn(settings.order, '/'), false);
});

test('new page names reject traversal and invalid filename characters', () => {
  for (const value of ['', ' ', '../secret', '.obsidian', 'A/B', 'A\\B', 'A:B', 'A\nB']) assert.equal(validPageName(value), null);
  assert.equal(validPageName(' 页面.md '), '页面'); assert.equal(validPageName('A < B'), null);
});
