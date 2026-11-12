const {test} = require('node:test');
const assert = require('node:assert/strict');
const {buildSync} = require('esbuild');
const mod = {exports: {}};
const code = buildSync({entryPoints: ['src/record-date.ts'], bundle: true, platform: 'node', format: 'cjs', write: false}).outputFiles[0].text;
new Function('module', 'exports', code)(mod, mod.exports);
const {recordDate} = mod.exports;
const local = date => {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}` +
    (date.getSeconds() ? ':' + pad(date.getSeconds()) : '');
};

test('explicit timezone ISO instants use runtime local time with original source retained', () => {
  const utc = '2025-12-05T01:55:00.000Z', offset = '2025-12-05T09:55:00+08:00';
  assert.deepEqual(recordDate(utc), {text: local(new Date(utc)), source: utc});
  assert.equal(recordDate(offset).text, recordDate(utc).text);
  const seconds = '2026-01-01T00:00:27Z';
  assert.equal(recordDate(seconds).text, local(new Date(seconds)));
  assert.equal(recordDate('2025-12-05T01:55Z').text, recordDate(utc).text);
});

test('Date values preserve the instant without mutation; invalid dates, prose and timezone-free strings are untouched', () => {
  const date = new Date('2025-12-31T23:59:59Z'), time = date.getTime();
  assert.deepEqual(recordDate(date), {text: local(date), source: date.toISOString()});
  assert.equal(date.getTime(), time);
  for (const value of ['2025-12-05', '2025-12-05T09:55:00', 'Paid on 2025-12-05T09:55:00Z',
    '2025-02-29T00:00:00Z', '2024-02-30T00:00:00Z', '2025-13-01T00:00:00Z', '2025-01-01T24:00:00Z',
    '2025-01-01T00:60:00Z', '2025-01-01T00:00:00+08:60', new Date(NaN), 0, null]) assert.equal(recordDate(value), null);
  assert.ok(recordDate('2024-02-29T00:00:00Z'));
});
