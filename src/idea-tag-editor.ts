import {Notice, setIcon} from 'obsidian';
import {ideaTone} from './idea-table';
import {applyTagOrder, cleanTagOrder, ideaTagOrderKey, mergeTagOrder, IdeaTagOrderStore} from './idea-tag-order';
export type {IdeaTagOrderStore} from './idea-tag-order';

// Bases has no public cell-editor extension point. If this guarded adapter no
// longer recognises the native renderer, leave that cell's native editor alone.
type Native = any;
type Property = '领域' | '类型' | '重要性';
type Value = string | string[];
type Binding = {view: Native; host: HTMLElement; removeListeners: (() => void)[]};
type Target = {binding: Binding; cell: Native; anchor: HTMLElement; entry: Native; property: Property};
type Choice = {value: string; create: boolean};
type Drag = {
  pointerId: number; value: string; row: HTMLElement; startX: number; startY: number; moved: boolean;
  original: string[]; preview: string[]; removeListeners: (() => void)[];
};
type Editor = Target & {
  file: Native; query: Native; popup: HTMLElement; selectedEl: HTMLElement; input: HTMLInputElement;
  optionsEl: HTMLElement; statusEl: HTMLElement; values: string[]; choices: Choice[]; active: number;
  observedValues: string[]; awaitingValues: string[][];
  orderKey: string | null; order: string[]; drag?: Drag; ignoreClick: boolean;
  composing: boolean; imeEnded: boolean; busy: boolean; removeListeners: (() => void)[];
};
const PROPERTIES = new Set(['领域', '类型', '重要性']);
const READ_ONLY = '[disabled], [aria-disabled="true"], [aria-readonly="true"], [data-readonly="true"], ' +
  '[hidden], .is-disabled, .disabled, .is-read-only, .is-readonly, .mod-readonly';
let nextId = 0;

function listen(target: EventTarget, type: string, listener: EventListener, capture = false): () => void {
  target.addEventListener(type, listener, capture);
  return () => target.removeEventListener(type, listener, capture);
}
function element(target: EventTarget | null): HTMLElement | null {
  return target && (target as Node).nodeType === 1 ? target as HTMLElement : null;
}
function valuesOf(value: unknown, property: Property): string[] | null {
  if (value == null) return [];
  if (property === '领域') {
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) return null;
    return [...new Set(value.filter(item => item.length > 0))];
  }
  return typeof value === 'string' ? value ? [value] : [] : null;
}
function rawValue(values: string[], property: Property): Value {
  return property === '领域' ? values : values[0] ?? '';
}
function unmodified(event: MouseEvent | KeyboardEvent): boolean {
  return !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
}

/** A popover for three native idea-table properties. Only explicit option and
 * remove actions call Bases.updateProperty, preserving its transaction/undo
 * path. Opening, filtering, blur and cancellation never write note data.
 */
export class IdeaTagEditors {
  private bindings = new Map<Native, Binding>();
  private editor?: Editor;
  private orders = new Map<string, string[]>();

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

