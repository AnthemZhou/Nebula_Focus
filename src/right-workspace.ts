import {Component, FuzzySuggestModal, ItemView, Notice, Platform, Plugin, TFile, WorkspaceTabs,
  type ViewState, type WorkspaceContainer, type WorkspaceLeaf, parseLinktext, setIcon} from 'obsidian';

export const RIGHT_WORKSPACE_START_TYPE = 'nebula-workspace-start';
const HOME_TYPE = 'nebula-home';
type GroupState = {tabGroupId: string; leafIds: string[]};
export interface RightWorkspaceState {groups: GroupState[]}
export interface RightWorkspaceOptions {
  enabled?: boolean;
  state?: unknown;
  saveState?: (state: RightWorkspaceState) => Promise<void>;
}
export type PageNavigationEvent = Pick<MouseEvent, 'metaKey' | 'ctrlKey'>;

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const copyRecord = (value: Record<string, unknown> | undefined): Record<string, unknown> | undefined => {
  if (!value) return undefined;
  const copy: unknown = JSON.parse(JSON.stringify(value)); return record(copy) ? copy : undefined;
};

export function readRightWorkspaceState(value: unknown): RightWorkspaceState {
  if (!record(value) || !Array.isArray(value.groups)) return {groups: []};
  return {groups: value.groups.filter(record).slice(0, 16).flatMap(group => {
    if (typeof group.tabGroupId !== 'string' || !group.tabGroupId || !Array.isArray(group.leafIds)) return [];
    const leafIds = [...new Set(group.leafIds.filter((id): id is string => typeof id === 'string' && id.length > 0 && id.length <= 512))].slice(0, 256);
    return leafIds.length ? [{tabGroupId: group.tabGroupId, leafIds}] : [];
  })};
}

/** A native tab group in the content area, never the right tools sidedock.
 * Only its small start page is custom; notes and Bases use their native views.
 */
export class RightWorkspaceController extends Component {
  readonly views = new Set<RightWorkspaceStartView>();
  private groups = new Map<WorkspaceContainer, WorkspaceTabs>();
  private state: RightWorkspaceState;
  private enabled: boolean;
  private stopped = false;
  private ready = false;
  private timer = 0;
  private ribbon?: HTMLElement;
  private queue: Promise<unknown> = Promise.resolve();
  private saves: Promise<unknown> = Promise.resolve();
  private busy = new Set<WorkspaceLeaf>();
  private savedSignature: string;
  private retiringHome?: Promise<void>;
  private linkDocuments = new Map<Document, () => void>();

  constructor(readonly plugin: Plugin, private options: RightWorkspaceOptions) {
    super(); this.enabled = options.enabled ?? true;
    this.state = readRightWorkspaceState(options.state); this.savedSignature = JSON.stringify(this.state);
  }
  get app() {return this.plugin.app;}
  get isEnabled() {return this.enabled && !this.stopped;}

  onload() {
    this.plugin.registerView(RIGHT_WORKSPACE_START_TYPE, leaf => new RightWorkspaceStartView(leaf, this));
    this.plugin.addCommand({id: 'new-right-workspace-tab', name: Platform.isMobileApp ? '打开新标签页' : '在右侧打开新标签页', checkCallback: checking => {
      if (!this.isEnabled) return false; if (!checking) void this.newTab(); return true;
    }});
    this.plugin.addCommand({id: 'duplicate-in-right-workspace', name: Platform.isMobileApp ? '在新标签页打开当前页面' : '在右侧新标签页打开当前页面', checkCallback: checking => {
      const source = this.current();
      if (!this.isEnabled || !source || !this.supported(source)) return false;
      if (!checking) void this.duplicateCurrent(source); return true;
    }});
    if (!Platform.isMobileApp) {
      this.ribbon = this.plugin.addRibbonIcon('panel-right-open', '在右侧打开新标签页', () => {void this.newTab();});
      this.ribbon.hidden = !this.isEnabled;
    }
    this.registerEvent(this.app.workspace.on('layout-change', () => this.schedule()));
    // The enhanced workspace offers one optional right-hand region. Use the
    // host's DOM menus for page/tab layout actions so scoped presentation can
    // omit native split commands without changing core commands or settings.
    this.registerEvent(this.app.workspace.on('file-menu', (menu, _file, source) => {
      if (this.isEnabled && !Platform.isMobileApp && ['more-options', 'tab-header'].includes(source)) menu.setUseNativeMenu(false);
    }));
    this.trackLinks(this.app.workspace.containerEl.ownerDocument);
    this.registerEvent(this.app.workspace.on('window-open', (_workspace, win) => this.trackLinks(win.document)));
    this.registerEvent(this.app.workspace.on('window-close', (_workspace, win) => this.untrackLinks(win.document)));
    this.app.workspace.onLayoutReady(() => {
      if (this.stopped) return; this.ready = true; this.restoreGroups(); this.schedule();
      for (const leaf of this.leaves()) if (leaf.view.containerEl) this.trackLinks(leaf.view.containerEl.ownerDocument);
    });
  }

