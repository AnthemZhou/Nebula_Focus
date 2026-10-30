import {App, Notice} from 'obsidian';

type Native = any;
type HeaderBinding = {
  view: Native;
  head: HTMLElement;
  click: (event: MouseEvent) => void;
  keydown: (event: KeyboardEvent) => void;
  labels: Map<HTMLElement, Map<string, string | null>>;
};
type HeaderEditor = {
  binding: HeaderBinding; property: string; query: Native; label: HTMLElement; originalText: string; lastText: string;
  attributes: Map<string, string | null>; cell: HTMLElement | null; draggable: string | null;
  composing: boolean; pendingBlur: boolean; imeEnded: boolean; cleanup: () => void;
};

/** Rename a column's display label through Bases, without changing its property key. */
export class IdeaHeaders {
  private bindings = new Map<Native, HeaderBinding>();
  private editor?: HeaderEditor;

  constructor(_app: App) {}

  attach(view: Native) {
    this.pruneEditor();
    if (view?.type !== 'table' || view.config?.name !== '想法收集箱' ||
        !(view.theadEl instanceof HTMLElement) || typeof view.getCellFromDom !== 'function' ||
        typeof view.config.getPropertyConfig !== 'function' || typeof view.config.query?.saveFn !== 'function') return;
    let binding = this.bindings.get(view);
    if (binding && binding.head !== view.theadEl) {this.detach(binding); binding = undefined;}
    if (!binding) {
      const head = view.theadEl as HTMLElement;
      const propertyAt = (target: EventTarget | null): string | null => {
        if (!(target instanceof Element) || !head.contains(target) || target.closest('.bases-table-header-resizer')) return null;
        const cell = view.getCellFromDom(target);
        return typeof cell?.prop === 'string' ? cell.prop : null;
      };
      const click = (event: MouseEvent) => {
        if (event.defaultPrevented || event.button !== 0) return;
        const property = propertyAt(event.target);
        if (!property) return;
        if (this.editor?.label.contains(event.target as Node)) {event.stopPropagation(); return;}
        // The toolbar owns sorting. Capture before the native header toggle;
        // resize handles, right-click menus and dragstart stay native.
        event.preventDefault(); event.stopPropagation();
        const label = (event.target as Element).closest<HTMLElement>('.bases-table-header-name');
        if (label && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) this.open(view, property, label, event);
      };
      const keydown = (event: KeyboardEvent) => {
        if (event.isComposing || event.defaultPrevented || (event.key !== 'Enter' && event.key !== ' ') ||
            event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        const target = event.target;
        if (target && this.editor?.label.contains(target as Node)) return;
        if (!(target instanceof Element) || !target.closest('.bases-table-header-name')) return;
        const property = propertyAt(target);
        if (!property) return;
        const label = target.closest<HTMLElement>('.bases-table-header-name')!;
        event.preventDefault(); event.stopPropagation(); this.open(view, property, label);
      };
      binding = {view, head, click, keydown, labels: new Map()};
      head.addEventListener('click', click, true);
      head.addEventListener('keydown', keydown, true);
      this.bindings.set(view, binding);
    }
    this.refreshLabels(binding);
  }

  private editable(view: Native): boolean {
    return view?._loaded !== false && view?.isReadOnly !== true &&
      view?.type === 'table' && view.config?.name === '想法收集箱' &&
      view.theadEl?.isConnected && typeof view.config.query?.saveFn === 'function';
  }

  private refreshLabels(binding: HeaderBinding) {
    const current = new Set<HTMLElement>();
    if (this.editable(binding.view)) for (const label of binding.head.querySelectorAll<HTMLElement>('.bases-table-header-name')) {
      current.add(label);
      if (!binding.labels.has(label)) binding.labels.set(label,
        new Map(['tabindex', 'role', 'aria-label', 'title'].map(name => [name, label.getAttribute(name)])));
      if (this.editor?.label === label) continue;
      label.tabIndex = 0; label.setAttribute('role', 'button');
      // The visible text already names the control. Obsidian also turns
      // aria-label into a hover tooltip, so do not add a second visual prompt.
      label.removeAttribute('aria-label'); label.removeAttribute('title');
    }
    for (const [label, original] of binding.labels) if (!current.has(label)) {
      this.restoreLabel(label, original); binding.labels.delete(label);
    }
  }

  private open(view: Native, property: string, label: HTMLElement, point?: MouseEvent) {
    if (!this.editable(view)) return;
    const binding = this.bindings.get(view);
    if (!binding) return;
    if (this.editor?.label === label) return;
    if (this.editor) {this.save(this.editor, true); if (this.editor) return;}
    const original = view.config.getPropertyConfig(property);
    if (typeof original?.getDisplayName !== 'function' || typeof original.setDisplayName !== 'function') return;
    this.refreshLabels(binding);
    const originalText = String(original.getDisplayName());
    const attributes = new Map(['contenteditable', 'spellcheck', 'aria-multiline', 'aria-invalid']
      .map(name => [name, label.getAttribute(name)]));
    const cell = label.closest<HTMLElement>('.bases-td');
    const edit: HeaderEditor = {binding, property, query: view.config.query, label, originalText, lastText: originalText,
      attributes, cell, draggable: cell?.getAttribute('draggable') ?? null,
      composing: false, pendingBlur: false, imeEnded: false, cleanup: () => {}};
    this.editor = edit;
    if (label.textContent !== originalText) label.textContent = originalText;
    label.classList.add('bui-header-name-editing'); label.setAttribute('contenteditable', 'plaintext-only');
    label.setAttribute('role', 'textbox'); label.setAttribute('aria-multiline', 'false'); label.setAttribute('spellcheck', 'false');
    label.removeAttribute('title'); label.removeAttribute('aria-label');
    // Text selection belongs to the editable label while it has focus. The
    // separate native resize handle remains draggable and fully functional.
    cell?.setAttribute('draggable', 'false');
    const listeners: [string, EventListener][] = [];
    const listen = <K extends keyof HTMLElementEventMap>(name: K, handler: (event: HTMLElementEventMap[K]) => void) => {
      label.addEventListener(name, handler); listeners.push([name, handler as EventListener]);
    };
    let compositionTimer = 0;
    edit.cleanup = () => {
      for (const [name, handler] of listeners) label.removeEventListener(name, handler);
      if (compositionTimer) label.ownerDocument.defaultView!.clearTimeout(compositionTimer);
    };
    listen('input', () => {edit.lastText = label.textContent ?? ''; label.removeAttribute('aria-invalid');});
    listen('compositionstart', () => {edit.composing = true; edit.imeEnded = false;});
    listen('compositionend', () => {
      edit.composing = false; edit.imeEnded = true;
      compositionTimer = label.ownerDocument.defaultView!.setTimeout(() => {edit.imeEnded = false;}, 0);
      // The final input event can follow compositionend. Wait for it before a
      // blur commit, rather than persisting an intermediate IME candidate.
      if (edit.pendingBlur) label.ownerDocument.defaultView!.queueMicrotask(() => this.save(edit, true));
    });
    listen('keydown', event => {
      if (event.isComposing || edit.composing || event.keyCode === 229) return;
      if (event.key === 'Enter') {
        event.preventDefault(); event.stopPropagation();
        if (!edit.imeEnded) this.save(edit, false, true);
      }
      if (event.key === 'Escape') {event.preventDefault(); event.stopPropagation(); this.close(edit, true);}
    });
    listen('blur', () => this.save(edit, true));
    listen('dragstart', event => event.stopPropagation());
    label.focus({preventScroll: true}); this.placeCaret(label, point);
  }

  /** Keep the click's character offset; never select the entire header. */
  private placeCaret(label: HTMLElement, point?: MouseEvent) {
    const doc = label.ownerDocument, selection = doc.getSelection();
    if (!selection) return;
    let range: Range | null = null;
    if (point) {
      const position = (doc as Native).caretPositionFromPoint?.(point.clientX, point.clientY);
      if (position && label.contains(position.offsetNode)) {
        range = doc.createRange(); range.setStart(position.offsetNode, position.offset);
      } else {
        const atPoint = (doc as Native).caretRangeFromPoint?.(point.clientX, point.clientY) as Range | undefined;
        if (atPoint && label.contains(atPoint.startContainer)) range = atPoint;
      }
    }
    if (!range) {range = doc.createRange(); range.selectNodeContents(label); range.collapse(false);}
    else range.collapse(true);
    selection.removeAllRanges(); selection.addRange(range);
  }

  private save(edit: HeaderEditor, blur: boolean, focusLabel = false) {
    if (this.editor !== edit) return;
    if (edit.composing) {edit.pendingBlur ||= blur; return;}
    const {view} = edit.binding, {property, label} = edit;
    if (!label.isConnected || !this.bindings.has(view) || !this.editable(view) || view.config.query !== edit.query ||
        label.textContent !== edit.lastText ||
        (typeof view.config.getOrder === 'function' && !view.config.getOrder().includes(property))) {
      this.close(edit); return;
    }
    const value = (label.textContent ?? '').replace(/[\r\n]+/g, ' ').trim();
    if (!value) {
      if (blur) this.close(edit);
      else label.setAttribute('aria-invalid', 'true');
      return;
    }
    const config = view.config.getPropertyConfig(property);
    if (typeof config?.setDisplayName !== 'function' || typeof config.getDisplayName !== 'function') {this.close(edit); return;}
    try {
      // The native setter saves only this base's display label, never a key or
      // the underlying notes. Clear edit state first to prevent blur re-entry.
      this.close(edit);
      if (value !== config.getDisplayName()) config.setDisplayName(value);
      if (edit.label.isConnected && view.config.query === edit.query) edit.label.textContent = value;
      this.refreshLabels(edit.binding);
      if (focusLabel && edit.label.isConnected) edit.label.focus({preventScroll: true});
    } catch {new Notice('列名称未能保存，请重试');}
  }

  private close(edit: HeaderEditor, focusLabel = false) {
    if (this.editor !== edit) return;
    this.editor = undefined; edit.cleanup(); edit.label.classList.remove('bui-header-name-editing');
    this.restoreLabel(edit.label, edit.attributes);
    if (edit.cell) edit.draggable === null ? edit.cell.removeAttribute('draggable') : edit.cell.setAttribute('draggable', edit.draggable);
    // A native rerender may already have replaced the label. Never overwrite
    // that newer text with the cancelled draft or the previous base's name.
    if (edit.label.textContent === edit.lastText) {
      const view = edit.binding.view;
      const stillPresent = typeof view.config?.getOrder !== 'function' || view.config.getOrder().includes(edit.property);
      const config = view.config?.query === edit.query && stillPresent ? view.config?.getPropertyConfig?.(edit.property) : null;
      const current = typeof config?.getDisplayName === 'function' ? config.getDisplayName() : edit.originalText;
      edit.label.textContent = current;
    }
    this.refreshLabels(edit.binding);
    if (focusLabel && edit.label.isConnected) edit.label.focus({preventScroll: true});
  }

  private pruneEditor() {
    const edit = this.editor;
    if (edit && (!edit.label.isConnected || !this.editable(edit.binding.view) || edit.binding.view.config.query !== edit.query ||
        edit.label.textContent !== edit.lastText)) this.close(edit);
  }

  /** Call during the normal scan to release native views replaced by Bases. */
  prune() {
    this.pruneEditor();
    for (const binding of this.bindings.values()) if (!binding.head.isConnected ||
        binding.view._loaded === false || binding.view.config?.name !== '想法收集箱') this.detach(binding);
  }

  private restoreLabel(label: HTMLElement, original: Map<string, string | null>) {
    for (const [name, value] of original) value === null ? label.removeAttribute(name) : label.setAttribute(name, value);
  }

  private detach(binding: HeaderBinding) {
    if (this.editor?.binding === binding) this.close(this.editor);
    binding.head.removeEventListener('click', binding.click, true);
    binding.head.removeEventListener('keydown', binding.keydown, true);
    for (const [label, original] of binding.labels) this.restoreLabel(label, original);
    binding.labels.clear(); this.bindings.delete(binding.view);
  }

  clear() {
    if (this.editor) this.close(this.editor);
    for (const binding of this.bindings.values()) this.detach(binding);
  }
}
