type BaseData = Record<string, unknown>;
export type FinanceBaseConversion = {data: BaseData; changed: boolean};

const DEFAULT_ORDER = ['note.交易日期', 'note.流水摘要', 'note.金额', 'note.币种', 'note.方向', 'note.关联项目'];

function record(value: unknown): value is BaseData {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Bases accepts both bare note names and canonical property IDs in saved views. */
function noteProperty(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  if (value.startsWith('note.')) return value.slice(5) || null;
  return value.startsWith('file.') || value.startsWith('formula.') ? null : value;
}

function propertyList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(noteProperty).filter((name): name is string => name !== null))];
}

function canonicalProperty(value: string): string {
  return /^(?:note|file|formula)\./.test(value) ? value : `note.${value}`;
}

function ownSet(target: BaseData, key: string, value: unknown): void {
  Object.defineProperty(target, key, {value, enumerable: true, writable: true, configurable: true});
}

/** Convert a legacy finance layout without changing note contents or unrelated views.
 * Unknown settings are retained so old configuration remains recoverable. A malformed
 * document is rejected as a whole rather than partially rewriting its schema.
 */
export function convertFinanceBase(parsed: unknown): FinanceBaseConversion | null {
  if (!record(parsed) || !Array.isArray(parsed.views) || !parsed.views.every(record)) return null;
  const legacy = parsed.views.filter(view => view.type === 'nebula-finance');
  if (!legacy.length) return {data: parsed, changed: false};
  if ((parsed.formulas !== undefined && !record(parsed.formulas)) ||
      (parsed.properties !== undefined && !record(parsed.properties))) return null;
  if (legacy.some(view => noteProperty(view.titleProperty ?? 'note.流水摘要') === null ||
      (view.order !== undefined && (!Array.isArray(view.order) || !view.order.every(item => typeof item === 'string'))) ||
      (view.columnSize !== undefined && !record(view.columnSize)) ||
      (view.columnWidths !== undefined && !record(view.columnWidths)) ||
      (view.nebulaTable !== undefined && !record(view.nebulaTable)))) return null;

  const formulas: BaseData = {...(record(parsed.formulas) ? parsed.formulas : {})};
  const properties: BaseData = {...(record(parsed.properties) ? parsed.properties : {})};
  const views = parsed.views.map(view => {
    if (view.type !== 'nebula-finance') return view;
    const titleProperty = noteProperty(view.titleProperty ?? 'note.流水摘要')!;
    const quotedProperty = JSON.stringify(titleProperty);
    const expression = `link(file.path, if(note[${quotedProperty}], note[${quotedProperty}], file.name))`;
    const stem = `Nebula标题_${titleProperty}`;
    let formulaName = stem;
    let suffix = 2;
    while (Object.hasOwn(formulas, formulaName) && formulas[formulaName] !== expression) {
      formulaName = `${stem}_${suffix++}`;
    }
    ownSet(formulas, formulaName, expression);
    const titleColumn = `formula.${formulaName}`;
    const sourceProperty = properties[`note.${titleProperty}`] ?? properties[titleProperty];
    const displayName = record(sourceProperty) && typeof sourceProperty.displayName === 'string'
      ? sourceProperty.displayName : titleProperty;
    const existingProperty = properties[titleColumn];
    // A reused formula can have a custom display name; retain it if present.
    ownSet(properties, titleColumn, {
      displayName, ...(record(existingProperty) ? existingProperty : {}),
    });
    const remapTitle = (id: string): string => noteProperty(id) === titleProperty ? titleColumn : id;
    const order = Array.isArray(view.order) && view.order.length ? view.order as string[] : DEFAULT_ORDER;
    const columnSize: BaseData = {};
    // Existing native widths win over legacy widths, including title aliases.
    const existingWidths = record(view.columnSize) ? view.columnSize : {};
    for (const [id, width] of Object.entries(existingWidths)) {
      const mapped = remapTitle(canonicalProperty(id));
      if (!Object.hasOwn(columnSize, mapped) || id === mapped) ownSet(columnSize, mapped, width);
    }
    if (record(view.columnWidths)) {
      for (const [id, width] of Object.entries(view.columnWidths)) {
        const mapped = remapTitle(canonicalProperty(id));
        if (!Object.hasOwn(columnSize, mapped) && typeof width === 'number' && Number.isFinite(width)) {
          ownSet(columnSize, mapped, Math.round(Math.max(64, Math.min(960, width))));
        }
      }
    }
    const previousProfile = record(view.nebulaTable) ? view.nebulaTable : {};
    const tags: BaseData = {};
    for (const name of propertyList(view.tagProperties)) ownSet(tags, name, 'single');
    // Preserve explicit multi-select metadata when it was already configured.
    if (record(previousProfile.tags)) {
      for (const [name, kind] of Object.entries(previousProfile.tags)) {
        if (kind === 'single' || kind === 'multi') ownSet(tags, name, kind);
      }
    }
    return {
      ...view,
      type: 'table',
      order: order.map(remapTitle),
      ...(Object.keys(columnSize).length ? {columnSize} : {}),
      nebulaTable: {
        ...previousProfile,
        titleProperty, titleColumn, tags, wrap: true,
        attachments: propertyList(view.attachmentProperties),
        ...(typeof view.scopeNote === 'string' ? {scopeNote: view.scopeNote} : {}),
      },
    };
  });
  return {data: {...parsed, formulas, properties, views}, changed: true};
}
