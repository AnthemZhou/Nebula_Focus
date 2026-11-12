import {tableProfile} from './table-profile';

/** Structural contracts for the small native Bases surfaces we decorate.
 * All entry points receive unknown; only recognized fields are used. Query
 * values and method results remain unknown until the consumer validates them.
 */
export function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}
/** Use the element's own realm, including popout windows and test documents. */
export function isHtmlElement(value: unknown): value is HTMLElement {
  try {
    if (!object(value) || !object(value.ownerDocument)) return false;
    const win = value.ownerDocument.defaultView;
    if (!object(win)) return false;
    const ctor = win.HTMLElement;
    return typeof ctor === 'function' && value instanceof ctor;
  } catch {return false;}
}
export type IdeaFile = {path: string; extension?: string; basename?: unknown};
export type IdeaEntry = {
  file: IdeaFile;
  getRawProperty?: (property: string) => unknown;
  getValue?: (property: string) => unknown;
};
export function isIdeaFile(value: unknown): value is IdeaFile {
  try {
    return object(value) && typeof value.path === 'string' &&
      (value.extension === undefined || typeof value.extension === 'string');
  } catch {return false;}
}
export function isIdeaEntry(value: unknown): value is IdeaEntry {
  try {
    return object(value) && isIdeaFile(value.file) &&
      (value.getRawProperty === undefined || typeof value.getRawProperty === 'function') &&
      (value.getValue === undefined || typeof value.getValue === 'function');
  } catch {return false;}
}
export type IdeaCell = {
  prop?: string; el?: HTMLElement; innerEl?: HTMLElement;
  renderer?: {entry?: IdeaEntry | null; el?: HTMLElement; propertyEditor?: unknown; val?: unknown} | null;
};
export function isIdeaCell(value: unknown): value is IdeaCell {
  try {
    if (!object(value) || (value.prop !== undefined && typeof value.prop !== 'string') ||
        (value.el !== undefined && !isHtmlElement(value.el)) ||
        (value.innerEl !== undefined && !isHtmlElement(value.innerEl))) return false;
    const renderer = value.renderer;
    return renderer == null || (object(renderer) &&
      (renderer.entry == null || isIdeaEntry(renderer.entry)) &&
      (renderer.el === undefined || isHtmlElement(renderer.el)));
  } catch {return false;}
}
export type IdeaRow = {entry?: IdeaEntry | null; cells?: IdeaCell[]};
export function isIdeaRow(value: unknown): value is IdeaRow {
  try {
    return object(value) && (value.entry == null || isIdeaEntry(value.entry)) &&
      (value.cells === undefined || (Array.isArray(value.cells) && value.cells.every(isIdeaCell)));
  } catch {return false;}
}
export type IdeaIndex = {groupIdx: number; row: number; column: number};
export function isIdeaIndex(value: unknown): value is IdeaIndex {
  try {
    return object(value) && ['groupIdx', 'row', 'column'].every(key => typeof value[key] === 'number');
  } catch {return false;}
}
export type IdeaPropertyConfig = {getDisplayName(): unknown; setDisplayName(value: string): unknown};
export function isIdeaPropertyConfig(value: unknown): value is IdeaPropertyConfig {
  try {
    return object(value) && typeof value.getDisplayName === 'function' && typeof value.setDisplayName === 'function';
  } catch {return false;}
}
export type IdeaConfig = {
  name: string; query?: unknown;
  get?: (key: string) => unknown;
  nebulaTable?: unknown;
  getPropertyConfig?: (property: string) => unknown;
  getOrder?: () => unknown;
};
export type IdeaView = {
  type: 'table'; config: IdeaConfig;
  _loaded?: unknown; isReadOnly?: unknown; readOnly?: unknown;
  containerEl?: HTMLElement; theadEl?: HTMLElement;
  queryController?: Record<string, unknown>;
  data?: Record<string, unknown>; rows?: IdeaRow[];
  getCellFromDom?: (target: Element) => unknown;
  getCellIndex?: (cell: unknown) => unknown;
  updateProperty?: (file: IdeaFile, property: string, value: unknown) => unknown;
  focus?: () => unknown;
  activeCell?: unknown; selection?: unknown;
};
export type IdeaViewMetadata = Omit<IdeaView, 'rows'> & {rows?: unknown};
export function isNativeTableViewMetadata(value: unknown): value is IdeaViewMetadata {
  try {
    if (!object(value) || value.type !== 'table' || !object(value.config) ||
        typeof value.config.name !== 'string') return false;
    if (value.containerEl !== undefined && !isHtmlElement(value.containerEl)) return false;
    if (value.theadEl !== undefined && !isHtmlElement(value.theadEl)) return false;
    if (value.queryController !== undefined && !object(value.queryController)) return false;
    if (value.data !== undefined && !object(value.data)) return false;
    for (const key of ['getCellFromDom', 'getCellIndex', 'updateProperty', 'focus'])
      if (value[key] !== undefined && typeof value[key] !== 'function') return false;
    for (const key of ['getPropertyConfig', 'getOrder', 'get'])
      if (value.config[key] !== undefined && typeof value.config[key] !== 'function') return false;
    return true;
  } catch {return false;}
}
export function isIdeaViewMetadata(value: unknown): value is IdeaViewMetadata {
  return isNativeTableViewMetadata(value) && !!tableProfile(value);
}
export function isNativeTableView(value: unknown): value is IdeaView {
  try {
    return isNativeTableViewMetadata(value) && (value.rows === undefined || (Array.isArray(value.rows) && value.rows.every(isIdeaRow)));
  } catch {return false;}
}
export function isIdeaView(value: unknown): value is IdeaView {
  return isNativeTableView(value) && !!tableProfile(value);
}
export type EditableIdeaView = IdeaView & {
  containerEl: HTMLElement;
  getCellFromDom(target: Element): unknown;
  updateProperty(file: IdeaFile, property: string, value: unknown): unknown;
};
export function isEditableIdeaView(value: unknown): value is EditableIdeaView {
  try {
    return isIdeaView(value) && isHtmlElement(value.containerEl) &&
      typeof value.getCellFromDom === 'function' && typeof value.updateProperty === 'function';
  } catch {return false;}
}
export type IdeaQuery = {saveFn(query: unknown): unknown; file?: unknown};
export function isIdeaQuery(value: unknown): value is IdeaQuery {
  try {
    return object(value) && typeof value.saveFn === 'function';
  } catch {return false;}
}

export function isIterable(value: unknown): value is Iterable<unknown> {
  try {
    return object(value) && Symbol.iterator in value && typeof value[Symbol.iterator] === 'function';
  } catch {return false;}
}
