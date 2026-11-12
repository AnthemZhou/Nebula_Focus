const {test} = require('node:test');
const assert = require('node:assert/strict');
const {buildSync} = require('esbuild');
const {execFileSync} = require('node:child_process');
const mod = {exports: {}};
const code = buildSync({entryPoints: ['src/reminder-model.ts'], bundle: true,
  write: false, platform: 'node', format: 'cjs'}).outputFiles[0].text;
new Function('module', 'exports', code)(mod, mod.exports);
const {readReminderPreferences, reminderDate, reminderDay, reminderGroup, noteReminders, sortReminders,
  reminderSections, formatReminderDate, reminderTitle} = mod.exports;
const item = (line, task) => ({task, position: {start: {line, col: 0, offset: 0}, end: {line, col: 40, offset: 40}}});
const note = (content, cache = {}) => noteReminders('项目/笔记.md', '笔记', content, cache);

test('only parsed unchecked list items become tasks; fenced examples and ordinary mentions stay absent', () => {
  const content = ['```md', '- [ ] 示例任务', '```', '正文提及 - [ ] 不是任务',
    '- [ ] 实际任务', '- [x] 已完成', '- [-] 已取消', '- 普通列表',
    '  > - [ ] 引用中的任务', '1. [ ] 编号任务'].join('\n');
  const rows = note(content, {listItems: [item(4, ' '), item(5, 'x'), item(6, '-'), item(7), item(8, ' '), item(9, ' ')]});
  assert.deepEqual(rows.map(row => [row.title, row.line, row.kind]), [
    ['实际任务', 4, 'task'], ['引用中的任务', 8, 'task'], ['编号任务', 9, 'task'],
  ]);
  assert.deepEqual(note(content, {}), []);
  assert.deepEqual(note('已经发生变化，不再是任务', {listItems: [item(0, ' '), item(50, ' ')]}), []);
});

test('task deadlines stay independent of the page deadline and non-due properties', () => {
  const content = '- [ ] 安排拍摄 📅 2026-12-02\n- [ ] 联系对接人\n- [ ] 结算 due:: 2027-01-03';
  const rows = note(content, {frontmatter: {title: '制作项目', 截止日期: '2026-11-30', 交易日期: '2026-10-01'},
    listItems: [item(0, ' '), item(1, ' '), item(2, ' ')]});
  assert.deepEqual(rows.map(row => [row.kind, row.due]), [
    ['task', '2026-12-02'], ['task', undefined], ['task', '2027-01-03'], ['deadline', '2026-11-30'],
  ]);
  assert.equal(new Set(rows.map(row => row.id)).size, 4);
  assert.ok(rows.every(row => row.source === '制作项目' && row.path === '项目/笔记.md'));
  assert.equal(rows.at(-1).title, '制作项目');
  assert.deepEqual(note('', {frontmatter: {交易日期: '2026-11-01', created: '2026-10-01'}}), []);
});

test('completed page status suppresses its deadline but does not discard unfinished task lines', () => {
  for (const status of ['完成', '已完成', '取消', '已取消', ' DONE ', 'Completed', 'cancelled', 'canceled']) {
    for (const key of ['状态', 'status']) {
      const rows = note('- [ ] 尚未完成的小项', {frontmatter: {[key]: status, due: '2026-11-14'}, listItems: [item(0, ' ')]});
      assert.deepEqual(rows.map(row => row.kind), ['task'], `${key}: ${status}`);
    }
  }
  assert.equal(note('', {frontmatter: {status: '进行中', due: '2026-11-14'}})[0].kind, 'deadline');
});

test('calendar validation ignores impossible or malformed dates without losing the task itself', () => {
  for (const value of ['2026-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '2026-11-00',
    '2026-11-32', '26-11-13', '2026-1-1', 'tomorrow', '2026-11-13Tgarbage', null, 1794528000000]) {
    assert.equal(reminderDate(value), undefined, String(value));
  }
  assert.equal(reminderDate(' 2028/02/29 '), '2028-02-29');
  assert.equal(reminderDate('2026-11-13T23:30:00-05:00'), '2026-11-13');
  const rows = note('- [ ] 检查日期 📅 2026-02-29', {frontmatter: {due: '2026-04-31'}, listItems: [item(0, ' ')]});
  assert.equal(rows.length, 1); assert.equal(rows[0].due, undefined); assert.equal(rows[0].kind, 'task');
});

