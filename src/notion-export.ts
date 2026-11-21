import {Notice, TFile, TFolder, type Plugin} from 'obsidian';

// Notion's Markdown & CSV export appends the page UUID to filenames. Plain
// Markdown with a similar-looking property paragraph is not an import target.
const exportName = /^(?:(.+) )?([\da-f]{32}|[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12})$/i;
function identity(stem: string) {
  const match = exportName.exec(stem);
  if (!match) return null;
  const hex = match[2].replace(/-/g, '').toLowerCase();
  const id = [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
  return {title: match[1], id};
}

/** Read quoted CSV including commas, CRLF, doubled quotes and embedded newlines. */
function* csvRows(input: string): Generator<string[]> {
  let row: string[] = [], field = '', quoted = false, closed = false;
  for (let i = input.charCodeAt(0) === 0xfeff ? 1 : 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch !== '"') field += ch;
      else if (input[i + 1] === '"') {field += '"'; i++;}
      else {quoted = false; closed = true;}
    } else if (ch === ',' || ch === '\r' || ch === '\n') {
      row.push(field); field = ''; closed = false;
      if (ch !== ',') {
        if (ch === '\r' && input[i + 1] === '\n') i++;
        yield row; row = [];
      }
    } else if (ch === '"' && !field && !closed) quoted = true;
    else {
      if (closed || ch === '"') throw Error('CSV 引号格式无效');
      field += ch;
    }
  }
  if (quoted) throw Error('CSV 缺少结束引号');
  if (row.length || field || closed) yield [...row, field];
}

type ExportTable = {id: string; columns: string[]; records: Map<string, string[] | null>};
export function readExportTable(id: string, csv: string): ExportTable {
  const rows = csvRows(csv), columns = rows.next().value as string[] | undefined;
  if (!columns?.length || columns.some(column => !column.trim()) || new Set(columns).size !== columns.length) throw Error('CSV 列名为空或重复');
  const records = new Map<string, string[] | null>();
  for (const row of rows) {
    if (row.length === 1 && !row[0]) continue;
    if (row.length !== columns.length) throw Error('CSV 行与表头列数不符');
    records.set(row[0], records.has(row[0]) ? null : row);
  }
  return {id, columns, records};
}

const reserved = /^(?:nf_|aliases$|cssclasses$|tags$|position$|__proto__$|constructor$|prototype$)/i;
export function recognizeNotionMarkdown(basename: string, source: string, table?: ExportTable): string | null {
  const page = identity(basename);
  const heading = /^(\uFEFF?)# ([^\r\n]+)(?:\r?\n|$)/.exec(source);
  if (!page || !heading) return null;
  const title = heading[2].trim();
  if (!title) return null;
  const fields = new Map<string, unknown>([['aliases', [title]], ['nf_source_id', page.id], ['nf_source_url', `https://www.notion.so/${page.id.replace(/-/g, '')}`]]);
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  let body = source.slice(heading[1].length);
  if (table) {
    fields.set('nf_source_collection', table.id);
    const row = table.records.get(title);
    if (row) {
      // Drop the export's duplicate property paragraph only if *every* line
      // exactly matches its CSV column and value. Preserve ambiguous prose,
      // multiline or differently formatted properties unchanged in Markdown.
      const afterHeading = source.slice(heading[0].length);
      const paragraph = /^(?:[ \t]*\r?\n)*([^\r\n]+(?:\r?\n(?![ \t]*(?:\r?\n|$))[^\r\n]+)*)(?=\r?\n|$)/.exec(afterHeading);
      const propertyLines = new Set(table.columns.flatMap((column, index) =>
        index && !reserved.test(column) ? [`${column}: ${row[index]}`.trimEnd()] : []));
      if (paragraph && paragraph[1].split(/\r?\n/).every(line => propertyLines.has(line.trimEnd()))) {
        for (const [index, column] of table.columns.entries()) {
          if (!reserved.test(column)) fields.set(column, row[index]);
        }
        body = heading[0].slice(heading[1].length) + afterHeading.slice(paragraph[0].length).replace(/^\r?\n/, '');
      }
    }
  }
  const properties = [...fields].map(([name, value]) => `${JSON.stringify(name)}: ${JSON.stringify(value)}`);
  return heading[1] + ['---', ...properties, '---', ''].join(newline) + body;
}

// Prefer the unfiltered _all export for the same database. Two databases
// whose display names collide can only be resolved by an exact folder UUID.
function databaseFor(folder: TFolder): {id: string; file: TFile} | undefined {
  const candidates = new Map<string, TFile>();
  const dir = identity(folder.name);
  for (const file of folder.parent?.children ?? []) {
    if (!(file instanceof TFile) || file.extension.toLowerCase() !== 'csv') continue;
    const name = identity(file.basename.replace(/_all$/, ''));
    if (!name || (dir ? dir.id !== name.id : folder.name !== name.title)) continue;
    if (!candidates.has(name.id) || file.basename.endsWith('_all')) candidates.set(name.id, file);
  }
  if (candidates.size !== 1) return;
  const [id, file] = [...candidates][0];
  return {id, file};
}

export function registerNotionExport(plugin: Plugin) {
  const {vault, workspace} = plugin.app;
  const run = async (files: TFile[]) => {
    let converted = 0;
    const failures: string[] = [];
    const tables = new Map<TFolder, Promise<ExportTable | undefined>>();
    for (const file of files) {
      if (!identity(file.basename) || !file.parent) continue;
      try {
        if (!tables.has(file.parent)) {
          const db = databaseFor(file.parent);
          tables.set(file.parent, db ? vault.read(db.file).then(csv => readExportTable(db.id, csv)) : Promise.resolve(undefined));
        }
        const table = await tables.get(file.parent);
        // Skip unchanged files without touching their mtimes, and use the
        // atomic transform to respect edits racing the first read.
        const snapshot = await vault.read(file), result = recognizeNotionMarkdown(file.basename, snapshot, table);
        if (!result) continue;
        await vault.process(file, latest => {
          if (latest !== snapshot) throw Error('笔记已更改');
          return result;
        });
        converted++;
      } catch (error) {
        failures.push(`${file.path} — ${error instanceof Error ? error.message : '读取或写入失败'}`);
      }
    }
    if (failures.length) console.warn('[Nebula Focus] Notion 导入未完成', failures);
    new Notice(`已识别 ${converted} 篇 Notion 导出笔记${failures.length ? `，${failures.length} 篇未处理\n${failures[0]}` : ''}`);
  };
  plugin.addCommand({id: 'recognize-notion-markdown', name: '识别当前 Notion 导出笔记', checkCallback(checking) {
    const file = workspace.getActiveFile();
    if (!file || file.extension !== 'md' || !identity(file.basename)) return false;
    if (!checking) void run([file]);
    return true;
  }});
  plugin.registerEvent(workspace.on('file-menu', (menu, folder) => {
    if (!(folder instanceof TFolder) || folder.isRoot()) return;
    const files = vault.getMarkdownFiles().filter(file => file.path.startsWith(`${folder.path}/`) && identity(file.basename));
    if (files.length) menu.addItem(item => item.setTitle('识别此文件夹的 Notion 导出笔记').setIcon('file-input').onClick(() => run(files)));
  }));
}
