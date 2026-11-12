const {test} = require('node:test');
const assert = require('node:assert/strict');
const {buildSync} = require('esbuild');
const mod = {exports: {}};
const code = buildSync({entryPoints: ['src/record-url.ts'], bundle: true, platform: 'node', format: 'cjs', write: false}).outputFiles[0].text;
new Function('module', 'exports', code)(mod, mod.exports);
const {recordUrl, isPreviewImage} = mod.exports;

test('signed attachment URL displays only a decoded filename while retaining the usable href', () => {
  const raw = 'https://bucket.example/private/%E5%8F%91%E7%A5%A8.pdf?X-Amz-Credential=secret&X-Amz-Signature=signature#private';
  const result = recordUrl(raw);
  assert.equal(result.label, '发票.pdf'); assert.equal(result.href, raw);
  assert.equal(result.title, 'bucket.example/private/发票.pdf');
  assert.ok(!result.label.includes('secret')); assert.ok(!result.title.includes('signature'));
});

test('ordinary external pages get compact host/path labels without leaking query or fragment', () => {
  const result = recordUrl('https://example.com/a-page?token=secret#hidden');
  assert.equal(result.label, 'example.com/a-page'); assert.equal(result.title, result.label);
  const long = recordUrl('https://example.com/' + 'a'.repeat(500));
  assert.equal(long.label.length, 64); assert.equal(long.title.length, 160);
  assert.equal(recordUrl('https://example.com/bad%XX.pdf').label, 'bad%XX.pdf');
});

test('active URL schemes and URL credentials are rejected; only local raster paths qualify for previews', () => {
  for (const raw of ['javascript:alert(1)', 'data:text/plain,x', 'file:///tmp/a', 'https://user:password@example.com/a', 'not-url']) assert.equal(recordUrl(raw), null);
  for (const path of ['a.png', 'A.JPG', '中文/receipt.webp']) assert.equal(isPreviewImage(path), true);
  for (const path of ['a.svg', 'a.pdf', 'a.png?secret=1']) assert.equal(isPreviewImage(path), false);
});
