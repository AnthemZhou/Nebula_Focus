import {supportsIdeaTagCell} from './idea-tag-support';
import {tableProfile} from './table-profile';
import {isRelationValue, isTableRelationProperty, isTableTagProperty, RELATION_LINK_SELECTOR} from './semantic-property';

/** Minimum widths for configured and explicitly recognized tag columns in native Bases.
 * Wrap the native column-width accessor, which is shared by rendering, hit testing
 * and selection. Never change customWidth, configuration, or persisted note data.
 */
import {IdeaView, IdeaCell, isIdeaView, isIdeaCell, isHtmlElement, object} from './idea-native';
type WidthInfo = {getWidth?: (...args: unknown[]) => number};
type WidthEntry = {getValue(property: string): unknown};
type WidthView = IdeaView & {
  containerEl: HTMLElement;
  data: {data: WidthEntry[]; properties?: string[]};
  header: {cells: IdeaCell[]};
  columnInfo?: Record<string, unknown>;
  updateVirtualDisplay(): unknown;
};
function widthEntry(value: unknown): value is WidthEntry {return object(value) && typeof value.getValue === 'function';}
function widthInfo(value: unknown): value is WidthInfo & Required<WidthInfo> {
  return object(value) && typeof value.getWidth === 'function';
}
function widthView(value: unknown): value is WidthView {
  if (!object(value)) return false;
  const raw = value;
  if (!isIdeaView(value) || !isHtmlElement(value.containerEl)) return false;
  const header = raw.header, data = value.data;
  return object(header) && Array.isArray(header.cells) && header.cells.every(isIdeaCell) &&
    !!data && Array.isArray(data.data) && data.data.every(widthEntry) &&
    (data.properties === undefined || (Array.isArray(data.properties) && data.properties.every(item => typeof item === 'string'))) &&
    (raw.columnInfo === undefined || object(raw.columnInfo)) && typeof raw.updateVirtualDisplay === 'function';
}
const FONT_PROPERTIES = ['font-family', 'font-size', 'font-weight', 'font-style', 'font-stretch',
  'font-variant', 'font-feature-settings', 'font-variation-settings', 'font-kerning',
  'letter-spacing', 'word-spacing', 'text-transform', 'direction'] as const;

type WidthPatch = {
  info: WidthInfo;
  minimum: number;
  original: (...args: unknown[]) => number;
  wrapper: (...args: unknown[]) => number;
  descriptor?: PropertyDescriptor;
};
type ViewState = {view: WidthView; host: HTMLElement; patches: Map<string, WidthPatch>; keys: Map<string, string>};

function pixels(value: string | undefined): number {
  const result = parseFloat(value ?? '');
  return Number.isFinite(result) ? result : 0;
}
function horizontal(style: CSSStyleDeclaration): number {
  return pixels(style.paddingLeft) + pixels(style.paddingRight) +
    pixels(style.borderLeftWidth) + pixels(style.borderRightWidth) +
    pixels(style.marginLeft) + pixels(style.marginRight);
}
function values(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap(values);
  if (typeof value === 'object' && 'data' in value) return values(value.data);
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return String(value).trim() ? [displayLabel(String(value))] : [];
  const text = object(value) && typeof value.toString === 'function'
    ? (value.toString as () => unknown).call(value) : undefined;
  return typeof text === 'string' && text && text !== '[object Object]' ? [displayLabel(text)] : [];
}

