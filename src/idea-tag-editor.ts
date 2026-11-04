import {Notice, setIcon} from 'obsidian';
import {ideaTone} from './idea-table';
import {applyTagOrder, cleanTagOrder, ideaTagOrderKey, mergeTagOrder, IdeaTagOrderStore, IdeaTagOptions} from './idea-tag-order';
import {IdeaTagManager, TagCatalog} from './idea-tag-manager';
import {guardTouchScrollClicks, positionAnchoredPopover, preferPopoverInputFocus, watchPopoverViewport} from './mobile-popover';
import {readIdeaTagValues as valuesOf, supportsIdeaTagCell} from './idea-tag-support';
import {TagDragMotion} from './tag-drag-motion';
import {inheritTagTypography} from './tag-typography';
export type {IdeaTagOrderStore} from './idea-tag-order';

// Bases has no public cell-editor extension point. If this guarded adapter no
// longer recognises the native renderer, leave that cell's native editor alone.
type Native = any;
type Property = '领域' | '类型' | '重要性';
type Value = string | string[];
type Binding = {view: Native; host: HTMLElement; removeListeners: (() => void)[]; markedCells: Set<HTMLElement>};
type Target = {binding: Binding; cell: Native; anchor: HTMLElement; entry: Native; property: Property};
type Choice = {value: string; create: boolean};
type Drag = {
  pointerId: number; value: string; row: HTMLElement; startX: number; startY: number; moved: boolean;
  original: string[]; preview: string[]; motion: TagDragMotion; activated: boolean; holdTimer?: number; settling?: boolean; removeListeners: (() => void)[];
};
type Editor = Target & {
  file: Native; query: Native; popup: HTMLElement; selectedEl: HTMLElement; input: HTMLInputElement;
  optionsEl: HTMLElement; statusEl: HTMLElement; values: string[]; displayedValues: string[]; choices: Choice[]; active: number;
  observedValues: string[]; awaitingValues: string[][]; pendingDisplay?: string[]; syncTimer?: number; saving: boolean;
  clearInputOnSync?: string; closeOnSync: boolean; lastAttemptFailed: boolean;
  orderKey: string | null; order: string[]; drag?: Drag; ignoreClick: boolean;
  composing: boolean; imeEnded: boolean; busy: boolean; autoInputFocus: boolean; removeListeners: (() => void)[];
};
const PROPERTIES = new Set(['领域', '类型', '重要性']);
let nextId = 0;

function listen(target: EventTarget, type: string, listener: EventListener, capture = false): () => void {
  target.addEventListener(type, listener, capture);
  return () => target.removeEventListener(type, listener, capture);
}
function element(target: EventTarget | null): HTMLElement | null {
  return target && (target as Node).nodeType === 1 ? target as HTMLElement : null;
}
function rawValue(values: string[], property: Property): Value {
  return property === '领域' ? values : values[0] ?? '';
}
function unmodified(event: MouseEvent | KeyboardEvent): boolean {
  return !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}

/** A popover for three native idea-table properties. Only explicit option and
 * toggle actions call Bases.updateProperty, preserving its transaction/undo
 * path. Opening, filtering, blur and cancellation never write note data.
 */
export class IdeaTagEditors {
  private bindings = new Map<Native, Binding>();
  private editor?: Editor;
  private orders = new Map<string, string[]>();
  private catalogs = new Map<string, {added: string[]; hidden: string[]}>();
  private manager = new IdeaTagManager();

  constructor(private readonly orderStore?: IdeaTagOrderStore) {}

  private readOrder(key: string | null): string[] {
    if (!key) return [];
    const cached = this.orders.get(key);
    if (cached) return [...cached];
    let values: string[] = [];
    try {values = cleanTagOrder(this.orderStore?.read(key));} catch { /* Invalid plugin data falls back to query order. */ }
    this.orders.set(key, values);
    return [...values];
  }

  private readOptions(key: string | null): {added: string[]; hidden: string[]} {
    if (!key) return {added: [], hidden: []};
    let cached = this.catalogs.get(key);
    if (!cached) {
      let data: {added?: unknown; hidden?: unknown} | undefined;
      try {data = this.orderStore?.readOptions?.(key);} catch { /* Keep query values if preferences cannot be read. */ }
      cached = {added: cleanTagOrder(data?.added), hidden: cleanTagOrder(data?.hidden)};
      this.catalogs.set(key, cached);
    }
    return {added: [...cached.added], hidden: [...cached.hidden]};
  }

  private catalog(view: Native, property: Property, selected: string[] = []): TagCatalog {
    const key = ideaTagOrderKey(view, property), order = this.readOrder(key), options = this.readOptions(key);
    const values = new Set<string>();
    for (const entry of this.entries(view)) {
      if (typeof entry?.getRawProperty !== 'function') continue;
      try {for (const value of valuesOf(entry.getRawProperty(property), property) ?? []) values.add(value);} catch { /* Skip unsupported entries. */ }
    }
    for (const value of [...options.added, ...selected]) values.add(value);
    return {...options, order, values: applyTagOrder([...values], order).filter(value => !options.hidden.includes(value))};
  }

