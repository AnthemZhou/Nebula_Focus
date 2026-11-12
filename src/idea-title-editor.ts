import {Notice, setIcon} from 'obsidian';

import {IdeaView, IdeaRow, IdeaEntry, IdeaFile, isNativeTableView} from './idea-native';
import {TableTitleProfile, tableTitleProfiles} from './table-profile';
import {guardTouchScrollClicks} from './mobile-popover';
type TitleView = IdeaView & {rows: IdeaRow[]};
type TitleRow = IdeaRow & {entry: IdeaEntry};
function titleView(value: unknown): value is TitleView {
  return isNativeTableView(value) && Array.isArray(value.rows);
}
function titleRow(value: IdeaRow): value is TitleRow {return !!value.entry;}

export type TitleActions = {
  rename(view: unknown, file: IdeaFile, basename: string): unknown;
  open?(view: unknown, file: IdeaFile, event: MouseEvent): unknown;
};

function currentFileLink(link: HTMLElement, file: IdeaFile): boolean {
  const target = link.getAttribute('data-href') ?? link.getAttribute('href');
  if (!target) return false;
  try {
    const normalized = decodeURIComponent(target).replace(/^\.\//, '');
    return normalized === file.path || normalized === file.path.replace(/\.md$/i, '');
  } catch {return false;}
}

const READ_ONLY = '[disabled], [aria-disabled="true"], [aria-readonly="true"], [data-readonly="true"], .is-read-only, .is-readonly, .mod-readonly';
type Binding = {
  view: TitleView; row: TitleRow; file: IdeaFile; path: string; query: unknown;
  titleColumn: string; titleProperty: string; kind: TableTitleProfile['kind']; nativeText: boolean;
  cell: HTMLElement; outer: HTMLElement; link: HTMLElement; icon: HTMLButtonElement;
  attributes: Map<string, string | null>; hadTitleClass: boolean; hadCellClass: boolean;
  cleanup: () => void; forwarding: boolean; down?: {x: number; y: number; moved: boolean}; stopGesture?: () => void;
};
type Edit = {
  binding: Binding; original: string; lastText: string; raw: string | undefined;
  attributes: Map<string, string | null>; composing: boolean; imeEnded: boolean; pendingBlur: boolean;
  cleanup: () => void;
};

/** Edit the title's source property through native Bases transactions. The
 * formula link remains the native element and retains its navigation handlers.
 */
export class IdeaTitleEditors {
  private bindings = new Map<HTMLElement, Binding>();
  private edit?: Edit;
  constructor(private actions?: TitleActions) {}

  refresh(view: unknown) {
    this.pruneEdit();
    if (!titleView(view)) {
      this.releaseView(view); return;
    }
    const profiles = tableTitleProfiles(view);
    if (!profiles.length) {this.releaseView(view); return;}
    const seen = new Set<HTMLElement>();
    for (const row of view.rows) {
      if (!titleRow(row)) continue;
      for (const profile of profiles) {
      const nativeCell = row.cells?.find(cell => cell.prop === profile.titleColumn);
      const cell = nativeCell?.renderer?.el ?? nativeCell?.el?.querySelector<HTMLElement>('.bases-table-cell');
      let link = cell?.querySelector<HTMLElement>('.internal-link');
      let nativeText = false;
      if (link && !currentFileLink(link, row.entry.file)) continue;
      if (!link && profile.titleColumn.startsWith('note.') && this.actions?.open && nativeCell?.renderer?.propertyEditor) {
        link = cell?.querySelector<HTMLElement>('.metadata-input-longtext'); nativeText = !!link;
      }
      if (!cell?.isConnected || !link || !row.entry?.file) continue;
      seen.add(link);
      let binding = this.bindings.get(link);
      if (binding && (binding.view !== view || binding.row !== row || binding.file !== row.entry.file ||
          binding.path !== row.entry.file.path || binding.query !== view.config.query ||
          binding.titleColumn !== profile.titleColumn || binding.titleProperty !== profile.titleProperty ||
          binding.kind !== profile.kind || binding.nativeText !== nativeText ||
          binding.outer !== (cell.closest('.bases-td') ?? cell))) {
        this.release(binding); binding = undefined;
      }
      // Bases can replace a formula link inside the same reused cell. Release
      // its old decoration before capturing the new cell's original classes.
      if (!binding) for (const previous of this.bindings.values()) if (previous.cell === cell) this.release(previous);
      if (!binding) this.attach(view, row, cell, link, profile, nativeText);
      }
    }
    for (const binding of this.bindings.values()) if (binding.view === view && !seen.has(binding.link)) this.release(binding);
  }

  private attach(view: TitleView, row: TitleRow, cell: HTMLElement, link: HTMLElement, profile: TableTitleProfile, nativeText: boolean) {
    const doc = link.ownerDocument, icon = doc.createElement('button');
    icon.type = 'button';
    icon.className = 'bui-idea-page-button'; icon.setAttribute('aria-label', '打开笔记');
    setIcon(icon, 'file-text');
    const attributes = this.snapshot(link, ['tabindex', 'role']);
    const outer = cell.closest<HTMLElement>('.bases-td') ?? cell;
    const binding: Binding = {view, row, file: row.entry.file, path: row.entry.file.path, query: view.config.query,
      titleColumn: profile.titleColumn, titleProperty: profile.titleProperty, kind: profile.kind, nativeText,
      cell, outer, link, icon, attributes, hadTitleClass: link.classList.contains('bui-idea-title'),
      hadCellClass: cell.classList.contains('bui-idea-title-cell'), cleanup: () => {}, forwarding: false};
    this.bindings.set(link, binding);
    link.classList.add('bui-idea-title'); cell.classList.add('bui-idea-title-cell');
    link.tabIndex = 0; if (!nativeText) link.setAttribute('role', 'button');
    link.before(icon);
    const listeners: [HTMLElement, string, EventListener, boolean][] = [];
    // The icon is a separate navigation target from the title's gesture guard.
    // A touch scroll can start on it and leave a synthetic click in WebViews.
    const stopIconTouch = guardTouchScrollClicks(icon);
    const listen = <K extends keyof HTMLElementEventMap>(el: HTMLElement, name: K,
      callback: (event: HTMLElementEventMap[K]) => void, capture = false) => {
      el.addEventListener(name, callback, capture); listeners.push([el, name, callback as EventListener, capture]);
    };
    binding.cleanup = () => {
      binding.stopGesture?.();
      stopIconTouch();
      for (const [el, name, fn, capture] of listeners) el.removeEventListener(name, fn, capture);
    };
    const blank = (target: EventTarget | null, point?: MouseEvent) => {
      if (!(target instanceof Element) || !outer.contains(target)) return false;
      // The native link is a block in multiline tables, so an empty area can
      // still hit that span. Distinguish its real text lines from its box.
      if (link.contains(target)) return !!point && this.hitsText(link, point) === false;
      if (target.closest('.bases-td') !== outer && outer !== cell) return false;
      return !target.closest('button, a, input, textarea, select, [contenteditable]');
    };
    listen(outer, 'pointerdown', event => {
      if (event.button !== 0 || (!(event.target instanceof Element)) ||
          (!link.contains(event.target) && !blank(event.target))) return;
      this.trackGesture(binding, event);
    }, true);
    listen(outer, 'mousedown', event => {
      // Clicking the same cell's padding is a caret move, not a blur commit.
      // Keep the live editor (including an IME candidate) mounted and focused.
      if (this.edit?.binding === binding && blank(event.target, event) && event.button === 0 &&
          !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) event.preventDefault();
    }, true);
    listen(outer, 'click', event => {
      if (!blank(event.target, event) || binding.forwarding || event.button !== 0 ||
          event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      // Capture on the outer native td before renderer click handlers can
      // consume a padding click. Link and button targets never take this path.
      event.preventDefault(); event.stopImmediatePropagation();
      const down = binding.down; binding.down = undefined; binding.stopGesture?.();
      if (down?.moved || (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) ||
          (view.selection && !down)) return;
      if (this.edit?.binding === binding) {
        if (!this.edit.composing && !this.edit.imeEnded && this.writable(binding)) {
          link.focus({preventScroll: true}); this.placeCaret(link);
        }
      } else this.start(binding);
    }, true);
    listen(link, 'click', event => {
      if (binding.nativeText) return;
      if (binding.forwarding || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey) return;
      if (this.edit?.binding === binding) {event.stopImmediatePropagation(); return;}
      event.preventDefault(); event.stopImmediatePropagation();
      const down = binding.down; binding.down = undefined; binding.stopGesture?.();
      const moved = down && (down.moved || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5);
      // Range selection and dragging must never accidentally open a note or
      // start replacing the selected range with a title editor.
      if (event.shiftKey || moved || (view.selection && !down)) return;
      const selection = doc.getSelection();
      if (selection && !selection.isCollapsed && selection.anchorNode && link.contains(selection.anchorNode)) return;
      this.start(binding, event);
    }, true);
    listen(link, 'dblclick', event => {
      if (binding.nativeText) return;
      if (binding.forwarding || event.metaKey || event.ctrlKey || event.altKey) return;
      // Preserve the browser's word selection, but do not open a formula editor.
      event.stopImmediatePropagation();
    }, true);
    listen(link, 'keydown', event => {
      if (binding.nativeText) return;
      if (this.edit?.binding === binding || event.defaultPrevented || event.isComposing ||
          event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault(); event.stopImmediatePropagation(); this.start(binding);
      }
    }, true);
    listen(icon, 'click', event => {
      event.preventDefault(); event.stopPropagation(); this.navigate(binding, event);
    });
    listen(icon, 'auxclick', event => {
      if (event.button !== 1) return;
      event.preventDefault(); event.stopPropagation(); this.navigate(binding, event);
    });
  }

  private hitsText(link: HTMLElement, point: MouseEvent): boolean | undefined {
    const range = link.ownerDocument.createRange(); range.selectNodeContents(link);
    if (typeof range.getClientRects !== 'function') return undefined;
    const rects = Array.from(range.getClientRects()).filter(rect => rect.width > 0 && rect.height > 0);
    if (!rects.length) return undefined;
    return rects.some(rect => point.clientX >= rect.left - 1 && point.clientX <= rect.right + 1 &&
      point.clientY >= rect.top - 1 && point.clientY <= rect.bottom + 1);
  }

  private trackGesture(binding: Binding, event: PointerEvent) {
    binding.stopGesture?.();
    const win = binding.link.ownerDocument.defaultView!;
    const down: {x: number; y: number; moved: boolean} = {x: event.clientX, y: event.clientY, moved: false};
    binding.down = down;
    const move = (next: PointerEvent) => {
      if (next.pointerId === event.pointerId && Math.hypot(next.clientX - down.x, next.clientY - down.y) > 5) down.moved = true;
    };
    const finish = (next: PointerEvent) => {if (next.pointerId === event.pointerId) stop();};
    const cancel = (next: PointerEvent) => {if (next.pointerId === event.pointerId) {down.moved = true; stop();}};
    const stop = () => {
      win.removeEventListener('pointermove', move, true);
      win.removeEventListener('pointerup', finish, true);
      win.removeEventListener('pointercancel', cancel, true);
      if (binding.stopGesture === stop) binding.stopGesture = undefined;
    };
    binding.stopGesture = stop;
    win.addEventListener('pointermove', move, true);
    win.addEventListener('pointerup', finish, true);
    win.addEventListener('pointercancel', cancel, true);
  }

  private current(binding: Binding): boolean {
    const profile = tableTitleProfiles(binding.view).find(profile => profile.titleColumn === binding.titleColumn);
    return this.bindings.get(binding.link) === binding && binding.link.isConnected &&
      binding.cell.contains(binding.link) && binding.outer.contains(binding.cell) && binding.view._loaded !== false &&
      (binding.nativeText || currentFileLink(binding.link, binding.file)) &&
      binding.view.type === 'table' && profile?.titleColumn === binding.titleColumn && profile.titleProperty === binding.titleProperty && profile.kind === binding.kind &&
      (!binding.view.queryController?.view || binding.view.queryController.view === binding.view) &&
      binding.view.config.query === binding.query && binding.row.entry?.file === binding.file &&
      binding.file.path === binding.path && Array.isArray(binding.view.rows) && binding.view.rows.includes(binding.row);
  }
  private writable(binding: Binding): boolean {
    return this.current(binding) && binding.file.extension === 'md' &&
      binding.view.isReadOnly !== true && binding.view.readOnly !== true && binding.view.queryController?.isReadOnly !== true &&
      !binding.cell.closest(READ_ONLY) && (binding.kind === 'filename' ? typeof this.actions?.rename === 'function' :
        typeof binding.view.updateProperty === 'function' && this.scalarSource(binding));
  }
  private scalarSource(binding: Binding): boolean {
    try {
      const value = binding.row.entry.getRawProperty?.(binding.titleProperty);
      return value == null || typeof value === 'string';
    } catch {return false;}
  }
  private raw(binding: Binding): string | undefined {
    try {return binding.kind === 'filename' ? binding.file.path : JSON.stringify(binding.row.entry.getRawProperty?.(binding.titleProperty));}
    catch {return undefined;}
  }

  private navigate(binding: Binding, event: MouseEvent) {
    if (!this.current(binding)) return;
    if (this.actions?.open) {this.actions.open(binding.view, binding.file, event); return;}
    const win = binding.link.ownerDocument.defaultView!;
    binding.forwarding = true;
    try {
      // Dispatch on the original native link so source path, pane modifiers,
      // existing handlers and Obsidian's routing all remain native.
      binding.link.dispatchEvent(new win.MouseEvent(event.type, {bubbles: true, cancelable: true,
        button: event.button, buttons: event.buttons, detail: event.detail,
        clientX: event.clientX, clientY: event.clientY,
        metaKey: event.metaKey, ctrlKey: event.ctrlKey, altKey: event.altKey, shiftKey: event.shiftKey}));
    } finally {binding.forwarding = false;}
  }

  private start(binding: Binding, point?: MouseEvent) {
    if (!this.writable(binding) || this.edit?.binding === binding) return;
    if (binding.nativeText) {binding.link.focus({preventScroll: true}); this.placeCaret(binding.link, point); return;}
    if (this.edit) {this.save(this.edit, true); if (this.edit) return;}
    const {link, view} = binding;
    const original = link.textContent ?? '';
    const edit: Edit = {binding, original, lastText: original, raw: this.raw(binding),
      attributes: this.snapshot(link, ['contenteditable', 'spellcheck', 'aria-multiline', 'draggable', 'role']),
      composing: false, imeEnded: false, pendingBlur: false, cleanup: () => {}};
    this.edit = edit;
    link.classList.add('bui-idea-title-editing'); link.setAttribute('contenteditable', 'plaintext-only');
    link.setAttribute('role', 'textbox'); link.setAttribute('spellcheck', 'false');
    link.setAttribute('aria-multiline', 'false'); link.setAttribute('draggable', 'false');
    const nativeCell = view.getCellFromDom?.(link), index = nativeCell && view.getCellIndex?.(nativeCell);
    if (index) {view.activeCell = index; view.selection = null;}
    const listeners: [string, EventListener, boolean][] = [];
    const listen = <K extends keyof HTMLElementEventMap>(name: K, callback: (event: HTMLElementEventMap[K]) => void, capture = false) => {
      link.addEventListener(name, callback, capture); listeners.push([name, callback as EventListener, capture]);
    };
    let compositionTimer = 0;
    edit.cleanup = () => {
      for (const [name, fn, capture] of listeners) link.removeEventListener(name, fn, capture);
      if (compositionTimer) link.ownerDocument.defaultView!.clearTimeout(compositionTimer);
    };
    listen('input', () => {edit.lastText = link.textContent ?? '';});
    listen('compositionstart', () => {edit.composing = true; edit.imeEnded = false;});
    listen('compositionend', () => {
      edit.composing = false; edit.imeEnded = true;
      compositionTimer = link.ownerDocument.defaultView!.setTimeout(() => {edit.imeEnded = false;}, 0);
      if (edit.pendingBlur) link.ownerDocument.defaultView!.queueMicrotask(() => this.save(edit, true));
    });
    listen('keydown', event => {
      // Bases handles Tab before checking for a text editor. Keep native text
      // caret/undo/Tab behaviour inside this editor, rather than grid commands.
      event.stopImmediatePropagation();
      if (event.isComposing || edit.composing || event.keyCode === 229) return;
      if (event.key === 'Enter') {event.preventDefault(); if (!edit.imeEnded) this.save(edit, false, true);}
      else if (event.key === 'Escape') {event.preventDefault(); this.close(edit, true);}
    }, true);
    for (const type of ['copy', 'cut', 'paste'] as const) listen(type, event => event.stopPropagation());
    listen('dragstart', event => event.stopImmediatePropagation(), true);
    listen('blur', () => this.save(edit, true));
    link.focus({preventScroll: true}); this.placeCaret(link, point);
  }

  private placeCaret(link: HTMLElement, point?: MouseEvent) {
    const doc = link.ownerDocument, selection = doc.getSelection();
    if (!selection) return;
    let range: Range | null = null;
    if (point) {
      const position = doc.caretPositionFromPoint?.(point.clientX, point.clientY);
      if (position && link.contains(position.offsetNode)) {range = doc.createRange(); range.setStart(position.offsetNode, position.offset);}
      else {
        const nativeRange = doc.caretRangeFromPoint?.(point.clientX, point.clientY);
        if (nativeRange && link.contains(nativeRange.startContainer)) range = nativeRange;
      }
    }
    if (!range) {range = doc.createRange(); range.selectNodeContents(link); range.collapse(false);}
    else range.collapse(true);
    selection.removeAllRanges(); selection.addRange(range);
  }

  private save(edit: Edit, blur: boolean, focus = false) {
    if (this.edit !== edit) return;
    if (edit.composing) {edit.pendingBlur ||= blur; return;}
    const binding = edit.binding, {link, view, file} = binding;
    if (!this.writable(binding) || link.textContent !== edit.lastText || this.raw(binding) !== edit.raw) {
      this.close(edit); return;
    }
    const value = (link.textContent ?? '').replace(/[\r\n]+/g, ' ').trim();
    this.close(edit);
    if (value === edit.original) {if (focus && link.isConnected) link.focus({preventScroll: true}); return;}
    const displayed = value || (typeof file.basename === 'string' ? file.basename : edit.original);
    link.textContent = displayed;
    try {
      // Source properties use native transactions. File-name edits use the
      // injected rename/history adapter; never create a frontmatter "file.name".
      const operation = binding.kind === 'filename' ? this.actions?.rename(view, file, value) :
        view.updateProperty?.(file, binding.titleProperty, value);
      void Promise.resolve(operation).catch(() => {
        if (this.current(binding) && link.textContent === displayed && this.edit?.binding !== binding) link.textContent = edit.original;
        new Notice('标题未能保存，请重试');
      });
    } catch {
      if (this.current(binding) && link.textContent === displayed) link.textContent = edit.original;
      new Notice('标题未能保存，请重试');
    }
    if (focus && link.isConnected) link.focus({preventScroll: true});
  }

  private close(edit: Edit, focus = false) {
    if (this.edit !== edit) return;
    this.edit = undefined; edit.cleanup();
    const {link} = edit.binding;
    link.classList.remove('bui-idea-title-editing'); this.restore(link, edit.attributes);
    // A native formula rerender wins over a draft from the previous entry.
    if (link.textContent === edit.lastText) link.textContent = edit.original;
    if (focus && link.isConnected) link.focus({preventScroll: true});
  }
  private pruneEdit() {
    const edit = this.edit;
    if (edit && (!this.writable(edit.binding) || edit.binding.link.textContent !== edit.lastText || this.raw(edit.binding) !== edit.raw)) this.close(edit);
  }
  private snapshot(el: HTMLElement, attributes: string[]) {
    return new Map(attributes.map(name => [name, el.getAttribute(name)]));
  }
  private restore(el: HTMLElement, attributes: Map<string, string | null>) {
    for (const [name, value] of attributes) value === null ? el.removeAttribute(name) : el.setAttribute(name, value);
  }
  private release(binding: Binding) {
    if (this.edit?.binding === binding) this.close(this.edit);
    binding.cleanup(); binding.icon.remove(); this.restore(binding.link, binding.attributes);
    if (!binding.hadTitleClass) binding.link.classList.remove('bui-idea-title');
    if (!binding.hadCellClass) binding.cell.classList.remove('bui-idea-title-cell');
    this.bindings.delete(binding.link);
  }
  private releaseView(view: unknown) {for (const binding of this.bindings.values()) if (binding.view === view) this.release(binding);}
  prune() {
    this.pruneEdit();
    for (const binding of this.bindings.values()) if (!this.current(binding)) this.release(binding);
  }
  clear() {for (const binding of [...this.bindings.values()]) this.release(binding);}
}
