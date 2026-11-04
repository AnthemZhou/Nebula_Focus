import {setIcon} from 'obsidian';
type Native = any;

/** Explicit, view-scoped actions for phones without a hardware keyboard. */
export class MobileHistoryActions {
  private items = new Map<Native, {root: HTMLElement; undo: HTMLButtonElement; redo: HTMLButtonElement; release: () => void}>();
  constructor(private history: {
    forView(view: Native, redo: boolean, checking: boolean): boolean;
    registerSurface(view: Native, root: HTMLElement): () => void;
  }) {}
  refresh(view: Native) {
    const host = view?.queryController?.viewHeaderEl as HTMLElement | undefined;
    if (!host?.isConnected || view.queryController.view !== view) return;
    let item = this.items.get(view);
    if (item && item.root.parentElement !== host) {this.remove(view); item = undefined;}
    if (!item) {
      const root = host.ownerDocument.createElement('div');
      root.className = 'bui-mobile-actions'; root.setAttribute('role', 'group'); root.setAttribute('aria-label', '数据库撤销与重做');
      const button = (redo: boolean) => {
        const el = host.ownerDocument.createElement('button'); el.type = 'button'; el.className = 'bui-mobile-history-button';
        el.setAttribute('aria-label', redo ? '重做数据库操作' : '撤销数据库操作');
        const icon = host.ownerDocument.createElement('span'); icon.className = 'bui-mobile-action-icon';
        icon.setAttribute('aria-hidden', 'true'); setIcon(icon, redo ? 'redo-2' : 'undo-2');
        const label = host.ownerDocument.createElement('span'); label.textContent = redo ? '重做' : '撤销';
        el.append(icon, label);
        el.addEventListener('click', event => {
          event.preventDefault(); event.stopPropagation(); this.history.forView(view, redo, false);
        });
        root.append(el); return el;
      };
      const undo = button(false), redo = button(true); host.append(root);
      item = {root, undo, redo, release: this.history.registerSurface(view, root)}; this.items.set(view, item);
    }
    item.undo.disabled = !this.history.forView(view, false, true);
    item.redo.disabled = !this.history.forView(view, true, true);
  }
  prune() {for (const [view, item] of this.items) if (!item.root.isConnected || view._loaded === false || view.queryController?.view !== view) this.remove(view);}
  private remove(view: Native) {const item = this.items.get(view); item?.release(); item?.root.remove(); this.items.delete(view);}
  clear() {for (const view of this.items.keys()) this.remove(view);}
}
