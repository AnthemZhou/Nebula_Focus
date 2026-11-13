import {Component, Platform, type Plugin} from 'obsidian';

type Backdrop = {element: HTMLElement; parent: HTMLElement; next: ChildNode | null; root: HTMLElement; hadClass: boolean};
const BACKDROP_CLASS = 'bui-legacy-drawer-backdrop';

/** Older phone hosts put the drawer's fading backdrop beside the moving page.
 * Keep that same native node inside the page so its existing opacity animation
 * is clipped by the page's rounded corners. New hosts already do this.
 */
export class MobileDrawerSurface extends Component {
  private enabled: boolean;
  private stopped = false;
  private ready = false;
  private workspace?: HTMLElement;
  private observer?: MutationObserver;
  private backdrops = new Map<HTMLElement, Backdrop>();

  constructor(private plugin: Plugin, enabled = true) {super(); this.enabled = enabled;}

  onload() {
    if (!Platform.isPhone) return;
    this.registerEvent(this.plugin.app.workspace.on('layout-change', () => this.connect()));
    this.plugin.app.workspace.onLayoutReady(() => {this.ready = true; this.connect();});
  }

  setEnabled(value: boolean) {
    this.enabled = value;
    if (!value) this.clear(); else this.connect();
  }

  private connect() {
    if (!this.ready || this.stopped || !this.enabled || !Platform.isPhone) return;
    const workspace = this.plugin.app.workspace.containerEl;
    if (!workspace.isConnected) return;
    if (this.workspace !== workspace) {
      this.clear(); this.workspace = workspace;
      const Observer = workspace.ownerDocument.defaultView?.MutationObserver;
      if (!Observer) return;
      // Direct attachments only: no subtree, attributes, or per-frame work.
      this.observer = new Observer(() => this.reconcile());
      this.observer.observe(workspace, {childList: true});
    }
    this.reconcile();
  }

  private reconcile() {
    if (this.stopped || !this.enabled || !this.workspace?.isConnected) return;
    const parent = this.workspace, root = parent.querySelector<HTMLElement>(':scope > .workspace-split.mod-root');
    if (!root?.isConnected) return;
    for (const record of this.backdrops.values()) {
      if (record.element.parentElement !== record.root || record.root !== root || !record.element.isConnected)
        this.restore(record);
    }
    for (const child of parent.querySelectorAll<HTMLDivElement>(':scope > div.workspace-drawer-backdrop')) {
      const record: Backdrop = {element: child, parent, next: child.nextSibling, root, hadClass: child.classList.contains(BACKDROP_CLASS)};
      this.backdrops.set(child, record); child.classList.add(BACKDROP_CLASS);
      // Do not clone, intercept events, or change inline animation properties.
      root.prepend(child);
    }
  }

  private restore(record: Backdrop) {
    const {element, parent, next, root} = record;
    this.backdrops.delete(element);
    if (!record.hadClass) element.classList.remove(BACKDROP_CLASS);
    // The host removes this node at the end of closing. Never resurrect it.
    if (element.isConnected && element.parentElement === root && parent.isConnected)
      parent.insertBefore(element, next?.parentNode === parent ? next : null);
  }

  private clear() {
    this.observer?.disconnect(); this.observer = undefined; this.workspace = undefined;
    for (const record of this.backdrops.values()) this.restore(record);
  }

  onunload() {this.stopped = true; this.clear();}
}
