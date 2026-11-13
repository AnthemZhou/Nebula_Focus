import {Component, Platform, Plugin} from 'obsidian';

export interface RibbonPreferences {visibility: Record<string, boolean>}
export interface RibbonItem {id: string; label: string; visible: boolean}
const ACTION = '.workspace-ribbon .side-dock-actions > .side-dock-ribbon-action';
const HIDDEN = 'bui-ribbon-hidden';
const FOOTER = '.workspace-sidedock-vault-profile > .workspace-drawer-vault-actions';
const FOOTER_CLASS = 'bui-ribbon-vault-actions';
const VAULT_SWITCHER = '.workspace-sidedock-vault-profile > .workspace-drawer-vault-switcher';
const VAULT_HEADER = '.bui-pages-desktop-header';
const VAULT_CLASS = 'bui-header-vault-switcher';
const VAULT_SOURCE_CLASS = 'bui-header-vault-source';
const OBSERVED = '.workspace-ribbon, .side-dock-actions, .workspace-sidedock-vault-profile, .workspace-drawer-vault-actions, .bui-pages-desktop-header';
interface FooterMove {element: HTMLElement; parent: HTMLElement; marker: Comment; destination: HTMLElement; hadClass: boolean}
interface VaultMove extends FooterMove {parentHadClass: boolean}
const known = [
  ['quick-switcher', 'file-search', /^(打开快速切换|Open quick switcher)$/i, true],
  ['command-palette', 'terminal', /^(打开命令面板|Open command palette)$/i, true],
  ['pages', 'panel-left', /^页面侧栏$/, true],
  ['right-tab', 'panel-right-open', /^在右侧打开新标签页$/, true],
  ['graph', 'git-fork', /^(查看关系图谱|Open graph view)$/i, false],
  ['canvas', 'layout-dashboard', /^(新建白板|Create new canvas)$/i, false],
  ['daily-note', 'calendar', /^(打开\/创建今天的日记|Open today's daily note)$/i, false],
  ['templates', 'files', /^(插入模板|Insert template)$/i, false],
  ['bases', 'layout-list', /^(新建数据库|Create new base)$/i, false],
] as const;

export function readRibbonPreferences(value: unknown): RibbonPreferences {
  const result: RibbonPreferences = {visibility: {}};
  if (!value || typeof value !== 'object' || !('visibility' in value)) return result;
  const source = value.visibility;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return result;
  for (const [key, enabled] of Object.entries(source).slice(0, 256))
    if (key.length && key.length <= 512 && typeof enabled === 'boolean') Object.defineProperty(result.visibility, key,
      {value: enabled, enumerable: true, writable: true, configurable: true});
  return result;
}

/** Obsidian exposes no public ribbon item list. Decorate only the observed
 * action elements; never change native hidden-item settings or inline styles.
 * Unknown/new actions remain visible until the user explicitly hides them. */
export class RibbonController extends Component {
  private preferences: RibbonPreferences;
  private enabled: boolean;
  private stopped = false;
  private docs = new Map<Document, MutationObserver>();
  private previous = new Map<HTMLElement, boolean>();
  private footers = new Map<Document, FooterMove>();
  private vaultSwitchers = new Map<Document, VaultMove>();
  private writes: Promise<unknown> = Promise.resolve();

  constructor(readonly plugin: Plugin, initial: unknown,
    private save: (preferences: RibbonPreferences) => Promise<void>, enabled = true) {
    super(); this.preferences = readRibbonPreferences(initial); this.enabled = enabled;
  }
  get available() {return !Platform.isMobileApp && !Platform.isMobile;}
  onload() {
    if (!this.available) return;
    this.trackDocument(this.plugin.app.workspace.containerEl.ownerDocument);
    this.registerEvent(this.plugin.app.workspace.on('window-open', (_workspace, win) => this.trackDocument(win.document)));
    this.registerEvent(this.plugin.app.workspace.on('window-close', (_workspace, win) => this.forget(win.document)));
    this.plugin.app.workspace.onLayoutReady(() => {if (!this.stopped) this.refresh();});
  }
  trackDocument(doc: Document) {
    const win = doc.defaultView;
    if (!this.available || this.stopped || this.docs.has(doc) || !doc.body || !win) return;
    const observer = new win.MutationObserver(records => {
      if (records.some(record => {
        const target = record.target.nodeType === 1 ? record.target as Element : record.target.parentElement;
        if (record.type === 'attributes' && target === doc.body && record.attributeName === 'class') return true;
        if (target?.closest(OBSERVED)) return true;
        return [...record.addedNodes, ...record.removedNodes].some(node => node.nodeType === 1 &&
          ((node as Element).matches(OBSERVED) || !!(node as Element).querySelector(OBSERVED)));
      })) this.refresh();
    });
    observer.observe(doc.body, {subtree: true, childList: true, attributes: true, attributeFilter: ['aria-label', 'title', 'class', 'hidden']});
    this.docs.set(doc, observer); this.refresh();
  }
  private identity(el: HTMLElement): {id: string; label: string; defaultVisible: boolean} | undefined {
    const label = (el.getAttribute('aria-label') || el.getAttribute('title') || '').trim();
    if (!label) return undefined;
    const icon = [...(el.querySelector('svg')?.classList ?? [])].find(name => name.startsWith('lucide-'))?.slice(7) ?? '';
    const match = known.find(([, candidate, pattern]) => candidate === icon && pattern.test(label));
    return match ? {id: match[0], label, defaultVisible: match[3]} : {id: `custom:${icon}:${label}`.slice(0, 512), label, defaultVisible: true};
  }
  listItems(): RibbonItem[] {
    const items = new Map<string, RibbonItem>();
    for (const doc of this.docs.keys()) for (const el of doc.querySelectorAll<HTMLElement>(ACTION)) {
      const item = this.identity(el);
      if (item) items.set(item.id, {id: item.id, label: item.label, visible: this.preferences.visibility[item.id] ?? item.defaultVisible});
    }
    return [...items.values()];
  }
  isVisible(id: string) {return this.listItems().find(item => item.id === id)?.visible ?? true;}
  setVisible(id: string, visible: boolean): Promise<boolean> {
    return this.update(state => ({visibility: {...state.visibility, [id]: visible}}));
  }
  reset(): Promise<boolean> {return this.update(() => ({visibility: {}}));}
  showAll(): Promise<boolean> {
    return this.update(state => ({visibility: {...state.visibility, ...Object.fromEntries(this.listItems().map(item => [item.id, true]))}}));
  }
  private update(change: (state: RibbonPreferences) => RibbonPreferences): Promise<boolean> {
    const result = this.writes.then(async () => {
      if (this.stopped) return false;
      const next = readRibbonPreferences(change(this.preferences));
      await this.save(next); this.preferences = next;
      if (!this.stopped) this.refresh();
      return true;
    }).catch(error => {console.warn('[Nebula Focus] 工具栏设置未保存', error); return false;});
    this.writes = result; return result;
  }
  setEnabled(enabled: boolean) {this.enabled = enabled; this.refresh();}
  private restore(el: HTMLElement) {
    const original = this.previous.get(el);
    if (original !== undefined) el.classList.toggle(HIDDEN, original);
    this.previous.delete(el);
  }
  private refresh() {
    for (const el of this.previous.keys()) if (!el.isConnected || !this.enabled || this.stopped) this.restore(el);
    for (const doc of this.docs.keys()) {this.refreshFooter(doc); this.refreshVaultSwitcher(doc);}
    if (!this.enabled || this.stopped || !this.available) return;
    for (const doc of this.docs.keys()) for (const el of doc.querySelectorAll<HTMLElement>(ACTION)) {
      const item = this.identity(el); if (!item) {this.restore(el); continue;}
      if (!this.previous.has(el)) this.previous.set(el, el.classList.contains(HIDDEN));
      el.classList.toggle(HIDDEN, !(this.preferences.visibility[item.id] ?? item.defaultVisible));
    }
  }
  /** Move the native controls themselves, so their original event listeners,
   * labels and future content remain owned by Obsidian. A comment remembers
   * the exact original position without creating another interactive control. */
  private refreshFooter(doc: Document) {
    const destination = doc.querySelector<HTMLElement>('.workspace-ribbon:is(.mod-primary, .mod-left) > .side-dock-settings');
    const ribbon = destination?.parentElement;
    const visible = !!ribbon && !ribbon.hidden && doc.defaultView?.getComputedStyle(ribbon).display !== 'none';
    const current = this.footers.get(doc);
    if (current && (!this.enabled || this.stopped || !this.available || !visible || !current.parent.isConnected ||
        current.marker.parentNode !== current.parent || !current.destination.isConnected ||
        current.element.parentElement !== current.destination)) this.restoreFooter(doc);
    if (!this.enabled || this.stopped || !this.available || !visible || this.footers.has(doc)) return;
    const element = doc.querySelector<HTMLElement>(FOOTER);
    const parent = element?.parentElement;
    // This guarded adapter only touches the native help/settings pair we know.
    // Unrecognised future layouts retain their original controls.
    if (!element || !parent || !destination || !element.querySelector('svg.help, svg.lucide-circle-help') ||
        !element.querySelector('svg.lucide-settings')) return;
    const marker = doc.createComment('nebula-focus-vault-actions');
    parent.insertBefore(marker, element);
    this.footers.set(doc, {element, parent, marker, destination, hadClass: element.classList.contains(FOOTER_CLASS)});
    element.classList.add(FOOTER_CLASS); destination.append(element);
  }
  private restoreFooter(doc: Document) {
    const move = this.footers.get(doc); if (!move) return;
    this.footers.delete(doc);
    move.element.classList.toggle(FOOTER_CLASS, move.hadClass);
    // If another owner moved or removed the controls, do not resurrect them.
    // Returning to a detached old parent is safe when Obsidian replaced it.
    if (move.element.parentElement === move.destination) {
      if (move.marker.parentNode === move.parent) move.parent.insertBefore(move.element, move.marker);
      else move.element.remove(); // The original native slot was replaced.
    }
    move.marker.remove();
  }
  /** Reuse the real vault selector rather than creating a second launcher.
   * Both controls and their original listeners remain owned by Obsidian. */
  private refreshVaultSwitcher(doc: Document) {
    const destination = doc.querySelector<HTMLElement>(VAULT_HEADER);
    const current = this.vaultSwitchers.get(doc);
    if (current && (!this.enabled || this.stopped || !this.available || !destination ||
        current.destination !== destination || !current.parent.isConnected ||
        current.marker.parentNode !== current.parent || current.element.parentElement !== current.destination)) this.restoreVaultSwitcher(doc);
    if (!this.enabled || this.stopped || !this.available || !destination || this.vaultSwitchers.has(doc)) return;
    const element = doc.querySelector<HTMLElement>(VAULT_SWITCHER), parent = element?.parentElement;
    // Unknown future host markup stays at its native location.
    if (!element || !parent || !element.querySelector('.workspace-drawer-vault-name') ||
        !destination.querySelector('.bui-pages-search-button')) return;
    const marker = doc.createComment('nebula-focus-vault-switcher');
    parent.insertBefore(marker, element);
    this.vaultSwitchers.set(doc, {element, parent, marker, destination,
      hadClass: element.classList.contains(VAULT_CLASS), parentHadClass: parent.classList.contains(VAULT_SOURCE_CLASS)});
    element.classList.add(VAULT_CLASS); parent.classList.add(VAULT_SOURCE_CLASS);
    destination.prepend(element);
  }
  private restoreVaultSwitcher(doc: Document) {
    const move = this.vaultSwitchers.get(doc); if (!move) return;
    this.vaultSwitchers.delete(doc);
    move.element.classList.toggle(VAULT_CLASS, move.hadClass);
    move.parent.classList.toggle(VAULT_SOURCE_CLASS, move.parentHadClass);
    if (move.element.parentElement === move.destination) {
      if (move.marker.parentNode === move.parent) move.parent.insertBefore(move.element, move.marker);
      else move.element.remove();
    }
    move.marker.remove();
  }
  private forget(doc: Document) {
    this.docs.get(doc)?.disconnect(); this.docs.delete(doc);
    for (const el of this.previous.keys()) if (el.ownerDocument === doc) this.restore(el);
    this.restoreFooter(doc);
    this.restoreVaultSwitcher(doc);
  }
  onunload() {this.stopped = true; for (const doc of this.docs.keys()) this.forget(doc);}
}
