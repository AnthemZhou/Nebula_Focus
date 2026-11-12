const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {transformSync} = require('esbuild');
const mod = {exports: {}};
new Function('module', 'exports', transformSync(readFileSync('src/finance-model.ts', 'utf8'), {loader: 'ts', format: 'cjs'}).code)(mod, mod.exports);
const {decimalUnits, formatUnits, summarizeMoney, currencyDigits, knownCurrency, parseWikiLink, unavailableFormula} = mod.exports;
const row = (amount, direction = '收入', currency = 'CNY') => ({amount, direction, currency});

test('exact minor-unit arithmetic avoids floating point drift and supports large string totals', () => {
  const result = summarizeMoney([row(0.1), row(0.2), row(0.3, '支出'), row('9999999999999999.99')]);
  assert.equal(result.currencies[0].income, 1000000000000000029n);
  assert.equal(result.currencies[0].expense, 30n);
  assert.equal(formatUnits(result.currencies[0].income - result.currencies[0].expense), '9,999,999,999,999,999.99');
  assert.equal(formatUnits(-123456n), '−1,234.56');
});

test('missing, invalid, negative, unknown-direction and excessive-precision rows stay out of totals', () => {
  const result = summarizeMoney([row(null), row(''), row('not money'), row(1.001), row(-1), row(4, '非现金调整'), row(8, '收入', ''), row(9, '收入', 'XYZ'), row(10)]);
  assert.equal(result.rows, 9); assert.equal(result.included, 1); assert.equal(result.excluded, 8);
  assert.deepEqual(result.issues, {'missing-amount': 2, 'invalid-amount': 1, precision: 1, 'negative-amount': 1, 'unknown-direction': 1, 'missing-currency': 1, 'unknown-currency': 1});
  assert.equal(result.currencies[0].income, 1000n);
});

test('separate currencies retain their own minor-unit precision, with no cross-currency net', () => {
  const result = summarizeMoney([row('1.05'), row(2, '支出', 'USD'), row(300, '收入', 'JPY'), row('1.234', '收入', 'KWD')]);
  assert.deepEqual(result.currencies.map(t => [t.currency, t.digits, t.income, t.expense]), [
    ['CNY', 2, 105n, 0n], ['JPY', 0, 300n, 0n], ['KWD', 3, 1234n, 0n], ['USD', 2, 0n, 200n],
  ]);
  assert.equal(currencyDigits('JPY'), 0); assert.equal(knownCurrency('XYZ'), false);
});

test('numeric strings require unambiguous decimal syntax and preserve significant precision', () => {
  assert.deepEqual(decimalUnits('1.2300'), {units: 123n});
  assert.deepEqual(decimalUnits('1.2e2'), {units: 12000n});
  assert.deepEqual(decimalUnits('1e-2'), {units: 1n});
  assert.deepEqual(decimalUnits('1e-3'), {issue: 'precision'});
  assert.deepEqual(decimalUnits('0.000'), {units: 0n});
  for (const value of ['1,200', '¥20', true, {}, 'NaN', 'Infinity', '1e9999']) assert.ok('issue' in decimalUnits(value));
  assert.deepEqual(decimalUnits(1000000000000000), {issue: 'precision'});
});

test('directions are explicit and configurable; blank or equal configuration never silently includes entries', () => {
  assert.equal(summarizeMoney([row(1, 'credit'), row(2, 'debit')], 'credit', 'debit').included, 2);
  assert.equal(summarizeMoney([row(1, '收入')], '收入', '收入').excluded, 1);
  assert.equal(summarizeMoney([row(1, '')], '', '支出').excluded, 1);
  const source = [row(1), row(2, '支出')], before = JSON.stringify(source);
  summarizeMoney(source); assert.equal(JSON.stringify(source), before);
});

test('record link parsing retains target IDs and aliases; calculation references never count as values', () => {
  assert.deepEqual(parseWikiLink('[[Finance/uuid|Example project]]'), {target: 'Finance/uuid', label: 'Example project'});
  assert.equal(parseWikiLink('javascript:alert(1)'), null);
  assert.equal(unavailableFormula('formulaResult://source/page/id'), true);
  assert.equal(unavailableFormula('100'), false);
});
