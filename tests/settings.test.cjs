const {test} = require('node:test');
const assert = require('node:assert/strict');
const {buildSync} = require('esbuild');
const code = buildSync({entryPoints: ['src/settings.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', external: ['obsidian']}).outputFiles[0].text;

function fixture(mobile = false) {
  const module = {exports: {}};
  const writes = [];
  new Function('module', 'exports', 'require', code)(module, module.exports, () => ({
    Platform: {isMobileApp: mobile},
    PluginSettingTab: class {update() {this.updates = (this.updates || 0) + 1;}},
  }));
  const sidebar = {
    settings: {openOnStartup: true, showAttachments: false, hiddenPaths: ['private'], sort: 'manual'},
    archives: {directory: '/archive', browse() {}},
    ribbon: {available: !mobile, listItems: () => [{id: 'graph', label: '关系图谱'}]},
    reminders: {preferences: {openOnStartup: true, databases: ['Ideas.base'], name: '我的计划'},
      get displayName() {return this.preferences.name || '提醒事项';},
      async setOpenOnStartup(value) {writes.push(['startup', value]); return true;},
      async update(change) {this.preferences = change(this.preferences); writes.push(['name', this.preferences.name]); return true;}},
    reminderName: () => '我的计划', renameReminders: () => writes.push(['rename']),
    async update(change) {writes.push(change); sidebar.settings = change(sidebar.settings); return true;},
  };
  const font = {get: () => 'default', set: async value => {writes.push(['font', value]); return true;}};
  const tab = new module.exports.NebulaFocusSettings({app: {}}, sidebar, font);
  const visible = definition => typeof definition.visible === 'function' ? definition.visible() : definition.visible !== false;
  const buttonFor = definition => {
    const attrs = new Map(), listeners = new Map();
    const input = {value: '', disabled: false, setAttribute() {},
      addEventListener(type, callback) {listeners.set(type, callback);},
      emit(type, event = {}) {listeners.get(type)?.(event);}};
    const button = {buttonEl: {setAttribute: (key, value) => attrs.set(key, value)}, attrs,
      input, setDisabled(value) {this.disabled = value; return this;},
      setButtonText(text) {this.text = text; return this;}, onClick(callback) {this.click = callback; return this;}};
    definition.render({addButton(callback) {callback(button); return this;},
      addText(callback) {callback({inputEl: input, setValue(value) {input.value = value; return this;}}); return this;}});
    return button;
  };
  return {tab, sidebar, writes, visible, buttonFor};
}

test('settings disclose advanced controls locally while preserving all saved preferences and common controls', async () => {
  const f = fixture();
  const groups = () => f.tab.getSettingDefinitions();
  const initiallyVisible = groups().filter(f.visible);
  assert.deepEqual(initiallyVisible.map(item => item.heading || item.name), ['字体', '提醒事项', '更多设置']);
  const advanced = groups().filter(group => ['页面侧栏', '左侧工具按钮', '外部归档（桌面）'].includes(group.heading));
  assert.ok(advanced.every(group => !f.visible(group)));
  const expand = f.buttonFor(groups().find(item => item.name === '更多设置'));
  assert.equal(expand.attrs.get('aria-expanded'), 'false');
  expand.click();
  assert.ok(advanced.every(f.visible));
  const expanded = groups();
  assert.ok(expanded.find(group => group.heading === '页面侧栏').items.some(item => item.name === '隐藏页面路径'));
  assert.ok(expanded.find(group => group.heading === '左侧工具按钮').items.some(item => item.control?.key === 'ribbon:graph'));
  assert.deepEqual(f.writes, [], 'opening controls does not save new preferences');
  const collapse = f.buttonFor(expanded.find(item => item.name === '更多设置'));
  assert.equal(collapse.attrs.get('aria-expanded'), 'true'); collapse.click();
  assert.ok(advanced.every(group => !f.visible(group)));
  const reminder = groups().find(group => group.heading === '提醒事项');
  const name = reminder.items.find(item => item.name === '页面名称');
  const save = f.buttonFor(name);
  assert.equal(save.input.value, '我的计划');
  save.input.emit('compositionstart'); save.input.value = 'mei';
  save.input.emit('input'); save.input.emit('keydown', {key: 'Enter'});
  save.input.emit('blur'); await save.click();
  assert.deepEqual(f.writes, [], 'IME, typing and blur never save or navigate');
  save.input.value = '每日安排'; save.input.emit('compositionend');
  assert.deepEqual(f.writes, [], 'accepting a candidate does not save');
  await save.click();
  assert.equal(save.input.value, '每日安排'); assert.equal(save.input.disabled, false);
  assert.deepEqual(f.sidebar.reminders.preferences.databases, ['Ideas.base']);
  await f.tab.setControlValue('remindersStartup', false);
  await f.tab.setControlValue('fontFamily', 'lxgw-wenkai');
  assert.deepEqual(f.writes, [['name', '每日安排'], ['startup', false], ['font', 'lxgw-wenkai']]);
  assert.deepEqual(f.sidebar.settings.hiddenPaths, ['private']);
});

test('phone settings omit automatic drawer opening and desktop-only tools while retaining reminder startup and sidebar management', () => {
  const f = fixture(true);
  f.buttonFor(f.tab.getSettingDefinitions().find(item => item.name === '更多设置')).click();
  const definitions = f.tab.getSettingDefinitions();
  const controls = definitions.flatMap(group => group.items || []).map(item => item.control?.key).filter(Boolean);
  assert.equal(controls.includes('openOnStartup'), false);
  assert.equal(controls.includes('remindersStartup'), true);
  assert.equal(controls.includes('showAttachments'), true);
  assert.equal(controls.includes('sort'), true);
  assert.equal(definitions.some(group => /左侧工具按钮|外部归档/.test(group.heading || '')), false);
  assert.deepEqual(f.writes, []);
});
