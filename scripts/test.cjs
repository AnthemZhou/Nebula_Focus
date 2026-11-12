#!/usr/bin/env node
// Keep npm test exhaustive; select a named area only when explicitly requested.
const {readdirSync} = require('node:fs');
const {resolve, basename} = require('node:path');
const {spawn} = require('node:child_process');

const root = resolve(__dirname, '..');
const files = readdirSync(resolve(root, 'tests')).filter(name => name.endsWith('.test.cjs')).sort();
const areas = {
  appearance: /^(reading|font-appearance|semantic-tags|shortcut-guide|auto-rows|table-render-sync)\./,
  tables: /^(idea-|auto-rows|semantic-tags|native-table-details|table-profile|table-options|table-render-sync|tag-drag-motion)/,
  history: /^(creation-|property-history|idea-title-editor|idea-tag-editor|mobile-actions)/,
  mobile: /^(mobile-|idea-title-editor|idea-header|idea-tag-|auto-rows|tag-drag-motion|reading|home-view|font-appearance|archive-controller|right-workspace)/,
  finance: /^(finance-|native-finance-summary|record-|home-summary)/,
  home: /^(home-|auto-base-|generated-base|note-source|config-id)/,
  data: /^(notion-backup|note-source|generated-base|auto-base-|record-|finance-model|finance-native|config-id)/,
  sidebar: /^(page-|external-archive|archive-controller|right-workspace|ribbon-controller)/,
  workspace: /^(right-workspace|home-controller|page-sidebar|ribbon-controller|reminder)/,
  reminders: /^reminder/,
  archive: /^(external-archive|archive-controller)/,
  packaging: /^package(?:-mobile-test)?\./,
};
const args = process.argv.slice(2), selected = new Set();
let verbose = false, list = false;
for (const arg of args) {
  if (arg === '--verbose') {verbose = true; continue;}
  if (arg === '--list') {list = true; continue;}
  if (arg === '--help' || arg === '-h') {
    console.log('Usage: npm test -- [area|test-file ...] [--list] [--verbose]\n' +
      'Areas: all, ' + Object.keys(areas).join(', ') + '\n' +
      'No selection runs every test. Multiple areas form a deduplicated union.\n' +
      'Examples: npm test -- mobile; npm test -- finance history; npm test -- idea-header');
    process.exit(0);
  }
  const exact = basename(arg).replace(/(?:\.test)?\.cjs$/, '') + '.test.cjs';
  const matches = arg === 'all' ? files : areas[arg] ? files.filter(name => areas[arg].test(name)) : files.includes(exact) ? [exact] : [];
  if (!matches.length) {console.error(`Unknown test area/file: ${arg}. Use npm test -- --help.`); process.exit(2);}
  for (const file of matches) selected.add(file);
}
if (!selected.size) for (const file of files) selected.add(file);
const chosen = [...selected].sort();
if (list) {console.log(chosen.join('\n')); process.exit(0);}
console.log(`Running ${chosen.length}/${files.length} test files${chosen.length === files.length ? ' (full suite)' : ' (focused; not full validation)'}.`);
const child = spawn(process.execPath, ['--test', `--test-reporter=${verbose ? 'spec' : resolve(__dirname, 'test-summary.cjs')}`,
  ...chosen.map(file => resolve(root, 'tests', file))], {cwd: root, stdio: 'inherit'});
child.once('error', error => {console.error(error.message); process.exitCode = 1;});
child.once('exit', (code, signal) => {
  if (signal) console.error(`Test process terminated by ${signal}.`);
  process.exitCode = code ?? 1;
});
