const {test} = require('node:test');
const assert = require('node:assert/strict');
const {parseArgs, cliArguments, decodeOutput} = require('../scripts/obsidian-records.cjs');
test('requires an explicit vault and input; rejects ambiguous options', () => {
  assert.deepEqual(parseArgs(['--vault', '我的库', '--input', '-']), {vault: '我的库', input: '-'});
  for (const args of [[], ['--input', '-'], ['--vault', 'A'], ['--vault', 'A', '--vault', 'B', '--input', '-'], ['--exec', 'evil']]) assert.throws(() => parseArgs(args));
});
test('user data is base64 and separate arguments, never executable shell or JS text', async () => {
  const input = {action: 'create', title: '引号\'" `$(touch /bad)`\n中文', body: '${secrets}'};
  const args = cliArguments('库 `echo no`', input); assert.equal(args[0], 'vault=库 `echo no`'); assert.equal(args[1], 'eval'); assert.ok(!args[2].includes('touch /bad'));
  const app = {plugins: {getPlugin: () => ({recordRequest: async received => {assert.deepEqual(received, {...input, vault: '库 `echo no`'}); return {ok: true, result: {path: 'a.md'}};}})}};
  const code = args[2].slice(5);
  const output = await new (Object.getPrototypeOf(async function () {}).constructor)('app', code)(app);
  assert.deepEqual(decodeOutput('log\n=> ' + output + '\n'), {ok: true, result: {path: 'a.md'}});
});
test('missing plugin produces actionable structured error, invalid output is rejected', async () => {
  const args = cliArguments('Vault', {action: 'databases'}), code = args[2].slice(5);
  const output = await new (Object.getPrototypeOf(async function () {}).constructor)('app', code)({plugins: {getPlugin: () => undefined}});
  assert.equal(decodeOutput(output).error.code, 'plugin_unavailable'); assert.throws(() => decodeOutput('No output'));
  assert.throws(() => cliArguments('Vault', {vault: 'Other'})); assert.throws(() => cliArguments('Vault', {body: '字'.repeat(20000)}));
});
