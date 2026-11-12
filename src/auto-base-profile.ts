import {tableProfile} from './table-profile';
import type {TableProfile} from './table-profile';

type BaseData = Record<string, unknown>;
export type BaseProfileEnhancement = {data: BaseData; changed: boolean};

function record(value: unknown): value is BaseData {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// Only these two generated link expressions are recognized. JSON parsing below
// decodes a quoted property name; no formula or user expression is evaluated.
const QUOTED = String.raw`("(?:[^"\\]|\\.)*")`;
const TITLE_ARGUMENT = String.raw`if\(\s*note\[\s*${QUOTED}\s*\]\s*,\s*note\[\s*${QUOTED}\s*\]\s*,\s*file\.name\s*\)`;
const TITLE_PATTERNS = [
  new RegExp(String.raw`^\s*file\.asLink\(\s*${TITLE_ARGUMENT}\s*\)\s*$`),
  new RegExp(String.raw`^\s*link\(\s*file\.path\s*,\s*${TITLE_ARGUMENT}\s*\)\s*$`),
];

function titleProperty(expression: unknown): string | null {
  if (typeof expression !== 'string' || expression.length > 16_384) return null;
  for (const pattern of TITLE_PATTERNS) {
    const match = pattern.exec(expression);
    if (!match) continue;
    try {
      const first: unknown = JSON.parse(match[1]), second: unknown = JSON.parse(match[2]);
      return typeof first === 'string' && first.trim() && first === second ? first : null;
    } catch {return null;}
  }
  return null;
}

function noteProperty(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  if (value.startsWith('note.')) return value.slice(5).trim() ? value.slice(5) : null;
  return /^(?:file|formula)\./.test(value) ? null : value;
}

function propertyList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(noteProperty).filter((name): name is string => name !== null))];
}

function profileFor(view: BaseData, formulas: BaseData): TableProfile | null {
  if (view.type !== 'table' || Object.hasOwn(view, 'nebulaTable') || !Array.isArray(view.order) ||
      !view.order.every(item => typeof item === 'string')) return null;
  const titles = [...new Set(view.order)].flatMap(column => {
    if (!column.startsWith('formula.')) return [];
    const formula = column.slice(8);
    if (!Object.hasOwn(formulas, formula)) return [];
    const property = titleProperty(formulas[formula]);
    return property === null ? [] : [{column, property}];
  });
  // Two plausible title columns are ambiguous. Do not guess which is editable.
  if (titles.length !== 1) return null;
  const title = titles[0];
  if (view.name === '想法收集箱' && title.column === 'formula.想法' && title.property === '这里写想法') {
    return tableProfile({name: '想法收集箱', nebulaRowMode: view.nebulaRowMode});
  }
  const tags = Object.create(null) as Record<string, 'single' | 'multi'>;
  for (const property of propertyList(view.tagProperties)) {
    Object.defineProperty(tags, property, {value: 'single', enumerable: true, writable: true, configurable: true});
  }
  return {
    titleProperty: title.property, titleColumn: title.column, tags,
    wrap: view.nebulaRowMode !== 'clip', attachments: propertyList(view.attachmentProperties),
    ...(typeof view.scopeNote === 'string' ? {scopeNote: view.scopeNote} : {}),
  };
}

/** Materialize explicitly identifiable native-table metadata without touching notes,
 * formulas, existing settings or unknown views. An existing profile is authoritative,
 * including malformed profiles, and must be repaired deliberately rather than replaced.
 */
export function enhanceBaseProfiles(parsed: unknown): BaseProfileEnhancement | null {
  if (!record(parsed) || !Array.isArray(parsed.views) || !parsed.views.every(record) ||
      (parsed.formulas !== undefined && !record(parsed.formulas))) return null;
  const formulas = record(parsed.formulas) ? parsed.formulas : {};
  let changed = false;
  const views = parsed.views.map(view => {
    const profile = profileFor(view, formulas);
    if (!profile) return view;
    changed = true;
    return {...view, nebulaTable: profile};
  });
  return {data: changed ? {...parsed, views} : parsed, changed};
}