  attach(view: Native) {
    const container = view?.containerEl as HTMLElement | undefined;
    const candidate = view?.queryController?.viewContainerEl as HTMLElement | undefined;
    const host = candidate?.contains(container!) ? candidate : container?.parentElement;
    if (!host || !container || view?.type !== 'table' || view.config?.name !== '想法收集箱' ||
        typeof view.getCellFromDom !== 'function' || typeof view.updateProperty !== 'function' ||
        !container.isConnected || view._loaded === false) return;
    let binding = this.bindings.get(view);
    if (binding && binding.host !== host) {this.detach(binding); binding = undefined;}
    if (binding) return;
    binding = {view, host, removeListeners: []};
    const current = binding;
    // Listen above the table container, before native selection starts editing
    // a text property. Modified clicks and non-tag cells retain native handlers.
    const press = (event: Event) => {
      const mouse = event as MouseEvent;
      if (mouse.button !== 0 || !unmodified(mouse) || !this.target(current, event.target)) return;
      event.preventDefault(); event.stopPropagation();
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
      event.preventDefault(); event.stopPropagation(); this.open(target);
    };
    for (const type of ['pointerdown', 'mousedown']) current.removeListeners.push(listen(host, type, press, true));
    current.removeListeners.push(listen(host, 'click', click, true), listen(host, 'keydown', keydown, true));
    this.bindings.set(view, current);
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
    if (view._loaded === false || view.isReadOnly === true || view.readOnly === true ||
        view.type !== 'table' || view.config?.name !== '想法收集箱' ||
        !anchor.isConnected || !binding.host.contains(anchor) || !view.containerEl.contains(anchor) ||
        typeof view.updateProperty !== 'function' || !cell?.renderer?.propertyEditor ||
        entry?.file?.extension !== 'md' || typeof entry.getRawProperty !== 'function' ||
        cell.renderer.entry?.file?.path !== entry.file.path ||
        anchor.dataset.property !== `note.${property}`) return false;
    // Obsidian marks unsupported/read-only property renderers disabled. Do not
    // provide another write path around those controls or a read-only ancestor.
    if (anchor.closest(READ_ONLY) || anchor.querySelector(`.bases-table-cell:is(${READ_ONLY})`)) return false;
    const style = anchor.ownerDocument.defaultView?.getComputedStyle(anchor);
    if (style?.display === 'none' || style?.visibility === 'hidden') return false;
    try {return valuesOf(entry.getRawProperty(property), property) !== null;} catch {return false;}
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

  private open(target: Target) {
    if (this.editor?.anchor === target.anchor) {this.editor.input.focus(); return;}
    this.close();
    if (!this.editable(target)) return;
    const {binding, entry, property, anchor} = target, {view} = binding;
    const doc = anchor.ownerDocument, win = doc.defaultView!;
    const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string) => {
      const el = doc.createElement(tag); el.className = className; return el;
    };
    const popup = make('div', 'bui-tag-editor');
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
      observedValues: valuesOf(entry.getRawProperty(property), property)!, awaitingValues: [], choices: [], active: 0,
      orderKey, order: this.readOrder(orderKey), ignoreClick: false,
      composing: false, imeEnded: false, busy: false, removeListeners: []};
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
    popup.addEventListener('pointerdown', () => {if (!edit.drag) edit.ignoreClick = false;}, true);
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
    const reposition = (event: Event) => {
      if (!popup.contains(event.target as Node)) this.position(edit);
    };
    edit.removeListeners.push(listen(doc, 'pointerdown', outside, true), listen(doc, 'mousedown', outside, true),
      listen(doc, 'focusin', outside, true), listen(doc, 'scroll', reposition, true), listen(win, 'resize', reposition));
    this.renderSelected(edit); this.renderOptions(edit); this.position(edit); input.focus({preventScroll: true});
  }

  private chip(edit: Editor, value: string): HTMLElement {
    const chip = edit.popup.ownerDocument.createElement('span');
    chip.className = 'bui-tag-editor-chip bui-native-tag'; chip.dataset.buiTone = ideaTone(value, edit.property); chip.textContent = value;
    return chip;
  }

  private renderSelected(edit: Editor) {
    edit.selectedEl.replaceChildren();
    edit.selectedEl.hidden = edit.values.length === 0;
    for (const value of edit.values) {
      const chip = this.chip(edit, value), button = edit.popup.ownerDocument.createElement('button');
      button.type = 'button'; button.className = 'bui-tag-editor-remove'; button.disabled = edit.busy;
      button.setAttribute('aria-label', `移除 ${value}`); button.title = `移除 ${value}`; setIcon(button, 'x');
      button.addEventListener('click', () => {void this.change(edit, value, true);});
      chip.append(button); edit.selectedEl.append(chip);
    }
  }

  private renderOptions(edit: Editor) {
    const values = new Set<string>();
    for (const entry of this.entries(edit.binding.view)) {
      if (typeof entry?.getRawProperty !== 'function') continue;
      try {for (const value of valuesOf(entry.getRawProperty(edit.property), edit.property) ?? []) values.add(value);} catch { /* Skip unsupported entries. */ }
    }
    for (const value of edit.values) values.add(value);
    const query = edit.input.value.trim(), lower = query.toLocaleLowerCase();
    edit.choices = applyTagOrder([...values], edit.order).filter(value => !lower || value.toLocaleLowerCase().includes(lower)).map(value => ({value, create: false}));
    if (query && !values.has(query)) edit.choices.push({value: query, create: true});
    edit.active = Math.max(0, Math.min(edit.active, edit.choices.length - 1));
    edit.optionsEl.replaceChildren();
    edit.choices.forEach((choice, index) => {
      const row = edit.popup.ownerDocument.createElement('div');
      row.className = 'bui-tag-editor-option'; row.id = `${edit.optionsEl.id}-${index}`;
      row.setAttribute('role', 'option'); row.setAttribute('aria-selected', String(edit.values.includes(choice.value)));
      row.setAttribute('aria-posinset', String(index + 1)); row.setAttribute('aria-setsize', String(edit.choices.length));
      row.setAttribute('aria-disabled', String(edit.busy));
      row.classList.toggle('is-selected', edit.values.includes(choice.value));
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
        grip.addEventListener('pointerdown', event => this.beginDrag(edit, choice.value, row, event));
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
        void this.change(edit, choice.value, false);
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
    event.preventDefault(); event.stopPropagation();
    const doc = edit.popup.ownerDocument, win = doc.defaultView!;
    const order = edit.choices.filter(choice => !choice.create).map(choice => choice.value);
    const drag: Drag = {pointerId: event.pointerId, value, row, startX: event.clientX, startY: event.clientY,
      moved: false, original: order, preview: [...order], removeListeners: []};
    edit.drag = drag; edit.active = order.indexOf(value); this.highlight(edit);
    // Capture on the stationary list, not a row that moves in the DOM. The
    // resulting click targets this list, so a completed drag cannot select a tag.
    try {edit.optionsEl.setPointerCapture?.(event.pointerId);} catch { /* Document listeners remain a fallback. */ }
    const move = (raw: Event) => {
      const next = raw as PointerEvent;
      if (edit.drag !== drag || next.pointerId !== drag.pointerId) return;
      next.preventDefault(); next.stopPropagation();
      if (!drag.moved && Math.hypot(next.clientX - drag.startX, next.clientY - drag.startY) < 4) return;
      drag.moved = true; edit.popup.classList.add('is-reordering'); row.classList.add('is-dragging');
      const bounds = edit.optionsEl.getBoundingClientRect();
      if (next.clientY < bounds.top + 16) edit.optionsEl.scrollTop -= 12;
      else if (next.clientY > bounds.bottom - 16) edit.optionsEl.scrollTop += 12;
      const rows = [...edit.optionsEl.children] as HTMLElement[];
      const others = rows.filter(item => item !== row);
      const before = others.findIndex(item => {
        const rect = item.getBoundingClientRect(); return next.clientY < rect.top + rect.height / 2;
      });
      const index = before < 0 ? others.length : before;
      others.splice(index, 0, row);
      const preview = others.map(item => item.dataset.value!);
      if (preview.every((item, at) => item === drag.preview[at])) return;
      drag.preview = preview;
      // Keep each native-valued option node and pointer capture intact; only
      // the local popup candidate order changes during the preview.
      for (const item of others) edit.optionsEl.append(item);
      edit.choices = preview.map(item => ({value: item, create: false}));
      edit.active = index; this.highlight(edit);
    };
    const finish = (raw: Event) => {
      const next = raw as PointerEvent;
      if (edit.drag !== drag || next.pointerId !== drag.pointerId) return;
      next.preventDefault(); next.stopPropagation();
      const rect = edit.optionsEl.getBoundingClientRect();
      const inside = next.clientX >= rect.left && next.clientX <= rect.right && next.clientY >= rect.top && next.clientY <= rect.bottom;
      this.finishDrag(edit, inside);
      if (this.editor === edit) edit.input.focus({preventScroll: true});
    };
    const cancel = (raw: Event) => {
      if ('pointerId' in raw && (raw as PointerEvent).pointerId !== drag.pointerId) return;
      this.cancelDrag(edit);
    };
    drag.removeListeners.push(listen(doc, 'pointermove', move, true), listen(doc, 'pointerup', finish, true),
      listen(doc, 'pointercancel', cancel, true), listen(edit.optionsEl, 'lostpointercapture', cancel), listen(win, 'blur', cancel));
  }

  private finishDrag(edit: Editor, commit: boolean, render = true) {
    const drag = edit.drag;
    if (!drag) return;
    edit.drag = undefined;
    // Some platforms synthesize click after release even without pointer
    // capture. Swallow that click; the next genuine press clears this guard.
    edit.ignoreClick = true;
    for (const remove of drag.removeListeners) remove();
    try {edit.optionsEl.releasePointerCapture?.(drag.pointerId);} catch { /* Capture may already have been cancelled. */ }
    edit.popup.classList.remove('is-reordering'); drag.row.classList.remove('is-dragging');
    if (commit && drag.moved && drag.original.some((value, index) => drag.preview[index] !== value)) {
      this.saveOrder(edit, drag.original, drag.preview, drag.value);
    } else if (render && this.editor === edit) {
      this.renderOptions(edit); edit.active = Math.max(0, edit.choices.findIndex(choice => choice.value === drag.value)); this.highlight(edit);
    }
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
      if (choice && !edit.imeEnded) void this.change(edit, choice.value, false);
    }
  }

  private async change(edit: Editor, value: string, remove: boolean) {
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
    const current = edit.values;
    const next = remove ? current.filter(item => item !== value) : edit.property === '领域'
      ? current.includes(value) ? current : [...current, value] : [value];
    if (JSON.stringify(next) === JSON.stringify(current)) {
      if (edit.property !== '领域' && !remove) this.close(true);
      else {this.renderSelected(edit); this.renderOptions(edit);}
      return;
    }
    edit.busy = true; edit.popup.setAttribute('aria-busy', 'true');
    edit.statusEl.hidden = true; this.renderSelected(edit); this.renderOptions(edit);
    try {
      // This is the native property renderer's write API. It records a Bases
      // transaction for undo/redo and keeps the native permission/write path.
      await edit.binding.view.updateProperty(edit.file, edit.property, rawValue(next, edit.property));
      if (this.editor !== edit) return;
      edit.values = next; edit.awaitingValues.push(next);
      if (edit.property !== '领域') {this.close(true); return;}
      edit.input.value = ''; edit.active = 0;
    } catch {
      if (this.editor === edit) {
        edit.statusEl.textContent = '未能保存，请重试'; edit.statusEl.hidden = false;
      } else new Notice('标签未能保存，请重试');
    } finally {
      edit.busy = false; edit.popup.removeAttribute('aria-busy');
      if (this.editor === edit) {
        this.renderSelected(edit); this.renderOptions(edit); edit.input.focus({preventScroll: true});
      }
    }
  }

  private position(edit: Editor) {
    if (this.editor !== edit || !edit.popup.isConnected) return;
    if (!this.currentEntry(edit)) {this.close(); return;}
    const {popup, anchor} = edit, win = popup.ownerDocument.defaultView!;
    const bounds = anchor.getBoundingClientRect(), margin = 8;
    if (bounds.bottom < 0 || bounds.top > win.innerHeight || bounds.right < 0 || bounds.left > win.innerWidth) {this.close(); return;}
    const width = Math.min(240, Math.max(0, win.innerWidth - margin * 2));
    popup.style.position = 'fixed'; popup.style.width = `${width}px`;
    popup.style.left = `${Math.max(margin, Math.min(bounds.left, win.innerWidth - width - margin))}px`;
    const maximum = Math.max(0, win.innerHeight - margin * 2);
    popup.style.maxHeight = `${maximum}px`;
    const height = Math.min(popup.getBoundingClientRect().height, maximum);
    const below = bounds.bottom + 4, above = bounds.top - height - 4;
    const top = below + height <= win.innerHeight - margin || above < margin ? below : above;
    popup.style.top = `${Math.max(margin, Math.min(top, win.innerHeight - height - margin))}px`;
  }

  private close(restoreFocus = false) {
    const edit = this.editor;
    if (!edit) return;
    this.cancelDrag(edit, false);
    this.editor = undefined;
    for (const remove of edit.removeListeners) remove();
    edit.popup.remove();
    if (restoreFocus && edit.binding.view.containerEl?.isConnected) edit.binding.view.focus?.();
  }

  private detach(binding: Binding) {
    if (this.editor?.binding === binding) this.close();
    for (const remove of binding.removeListeners) remove();
    this.bindings.delete(binding.view);
  }

  /** Call after a scan; a recycled row or a replaced/filtered view cannot keep
   * an editor attached to a different file. */
  prune() {
    for (const binding of this.bindings.values()) {
      if (!binding.host.isConnected || binding.view._loaded === false || binding.view.config?.name !== '想法收集箱') this.detach(binding);
    }
    if (this.editor && !this.currentEntry(this.editor)) this.close();
  }

  clear() {
    this.close();
    for (const binding of this.bindings.values()) this.detach(binding);
  }
}
