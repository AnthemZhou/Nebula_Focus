// All library structure lives in the .base file. Membership never changes a note.
type RecordValue = Record<string, unknown>;
const isRecord = (value: unknown): value is RecordValue =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const pathFilter = (path: string): string => `file.path == ${JSON.stringify(path)}`;
const membershipError = () => new Error('library-scope-changed');

export function newLibrary(tableName: string, cardsName: string): RecordValue {
  return {
    'nebula-focus': 1,
    filters: { and: ['file.ext == "md"', { or: ['false'] }] },
    views: [
      { type: 'table', name: tableName, order: ['file.name'] },
      { type: 'cards', name: cardsName, order: ['file.name'] },
    ],
  };
}

function memberGroup(config: unknown): { or: unknown[] } {
  if (!isRecord(config) || config['nebula-focus'] !== 1 || !isRecord(config.filters)) throw membershipError();
  const filters = config.filters.and;
  if (!Array.isArray(filters) || filters[0] !== 'file.ext == "md"' ||
      !isRecord(filters[1]) || Object.keys(filters[1]).length !== 1 || !Array.isArray(filters[1].or)) throw membershipError();
  return filters[1] as { or: unknown[] };
}

export function libraryMembers(config: unknown): string[] {
  const members: string[] = [];
  for (const filter of memberGroup(config).or) {
    if (filter === 'false') continue;
    if (typeof filter !== 'string' || !filter.startsWith('file.path == ')) throw membershipError();
    let path: unknown;
    try { path = JSON.parse(filter.slice('file.path == '.length)); } catch { throw membershipError(); }
    if (typeof path !== 'string' || !path.endsWith('.md') || pathFilter(path) !== filter) throw membershipError();
    members.push(path);
  }
  return [...new Set(members)];
}

export function updateMembers(config: unknown, added: string[], removed: string[]): void {
  const members = new Set(libraryMembers(config));
  for (const path of removed) members.delete(path);
  for (const path of added) {
    if (!path.endsWith('.md')) throw new Error('not-markdown');
    members.add(path);
  }
  memberGroup(config).or = members.size ? [...members].sort().map(pathFilter) : ['false'];
}

export function renameMembers(config: unknown, oldPath: string, newPath: string): boolean {
  const current = libraryMembers(config);
  const moved = current.filter(path => path === oldPath || path.startsWith(oldPath + '/'));
  if (!moved.length) return false;
  updateMembers(config, moved.map(path => newPath + path.slice(oldPath.length)).filter(path => path.endsWith('.md')), moved);
  return true;
}

export function addLibraryField(config: unknown, rawName: string): string {
  const name = rawName.trim();
  // Plain names stay interoperable with Obsidian's property editor.
  if (!name || name.length > 80 || /[.\n\r[\]#:"\\]/.test(name) ||
      ['__proto__', 'constructor', 'prototype'].includes(name)) throw new Error('invalid-field');
  libraryMembers(config); // Refuse to rewrite an unrecognized/externally changed library.
  if (!isRecord(config) || !Array.isArray(config.views) || !config.views.length) throw membershipError();
  const views = config.views;
  if (views.some(view => !isRecord(view) || (view.order !== undefined && !Array.isArray(view.order)))) throw membershipError();
  const property = `note.${name}`;
  for (const view of views as RecordValue[]) {
    const order = (view.order || ['file.name']) as unknown[];
    if (!order.includes(property) && !order.includes(name)) view.order = [...order, property];
  }
  return name;
}
