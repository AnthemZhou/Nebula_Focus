const {test} = require('node:test');
const assert = require('node:assert/strict');
const {buildSync} = require('esbuild');
const code = buildSync({entryPoints: ['src/config-id.ts'], bundle: true, write: false, platform: 'node', format: 'cjs'}).outputFiles[0].text;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function load(environment = globalThis, math = Math, date = Date) {
  const mod = {exports: {}};
  new Function('module', 'exports', 'crypto', 'Math', 'Date', code)(mod, mod.exports, environment.crypto, math, date);
  return mod.exports.configId;
}
test('configuration IDs prefer native UUIDs with their required receiver', () => {
  const source = {randomUUID() {assert.equal(this, source); return 'native-id';}, getRandomValues() {assert.fail('native UUID exists');}};
  assert.equal(load()(source), 'native-id');
});
test('mobile getRandomValues creates unique UUID-shaped IDs without randomUUID', () => {
  const source = {getRandomValues(bytes) {assert.equal(this, source); return require('node:crypto').randomFillSync(bytes);}};
  const configId = load({crypto: source}), ids = Array.from({length: 100}, () => configId());
  assert.equal(new Set(ids).size, ids.length); assert.ok(ids.every(id => uuid.test(id)));
});
test('configuration IDs survive missing and throwing crypto with a coarse clock and deterministic randomness', () => {
  const fixedMath = Object.create(Math); fixedMath.random = () => 0.5;
  const configId = load({}, fixedMath, {now: () => 1730000000000});
  const throwing = {randomUUID() {throw Error('unavailable');}, getRandomValues() {throw Error('unavailable');}};
  const ids = Array.from({length: 1000}, (_, index) => index % 2 ? configId(throwing) : configId());
  assert.equal(new Set(ids).size, ids.length); assert.ok(ids.every(id => uuid.test(id)));
});
