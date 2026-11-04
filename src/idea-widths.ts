import {supportsIdeaTagCell} from './idea-tag-support';

/** Minimum widths for the three editable classification columns in native Bases.
 * Wrap the native column-width accessor, which is shared by rendering, hit testing
 * and selection. Never change customWidth, configuration, or persisted note data.
 */
type Native = any;
const PROPERTIES = ['note.领域', 'note.类型', 'note.重要性'] as const;
const FONT_PROPERTIES = ['font-family', 'font-size', 'font-weight', 'font-style', 'font-stretch',
  'font-variant', 'font-feature-settings', 'font-variation-settings', 'font-kerning',
  'letter-spacing', 'word-spacing', 'text-transform', 'direction'] as const;

type WidthPatch = {
  info: Native;
  minimum: number;
  original: (...args: Native[]) => number;
  wrapper: (...args: Native[]) => number;
  descriptor?: PropertyDescriptor;
};
type ViewState = {host: HTMLElement; patches: Map<string, WidthPatch>; keys: Map<string, string>};

function pixels(value: string | undefined): number {
  const result = parseFloat(value ?? '');
  return Number.isFinite(result) ? result : 0;
}
function horizontal(style: CSSStyleDeclaration): number {
  return pixels(style.paddingLeft) + pixels(style.paddingRight) +
    pixels(style.borderLeftWidth) + pixels(style.borderRightWidth) +
    pixels(style.marginLeft) + pixels(style.marginRight);
}
function values(value: Native): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap(values);
  if (typeof value === 'object' && 'data' in value) return values(value.data);
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return String(value).trim() ? [String(value)] : [];
  const text = value.toString?.();
  return typeof text === 'string' && text && text !== '[object Object]' ? [text] : [];
}

