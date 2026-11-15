const {test} = require('node:test');
const assert = require('node:assert/strict');
const {buildSync} = require('esbuild');
const mod = {exports: {}};
new Function('module', 'exports', buildSync({entryPoints: ['src/assistant-engine.ts'], bundle: true, write: false, platform: 'node', format: 'cjs'}).outputFiles[0].text)(mod, mod.exports);
const {AssistantEngine, chatEndpoint} = mod.exports;
const scope = {database: 'D.base', view: '记录'};
const call = (input, id = '1') => ({choices: [{message: {tool_calls: [{id, type: 'function', function: {name: 'nebula_records', arguments: JSON.stringify(input)}}]}}]});
const answer = text => ({choices: [{message: {content: text}}]});

test('normalizes endpoints and rejects credentials/query/insecure remote transport', () => {
  assert.equal(chatEndpoint('https://example.test/v1/'), 'https://example.test/v1/chat/completions');
  assert.equal(chatEndpoint('https://example.test/v1/chat/completions'), 'https://example.test/v1/chat/completions');
  assert.equal(chatEndpoint('http://localhost:1234/v1'), 'http://localhost:1234/v1/chat/completions');
  for (const url of ['http://example.test/v1', 'https://user:key@example.test/v1', 'https://example.test/v1?key=x', 'bad']) assert.throws(() => chatEndpoint(url));
});
test('schema discovery, vision input and successful create emit a real record card', async () => {
  const events = [], requests = [], bodies = [];
  const engine = new AssistantEngine(async input => {requests.push(input); return {ok: true, result: {...scope, ...(input.action === 'create' ? {path: 'R/a.md', title: 'a', created: true} : {})}};}, 'Vault');
  const responses = [call({action: 'schema', ...scope}), call({action: 'create', ...scope, title: 'a', requestId: 'r1'}), answer('已保存')];
  await engine.send('记报销', [{name: 'receipt.png', dataUrl: 'data:image/png;base64,abc', path: 'Attachments/receipt.png', wikiLink: '[[Attachments/receipt.png]]'}], 'vision', async body => {bodies.push(structuredClone(body)); return responses.shift();}, new AbortController().signal, event => events.push(event));
  assert.equal(requests.length, 2); assert.equal(requests[1].vault, 'Vault'); assert.equal(events.filter(e => e.kind === 'record').length, 1);
  assert.equal(bodies[0].messages[1].content[1].type, 'image_url'); assert.match(bodies[0].messages[1].content[0].text, /Attachments\/receipt.png/);
  await engine.send('继续', [], 'vision', async body => {assert.ok(!JSON.stringify(body.messages).includes('base64')); return answer('好的');}, new AbortController().signal, () => {});
});
test('blocks writes without schema and updates without a read revision', async () => {
  const requests = [], toolErrors = [];
  const engine = new AssistantEngine(async input => {requests.push(input); return {ok: true, result: scope};}, 'Vault');
  const responses = [call({action: 'create', ...scope}), call({action: 'schema', ...scope}), call({action: 'update', ...scope, path: 'a.md', expectedRevision: 'fake'}), answer('需要先读取')];
  await engine.send('更新', [], 'model', async body => {const last = body.messages.at(-1); if (last.role === 'tool') toolErrors.push(JSON.parse(last.content)); return responses.shift();}, new AbortController().signal, () => {});
  assert.deepEqual(requests.map(r => r.action), ['schema']); assert.equal(toolErrors.filter(r => !r.ok).length, 2);
});
test('a revision from read enables a scoped update and backend failure never emits success', async () => {
  const events = [], requests = [], engine = new AssistantEngine(async input => {
    requests.push(input); return input.action === 'update' ? {ok: false, error: {code: 'revision_conflict', message: 'changed'}} : {ok: true, result: {...scope, path: 'a.md', revision: 'r1'}};
  }, 'Vault');
  const responses = [call({action: 'schema', ...scope}), call({action: 'read', ...scope, path: 'a.md'}), call({action: 'update', ...scope, path: 'a.md', expectedRevision: 'r1'}), answer('页面已变化')];
  await engine.send('更新', [], 'model', async () => responses.shift(), new AbortController().signal, e => events.push(e));
  assert.equal(requests.at(-1).action, 'update'); assert.equal(events.some(e => e.kind === 'record'), false);
});
test('cancelled HTTP response cannot execute its tool call', async () => {
  let requests = 0; const control = new AbortController(), engine = new AssistantEngine(async () => {requests++; return {ok: true, result: {}};}, 'Vault');
  await assert.rejects(() => engine.send('save', [], 'model', async () => {control.abort(); return call({action: 'create', ...scope});}, control.signal, () => {}), /停止/);
  assert.equal(requests, 0);
});
test('cancellation after a write retains the receipt and pairs all remaining calls', async () => {
  const control = new AbortController(), events = []; let requests = 0;
  const engine = new AssistantEngine(async input => {requests++; if (input.action === 'create') control.abort(); return {ok: true, result: {...scope, path: 'a.md', created: true}};}, 'Vault');
  const batch = call({action: 'create', ...scope}); batch.choices[0].message.tool_calls.push(call({action: 'query', ...scope}, '2').choices[0].message.tool_calls[0]);
  const responses = [call({action: 'schema', ...scope}), batch];
  await assert.rejects(() => engine.send('save', [], 'model', async () => responses.shift(), control.signal, e => events.push(e)), /停止/);
  assert.equal(requests, 2); assert.equal(events.filter(e => e.kind === 'record').length, 1);
  await engine.send('status', [], 'model', async body => {const messages = body.messages; const second = messages.find(m => m.tool_calls?.length === 2); const index = messages.indexOf(second); assert.equal(messages[index + 1].tool_call_id, '1'); assert.equal(messages[index + 2].tool_call_id, '2'); return answer('已保存');}, new AbortController().signal, () => {});
});
test('invalid tool batches execute nothing, empty responses error and loop is bounded', async () => {
  let requests = 0; const engine = new AssistantEngine(async () => {requests++; return {ok: true, result: {}};}, 'Vault');
  const duplicate = call({action: 'schema', ...scope}); duplicate.choices[0].message.tool_calls.push(duplicate.choices[0].message.tool_calls[0]);
  await assert.rejects(() => engine.send('a', [], 'model', async () => duplicate, new AbortController().signal, () => {}), /ID/); assert.equal(requests, 0);
  await assert.rejects(() => engine.send('a', [], 'model', async () => answer(''), new AbortController().signal, () => {}), /空回复/);
  await assert.rejects(() => engine.send('a', [], 'model', async () => call({action: 'databases'}), new AbortController().signal, () => {}), /12 轮/); assert.equal(requests, 12);
});
test('reasoning content roundtrips through tool responses and subsequent user turns without being displayed', async () => {
  const bodies = [], events = [];
  const engine = new AssistantEngine(async () => ({ok: true, result: scope}), 'Vault');
  const firstCall = call({action: 'schema', ...scope}, 'schema-1');
  firstCall.choices[0].message.reasoning_content = 'private tool context\n保留原文';
  const firstAnswer = answer('请补充金额');
  firstAnswer.choices[0].message.reasoning_content = 'private final context';
  const nextCall = call({action: 'schema', ...scope}, 'schema-2');
  nextCall.choices[0].message.reasoning_content = '';
  const responses = [firstCall, firstAnswer, nextCall, answer('已理解')];
  const transport = async body => {bodies.push(structuredClone(body)); return responses.shift();};
  await engine.send('记录报销', [], 'deepseek-flash', transport, new AbortController().signal, e => events.push(e));
  await engine.send('金额 50 元', [], 'deepseek-flash', transport, new AbortController().signal, e => events.push(e));
  const assistants = body => body.messages.filter(message => message.role === 'assistant');
  assert.deepEqual(assistants(bodies[1]).map(message => message.reasoning_content), ['private tool context\n保留原文']);
  assert.deepEqual(assistants(bodies[2]).map(message => message.reasoning_content), ['private tool context\n保留原文', 'private final context']);
  assert.deepEqual(assistants(bodies[3]).map(message => message.reasoning_content), ['private tool context\n保留原文', 'private final context', '']);
  assert.equal(Object.hasOwn(assistants(bodies[3]).at(-1), 'reasoning_content'), true);
  assert.deepEqual(events.filter(event => event.kind === 'text').map(event => event.text), ['请补充金额', '已理解']);
  assert.equal(JSON.stringify(events).includes('private'), false);
});
test('generic requests omit parallel_tool_calls while returned tool batches execute serially', async () => {
  let releaseFirst, firstStarted;
  const gate = new Promise(resolve => {releaseFirst = resolve;});
  const started = new Promise(resolve => {firstStarted = resolve;});
  const trace = [], bodies = [];
  const engine = new AssistantEngine(async input => {
    trace.push(`start:${input.query}`);
    if (input.query === 'first') {firstStarted(); await gate;}
    trace.push(`end:${input.query}`);
    return {ok: true, result: {records: []}};
  }, 'Vault');
  const batch = call({action: 'query', ...scope, query: 'first'}, 'first');
  batch.choices[0].message.tool_calls.push(call({action: 'query', ...scope, query: 'second'}, 'second').choices[0].message.tool_calls[0]);
  const responses = [batch, answer('查询完成')];
  const pending = engine.send('查找记录', [], 'compatible-model', async body => {bodies.push(structuredClone(body)); return responses.shift();}, new AbortController().signal, () => {});
  await started;
  await new Promise(resolve => setImmediate(resolve));
  const whileFirstPending = [...trace];
  releaseFirst();
  await pending;
  assert.deepEqual(whileFirstPending, ['start:first']);
  assert.deepEqual(trace, ['start:first', 'end:first', 'start:second', 'end:second']);
  for (const body of bodies) assert.equal(Object.hasOwn(body, 'parallel_tool_calls'), false);
  assert.deepEqual(bodies[1].messages.filter(message => message.role === 'tool').map(message => message.tool_call_id), ['first', 'second']);
});
