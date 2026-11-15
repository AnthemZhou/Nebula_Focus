const {test} = require('node:test');
const assert = require('node:assert/strict');
const {buildSync} = require('esbuild');
const code = buildSync({entryPoints: ['src/assistant.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['obsidian']}).outputFiles[0].text;
function fixture(http, initial) {
  let stored = initial ?? {endpoint: 'https://example.test/v1', model: 'vision-tools', secretId: 'test-key'};
  const secrets = new Map([['test-key', 'private-api-key']]), notices = [], requests = [];
  const app = {vault: {getName: () => 'Vault'}, secretStorage: {getSecret: id => secrets.get(id), setSecret: (id, key) => secrets.set(id, key)}};
  const mod = {exports: {}};
  class Component {}
  class Modal {open() {} close() {}}
  new Function('require', 'module', 'exports', 'window', code)(() => ({Component, Modal, Notice: class {constructor(text) {notices.push(text);}}, requestUrl: async options => {requests.push(options); return http(options);}}), mod, mod.exports, {setTimeout, clearTimeout});
  const controller = new mod.exports.RecordingAssistant({app}, {handle: async () => ({ok: true, result: {}})}, () => stored, async config => {stored = config;});
  return {controller, secrets, notices, requests, config: () => stored};
}
test('controller sends the configured model and authorization without persisting the secret in config', async () => {
  const f = fixture(async () => ({status: 200, json: {choices: [{message: {content: '请明确目标数据库。'}}]}}));
  await f.controller.saveConfig(f.controller.config, 'replacement-secret');
  assert.equal(f.config().secretId, 'test-key'); assert.ok(!JSON.stringify(f.config()).includes('replacement-secret'));
  f.controller.setDraft('记录报销'); await f.controller.send();
  assert.equal(f.requests.length, 1); assert.equal(f.requests[0].url, 'https://example.test/v1/chat/completions');
  assert.equal(f.requests[0].headers.Authorization, 'Bearer replacement-secret');
  const body = JSON.parse(f.requests[0].body); assert.equal(body.model, 'vision-tools'); assert.equal(body.tools[0].function.name, 'nebula_records');
  assert.equal(f.controller.state.bubbles.at(-1).text, '请明确目标数据库。'); assert.equal(f.controller.state.busy, false);
});
test('missing configuration opens setup and preserves draft without making requests', async () => {
  const f = fixture(async () => {throw Error('must not send');}, {});
  f.controller.setDraft('记录报销'); await f.controller.send();
  assert.equal(f.requests.length, 0); assert.equal(f.controller.state.draft, '记录报销'); assert.ok(f.notices.length);
});
test('HTTP and network errors are actionable and never include response bodies or keys', async () => {
  for (const http of [async () => ({status: 401, json: {error: {message: 'private-api-key'}}}), async () => {throw Error('Authorization: private-api-key');}]) {
    const f = fixture(http); f.controller.setDraft('记录'); await f.controller.send();
    assert.equal(f.controller.state.bubbles.at(-1).kind, 'error'); assert.ok(!JSON.stringify(f.controller.state).includes('private-api-key')); assert.equal(f.controller.state.busy, false);
  }
});
test('cancel ends a pending HTTP wait and late responses do not create records', async () => {
  let resolve; const pending = new Promise(r => {resolve = r;});
  const f = fixture(() => pending); f.controller.setDraft('记录'); const turn = f.controller.send();
  await new Promise(r => setImmediate(r)); f.controller.cancel(); await turn;
  assert.equal(f.controller.state.busy, false); assert.match(f.controller.state.bubbles.at(-1).text, /停止/);
  resolve({status: 200, json: {choices: [{message: {content: 'late'}}]}});
  await new Promise(r => setImmediate(r)); assert.ok(!JSON.stringify(f.controller.state.bubbles).includes('late'));
});
test('session survives closing and clearing only removes conversation state', async () => {
  const f = fixture(async () => ({status: 200, json: {choices: [{message: {content: 'ok'}}]}}));
  f.controller.setDraft('hello'); await f.controller.send(); f.controller.closed(); assert.equal(f.controller.state.bubbles.length, 2);
  f.controller.clear(); assert.equal(f.controller.state.bubbles.length, 0); assert.equal(f.secrets.get('test-key'), 'private-api-key');
});
test('changing endpoint or model starts fresh context while preserving saved keys and the draft', async () => {
  const f = fixture(async () => ({status: 200, json: {choices: [{message: {content: '旧服务回复', reasoning_content: 'provider-specific-context'}}]}}));
  f.controller.setDraft('第一笔'); await f.controller.send();
  f.controller.setDraft('第二笔');
  await f.controller.saveConfig({...f.controller.config, endpoint: 'https://api.deepseek.com', model: 'deepseek-flash', secretId: 'deepseek-key'}, 'new-key');
  assert.equal(f.controller.state.draft, '第二笔'); assert.equal(f.secrets.get('test-key'), 'private-api-key');
  await f.controller.send();
  const request = f.requests.at(-1), body = JSON.parse(request.body);
  assert.equal(request.url, 'https://api.deepseek.com/chat/completions'); assert.equal(request.headers.Authorization, 'Bearer new-key');
  assert.equal(body.messages.length, 2); assert.equal(body.messages[1].content, '第二笔');
  assert.ok(!JSON.stringify(body).includes('provider-specific-context'));
  await f.controller.saveConfig({...f.controller.config, model: 'custom-text-model', imageInput: false});
  f.controller.setDraft('第三笔'); await f.controller.send();
  assert.equal(JSON.parse(f.requests.at(-1).body).messages.length, 2);
});
test('text-only configuration blocks images before storing attachments or making requests', async () => {
  const f = fixture(async () => {throw Error('must not send');});
  await f.controller.saveConfig({...f.controller.config, imageInput: false});
  f.controller.addFiles([{name: 'receipt.png', size: 10}]);
  assert.equal(f.controller.state.attachments.length, 0); assert.match(f.notices.at(-1), /图片/);
  // Also guard images already selected before the capability was changed.
  f.controller.state.attachments.push({file: {name: 'pending.png'}, preview: 'blob:pending'});
  f.controller.setDraft('记报销'); await f.controller.send();
  assert.equal(f.requests.length, 0); assert.equal(f.controller.state.draft, '记报销'); assert.match(f.notices.at(-1), /未启用图片/);
});
test('configuration cannot change credentials or model during an active request', async () => {
  let resolve; const f = fixture(() => new Promise(done => {resolve = done;}));
  f.controller.setDraft('记录'); const turn = f.controller.send();
  await assert.rejects(() => f.controller.saveConfig({...f.controller.config, model: 'other'}, 'another-key'), /当前记录/);
  assert.equal(f.config().model, 'vision-tools'); assert.equal(f.secrets.get('test-key'), 'private-api-key');
  resolve({status: 200, json: {choices: [{message: {content: 'ok'}}]}}); await turn;
});
