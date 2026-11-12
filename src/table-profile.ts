/** Opt-in editing and presentation metadata for a native Bases table. */
export type TableProfile = {
  titleColumn: string;
  titleProperty: string;
  tags: Record<string, 'single' | 'multi'>;
  wrap: boolean;
  scopeNote?: string;
  attachments: string[];
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function tagMap(): Record<string, 'single' | 'multi'> {
  return Object.create(null) as Record<string, 'single' | 'multi'>;
}
function hasGetter(value: Record<string, unknown>): value is Record<string, unknown> & {get(key: string): unknown} {
  return typeof value.get === 'function';
}

/** Accept either a native view/config or the equivalent parsed .base config.
 * An explicit invalid profile is never replaced with legacy defaults.
 */
export function tableProfile(viewOrConfig: unknown): TableProfile | null {
  try {
    if (!record(viewOrConfig)) return null;
    const config = record(viewOrConfig.config) ? viewOrConfig.config : viewOrConfig;
    const rowMode: unknown = hasGetter(config) ? config.get('nebulaRowMode') : config.nebulaRowMode;
    const wrapping = (fallback: boolean) => rowMode === 'wrap' ? true : rowMode === 'clip' ? false : fallback;
    const profile: unknown = hasGetter(config)
      ? config.get('nebulaTable') : config.nebulaTable;
    if (profile === undefined || profile === null) {
      if (config.name !== '想法收集箱') return null;
      return {
        titleColumn: 'formula.想法', titleProperty: '这里写想法',
        tags: Object.assign(tagMap(), {领域: 'multi', 类型: 'single', 重要性: 'single'}),
        wrap: wrapping(true), attachments: ['文件和媒体'],
      };
    }
    if (!record(profile) || !nonempty(profile.titleColumn) || !nonempty(profile.titleProperty) ||
        !record(profile.tags) || typeof profile.wrap !== 'boolean' ||
        !Array.isArray(profile.attachments) || !profile.attachments.every(nonempty) ||
        (profile.scopeNote !== undefined && typeof profile.scopeNote !== 'string')) return null;
    const tags = tagMap();
    for (const [property, kind] of Object.entries(profile.tags)) {
      if (!nonempty(property) || (kind !== 'single' && kind !== 'multi')) return null;
      Object.defineProperty(tags, property, {value: kind, enumerable: true, writable: true, configurable: true});
    }
    return {
      titleColumn: profile.titleColumn, titleProperty: profile.titleProperty,
      tags, wrap: wrapping(profile.wrap), attachments: [...profile.attachments],
      ...(profile.scopeNote === undefined ? {} : {scopeNote: profile.scopeNote}),
    };
  } catch {return null;}
}

/** Title interactions are independent of the richer table presentation profile.
 * A plain native file-name table must not gain inferred tags or custom row sizes. */
export type TableTitleProfile = {
  titleColumn: string;
  titleProperty: string;
  kind: 'property' | 'filename';
};

const TITLE_QUOTED = String.raw`("(?:[^"\\]|\\.)*")`;
const TITLE_NOTE = String.raw`note\[\s*${TITLE_QUOTED}\s*\]`;
const TITLE_ARGUMENT = String.raw`if\(\s*${TITLE_NOTE}\s*,\s*${TITLE_NOTE}\s*,\s*file\.name\s*\)`;
const TITLE_FALLBACKS = [
  new RegExp(String.raw`^\s*file\.asLink\(\s*${TITLE_ARGUMENT}\s*\)\s*$`),
  new RegExp(String.raw`^\s*link\(\s*file\.path\s*,\s*${TITLE_ARGUMENT}\s*\)\s*$`),
];
const TITLE_SOURCES = [
  new RegExp(String.raw`^\s*file\.asLink\(\s*${TITLE_NOTE}\s*\)\s*$`),
  new RegExp(String.raw`^\s*link\(\s*file\.path\s*,\s*${TITLE_NOTE}\s*\)\s*$`),
];

function formulaTitle(value: unknown): Pick<TableTitleProfile, 'kind' | 'titleProperty'> | null {
  const expression = typeof value === 'string' ? value : record(value) && typeof value.text === 'string' ? value.text : null;
  if (!expression || expression.length > 16_384) return null;
  if (/^\s*(?:file\.asLink\(\s*(?:file\.name\s*)?\)|link\(\s*file\.path\s*(?:,\s*file\.name\s*)?\))\s*$/.test(expression))
    return {kind: 'filename', titleProperty: ''};
  for (const pattern of [...TITLE_FALLBACKS, ...TITLE_SOURCES]) {
    const match = pattern.exec(expression);
    if (!match) continue;
    try {
      const name: unknown = JSON.parse(match[1]);
      if (!nonempty(name) || (match[2] !== undefined && JSON.parse(match[2]) !== name)) return null;
      return {kind: 'property', titleProperty: name};
    } catch {return null;}
  }
  return null;
}

/** Recognize only explicit title mappings, native file names and reversible
 * links to the current record. No expression evaluation or note writes occur. */
export function tableTitleProfiles(viewOrConfig: unknown): TableTitleProfile[] {
  try {
    if (!record(viewOrConfig)) return [];
    const config = record(viewOrConfig.config) ? viewOrConfig.config : viewOrConfig;
    const profile = tableProfile(viewOrConfig);
    const declared: unknown = hasGetter(config) ? config.get('nebulaTable') : config.nebulaTable;
    if (declared !== undefined && declared !== null && !profile) return [];
    const getOrder = config.getOrder;
    const data = record(viewOrConfig.data) ? viewOrConfig.data : undefined;
    const rawOrder: unknown = data?.properties ?? (typeof getOrder === 'function' ? getOrder.call(config) : config.order);
    const order = Array.isArray(rawOrder) && rawOrder.every(nonempty) ? rawOrder :
      rawOrder === undefined ? [profile?.titleColumn ?? 'file.name'] : [];
    const query = record(config.query) ? config.query : config;
    const formulas = record(query.formulas) ? query.formulas : {};
    const namedTitle: unknown = hasGetter(config) ? config.get('titleProperty') : config.titleProperty;
    const directProperty = nonempty(namedTitle) && !/^(?:file|formula)\./.test(namedTitle) ? namedTitle.replace(/^note\./, '') : null;
    const titles: TableTitleProfile[] = [];
    for (const column of [...new Set(order)]) {
      if (column === 'file.name' || column === 'file.file') {
        titles.push({titleColumn: column, titleProperty: '', kind: 'filename'}); continue;
      }
      if (profile?.titleColumn === column) {
        if (column.startsWith('note.') && column.slice(5) !== profile.titleProperty) continue;
        if (!column.startsWith('formula.') && !column.startsWith('note.')) continue;
        titles.push({titleColumn: column, titleProperty: profile.titleProperty, kind: 'property'}); continue;
      }
      if (directProperty && column === `note.${directProperty}`) {
        titles.push({titleColumn: column, titleProperty: directProperty, kind: 'property'}); continue;
      }
      if (!column.startsWith('formula.') || !Object.hasOwn(formulas, column.slice(8))) continue;
      const source = formulaTitle(formulas[column.slice(8)]);
      if (source) titles.push({titleColumn: column, ...source});
    }
    return titles;
  } catch {return [];}
}
