import {Menu, Notice, setIcon} from 'obsidian';
import {IdeaFile, IdeaView, isNativeTableView} from './idea-native';
import {guardTouchScrollClicks} from './mobile-popover';

type Binding = {view: IdeaView; file: IdeaFile; path: string; cell: HTMLElement; button: HTMLButtonElement; cleanup(): void};
type Actions = {canRemove(view: unknown, file: IdeaFile): boolean; remove(view: unknown, file: IdeaFile): Promise<void>};

/** One explicit file action per visible record, independent of title semantics.
 * Bind the file identity, not its row index: filtering/recycling cannot change
 * the deletion target of an already open menu. Native text menus stay native. */
export class TableRowActions {
  private bindings = new Map<HTMLElement, Binding>();
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
        menu.addItem(item => item.setTitle('将页面移到回收站').setIcon('trash-2').setWarning(true).onClick(() => {
          if (!this.current(binding)) return;
          void this.actions.remove(view, file).catch(error => {
            new Notice(error instanceof Error ? error.message : '页面未能移到回收站');
          });
        }));
        const bounds = button.getBoundingClientRect();
        menu.showAtPosition({x: bounds.left, y: bounds.bottom});
      };
      // Stop the table's range-selection handler without cancelling focus or
      // the browser's normal touch scrolling and keyboard activation.
      button.addEventListener('pointerdown', stopDown);
      button.addEventListener('mousedown', stopDown);
      button.addEventListener('click', click);
      const binding: Binding = {view, file, path: file.path, cell, button, cleanup: () => {
        stopTouch(); button.removeEventListener('pointerdown', stopDown);
        button.removeEventListener('mousedown', stopDown); button.removeEventListener('click', click);
      }};
      this.bindings.set(cell, binding);
    }
    for (const binding of this.bindings.values()) if (binding.view === view && !seen.has(binding.cell)) this.release(binding);
  }

  private current(binding: Binding): boolean {
    return this.bindings.get(binding.cell) === binding && binding.button.isConnected && binding.view._loaded !== false &&
      binding.path === binding.file.path && this.actions.canRemove(binding.view, binding.file) &&
      !!binding.view.rows?.some(row => row.entry?.file === binding.file && row.cells?.some(cell =>
        cell.el === binding.cell || binding.cell.contains(cell.renderer?.el ?? cell.el ?? null)));
  }
  private release(binding: Binding) {
    binding.cleanup(); binding.button.remove(); binding.cell.classList.remove('bui-row-actions-cell'); this.bindings.delete(binding.cell);
  }
  prune() {for (const binding of this.bindings.values()) if (!binding.cell.isConnected || binding.view._loaded === false) this.release(binding);}
  clear() {for (const binding of this.bindings.values()) this.release(binding);}
}
