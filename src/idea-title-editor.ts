import {Notice, setIcon} from 'obsidian';

type Native = any;
const TITLE_COLUMN = 'formula.想法';
const TITLE_PROPERTY = '这里写想法';
const READ_ONLY = '[disabled], [aria-disabled="true"], [aria-readonly="true"], [data-readonly="true"], .is-read-only, .is-readonly, .mod-readonly';
type Binding = {
  view: Native; row: Native; file: Native; path: string; query: Native;
  cell: HTMLElement; link: HTMLElement; icon: HTMLButtonElement; open: HTMLButtonElement;
  attributes: Map<string, string | null>; hadTitleClass: boolean; hadCellClass: boolean;
  cleanup: () => void; forwarding: boolean; down?: {x: number; y: number};
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

  refresh(view: Native) {
    this.pruneEdit();
    if (view?.type !== 'table' || view.config?.name !== '想法收集箱' ||
        !Array.isArray(view.rows) || typeof view.updateProperty !== 'function') {
      this.releaseView(view); return;
    }
    const seen = new Set<HTMLElement>();
    for (const row of view.rows) {
      const nativeCell = row.cells?.find((cell: Native) => cell.prop === TITLE_COLUMN);
      const cell = nativeCell?.renderer?.el as HTMLElement | undefined;
      const link = cell?.querySelector<HTMLElement>('.internal-link');
      if (!cell?.isConnected || !link || !row.entry?.file) continue;
      seen.add(link);
      let binding = this.bindings.get(link);
      if (binding && (binding.view !== view || binding.row !== row || binding.file !== row.entry.file ||
          binding.path !== row.entry.file.path || binding.query !== view.config.query)) {
        this.release(binding); binding = undefined;
      }
      // Bases can replace a formula link inside the same reused cell. Release
      // its old decoration before capturing the new cell's original classes.
      if (!binding) for (const previous of this.bindings.values()) if (previous.cell === cell) this.release(previous);
      if (!binding) this.attach(view, row, cell, link);
    }
    for (const binding of this.bindings.values()) if (binding.view === view && !seen.has(binding.link)) this.release(binding);
  }

  private attach(view: Native, row: Native, cell: HTMLElement, link: HTMLElement) {
    const doc = link.ownerDocument, icon = doc.createElement('button'), open = doc.createElement('button');
    icon.type = open.type = 'button';
    icon.className = 'bui-idea-page-button'; icon.setAttribute('aria-label', '打开想法笔记');
    setIcon(icon, 'file-text');
    open.className = 'bui-idea-open-button'; open.textContent = '打开'; open.setAttribute('aria-label', '打开想法笔记');
    const attributes = this.snapshot(link, ['tabindex', 'role']);
    const binding: Binding = {view, row, file: row.entry.file, path: row.entry.file.path, query: view.config.query,
      cell, link, icon, open, attributes, hadTitleClass: link.classList.contains('bui-idea-title'),
      hadCellClass: cell.classList.contains('bui-idea-title-cell'), cleanup: () => {}, forwarding: false};
    this.bindings.set(link, binding);
    link.classList.add('bui-idea-title'); cell.classList.add('bui-idea-title-cell');
    link.tabIndex = 0; link.setAttribute('role', 'button');
    link.before(icon); link.after(open);
    const listeners: [HTMLElement, string, EventListener, boolean][] = [];
    const listen = <K extends keyof HTMLElementEventMap>(el: HTMLElement, name: K,
      callback: (event: HTMLElementEventMap[K]) => void, capture = false) => {
      el.addEventListener(name, callback, capture); listeners.push([el, name, callback as EventListener, capture]);
    };
    binding.cleanup = () => {for (const [el, name, fn, capture] of listeners) el.removeEventListener(name, fn, capture);};
    listen(link, 'pointerdown', event => {
      if (event.button === 0) binding.down = {x: event.clientX, y: event.clientY};
    }, true);
    listen(link, 'click', event => {
      if (binding.forwarding || event.button !== 0 || event.metaKey || event.ctrlKey || event.altKey) return;
      if (this.edit?.binding === binding) {event.stopImmediatePropagation(); return;}
      event.preventDefault(); event.stopImmediatePropagation();
      const down = binding.down; binding.down = undefined;
      const moved = down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5;
      // Range selection and dragging must never accidentally open a note or
      // start replacing the selected range with a title editor.
      if (event.shiftKey || moved || (view.selection && !down)) return;
      const selection = doc.getSelection();
      if (selection && !selection.isCollapsed && selection.anchorNode && link.contains(selection.anchorNode)) return;
      this.start(binding, event);
    }, true);
    listen(link, 'dblclick', event => {
      if (binding.forwarding || event.metaKey || event.ctrlKey || event.altKey) return;
      // Preserve the browser's word selection, but do not open a formula editor.
      event.stopImmediatePropagation();
    }, true);
    listen(link, 'keydown', event => {
      if (this.edit?.binding === binding || event.defaultPrevented || event.isComposing ||
          event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault(); event.stopImmediatePropagation(); this.start(binding);
      }
    }, true);
    for (const button of [icon, open]) {
      listen(button, 'click', event => {
        event.preventDefault(); event.stopPropagation(); this.navigate(binding, event);
      });
      listen(button, 'auxclick', event => {
        if (event.button !== 1) return;
        event.preventDefault(); event.stopPropagation(); this.navigate(binding, event);
      });
    }
  }

  private current(binding: Binding): boolean {
    return this.bindings.get(binding.link) === binding && binding.link.isConnected &&
      binding.cell.contains(binding.link) && binding.view._loaded !== false &&
      binding.view.type === 'table' && binding.view.config?.name === '想法收集箱' &&
      binding.view.config.query === binding.query && binding.row.entry?.file === binding.file &&
      binding.file.path === binding.path && Array.isArray(binding.view.rows) && binding.view.rows.includes(binding.row);
  }
  private writable(binding: Binding): boolean {
    return this.current(binding) && binding.file.extension === 'md' &&
      binding.view.isReadOnly !== true && binding.view.queryController?.isReadOnly !== true &&
      !binding.cell.closest(READ_ONLY) && typeof binding.view.updateProperty === 'function';
  }
  private raw(binding: Binding): string | undefined {
    try {return JSON.stringify(binding.row.entry.getRawProperty?.(TITLE_PROPERTY));}
    catch {return undefined;}
  }

  private navigate(binding: Binding, event: MouseEvent) {
    if (!this.current(binding)) return;
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
      const position = (doc as Native).caretPositionFromPoint?.(point.clientX, point.clientY);
      if (position && link.contains(position.offsetNode)) {range = doc.createRange(); range.setStart(position.offsetNode, position.offset);}
      else {
        const nativeRange = (doc as Native).caretRangeFromPoint?.(point.clientX, point.clientY) as Range | undefined;
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
    const displayed = value || String(file.basename ?? edit.original);
    link.textContent = displayed;
    try {
      // updateProperty creates the native undoable Bases transaction; no
      // filesystem writes, file renames, or formula changes happen here.
      Promise.resolve(view.updateProperty(file, TITLE_PROPERTY, value)).catch(() => {
        if (this.current(binding) && link.textContent === displayed && this.edit?.binding !== binding) link.textContent = edit.original;
        new Notice('想法标题未能保存，请重试');
      });
    } catch {
      if (this.current(binding) && link.textContent === displayed) link.textContent = edit.original;
      new Notice('想法标题未能保存，请重试');
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
    binding.cleanup(); binding.icon.remove(); binding.open.remove(); this.restore(binding.link, binding.attributes);
    if (!binding.hadTitleClass) binding.link.classList.remove('bui-idea-title');
    if (!binding.hadCellClass) binding.cell.classList.remove('bui-idea-title-cell');
    this.bindings.delete(binding.link);
  }
  private releaseView(view: Native) {for (const binding of this.bindings.values()) if (binding.view === view) this.release(binding);}
  prune() {
    this.pruneEdit();
    for (const binding of this.bindings.values()) if (!this.current(binding)) this.release(binding);
  }
  clear() {for (const binding of [...this.bindings.values()]) this.release(binding);}
}