  /** Passing an anchor keeps a request scoped to that window, including popouts. */
  newTab(anchor = this.current()): Promise<WorkspaceLeaf | undefined> {
    return this.openNew(anchor, leaf => leaf.setViewState({type: RIGHT_WORKSPACE_START_TYPE, state: {}, active: false}), leaf => this.isStart(leaf));
  }
  openFile(file: TFile, anchor = this.current()): Promise<WorkspaceLeaf | undefined> {
    if (!this.allowedFile(file)) return Promise.resolve(undefined);
    return this.openNew(anchor, leaf => leaf.openFile(file, {active: false}), leaf => leaf.getViewState().state?.file === file.path, () => this.allowedFile(file));
  }
  /** Sidebar navigation belongs to the main content region even while a right
   * tab has focus. An explicit new tab stays in that same main group. */
  openFileInMain(file: TFile, anchor = this.current(), newTab = false): Promise<WorkspaceLeaf | undefined> {
    return this.enqueue(async () => {
      if (!this.allowedFile(file) || (anchor && !this.live(anchor))) return undefined;
      const workspace = this.app.workspace, container = anchor?.getContainer() ?? workspace.rootSplit;
      const {content, main} = this.regions(container);
      const scope = Platform.isMobileApp ? content : content.filter(leaf => leaf.parent === main);
      const existing = !newTab && scope.find(leaf => leaf.getViewState().state?.file === file.path);
      if (existing) {
        await workspace.revealLeaf(existing);
        if (!this.isEnabled || !this.live(existing) || existing.getViewState().state?.file !== file.path) return undefined;
        workspace.setActiveLeaf(existing, {focus: !Platform.isMobileApp});
        this.persistGroups(); return existing;
      }
      const recent = workspace.getMostRecentLeaf(container);
      const preferred = anchor && scope.includes(anchor) ? anchor : recent && scope.includes(recent) ? recent : scope[0];
      const target = preferred ? workspace.getMostRecentLeaf(preferred.parent) ?? preferred : undefined;
      let leaf: WorkspaceLeaf, created = true;
      if (!newTab && target && scope.includes(target) && !target.getViewState().pinned) {leaf = target; created = false;}
      else if (preferred?.parent instanceof WorkspaceTabs) leaf = workspace.createLeafInParent(preferred.parent, content.filter(item => item.parent === preferred.parent).length);
      else leaf = workspace.getLeaf('tab');
      this.busy.add(leaf);
      try {
        await leaf.openFile(file, {active: false});
        if (!this.isEnabled || !this.live(leaf) || leaf.getViewState().state?.file !== file.path) return undefined;
        await workspace.revealLeaf(leaf);
        if (!this.isEnabled || !this.live(leaf) || leaf.getViewState().state?.file !== file.path) return undefined;
        // Revealing a tab does not activate it. Mobile changes the active page
        // without focusing the editor and unexpectedly raising its keyboard.
        workspace.setActiveLeaf(leaf, {focus: !Platform.isMobileApp}); return leaf;
      } catch (error) {
        if (created && this.live(leaf) && ['empty', RIGHT_WORKSPACE_START_TYPE].includes(leaf.getViewState().type)) leaf.detach();
        throw error;
      } finally {this.busy.delete(leaf); this.persistGroups(); this.schedule();}
    });
  }
  /** Resolve the clicked view, not the globally active tab: embedded Bases and
   * popout windows must open beside their own source page. A stale element
   * cannot redirect navigation into another window. */
  openFileFromElement(file: TFile, source: HTMLElement, event?: PageNavigationEvent): Promise<WorkspaceLeaf | undefined> {
    if (!source.isConnected) return Promise.resolve(undefined);
    const owner = this.leaves().find(leaf => leaf.view.containerEl?.contains(source));
    if (!owner) return Promise.resolve(undefined);
    const anchor = this.contentLeaves(owner.getContainer()).includes(owner) ? owner : this.app.workspace.getMostRecentLeaf(owner.getContainer()) ?? undefined;
    return anchor ? this.navigateFile(file, anchor, event) : Promise.resolve(undefined);
  }
  /** Normal navigation reuses a matching tab in its destination region.
   * Explicit new-tab commands continue to use openFile/newTab and may duplicate.
   * Mod-click targets the main content group; mobile keeps ordinary tabs. */
  navigateFile(file: TFile, anchor = this.current(), event?: PageNavigationEvent, subpath?: string): Promise<WorkspaceLeaf | undefined> {
    const inMain = !Platform.isMobileApp && !!(Platform.isMacOS ? event?.metaKey : event?.ctrlKey);
    return this.enqueue(async () => {
      if (!this.allowedFile(file) || (anchor && !this.live(anchor))) return undefined;
      const container = anchor?.getContainer() ?? this.app.workspace.rootSplit;
      const {content, main, right} = this.regions(container);
      const scope = Platform.isMobileApp ? content : content.filter(leaf => leaf.parent === (inMain ? main : right));
      const existing = scope.find(leaf => leaf.getViewState().state?.file === file.path);
      if (existing) {
        await this.app.workspace.revealLeaf(existing);
        if (subpath && this.isEnabled && this.live(existing) && existing.getViewState().state?.file === file.path) existing.setEphemeralState({subpath});
        return existing;
      }
      let leaf: WorkspaceLeaf, created = true;
      if (inMain) {
        const preferred = anchor && scope.includes(anchor) ? anchor : scope[0];
        const target = preferred ? this.app.workspace.getMostRecentLeaf(preferred.parent) ?? preferred : undefined;
        if (target && scope.includes(target) && !target.getViewState().pinned) {leaf = target; created = false;}
        else if (preferred?.parent instanceof WorkspaceTabs) leaf = this.app.workspace.createLeafInParent(preferred.parent, content.filter(item => item.parent === preferred.parent).length);
        else leaf = anchor ? this.app.workspace.createLeafBySplit(anchor, 'vertical', true) : this.app.workspace.getLeaf('tab');
      } else leaf = this.createLeaf(anchor);
      this.busy.add(leaf);
      try {
        await leaf.openFile(file, {active: false, ...(subpath ? {eState: {subpath}} : {})});
        if (!this.isEnabled || !this.live(leaf) || leaf.getViewState().state?.file !== file.path) return undefined;
        await this.app.workspace.revealLeaf(leaf); return leaf;
      } catch (error) {
        if (created && this.live(leaf) && ['empty', RIGHT_WORKSPACE_START_TYPE].includes(leaf.getViewState().type)) leaf.detach();
        throw error;
      } finally {this.busy.delete(leaf); this.persistGroups(); this.schedule();}
    });
  }
  duplicateCurrent(source = this.current()): Promise<WorkspaceLeaf | undefined> {
    if (!source || !this.supported(source)) return Promise.resolve(undefined);
    const state = source.getViewState();
    // A duplicate keeps its display/query state, but is not linked or pinned to
    // the source leaf. Cloning must never mutate the source's live state object.
    const snapshot: ViewState = {type: state.type, state: copyRecord(state.state), active: false};
    const ephemeral: unknown = source.getEphemeralState();
    const eState = record(ephemeral) ? copyRecord(ephemeral) : undefined;
    return this.openNew(source, leaf => leaf.setViewState(snapshot, eState), leaf =>
      leaf.getViewState().type === snapshot.type && leaf.getViewState().state?.file === snapshot.state?.file);
  }

