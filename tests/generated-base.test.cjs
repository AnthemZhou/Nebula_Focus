const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {transformSync} = require('esbuild');
const mod = {exports: {}};
new Function('module', 'exports', transformSync(readFileSync('src/generated-base.ts', 'utf8'), {loader: 'ts', format: 'cjs'}).code)(mod, mod.exports);
const {generateBaseForNote} = mod.exports;
const source = {path: 'Ideas.md', basename: 'Ideas'};
const record = (path, properties) => ({path, properties});
const freeze = value => {if (value && typeof value === 'object') {Object.values(value).forEach(freeze); Object.freeze(value);} return value;};

test('self views use the exact Markdown path and do not infer columns from neighboring records', () => {
  const data = generateBaseForNote(source, [record('Ideas.md', {标题: 'Own title', 状态: '完成'}), record('Other.md', {财务金额: 100})]);
  assert.deepEqual(data.nebulaSource, {version: 1, path: 'Ideas.md', scope: 'self'});
  assert.deepEqual(data.filters, {and: ['file.path == "Ideas.md"']});
  assert.deepEqual(data.views[0].order, ['formula.Nebula标题_标题', 'note.状态']);
  assert.equal(data.views[0].nebulaTable.titleProperty, '标题');
  assert.deepEqual(data.views[0].nebulaTable.tags, {});
});

test('folder views include only direct Markdown children, with stable order independent of input order', () => {
  const rows = [record('Ideas/z.md', {名称: 'Last', 成本: 0}), record('Ideas/a.md', {名称: 'First', 普通字段: false}),
    record('Ideas/Sub/nested.md', {嵌套字段: 'no'}), record('Ideas/file.txt', {非笔记字段: 'no'}), record('Ideas-more/other.md', {其他字段: 'no'})];
  const data = generateBaseForNote(source, rows, 'Ideas');
  assert.deepEqual(data.filters, {and: ['file.folder == "Ideas"', 'file.ext == "md"']});
  assert.deepEqual(data.nebulaSource, {version: 1, path: 'Ideas.md', scope: 'folder', folder: 'Ideas'});
  assert.deepEqual(data.views[0].order, ['formula.Nebula标题_名称', 'note.普通字段', 'note.成本']);
  assert.deepEqual(generateBaseForNote(source, [...rows].reverse(), 'Ideas'), data);
});

test('empty records keep native file names without inventing editable title properties', () => {
  for (const rows of [[], [record('Ideas.md', {})], [record('Other.md', {title: 'Other'})]]) {
    const data = generateBaseForNote(source, rows);
    assert.deepEqual(data.views[0].order, ['file.name']);
    assert.equal(data.views[0].nebulaTable, undefined);
    assert.equal(data.formulas, undefined);
  }
  const root = generateBaseForNote(source, [record('a.md', {状态: '完成'}), record('nested/a.md', {额外: 'no'})], '');
  assert.deepEqual(root.filters.and, ['file.folder == ""', 'file.ext == "md"']);
  assert.deepEqual(root.views[0].order, ['file.name', 'note.状态']);
});

test('title selection follows explicit field priorities and never treats numeric zero as an editable text title', () => {
  const data = generateBaseForNote(source, [record('Ideas.md', {名称: 'Name', 标题: 'Heading', title: 'Title'})]);
  assert.equal(data.views[0].nebulaTable.titleProperty, 'title');
  assert.equal(data.formulas.Nebula标题_title, 'link(file.path, if(note["title"], note["title"], file.name))');
  assert.deepEqual(data.properties, {'formula.Nebula标题_title': {displayName: 'title'}});
  for (const title of [0, false, null, ['wrong']]) {
    const data = generateBaseForNote(source, [record('Ideas.md', {title, 金额: 0})]);
    assert.equal(data.views[0].nebulaTable, undefined);
    assert.deepEqual(data.views[0].order, ['file.name', 'note.title', 'note.金额']);
  }
  const blank = generateBaseForNote(source, [record('Ideas.md', {title: ''})]);
  assert.equal(blank.views[0].nebulaTable.titleProperty, 'title');
  const mixed = generateBaseForNote(source, [record('Ideas/a.md', {title: 'text', 标题: 'a'}), record('Ideas/b.md', {title: 0, 标题: 'b'})], 'Ideas');
  assert.equal(mixed.views[0].nebulaTable.titleProperty, '标题');
});

