type NativeMethod = (this: unknown, ...args: unknown[]) => unknown;
type TableView = {
  type: 'table'; containerEl: HTMLElement; scrollEl?: unknown; _loaded?: unknown;
  updateVirtualDisplay?: unknown;
};
function isTableView(view: unknown): view is TableView {
  if (!view || typeof view !== 'object') return false;
  const candidate = view as Record<string, unknown>;
  return candidate.type === 'table' && candidate.containerEl instanceof HTMLElement;
}
const isMethod = (value: unknown): value is NativeMethod => typeof value === 'function';
type Binding = {
  view: TableView; root: HTMLElement; original?: NativeMethod; wrapped?: NativeMethod; descriptor?: PropertyDescriptor;
  observer: MutationObserver; live: boolean; painting: boolean; prepared: boolean; failed?: boolean;
};

/** Decorate virtual rows before the browser paints them. Native render calls
 * stay synchronous; direct renderer updates use a scoped mutation microtask.
 * The paint callback only decorates this table. An optional preparation step
 * retries until native data is ready, then runs once before that frame paints;
 * ordinary scrolling never repeats geometry setup or workspace discovery. */
export class TableRenderSync {
  private bindings = new Map<unknown, Binding>();
  constructor(private paint: (view: unknown, root: HTMLElement) => void, private enabled: () => boolean,
    private prepare?: (view: unknown) => boolean) {}

  attach(view: unknown) {
    if (!isTableView(view)) return;
    const container = view.containerEl;
    const root: HTMLElement = view.scrollEl instanceof HTMLElement ? view.scrollEl
      : container.closest<HTMLElement>('.bases-view') ?? container;
    let binding = this.bindings.get(view);
    if (binding?.root === root) {
      // Factory attachment may precede both DOM connection and native rows.
      // A later discovery can finish setup without replacing the render chain.
      if (!binding.prepared) this.refresh(binding);
      return;
    }
    if (binding) {
      // The height adapter may sit above this wrapper. Replacing that chain
      // would capture its wrapper as our new original and break reverse-order
      // teardown. Only move observation when this view replaces its root.
      binding.observer.disconnect(); binding.root = root; binding.prepared = !this.prepare;
      this.observe(binding); this.refresh(binding); return;
    }
    const win = root.ownerDocument.defaultView!;
    binding = {view, root, observer: undefined!, live: true, painting: false, prepared: !this.prepare};
    const current = binding;
    current.observer = new win.MutationObserver(records => {
      if (records.length) this.refresh(current);
    });
    const descriptor = Object.getOwnPropertyDescriptor(view, 'updateVirtualDisplay');
    const original = view.updateVirtualDisplay;
    if (isMethod(original) && (!descriptor || descriptor.writable || descriptor.configurable)) {
      current.original = original; current.descriptor = descriptor;
      const refresh = () => this.refresh(current);
      current.wrapped = function(this: unknown, ...args: unknown[]) {
        const result = original.apply(this, args);
        refresh();
        return result;
      };
      view.updateVirtualDisplay = current.wrapped;
    }
    this.bindings.set(view, current);
    this.observe(current);
    this.refresh(current);
  }

  /** Automatic row geometry calls this while its own observer is disconnected. */
  refreshView(view: unknown) {
    const binding = this.bindings.get(view);
    if (binding) this.refresh(binding);
  }

  /** Known virtual-row mutations need no delayed, workspace-wide scan. */
  owns(target: Node): boolean {
    for (const binding of this.bindings.values())
      if (binding.live && binding.root.contains(target)) return true;
    return false;
  }

  private observe(binding: Binding) {
    if (binding.live) binding.observer.observe(binding.root, {subtree: true, childList: true, characterData: true});
  }
  private refresh(binding: Binding) {
    if (!binding.live || binding.painting || binding.failed || !this.enabled() || binding.view._loaded === false || !binding.root.isConnected) return;
    binding.painting = true;
    // Consume native render records and do not observe our own icons, labels,
    // thumbnails or footer. This avoids a second decoration pass per render.
    binding.observer.disconnect();
    try {
      this.paint(binding.view, binding.root);
      if (!binding.prepared && this.prepare?.(binding.view)) {
        binding.prepared = true;
        // Preparation may virtualize a different set of rows. Finish their
        // decoration now; the painting guard absorbs nested native callbacks.
        this.paint(binding.view, binding.root);
      }
    }
    catch (error) {
      binding.failed = true;
      console.warn('Nebula Focus: table decoration unavailable; native rendering retained.', error);
    }
    finally {binding.painting = false; this.observe(binding);}
  }
  private detach(binding: Binding) {
    binding.live = false; binding.observer.disconnect();
    if (binding.wrapped && binding.view.updateVirtualDisplay === binding.wrapped) {
      if (binding.descriptor) Object.defineProperty(binding.view, 'updateVirtualDisplay', binding.descriptor);
      else delete binding.view.updateVirtualDisplay;
    }
    this.bindings.delete(binding.view);
  }
  prune() {
    for (const binding of this.bindings.values())
      if (binding.view._loaded === false || !binding.root.isConnected) this.detach(binding);
  }
  clear() {for (const binding of this.bindings.values()) this.detach(binding);}
}