test('local date grouping and ordering cross month/year boundaries without treating undated tasks as overdue', () => {
  const make = (id, due, source = '同一笔记', line = 0) => ({id, due, source, line, path: '笔记.md', title: id, kind: 'task'});
  const rows = [make('no-date', undefined), make('jan', '2027-01-01'), make('dec', '2026-12-01'),
    make('today', '2026-11-30'), make('old', '2026-10-31'), make('today-later', '2026-11-30', '同一笔记', 2)];
  const original = rows.slice();
  assert.deepEqual(sortReminders(rows).map(row => row.id), ['old', 'today', 'today-later', 'dec', 'jan', 'no-date']);
  assert.deepEqual(rows, original);
  assert.deepEqual(rows.map(row => reminderGroup(row, '2026-11-30')), ['未设日期', '接下来', '接下来', '今天', '逾期', '今天']);
  const local = new Date(2026, 10, 30, 23, 59, 59);
  assert.equal(reminderDay(local), '2026-11-30');
});

test('scheduled sections group all overdue rows, split later days chronologically and keep invalid dates last', () => {
  const make = (id, due, line = 0) => Object.freeze({id, due, source: '同一笔记', line, path: '笔记.md', title: id, kind: 'task'});
  const rows = Object.freeze([make('later', '2026-11-17'), make('invalid', '2026-02-30'), make('overdue-2', '2026-11-12'),
    make('tomorrow', '2026-11-14'), make('today-2', '2026-11-13', 2), make('undated', undefined, 1),
    make('overdue-1', '2026-11-10'), make('today-1', '2026-11-13', 1), make('sooner', '2026-11-15')]);
  const result = reminderSections(rows, '2026-11-13');
  assert.deepEqual(result.map(section => [section.key, section.label, section.dateLabel, section.overdue, section.rows.map(row => row.id)]), [
    ['overdue', '逾期', undefined, true, ['overdue-1', 'overdue-2']],
    ['date:2026-11-13', '今天', '11月13日 星期五', false, ['today-1', 'today-2']],
    ['date:2026-11-14', '明天', '11月14日 星期六', false, ['tomorrow']],
    ['date:2026-11-15', '11月15日 星期日', undefined, false, ['sooner']],
    ['date:2026-11-17', '11月17日 星期二', undefined, false, ['later']],
    ['undated', '未设日期', undefined, false, ['invalid', 'undated']],
  ]);
  assert.equal(reminderGroup(rows[1], '2026-11-13'), '未设日期');
  assert.equal(result[0].rows[0], rows[6]);assert.equal(rows[0].id, 'later');
  assert.deepEqual(reminderSections([], '2026-11-13'), []);
});

test('date captions add years only across the year boundary and keep date-section keys stable at midnight', () => {
  const row = due => ({id: due, due, source: '笔记', path: '笔记.md', title: '任务', kind: 'task'});
  const rows = ['2027-01-02', '2026-12-31', '2027-01-01'].map(row);
  const sections = reminderSections(rows, '2026-12-31');
  assert.deepEqual(sections.map(section => [section.label, section.dateLabel]), [
    ['今天', '12月31日 星期四'], ['明天', '2027年1月1日 星期五'], ['2027年1月2日 星期六', undefined],
  ]);
  const tomorrow = sections[1], nextDay = reminderSections(rows, '2027-01-01').find(section => section.key === tomorrow.key);
  assert.equal(nextDay.label, '今天');assert.equal(nextDay.dateLabel, '1月1日 星期五');
  assert.equal(formatReminderDate('2026-12-31', '2027-01-01'), '2026年12月31日');
  assert.equal(formatReminderDate('2027/01/02', '2027-01-01'), '1月2日');
  assert.equal(formatReminderDate('2027-02-29', '2027-01-01'), '');
  assert.equal(formatReminderDate(undefined, '2027-01-01'), '');
});

