const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {transformSync} = require('esbuild');
const mod = {exports: {}};
new Function('module', 'exports', transformSync(readFileSync('src/creation-order.ts', 'utf8'), {loader: 'ts', format: 'cjs'}).code)(mod, mod.exports);
const {ensureCreationOrder} = mod.exports;

function fixture(sort) {
  const writes = [];
  const query = {file: 'Bases/想法收集箱.base', saveFn(value) {assert.equal(this, query); assert.equal(value, query); writes.push(value);}};
  const config = {name: '想法收集箱', query, getSort() {return this.sort || [];}};
  if (sort !== undefined) config.sort = sort;
  const view = {type: 'table', _loaded: true, config, queryController: {sourcePath: 'Home.md'}};
  return {view, config, query, writes};
}

test('creation order appends a final tiebreaker without replacing domain or other explicit sorts', async () => {
  const original = [{property: 'note.领域', direction: 'DESC'}, {property: 'note.重要性', direction: 'ASC'}];
  const f = fixture(original);
  assert.equal(await ensureCreationOrder(f.view), true);
  assert.deepEqual(f.config.sort, [...original, {property: 'file.ctime', direction: 'ASC'}]);
  assert.equal(f.config.sort[0], original[0]);
  assert.equal(original.length, 2);
  assert.equal(f.writes.length, 1);
  assert.equal(await ensureCreationOrder(f.view), false);
  assert.equal(f.writes.length, 1);
});

test('existing creation-time sorting is preserved in either direction and at any priority', async () => {
  for (const direction of ['ASC', 'DESC']) {
    const original = [{property: 'file.ctime', direction}, {property: 'note.领域', direction: 'DESC'}];
    const f = fixture(original);
    assert.equal(await ensureCreationOrder(f.view), false);
    assert.equal(f.config.sort, original);
    assert.deepEqual(f.writes, []);
  }
});

test('an external query without an explicit sort gets one and accepts a TFile-like identity', async () => {
  const f = fixture(); f.query.file = {path: 'Bases/想法收集箱.base'};
  assert.equal(await ensureCreationOrder(f.view), true);
  assert.deepEqual(f.config.sort, [{property: 'file.ctime', direction: 'ASC'}]);
  assert.equal(f.writes.length, 1);
});

test('other views, readonly contexts, inline Bases, unknown query paths and missing save APIs are not changed', async () => {
  for (const change of [
    f => {f.view.type = 'cards';}, f => {f.config.name = 'Other table';}, f => {f.view._loaded = false;},
    f => {f.view.isReadOnly = true;}, f => {f.config.readOnly = true;}, f => {f.query.isReadOnly = true;},
    f => {f.view.queryController.readOnly = true;}, f => {f.view.containerEl = {closest: () => ({})};},
    f => {f.query.file = 'Inline.md';}, f => {delete f.query.file;}, f => {f.query.file = 'https://example.test/data.base';},
    f => {delete f.query.saveFn;}, f => {delete f.config.getSort;}, f => {f.config.sort = [null];},
    f => {f.config.sort = [{property: 'note.领域', direction: 'UNKNOWN'}];},
  ]) {
    const f = fixture([{property: 'note.领域', direction: 'DESC'}]); change(f);
    const previous = f.config.sort;
    assert.equal(await ensureCreationOrder(f.view), false);
    assert.equal(f.config.sort, previous); assert.deepEqual(f.writes, []);
  }
});

test('synchronous and asynchronous save failures restore the original sort or its absence and propagate', async () => {
  for (const original of [undefined, [{property: 'note.领域', direction: 'DESC'}]]) {
    for (const asynchronous of [false, true]) {
      const f = fixture(original), failure = new Error('native save failed');
      f.query.saveFn = () => {if (asynchronous) return Promise.reject(failure); throw failure;};
      await assert.rejects(ensureCreationOrder(f.view), error => error === failure);
      assert.equal(Object.hasOwn(f.config, 'sort'), original !== undefined);
      assert.equal(f.config.sort, original);
    }
  }
});

test('rollback does not overwrite a newer user sort while native save is pending', async () => {
  const f = fixture([{property: 'note.领域', direction: 'DESC'}]);
  let reject;
  f.query.saveFn = () => new Promise((resolve, fail) => {reject = fail;});
  const pending = ensureCreationOrder(f.view);
  const newer = [{property: 'file.name', direction: 'DESC'}]; f.config.sort = newer;
  reject(new Error('native save failed'));
  await assert.rejects(pending, /native save failed/);
  assert.equal(f.config.sort, newer);
});
