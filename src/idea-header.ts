import {App, setIcon} from 'obsidian';
import {positionAnchoredPopover, preferPopoverInputFocus, watchPopoverViewport} from './mobile-popover';

import {IdeaView, IdeaQuery, isHtmlElement, isIdeaView, isIdeaCell, isIdeaPropertyConfig, isIdeaQuery} from './idea-native';
import {tableProfile} from './table-profile';
import {inheritPopoverTypography} from './tag-typography';
type HeaderView = IdeaView & {
  theadEl: HTMLElement;
  getCellFromDom(target: Element): unknown;
  config: IdeaView['config'] & {query: IdeaQuery; getPropertyConfig(property: string): unknown};
};
function headerView(value: unknown): value is HeaderView {
  return isIdeaView(value) && isHtmlElement(value.theadEl) && typeof value.getCellFromDom === 'function' &&
    typeof value.config.getPropertyConfig === 'function' && isIdeaQuery(value.config.query);
}
type HeaderBinding = {
  view: HeaderView; head: HTMLElement;
  click: (event: MouseEvent) => void;
  keydown: (event: KeyboardEvent) => void;
  labels: Map<HTMLElement, Map<string, string | null>>;
};
type HeaderEditor = {
  binding: HeaderBinding; property: string; query: IdeaQuery; label: HTMLElement; originalText: string;
  anchor: HTMLElement; popup: HTMLElement; input: HTMLInputElement; status: HTMLElement;
  composing: boolean; imeEnded: boolean; busy: boolean; clean: (() => void)[];
};

function includesProperty(value: unknown, property: string): boolean {
  return Array.isArray(value) && value.includes(property);
}

/** Rename only this Base's display label in the same anchored panel as tag columns. */
export class IdeaHeaders {
  private bindings = new Map<unknown, HeaderBinding>();
  private editor?: HeaderEditor;

  constructor(_app: App, private readonly manage?: (view: unknown, property: string, anchor: HTMLElement, keyboard?: boolean) => boolean) {}

