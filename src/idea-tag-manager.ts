import {setIcon} from 'obsidian';
import {ideaTone} from './idea-table';
import {IdeaTagOptions} from './idea-tag-order';
import {guardTouchScrollClicks, positionAnchoredPopover, preferPopoverInputFocus, watchPopoverViewport} from './mobile-popover';
import {TagDragMotion} from './tag-drag-motion';
import {inheritTagTypography} from './tag-typography';
import {tableProfile} from './table-profile';

import {IdeaView, IdeaQuery, isHtmlElement, isIdeaView, isIdeaQuery, isIdeaPropertyConfig} from './idea-native';
type ManagerView = IdeaView & {
  theadEl: HTMLElement;
  config: IdeaView['config'] & {query: IdeaQuery; getPropertyConfig(property: string): unknown};
};
function managerView(value: unknown): value is ManagerView {
  return isIdeaView(value) && isHtmlElement(value.theadEl) && isIdeaQuery(value.config.query) &&
    typeof value.config.getPropertyConfig === 'function';
}
export type TagCatalog = IdeaTagOptions & {values: string[]};
type Source = {
  view: unknown; property: string; anchor: HTMLElement; keyboard?: boolean;
  read(): TagCatalog;
  save(options: IdeaTagOptions): Promise<void>;
};
type Drag = {id: number; row: HTMLElement; value: string; startX: number; startY: number; moved: boolean; order: string[];
  motion: TagDragMotion; activated: boolean; holdTimer?: number; settling?: boolean; clean: (() => void)[]};
type Panel = Source & {
  view: ManagerView;
  query: IdeaQuery; popup: HTMLElement; list: HTMLElement; input: HTMLInputElement; nameInput: HTMLInputElement;
  status: HTMLElement; busy: boolean; composing: boolean; imeEnded: boolean; drag?: Drag; ignoreClick: boolean;
  autoInputFocus: boolean; clean: (() => void)[];
};
function listen(target: EventTarget, name: string, handler: EventListener, capture = false) {
  target.addEventListener(name, handler, capture);
  return () => target.removeEventListener(name, handler, capture);
}

/** Manage a column's candidate catalog. No record or Markdown write API is
 * available here; only plugin preferences and the native display-name config. */
export class IdeaTagManager {
  private panel?: Panel;