  chooseFile(target: WorkspaceLeaf) {
    if (!this.isEnabled || !this.isStart(target)) return;
    new WorkspaceFilePicker(this.app, file => {
      if (this.allowedFile(file)) void this.useStart(target, leaf => leaf.openFile(file, {active: false}), leaf => leaf.getViewState().state?.file === file.path, () => this.allowedFile(file));
    }).open();
  }
  setEnabled(enabled: boolean): Promise<void> {
    this.enabled = enabled; if (this.ribbon) this.ribbon.hidden = !this.isEnabled;
    if (enabled) {this.schedule(); return Promise.resolve();}
    return this.clearStarts();
  }

  private current() {return this.app.workspace.getMostRecentLeaf() ?? undefined;}
  private trackLinks(doc: Document) {
    if (this.stopped || this.linkDocuments.has(doc)) return;
    const click = (event: MouseEvent) => this.followReadableLink(event);
    doc.addEventListener('click', click, true);
    this.linkDocuments.set(doc, () => doc.removeEventListener('click', click, true));
  }
  private untrackLinks(doc: Document) {this.linkDocuments.get(doc)?.(); this.linkDocuments.delete(doc);}
  private followReadableLink(event: MouseEvent) {
    if (!this.isEnabled || event.defaultPrevented || event.button !== 0 || event.altKey || event.shiftKey) return;
    const node = event.target as Node | null;
    const target = node?.nodeType === 1 ? node as Element : node?.parentElement;
    const link = target?.closest<HTMLAnchorElement>('a.internal-link');
    // Table title links are editable text: their separate page icon owns
    // navigation. Do not preempt the title editor's delegated click handler.
    if (!link?.isConnected || link.matches('.is-unresolved, .bui-idea-title') ||
        link.closest('input, textarea, [contenteditable="true"], [contenteditable="plaintext-only"], .cm-content, .cm-line')) return;
    const owner = this.leaves().find(leaf => leaf.view.containerEl?.contains(link));
    if (!owner || !this.contentLeaves(owner.getContainer()).includes(owner)) return;
    const state = owner.getViewState();
    if (state.type !== 'bases' && !link.closest('.markdown-preview-view, .markdown-reading-view, .metadata-container') && !link.matches('.bui-card-title')) return;
    const raw = link.getAttribute('data-href') ?? link.getAttribute('href');
    if (!raw || /^[a-z][a-z\d+.-]*:|^\/\//i.test(raw)) return;
    const source = typeof state.state?.file === 'string' ? state.state.file : '';
    let parsed = parseLinktext(raw);
    // A fragment-only link is local scrolling, not navigation to another page.
    if (!parsed.path) return;
    let file = this.app.metadataCache.getFirstLinkpathDest(parsed.path, source);
    if (!file && raw.includes('%')) {
      try {parsed = parseLinktext(decodeURI(raw)); file = this.app.metadataCache.getFirstLinkpathDest(parsed.path, source);} catch {return;}
    }
    if (!file || !this.allowedFile(file)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    void this.navigateFile(file, owner, event, parsed.subpath);
  }
  private leaves() {const leaves: WorkspaceLeaf[] = []; this.app.workspace.iterateAllLeaves(leaf => {leaves.push(leaf);}); return leaves;}
  private live(leaf: WorkspaceLeaf) {return this.leaves().includes(leaf);}
  private contentLeaves(container: WorkspaceContainer) {
    return this.layoutGroups().flatMap(group => group.leafIds.map(id => this.app.workspace.getLeafById(id)))
      .filter((leaf): leaf is WorkspaceLeaf => !!leaf && leaf.getContainer() === container);
  }
  /** Positions, not saved ownership markers or whichever tab has focus, define
   * the main and optional right regions. This also recovers existing two-column
   * workspaces whose marker was lost during a previous reload. */
  private regions(container: WorkspaceContainer) {
    const content = this.contentLeaves(container);
    const tabs = [...new Set(content.map(leaf => leaf.parent).filter((parent): parent is WorkspaceTabs => parent instanceof WorkspaceTabs))];
    const main = tabs[0], right = Platform.isMobileApp ? undefined : tabs[1];
    if (right) this.groups.set(container, right); else this.groups.delete(container);
    return {content, main, right};
  }
  private allowedFile(file: TFile) {return ['md', 'base'].includes(file.extension.toLowerCase()) && this.app.vault.getFileByPath(file.path) === file;}
  private supported(leaf: WorkspaceLeaf) {
    if (!this.live(leaf)) return false;
    const state = leaf.getViewState();
    if (!['markdown', 'bases'].includes(state.type) || typeof state.state?.file !== 'string') return false;
    const file = this.app.vault.getFileByPath(state.state.file); return !!file && this.allowedFile(file);
  }
  private isStart(leaf: WorkspaceLeaf) {return this.live(leaf) && leaf.getViewState().type === RIGHT_WORKSPACE_START_TYPE;}

  private enqueue(action: () => Promise<WorkspaceLeaf | undefined>): Promise<WorkspaceLeaf | undefined> {
    const work = this.queue.then(async () => this.isEnabled ? action() : undefined).catch(error => {
      if (!this.stopped) {console.error('[Nebula Focus] 工作标签页未能打开', error); new Notice('工作标签页未能打开，请重试');}
      return undefined;
    });
    this.queue = work; return work;
  }
  private openNew(anchor: WorkspaceLeaf | undefined, open: (leaf: WorkspaceLeaf) => Promise<void>, expected: (leaf: WorkspaceLeaf) => boolean, valid = () => true) {
    return this.enqueue(async () => {
      // Do not create a new pane elsewhere when its original window was closed
      // while another request was completing.
      if ((anchor && !this.live(anchor)) || !valid()) return undefined;
      const leaf = this.createLeaf(anchor); this.busy.add(leaf);
      try {
        await open(leaf);
        if (!this.isEnabled) {if (this.isStart(leaf)) await leaf.setViewState({type: 'empty', active: false}); return undefined;}
        if (!this.live(leaf) || !expected(leaf)) return undefined;
        await this.app.workspace.revealLeaf(leaf); return leaf;
      } catch (error) {
        // Only discard the unused leaf we just created, never a real file or a
        // destination that the user navigated to while an opener was pending.
        if (this.live(leaf) && ['empty', RIGHT_WORKSPACE_START_TYPE].includes(leaf.getViewState().type)) leaf.detach();
        throw error;
      } finally {this.busy.delete(leaf); this.persistGroups(); this.schedule();}
    });
  }
  private useStart(target: WorkspaceLeaf, open: (leaf: WorkspaceLeaf) => Promise<void>, expected: (leaf: WorkspaceLeaf) => boolean, valid = () => true) {
    return this.enqueue(async () => {
      if (!this.isStart(target) || !valid()) return undefined;
      this.busy.add(target);
      try {
        await open(target);
        if (!this.isEnabled || !this.live(target) || !expected(target)) return undefined;
        await this.app.workspace.revealLeaf(target); return target;
      } finally {this.busy.delete(target); this.persistGroups();}
    });
  }

  private createLeaf(anchor?: WorkspaceLeaf): WorkspaceLeaf {
    const workspace = this.app.workspace;
    if (Platform.isMobileApp) return workspace.getLeaf('tab');
    const container = anchor?.getContainer() ?? workspace.rootSplit;
    const {content, main, right} = this.regions(container);
    const members = content.filter(leaf => leaf.parent === right);
    if (right && members.length) return workspace.createLeafInParent(right, members.length);
    const source = content.find(leaf => leaf.parent === main && leaf === anchor)
      ?? content.find(leaf => leaf.parent === main) ?? anchor ?? workspace.getMostRecentLeaf(container);
    const leaf = source ? workspace.createLeafBySplit(source, 'vertical', false) : workspace.getLeaf('tab');
    if (leaf.parent instanceof WorkspaceTabs) this.groups.set(leaf.getContainer(), leaf.parent);
    return leaf;
  }

  /** Read IDs from the public serialized layout; no private children/id fields. */
  private layoutGroups(): GroupState[] {
    const groups: GroupState[] = [];
    const visit = (value: unknown, current?: GroupState) => {
      if (Array.isArray(value)) {for (const item of value) visit(item, current); return;}
      if (!record(value)) return;
      if (value.type === 'tabs' && typeof value.id === 'string') {current = {tabGroupId: value.id, leafIds: []}; groups.push(current);}
      if (value.type === 'leaf' && typeof value.id === 'string') current?.leafIds.push(value.id);
      for (const [key, nested] of Object.entries(value)) if (key === 'children' || key === 'main' || key === 'floating' || key === 'windows') visit(nested, current);
    };
    visit(this.app.workspace.getLayout()); return groups;
  }
  private restoreGroups() {
    if (Platform.isMobileApp) return;
    for (const container of new Set(this.leaves().map(leaf => leaf.getContainer()))) this.regions(container);
  }
  private persistGroups() {
    if (!this.ready || this.stopped || Platform.isMobileApp) return;
    const layouts = this.layoutGroups(), groups: GroupState[] = [];
    for (const [container, tabs] of this.groups) {
      const members = this.leaves().filter(leaf => leaf.parent === tabs && leaf.getContainer() === container);
      if (!members.length) {this.groups.delete(container); continue;}
      const layout = layouts.find(group => group.leafIds.some(id => {
        const leaf = this.app.workspace.getLeafById(id); return !!leaf && members.includes(leaf);
      }));
      if (layout) groups.push(layout);
    }
    this.state = {groups}; const signature = JSON.stringify(this.state);
    if (!this.options.saveState || signature === this.savedSignature) return;
    const snapshot = readRightWorkspaceState(this.state);
    this.savedSignature = signature;
    this.saves = this.saves.then(() => this.options.saveState?.(snapshot)).catch(error => {
      this.savedSignature = ''; console.error('[Nebula Focus] 工作标签页位置未能保存', error);
    });
  }

  private schedule() {
    if (this.stopped || !this.ready || this.timer) return;
    this.timer = window.setTimeout(() => {
      this.timer = 0;
      void this.retireHomeViews();
      if (!this.isEnabled) {void this.clearStarts(); return;}
      this.restoreGroups();
      // Native '+' remains native. Only its empty leaf in our own group gets
      // the start page; ordinary links and unrelated tab groups are untouched.
      for (const leaf of this.leaves()) {
        const inGroup = !Platform.isMobileApp && this.groups.get(leaf.getContainer()) === leaf.parent;
        if (leaf.getViewState().type === RIGHT_WORKSPACE_START_TYPE && !this.busy.has(leaf) &&
            !(leaf.view instanceof RightWorkspaceStartView && leaf.view.host === this)) {
          this.busy.add(leaf);
          void (async () => {
            // Reloaded/deferred placeholders may reuse their same-type view.
            // Reset only our own start leaf; a later user navigation wins.
            await leaf.setViewState({type: 'empty', active: false});
            if (this.isEnabled && this.live(leaf) && leaf.getViewState().type === 'empty')
              await leaf.setViewState({type: RIGHT_WORKSPACE_START_TYPE, state: {}, active: false});
          })().catch(error => {console.error('[Nebula Focus] 起始页未能恢复', error);})
            .finally(() => {this.busy.delete(leaf);});
          continue;
        }
        if (!inGroup || this.busy.has(leaf) || leaf.getViewState().type !== 'empty') continue;
        this.busy.add(leaf);
        void leaf.setViewState({type: RIGHT_WORKSPACE_START_TYPE, state: {}, active: false})
          .then(async () => {if (!this.isEnabled && this.isStart(leaf)) await leaf.setViewState({type: 'empty', active: false});})
          .catch(error => {console.error('[Nebula Focus] 新标签页未能准备', error);})
          .finally(() => {this.busy.delete(leaf);});
      }
      this.persistGroups();
    }, 0);
  }
  /** The dashboard feature was retired. Obsidian owns ordinary session
   * restoration; only legacy Home placeholders are removed. No note or saved
   * Home configuration is deleted, and no startup navigation is imposed on an
   * already restored note, Base, or other native view. */
  private retireHomeViews(): Promise<void> {
    if (this.retiringHome) return this.retiringHome;
    const work = (async () => {
      for (const leaf of this.leaves()) {
        if (this.stopped || !this.live(leaf) || leaf.getViewState().type !== HOME_TYPE) continue;
        const workspace = this.app.workspace;
        const recent = workspace.getLastOpenFiles().map(path => this.app.vault.getFileByPath(path))
          .find((file): file is TFile => !!file && this.allowedFile(file));
        const siblings = this.leaves().filter(candidate => candidate !== leaf &&
          candidate.getContainer() === leaf.getContainer() && this.supported(candidate));
        const active = workspace.getMostRecentLeaf() === leaf;
        // A different old tab is not necessarily the last page the user read.
        // Only reuse an exact recent-file match before reopening that file.
        const destination = siblings.find(candidate => candidate.getViewState().state?.file === recent?.path)
          ?? (recent ? undefined : siblings[0]);
        if ((!active && siblings.length > 0) || destination) {
          if (active && destination) await workspace.revealLeaf(destination);
          if (!this.stopped && this.live(leaf) && leaf.getViewState().type === HOME_TYPE) leaf.detach();
        } else if (recent) {
          await leaf.openFile(recent, {active: false});
        } else {
          await leaf.setViewState({type: 'empty', active: false});
        }
      }
    })().catch(error => {console.error('[Nebula Focus] 旧首页标签未能恢复为上次页面', error);})
      .finally(() => {this.retiringHome = undefined;});
    this.retiringHome = work; return work;
  }

  private async clearStarts() {
    for (const leaf of this.leaves()) {
      if (leaf.getViewState().type === RIGHT_WORKSPACE_START_TYPE) {
        try {await leaf.setViewState({type: 'empty', active: false});}
        catch (error) {console.error('[Nebula Focus] 起始页未能恢复原生', error);}
      }
    }
  }
  onunload() {
    this.stopped = true; this.enabled = false; window.clearTimeout(this.timer); this.timer = 0;
    for (const doc of this.linkDocuments.keys()) this.untrackLinks(doc);
    this.ribbon?.remove(); void this.clearStarts(); this.views.clear();
  }
}

export class RightWorkspaceStartView extends ItemView {
  constructor(leaf: WorkspaceLeaf, readonly host: RightWorkspaceController) {super(leaf);}
  getViewType() {return RIGHT_WORKSPACE_START_TYPE;}
  getDisplayText() {return '新标签页';}
  getIcon() {return 'panels-top-left';}
  async onOpen() {
    this.host.views.add(this); this.contentEl.replaceChildren();
    this.contentEl.classList.add('nf-workspace-start');
    if (!this.host.isEnabled) return;
    this.addAction('plus', '新建标签页', () => {void this.host.newTab(this.leaf);});
    const header = this.contentEl.createDiv({cls: 'nf-workspace-start-header'});
    header.createEl('h2', {text: '新标签页'});
    header.createEl('p', {text: '打开笔记或数据库。'});
    const actions = this.contentEl.createDiv({cls: 'nf-workspace-start-actions'});
    const choose = actions.createEl('button', {cls: 'nf-workspace-start-action'});
    setIcon(choose.createSpan(), 'files'); choose.createSpan({text: '打开笔记或数据库'});
    choose.addEventListener('click', () => this.host.chooseFile(this.leaf));
    const next = actions.createEl('button', {cls: 'nf-workspace-start-action nf-workspace-start-new'});
    setIcon(next.createSpan(), 'plus'); next.createSpan({text: '再开一个标签页'});
    next.addEventListener('click', () => {void this.host.newTab(this.leaf);});
  }
  async onClose() {this.host.views.delete(this); this.contentEl.replaceChildren();}
}

class WorkspaceFilePicker extends FuzzySuggestModal<TFile> {
  constructor(app: Plugin['app'], private choose: (file: TFile) => void) {super(app); this.setPlaceholder('搜索笔记或数据库…');}
  getItems() {return this.app.vault.getFiles().filter(file => ['md', 'base'].includes(file.extension.toLowerCase()));}
  getItemText(file: TFile) {return file.path;}
  onChooseItem(file: TFile) {this.choose(file);}
}
