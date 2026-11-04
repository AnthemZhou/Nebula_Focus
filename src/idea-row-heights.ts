import {supportsIdeaTagCell} from './idea-tag-support';

/** Content-sized native Bases rows. Native row/cell objects and editors remain
 * intact; rendering, selection and hit testing use the same vertical index.
 * No database configuration or note content is written.
 */
import {IdeaFile, IdeaCell, IdeaView, isIdeaView, isIdeaFile, isIdeaCell, isHtmlElement, object} from './idea-native';
type LayoutEntry = {file: IdeaFile; getValue(property: string): unknown; getRawProperty?: (property: string) => unknown};
type LayoutCell = IdeaCell & {el: HTMLElement};
type LayoutRow = {
  entry?: LayoutEntry | null; el: HTMLElement; cells: LayoutCell[];
  render(entry: LayoutEntry, properties: string[]): unknown;
  virtualize(widths: number[], start: number, end: number): unknown;
};
type LayoutGroup = {tableEl: HTMLElement; tbodyEl: HTMLElement; selfHeight?: number; childStart?: number;
  virtualize(width: number, widths: number[], start: number, end: number): unknown};
type GroupData = {entries: LayoutEntry[]};
type ColumnInfo = {customWidth?: number | null; contentWidth?: number | null; headerWidth?: number | null; getWidth(min: number, max: number): number};
type Selection = {groupIdx: number; top: number; bottom: number; start: number; end: number};
type ScrollPosition = {top: number; left: number};
type LayoutView = IdeaView & {
  containerEl: HTMLElement; scrollEl: HTMLElement; theadEl: HTMLElement; activeCellEl: HTMLElement; selectionEl: HTMLElement;
  rows: LayoutRow[]; unusedRows: LayoutRow[]; groups: LayoutGroup[];
  data: {properties: string[]; data: LayoutEntry[]; groupedData: GroupData[]};
  columnInfo: Record<string, ColumnInfo>; minColWidth: number; maxColWidth: number;
  header: {cells: (LayoutCell & {prop: string; innerEl: HTMLElement})[]; virtualize(widths: number[], start: number, end: number): unknown};
  footerSummary: {el?: HTMLElement; shouldDisplay(): boolean; virtualize(widths: number[], start: number, end: number): unknown};
  activeCell?: Index | null; selection?: Selection | null;
  lastViewport?: Rect; pendingScroll?: ScrollPosition | null; lastScroll?: ScrollPosition;
  updateVirtualDisplay(): unknown;
  getCellRect(index: Index): Rect;
  getClosestCellIndexWithinGroup(event: MouseEvent, group: number): Index;
  getRowBaseHeight(): number; getRowHeightMult(): number; isGroupCollapsed(group: GroupData): boolean;
};
function layoutEntry(value: unknown): value is LayoutEntry {
  return object(value) && isIdeaFile(value.file) && typeof value.getValue === 'function' &&
    (value.getRawProperty === undefined || typeof value.getRawProperty === 'function');
}
function layoutRow(value: unknown): value is LayoutRow {
  return object(value) && isHtmlElement(value.el) && Array.isArray(value.cells) &&
    value.cells.every(cell => isIdeaCell(cell) && isHtmlElement(cell.el)) &&
    (value.entry == null || layoutEntry(value.entry)) &&
    typeof value.render === 'function' && typeof value.virtualize === 'function';
}
function groupData(value: unknown): value is GroupData {
  return object(value) && Array.isArray(value.entries) && value.entries.every(layoutEntry);
}
function numberFields(value: unknown, keys: string[]): boolean {
  return object(value) && keys.every(key => typeof value[key] === 'number');
}
function layoutView(value: unknown): value is LayoutView {
  if (!object(value)) return false;
  const raw = value;
  if (!isIdeaView(value)) return false;
  for (const key of ['containerEl', 'scrollEl', 'theadEl', 'activeCellEl', 'selectionEl']) if (!isHtmlElement(raw[key])) return false;
  for (const key of ['updateVirtualDisplay', 'getCellRect', 'getClosestCellIndexWithinGroup', 'getRowBaseHeight', 'getRowHeightMult', 'isGroupCollapsed'])
    if (typeof raw[key] !== 'function') return false;
  if (!Array.isArray(raw.rows) || !raw.rows.every(layoutRow) || !Array.isArray(raw.unusedRows) || !raw.unusedRows.every(layoutRow)) return false;
  if (!Array.isArray(raw.groups) || !raw.groups.every(group => object(group) && isHtmlElement(group.tableEl) &&
      isHtmlElement(group.tbodyEl) && typeof group.virtualize === 'function' &&
      (group.selfHeight === undefined || typeof group.selfHeight === 'number') &&
      (group.childStart === undefined || typeof group.childStart === 'number'))) return false;
  const data = raw.data, header = raw.header, footer = raw.footerSummary;
  if (!object(data) || !Array.isArray(data.properties) || !data.properties.every(p => typeof p === 'string') ||
      !Array.isArray(data.data) || !data.data.every(layoutEntry) || !Array.isArray(data.groupedData) || !data.groupedData.every(groupData)) return false;
  if (!object(header) || typeof header.virtualize !== 'function' || !Array.isArray(header.cells) || !header.cells.every(cell =>
      isIdeaCell(cell) && typeof cell.prop === 'string' && isHtmlElement(cell.el) && isHtmlElement(cell.innerEl))) return false;
  if (!object(footer) || typeof footer.shouldDisplay !== 'function' || typeof footer.virtualize !== 'function' ||
      (footer.el !== undefined && !isHtmlElement(footer.el))) return false;
  if (!object(raw.columnInfo) || !Object.values(raw.columnInfo).every(info => object(info) && typeof info.getWidth === 'function' &&
      ['customWidth', 'contentWidth', 'headerWidth'].every(key => info[key] == null || typeof info[key] === 'number'))) return false;
  if (raw.activeCell != null && !numberFields(raw.activeCell, ['groupIdx', 'row', 'column'])) return false;
  if (raw.selection != null && !numberFields(raw.selection, ['groupIdx', 'top', 'bottom', 'start', 'end'])) return false;
  if (raw.pendingScroll != null && !numberFields(raw.pendingScroll, ['top', 'left'])) return false;
  return true;
}
function rowFactory(row: LayoutRow): ((view: LayoutView) => LayoutRow) | null {
  const prototype: unknown = Object.getPrototypeOf(row);
  const Constructor: unknown = object(prototype) ? prototype.constructor : undefined;
  if (typeof Constructor !== 'function') return null;
  return view => {
    const created: unknown = Reflect.construct(Constructor, [view]);
    if (!layoutRow(created)) throw new Error('Unsupported native row constructor');
    return created;
  };
}