test('only explicitly named standard tags with array values get a multi-select profile, never plain text, relations or finances', () => {
  const data = generateBaseForNote(source, [record('Ideas.md', {title: 'Example', tags: ['work', 'topic/subtopic'], 状态: '制作中', 领域: ['AI', 'Blender'], 关联项目: ['[[Projects/P]]'], 文件和媒体: ['[[Files/a.png]]'], 金额: 0, 方向: '收入'})]);
  assert.deepEqual(data.views[0].nebulaTable.tags, {tags: 'multi'});
  assert.deepEqual(data.views[0].nebulaTable.attachments, []);
  assert.equal(data.views[0].showSummaries, undefined);
  assert.equal(data.views[0].amountProperty, undefined);
  for (const tags of ['one', ['[[Project]]'], ['https://example.test/'], ['file:///notes/a.png'], [1], {value: ['one']}]) {
    const data = generateBaseForNote(source, [record('Ideas.md', {title: 'Example', tags})]);
    assert.deepEqual(data.views[0].nebulaTable.tags, {});
  }
  const mixed = generateBaseForNote(source, [record('Ideas/a.md', {title: 'a', tags: ['one']}), record('Ideas/b.md', {title: 'b', tags: 'two'})], 'Ideas');
  assert.deepEqual(mixed.views[0].nebulaTable.tags, {});
});

test('helpers are omitted while ordinary user fields remain visible, with at most 32 initial properties', () => {
  const properties = {position: {}, nf_source_id: 'id', nf_snapshot_fields: [], notion_id: 'id', source_id: 'id', cssclasses: ['style'], aliases: ['alias'], id: 'user id', source: 'user source', created: '2026-01-01'};
  for (let i = 0; i < 40; i++) properties['列' + i] = i;
  properties.标题 = 'Title appears after the first 32 fields';
  const data = generateBaseForNote(source, [record('Ideas.md', properties)]);
  assert.equal(data.views[0].order.length, 32);
  assert.equal(data.views[0].order[0], 'formula.Nebula标题_标题');
  for (const field of ['id', 'source', 'created']) assert.ok(data.views[0].order.includes('note.' + field));
  for (const field of ['position', 'nf_source_id', 'nf_snapshot_fields', 'notion_id', 'source_id', 'cssclasses', 'aliases']) assert.ok(!data.views[0].order.includes('note.' + field));
});

test('quoted paths and property names stay data, and literal prefix-like names are not rewritten', () => {
  const tricky = {path: 'a" or true or "b\n\\.md', basename: '<script>title</script>'};
  const props = Object.fromEntries([['title', 'A "quoted" title'], ['x"; note.secret', 'value'], ['note.foo', 'literal'], ['__proto__', 'data']]);
  const data = generateBaseForNote(tricky, [record(tricky.path, props)]);
  assert.equal(JSON.parse(data.filters.and[0].slice('file.path == '.length)), tricky.path);
  assert.equal(data.views[0].name, tricky.basename);
  assert.ok(data.views[0].order.includes('note.x"; note.secret'));
  assert.ok(data.views[0].order.includes('note.note.foo'));
  assert.ok(data.views[0].order.includes('note.__proto__'));
  assert.equal({}.data, undefined);
  const folder = 'a" or true or "b\n\\';
  const folderData = generateBaseForNote(tricky, [record(folder + '/a.md', {title: 'Example'})], folder);
  assert.equal(JSON.parse(folderData.filters.and[0].slice('file.folder == '.length)), folder);
});

test('generation is deterministic and leaves all source records unchanged', () => {
  const frozenSource = freeze({...source});
  const rows = freeze([record('Ideas/a.md', {title: 'A', tags: ['one', 'two']}), record('Ideas/b.md', {title: 'B', tags: null})]);
  const before = JSON.stringify(rows);
  const first = generateBaseForNote(frozenSource, rows, 'Ideas');
  assert.equal(JSON.stringify(rows), before);
  assert.deepEqual(generateBaseForNote(frozenSource, rows, 'Ideas'), first);
  assert.deepEqual(first.views[0].nebulaTable.tags, {tags: 'multi'});
});