  /** Called by the header adapter; returns false for non-classification columns. */
  manage(view: Native, rawProperty: string, anchor: HTMLElement, keyboard = false): boolean {
    const property = rawProperty.replace(/^note\./, '') as Property;
    const key = ideaTagOrderKey(view, property);
    if (!rawProperty.startsWith('note.') || !PROPERTIES.has(property) || !key || !this.orderStore?.writeOptions) return false;
    this.close();
    return this.manager.open({view, property, anchor, keyboard, read: () => this.catalog(view, property),
      save: async (options: IdeaTagOptions) => {
        const next = {order: cleanTagOrder(options.order), added: cleanTagOrder(options.added), hidden: cleanTagOrder(options.hidden)};
        await this.orderStore!.writeOptions!(key, next);
        this.orders.set(key, next.order); this.catalogs.set(key, {added: next.added, hidden: next.hidden});
      }});
  }

  attach(view: Native) {
    const container = view?.containerEl as HTMLElement | undefined;
    const candidate = view?.queryController?.viewContainerEl as HTMLElement | undefined;
    const host = candidate?.contains(container!) ? candidate : container?.parentElement;
    if (!host || !container || view?.type !== 'table' || view.config?.name !== '想法收集箱' ||
        typeof view.getCellFromDom !== 'function' || typeof view.updateProperty !== 'function' ||
        !container.isConnected || view._loaded === false) {
      const old = this.bindings.get(view);
      if (old) this.detach(old);
      return;
    }
    let binding = this.bindings.get(view);
    if (binding && binding.host !== host) {this.detach(binding); binding = undefined;}
    if (binding) {this.refreshCellMarkers(binding); this.syncCommittedEditor(binding); return;}
    binding = {view, host, removeListeners: [], markedCells: new Set()};
    const current = binding;
    // Listen above the table container, before native selection starts editing
    // a text property. Modified clicks and non-tag cells retain native handlers.
    const press = (event: Event) => {
      const mouse = event as MouseEvent;
      if (mouse.button !== 0 || !unmodified(mouse) || !this.target(current, event.target)) return;
      // Touch-down may become a vertical or horizontal pan. Block the native
      // cell editor's handler without cancelling the browser's scroll gesture.
      if ((event as PointerEvent).pointerType !== 'touch') event.preventDefault();
      event.stopPropagation();
    };
    const click = (event: Event) => {
      const mouse = event as MouseEvent;
      if (mouse.button !== 0 || !unmodified(mouse)) return;
      const target = this.target(current, event.target);
      if (!target) return;
      event.preventDefault(); event.stopPropagation(); this.open(target);
    };
    const keydown = (event: Event) => {
      const key = event as KeyboardEvent;
      if (key.defaultPrevented || key.isComposing || key.keyCode === 229 || !unmodified(key) ||
          !['Enter', ' '].includes(key.key)) return;
      const target = this.target(current, event.target) ?? this.keyboardTarget(current, event.target);
      if (!target) return;
      event.preventDefault(); event.stopPropagation(); this.open(target, true);
    };
    current.removeListeners.push(guardTouchScrollClicks(host));
    for (const type of ['pointerdown', 'mousedown']) current.removeListeners.push(listen(host, type, press, true));
    current.removeListeners.push(listen(host, 'click', click, true), listen(host, 'keydown', keydown, true));
    this.bindings.set(view, current);
    this.refreshCellMarkers(current);
  }

  /** Only cells whose native renderer is handled by this picker may collapse
   * the native removal affordance. Unknown/read-only cells keep native controls. */
  private refreshCellMarkers(binding: Binding) {
    const current = new Set<HTMLElement>();
    for (const anchor of binding.view.containerEl.querySelectorAll('.bases-td[data-property]') as NodeListOf<HTMLElement>) {
      try {if (this.target(binding, anchor)) current.add(anchor);} catch { /* Keep the native renderer on unknown structures. */ }
    }
    for (const anchor of binding.markedCells) if (!current.has(anchor)) anchor.classList.remove('bui-tag-picker-cell');
    for (const anchor of current) anchor.classList.add('bui-tag-picker-cell');
    binding.markedCells = current;
  }

  private target(binding: Binding, target: EventTarget | null): Target | null {
    const el = element(target), {view} = binding;
    const anchor = el?.closest<HTMLElement>('.bases-td[data-property]');
    if (!anchor || !view.containerEl.contains(anchor) || !binding.host.contains(anchor)) return null;
    const property = anchor.dataset.property?.replace(/^note\./, '') as Property;
    if (!anchor.dataset.property?.startsWith('note.') || !PROPERTIES.has(property)) return null;
    const cell = view.getCellFromDom(anchor), entry = cell?.renderer?.entry;
    const result = {binding, cell, anchor, entry, property};
    return this.editable(result) ? result : null;
  }

  private keyboardTarget(binding: Binding, target: EventTarget | null): Target | null {
    const {view} = binding, index = view.activeCell;
    if (target !== view.containerEl || !index || view.selection) return null;
    const entry = view.data?.groupedData?.[index.groupIdx]?.entries?.[index.row];
    const row = view.rows?.find((item: Native) => item.entry === entry);
    return this.target(binding, row?.cells?.[index.column]?.el ?? null);
  }