type Index = {groupIdx: number; row: number; column: number};
type Rect = {left: number; right: number; top: number; bottom: number};
type Patch = {name: 'updateVirtualDisplay' | 'getCellRect' | 'getClosestCellIndexWithinGroup'; original: unknown; wrapper: unknown; descriptor?: PropertyDescriptor};
type GroupLayout = {offsets: number[]; top: number; bodyTop: number; collapsed: boolean};
type State = {
  view: LayoutView; host: HTMLElement; patches: Patch[]; createRow: (view: LayoutView) => LayoutRow; measureRow: LayoutRow;
  originalUpdate: LayoutView['updateVirtualDisplay']; originalRect: LayoutView['getCellRect']; originalClosest: LayoutView['getClosestCellIndexWithinGroup'];
  heights: Map<IdeaFile, {key: string; height: number}>; groups: GroupLayout[];
  widths: number[]; width: number; busy: boolean; frame: number; observer: MutationObserver;
  resize: ResizeObserver; onInput: EventListener; onKey: EventListener; signature: string; autoWidthKey: string;
  resizing: boolean; resizeKind: 'pointer' | 'drag' | null; onResizeStart: EventListener; onResizeEnd: EventListener; epoch: number;
  perf: {resizeStarts: number; resizeEnds: number; dragStarts: number; ignoredPointerCancels: number; lastResizeEnd: string; layouts: number; previewLayouts: number; measurementBatches: number; measuredRows: number; lastLayoutMs: number; maxPreviewLayoutMs: number; lastMeasureMs: number};
};
const px = (value: string) => Number.parseFloat(value) || 0;

export function heightOffsets(heights: number[]): number[] {
  const offsets = [0];
  for (const height of heights) offsets.push(offsets[offsets.length - 1] + Math.max(1, height));
  return offsets;
}
/** Boundaries belong to the next row. */
export function rowIndexAt(offsets: number[], y: number): number {
  let low = 0, high = Math.max(0, offsets.length - 2);
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (offsets[middle + 1] <= y) low = middle + 1;
    else high = middle;
  }
  return low;
}
export function visibleRowRange(offsets: number[], top: number, bottom: number): [number, number] {
  const count = offsets.length - 1;
  if (!count || bottom <= 0 || top >= offsets[count]) return [0, 0];
  return [rowIndexAt(offsets, Math.max(0, top)), Math.min(count, rowIndexAt(offsets, bottom) + 1)];
}
/** Match native Bases' nearest-scroll behavior, including oversized cells. */
export function nearestScroll(current: number, start: number, end: number, viewportSize: number, maximum: number): number {
  if (start >= current && end <= current + viewportSize) return current;
  const nearStart = start, nearEnd = end - viewportSize;
  return Math.max(0, Math.min(maximum, Math.abs(nearStart - current) <= Math.abs(nearEnd - current) ? nearStart : nearEnd));
}
function styles(el: HTMLElement, values: Record<string, string>) {
  for (const [name, value] of Object.entries(values)) if (el.style.getPropertyValue(name) !== value) el.style.setProperty(name, value);
}
function children(el: HTMLElement, values: HTMLElement[]) {
  el.setChildrenInPlace(values);
}
function viewport(el: HTMLElement): Rect {
  const win = el.ownerDocument.defaultView!;
  const rect = el.getBoundingClientRect();
  let left = 0, top = 0, right = win.innerWidth, bottom = win.innerHeight;
  for (let parent = el.parentElement; parent; parent = parent.parentElement) {
    const css = win.getComputedStyle(parent), bounds = parent.getBoundingClientRect();
    if (/(auto|scroll|hidden|clip)/.test(css.overflowX)) {left = Math.max(left, bounds.left); right = Math.min(right, bounds.right);}
    if (/(auto|scroll|hidden|clip)/.test(css.overflowY)) {top = Math.max(top, bounds.top); bottom = Math.min(bottom, bounds.bottom);}
  }
  const scale = rect.width / el.offsetWidth || 1;
  return {left: (left - rect.left) / scale, right: (right - rect.left) / scale,
    top: (top - rect.top) / scale, bottom: (bottom - rect.top) / scale};
}
function valueKey(entry: LayoutEntry, properties: string[]): string {
  return JSON.stringify(properties.map(property => {
    try {
      if (property.startsWith('note.') && typeof entry.getRawProperty === 'function') return entry.getRawProperty(property.slice(5));
      const value = entry.getValue(property);
      if (value == null) return '';
      if (object(value) && typeof value.toString === 'function') return (value.toString as () => unknown).call(value);
      return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : '';
    } catch {return '';}
  }));
}

