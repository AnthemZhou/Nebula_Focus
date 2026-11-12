export type GeneratedBaseSource = {path: string; basename: string};
export type GeneratedBaseRecord = {path: string; properties: Record<string, unknown>};

const FIELD_LIMIT = 32;
const AUXILIARY_FIELDS = new Set(['position', 'notion_id', 'source_id', 'cssclass', 'cssclasses', 'aliases']);

function ordinaryField(name: string): boolean {
  const lower = name.toLowerCase();
  return !!name.trim() && !lower.startsWith('nf_') && !AUXILIARY_FIELDS.has(lower);
}

function parentFolder(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? '' : path.slice(0, slash);
}

function titlePriority(name: string): number {
  if (name.toLowerCase() === 'title') return 0;
  if (name === '标题') return 1;
  if (name === '名称') return 2;
  return 3;
}

function isTitleField(name: string, records: GeneratedBaseRecord[]): boolean {
  let hasString = false;
  for (const record of records) {
    const value = Object.hasOwn(record.properties, name) ? record.properties[name] : undefined;
    if (value == null) continue;
    if (typeof value !== 'string') return false;
    hasString = true;
  }
  return hasString;
}

function hasStandardTags(records: GeneratedBaseRecord[]): boolean {
  let hasArray = false;
  for (const record of records) {
    const value = Object.hasOwn(record.properties, 'tags') ? record.properties.tags : undefined;
    if (value == null || value === '') continue;
    if (!Array.isArray(value) || !value.every(item => typeof item === 'string' &&
      !item.includes('[') && !item.includes(']') && !/[\r\n]/.test(item) && !/^[a-z][a-z\d+.-]*:/i.test(item))) return false;
    hasArray = true;
  }
  return hasArray;
}

/** Generate a native view configuration only. The caller owns persistence;
 * this function never invents note properties or writes to the Markdown source.
 * At most 32 observed user properties become default visible columns; hidden
 * properties remain available through native Bases property selection.
 */
export function generateBaseForNote(source: GeneratedBaseSource, records: GeneratedBaseRecord[], folder?: string): Record<string, unknown> {
  const members = records.filter(record => folder === undefined ? record.path === source.path
    : record.path.endsWith('.md') && parentFolder(record.path) === folder)
    .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const visible: string[] = [];
  const candidates = new Set<string>();
  for (const record of members) {
    for (const name of Object.keys(record.properties)) {
      if (!ordinaryField(name)) continue;
      if (titlePriority(name) < 3) candidates.add(name);
      if (visible.length < FIELD_LIMIT && !visible.includes(name)) visible.push(name);
    }
  }
  const titleProperty = [...candidates].sort((a, b) => titlePriority(a) - titlePriority(b) || (a < b ? -1 : a > b ? 1 : 0))
    .find(name => isTitleField(name, members));
  // Frontmatter keys are literal names: a key named "note.foo" is represented
  // by "note.note.foo" in Bases, never silently rewritten into a different key.
  const fields = titleProperty ? [titleProperty, ...visible.filter(name => name !== titleProperty)].slice(0, FIELD_LIMIT) : visible;
  const order = ['file.name', ...fields.map(name => `note.${name}`)];
  const view: Record<string, unknown> = {type: 'table', name: source.basename || '表格', order,
    columnSize: Object.fromEntries(order.map((property, index) => [property, index === 0 ? 320 : 180]))};
  if (folder === undefined) view.nebulaAllowCreate = false;
  const data: Record<string, unknown> = {
    nebulaSource: {version: 1, path: source.path, scope: folder === undefined ? 'self' : 'folder',
      ...(folder === undefined ? {} : {folder})},
    filters: {and: folder === undefined ? [`file.path == ${JSON.stringify(source.path)}`]
      : [`file.folder == ${JSON.stringify(folder)}`, 'file.ext == "md"']},
    views: [view],
  };
  if (titleProperty) {
    const formulaName = `Nebula标题_${titleProperty}`;
    const titleColumn = `formula.${formulaName}`;
    const quoted = JSON.stringify(titleProperty);
    data.formulas = {[formulaName]: `link(file.path, if(note[${quoted}], note[${quoted}], file.name))`};
    data.properties = {[titleColumn]: {displayName: titleProperty}};
    view.order = [titleColumn, ...fields.filter(name => name !== titleProperty).map(name => `note.${name}`)];
    view.columnSize = Object.fromEntries((view.order as string[]).map((property, index) => [property, index === 0 ? 320 : 180]));
    view.nebulaTable = {
      titleProperty, titleColumn, tags: fields.includes('tags') && hasStandardTags(members) ? {tags: 'multi'} : {},
      wrap: true, attachments: [],
    };
  }
  return data;
}