  private editable(target: Target): boolean {
    const {binding, anchor, cell, entry, property} = target, {view} = binding;
    if (!supportsIdeaTagCell(view, cell, property, anchor) ||
        !anchor.isConnected || !binding.host.contains(anchor) || !view.containerEl.contains(anchor) ||
        cell.renderer.entry?.file?.path !== entry.file.path ||
        anchor.dataset.property !== `note.${property}`) return false;
    // Obsidian marks unsupported/read-only property renderers disabled. Do not
    // provide another write path around those controls or a read-only ancestor.
    const style = anchor.ownerDocument.defaultView?.getComputedStyle(anchor);
    if (style?.display === 'none' || style?.visibility === 'hidden') return false;
    return true;
  }

  private entries(view: Native): Native[] {
    // Native query results are already scoped to this database. Never collect
    // every vault property: unrelated databases may use the same property key.
    const results = view.queryController?.results;
    if (results && typeof results.values === 'function' && typeof results.get === 'function') return Array.from(results.values());
    return Array.isArray(view.data?.data) ? view.data.data : [];
  }

  private currentEntry(edit: Editor): Native | null {
    if (!this.bindings.has(edit.binding.view) || edit.binding.view.config?.query !== edit.query ||
        !this.editable(edit) || edit.cell.renderer.entry.file.path !== edit.file.path) return null;
    return this.entries(edit.binding.view).find(entry => entry?.file?.path === edit.file.path &&
      typeof entry.getRawProperty === 'function') ?? null;
  }

