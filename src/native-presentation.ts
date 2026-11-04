import type {TFile} from 'obsidian';

/** Only the native presentation surface used by this plugin. Undocumented
 * objects enter as unknown; a changed host shape keeps its native renderer. */
export type NativeCall = (this: unknown, ...args: unknown[]) => unknown;
export const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object';
export const callable = (value: unknown): value is NativeCall => typeof value === 'function';
export const unknownArray = (value: unknown): value is unknown[] => Array.isArray(value);
export function nativeElement(value: unknown): value is Element {
  try {
    if (!record(value) || !record(value.ownerDocument)) return false;
    const win = value.ownerDocument.defaultView;
    return record(win) && typeof win.Element === 'function' && value instanceof win.Element;
  } catch {return false;}
}
export function nativeHTMLElement(value: unknown): value is HTMLElement {
  try {
    if (!record(value) || !record(value.ownerDocument)) return false;
    const win = value.ownerDocument.defaultView;
    return record(win) && typeof win.HTMLElement === 'function' && value instanceof win.HTMLElement;
  } catch {return false;}
}
/** Native Values implement toString; unknown objects are never passed into
 * layout or date parsing without checking that conversion's result. */
function stringifier(value: object): NativeCall | undefined {
  const candidate: unknown = Reflect.get(value, 'toString');
  return callable(candidate) ? candidate : undefined;
}
export function nativeText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint' || typeof value === 'symbol') return String(value);
  if (!record(value)) return '';
  const convert = stringifier(value);
  if (!convert) return '';
  const text = convert.call(value);
  return typeof text === 'string' ? text : '';
}

export interface Entry {
  file: TFile;
  getValue(property: string): unknown;
}
export interface Group {key: unknown; entries: Entry[]}
export interface RenderedValue {
  data?: unknown;
  toString: () => unknown;
  renderTo?: (element: HTMLElement, context: unknown) => void;
}
export function renderedValue(value: unknown): value is RenderedValue {
  try {
    return record(value) && !!stringifier(value) &&
      (value.renderTo === undefined || callable(value.renderTo));
  } catch {return false;}
}
export interface PresentationView {
  type: 'cards' | 'kanban';
  _loaded?: boolean;
  isReadOnly?: boolean;
  containerEl: HTMLElement;
  queryController: {viewContainerEl: HTMLElement; view?: unknown; isReadOnly?: boolean};
  config: {
    getOrder(): unknown;
    getDisplayName(property: string): unknown;
    get(property: string): unknown;
    groupBy?: unknown;
  };
  data?: unknown;
  orderedGroups?: unknown;
  onDataUpdated: NativeCall;
  updateVirtualDisplay?: NativeCall;
  register(callback: () => void): void;
  moveCardToColumn?: (file: TFile, key: unknown) => unknown;
  canMoveCard?: (file: TFile) => unknown;
  moveColumn?: (group: Group, index: number) => unknown;
  createNoteInGroup?: (group: Group) => unknown;
}

export function presentationView(value: unknown): value is PresentationView {
  try {
    if (!record(value) || (value.type !== 'cards' && value.type !== 'kanban') ||
        !nativeHTMLElement(value.containerEl) || !record(value.queryController) ||
        !nativeHTMLElement(value.queryController.viewContainerEl) || !record(value.config) ||
        !['getOrder', 'getDisplayName', 'get'].every(key => callable(value.config && record(value.config) ? value.config[key] : undefined)) ||
        !callable(value.onDataUpdated) || !callable(value.register)) return false;
    return value.type !== 'kanban' || (callable(value.moveCardToColumn) && callable(value.canMoveCard));
  } catch {return false;}
}

export function groupsValid(value: unknown): value is Group[] {
  try {
    return unknownArray(value) && value.every(group => record(group) && unknownArray(group.entries) &&
      group.entries.every(entry => record(entry) && record(entry.file) &&
        typeof entry.file.path === 'string' && typeof entry.file.basename === 'string' &&
        record(entry.file.stat) && typeof entry.file.stat.mtime === 'number' && callable(entry.getValue)));
  } catch {return false;}
}

export function nativeAppField(app: unknown, field: string): unknown {
  return record(app) ? app[field] : undefined;
}

export type DisplayProperty = {id: string; label: string};
/** Snapshot native column configuration once per render. Method presence does
 * not establish its result type; unknown host results retain native rendering.
 */
export function displayProperties(config: PresentationView['config']): DisplayProperty[] | null {
  try {
    const order = config.getOrder();
    if (!unknownArray(order) || !order.every((property): property is string => typeof property === 'string')) return null;
    const properties: DisplayProperty[] = [];
    for (const id of order) {
      const label = config.getDisplayName(id);
      if (typeof label !== 'string') return null;
      properties.push({id, label});
    }
    return properties;
  } catch {return null;}
}
