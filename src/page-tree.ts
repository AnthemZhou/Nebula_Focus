/** A presentation-only tree: merging and reordering never move vault files. */
export interface TreeEntry {
  path: string;
  name: string;
  children?: TreeEntry[];
  extension?: string;
}

export interface PageNode {
  id: string;
  parent: string;
  title: string;
  filePath?: string;
  folderPath?: string;
  kind: 'page' | 'database' | 'canvas' | 'folder' | 'attachment';
  children: PageNode[];
}

export interface PageTreeSettings {
  expanded: string[];
  favorites: string[];
  order: Record<string, string[]>;
  sort: 'manual' | 'name';
  showAttachments: boolean;
}

const strings = (value: unknown): string[] => Array.isArray(value)
  ? [...new Set(value.filter((item): item is string => typeof item === 'string'))] : [];

export function readPageTreeSettings(value: unknown): PageTreeSettings {
  const raw = value && typeof value === 'object' ? value as Partial<PageTreeSettings> : {};
  return {
    expanded: strings(raw.expanded), favorites: strings(raw.favorites),
    order: Object.fromEntries(Object.entries(raw.order && typeof raw.order === 'object' ? raw.order : {})
      .filter(([, values]) => Array.isArray(values)).map(([key, values]) => [key, strings(values)])),
    sort: raw.sort === 'name' ? 'name' : 'manual', showAttachments: raw.showAttachments === true,
  };
}

function extension(entry: TreeEntry) {return (entry.extension ?? entry.name.split('.').pop() ?? '').toLowerCase();}
function stem(entry: TreeEntry) {return entry.name.slice(0, -(extension(entry).length + 1));}
const compare = new Intl.Collator('zh-CN', {numeric: true, sensitivity: 'base'});

export function buildPageTree(root: TreeEntry, settings: PageTreeSettings): PageNode[] {
  function visit(folder: TreeEntry, excluded?: TreeEntry): PageNode[] {
    const children = (folder.children ?? []).filter(entry => entry !== excluded && !entry.name.startsWith('.'));
    const notes = new Map(children.filter(entry => !entry.children && extension(entry) === 'md')
      .map(entry => [stem(entry), entry]));
    const consumed = new Set<TreeEntry>();
    const nodes: PageNode[] = [];
    for (const entry of children) {
      if (!entry.children) continue;
      const sibling = notes.get(entry.name);
      const inside = entry.children.find(child => !child.children && extension(child) === 'md' && stem(child) === entry.name);
      const page = sibling ?? inside;
      if (sibling) consumed.add(sibling);
      const descendants = visit(entry, page === inside ? inside : undefined);
      // Attachment-only directories stay accessible through “显示附件”.
      if (!page && !descendants.length && entry.children.length && !settings.showAttachments) continue;
      nodes.push({id: entry.path, parent: folder.path, title: entry.name, folderPath: entry.path,
        filePath: page?.path, kind: page ? 'page' : 'folder', children: descendants});
    }
    for (const entry of children) {
      if (entry.children || consumed.has(entry)) continue;
      const ext = extension(entry);
      const kind = ext === 'md' ? 'page' : ext === 'base' ? 'database' : ext === 'canvas' ? 'canvas' : 'attachment';
      if (kind === 'attachment' && !settings.showAttachments) continue;
      nodes.push({id: entry.path, parent: folder.path, title: kind === 'attachment' ? entry.name : stem(entry),
        filePath: entry.path, kind, children: []});
    }
    const saved = settings.sort === 'manual' ? settings.order[folder.path] ?? [] : [];
    const ranks = new Map(saved.map((id, index) => [id, index]));
    const rank = (node: PageNode) => ranks.get(node.id) ?? (node.filePath ? ranks.get(node.filePath) : undefined) ?? Infinity;
    return nodes.sort((a, b) => (rank(a) - rank(b) || compare.compare(a.title, b.title) || a.id.localeCompare(b.id)));
  }
  return visit(root);
}

export function flattenPages(nodes: PageNode[]): PageNode[] {
  return nodes.flatMap(node => [node, ...flattenPages(node.children)]);
}

export function filterPages(nodes: PageNode[], query: string): PageNode[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return nodes;
  return nodes.flatMap(node => {
    const children = filterPages(node.children, needle);
    const matched = node.title.toLocaleLowerCase().includes(needle);
    return matched || children.length ? [{...node, children: matched ? node.children : children}] : [];
  });
}

/** Return a complete sibling order; cross-folder drops must never move files. */
export function reorderPages(nodes: PageNode[], source: string, target: string, after: boolean): string[] | null {
  if (source === target || !nodes.some(node => node.id === source) || !nodes.some(node => node.id === target)) return null;
  if (new Set(nodes.map(node => node.parent)).size !== 1) return null;
  const ids = nodes.map(node => node.id).filter(id => id !== source);
  ids.splice(ids.indexOf(target) + (after ? 1 : 0), 0, source);
  return ids;
}

/** Preserve preferences for renamed files/folders, with a path-boundary check. */
export function remapPageSettings(settings: PageTreeSettings, oldPath: string, newPath: string): PageTreeSettings {
  const remap = (path: string) => path === oldPath ? newPath : path.startsWith(oldPath + '/') ? newPath + path.slice(oldPath.length) : path;
  return {...settings, expanded: settings.expanded.map(remap), favorites: settings.favorites.map(remap),
    order: Object.fromEntries(Object.entries(settings.order).map(([key, ids]) => [remap(key), ids.map(remap)]))};
}

export function validPageName(value: string): string | null {
  const name = value.trim().replace(/\.md$/i, '');
  const hasControlCharacter = [...name].some(character => character.charCodeAt(0) < 32);
  return !name || name.startsWith('.') || /[\\/:*?"<>|]/.test(name) || hasControlCharacter ? null : name;
}