function displayLabel(value: string): string {
  const wiki = /^\[\[([^|\]]+)(?:\|([^\]]*))?\]\]$/.exec(value.trim());
  if (!wiki) return value;
  return wiki[2] || wiki[1].split('/').pop()!.replace(/\.md(?=#|$)/i, '');
}

function nativeCell(view: WidthView, property: string): IdeaCell | null {
  // Horizontal virtualization removes cells from the document, but keeps the
  // native row's full cell list. Sample the same schema even when scrolled away.
  for (const row of view.rows ?? []) {
    const cell = row.cells?.find((cell: IdeaCell) => cell.prop === property);
    if (cell?.el instanceof HTMLElement) return cell;
  }
  const el = Array.from(view.containerEl.querySelectorAll<HTMLElement>('.bases-td[data-property]'))
    .find(cell => cell.dataset.property === property);
  return el ? {el} : null;
}

class TextMeasure {
  private span?: HTMLSpanElement;
  private fonts = new Map<Element, string[]>();
  constructor(private doc: Document, private cache: Map<string, number>) {}

  width(text: string, reference: Element): number {
    let font = this.fonts.get(reference);
    if (!font) {
      const style = this.doc.defaultView!.getComputedStyle(reference);
      font = FONT_PROPERTIES.map(name => style.getPropertyValue(name));
      this.fonts.set(reference, font);
    }
    const key = JSON.stringify([font, text]);
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    if (!this.span) {
      this.span = this.doc.createElement('span');
      this.span.setAttribute('aria-hidden', 'true');
      this.span.className = 'bui-text-width-measure';
      this.doc.body.append(this.span);
    }
    FONT_PROPERTIES.forEach((name, index) => this.span!.style.setProperty(name, font[index]));
    this.span.textContent = text;
    const width = this.span.getBoundingClientRect().width;
    if (Number.isFinite(width) && width > 0) this.cache.set(key, width);
    return width;
  }

  destroy() {this.span?.remove();}
}

export class IdeaColumnWidths {
  private states = new Map<unknown, ViewState>();
  private widths = new Map<string, number>();
  private revision = 0;

  /** Call after applying the presentation classes. True means native geometry
   * needs one updateVirtualDisplay() call; repeated unchanged scans return false.
   */
  refresh(view: unknown): boolean {
    if (!isIdeaView(view)) return this.release(view);
    const host = view.queryController?.viewContainerEl;
    if (!isHtmlElement(host) || !isHtmlElement(view.containerEl)) return this.release(view);
    if (!('updateVirtualDisplay' in view) || typeof view.updateVirtualDisplay !== 'function') return this.release(view);
    if (!host.isConnected || view._loaded === false) return this.release(view);
    // Cached editor/preview components can be hidden. Measure only when their
    // actual native controls have layout; the next visible scan will attach.
    if (!widthView(view)) return false;
    let state = this.states.get(view);
    if (!state) {
      state = {view, host, patches: new Map(), keys: new Map()};
      this.states.set(view, state);
    }
    // Existing clamps are independent of the chosen column width. During a
    // native resize keep them without repeating font/layout measurement.
    if (host.classList.contains('bui-ideas-resizing') && state.patches.size) return false;
    let changed = false;
    // Restore retired accessors before wrapping a renamed column that may reuse
    // the same native width object; otherwise wrappers could stack on rename.
    const properties = new Set(view.data.properties ?? []);
    for (const [property, patch] of state.patches) if (!properties.has(property)) {
      this.restore(patch); state.patches.delete(property); state.keys.delete(property); changed = true;
    }
    const present = new Set<string>();
    const measure = new TextMeasure(host.ownerDocument, this.widths);
    const css = host.ownerDocument.defaultView!.getComputedStyle(host);
    const fontKey = `${this.revision}|${css.font}|${css.letterSpacing}|${host.ownerDocument.body.className}`;
    try {
      const profile = tableProfile(view);
      for (const property of view.data.properties ?? []) {
        const sample = nativeCell(view, property), cell = sample?.el;
        const info = view.columnInfo?.[property];
        if (!widthInfo(info)) continue;
        const labels = new Set<string>();
        let linkedValues = false;
        for (const entry of view.data.data) {
          try {
            const value = entry.getValue(property);
            linkedValues ||= isRelationValue(value);
            for (const text of values(value)) labels.add(text);
          } catch { /* Unsupported native values do not contribute to the column minimum. */ }
        }
        const relation = isTableRelationProperty(profile, property, cell, linkedValues);
        if (!relation && !isTableTagProperty(profile, property)) continue;
        const header = view.header.cells.find((cell: IdeaCell) => cell.prop === property);
        const label = header?.el?.querySelector('.bases-table-header-name')?.textContent ?? '';
        const kind = cell?.querySelector('.bases-table-cell')?.getAttribute('data-property-type') ?? '';
        const picker = !!cell && supportsIdeaTagCell(view, sample, property.slice(5), cell);
        const key = JSON.stringify([fontKey, label, kind, picker, relation,
          host.classList.contains('bui-ideas-base'), [...labels].sort()]);
        let patch = state.patches.get(property);
        if (patch?.info === info && state.keys.get(property) === key) {present.add(property); continue;}
        if (!host.getBoundingClientRect().width) {if (patch) present.add(property); continue;}
        const minimum = this.minimum(view, property, measure, [...labels], relation);
        if (!minimum) {if (patch) present.add(property); continue;}
        state.keys.set(property, key);
        present.add(property);
        if (patch && patch.info !== info) {
          this.restore(patch); state.patches.delete(property); patch = undefined; changed = true;
        }
        if (!patch) {
          const descriptor = Object.getOwnPropertyDescriptor(info, 'getWidth');
          if (descriptor && !descriptor.configurable && !descriptor.writable) continue;
          const next: WidthPatch = {info, minimum, original: info.getWidth, descriptor, wrapper: () => 0};
          next.wrapper = function(this: WidthInfo, ...args: unknown[]) {
            return Math.max(next.original.apply(this, args), next.minimum);
          };
          try {info.getWidth = next.wrapper;} catch {continue;}
          if (info.getWidth !== next.wrapper) continue;
          state.patches.set(property, next); changed = true;
        } else if (patch.minimum !== minimum) {
          patch.minimum = minimum; changed = true;
        }
      }
    } finally {measure.destroy();}
    for (const [property, patch] of state.patches) if (!present.has(property)) {
      this.restore(patch); state.patches.delete(property); changed = true;
    }
    return changed;
  }

  private minimum(view: WidthView, property: string, measure: TextMeasure, labels: string[], relation: boolean): number {
    const header = view.header.cells.find((cell: IdeaCell) => cell.prop === property);
    const headerName = header?.el?.querySelector<HTMLElement>('.bases-table-header-name');
    const label = header?.innerEl;
    if (!header?.el || !headerName || !label) return 0;
    const win = headerName.ownerDocument.defaultView!;
    const style = (el: Element) => win.getComputedStyle(el);
    const icon = label.querySelector<HTMLElement>('.bases-table-header-icon');
    const iconWidth = icon && style(icon).display !== 'none' ? icon.getBoundingClientRect().width : 0;
    const labelStyle = style(label);
    const sort = header.el.querySelector<HTMLElement>('.bases-table-header-sort');
    const sortIcon = sort?.querySelector('svg');
    // Native sort arrows are absolutely positioned. Reserve their slot even
    // before a sort is enabled, so enabling one never hides the header text.
    const sortSpace = sort ? horizontal(style(sort)) +
      (sortIcon?.getBoundingClientRect().width || iconWidth || pixels(style(headerName).fontSize)) : 0;
    const headerWidth = measure.width(headerName.textContent ?? property.replace(/^note\./, ''), headerName) +
      Math.max(horizontal(style(headerName)), sortSpace) + horizontal(labelStyle) + iconWidth +
      (iconWidth ? pixels(labelStyle.columnGap) : 0) + 2;

    const sample = nativeCell(view, property);
    const cell = sample?.el?.cloneNode(true) as HTMLElement | undefined;
    // A stable inert sample avoids minimum widths depending on whether the
    // first visible row currently happens to have a tag. Use the native editor
    // structure and the same table/style ancestry without touching live inputs.
    if (cell) {
      // Paint may not yet have marked this native cell (or it may be a recycled
      // offscreen cell). Derive its geometry from the renderer/value guard, as
      // the row-height probe does, rather than the decoration's arrival time.
      // Otherwise the first clamp reserves a native remove button and a later
      // scan shrinks the column when the picker hides it, rewrapping tag rows.
      cell.classList.toggle('bui-tag-picker-cell',
        supportsIdeaTagCell(view, sample, property.slice(5), sample?.el ?? cell));
      cell.setAttribute('aria-hidden', 'true'); cell.inert = true;
      cell.removeAttribute('style');
      cell.classList.add('bui-tag-width-measure');
      cell.classList.toggle('bui-tag-column', !relation);
      cell.classList.toggle('bui-relation-column', relation);
      cell.classList.add(relation ? 'bui-relation-property' : 'bui-semantic-property');
      const list = cell.querySelector('.multi-select-container');
      if (list && !list.querySelector('.multi-select-pill')) {
        const pill = cell.ownerDocument.createElement('div');
        pill.className = relation ? 'multi-select-pill bui-relation-pill' : 'multi-select-pill bui-native-tag bui-semantic-tag';
        const content = pill.appendChild(cell.ownerDocument.createElement('div'));
        content.className = `multi-select-pill-content${relation ? ' bui-relation-link' : ''}`; content.textContent = labels[0] ?? ' ';
        const remove = pill.appendChild(cell.ownerDocument.createElement('div'));
        remove.className = 'multi-select-pill-remove-button';
        const icon = remove.appendChild(cell.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg'));
        icon.classList.add('svg-icon'); icon.setAttribute('width', '24'); icon.setAttribute('height', '24');
        list.prepend(pill);
      }
      if (relation) for (const link of cell.querySelectorAll<HTMLElement>(RELATION_LINK_SELECTOR)) {
        const pill = link.closest<HTMLElement>('.multi-select-pill');
        pill?.classList.add('bui-relation-pill');
        (pill?.querySelector('.multi-select-pill-content') ?? link).classList.add('bui-relation-link');
      }
      if (!relation) for (const pill of cell.querySelectorAll('.multi-select-pill'))
        pill.classList.add('bui-native-tag', 'bui-semantic-tag');
      if (!relation && labels.length) for (const input of cell.querySelectorAll('.metadata-input-longtext')) {
        input.classList.add('bui-native-tag', 'bui-semantic-tag');
        if (!input.textContent) input.textContent = labels[0];
      }
      view.containerEl.append(cell);
    }
    try {
    const list = cell?.querySelector<HTMLElement>('.multi-select-container');
    const pill = list?.querySelector<HTMLElement>('.multi-select-pill');
    const content = pill?.querySelector<HTMLElement>('.multi-select-pill-content');
    const input = cell?.querySelector<HTMLElement>('.metadata-input-longtext, .multi-select-input, .metadata-link-inner, .bases-rendered-value');
    const reference = content ?? input ?? headerName;
    let widest = 0;
    if (list) {
      const listStyle = style(list);
      const remove = pill?.querySelector<HTMLElement>('.multi-select-pill-remove-button');
      const removeWidth = remove && style(remove).display !== 'none' ? remove.getBoundingClientRect().width : 0;
      const inputWidth = Math.max(pixels(style(reference).fontSize) * .65,
        input ? pixels(style(input).minWidth) : 0);
      const pillExtra = (pill ? horizontal(style(pill)) : 0) +
        (content ? horizontal(style(content)) : 0) + removeWidth +
        (pill ? pixels(style(pill).columnGap) : 2);
      const containerExtra = horizontal(listStyle);
      // Keep one complete label and the native input caret on a line. Additional
      // labels can wrap; the content-sized row adapter owns their vertical space.
      for (const text of labels) widest = Math.max(widest,
        measure.width(text, reference) + pillExtra + inputWidth + pixels(listStyle.columnGap) + containerExtra);
    } else {
      const linkWrapper = cell?.querySelector<HTMLElement>('.metadata-link');
      const edit = linkWrapper?.querySelector<HTMLElement>('.metadata-link-flair');
      const editWidth = edit && style(edit).display !== 'none' ? edit.getBoundingClientRect().width : 0;
      const extra = (input ? horizontal(style(input)) : 28) + (linkWrapper ? horizontal(style(linkWrapper)) : 0) + editWidth;
      for (const text of labels) widest = Math.max(widest, measure.width(text, reference) + extra);
    }
    return Math.ceil(Math.max(headerWidth, widest + 2));
    } finally {cell?.remove();}
  }

  /** Invalidate after font loading or css-change; values and computed font
   * settings are otherwise included in the measurement cache key.
   */
  invalidate() {this.revision++; this.widths.clear();}

  private restore(patch: WidthPatch) {
    // Never overwrite a later wrapper installed by another component/plugin.
    if (patch.info.getWidth !== patch.wrapper) return;
    if (patch.descriptor) Object.defineProperty(patch.info, 'getWidth', patch.descriptor);
    else delete patch.info.getWidth;
  }

  private release(view: unknown): boolean {
    const state = this.states.get(view);
    if (!state) return false;
    for (const patch of state.patches.values()) this.restore(patch);
    this.states.delete(view);
    return true;
  }

  prune() {
    for (const [view, state] of this.states) if (state.view._loaded === false || !state.host.isConnected) this.release(view);
  }

  /** Restore accessors, then let the caller's normal css-change refresh native geometry. */
  clear() {
    for (const view of this.states.keys()) this.release(view);
    this.widths.clear();
  }
}