export class IdeaRowHeights {
  private states = new Map<unknown, State>();
  private failed = new WeakSet<object>();
  constructor(private afterRender?: (view: unknown) => void) {}

  /** Attach after presentation classes and column-width clamps. True requests
   * one updateVirtualDisplay call; unchanged periodic scans return false.
   */
  refresh(view: unknown): boolean {
    if (!isIdeaView(view)) return this.release(view);
    const host = view.queryController?.viewContainerEl;
    if (!isHtmlElement(host)) return this.release(view);
    if (view?.type !== 'table' || view.config?.name !== '想法收集箱' || !host?.isConnected || view._loaded === false) return this.release(view);
    if (this.failed.has(view)) return false;
    const current = this.states.get(view);
    if (current) {
      if (current.resizing) return false;
      const next = this.signature(current);
      if (next !== current.signature) {current.signature = next; current.epoch++; return true;}
      return false;
    }
    if (!layoutView(view)) return false;
    const row = view.rows[0] ?? view.unusedRows[0];
    if (!host.getBoundingClientRect().width || !row || !Array.isArray(view.data?.groupedData) ||
        !view.header?.virtualize || !view.footerSummary?.virtualize || !row.virtualize ||
        !['updateVirtualDisplay', 'getCellRect', 'getClosestCellIndexWithinGroup'].every(name => typeof Reflect.get(view, name) === 'function')) return false;
    const createRow = rowFactory(row); if (!createRow) return false;
    let measureRow: LayoutRow;
    try {measureRow = createRow(view);} catch {return false;}
    const win = host.ownerDocument.defaultView!;
    const state: State = {view, host, patches: [], createRow, measureRow,
      originalUpdate: view.updateVirtualDisplay.bind(view), originalRect: view.getCellRect.bind(view), originalClosest: view.getClosestCellIndexWithinGroup.bind(view),
      heights: new Map(), groups: [], widths: [], width: 0, busy: false, frame: 0,
      observer: new win.MutationObserver(records => {
        if (records.some(record => record.type !== 'attributes' || record.oldValue !== (record.target as Element).getAttribute(record.attributeName!))) this.schedule(state, true);
      }),
      resize: new win.ResizeObserver(() => {
        if (state.resizing) return;
        const next = this.signature(state);
        if (next !== state.signature) {state.signature = next; this.schedule(state, true);}
      }), onInput: () => this.schedule(state, true), onKey: event => this.pageKey(state, event as KeyboardEvent), signature: '', autoWidthKey: '',
      resizing: false, resizeKind: null, epoch: 0, onResizeStart: event => this.beginResize(state, event), onResizeEnd: event => this.resizeEndEvent(state, event),
      perf: {resizeStarts: 0, resizeEnds: 0, dragStarts: 0, ignoredPointerCancels: 0, lastResizeEnd: '', layouts: 0, previewLayouts: 0, measurementBatches: 0, measuredRows: 0, lastLayoutMs: 0, maxPreviewLayoutMs: 0, lastMeasureMs: 0}};
    for (const name of ['updateVirtualDisplay', 'getCellRect', 'getClosestCellIndexWithinGroup'] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(view, name);
      if (descriptor && !descriptor.configurable && !descriptor.writable) {this.restore(state); return false;}
      const original: unknown = Reflect.get(view, name);
      const wrapper = name === 'updateVirtualDisplay' ? () => this.update(state) : name === 'getCellRect'
        ? (index: Index) => this.cellRect(state, index) : (event: MouseEvent, group: number) => this.closest(state, event, group);
      state.patches.push({name, original, wrapper, descriptor});
      if (!Reflect.set(view, name, wrapper)) {this.restore(state); return false;}
    }
    this.states.set(view, state);
    state.signature = this.signature(state);
    state.resize.observe(host);
    view.containerEl.addEventListener('input', state.onInput, true);
    view.containerEl.addEventListener('keydown', state.onKey, true);
    for (const type of ['pointerdown', 'dragstart']) view.theadEl.addEventListener(type, state.onResizeStart, true);
    for (const type of ['pointerup', 'pointercancel', 'drop', 'dragend', 'blur']) win.addEventListener(type, state.onResizeEnd, true);
    host.classList.add('bui-ideas-auto');
    this.observe(state);
    return true;
  }
  private signature(state: State): string {
    const {view, host} = state, win = host.ownerDocument.defaultView!;
    const target = view.rows?.[0]?.el?.querySelector('.bases-table-cell') ?? host;
    const css = win.getComputedStyle(target);
    return [host.clientWidth, css.font, css.lineHeight, css.letterSpacing, host.ownerDocument.body.className].join('|');
  }
  private observe(state: State) {
    state.observer.observe(state.view.containerEl, {subtree: true, childList: true, characterData: true,
      attributes: true, attributeOldValue: true, attributeFilter: ['class', 'style']});
  }
  private schedule(state: State, dirty = false) {
    if (!this.states.has(state.view)) return;
    if (dirty) state.epoch++;
    if (!state.frame) state.frame = state.host.ownerDocument.defaultView!.requestAnimationFrame(() => {
      state.frame = 0; this.update(state);
    });
  }
  private beginResize(state: State, event: Event) {
    const target = event.target as Element | null;
    if (!target?.closest('.bases-table-header-resizer') || !state.view.theadEl.contains(target)) return;
    if (event.type === 'pointerdown' && (event as MouseEvent).button !== 0) return;
    if (!state.resizing) {state.perf.maxPreviewLayoutMs = 0; state.perf.resizeStarts++;}
    if (event.type === 'dragstart') state.perf.dragStarts++;
    state.resizeKind = event.type === 'dragstart' ? 'drag' : 'pointer';
    state.resizing = true;
    state.host.classList.add('bui-ideas-resizing');
  }
  private resizeEndEvent(state: State, event: Event) {
    const win = state.host.ownerDocument.defaultView!;
    if (event.type === 'blur' && event.target !== win) return;
    // HTML drag-and-drop suppresses the pointer stream with pointercancel just
    // after dragstart. That transfer is not the end of the native column drag.
    if (state.resizeKind === 'drag' && (event.type === 'pointercancel' || event.type === 'pointerup')) {
      if (event.type === 'pointercancel') state.perf.ignoredPointerCancels++;
      return;
    }
    if (state.resizing) state.perf.lastResizeEnd = event.type;
    this.endResize(state);
  }
  private endResize(state: State) {
    if (!state.resizing) return;
    state.resizing = false; state.resizeKind = null; state.perf.resizeEnds++;
    state.host.classList.remove('bui-ideas-resizing');
    // A native drag cancel can restore customWidth later in the same event.
    // Measure in the next frame, after its final width/config update completes.
    this.schedule(state);
  }
  isResizing(): boolean {return [...this.states.values()].some(state => state.resizing);}
  /** Local diagnostics for regression checks; no logging, persistence or telemetry. */
  stats() {return [...this.states.values()].map(state => ({name: state.view.config.name, resizing: state.resizing, resizeKind: state.resizeKind, ...state.perf}));}
  private measurementKey(state: State, entry: LayoutEntry, key: string): string {
    const active = state.host.ownerDocument.activeElement as HTMLElement | null;
    const live = active && state.view.rows.find((row: LayoutRow) => row.entry?.file === entry.file && row.el.contains(active));
    return `${key}|${valueKey(entry, state.view.data.properties)}${live ? `|editing:${active?.textContent}:${active?.className}:${active?.style.cssText}` : ''}`;
  }
  private createMeasurement(state: State, entry: LayoutEntry, widths: number[]): HTMLElement {
    const active = state.host.ownerDocument.activeElement;
    const existing = state.view.rows.find((row: LayoutRow) => row.entry?.file === entry.file);
    const editing = existing?.el.contains(active);
    // Always start from a native row with every column attached. An onscreen
    // row may have horizontally virtualized cells; merge its live editors below.
    state.measureRow.render(entry, state.view.data.properties);
    state.measureRow.virtualize(widths, 0, state.width);
    const row = state.measureRow.el.cloneNode(true) as HTMLElement;
    if (editing && existing) for (const cell of existing.el.children) {
      const prop = (cell as HTMLElement).dataset.property;
      const target = Array.from(row.children).find(el => (el as HTMLElement).dataset.property === prop);
      if (cell.contains(active)) {
        const clone = cell.cloneNode(true) as HTMLElement;
        // Inert clones cannot match :focus. Preserve the live editor's focus
        // typography and padding without touching the real input or its caret.
        const edit = clone.querySelector<HTMLElement>('[contenteditable="true"], input, textarea');
        if (edit && active instanceof state.host.ownerDocument.defaultView!.HTMLElement) {
          const css = state.host.ownerDocument.defaultView!.getComputedStyle(active);
          for (const name of ['font', 'line-height', 'padding', 'margin', 'white-space', 'word-break', 'overflow-wrap', 'width', 'max-width', 'box-sizing', 'display', 'flex'])
            edit.style.setProperty(name, css.getPropertyValue(name), 'important');
        }
        target?.replaceWith(clone);
      }
    }
    row.setAttribute('aria-hidden', 'true'); row.inert = true;
    styles(row, {position: 'fixed', left: '-100000px', top: '0', visibility: 'hidden',
      'pointer-events': 'none', height: 'auto', width: `${state.width}px`, 'max-height': 'none',
      '--bases-table-row-height': 'auto'});
    const cells = Array.from(row.children) as HTMLElement[];
    for (const cell of cells) {
      const index = state.view.data.properties.indexOf(cell.dataset.property ?? '');
      const nativeCell = state.measureRow.cells?.find((candidate: LayoutCell) => candidate.prop === cell.dataset.property);
      cell.classList.toggle('bui-tag-picker-cell', supportsIdeaTagCell(state.view, nativeCell,
        (cell.dataset.property ?? '').replace(/^note\./, ''), cell));
      styles(cell, {position: 'relative', 'inset-inline-start': 'auto', width: `${widths[index]}px`,
        height: 'auto', 'min-height': '0', 'max-height': 'none', 'flex-shrink': '0'});
      if (['note.领域', 'note.类型', 'note.重要性'].includes(cell.dataset.property ?? ''))
        cell.querySelectorAll('.multi-select-pill, .metadata-input-longtext').forEach(el => el.classList.add('bui-native-tag'));
      for (const el of cell.querySelectorAll<HTMLElement>('.bases-table-cell, .multi-select-container, .metadata-input-longtext')) {
        el.classList.add('bui-natural-height-measure');
        // Keep native overflow: hidden on flex items. Replacing it with visible
        // changes their automatic minimum width to min-content, so a long tag
        // can widen the measuring list and wrap fewer times than the live cell.
        // Auto height above already lets the natural vertical content expand.
      }
    }
    return row;
  }
  private readHeight(row: HTMLElement, width: number): number {
    const scale = row.getBoundingClientRect().width / width || 1;
    return Math.ceil(Math.max(32, ...Array.from(row.children).map(cell => {
      const inner = cell.querySelector<HTMLElement>('.bases-table-cell');
      return (inner?.getBoundingClientRect().height ?? 0) / scale + 1;
    })));
  }
  /** Prepare every invalid row while detached, then write once and read once.
   * This avoids a synchronous browser layout for each database entry.
   */
  private measureEntries(state: State, entries: LayoutEntry[], widths: number[], key: string) {
    const started = state.host.ownerDocument.defaultView!.performance.now();
    const pending: {entry: LayoutEntry; key: string; row: HTMLElement; height?: number}[] = [];
    const seen = new Set<IdeaFile>();
    const fragment = state.host.ownerDocument.createDocumentFragment();
    for (const entry of entries) {
      if (seen.has(entry.file)) continue;
      seen.add(entry.file);
      const entryKey = this.measurementKey(state, entry, key);
      if (state.heights.get(entry.file)?.key === entryKey) continue;
      const row = this.createMeasurement(state, entry, widths);
      pending.push({entry, key: entryKey, row}); fragment.append(row);
    }
    if (!pending.length) return;
    state.view.containerEl.append(fragment);
    state.perf.measurementBatches++; state.perf.measuredRows += pending.length;
    try {
      // No DOM writes between these reads: all rows share the first layout.
      for (const item of pending) item.height = this.readHeight(item.row, state.width);
      for (const item of pending) state.heights.set(item.entry.file, {key: item.key, height: item.height!});
    } finally {
      for (const item of pending) item.row.remove();
      state.perf.lastMeasureMs = state.host.ownerDocument.defaultView!.performance.now() - started;
    }
  }
  private measure(state: State, entry: LayoutEntry, _widths: number[], _key: string): number {
    return state.heights.get(entry.file)?.height ?? 32;
  }
  private update(state: State) {
    const view = state.view, el = view.containerEl;
    if (state.busy || !this.states.has(view) || !el.isConnected || !el.getBoundingClientRect().width) return;
    state.busy = true; state.observer.disconnect();
    const started = state.host.ownerDocument.defaultView!.performance.now();
    state.perf.layouts++; if (state.resizing) state.perf.previewLayouts++;
    try {this.layout(state);}
    catch (error) {
      console.warn('Native Reading UI: content-sized rows unavailable; restored native layout.', error);
      this.failed.add(view); this.release(view);
    } finally {
      state.perf.lastLayoutMs = state.host.ownerDocument.defaultView!.performance.now() - started;
      if (state.resizing) state.perf.maxPreviewLayoutMs = Math.max(state.perf.maxPreviewLayoutMs, state.perf.lastLayoutMs);
      // Decorate newly virtualized cells in the same render while our observer
      // is disconnected, so our own icons/classes cannot invalidate heights.
      try {if (this.states.has(view)) this.afterRender?.(view);}
      finally {state.busy = false; if (this.states.has(view)) this.observe(state);}
    }
  }
  private layout(state: State) {
    const v = state.view, data = v.data, properties: string[] = data.properties;
    if (v.groups.length !== data.groupedData.length || v.groups.some((group: LayoutGroup) => !group.tbodyEl || !group.virtualize)) throw Error('Unsupported native group structure');
    const automatic = properties.filter(property => !v.columnInfo[property]?.customWidth && !v.columnInfo[property]?.contentWidth);
    const automaticKey = automatic.length ? `${automatic.join(',')}|${data.data.map((entry: LayoutEntry) => valueKey(entry, automatic)).join('|')}` : '';
    if (properties.some(property => !v.columnInfo[property]) || (automatic.length && automaticKey !== state.autoWidthKey))
      state.originalUpdate.call(v);
    state.autoWidthKey = automaticKey;
    const win = state.host.ownerDocument.defaultView!, css = win.getComputedStyle(v.containerEl);
    v.minColWidth = px(css.getPropertyValue('--bases-table-column-min-width')) || 40;
    v.maxColWidth = px(css.getPropertyValue('--bases-table-column-max-width')) || 300;
    for (const cell of v.header.cells) if (!state.resizing && cell.el.offsetWidth && v.columnInfo[cell.prop]) v.columnInfo[cell.prop].headerWidth = cell.innerEl.scrollWidth;
    const widths = properties.map(property => v.columnInfo[property].getWidth(v.minColWidth, v.maxColWidth));
    let width = widths.reduce((sum, current) => sum + current, 0);
    const available = (v.containerEl.parentElement?.clientWidth ?? 1) - 1;
    if (widths.length && !v.columnInfo[properties[properties.length - 1]].customWidth && width < available) {widths[widths.length - 1] += available - width; width = available;}
    state.widths = widths; state.width = width;
    v.containerEl.classList.add('mod-multiline');
    const focused = v.containerEl.contains(state.host.ownerDocument.activeElement) ? state.host.ownerDocument.activeElement as HTMLElement : null;
    const viewRect = viewport(v.containerEl), direction = css.direction !== 'rtl';
    // Native editors must stay mounted during horizontal and vertical scroll.
    // Extend overscan around the actual focused control, as the native table does.
    if (focused && focused !== v.containerEl) {
      const containerBounds = v.containerEl.getBoundingClientRect(), focusBounds = focused.getBoundingClientRect();
      const scale = containerBounds.width / v.containerEl.offsetWidth || 1;
      viewRect.left = Math.min(viewRect.left, (focusBounds.left - containerBounds.left) / scale);
      viewRect.right = Math.max(viewRect.right, (focusBounds.right - containerBounds.left) / scale);
      viewRect.top = Math.min(viewRect.top, (focusBounds.top - containerBounds.top) / scale);
      viewRect.bottom = Math.max(viewRect.bottom, (focusBounds.bottom - containerBounds.top) / scale);
    }
    const horizontalStart = direction ? viewRect.left : width - viewRect.right;
    const horizontalEnd = direction ? viewRect.right : width - viewRect.left;
    const overscan = Math.max(60, v.getRowBaseHeight() * 3);
    const top = viewRect.top - overscan, bottom = viewRect.bottom + overscan;
    v.lastViewport = {...viewRect};
    const active = v.activeCell as Index | null;
    if (active && (!data.groupedData[active.groupIdx]?.entries[active.row] || active.column >= properties.length || v.isGroupCollapsed(data.groupedData[active.groupIdx]))) v.activeCell = null;
    const selection = v.selection;
    if (selection && (!data.groupedData[selection.groupIdx]?.entries[selection.bottom] || selection.end >= properties.length || v.isGroupCollapsed(data.groupedData[selection.groupIdx]))) v.selection = null;
    const previous = [...v.rows], pool = [...v.unusedRows], nextRows: LayoutRow[] = [];
    const currentFiles = new Set<IdeaFile>();
    children(v.containerEl, v.groups.map((group: LayoutGroup) => group.tableEl));
    let height = 0;
    const gap = px(css.getPropertyValue('--bases-table-group-gap')) || 10;
    state.groups = [];
    const widthKey = `${widths.join(',')}|${state.signature}|${state.epoch}`;
    const preview = state.resizing && state.heights.size > 0;
    if (!preview) this.measureEntries(state, data.groupedData.flatMap((group: GroupData) => group.entries), widths, widthKey);
    for (let groupIndex = 0; groupIndex < v.groups.length; groupIndex++) {
      const group = v.groups[groupIndex], groupData = data.groupedData[groupIndex];
      const collapsed = !!v.isGroupCollapsed(groupData);
      group.tableEl.classList.toggle('is-collapsed', collapsed);
      let selfHeight = group.selfHeight, childStart = group.childStart;
      if (!preview || typeof selfHeight !== 'number' || typeof childStart !== 'number' || !Number.isFinite(selfHeight) || !Number.isFinite(childStart)) {
        const bounds = group.tableEl.getBoundingClientRect(), bodyBounds = group.tbodyEl.getBoundingClientRect();
        const scale = bounds.width / group.tableEl.offsetWidth || 1;
        selfHeight = (bounds.height - bodyBounds.height) / scale;
        childStart = (bodyBounds.top - bounds.top) / scale;
      }
      group.selfHeight = selfHeight; group.childStart = childStart;
      const heights = groupData.entries.map((entry: LayoutEntry) => {
        currentFiles.add(entry.file);
        return this.measure(state, entry, widths, widthKey);
      });
      const offsets = heightOffsets(heights), bodyHeight = collapsed ? 0 : offsets[offsets.length - 1];
      const layout = {offsets, top: height, bodyTop: height + childStart, collapsed};
      state.groups.push(layout);
      styles(group.tableEl, {top: `${height}px`, width: `${width}px`});
      styles(group.tbodyEl, {height: `${bodyHeight}px`, '--bases-table-row-height': `${v.getRowBaseHeight() * v.getRowHeightMult()}px`});
      const nodes: HTMLElement[] = [];
      if (!collapsed) {
        const [start, end] = visibleRowRange(offsets, top - layout.bodyTop, bottom - layout.bodyTop);
        const indexes = new Set<number>();
        for (let index = start; index < end; index++) indexes.add(index);
        if (v.activeCell?.groupIdx === groupIndex) indexes.add(v.activeCell.row);
        for (const index of [...indexes].sort((a, b) => a - b)) {
          const entry = groupData.entries[index];
          const oldIndex = previous.findIndex(row => row.entry?.file === entry.file);
          const row = oldIndex >= 0 ? previous.splice(oldIndex, 1)[0] : pool.pop() ?? state.createRow(v);
          if (!preview || row.entry !== entry || row.cells.length !== properties.length) row.render(entry, properties);
          row.virtualize(widths, horizontalStart, horizontalEnd);
          styles(row.el, {top: `${offsets[index]}px`, width: `${width}px`, '--bases-table-row-height': `${heights[index]}px`});
          nodes.push(row.el); nextRows.push(row);
        }
        if (v.activeCell?.groupIdx === groupIndex) {
          const a = v.activeCell, left = widths.slice(0, a.column).reduce((sum: number, x: number) => sum + x, 0);
          const leftBorder = a.column === 0 ? 1 : 0, topBorder = a.row === 0 ? 1 : 0;
          v.activeCellEl.classList.toggle('mod-selection', !!v.selection);
          styles(v.activeCellEl, {'inset-block-start': `${offsets[a.row] + topBorder}px`, 'inset-inline-start': `${left + leftBorder}px`,
            width: `${widths[a.column] - 1 - leftBorder}px`, height: `${heights[a.row] - 1 - topBorder}px`});
          nodes.push(v.activeCellEl);
        }
        if (v.selection?.groupIdx === groupIndex) {
          const s = v.selection;
          styles(v.selectionEl, {'inset-block-start': `${offsets[s.top]}px`,
            'inset-inline-start': `${widths.slice(0, s.start).reduce((sum: number, x: number) => sum + x, 0)}px`,
            width: `${widths.slice(s.start, s.end + 1).reduce((sum: number, x: number) => sum + x, 0)}px`,
            height: `${offsets[s.bottom + 1] - offsets[s.top]}px`});
          nodes.push(v.selectionEl);
        }
      }
      children(group.tbodyEl, nodes); group.virtualize(width, widths, horizontalStart, horizontalEnd);
      height += selfHeight + bodyHeight + (groupIndex < v.groups.length - 1 ? gap : 0);
    }
    for (const row of previous) row.el.remove();
    v.rows = nextRows; v.unusedRows = previous.concat(pool).slice(0, 10);
    for (const file of state.heights.keys()) if (!currentFiles.has(file)) state.heights.delete(file);
    v.header.virtualize(widths, horizontalStart, horizontalEnd);
    styles(v.theadEl, {width: `${width}px`});
    const rootChildren = [v.theadEl, v.containerEl];
    if (v.footerSummary.shouldDisplay() && v.footerSummary.el) {
      rootChildren.push(v.footerSummary.el); styles(v.footerSummary.el, {width: `${width}px`});
      v.footerSummary.virtualize(widths, horizontalStart, horizontalEnd);
    }
    children(v.scrollEl, rootChildren);
    styles(v.containerEl, {width: `${width}px`, height: `${height}px`});
    if (focused?.isConnected && state.host.ownerDocument.activeElement !== focused) focused.focus({preventScroll: true});
    if (v.pendingScroll) {
      v.scrollEl.scrollTop = height * v.pendingScroll.top; v.scrollEl.scrollLeft = width * v.pendingScroll.left;
      v.lastScroll = v.pendingScroll; v.pendingScroll = null; this.schedule(state);
    } else v.lastScroll = {top: height ? v.scrollEl.scrollTop / height : 0, left: width ? v.scrollEl.scrollLeft / width : 0};
  }
  private cellRect(state: State, index: Index): Rect {
    const v = state.view, group = state.groups[index.groupIdx];
    if (!group || index.row >= group.offsets.length - 1) return state.originalRect.call(v, index);
    const base = v.getRowBaseHeight(), body = v.groups[index.groupIdx].tbodyEl.getBoundingClientRect();
    const scroll = v.scrollEl.getBoundingClientRect();
    const y = body.top - scroll.top + v.scrollEl.scrollTop;
    const left = state.widths.slice(0, index.column).reduce((sum, width) => sum + width, 0);
    return {top: y + group.offsets[index.row] - base,
      bottom: y + group.offsets[index.row + 1] + (v.footerSummary.shouldDisplay() ? base : 0),
      left, right: left + state.widths[index.column]};
  }
  private closest(state: State, event: MouseEvent, groupIndex: number): Index {
    const v = state.view, group = state.groups[groupIndex];
    if (!group) return state.originalClosest.call(v, event, groupIndex);
    const bounds = v.containerEl.getBoundingClientRect(), scale = bounds.width / v.containerEl.offsetWidth || 1;
    const top = v.groups[groupIndex].tbodyEl.getBoundingClientRect().top;
    const rtl = state.host.ownerDocument.defaultView!.getComputedStyle(v.containerEl).direction === 'rtl';
    const x = Math.abs((event.clientX - (rtl ? bounds.right : bounds.left)) / scale);
    let column = 0, edge = state.widths[0];
    while (column < state.widths.length - 1 && edge <= x) edge += state.widths[++column];
    return {groupIdx: groupIndex, row: rowIndexAt(group.offsets, (event.clientY - top) / scale), column};
  }
  private pageKey(state: State, event: KeyboardEvent) {
    if (!['PageUp', 'PageDown'].includes(event.key) || event.isComposing || event.defaultPrevented || event.metaKey || event.ctrlKey) return;
    const target = event.target as HTMLElement, v = state.view, old = v.activeCell as Index | null;
    if (!old || target.closest('input,textarea,[contenteditable="true"]') || !state.groups[old.groupIdx]) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const direction = event.key === 'PageDown' ? 1 : -1, rect = viewport(v.containerEl);
    const current = state.groups[old.groupIdx];
    const y = current.bodyTop + current.offsets[old.row] + direction * Math.max(30, rect.bottom - rect.top);
    let groupIndex = old.groupIdx;
    if (!event.shiftKey) {
      for (let i = 0; i < state.groups.length; i++) {
        const group = state.groups[i];
        if (!group.collapsed && group.offsets.length > 1) {
          groupIndex = i;
          if (y < group.bodyTop + group.offsets[group.offsets.length - 1]) break;
        }
      }
    }
    const group = state.groups[groupIndex], row = rowIndexAt(group.offsets, y - group.bodyTop);
    v.activeCell = {groupIdx: groupIndex, row, column: old.column};
    if (event.shiftKey) {
      const oldSelection = v.selection;
      const anchor = oldSelection ? (old.row === oldSelection.bottom ? oldSelection.top : oldSelection.bottom) : old.row;
      v.selection = {groupIdx: old.groupIdx, top: Math.min(anchor, row), bottom: Math.max(anchor, row),
        start: oldSelection?.start ?? old.column, end: oldSelection?.end ?? old.column};
    } else v.selection = null;
    this.update(state);
    const cell = this.cellRect(state, v.activeCell), scroll = v.scrollEl;
    const sign = state.host.ownerDocument.defaultView!.getComputedStyle(scroll).direction === 'rtl' ? -1 : 1;
    const left = nearestScroll(scroll.scrollLeft * sign, cell.left, cell.right, scroll.clientWidth, Math.max(0, scroll.scrollWidth - scroll.clientWidth));
    const top = nearestScroll(scroll.scrollTop, cell.top, cell.bottom, scroll.clientHeight, Math.max(0, scroll.scrollHeight - scroll.clientHeight));
    if (left !== scroll.scrollLeft * sign || top !== scroll.scrollTop) scroll.scrollTo({left: left * sign, top, behavior: 'auto'});
  }
  invalidate() {for (const state of this.states.values()) {state.signature = this.signature(state); this.schedule(state, true);}}
  private restore(state: State) {
    for (const patch of state.patches) if (state.view[patch.name] === patch.wrapper) {
      if (patch.descriptor) Object.defineProperty(state.view, patch.name, patch.descriptor);
      else Reflect.deleteProperty(state.view, patch.name);
    }
  }
  private release(view: unknown): boolean {
    const state = this.states.get(view); if (!state) return false;
    const nativeView = state.view;
    this.states.delete(view); state.observer.disconnect(); state.resize.disconnect();
    if (state.frame) state.host.ownerDocument.defaultView!.cancelAnimationFrame(state.frame);
    nativeView.containerEl.removeEventListener('input', state.onInput, true);
    nativeView.containerEl.removeEventListener('keydown', state.onKey, true);
    for (const type of ['pointerdown', 'dragstart']) nativeView.theadEl.removeEventListener(type, state.onResizeStart, true);
    for (const type of ['pointerup', 'pointercancel', 'drop', 'dragend', 'blur']) state.host.ownerDocument.defaultView!.removeEventListener(type, state.onResizeEnd, true);
    state.host.classList.remove('bui-ideas-auto', 'bui-ideas-resizing'); this.restore(state);
    for (const row of [...nativeView.rows, ...nativeView.unusedRows]) row.el.style.removeProperty('--bases-table-row-height');
    state.measureRow.el.remove(); state.heights.clear();
    if (nativeView._loaded !== false && nativeView.containerEl.isConnected) nativeView.updateVirtualDisplay();
    return true;
  }
  prune() {for (const [view, state] of this.states) if (state.view._loaded === false || !state.host.isConnected) this.release(view);}
  clear() {for (const view of [...this.states.keys()]) this.release(view);}
}