  attach(view: unknown) {
    this.pruneEditor();
    if (!headerView(view)) {
      const stale = this.bindings.get(view); if (stale) this.detach(stale);
      return;
    }
    let binding = this.bindings.get(view);
    if (binding && binding.head !== view.theadEl) {this.detach(binding); binding = undefined;}
    if (!binding) {
      const head = view.theadEl;
      const activate = (target: EventTarget | null, keyboard: boolean): boolean => {
        const ElementType = head.ownerDocument.defaultView?.Element;
        if (!ElementType || !(target instanceof ElementType) || !head.contains(target) || target.closest('.bases-table-header-resizer')) return false;
        const cell = view.getCellFromDom(target);
        const property = isIdeaCell(cell) ? cell.prop : undefined;
        const anchor = target.closest<HTMLElement>('.bases-td');
        const label = anchor?.querySelector<HTMLElement>('.bases-table-header-name');
        if (typeof property !== 'string' || !anchor || !label) return false;
        if (!this.manage?.(view, property, anchor, keyboard)) this.open(view, property, label, anchor, keyboard);
        return true;
      };
      const click = (event: MouseEvent) => {
        if (event.defaultPrevented || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        // Sorting stays in the toolbar; resize handles, drag and context menus remain native.
        if (activate(event.target, false)) {event.preventDefault(); event.stopPropagation();}
      };
      const keydown = (event: KeyboardEvent) => {
        if (event.isComposing || event.defaultPrevented || !['Enter', ' '].includes(event.key) ||
            event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (activate(event.target, true)) {event.preventDefault(); event.stopPropagation();}
      };
      binding = {view, head, click, keydown, labels: new Map()};
      head.addEventListener('click', click, true); head.addEventListener('keydown', keydown, true);
      this.bindings.set(view, binding);
    }
    this.refreshLabels(binding);
  }

  private editable(view: HeaderView): boolean {
    return view?._loaded !== false && !view?.isReadOnly && !view?.readOnly && !view?.queryController?.isReadOnly &&
      (!view?.queryController || view.queryController.view === view) &&
      view?.type === 'table' && !!tableProfile(view) &&
      view.theadEl?.isConnected && typeof view.config.query?.saveFn === 'function';
  }

  private refreshLabels(binding: HeaderBinding) {
    const current = new Set<HTMLElement>();
    if (this.editable(binding.view)) for (const label of binding.head.querySelectorAll<HTMLElement>('.bases-table-header-name')) {
      current.add(label);
      if (!binding.labels.has(label)) binding.labels.set(label,
        new Map(['tabindex', 'role', 'aria-label', 'title'].map(name => [name, label.getAttribute(name)])));
      label.tabIndex = 0; label.setAttribute('role', 'button');
      label.removeAttribute('aria-label'); label.removeAttribute('title');
    }
    for (const [label, original] of binding.labels) if (!current.has(label)) {
      this.restoreLabel(label, original); binding.labels.delete(label);
    }
  }

  private open(view: HeaderView, property: string, label: HTMLElement, anchor: HTMLElement, keyboard: boolean) {
    if (!this.editable(view) || anchor.closest('[aria-readonly="true"], [aria-disabled="true"], .is-read-only, .is-disabled')) return;
    const binding = this.bindings.get(view), config = view.config.getPropertyConfig(property);
    if (!binding || !isIdeaPropertyConfig(config)) return;
    if (this.editor?.label === label) {this.editor.input.focus({preventScroll: true}); return;}
    if (this.editor) this.close(this.editor);
    const doc = label.ownerDocument;
    const make = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string) => {
      const el = doc.createElement(tag); el.className = cls; if (text !== undefined) el.textContent = text; return el;
    };
    const popup = make('div', 'bui-tag-manager bui-header-editor');
    inheritPopoverTypography(popup, label);
    popup.tabIndex = -1; popup.setAttribute('role', 'dialog'); popup.setAttribute('aria-label', '修改列名称');
    const heading = make('div', 'bui-tag-manager-heading');
    heading.append(make('span', 'bui-tag-manager-title', '修改列名称'));
    const close = make('button', 'clickable-icon bui-tag-manager-close');
    close.type = 'button'; close.setAttribute('aria-label', '关闭列名称设置'); setIcon(close, 'x'); heading.append(close);
    const row = make('div', 'bui-tag-manager-name');
    const input = make('input', 'bui-tag-manager-name-input');
    input.type = 'text'; input.value = String(config.getDisplayName()); input.autocomplete = 'off';
    input.setAttribute('aria-label', '列显示名称');
    const save = make('button', 'clickable-icon bui-tag-manager-save-name');
    save.type = 'button'; save.setAttribute('aria-label', '保存列显示名称'); setIcon(save, 'check'); row.append(input, save);
    const status = make('div', 'bui-tag-manager-status'); status.hidden = true; status.setAttribute('role', 'status');
    popup.append(heading, row, status);
    const edit: HeaderEditor = {binding, property, query: view.config.query, label, originalText: label.textContent ?? '',
      anchor, popup, input, status, composing: false, imeEnded: false, busy: false, clean: []};
    this.editor = edit; doc.body.append(popup);
    close.addEventListener('click', () => this.close(edit, true)); save.addEventListener('click', () => {void this.save(edit);});
    let compositionTimer = 0;
    input.addEventListener('compositionstart', () => {edit.composing = true; edit.imeEnded = false;});
    input.addEventListener('compositionend', () => {
      edit.composing = false; edit.imeEnded = true;
      compositionTimer = doc.defaultView!.setTimeout(() => {edit.imeEnded = false;}, 0);
    });
    input.addEventListener('input', () => {input.removeAttribute('aria-invalid'); status.hidden = true;});
    popup.addEventListener('keydown', event => {
      if (event.isComposing || edit.composing || event.keyCode === 229) return;
      if (event.key === 'Escape') {event.preventDefault(); event.stopPropagation(); this.close(edit, true);}
      if (event.key === 'Enter' && event.target === input) {
        event.preventDefault(); event.stopPropagation(); if (!edit.imeEnded) void this.save(edit);
      }
    });
    const outside = (event: Event) => {if (!popup.contains(event.target as Node)) this.close(edit);};
    for (const name of ['pointerdown', 'mousedown', 'focusin']) {
      doc.addEventListener(name, outside, true); edit.clean.push(() => doc.removeEventListener(name, outside, true));
    }
    edit.clean.push(() => {if (compositionTimer) doc.defaultView!.clearTimeout(compositionTimer);},
      watchPopoverViewport(popup, () => this.position(edit)));
    this.position(edit);
    if (this.editor !== edit) return;
    (preferPopoverInputFocus(anchor, keyboard) ? input : popup).focus({preventScroll: true});
  }

  private current(edit: HeaderEditor): boolean {
    const {view} = edit.binding;
    return this.editor === edit && this.bindings.has(view) && this.editable(view) &&
      edit.label.isConnected && view.theadEl.contains(edit.anchor) && view.config.query === edit.query &&
      edit.label.textContent === edit.originalText &&
      !edit.anchor.closest('[aria-readonly="true"], [aria-disabled="true"], .is-read-only, .is-disabled') &&
      (typeof view.config.getOrder !== 'function' || includesProperty(view.config.getOrder(), edit.property));
  }

  private async save(edit: HeaderEditor) {
    if (!this.current(edit)) {this.close(edit); return;}
    if (edit.composing || edit.imeEnded || edit.busy) return;
    const value = edit.input.value.replace(/[\r\n]+/g, ' ').trim();
    if (!value) {edit.input.setAttribute('aria-invalid', 'true'); edit.status.textContent = '列名称不能为空'; edit.status.hidden = false; return;}
    const config = edit.binding.view.config.getPropertyConfig(edit.property);
    if (!isIdeaPropertyConfig(config)) {this.close(edit); return;}
    edit.busy = true; edit.popup.setAttribute('aria-busy', 'true');
    try {
      // Native configuration owns persistence; this never renames the property key or touches notes.
      if (value !== config.getDisplayName()) await config.setDisplayName(value);
      if (this.editor !== edit) return;
      if (edit.label.isConnected && edit.binding.view.config.query === edit.query && edit.label.textContent === edit.originalText)
        edit.label.textContent = value;
      this.close(edit, true);
    } catch {
      if (this.editor === edit) {edit.status.textContent = '列名称未能保存，请重试'; edit.status.hidden = false;}
    } finally {edit.busy = false; edit.popup.removeAttribute('aria-busy');}
  }

  private position(edit: HeaderEditor) {
    if (!this.current(edit) || !positionAnchoredPopover(edit.anchor, edit.popup, 320)) this.close(edit);
  }
  private close(edit: HeaderEditor, focusLabel = false) {
    if (this.editor !== edit) return;
    this.editor = undefined; for (const clean of edit.clean) clean(); edit.popup.remove();
    if (focusLabel && edit.label.isConnected) edit.label.focus({preventScroll: true});
  }
  private pruneEditor() {if (this.editor && !this.current(this.editor)) this.close(this.editor);}

  prune() {
    this.pruneEditor();
    for (const binding of this.bindings.values()) if (!binding.head.isConnected ||
        binding.view._loaded === false || !tableProfile(binding.view)) this.detach(binding);
  }
  private restoreLabel(label: HTMLElement, original: Map<string, string | null>) {
    for (const [name, value] of original) value === null ? label.removeAttribute(name) : label.setAttribute(name, value);
  }
  private detach(binding: HeaderBinding) {
    if (this.editor?.binding === binding) this.close(this.editor);
    binding.head.removeEventListener('click', binding.click, true); binding.head.removeEventListener('keydown', binding.keydown, true);
    for (const [label, original] of binding.labels) this.restoreLabel(label, original);
    binding.labels.clear(); this.bindings.delete(binding.view);
  }
  clear() {if (this.editor) this.close(this.editor); for (const binding of this.bindings.values()) this.detach(binding);}
}