  private open(target: Target, keyboard = false) {
    const autoInputFocus = preferPopoverInputFocus(target.anchor, keyboard);
    if (this.editor?.anchor === target.anchor) {
      this.editor.autoInputFocus = autoInputFocus;
      (autoInputFocus ? this.editor.input : this.editor.popup).focus({preventScroll: true}); return;
    }
    this.close();
    this.manager.close();
    if (!this.editable(target)) return;
    const {binding, entry, property, anchor} = target, {view} = binding;
    const doc = anchor.ownerDocument, win = doc.defaultView!;
    const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string) => {
      const el = doc.createElement(tag); el.className = className; return el;
    };
    const popup = make('div', 'bui-tag-editor');
    inheritTagTypography(popup, anchor, view, property);
    popup.tabIndex = -1;
    popup.setAttribute('role', 'dialog'); popup.setAttribute('aria-label', `编辑${property}`);
    const selectedEl = make('div', 'bui-tag-editor-selected'); selectedEl.setAttribute('aria-label', '已选选项');
    const input = make('input', 'bui-tag-editor-search');
    input.type = 'text'; input.placeholder = '选择或创建一个选项'; input.autocomplete = 'off'; input.spellcheck = false;
    input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'true'); input.setAttribute('aria-label', '选择或创建一个选项');
    const optionsEl = make('div', 'bui-tag-editor-options');
    optionsEl.id = `bui-tag-options-${++nextId}`; optionsEl.setAttribute('role', 'listbox');
    optionsEl.setAttribute('aria-label', `${property}选项`);
    if (property === '领域') optionsEl.setAttribute('aria-multiselectable', 'true');
    input.setAttribute('aria-controls', optionsEl.id);
    const statusEl = make('div', 'bui-tag-editor-status'); statusEl.setAttribute('role', 'status'); statusEl.hidden = true;
    popup.append(selectedEl, input, optionsEl, statusEl);
    const orderKey = ideaTagOrderKey(view, property);
    const edit: Editor = {...target, file: entry.file, query: view.config?.query, popup, selectedEl, input,
      optionsEl, statusEl, values: valuesOf(entry.getRawProperty(property), property)!,
      displayedValues: valuesOf(entry.getRawProperty(property), property)!, saving: false, closeOnSync: false, lastAttemptFailed: false,
      observedValues: valuesOf(entry.getRawProperty(property), property)!, awaitingValues: [], choices: [], active: 0,
      orderKey, order: this.readOrder(orderKey), ignoreClick: false,
      composing: false, imeEnded: false, busy: false, autoInputFocus, removeListeners: []};
    this.editor = edit;
    // Keep native keyboard navigation on this row after the popover closes.
    const index = view.getCellIndex?.(target.cell);
    if (index) {view.activeCell = index; view.selection = null;}
    doc.body.append(popup);
    input.addEventListener('input', () => {this.cancelDrag(edit); edit.active = 0; this.renderOptions(edit);});
    input.addEventListener('compositionstart', () => {edit.composing = true; edit.imeEnded = false;});
    input.addEventListener('compositionend', () => {
      edit.composing = false; edit.imeEnded = true; this.renderOptions(edit);
      win.setTimeout(() => {edit.imeEnded = false;}, 0);
    });
    popup.addEventListener('keydown', event => this.keydown(edit, event));
    popup.addEventListener('pointerdown', () => {
      if (!edit.drag) edit.ignoreClick = false;
      if (!preferPopoverInputFocus(popup)) edit.autoInputFocus = false;
    }, true);
    popup.addEventListener('click', event => {
      if (!edit.ignoreClick) return;
      edit.ignoreClick = false; event.preventDefault(); event.stopImmediatePropagation();
    }, true);
    // Buttons do not steal focus from the search field or create a blur commit.
    optionsEl.addEventListener('mousedown', event => event.preventDefault());
    const outside = (event: Event) => {
      if (this.editor !== edit) return;
      const target = event.target as Node | null;
      if (target && !popup.contains(target)) this.close();
    };
    const cellObserver = new win.MutationObserver(() => this.syncCommittedEditor(binding));
    cellObserver.observe(anchor, {subtree: true, childList: true, characterData: true});
    edit.removeListeners.push(() => cellObserver.disconnect());
    edit.removeListeners.push(guardTouchScrollClicks(popup), watchPopoverViewport(popup, () => this.position(edit)));
    edit.removeListeners.push(listen(doc, 'pointerdown', outside, true), listen(doc, 'mousedown', outside, true),
      listen(doc, 'focusin', outside, true));
    this.renderSelected(edit); this.renderOptions(edit); this.position(edit);
    (autoInputFocus ? input : popup).focus({preventScroll: true});
  }

  private chip(edit: Editor, value: string): HTMLElement {
    const chip = edit.popup.ownerDocument.createElement('span');
    chip.className = 'bui-tag-editor-chip bui-native-tag'; chip.dataset.buiTone = ideaTone(value, edit.property); chip.textContent = value;
    return chip;
  }

  private renderSelected(edit: Editor) {
    edit.selectedEl.replaceChildren();
    edit.selectedEl.hidden = edit.displayedValues.length === 0;
    for (const value of edit.displayedValues) edit.selectedEl.append(this.chip(edit, value));
  }

  private renderOptions(edit: Editor) {
    // A selected value hidden from the candidate catalog must remain available
    // here so it can still be explicitly unchecked.
    const values = new Set([...this.catalog(edit.binding.view, edit.property, edit.displayedValues).values, ...edit.displayedValues]);
    const query = edit.input.value.trim(), lower = query.toLocaleLowerCase();
    edit.choices = applyTagOrder([...values], edit.order).filter(value => !lower || value.toLocaleLowerCase().includes(lower)).map(value => ({value, create: false}));
    if (query && !values.has(query)) edit.choices.push({value: query, create: true});
    edit.active = Math.max(0, Math.min(edit.active, edit.choices.length - 1));
    edit.optionsEl.replaceChildren();
    edit.choices.forEach((choice, index) => {
      const row = edit.popup.ownerDocument.createElement('div');
      row.className = 'bui-tag-editor-option'; row.id = `${edit.optionsEl.id}-${index}`;
      row.setAttribute('role', 'option'); row.setAttribute('aria-selected', String(edit.displayedValues.includes(choice.value)));
      row.setAttribute('aria-posinset', String(index + 1)); row.setAttribute('aria-setsize', String(edit.choices.length));
      row.setAttribute('aria-disabled', String(edit.busy));
      row.classList.toggle('is-selected', edit.displayedValues.includes(choice.value));
      row.dataset.value = choice.value;
      if (!query && !choice.create && edit.choices.length > 1) {
        const grip = edit.popup.ownerDocument.createElement('button');
        grip.type = 'button'; grip.className = 'bui-tag-editor-grip'; grip.disabled = edit.busy;
        grip.setAttribute('aria-label', `调整 ${choice.value} 顺序`);
        grip.setAttribute('aria-keyshortcuts', 'Alt+ArrowUp Alt+ArrowDown');
        grip.title = '拖动调整顺序；Alt + ↑ / ↓'; setIcon(grip, 'grip-vertical');
        grip.addEventListener('focus', () => {
          edit.active = edit.choices.findIndex(item => item.value === choice.value); this.highlight(edit);
        });
        row.addEventListener('pointerdown', event => this.beginDrag(edit, choice.value, row, event));
        grip.addEventListener('click', event => {event.preventDefault(); event.stopPropagation();});
        row.append(grip);
      }
      if (choice.create) {
        row.classList.add('bui-tag-editor-create');
        const label = edit.popup.ownerDocument.createElement('span');
        label.className = 'bui-tag-editor-option-label'; label.textContent = '创建'; row.append(label);
      }
      row.append(this.chip(edit, choice.value));
      row.addEventListener('pointermove', () => {
        const current = edit.choices.findIndex(item => item.value === choice.value);
        if (!edit.drag && edit.active !== current) {edit.active = current; this.highlight(edit);}
      });
      row.addEventListener('click', event => {
        if (edit.ignoreClick) {edit.ignoreClick = false; event.preventDefault(); event.stopPropagation(); return;}
        if (edit.drag || element(event.target)?.closest('.bui-tag-editor-grip')) return;
        void this.change(edit, choice.value);
      });
      edit.optionsEl.append(row);
    });
    this.highlight(edit);
    this.position(edit);
  }

  private highlight(edit: Editor) {
    const rows = [...edit.optionsEl.children] as HTMLElement[];
    rows.forEach((row, index) => row.classList.toggle('is-active', index === edit.active));
    const active = rows[edit.active];
    if (active) edit.input.setAttribute('aria-activedescendant', active.id);
    else edit.input.removeAttribute('aria-activedescendant');
  }

  private beginDrag(edit: Editor, value: string, row: HTMLElement, event: PointerEvent) {
    if (this.editor !== edit || edit.busy || edit.composing || edit.drag || edit.input.value.trim() ||
        event.button !== 0 || !unmodified(event) || !this.currentEntry(edit)) return;
    const fromGrip = !!element(event.target)?.closest('.bui-tag-editor-grip');
    const hold = event.pointerType === 'touch' && !fromGrip;
    // Leave normal touches available for native list scrolling. Only a brief
    // stationary hold claims an entire row; grips remain immediate handles.
    if (fromGrip) event.preventDefault();
    event.stopPropagation();
    const doc = edit.popup.ownerDocument, win = doc.defaultView!;
    const order = edit.choices.filter(choice => !choice.create).map(choice => choice.value);
    const drag: Drag = {pointerId: event.pointerId, value, row, startX: event.clientX, startY: event.clientY,
      moved: false, activated: false, original: order, preview: [...order], motion: new TagDragMotion(edit.optionsEl, row, event.clientX, event.clientY), removeListeners: []};
    edit.drag = drag; edit.active = order.indexOf(value); this.highlight(edit);
    const activate = (x: number, y: number) => {
      if (edit.drag !== drag || drag.activated) return;
      if (this.editor !== edit || !this.currentEntry(edit)) {this.cancelDrag(edit, false); return;}
      drag.activated = true;
      edit.popup.classList.add('is-reordering'); row.classList.add('is-dragging');
      // Capture only once a drag starts. A normal row tap must retain its click
      // target so it can toggle the option rather than being swallowed.
      try {edit.optionsEl.setPointerCapture?.(event.pointerId);} catch { /* Document fallback. */ }
      drag.motion.move(x, y);
    };
    if (hold) drag.holdTimer = win.setTimeout(() => activate(drag.startX, drag.startY), 180);
    const touchmove = (next: TouchEvent) => {
      // iOS ignores preventDefault on pointermove for native panning. Claim
      // the touch only after the hold, through an explicitly non-passive hook.
      if (edit.drag === drag && drag.activated && next.touches.length === 1 && next.cancelable) next.preventDefault();
    };
    doc.addEventListener('touchmove', touchmove, {capture: true, passive: false});
    drag.removeListeners.push(() => doc.removeEventListener('touchmove', touchmove, true));
    const move = (raw: Event) => {
      const next = raw as PointerEvent;
      if (edit.drag !== drag || next.pointerId !== drag.pointerId) return;
      const distance = Math.hypot(next.clientX - drag.startX, next.clientY - drag.startY);
      if (hold && !drag.activated) {
        // Movement before the hold belongs to scrolling, never reordering.
        if (distance > 8) this.cancelDrag(edit, false);
        return;
      }
      if (!drag.moved && distance < (next.pointerType === 'touch' ? 8 : 4)) return;
      next.preventDefault(); next.stopPropagation();
      activate(next.clientX, next.clientY); drag.moved = true;
      drag.motion.move(next.clientX, next.clientY);
      const bounds = edit.optionsEl.getBoundingClientRect();
      if (next.clientY < bounds.top + 16) edit.optionsEl.scrollTop -= 12;
      else if (next.clientY > bounds.bottom - 16) edit.optionsEl.scrollTop += 12;
      const rows = [...edit.optionsEl.children] as HTMLElement[];
      const others = rows.filter(item => item !== row);
      const before = others.findIndex(item => {
        const rect = drag.motion.rect(item); return next.clientY < rect.top + rect.height / 2;
      });
      const index = before < 0 ? others.length : before;
      others.splice(index, 0, row);
      const preview = others.map(item => item.dataset.value!);
      if (preview.every((item, at) => item === drag.preview[at])) return;
      drag.preview = preview;
      // Keep each native-valued option node and pointer capture intact; only
      // the local popup candidate order changes during the preview.
      drag.motion.reorder(others);
      edit.choices = preview.map(item => ({value: item, create: false}));
      edit.active = index; this.highlight(edit);
    };
    const finish = (raw: Event) => {
      const next = raw as PointerEvent;
      if (edit.drag !== drag || next.pointerId !== drag.pointerId) return;
      if (!drag.activated && !drag.moved) {
        // Do not rerender: the browser still needs this same row for click.
        this.finishDrag(edit, false, false, false); return;
      }
      next.preventDefault(); next.stopPropagation();
      const rect = edit.optionsEl.getBoundingClientRect();
      const inside = next.clientX >= rect.left && next.clientX <= rect.right && next.clientY >= rect.top && next.clientY <= rect.bottom;
      this.finishDrag(edit, inside);
      if (this.editor === edit) (edit.autoInputFocus && next.pointerType !== 'touch' ? edit.input : edit.popup).focus({preventScroll: true});
    };
    const cancel = (raw: Event) => {
      if ('pointerId' in raw && (raw as PointerEvent).pointerId !== drag.pointerId) return;
      this.cancelDrag(edit);
    };
    drag.removeListeners.push(listen(doc, 'pointermove', move, true), listen(doc, 'pointerup', finish, true),
      listen(doc, 'pointercancel', cancel, true), listen(edit.optionsEl, 'lostpointercapture', cancel), listen(win, 'blur', cancel));
  }

  private finishDrag(edit: Editor, commit: boolean, render = true, suppressClick = true) {
    const drag = edit.drag;
    if (!drag) return;
    // Some platforms synthesize click after release even without pointer
    // capture. Swallow that click; the next genuine press clears this guard.
    edit.ignoreClick = suppressClick;
    if (drag.holdTimer !== undefined) edit.popup.ownerDocument.defaultView!.clearTimeout(drag.holdTimer);
    for (const remove of drag.removeListeners) remove();
    drag.removeListeners = [];
    try {edit.optionsEl.releasePointerCapture?.(drag.pointerId);} catch { /* Capture may already have been cancelled. */ }
    const complete = () => {
      if (edit.drag !== drag) return;
      edit.drag = undefined; drag.motion.dispose();
      edit.popup.classList.remove('is-reordering'); drag.row.classList.remove('is-dragging');
      if (commit && drag.moved && drag.original.some((value, index) => drag.preview[index] !== value)) {
        this.saveOrder(edit, drag.original, drag.preview, drag.value);
      } else if (render && drag.moved && this.editor === edit) {
        this.renderOptions(edit); edit.active = Math.max(0, edit.choices.findIndex(choice => choice.value === drag.value)); this.highlight(edit);
      }
    };
    if (commit && drag.moved) {
      if (drag.settling) return;
      drag.settling = true; drag.motion.finish(complete);
    } else complete();
  }

  private cancelDrag(edit: Editor, render = true) {this.finishDrag(edit, false, render);}

  private moveChoice(edit: Editor, direction: number) {
    if (edit.busy || edit.drag || edit.composing || edit.input.value.trim() || !this.currentEntry(edit)) return;
    const values = edit.choices.filter(choice => !choice.create).map(choice => choice.value);
    const from = edit.active, to = from + direction;
    if (from < 0 || to < 0 || to >= values.length) return;
    const next = [...values], value = next.splice(from, 1)[0]; next.splice(to, 0, value);
    this.saveOrder(edit, values, next, value);
    (edit.optionsEl.children[edit.active] as HTMLElement | undefined)?.scrollIntoView?.({block: 'nearest'});
  }

  private saveOrder(edit: Editor, visible: string[], next: string[], activeValue: string) {
    if (this.editor !== edit || !this.currentEntry(edit) || ideaTagOrderKey(edit.binding.view, edit.property) !== edit.orderKey) return;
    const previous = [...edit.order], order = mergeTagOrder(previous, visible, next);
    if (JSON.stringify(order) === JSON.stringify(previous)) return;
    edit.order = order;
    if (edit.orderKey) this.orders.set(edit.orderKey, order);
    this.renderOptions(edit); edit.active = Math.max(0, edit.choices.findIndex(choice => choice.value === activeValue)); this.highlight(edit);
    if (!edit.orderKey || !this.orderStore) return;
    const key = edit.orderKey;
    // The injected adapter persists plugin data, never selected note values.
    // It owns save serialisation so it can safely coexist with other settings.
    void Promise.resolve().then(() => this.orderStore!.write(key, [...order])).catch(() => {
      if (this.orders.get(key) === order) {
        this.orders.set(key, previous);
        if (this.editor === edit) {
          this.cancelDrag(edit, false); edit.order = previous; this.renderOptions(edit);
          edit.statusEl.textContent = '选项顺序未能保存，请重试'; edit.statusEl.hidden = false;
          return;
        }
      }
      new Notice('选项顺序未能保存，请重试');
    });
  }

  private keydown(edit: Editor, event: KeyboardEvent) {
    if (event.isComposing || edit.composing || event.keyCode === 229) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation();
      if (edit.drag) this.cancelDrag(edit);
      else this.close(true);
      return;
    }
    const grip = element(event.target)?.closest('.bui-tag-editor-grip');
    if (grip && event.altKey && !event.ctrlKey && !event.metaKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault(); event.stopPropagation();
      const value = grip.closest<HTMLElement>('.bui-tag-editor-option')?.dataset.value;
      edit.active = edit.choices.findIndex(choice => choice.value === value);
      this.moveChoice(edit, event.key === 'ArrowDown' ? 1 : -1);
      edit.optionsEl.children[edit.active]?.querySelector<HTMLElement>('.bui-tag-editor-grip')?.focus({preventScroll: true});
      return;
    }
    if (event.target !== edit.input) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault(); event.stopPropagation();
      if (event.altKey && !event.ctrlKey && !event.metaKey) {
        this.moveChoice(edit, event.key === 'ArrowDown' ? 1 : -1); return;
      }
      const count = edit.choices.length;
      if (count) edit.active = (edit.active + (event.key === 'ArrowDown' ? 1 : -1) + count) % count;
      this.highlight(edit);
      (edit.optionsEl.children[edit.active] as HTMLElement | undefined)?.scrollIntoView?.({block: 'nearest'});
    } else if (event.key === 'Enter') {
      event.preventDefault(); event.stopPropagation();
      const choice = edit.choices[edit.active];
      if (choice && !edit.imeEnded) void this.change(edit, choice.value);
    }
  }

  private async change(edit: Editor, value: string) {
    if (this.editor !== edit || edit.busy || edit.composing || edit.drag) return;
    const entry = this.currentEntry(edit);
    if (!entry) {this.close(); return;}
    let observed: string[] | null;
    try {observed = valuesOf(entry.getRawProperty(edit.property), edit.property);} catch {this.close(); return;}
    if (!observed) {this.close(); return;}
    // Bases refreshes query entries asynchronously after updateProperty. Keep
    // explicit additions made in this popover until those results catch up;
    // never lose an earlier selection when two different tags are added fast.
    const key = JSON.stringify(observed);
    if (key !== JSON.stringify(edit.observedValues)) {
      const acknowledged = edit.awaitingValues.findIndex(values => JSON.stringify(values) === key);
      edit.observedValues = observed;
      if (acknowledged >= 0) {
        edit.awaitingValues.splice(0, acknowledged + 1);
        if (!edit.awaitingValues.length) edit.values = observed;
      } else {
        // A distinct external value is authoritative; apply the user's next
        // explicit addition/removal to that value rather than a stale copy.
        edit.awaitingValues = []; edit.values = observed;
      }
    }
    const current = edit.values, remove = current.includes(value);
    const next = remove ? current.filter(item => item !== value) : edit.property === '领域'
      ? current.includes(value) ? current : [...current, value] : [value];
    if (JSON.stringify(next) === JSON.stringify(current)) {
      if (edit.property !== '领域' && !remove) this.close(true);
      else {this.renderSelected(edit); this.renderOptions(edit);}
      return;
    }
    const submittedInput = edit.input.value;
    // A newer explicit attempt supersedes the previous write's UI completion
    // effects, even when that older successful value is still being indexed.
    if (edit.syncTimer !== undefined) edit.popup.ownerDocument.defaultView!.clearTimeout(edit.syncTimer);
    edit.syncTimer = undefined; edit.closeOnSync = false; edit.clearInputOnSync = undefined; edit.lastAttemptFailed = false;
    edit.saving = true; this.setBusy(edit, true); edit.statusEl.hidden = true;
    try {
      // This is the native property renderer's write API. It records a Bases
      // transaction for undo/redo and keeps the native permission/write path.
      await edit.binding.view.updateProperty(edit.file, edit.property, rawValue(next, edit.property));
      if (this.editor !== edit) return;
      edit.values = next; edit.awaitingValues.push(next); edit.pendingDisplay = next;
      edit.clearInputOnSync = submittedInput; edit.closeOnSync = edit.property !== '领域';
    } catch {
      if (this.editor === edit) {
        edit.lastAttemptFailed = true; edit.statusEl.textContent = '未能保存，请重试'; edit.statusEl.hidden = false;
      } else new Notice('标签未能保存，请重试');
    } finally {
      edit.saving = false;
      if (this.editor === edit) {
        if (edit.pendingDisplay) {
          this.syncCommittedEditor(edit.binding);
          if (this.editor === edit && edit.pendingDisplay && !edit.lastAttemptFailed) this.waitForDisplay(edit);
        }
        if (this.editor === edit && (!edit.pendingDisplay || edit.lastAttemptFailed)) this.setBusy(edit, false);
      }
    }
  }

  private setBusy(edit: Editor, busy: boolean) {
    edit.busy = busy;
    if (busy) edit.popup.setAttribute('aria-busy', 'true'); else edit.popup.removeAttribute('aria-busy');
    // Keep option and selected-chip nodes stable while the write is in flight.
    // Rebuilding the old state here visibly flashed twice on iPhone.
    for (const row of edit.optionsEl.querySelectorAll<HTMLElement>('[role="option"]')) row.setAttribute('aria-disabled', String(busy));
    for (const grip of edit.optionsEl.querySelectorAll<HTMLButtonElement>('.bui-tag-editor-grip')) grip.disabled = busy;
  }

  /** A native write resolves before Bases necessarily renders its new query
   * result. Publish popup state only when both the query and native renderer
   * acknowledge it, in the same decoration pass before the browser paints. */
  private syncCommittedEditor(binding: Binding) {
    const edit = this.editor;
    if (!edit || edit.binding !== binding || edit.saving || !edit.pendingDisplay) return;
    const entry = this.currentEntry(edit);
    if (!entry) {this.close(); return;}
    let actual: string[] | null, rendered: string[] | null;
    try {actual = valuesOf(entry.getRawProperty(edit.property), edit.property);} catch {return;}
    if (!actual) return;
    rendered = actual;
    // Guarded native Bases property renderer stores the exact rendered raw
    // value in val. Unknown renderer versions safely use the real query data.
    if (typeof edit.cell.renderer.val === 'string') {
      try {rendered = valuesOf(JSON.parse(edit.cell.renderer.val), edit.property) ?? actual;} catch { /* Native fallback. */ }
    }
    const expected = JSON.stringify(edit.pendingDisplay), current = JSON.stringify(actual);
    if (JSON.stringify(rendered) !== current) return;
    if (current !== expected) {
      if (current === JSON.stringify(edit.observedValues)) {
        // change() can observe new query data before that value is rendered.
        // Its later cell acknowledgement must still update the visible popup,
        // while the newer committed selection continues waiting separately.
        if (current !== JSON.stringify(edit.displayedValues)) {
          edit.displayedValues = [...actual]; this.renderSelected(edit); this.renderOptions(edit);
        }
        return;
      }
      // Another acknowledged write may win while our notification is delayed.
      // Follow the actually displayed native value rather than keeping stale
      // chips or replaying the previous transaction to force it back.
      const acknowledged = edit.awaitingValues.findIndex(values => JSON.stringify(values) === current);
      if (acknowledged >= 0) {
        // Advance the observed baseline too: if native undo later returns to
        // the original value, it is a new external change, not stale data.
        edit.observedValues = [...actual]; edit.awaitingValues.splice(0, acknowledged + 1);
        edit.displayedValues = [...actual]; this.renderSelected(edit); this.renderOptions(edit); return;
      }
      edit.values = [...actual];
    }
    edit.displayedValues = [...actual]; edit.observedValues = [...actual]; edit.awaitingValues = [];
    edit.pendingDisplay = undefined;
    if (edit.syncTimer !== undefined) edit.popup.ownerDocument.defaultView!.clearTimeout(edit.syncTimer);
    edit.syncTimer = undefined; this.setBusy(edit, false);
    if (!edit.lastAttemptFailed) edit.statusEl.hidden = true;
    const unchangedInput = !edit.lastAttemptFailed && !edit.composing && edit.input.value === edit.clearInputOnSync;
    if (edit.closeOnSync && unchangedInput) {this.close(true); return;}
    if (unchangedInput) {edit.input.value = ''; edit.active = 0;}
    edit.clearInputOnSync = undefined; edit.closeOnSync = false;
    this.renderSelected(edit); this.renderOptions(edit);
    if (edit.autoInputFocus && !edit.composing) edit.input.focus({preventScroll: true});
    else if (!edit.popup.contains(edit.popup.ownerDocument.activeElement)) edit.popup.focus({preventScroll: true});
  }

  private waitForDisplay(edit: Editor) {
    if (edit.syncTimer !== undefined) edit.popup.ownerDocument.defaultView!.clearTimeout(edit.syncTimer);
    edit.syncTimer = edit.popup.ownerDocument.defaultView!.setTimeout(() => {
      edit.syncTimer = undefined;
      if (this.editor !== edit || edit.saving || edit.lastAttemptFailed || !edit.pendingDisplay) return;
      // If data already arrived but its normal debounced notification did not,
      // flush only that native notification. Never alter a query entry or cell
      // contents to simulate acknowledgement.
      try {
        const actual = valuesOf(this.currentEntry(edit)?.getRawProperty(edit.property), edit.property);
        const notify = edit.binding.view.queryController?.requestNotifyView;
        if (JSON.stringify(actual) === JSON.stringify(edit.pendingDisplay) && typeof notify?.run === 'function') notify.run();
      } catch { /* An unknown native scheduler simply keeps its usual timing. */ }
      this.syncCommittedEditor(edit.binding);
      if (this.editor !== edit || edit.lastAttemptFailed || !edit.pendingDisplay) return;
      // A slow index must not freeze the input indefinitely. Keep the last
      // actually rendered selection; a later native paint still acknowledges
      // the committed value. Explicit later edits retain the logical value.
      this.setBusy(edit, false);
      edit.statusEl.textContent = '已保存，等待表格刷新'; edit.statusEl.hidden = false;
    }, 500);
  }

  private position(edit: Editor) {
    if (this.editor !== edit || !edit.popup.isConnected) return;
    if (!this.currentEntry(edit)) {this.close(); return;}
    if (!positionAnchoredPopover(edit.anchor, edit.popup, 240)) this.close();
  }

  private close(restoreFocus = false) {
    const edit = this.editor;
    if (!edit) return;
    this.cancelDrag(edit, false);
    this.editor = undefined;
    if (edit.syncTimer !== undefined) edit.popup.ownerDocument.defaultView!.clearTimeout(edit.syncTimer);
    for (const remove of edit.removeListeners) remove();
    edit.popup.remove();
    if (restoreFocus && edit.binding.view.containerEl?.isConnected) edit.binding.view.focus?.();
  }

  private detach(binding: Binding) {
    if (this.editor?.binding === binding) this.close();
    for (const remove of binding.removeListeners) remove();
    for (const anchor of binding.markedCells) anchor.classList.remove('bui-tag-picker-cell');
    binding.markedCells.clear();
    this.bindings.delete(binding.view);
  }

  /** Call after a scan; a recycled row or a replaced/filtered view cannot keep
   * an editor attached to a different file. */
  prune() {
    this.manager.prune();
    for (const binding of this.bindings.values()) {
      if (!binding.host.isConnected || binding.view._loaded === false || binding.view.config?.name !== '想法收集箱') this.detach(binding);
      else this.refreshCellMarkers(binding);
    }
    if (this.editor && !this.currentEntry(this.editor)) this.close();
  }

  clear() {
    this.manager.close();
    this.close();
    for (const binding of this.bindings.values()) this.detach(binding);
  }
}