test('tomorrow uses local calendar arithmetic through leap days and daylight-saving changes', () => {
  const scenarios = [
    ['2028-02-28', '2028-02-29', '2月29日 星期二'],
    ['2026-02-28', '2026-03-01', '3月1日 星期日'],
    ['2026-03-08', '2026-03-09', '3月9日 星期一'],
    ['2026-11-01', '2026-11-02', '11月2日 星期一'],
  ];
  // Run in a DST timezone regardless of the developer machine's timezone.
  const script = `const m={exports:{}};new Function('module','exports',${JSON.stringify(code)})(m,m.exports);
    const result=${JSON.stringify(scenarios)}.map(([today,due])=>{
      const row={id:due,due,source:'note',path:'note.md',title:'task',kind:'task'};
      const section=m.exports.reminderSections([row],today)[0];return [section.label,section.dateLabel];
    });process.stdout.write(JSON.stringify(result));`;
  const result = JSON.parse(execFileSync(process.execPath, ['-e', script], {env: {...process.env, TZ: 'America/Los_Angeles'}, encoding: 'utf8'}));
  assert.deepEqual(result, scenarios.map(([, , dateLabel]) => ['明天', dateLabel]));
});

test('task display titles omit only their matching date marker without changing source rows or leaving an empty title', () => {
  const make = (title, due = '2026-11-14', kind = 'task') => Object.freeze({title, due, kind, id: 'row', path: '笔记.md', source: '笔记'});
  const task = make('准备材料 📅 2026-11-14');
  assert.equal(reminderTitle(task), '准备材料');assert.equal(task.title, '准备材料 📅 2026-11-14');
  assert.equal(reminderTitle(make('准备 due:: 2026-11-14 材料')), '准备 材料');
  assert.equal(reminderTitle(make('准备 📅 2026-11-15')), '准备 📅 2026-11-15');
  assert.equal(reminderTitle(make('准备 📅 2026-02-30', '2026-02-30')), '准备 📅 2026-02-30');
  assert.equal(reminderTitle(make('📅 2026-11-14')), '📅 2026-11-14');
  assert.equal(reminderTitle(make('项目 📅 2026-11-14', '2026-11-14', 'deadline')), '项目 📅 2026-11-14');
  assert.equal(reminderTitle(make('按 2026-11-14 的计划推进')), '按 2026-11-14 的计划推进');
});

test('source labels use title, first alias, then basename without mutating cached metadata', () => {
  const frontmatter = Object.freeze({aliases: Object.freeze(['创意项目', '别名2']), deadline: '2026-11-30'});
  const cache = Object.freeze({frontmatter});
  assert.equal(note('', cache)[0].title, '创意项目');
  assert.equal(note('', {frontmatter: {title: '明确名称', ...frontmatter}})[0].title, '明确名称');
  assert.equal(note('', {frontmatter: {deadline: '2026-11-30'}})[0].title, '笔记');
  assert.equal(cache.frontmatter.aliases[0], '创意项目');
});

test('database preferences keep local Base references only and reject embedding or path escapes', () => {
  const bad = ['', 'A.md', '../Outside.base', '/absolute.base', 'A/../B.base', 'A/./B.base',
    'A//B.base', '.obsidian/B.base', 'A/.hidden/B.base', 'A\\B.base', 'https://example.test/a.base',
    '//host/share.base', 'A\u0000.base', 'A\nB.base', 'A\rB.base', 'A|B.base', 'A#B.base', 'A[[B]].base'];
  for (const path of bad) assert.deepEqual(readReminderPreferences({databases: [path]}).databases, [], path);
  assert.deepEqual(readReminderPreferences({databases: ['Bases/想法 (2026).base', 'Bases/想法 (2026).base', 3, '数据/100%.base']}).databases,
    ['Bases/想法 (2026).base', '数据/100%.base']);
});

test('preferences default to startup reminders, preserve explicit opt-out, cap modules and copy inputs', () => {
  assert.deepEqual(readReminderPreferences(undefined), {openOnStartup: true, databases: []});
  assert.deepEqual(readReminderPreferences({openOnStartup: false, databases: null}), {openOnStartup: false, databases: []});
  const paths = Object.freeze(Array.from({length: 30}, (_, i) => `Bases/记录${i}.base`));
  const source = Object.freeze({openOnStartup: true, databases: paths});
  const read = readReminderPreferences(source);
  assert.deepEqual(read.databases, paths.slice(0, 24));
  read.databases.pop(); assert.equal(source.databases.length, 30);
});