function nativeCell(view: Native, property: string): Native | null {
  // Horizontal virtualization removes cells from the document, but keeps the
  // native row's full cell list. Sample the same schema even when scrolled away.
  for (const row of view.rows ?? []) {
    const cell = row.cells?.find((cell: Native) => cell.prop === property);
    if (cell?.el instanceof HTMLElement) return cell;
  }
  const el = view.containerEl.querySelector(`.bases-td[data-property="${property}"]`);
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
  private states = new Map<Native, ViewState>();
  private widths = new Map<string, number>();
  private revision = 0;

  /** Call after applying the presentation classes. True means native geometry
   * needs one updateVirtualDisplay() call; repeated unchanged scans return false.
   */
  refresh(view: Native): boolean {
    const host = view?.queryController?.viewContainerEl;
    if (view?.type !== 'table' || view.config?.name !== '想法收集箱' ||
        !(host instanceof HTMLElement) || !(view.containerEl instanceof HTMLElement) ||
        typeof view.updateVirtualDisplay !== 'function') return this.release(view);
    if (!host.isConnected || view._loaded === false) return this.release(view);
    // Cached editor/preview components can be hidden. Measure only when their
    // actual native controls have layout; the next visible scan will attach.
    if (!Array.isArray(view.data?.data) || !Array.isArray(view.header?.cells)) return false;
    let state = this.states.get(view);
    if (!state) {
      state = {host, patches: new Map(), keys: new Map()};
      this.states.set(view, state);
    }
    // Existing clamps are independent of the chosen column width. During a
    // native resize keep them without repeating font/layout measurement.
    if (host.classList.contains('bui-ideas-resizing') && state.patches.size) return false;
    let changed = false;
    const present = new Set<string>();
    const measure = new TextMeasure(host.ownerDocument, this.widths);
    const css = host.ownerDocument.defaultView!.getComputedStyle(host);
    const fontKey = `${this.revision}|${css.font}|${css.letterSpacing}|${host.ownerDocument.body.className}`;
    try {
      for (const property of PROPERTIES) {
        if (!view.data.properties?.includes(property)) continue;
        const info = view.columnInfo?.[property];
        if (!info || typeof info.getWidth !== 'function') continue;
        const labels = new Set<string>();
        for (const entry of view.data.data) {
          try {for (const text of values(entry.getValue(property))) labels.add(text);} catch { /* Unsupported native values do not contribute to the column minimum. */ }
        }
        const header = view.header.cells.find((cell: Native) => cell.prop === property);
        const label = header?.el?.querySelector('.bases-table-header-name')?.textContent ?? '';
        const sample = nativeCell(view, property), cell = sample?.el as HTMLElement | undefined;
        const kind = cell?.querySelector('.bases-table-cell')?.getAttribute('data-property-type') ?? '';
        const picker = !!cell && supportsIdeaTagCell(view, sample, property.slice(5), cell);
        const key = JSON.stringify([fontKey, label, kind, picker,
          host.classList.contains('bui-ideas-base'), [...labels].sort()]);
        let patch = state.patches.get(property);
        if (patch?.info === info && state.keys.get(property) === key) {present.add(property); continue;}
        if (!host.getBoundingClientRect().width) {if (patch) present.add(property); continue;}
        const minimum = this.minimum(view, property, measure, [...labels]);
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
          next.wrapper = function(this: Native, ...args: Native[]) {
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

  private minimum(view: Native, property: string, measure: TextMeasure, labels: string[]): number {
    const header = view.header.cells.find((cell: Native) => cell.prop === property);
    const headerName = header?.el?.querySelector('.bases-table-header-name') as HTMLElement | null;
    const label = header?.innerEl as HTMLElement | undefined;
    if (!headerName || !label) return 0;
    const win = headerName.ownerDocument.defaultView!;
    const style = (el: Element) => win.getComputedStyle(el);
    const icon = label.querySelector<HTMLElement>('.bases-table-header-icon');
    const iconWidth = icon && style(icon).display !== 'none' ? icon.getBoundingClientRect().width : 0;
    const labelStyle = style(label);
    const sort = header.el.querySelector('.bases-table-header-sort') as HTMLElement | null;
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
        supportsIdeaTagCell(view, sample, property.slice(5), sample.el));
      cell.setAttribute('aria-hidden', 'true'); cell.inert = true;
      cell.removeAttribute('style');
      cell.classList.add('bui-tag-width-measure');
      const list = cell.querySelector('.multi-select-container');
      if (list && !list.querySelector('.multi-select-pill')) {
        const pill = cell.ownerDocument.createElement('div');
        pill.className = 'multi-select-pill bui-native-tag bui-semantic-tag';
        const content = pill.appendChild(cell.ownerDocument.createElement('div'));
        content.className = 'multi-select-pill-content'; content.textContent = labels[0] ?? ' ';
        const remove = pill.appendChild(cell.ownerDocument.createElement('div'));
        remove.className = 'multi-select-pill-remove-button';
        const icon = remove.appendChild(cell.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg'));
        icon.classList.add('svg-icon'); icon.setAttribute('width', '24'); icon.setAttribute('height', '24');
        list.prepend(pill);
      }
      for (const pill of cell.querySelectorAll('.multi-select-pill'))
        pill.classList.add('bui-native-tag', 'bui-semantic-tag');
      if (labels.length) for (const input of cell.querySelectorAll('.metadata-input-longtext')) {
        input.classList.add('bui-native-tag', 'bui-semantic-tag');
        if (!input.textContent) input.textContent = labels[0];
      }
      view.containerEl.append(cell);
    }
    try {
    const list = cell?.querySelector<HTMLElement>('.multi-select-container');
    const pill = list?.querySelector<HTMLElement>('.multi-select-pill');
    const content = pill?.querySelector<HTMLElement>('.multi-select-pill-content');
    const input = cell?.querySelector<HTMLElement>('.metadata-input-longtext, .multi-select-input');
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
      const extra = input ? horizontal(style(input)) : 28;
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

  private release(view: Native): boolean {
    const state = this.states.get(view);
    if (!state) return false;
    for (const patch of state.patches.values()) this.restore(patch);
    this.states.delete(view);
    return true;
  }

  prune() {
    for (const [view, state] of this.states) if (view._loaded === false || !state.host.isConnected) this.release(view);
  }

  /** Restore accessors, then let the caller's normal css-change refresh native geometry. */
  clear() {
    for (const view of this.states.keys()) this.release(view);
    this.widths.clear();
  }
}