  open(source: Source): boolean {
    if (!this.available(source)) return false;
    const autoInputFocus = preferPopoverInputFocus(source.anchor, source.keyboard);
    const current = this.panel;
    if (current && current.view === source.view && current.property === source.property) {
      current.autoInputFocus = autoInputFocus;
      (autoInputFocus ? current.input : current.popup).focus({preventScroll: true}); return true;
    }
    this.close();
    const doc = source.anchor.ownerDocument;
    const make = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string) => {
      const el = doc.createElement(tag); el.className = className;
      if (text !== undefined) el.textContent = text;
      return el;
    };
    const popup = make('div', 'bui-tag-manager');
    inheritTagTypography(popup, source.anchor, source.view, source.property);
    popup.tabIndex = -1;
    popup.setAttribute('role', 'dialog'); popup.setAttribute('aria-label', `管理${source.property}标签`);
    const heading = make('div', 'bui-tag-manager-heading');
    heading.append(make('span', 'bui-tag-manager-title', `管理${source.property}标签`));
    const close = make('button', 'clickable-icon bui-tag-manager-close');
    close.type = 'button'; close.setAttribute('aria-label', '关闭标签管理'); setIcon(close, 'x');
    close.addEventListener('click', () => this.close(true)); heading.append(close);
    const nameRow = make('div', 'bui-tag-manager-name');
    const nameInput = make('input', 'bui-tag-manager-name-input');
    nameInput.type = 'text'; nameInput.setAttribute('aria-label', '列显示名称');
    nameInput.value = this.displayName(source);
    const saveName = make('button', 'clickable-icon bui-tag-manager-save-name');
    saveName.type = 'button'; saveName.setAttribute('aria-label', '保存列显示名称'); setIcon(saveName, 'check');
    nameRow.append(nameInput, saveName);
    const list = make('div', 'bui-tag-manager-list'); list.setAttribute('aria-label', '可选标签');
    const add = make('form', 'bui-tag-manager-add');
    const input = make('input', 'bui-tag-manager-input');
    input.type = 'text'; input.placeholder = '添加标签'; input.setAttribute('aria-label', '添加标签'); input.autocomplete = 'off';
    const addButton = make('button', 'clickable-icon bui-tag-manager-add-button');
    addButton.type = 'submit'; addButton.setAttribute('aria-label', '添加标签'); setIcon(addButton, 'plus'); add.append(input, addButton);
    const hint = make('div', 'bui-tag-manager-hint', '删除仅移出可选标签，已有笔记中的标签会保留。');
    const status = make('div', 'bui-tag-manager-status'); status.setAttribute('role', 'status'); status.hidden = true;
    popup.append(heading, nameRow, list, add, hint, status);
    const panel: Panel = {...source, query: source.view.config.query, popup, list, input, nameInput, status,
      busy: false, composing: false, imeEnded: false, ignoreClick: false, autoInputFocus, clean: []};
    this.panel = panel; doc.body.append(popup);
    saveName.addEventListener('click', () => {void this.rename(panel);});
    add.addEventListener('submit', event => {event.preventDefault(); if (!panel.composing && !panel.imeEnded) void this.add(panel);});
    popup.addEventListener('compositionstart', () => {panel.composing = true; panel.imeEnded = false;});
    popup.addEventListener('compositionend', () => {
      panel.composing = false; panel.imeEnded = true;
      doc.defaultView!.setTimeout(() => {panel.imeEnded = false;}, 0);
    });
    popup.addEventListener('keydown', event => {
      if (event.isComposing || panel.composing || event.keyCode === 229) return;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation();
        if (panel.drag) this.endDrag(panel, false); else this.close(true);
      } else if (event.key === 'Enter' && event.target === nameInput) {
        event.preventDefault(); event.stopPropagation(); if (!panel.imeEnded) void this.rename(panel);
      }
    });
    popup.addEventListener('pointerdown', () => {
      if (!panel.drag) panel.ignoreClick = false;
      if (!preferPopoverInputFocus(popup)) panel.autoInputFocus = false;
    }, true);
    popup.addEventListener('click', event => {
      if (!panel.ignoreClick) return;
      panel.ignoreClick = false; event.preventDefault(); event.stopImmediatePropagation();
    }, true);
    const outside = (event: Event) => {if (!popup.contains(event.target as Node)) this.close();};
    panel.clean.push(guardTouchScrollClicks(popup), watchPopoverViewport(popup, () => this.position(panel)));
    panel.clean.push(listen(doc, 'pointerdown', outside, true), listen(doc, 'mousedown', outside, true),
      listen(doc, 'focusin', outside, true));
    this.render(panel); this.position(panel); (autoInputFocus ? input : popup).focus({preventScroll: true}); return true;
  }

  private available(source: Source): source is Source & {view: ManagerView} {
    const {view, anchor} = source;
    return managerView(view) && view?._loaded !== false && !view.isReadOnly && !view.readOnly && !view.queryController?.isReadOnly &&
      view.queryController?.view === view &&
      view.type === 'table' && !!tableProfile(view)?.tags[source.property] && anchor.isConnected &&
      view.theadEl?.contains(anchor) && typeof view.config?.getPropertyConfig === 'function' &&
      typeof view.config.query?.saveFn === 'function' &&
      !anchor.closest('[aria-readonly="true"], [aria-disabled="true"], .is-read-only, .is-disabled');
  }
  private current(panel: Panel): boolean {
    return this.panel === panel && this.available(panel) && panel.view.config.query === panel.query;
  }
  private displayName(source: Source) {
    try {
      if (!managerView(source.view)) return source.property;
      const config = source.view.config.getPropertyConfig(`note.${source.property}`);
      return isIdeaPropertyConfig(config) ? String(config.getDisplayName()) : source.property;
    }
    catch {return source.property;}
  }
  private status(panel: Panel, text: string) {panel.status.textContent = text; panel.status.hidden = false;}

  private render(panel: Panel, active?: string) {
    if (!this.current(panel)) {this.close(); return;}
    const {values} = panel.read(), doc = panel.popup.ownerDocument;
    panel.list.replaceChildren();
    for (const value of values) {
      const row = doc.createElement('div'); row.className = 'bui-tag-manager-option'; row.dataset.value = value;
      const grip = doc.createElement('button'); grip.type = 'button'; grip.className = 'clickable-icon bui-tag-manager-grip';
      grip.setAttribute('aria-label', `调整 ${value} 顺序`); grip.title = '拖动排序；Alt + ↑ / ↓';
      grip.setAttribute('aria-keyshortcuts', 'Alt+ArrowUp Alt+ArrowDown'); setIcon(grip, 'grip-vertical');
      row.addEventListener('pointerdown', event => {
        if ((event.target as Element).closest('.bui-tag-manager-remove')) return;
        this.beginDrag(panel, row, value, event);
      });
      grip.addEventListener('keydown', event => {
        if (!event.altKey || event.metaKey || event.ctrlKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
        event.preventDefault(); event.stopPropagation();
        const current = panel.read().values, from = current.indexOf(value), to = from + (event.key === 'ArrowDown' ? 1 : -1);
        if (from < 0 || to < 0 || to >= current.length || panel.busy) return;
        const order = [...current]; order.splice(from, 1); order.splice(to, 0, value);
        void this.reorder(panel, order, value);
      });
      const chip = doc.createElement('span'); chip.className = 'bui-native-tag bui-tag-manager-chip';
      chip.dataset.buiTone = ideaTone(value, panel.property); chip.textContent = value;
      const remove = doc.createElement('button'); remove.type = 'button'; remove.className = 'clickable-icon bui-tag-manager-remove';
      remove.setAttribute('aria-label', `删除标签 ${value}`); setIcon(remove, 'x');
      remove.addEventListener('click', () => {void this.remove(panel, value);});
      row.append(grip, chip, remove); panel.list.append(row);
    }
    if (!values.length) {
      const empty = doc.createElement('div'); empty.className = 'bui-tag-manager-empty'; empty.textContent = '暂无可选标签'; panel.list.append(empty);
    }
    // A tapped phone input keeps its real keyboard across a preference save.
    // Busy guards prevent duplicate submissions without blurring that input.
    for (const control of panel.popup.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button'))
      control.disabled = panel.busy && (panel.autoInputFocus || control.tagName !== 'INPUT');
    if (active) [...panel.list.children].find(row => (row as HTMLElement).dataset.value === active)?.querySelector<HTMLElement>('button')?.focus({preventScroll: true});
    this.position(panel);
  }

  private async change(panel: Panel, options: IdeaTagOptions, focus?: string, preserveRows = false): Promise<boolean> {
    if (!this.current(panel) || panel.busy || panel.drag) return false;
    // Disabling a focused native control can move focus to body. Keep it on
    // the same dialog while saving so our outside-focus listener does not close it.
    const focused = panel.popup.ownerDocument.activeElement;
    const nativeInputFocus = !panel.autoInputFocus && (focused === panel.input || focused === panel.nameInput);
    if (focused && panel.popup.contains(focused) && !nativeInputFocus) panel.popup.focus({preventScroll: true});
    panel.busy = true; panel.status.hidden = true; panel.popup.setAttribute('aria-busy', 'true');
    if (preserveRows) {
      // The drag preview already has the final order. Rebuilding from the old
      // catalog here would flash the previous order during an async save.
      for (const control of panel.popup.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button'))
        control.disabled = panel.autoInputFocus || control.tagName !== 'INPUT';
    } else this.render(panel);
    try {
      await panel.save(options);
      if (!this.current(panel)) return false;
      return true;
    } catch {
      if (this.current(panel)) this.status(panel, '选项未能保存，请重试');
      return false;
    } finally {
      panel.busy = false; panel.popup.removeAttribute('aria-busy');
      if (this.current(panel)) {
        this.render(panel, panel.autoInputFocus ? focus : undefined);
        if (panel.autoInputFocus && !focus && (focused === panel.input || focused === panel.nameInput)) (focused as HTMLElement).focus({preventScroll: true});
      }
    }
  }
  private async add(panel: Panel) {
    const value = panel.input.value.trim(); if (!value || panel.busy || !this.current(panel)) return;
    const state = panel.read();
    if (state.values.includes(value)) {this.status(panel, '此标签已存在'); return;}
    const saved = await this.change(panel, {order: [...state.values, ...state.order.filter(item => !state.values.includes(item) && item !== value), value],
      added: [...new Set([...state.added, value])], hidden: state.hidden.filter(item => item !== value)});
    if (saved && this.current(panel)) {
      if (panel.input.value.trim() === value) panel.input.value = '';
      if (panel.autoInputFocus) panel.input.focus({preventScroll: true});
    }
  }
  private async remove(panel: Panel, value: string) {
    if (panel.busy || !this.current(panel)) return;
    const state = panel.read();
    await this.change(panel, {order: state.order.filter(item => item !== value), added: state.added.filter(item => item !== value),
      hidden: [...new Set([...state.hidden, value])]});
  }
  private async reorder(panel: Panel, order: string[], focus: string, preserveRows = false) {
    if (!this.current(panel)) return;
    const state = panel.read();
    if (order.length !== state.values.length || order.some(value => !state.values.includes(value))) return;
    // Keep hidden/temporarily absent preference slots after the visible order.
    await this.change(panel, {...state, order: [...order, ...state.order.filter(value => !order.includes(value))]}, focus, preserveRows);
  }

  private async rename(panel: Panel) {
    if (!this.current(panel) || panel.busy || panel.composing) return;
    const value = panel.nameInput.value.trim(), original = this.displayName(panel);
    if (!value) {this.status(panel, '列名称不能为空'); return;}
    if (value === original) return;
    const config = panel.view.config.getPropertyConfig(`note.${panel.property}`);
    if (!isIdeaPropertyConfig(config)) return;
    panel.busy = true; panel.status.hidden = true;
    try {
      config.setDisplayName(value);
      await panel.query.saveFn.call(panel.query, panel.query);
      const controller = panel.view.queryController, notify = controller?.requestNotifyView;
      if (typeof notify === 'function') (notify as () => unknown).call(controller);
    } catch {
      if (config.getDisplayName() === value) config.setDisplayName(original);
      if (this.current(panel)) {panel.nameInput.value = original; this.status(panel, '列名称未能保存，请重试');}
    } finally {panel.busy = false; if (this.current(panel)) this.render(panel);}
  }

  private beginDrag(panel: Panel, row: HTMLElement, value: string, event: PointerEvent) {
    if (!this.current(panel) || panel.busy || panel.drag || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const fromGrip = !!(event.target as Element).closest('.bui-tag-manager-grip');
    const hold = event.pointerType === 'touch' && !fromGrip;
    if (fromGrip) event.preventDefault();
    event.stopPropagation();
    const doc = row.ownerDocument, win = doc.defaultView!;
    const drag: Drag = {id: event.pointerId, row, value, startX: event.clientX, startY: event.clientY, moved: false, activated: false,
      order: panel.read().values, motion: new TagDragMotion(panel.list, row, event.clientX, event.clientY), clean: []};
    panel.drag = drag;
    const activate = (x: number, y: number) => {
      if (panel.drag !== drag || drag.activated) return;
      if (!this.current(panel)) {this.endDrag(panel, false, false); return;}
      drag.activated = true; row.classList.add('is-dragging');
      try {panel.list.setPointerCapture?.(event.pointerId);} catch { /* Document fallback. */ }
      drag.motion.move(x, y);
    };
    if (hold) drag.holdTimer = win.setTimeout(() => activate(drag.startX, drag.startY), 180);
    const touchmove = (next: TouchEvent) => {
      if (panel.drag === drag && drag.activated && next.touches.length === 1 && next.cancelable) next.preventDefault();
    };
    doc.addEventListener('touchmove', touchmove, {capture: true, passive: false});
    drag.clean.push(() => doc.removeEventListener('touchmove', touchmove, true));
    const move = (raw: Event) => {
      const next = raw as PointerEvent;
      if (panel.drag !== drag || next.pointerId !== drag.id) return;
      const distance = Math.hypot(next.clientX - drag.startX, next.clientY - drag.startY);
      if (hold && !drag.activated) {
        if (distance > 8) this.endDrag(panel, false, false);
        return;
      }
      if (!drag.moved && distance < (next.pointerType === 'touch' ? 8 : 4)) return;
      next.preventDefault(); next.stopPropagation();
      activate(next.clientX, next.clientY); drag.moved = true;
      drag.motion.move(next.clientX, next.clientY);
      const bounds = panel.list.getBoundingClientRect();
      if (next.clientY < bounds.top + 16) panel.list.scrollTop -= 12;
      else if (next.clientY > bounds.bottom - 16) panel.list.scrollTop += 12;
      const others = ([...panel.list.children] as HTMLElement[]).filter(item => item !== row);
      const before = others.findIndex(item => {const rect = drag.motion.rect(item); return next.clientY < rect.top + rect.height / 2;});
      others.splice(before < 0 ? others.length : before, 0, row);
      if (others.some((item, index) => panel.list.children[index] !== item)) drag.motion.reorder(others);
    };
    const finish = (raw: Event) => {
      const next = raw as PointerEvent; if (next.pointerId !== drag.id || panel.drag !== drag) return;
      if (!drag.activated && !drag.moved) {this.endDrag(panel, false, false, false); return;}
      next.preventDefault(); next.stopPropagation();
      const bounds = panel.list.getBoundingClientRect();
      this.endDrag(panel, next.clientX >= bounds.left && next.clientX <= bounds.right && next.clientY >= bounds.top && next.clientY <= bounds.bottom);
    };
    const cancel = (event: Event) => {
      if ('pointerId' in event && (event as PointerEvent).pointerId !== drag.id) return;
      this.endDrag(panel, false);
    };
    drag.clean.push(listen(doc, 'pointermove', move, true), listen(doc, 'pointerup', finish, true),
      listen(doc, 'pointercancel', cancel, true), listen(panel.list, 'lostpointercapture', cancel), listen(doc.defaultView!, 'blur', cancel));
  }
  private endDrag(panel: Panel, commit: boolean, render = true, suppressClick = true) {
    const drag = panel.drag; if (!drag) return;
    const order = [...panel.list.children].map(item => (item as HTMLElement).dataset.value!);
    panel.ignoreClick = suppressClick;
    if (drag.holdTimer !== undefined) panel.popup.ownerDocument.defaultView!.clearTimeout(drag.holdTimer);
    for (const remove of drag.clean) remove(); drag.clean = [];
    try {panel.list.releasePointerCapture?.(drag.id);} catch { /* Already cancelled. */ }
    const complete = () => {
      if (panel.drag !== drag) return;
      panel.drag = undefined; drag.motion.dispose(); drag.row.classList.remove('is-dragging');
      if (commit && drag.moved && order.some((value, index) => value !== drag.order[index])) void this.reorder(panel, order, drag.value, true);
      else if (render && drag.moved && this.current(panel)) this.render(panel, panel.autoInputFocus ? drag.value : undefined);
    };
    if (commit && drag.moved) {
      if (drag.settling) return;
      drag.settling = true; drag.motion.finish(complete);
    } else complete();
  }
  private position(panel: Panel) {
    if (!this.current(panel)) {this.close(); return;}
    if (!positionAnchoredPopover(panel.anchor, panel.popup, 280)) this.close();
  }
  prune() {if (this.panel && !this.current(this.panel)) this.close();}
  close(restoreFocus = false) {
    const panel = this.panel; if (!panel) return;
    this.panel = undefined;
    this.endDrag(panel, false); for (const remove of panel.clean) remove(); panel.popup.remove();
    if (restoreFocus && panel.anchor.isConnected) panel.anchor.querySelector<HTMLElement>('.bases-table-header-name')?.focus({preventScroll: true});
  }
}
