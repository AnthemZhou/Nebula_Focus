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
  // Retained for callers sharing the table history adapter; titles no longer
  // rename files or properties from the grid.
  rename?(view: unknown, file: IdeaFile, basename: string): unknown;
  open?(view: unknown, file: IdeaFile, event: MouseEvent | KeyboardEvent, titleProperty?: string): unknown;
};

function currentFileLink(link: HTMLElement, file: IdeaFile): boolean {
  const target = link.getAttribute('data-href') ?? link.getAttribute('href');
  if (!target) return false;
  try {
    const normalized = decodeURIComponent(target).replace(/^\.\//, '');
    return normalized === file.path || normalized === file.path.replace(/\.md$/i, '');
  } catch {return false;}
}

type Binding = {
  view: TitleView; row: TitleRow; file: IdeaFile; path: string; query: unknown;
  titleColumn: string; titleProperty: string; kind: TableTitleProfile['kind']; nativeText: boolean;
  cell: HTMLElement; outer: HTMLElement; link: HTMLElement; text: HTMLElement; icon: HTMLButtonElement;
  attributes: Map<string, string | null>; hadTitleClass: boolean; hadCellClass: boolean;
  cleanup: () => void; forwarding: boolean; down?: {x: number; y: number; moved: boolean}; stopGesture?: () => void;
};
/** Record titles are navigation targets, including native note-title fields.
 * Keep the existing class/style hooks and native elements; renaming belongs to
 * the opened page's native title, never to a second grid editing surface.
 */
export class IdeaTitleEditors {
  private bindings = new Map<HTMLElement, Binding>();
  constructor(private actions?: TitleActions) {}

  refresh(view: unknown) {
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
      else {
        // Native renderers can replace the title's contents without replacing
        // the link. Keep their nodes and reattach only the inline hit region.
        if (binding.text.parentElement !== link) binding.text = this.wrapTitleText(link);
        if (nativeText && link.getAttribute('contenteditable') !== 'false')
          link.setAttribute('contenteditable', 'false');
      }
      }
    }
    for (const binding of this.bindings.values()) if (binding.view === view && !seen.has(binding.link)) this.release(binding);
  }

  private attach(view: TitleView, row: TitleRow, cell: HTMLElement, link: HTMLElement, profile: TableTitleProfile, nativeText: boolean) {
    const doc = link.ownerDocument, icon = cell.createEl('button');
    icon.type = 'button';
    icon.className = 'bui-idea-page-button'; icon.setAttribute('aria-label', '打开笔记');
    setIcon(icon, 'file-text');
    const attributes = this.snapshot(link, ['tabindex', 'role', 'contenteditable']);
    const outer = cell.closest<HTMLElement>('.bases-td') ?? cell;
    const binding: Binding = {view, row, file: row.entry.file, path: row.entry.file.path, query: view.config.query,
      titleColumn: profile.titleColumn, titleProperty: profile.titleProperty, kind: profile.kind, nativeText,
      cell, outer, link, text: this.wrapTitleText(link), icon, attributes, hadTitleClass: link.classList.contains('bui-idea-title'),
      hadCellClass: cell.classList.contains('bui-idea-title-cell'), cleanup: () => {}, forwarding: false};
    this.bindings.set(link, binding);
    link.classList.add('bui-idea-title'); cell.classList.add('bui-idea-title-cell');
    link.tabIndex = 0; link.setAttribute('role', 'link');
    if (nativeText) link.setAttribute('contenteditable', 'false');
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
    const ownsTitle = (target: EventTarget | null): boolean => {
      const Node = doc.defaultView!.Node;
      return target instanceof Node && link.contains(target);
    };
    const titleOrPadding = (target: EventTarget | null): boolean => {
      const Element = doc.defaultView!.Element;
      if (!(target instanceof Element) || !outer.contains(target)) return false;
      if (ownsTitle(target)) return true;
      return (outer === cell || target.closest('.bases-td') === outer) &&
        !target.closest('button, a, input, textarea, select, [contenteditable]');
    };
    listen(outer, 'pointerdown', event => {
      if (event.button === 0 && titleOrPadding(event.target)) this.trackGesture(binding, event);
    }, true);
    listen(outer, 'mousedown', event => {
      // A native note property is normally contenteditable. Keep its keyboard
      // hidden for taps, while leaving pointer defaults free for touch scrolling.
      if (binding.nativeText && ownsTitle(event.target) && event.button === 0 && !event.shiftKey)
        event.preventDefault();
    }, true);
    const activate = (event: MouseEvent) => {
      if (binding.forwarding || !titleOrPadding(event.target) || (event.button !== 0 && event.button !== 1)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const down = binding.down; binding.down = undefined; binding.stopGesture?.();
      const moved = down && (down.moved || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5);
      // Cell padding has no editing action. Shift/range selection and scrolling
      // must not accidentally navigate or mutate a record.
      if (!ownsTitle(event.target) || event.shiftKey || moved || (view.selection && !down)) return;
      const selection = doc.getSelection();
      if (selection && !selection.isCollapsed && selection.anchorNode && link.contains(selection.anchorNode)) return;
      this.navigate(binding, event);
    };
    // Capture on the outer td, before a native property renderer can start an
    // editor or consume the title click. The injected route sees the real owner.
    listen(outer, 'click', activate, true);
    listen(outer, 'auxclick', activate, true);
    listen(outer, 'dblclick', event => {
      if (!binding.forwarding && titleOrPadding(event.target)) {
        event.preventDefault(); event.stopImmediatePropagation();
      }
    }, true);
    listen(outer, 'keydown', event => {
      if (!ownsTitle(event.target) || event.defaultPrevented) return;
      if (event.isComposing || event.key === 'Process') {event.stopImmediatePropagation(); return;}
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault(); event.stopImmediatePropagation();
        binding.down = undefined; binding.stopGesture?.();
        if (!event.shiftKey) this.navigate(binding, event);
      } else if (['Backspace', 'Delete', 'F2'].includes(event.key) ||
          (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.length === 1)) {
        // Bases otherwise treats typing/Delete on the focused link as editing
        // the active cell. Page names are edited only after opening the page.
        event.preventDefault(); event.stopImmediatePropagation();
      }
    }, true);
    for (const type of ['cut', 'paste'] as const) listen(outer, type, event => {
      if (ownsTitle(event.target)) {event.preventDefault(); event.stopImmediatePropagation();}
    }, true);
    listen(icon, 'click', event => {
      event.preventDefault(); event.stopPropagation(); this.navigate(binding, event);
    });
    listen(icon, 'auxclick', event => {
      if (event.button !== 1) return;
      event.preventDefault(); event.stopPropagation(); this.navigate(binding, event);
    });
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
  private navigate(binding: Binding, event: MouseEvent | KeyboardEvent) {
    if (!this.current(binding)) return;
    if (this.actions?.open) {
      try {
        void Promise.resolve(this.actions.open(binding.view, binding.file, event,
          binding.kind === 'property' ? binding.titleProperty : undefined))
          .catch(() => {new Notice('页面未能打开，请重试');});
      } catch {new Notice('页面未能打开，请重试');}
      return;
    }
    const win = binding.link.ownerDocument.defaultView!;
    const mouse = event instanceof win.MouseEvent ? event : undefined;
    binding.forwarding = true;
    try {
      // Preserve native link behavior when no workspace route is installed.
      binding.link.dispatchEvent(new win.MouseEvent(mouse?.type ?? 'click', {bubbles: true, cancelable: true,
        button: mouse?.button ?? 0, buttons: mouse?.buttons ?? 0, detail: mouse?.detail ?? 0,
        clientX: mouse?.clientX ?? 0, clientY: mouse?.clientY ?? 0,
        metaKey: event.metaKey, ctrlKey: event.ctrlKey, altKey: event.altKey, shiftKey: event.shiftKey}));
    } finally {binding.forwarding = false;}
  }

  private wrapTitleText(link: HTMLElement): HTMLElement {
    // The native link is a full-width block for wrapping and row measurement.
    // An inline descendant makes only each rendered text line a pointer target
    // without changing the block's width, padding or original text nodes.
    const children = Array.from(link.childNodes);
    const text = link.createSpan();
    text.className = 'bui-idea-title-text';
    text.append(...children);
    return text;
  }

  private snapshot(el: HTMLElement, attributes: string[]) {
    return new Map(attributes.map(name => [name, el.getAttribute(name)]));
  }
  private restore(el: HTMLElement, attributes: Map<string, string | null>) {
    for (const [name, value] of attributes) value === null ? el.removeAttribute(name) : el.setAttribute(name, value);
  }
  private release(binding: Binding) {
    binding.cleanup(); binding.icon.remove();
    if (binding.text.parentElement === binding.link) binding.text.replaceWith(...Array.from(binding.text.childNodes));
    this.restore(binding.link, binding.attributes);
    if (!binding.hadTitleClass) binding.link.classList.remove('bui-idea-title');
    if (!binding.hadCellClass) binding.cell.classList.remove('bui-idea-title-cell');
    this.bindings.delete(binding.link);
  }
  private releaseView(view: unknown) {for (const binding of this.bindings.values()) if (binding.view === view) this.release(binding);}
  prune() {
    for (const binding of this.bindings.values()) if (!this.current(binding)) this.release(binding);
  }
  clear() {for (const binding of [...this.bindings.values()]) this.release(binding);}
}
