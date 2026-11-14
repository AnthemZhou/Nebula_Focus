import {Menu, Notice, setIcon} from 'obsidian';
import {IdeaFile, IdeaView, isHtmlElement, isNativeTableView} from './idea-native';
import {guardTouchScrollClicks} from './mobile-popover';

type Binding = {view: IdeaView; file: IdeaFile; path: string; cell: HTMLElement; button: HTMLButtonElement; shade: HTMLElement; cleanup(): void};
type Actions = {canRemove(view: unknown, file: IdeaFile): boolean; remove(view: unknown, file: IdeaFile): Promise<void>};

/** One explicit file action per visible record, independent of title semantics.
 * Bind the file identity, not its row index: filtering/recycling cannot change
 * the deletion target of an already open menu. Native text menus stay native. */
export class TableRowActions {
  private bindings = new Map<HTMLElement, Binding>();
  private context?: {binding: Binding; event: Event};
  private contextWindows = new Map<Window, {count: number; listener: EventListener}>();
  constructor(private actions: Actions) {}

  refresh(view: unknown) {
    this.prune();
    if (!isNativeTableView(view)) return;
    const seen = new Set<HTMLElement>();
    for (const row of view.rows ?? []) {
      const file = row.entry?.file, first = row.cells?.[0];
      const cell = first?.el?.closest<HTMLElement>('.bases-td') ?? first?.renderer?.el?.closest<HTMLElement>('.bases-td');
      if (!file || !cell?.isConnected || !this.actions.canRemove(view, file)) continue;
      seen.add(cell);
      const old = this.bindings.get(cell);
      if (old && (old.view !== view || old.file !== file || old.path !== file.path)) this.release(old);
      if (this.bindings.has(cell)) continue;
      const shade = cell.createSpan();
      shade.className = 'bui-row-action-shade'; shade.setAttribute('aria-hidden', 'true');
      const button = cell.createEl('button');
      button.type = 'button'; button.className = 'bui-row-menu-button';
      button.setAttribute('aria-label', '页面操作'); button.setAttribute('aria-haspopup', 'menu');
      setIcon(button, 'ellipsis'); cell.classList.add('bui-row-actions-cell'); cell.append(button);
      const stopTouch = guardTouchScrollClicks(button);
      const stopDown = (event: Event) => event.stopPropagation();
      const click = (event: MouseEvent) => {
        event.preventDefault(); event.stopPropagation();
        if (!this.current(binding)) return;
        const menu = new Menu();
        this.addRemoveItem(menu, binding);
        const bounds = button.getBoundingClientRect();
        menu.showAtPosition({x: bounds.left, y: bounds.bottom});
      };
      // Stop the table's range-selection handler without cancelling focus or
      // the browser's normal touch scrolling and keyboard activation.
      const stopContext = this.trackContextWindow(cell.ownerDocument.defaultView);
      button.addEventListener('pointerdown', stopDown);
      button.addEventListener('mousedown', stopDown);
      button.addEventListener('click', click);
      const binding: Binding = {view, file, path: file.path, cell, button, shade, cleanup: () => {
        stopContext();
        stopTouch(); button.removeEventListener('pointerdown', stopDown);
        button.removeEventListener('mousedown', stopDown); button.removeEventListener('click', click);
      }};
      this.bindings.set(cell, binding);
    }
    for (const binding of this.bindings.values()) if (binding.view === view && !seen.has(binding.cell)) this.release(binding);
  }

  private trackContextWindow(win: Window | null): () => void {
    if (!win) return () => {};
    let state = this.contextWindows.get(win);
    if (!state) {
      const listener: EventListener = event => {
        this.context = undefined;
        // The native table emits file-menu from an ancestor capture handler.
        // Track the originating row at its own window first, including popouts.
        for (const target of event.composedPath()) {
          if (!isHtmlElement(target)) continue;
          const binding = this.bindings.get(target);
          if (!binding || !this.current(binding)) continue;
          const context = {binding, event};
          this.context = context;
          // Real browser input can run microtasks between capture listeners.
          // Keep the association until dispatch finishes; eventPhase below
          // rejects later menus even before the zero-delay cleanup runs.
          const clear = () => {if (this.context === context) this.context = undefined;};
          queueMicrotask(() => {if (event.eventPhase === 0) clear(); else win.setTimeout(clear, 0);});
          break;
        }
      };
      state = {count: 0, listener};
      this.contextWindows.set(win, state);
      win.addEventListener('contextmenu', listener, true);
    }
    state.count++;
    return () => {
      if (--state.count !== 0) return;
      win.removeEventListener('contextmenu', state.listener, true);
      this.contextWindows.delete(win);
    };
  }

  /** Extend the host's existing record menu, retaining its native actions. */
  addToFileMenu(menu: Menu, file: IdeaFile): boolean {
    const context = this.context;
    if (context?.event.eventPhase === 0) {this.context = undefined; return false;}
    const binding = context?.binding;
    if (!binding || binding.file !== file || !this.current(binding)) return false;
    this.addRemoveItem(menu, binding);
    return true;
  }

  private addRemoveItem(menu: Menu, binding: Binding) {
    menu.addItem(item => item.setTitle('将页面移到回收站').setIcon('trash-2').setWarning(true).onClick(() => {
      if (!this.current(binding)) return;
      void this.actions.remove(binding.view, binding.file).catch(error => {
        new Notice(error instanceof Error ? error.message : '页面未能移到回收站');
      });
    }));
  }

  private current(binding: Binding): boolean {
    return this.bindings.get(binding.cell) === binding && binding.button.isConnected && binding.view._loaded !== false &&
      binding.path === binding.file.path && this.actions.canRemove(binding.view, binding.file) &&
      !!binding.view.rows?.some(row => row.entry?.file === binding.file && row.cells?.some(cell =>
        cell.el === binding.cell || binding.cell.contains(cell.renderer?.el ?? cell.el ?? null)));
  }
  private release(binding: Binding) {
    if (this.context?.binding === binding) this.context = undefined;
    binding.cleanup(); binding.button.remove(); binding.shade.remove(); binding.cell.classList.remove('bui-row-actions-cell'); this.bindings.delete(binding.cell);
  }
  prune() {for (const binding of this.bindings.values()) if (!binding.cell.isConnected || binding.view._loaded === false) this.release(binding);}
  clear() {for (const binding of this.bindings.values()) this.release(binding);}
}
