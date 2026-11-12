import {App, Component, ItemView, Menu, Modal, Notice, Platform, Plugin, TFile, TFolder, WorkspaceLeaf, setIcon, type ViewState} from 'obsidian';
import {NebulaFocusSettings} from './settings';
import type {FontPreferences} from './font-appearance';
import type {PageArchiveActions} from './archive-controller';
import type {RightWorkspaceController} from './right-workspace';
import type {RibbonController} from './ribbon-controller';
import {SidebarSearchModal} from './sidebar-search';
import {PageNode, PageTreeSettings, buildPageTree, filterPages, flattenPages, readPageTreeSettings,
  remapPageSettings, reorderPages, validPageName} from './page-tree';

export const PAGE_SIDEBAR_TYPE = 'nebula-pages';
let nextViewId = 0;
type PageNavigationState = {query: string; scroll: number; expanded: string[]; mobileQuery?: string};
type SuspendedPage = {state: ViewState; navigation?: PageNavigationState};

export class PageSidebar extends Component {
  settings: PageTreeSettings;
  archives?: PageArchiveActions;
  rightWorkspace?: RightWorkspaceController;
  ribbon?: RibbonController;
  openReminders?: () => Promise<void>;
  reminders?: {preferences: {openOnStartup: boolean}; setOpenOnStartup(value: boolean): Promise<boolean>};
  readonly views = new Set<PageSidebarView>();
  private writes: Promise<unknown> = Promise.resolve();
  private timer = 0;
  private startupTimer = 0;
  private stopped = false;
  private enabled: boolean;
  private navigation: Promise<void> = Promise.resolve();
  private modeRequest = 0;
  private suspended = new Map<WorkspaceLeaf, SuspendedPage>();
  private nativeStates = new Map<WorkspaceLeaf, ViewState>();
  private ribbonIcon?: HTMLElement;

  constructor(readonly plugin: Plugin, initial: unknown, private save: (settings: PageTreeSettings) => Promise<void>, initialEnabled = true, private font?: FontPreferences) {
    super();
    this.settings = readPageTreeSettings(initial);
    this.enabled = initialEnabled;
  }

  get app() {return this.plugin.app;}
  get isEnabled() {return this.enabled && !this.stopped;}
  tree() {return buildPageTree(this.app.vault.getRoot(), this.settings);}

  onload() {
    this.plugin.registerView(PAGE_SIDEBAR_TYPE, leaf => new PageSidebarView(leaf, this));
    this.plugin.addCommand({id: 'open-page-sidebar', name: '打开页面侧栏', callback: () => {void this.open();}});
    this.plugin.addCommand({id: 'open-native-files', name: '打开原生文件列表', callback: () => {void this.openNative();}});
    this.ribbonIcon = this.plugin.addRibbonIcon('panel-left', '页面侧栏', () => {void this.open();});
    if (this.ribbonIcon) this.ribbonIcon.hidden = !this.isEnabled;
    this.plugin.addSettingTab(new NebulaFocusSettings(this.plugin, this, this.font));
    this.app.workspace.onLayoutReady(() => {
      if (this.stopped) return;
      // On plugin reload the layout is already ready, but the host is still
      // restoring registered views. Let that finish before looking for a leaf.
      this.startupTimer = window.setTimeout(() => {
        this.startupTimer = 0;
        if (this.stopped) return;
        if (!this.enabled) void this.setEnabled(false);
        else if (this.settings.openOnStartup) void this.open();
      }, 0);
    });
    this.registerEvent(this.app.vault.on('create', () => this.schedule()));
    this.registerEvent(this.app.vault.on('delete', () => this.schedule()));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      void this.update(state => remapPageSettings(state, oldPath, file.path));
      this.schedule();
    }));
    this.registerEvent(this.app.workspace.on('file-open', file => {
      for (const view of this.views) view.revealActive(file?.path);
    }));
  }

  open(): Promise<void> {
    return this.navigate(async () => {
      if (!this.enabled) {await this.showNative(); return;}
      this.pruneLeaves();
      const leaf = this.app.workspace.getLeavesOfType(PAGE_SIDEBAR_TYPE)[0] ?? [...this.suspended.keys()][0] ?? this.app.workspace.getLeftLeaf(false);
      if (!leaf) return;
      await this.showPages(leaf);
      if (this.enabled && !this.stopped) await this.app.workspace.revealLeaf(leaf);
    });
  }

  openNative(): Promise<void> {return this.navigate(() => this.showNative());}

  closeMobileDrawer() {
    if (this.isEnabled && Platform.isMobileApp) this.app.workspace.leftSplit?.collapse();
  }

  /** Swap real workspace views in place. Layout preferences and note files are
   * untouched; the requested flag changes immediately to guard startup/commands. */
  setEnabled(enabled: boolean): Promise<void> {
    const changed = this.enabled !== enabled;
    this.enabled = enabled;
    if (this.ribbonIcon) this.ribbonIcon.hidden = !this.isEnabled;
    const request = ++this.modeRequest;
    if (!enabled) {window.clearTimeout(this.startupTimer); this.startupTimer = 0;}
    return this.navigate(async () => {
      if (request !== this.modeRequest) return;
      this.pruneLeaves();
      if (!this.enabled) {
        const pages = this.app.workspace.getLeavesOfType(PAGE_SIDEBAR_TYPE);
        for (const leaf of pages) {
          if (this.enabled || this.stopped) return;
          await this.showNativeLeaf(leaf);
        }
        if (!this.enabled && !this.stopped && pages[0]) await this.app.workspace.revealLeaf(pages[0]);
      } else {
        let restored: WorkspaceLeaf | undefined;
        for (const leaf of [...this.suspended.keys()]) {
          if (!this.enabled || this.stopped) return;
          // A user's subsequent choice of another view wins over restoration.
          if (leaf.view.getViewType() !== 'file-explorer') {this.suspended.delete(leaf); continue;}
          await this.showPages(leaf); restored ??= leaf;
        }
        if (!restored && changed && !this.app.workspace.getLeavesOfType(PAGE_SIDEBAR_TYPE).length) {
          const leaf = this.app.workspace.getLeavesOfType('file-explorer')[0] ?? this.app.workspace.getLeftLeaf(false);
          if (leaf && this.enabled && !this.stopped) {await this.showPages(leaf); restored = leaf;}
        }
        if (restored && this.enabled && !this.stopped) await this.app.workspace.revealLeaf(restored);
      }
    });
  }

  private navigate(action: () => Promise<void>): Promise<void> {
    const result = this.navigation.then(async () => {if (!this.stopped) await action();})
      .catch(error => {if (!this.stopped) this.failure('侧栏切换未完成', error);});
    this.navigation = result; return result;
  }
  private pruneLeaves() {
    const live = new Set<WorkspaceLeaf>(); this.app.workspace.iterateAllLeaves(leaf => {live.add(leaf);});
    for (const leaf of this.suspended.keys()) if (!live.has(leaf)) this.suspended.delete(leaf);
    for (const leaf of this.nativeStates.keys()) if (!live.has(leaf)) this.nativeStates.delete(leaf);
  }
  private async showNative() {
    const leaf = this.app.workspace.getLeavesOfType('file-explorer')[0] ?? this.app.workspace.getLeavesOfType(PAGE_SIDEBAR_TYPE)[0] ?? this.app.workspace.getLeftLeaf(false);
    if (!leaf) return;
    await this.showNativeLeaf(leaf);
    if (!this.stopped) await this.app.workspace.revealLeaf(leaf);
  }
  private async showNativeLeaf(leaf: WorkspaceLeaf) {
    if (this.stopped || leaf.view.getViewType() === 'file-explorer') return;
    if (leaf.view.getViewType() === PAGE_SIDEBAR_TYPE && !this.suspended.has(leaf)) {
      this.suspended.set(leaf, {state: leaf.getViewState(),
        ...(leaf.view instanceof PageSidebarView ? {navigation: leaf.view.captureNavigation()} : {})});
    }
    await leaf.setViewState({...this.nativeStates.get(leaf), type: 'file-explorer', active: false});
  }
  private async showPages(leaf: WorkspaceLeaf) {
    if (!this.enabled || this.stopped) return;
    if (leaf.view.getViewType() === 'file-explorer') this.nativeStates.set(leaf, leaf.getViewState());
    const saved = this.suspended.get(leaf);
    if (!(leaf.view instanceof PageSidebarView) || leaf.view.sidebar !== this || !leaf.view.isReady) {
      if (leaf.view.getViewType() === PAGE_SIDEBAR_TYPE) await leaf.setViewState({type: 'empty', active: false});
      if (!this.enabled || this.stopped) return;
      await leaf.setViewState({...saved?.state, type: PAGE_SIDEBAR_TYPE, active: false});
    }
    if (!this.enabled || this.stopped) return;
    if (leaf.view instanceof PageSidebarView && saved?.navigation) leaf.view.restoreNavigation(saved.navigation);
    this.suspended.delete(leaf);
  }

  update(change: (settings: PageTreeSettings) => PageTreeSettings): Promise<boolean> {
    const write = this.writes.then(async () => {
      if (this.stopped) return false;
      const next = readPageTreeSettings(change(this.settings));
      await this.save(next);
      this.settings = next;
      if (!this.stopped) this.refresh();
      return true;
    }).catch(error => {this.failure('侧栏设置未能保存', error); return false;});
    this.writes = write;
    return write;
  }

  refresh() {for (const view of this.views) view.render();}
  private schedule() {
    if (!this.timer) this.timer = window.setTimeout(() => {this.timer = 0; if (!this.stopped) this.refresh();}, 60);
  }
  failure(message: string, error: unknown) {
    console.error('[Nebula Focus] ' + message, error);
    new Notice(message + '：' + (error instanceof Error ? error.message : String(error)));
  }
  onunload() {this.stopped = true; window.clearTimeout(this.timer); window.clearTimeout(this.startupTimer); this.views.clear(); this.suspended.clear(); this.nativeStates.clear();}

  createPage(parent?: PageNode) {
    // A sibling folder note can gain children without moving its existing file.
    const folderPath = parent?.folderPath ?? (parent?.kind === 'page' ? parent.filePath?.replace(/\.md$/i, '') : undefined) ?? '';
    new NewPageModal(this.app, parent?.title, async name => {
      const existing = folderPath ? this.app.vault.getAbstractFileByPath(folderPath) : this.app.vault.getRoot();
      if (existing && !(existing instanceof TFolder)) throw new Error('这个位置已存在同名文件');
      const path = folderPath ? `${folderPath}/${name}.md` : `${name}.md`;
      if (this.app.vault.getAbstractFileByPath(path)) throw new Error('已存在同名页面，请换一个名称');
      if (!existing) await this.app.vault.createFolder(folderPath);
      const file = await this.app.vault.create(path, '');
      if (folderPath) await this.update(state => ({...state, expanded: [...state.expanded, folderPath]}));
      this.refresh();
      // File creation has succeeded even if navigation fails; never offer to create it twice.
      try {
        if (this.rightWorkspace) await this.rightWorkspace.openFileInMain(file);
        else await this.app.workspace.getLeaf(false).openFile(file);
        if (this.app.workspace.getActiveFile()?.path === file.path) this.closeMobileDrawer();
      } catch (error) {this.failure('页面已创建，但未能打开', error);}
    }).open();
  }
}

export class PageSidebarView extends ItemView {
  private search!: HTMLInputElement;
  private treeEl!: HTMLElement;
  private favoritesEl!: HTMLElement;
  private scrollEl!: HTMLElement;
  private liveEl!: HTMLElement;
  private nodes: PageNode[] = [];
  private rows: {node: PageNode; el: HTMLElement}[] = [];
  private pointerDrag?: {pointerId: number; source: PageNode; row: HTMLElement; x: number; y: number; pinned: boolean;
    active: boolean; target?: PageNode; after: boolean};
  private titleMotions = new Map<HTMLElement, {win: Window; timer: number; animation?: Animation}>();
  private suppressClick = false;
  private transientExpanded = new Set<string>();
  private closed = false;
  private viewId = ++nextViewId;
  private nextTitleId = 0;
  private mobileSearchQuery = '';
  private searchModal?: SidebarSearchModal;

  constructor(leaf: WorkspaceLeaf, readonly sidebar: PageSidebar) {super(leaf);}
  getViewType() {return PAGE_SIDEBAR_TYPE;}
  getDisplayText() {return '页面';}
  getIcon() {return 'panels-top-left';}
  get isReady() {return !this.closed && !!this.treeEl;}

  async onOpen() {
    if (!this.sidebar.isEnabled) {this.closed = true; void this.sidebar.setEnabled(false); return;}
    this.closed = false;
    this.contentEl.replaceChildren();
    this.contentEl.classList.add('bui-page-sidebar');
    const toolbar = this.contentEl.createDiv({cls: 'bui-pages-toolbar'});
    this.search = this.contentEl.createEl('input');
    this.search.remove();
    this.search.type = 'search'; this.search.placeholder = '搜索页面…';
    this.search.setAttribute('aria-label', '搜索页面');
    this.search.addEventListener('input', () => this.render());
    this.search.addEventListener('keydown', event => {
      if (event.key === 'Escape') {this.search.value = ''; this.render();}
      if (event.key === 'ArrowDown') {event.preventDefault(); this.rows[0]?.el.focus();}
    });
    if (Platform.isMobileApp) {
      toolbar.classList.add('bui-pages-mobile-header');
      toolbar.createSpan({cls: 'bui-pages-vault-name', text: this.app.vault.getName()});
    } else toolbar.classList.add('bui-pages-desktop-header');
    this.iconButton(toolbar, 'search', '搜索页面', () => this.openSearch()).classList.add('bui-pages-search-button');
    toolbar.addEventListener('contextmenu', event => {event.preventDefault(); this.options(event);});
    this.contentEl.addEventListener('contextmenu', event => {
      const target = event.target as HTMLElement;
      if (target.closest('.bui-page-row, .bui-page-favorite, .bui-pages-toolbar')) return;
      event.preventDefault(); this.options(event);
    });
    if (this.sidebar.openReminders) {
      const reminders = this.contentEl.createEl('button', {cls: 'bui-pages-reminders', attr: {'aria-label': '提醒事项'}});
      setIcon(reminders.createSpan(), 'list-todo'); reminders.createSpan({text: '提醒事项'});
      reminders.addEventListener('click', () => {void this.sidebar.openReminders?.().then(() => this.sidebar.closeMobileDrawer())
        .catch(error => this.sidebar.failure('提醒事项未能打开', error));});
    }
    this.scrollEl = this.contentEl.createDiv({cls: 'bui-pages-scroll'});
    this.favoritesEl = this.scrollEl.createDiv({cls: 'bui-pages-favorites'});
    this.treeEl = this.scrollEl.createDiv({cls: 'bui-pages-tree', attr: {role: 'tree', 'aria-label': '页面'}});
    const footer = this.contentEl.createDiv({cls: 'bui-pages-footer'});
    const create = footer.createEl('button', {cls: 'bui-pages-create'});
    setIcon(create.createSpan(), 'square-pen'); create.createSpan({text: '新建页面'});
    create.addEventListener('click', () => this.sidebar.createPage());
    this.liveEl = this.contentEl.createDiv({cls: 'bui-pages-live', attr: {'aria-live': 'polite'}});
    this.sidebar.views.add(this);
    this.revealActive(this.app.workspace.getActiveFile()?.path);
  }

  async onClose() {
    this.cancelDrag(); this.stopTitleMotions();
    this.searchModal?.close(); this.searchModal = undefined;
    this.closed = true; this.sidebar.views.delete(this); this.contentEl.replaceChildren();
  }

  captureNavigation(): PageNavigationState {
    return {query: this.search?.value ?? '', scroll: this.scrollEl?.scrollTop ?? 0, expanded: [...this.transientExpanded],
      ...(this.mobileSearchQuery ? {mobileQuery: this.mobileSearchQuery} : {})};
  }
  restoreNavigation(state: PageNavigationState) {
    if (this.closed || !this.treeEl) return;
    // The old inline filter no longer has a visible field. Keep its query in
    // the unified finder, never as an invisible filter on the restored tree.
    this.search.value = ''; this.transientExpanded = new Set(state.expanded);
    this.mobileSearchQuery = state.mobileQuery ?? state.query;
    this.render(); this.scrollEl.scrollTop = state.scroll;
  }

  revealActive(path?: string) {
    if (this.closed || !this.treeEl || !this.sidebar.isEnabled) return;
    const nodes = flattenPages(this.sidebar.tree());
    let node = nodes.find(item => item.filePath === path);
    while (node) {
      const parent: PageNode | undefined = nodes.find(item => item.id === node?.parent);
      if (!parent) break;
      this.transientExpanded.add(parent.id); node = parent;
    }
    this.render();
  }

  render() {
    if (this.closed || !this.treeEl || !this.sidebar.isEnabled) return;
    this.cancelDrag(); this.stopTitleMotions();
    const activeElement = this.contentEl.ownerDocument.activeElement as HTMLElement | null;
    const focused = activeElement?.closest<HTMLElement>('.bui-page-row');
    const focusId = focused && this.treeEl.contains(focused) ? focused.dataset.id : undefined;
    const scroll = this.scrollEl.scrollTop;
    this.nodes = this.sidebar.tree();
    const query = this.search.value.trim();
    const visible = filterPages(this.nodes, query);
    this.favoritesEl.replaceChildren();
    if (!query) {
      const favorites = this.favoriteNodes();
      if (favorites.length) {
        this.favoritesEl.createDiv({cls: 'bui-pages-section', text: '置顶'});
        for (const node of favorites) this.renderFavorite(node);
      }
    }
    this.treeEl.replaceChildren(); this.rows = [];
    const projects = visible.filter(node => !!node.folderPath), pages = visible.filter(node => !node.folderPath);
    for (const [label, nodes] of [['项目', projects], ['页面', pages]] as const) {
      if (!nodes.length) continue;
      const section = this.treeEl.createDiv({cls: 'bui-pages-group', attr: {role: 'group', 'aria-label': label}});
      const heading = section.createDiv({cls: 'bui-pages-section', attr: {role: 'presentation'}});
      heading.createSpan({text: label});
      heading.createSpan({cls: 'bui-pages-count', text: String(nodes.length)});
      if (label === '项目') this.iconButton(heading, 'list-collapse', '全部收起', () => {
        this.search.value = ''; this.transientExpanded.clear();
        void this.sidebar.update(state => ({...state, expanded: []}));
      });
      this.renderNodes(nodes, section, 0, !!query);
    }
    if (!visible.length) this.treeEl.createDiv({cls: 'bui-pages-empty', text: query ? '没有找到匹配的页面' : '从一个新页面开始'});
    const activePath = this.app.workspace.getActiveFile()?.path;
    const tabbable = this.rows.find(row => row.node.id === focusId) ?? this.rows.find(row => row.node.filePath === activePath) ?? this.rows[0];
    for (const row of this.rows) row.el.tabIndex = row === tabbable ? 0 : -1;
    if (focusId) tabbable?.el.focus({preventScroll: true});
    this.scrollEl.scrollTop = scroll;
  }

  private expanded(node: PageNode) {return this.sidebar.settings.expanded.includes(node.id) || this.transientExpanded.has(node.id);}

  private renderNodes(nodes: PageNode[], host: HTMLElement, depth: number, searching: boolean) {
    nodes.forEach((node, index) => {
      const item = host.createDiv({cls: 'bui-page-item', attr: {role: 'none'}});
      const row = item.createDiv({cls: 'bui-page-row', attr: {role: 'treeitem', 'aria-level': String(depth + 1),
        'aria-posinset': String(index + 1), 'aria-setsize': String(nodes.length)}});
      row.dataset.id = node.id;
      row.style.setProperty('--page-depth', String(depth));
      row.setAttribute('aria-description', node.filePath ?? node.folderPath ?? node.title);
      const isActive = !!node.filePath && node.filePath === this.app.workspace.getActiveFile()?.path;
      row.classList.toggle('is-active', isActive); row.setAttribute('aria-selected', String(isActive));
      const hasChildren = node.children.length > 0;
      const expanded = searching || this.expanded(node);
      if (hasChildren) row.setAttribute('aria-expanded', String(expanded));
      if (hasChildren) {
        const disclosure = row.createEl('button', {cls: 'bui-page-disclosure', attr: {tabindex: '-1', 'aria-label': expanded ? '收起 ' + node.title : '展开 ' + node.title}});
        setIcon(disclosure, 'chevron-right'); disclosure.classList.toggle('is-expanded', expanded);
        disclosure.addEventListener('click', event => {event.stopPropagation(); if (!searching) this.toggle(node);});
        if (searching) disclosure.disabled = true;
      }
      this.renderNodeIcon(row, node);
      const title = this.renderTitle(row, node.title);
      row.setAttribute('aria-labelledby', title.id);
      const actions = row.createSpan({cls: 'bui-page-actions'});
      this.pinButton(actions, node, -1);
      if (node.kind === 'page' || node.kind === 'folder') this.iconButton(actions, 'plus', '在 ' + node.title + ' 下新建页面', event => {
        event.stopPropagation(); this.sidebar.createPage(node);
      }, -1);
      row.addEventListener('click', event => {
        if (this.suppressClick) {event.preventDefault(); return;}
        void this.openNode(node);
      });
      row.addEventListener('auxclick', event => {if (event.button === 1) {event.preventDefault(); void this.openNode(node, true);}});
      row.addEventListener('contextmenu', event => {event.preventDefault(); this.nodeMenu(node, event);});
      row.addEventListener('keydown', event => this.keydown(event, node, searching));
      row.addEventListener('focus', () => {for (const other of this.rows) other.el.tabIndex = other.el === row ? 0 : -1;});
      this.rows.push({node, el: row});
      if (!searching && this.sidebar.settings.sort === 'manual') this.dragEvents(row, node);
      if (hasChildren && expanded) {
        const group = item.createDiv({cls: 'bui-page-children', attr: {role: 'group'}});
        // aria-owns associates the sibling group without nesting buttons in a treeitem's label.
        group.id = `bui-pages-${this.viewId}-${this.rows.length}`;
        row.setAttribute('aria-owns', group.id);
        this.renderNodes(node.children, group, depth + 1, searching);
      }
    });
  }

  private renderFavorite(node: PageNode) {
    const row = this.favoritesEl.createDiv({cls: 'bui-page-favorite', attr: {'data-id': node.id}});
    const open = row.createEl('button', {cls: 'bui-page-favorite-open'});
    const active = !!node.filePath && node.filePath === this.app.workspace.getActiveFile()?.path;
    row.classList.toggle('is-active', active); open.setAttribute('aria-current', active ? 'page' : 'false');
    this.renderNodeIcon(open, node);
    this.renderTitle(open, node.title);
    open.setAttribute('aria-description', node.filePath ?? node.id);
    open.addEventListener('click', () => {if (!this.suppressClick) void this.openNode(node);});
    open.addEventListener('contextmenu', event => {event.preventDefault(); this.nodeMenu(node, event, true);});
    open.addEventListener('keydown', event => {
      if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault();
        const nodes = this.favoriteNodes(), index = nodes.findIndex(item => item.id === node.id);
        const target = nodes[index + (event.key === 'ArrowUp' ? -1 : 1)];
        if (target) this.moveFavorite(node, target, event.key === 'ArrowDown');
      }
    });
    this.pinButton(row, node);
    row.addEventListener('contextmenu', event => {
      if ((event.target as HTMLElement).closest('.bui-page-favorite-open')) return;
      event.preventDefault(); this.nodeMenu(node, event, true);
    });
    this.dragEvents(row, node, true);
  }

  private renderTitle(host: HTMLElement, title: string) {
    const label = host.createSpan({cls: 'bui-page-title'});
    label.id = `bui-page-title-${this.viewId}-${++this.nextTitleId}`;
    const text = label.createSpan({cls: 'bui-page-title-text', text: title});
    label.addEventListener('pointerenter', event => {
      const win = label.ownerDocument.defaultView;
      if (!win || Platform.isMobileApp || event.pointerType === 'touch' ||
          !win.matchMedia?.('(hover: hover) and (pointer: fine)').matches || win.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      this.stopTitleMotion(label);
      const motion: {win: Window; timer: number; animation?: Animation} = {win, timer: 0};
      motion.timer = win.setTimeout(() => {
        motion.timer = 0;
        if (!label.isConnected || this.closed || win.matchMedia('(prefers-reduced-motion: reduce)').matches) {this.stopTitleMotion(label); return;}
        const overflow = Math.max(0, text.scrollWidth - label.clientWidth);
        if (!overflow || !text.animate) {this.stopTitleMotion(label); return;}
        label.classList.add('is-scrolling');
        motion.animation = text.animate([{transform: 'translateX(0)'}, {transform: `translateX(-${overflow}px)`}],
          {duration: Math.max(1400, overflow / 28 * 1000), easing: 'linear', fill: 'forwards'});
      }, 300);
      this.titleMotions.set(label, motion);
    });
    label.addEventListener('pointerleave', () => this.stopTitleMotion(label));
    return label;
  }

  private stopTitleMotion(label: HTMLElement) {
    const motion = this.titleMotions.get(label);
    if (motion) {motion.win.clearTimeout(motion.timer); motion.animation?.cancel(); this.titleMotions.delete(label);}
    label.classList.remove('is-scrolling');
  }
  private stopTitleMotions() {for (const label of this.titleMotions.keys()) this.stopTitleMotion(label);}

  private favoriteNodes() {
    const all = flattenPages(this.nodes), seen = new Set<string>();
    return this.sidebar.settings.favorites.map(id => all.find(node => node.id === id || node.filePath === id))
      .filter((node): node is PageNode => {
        if (!node || seen.has(node.id)) return false;
        seen.add(node.id); return true;
      });
  }

  private moveFavorite(node: PageNode, target: PageNode, after: boolean) {
    if (node.id === target.id) return;
    void this.sidebar.update(state => {
      const source = state.favorites.find(id => id === node.id || id === node.filePath);
      if (!source) return state;
      const favorites = state.favorites.filter(id => id !== node.id && id !== node.filePath);
      const index = favorites.findIndex(id => id === target.id || id === target.filePath);
      if (index < 0) return state;
      favorites.splice(index + (after ? 1 : 0), 0, source);
      return {...state, favorites};
    }).then(saved => {
      if (saved && !this.closed) {
        this.liveEl.textContent = '已调整 ' + node.title + ' 的置顶顺序';
        [...this.favoritesEl.querySelectorAll<HTMLElement>('.bui-page-favorite')]
          .find(row => row.dataset.id === node.id)?.querySelector<HTMLButtonElement>('.bui-page-favorite-open')?.focus();
      }
    });
  }

  private renderNodeIcon(host: HTMLElement, node: PageNode) {
    // Folder-backed and ordinary pages share the same title baseline.
    // Disclosure arrows express hierarchy without a second decorative icon.
    if (node.kind === 'page' || node.kind === 'folder') return;
    const icon = {database: 'table-2', canvas: 'layout-dashboard', folder: 'folder', attachment: 'paperclip'}[node.kind];
    setIcon(host.createSpan({cls: 'bui-page-icon'}), icon);
  }

  private pinButton(host: HTMLElement, node: PageNode, tabIndex = 0) {
    const pinned = this.sidebar.settings.favorites.some(id => id === node.id || id === node.filePath);
    const button = this.iconButton(host, pinned ? 'pin-off' : 'pin', pinned ? '取消置顶' : '置顶', event => {
      event.stopPropagation(); this.favorite(node);
    }, tabIndex);
    button.classList.add('bui-page-pin');
    button.classList.toggle('is-pinned', pinned);
    button.setAttribute('aria-pressed', String(pinned));
    return button;
  }

  private iconButton(host: HTMLElement, icon: string, title: string, action: (event: MouseEvent) => void, tabIndex = 0) {
    const button = host.createEl('button', {cls: 'bui-pages-icon-button', attr: {'aria-label': title, title}});
    button.tabIndex = tabIndex; setIcon(button, icon); button.addEventListener('click', action); return button;
  }

  private toggle(node: PageNode) {
    const wasExpanded = this.expanded(node);
    this.transientExpanded.delete(node.id);
    void this.sidebar.update(state => ({...state, expanded: wasExpanded ? state.expanded.filter(id => id !== node.id) : [...state.expanded, node.id]}));
  }

  private async openNode(node: PageNode, newTab = false, subpath?: string): Promise<boolean> {
    if (!this.sidebar.isEnabled || this.closed) return false;
    if (!node.filePath) {this.toggle(node); return false;}
    const file = this.app.vault.getAbstractFileByPath(node.filePath);
    if (!(file instanceof TFile)) {this.sidebar.refresh(); return false;}
    try {
      const controller = this.sidebar.rightWorkspace;
      if (controller && ['md', 'base'].includes(file.extension.toLowerCase())) {
        const opened = await controller.openFileInMain(file, this.app.workspace.getMostRecentLeaf(this.leaf.getContainer()) ?? undefined, newTab);
        if (!opened) return false;
        if (subpath) opened.setEphemeralState({subpath});
      } else await this.app.workspace.getLeaf(newTab ? 'tab' : false).openFile(file, subpath ? {eState: {subpath}} : undefined);
      if (this.app.workspace.getActiveFile()?.path === file.path) this.sidebar.closeMobileDrawer();
      return true;
    }
    catch (error) {this.sidebar.failure('无法打开页面', error); return false;}
  }

  private async openRight(node: PageNode) {
    const file = node.filePath && this.app.vault.getAbstractFileByPath(node.filePath);
    if (!this.sidebar.isEnabled || this.closed || !(file instanceof TFile)) return;
    try {
      if (this.sidebar.rightWorkspace && ['md', 'base'].includes(file.extension.toLowerCase()))
        await this.sidebar.rightWorkspace.openFile(file, this.app.workspace.getMostRecentLeaf(this.leaf.getContainer()) ?? undefined);
      else await this.openNode(node, true);
    } catch (error) {this.sidebar.failure('无法打开页面', error);}
  }

  private openSearch() {
    if (this.searchModal || !this.sidebar.isEnabled || this.closed) return;
    this.searchModal = new SidebarSearchModal(this.app, {
      // Hidden paths are a sidebar presentation preference, not a search
      // restriction. Keep the tree's system/generated-folder exclusions.
      query: this.mobileSearchQuery, pages: () => flattenPages(buildPageTree(this.app.vault.getRoot(), {...this.sidebar.settings, hiddenPaths: []})),
      changed: value => {this.mobileSearchQuery = value;}, openPage: (node, subpath) => this.openNode(node, false, subpath),
      closed: () => {this.searchModal = undefined;},
    });
    this.searchModal.open();
  }

  private favorite(node: PageNode) {
    void this.sidebar.update(state => {
      const aliases = [node.id, node.filePath];
      const exists = state.favorites.some(id => aliases.includes(id));
      return {...state, favorites: exists ? state.favorites.filter(id => !aliases.includes(id)) : [...state.favorites, node.id]};
    });
  }

  private siblings(node: PageNode) {
    return node.parent === this.app.vault.getRoot().path ? this.nodes.filter(item => !!item.folderPath === !!node.folderPath)
      : flattenPages(this.nodes).find(item => item.id === node.parent)?.children ?? [];
  }

  private move(node: PageNode, target: PageNode, after: boolean) {
    const order = reorderPages(this.siblings(node), node.id, target.id, after);
    if (!order) return;
    void this.sidebar.update(state => {
      // Reorder only this visual group; retain hidden and other-group positions.
      const all = node.parent === this.app.vault.getRoot().path ? this.nodes : this.siblings(node);
      const previous = [...new Set([...(state.order[node.parent] ?? []).map(id =>
        all.find(item => item.id === id || item.filePath === id)?.id ?? id), ...all.map(item => item.id)])];
      let next = 0;
      const complete = previous.map(id => order.includes(id) ? order[next++] : id);
      return {...state, sort: 'manual', order: {...state.order, [node.parent]: complete}};
    }).then(saved => {
      if (saved && !this.closed) {this.liveEl.textContent = '已调整 ' + node.title + ' 的顺序'; this.rows.find(row => row.node.id === node.id)?.el.focus();}
    });
  }

  private keydown(event: KeyboardEvent, node: PageNode, searching: boolean) {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Escape' && this.pointerDrag) {event.preventDefault(); this.cancelDrag(); return;}
    const index = this.rows.findIndex(row => row.node.id === node.id);
    if (event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      if (searching) return;
      const siblings = this.siblings(node), position = siblings.findIndex(item => item.id === node.id);
      const next = siblings[position + (event.key === 'ArrowUp' ? -1 : 1)];
      if (next) this.move(node, next, event.key === 'ArrowDown');
    } else if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const destination = event.key === 'Home' ? 0 : event.key === 'End' ? this.rows.length - 1 : index + (event.key === 'ArrowUp' ? -1 : 1);
      this.rows[destination]?.el.focus();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      if (node.children.length && !searching && !this.expanded(node)) this.toggle(node);
      else if (node.children.length) this.rows[index + 1]?.el.focus();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      if (!searching && node.children.length && this.expanded(node)) this.toggle(node);
      else this.rows.find(row => row.node.id === node.parent)?.el.focus();
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); void this.openNode(node);
    } else if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      event.preventDefault();
      const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
      this.nodeMenu(node, {clientX: box.left + 30, clientY: box.bottom} as MouseEvent);
    }
  }

  private dragEvents(row: HTMLElement, node: PageNode, pinned = false) {
    // Pointer capture avoids Electron's OS drag session swallowing local drops.
    // Touch keeps ordinary scrolling; its menu offers the same ordering actions.
    row.addEventListener('pointerdown', event => {
      this.suppressClick = false;
      const button = (event.target as HTMLElement).closest('button');
      if (event.button !== 0 || event.pointerType === 'touch' || (button && !(pinned && button.classList.contains('bui-page-favorite-open')))) return;
      this.cancelDrag(); row.focus({preventScroll: true});
      this.pointerDrag = {pointerId: event.pointerId, source: node, row, x: event.clientX, y: event.clientY, pinned, active: false, after: false};
      try {row.setPointerCapture?.(event.pointerId);} catch {this.pointerDrag = undefined;}
    });
    row.addEventListener('pointermove', event => this.pointerMove(event));
    row.addEventListener('pointerup', event => {
      const drag = this.pointerDrag;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (drag.active) {event.preventDefault(); event.stopPropagation(); this.pointerMove(event);}
      this.cancelDrag();
      if (drag.active && drag.target) {
        if (drag.pinned) this.moveFavorite(drag.source, drag.target, drag.after);
        else this.move(drag.source, drag.target, drag.after);
      }
    });
    row.addEventListener('pointercancel', () => this.cancelDrag());
    row.addEventListener('lostpointercapture', () => this.cancelDrag());
  }

  private pointerMove(event: PointerEvent) {
    const drag = this.pointerDrag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.active && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) return;
    drag.active = true; this.suppressClick = true; event.preventDefault();
    drag.row.classList.add('is-dragging'); this.clearDrop(); drag.target = undefined;
    const hit = this.contentEl.ownerDocument.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>(drag.pinned ? '.bui-page-favorite' : '.bui-page-row');
    if (!hit || !(drag.pinned ? this.favoritesEl : this.treeEl).contains(hit)) return;
    const target = (drag.pinned ? this.favoriteNodes() : this.siblings(drag.source)).find(node => node.id === hit.dataset.id && node.id !== drag.source.id);
    if (!target) return;
    const rect = hit.getBoundingClientRect();
    drag.target = target; drag.after = event.clientY > rect.top + rect.height / 2;
    hit.classList.add(drag.after ? 'drop-after' : 'drop-before');
    const bounds = this.scrollEl.getBoundingClientRect();
    if (event.clientY < bounds.top + 28) this.scrollEl.scrollTop -= 10;
    else if (event.clientY > bounds.bottom - 28) this.scrollEl.scrollTop += 10;
  }

  private cancelDrag() {
    const drag = this.pointerDrag; this.pointerDrag = undefined;
    drag?.row.classList.remove('is-dragging');
    if (drag?.active) window.setTimeout(() => {this.suppressClick = false;}, 0);
    if (drag?.row.hasPointerCapture?.(drag.pointerId)) drag.row.releasePointerCapture(drag.pointerId);
    if (this.treeEl) this.clearDrop();
  }

  private clearDrop() {this.contentEl.querySelectorAll('.drop-before,.drop-after').forEach(el => el.classList.remove('drop-before', 'drop-after'));}

  private nodeMenu(node: PageNode, event: MouseEvent, pinned = false) {
    const menu = new Menu().setUseNativeMenu(false);
    if (node.filePath) menu.addItem(item => item.setTitle('在新标签页打开').setIcon('external-link').onClick(() => this.openNode(node, true)));
    if (node.filePath && this.sidebar.rightWorkspace && !Platform.isMobileApp)
      menu.addItem(item => item.setTitle('在右侧新标签页打开').setIcon('panel-right-open').onClick(() => this.openRight(node)));
    const favorite = this.sidebar.settings.favorites.some(id => id === node.id || id === node.filePath);
    menu.addItem(item => item.setTitle(favorite ? '取消置顶' : '置顶').setIcon('pin').onClick(() => this.favorite(node)));
    if (node.kind === 'page' || node.kind === 'folder') menu.addItem(item => item.setTitle('新建子页面').setIcon('plus').onClick(() => this.sidebar.createPage(node)));
    if (!this.search.value.trim()) {
      menu.addSeparator();
      const siblings = pinned ? this.favoriteNodes() : this.siblings(node), index = siblings.findIndex(item => item.id === node.id);
      const move = (target: PageNode, after: boolean) => pinned ? this.moveFavorite(node, target, after) : this.move(node, target, after);
      menu.addItem(item => item.setTitle('上移').setIcon('arrow-up').setDisabled(index <= 0).onClick(() => move(siblings[index - 1], false)));
      menu.addItem(item => item.setTitle('下移').setIcon('arrow-down').setDisabled(index >= siblings.length - 1).onClick(() => move(siblings[index + 1], true)));
    }
    if (this.sidebar.archives) {
      menu.addSeparator();
      menu.addItem(item => item.setTitle('归档到外部…').setIcon('archive').onClick(() => this.sidebar.archives?.open(node)));
    }
    menu.showAtPosition({x: event.clientX, y: event.clientY});
  }

  private options(event: MouseEvent) {
    const menu = new Menu().setUseNativeMenu(false);
    menu.addItem(item => item.setTitle('手动排序（拖动或快捷键）').setChecked(this.sidebar.settings.sort === 'manual')
      .onClick(() => {void this.sidebar.update(state => ({...state, sort: 'manual'}));}));
    menu.addItem(item => item.setTitle('按名称排序').setChecked(this.sidebar.settings.sort === 'name')
      .onClick(() => {void this.sidebar.update(state => ({...state, sort: 'name'}));}));
    menu.addSeparator();
    menu.addItem(item => item.setTitle('显示附件').setChecked(this.sidebar.settings.showAttachments)
      .onClick(() => {void this.sidebar.update(state => ({...state, showAttachments: !state.showAttachments}));}));
    menu.addItem(item => item.setTitle('打开原生文件列表').setIcon('folder-open').onClick(() => this.sidebar.openNative()));
    if (this.sidebar.archives) {
      menu.addSeparator();
      menu.addItem(item => item.setTitle('外部归档…').setIcon('archive-restore').onClick(() => this.sidebar.archives?.browse()));
    }
    menu.showAtPosition({x: event.clientX, y: event.clientY});
  }
}

class NewPageModal extends Modal {
  constructor(app: App, private parentTitle: string | undefined, private create: (name: string) => Promise<void>) {super(app);}
  onOpen() {
    this.setTitle(this.parentTitle ? '新建子页面' : '新建页面');
    this.contentEl.createEl('p', {text: this.parentTitle ? '添加到「' + this.parentTitle + '」' : '添加到当前库', cls: 'bui-pages-caption'});
    const form = this.contentEl.createEl('form', {cls: 'bui-pages-new-form'});
    const input = form.createEl('input', {type: 'text', placeholder: '页面名称', attr: {'aria-label': '页面名称'}});
    const error = form.createDiv({cls: 'bui-pages-form-error', attr: {role: 'alert'}});
    const button = form.createEl('button', {text: '创建页面', cls: 'mod-cta', attr: {type: 'submit'}});
    let submitting = false;
    const submit = async () => {
      if (submitting) return;
      const name = validPageName(input.value);
      if (!name) {error.textContent = '请输入有效名称，不要包含 /、\\ 等路径符号'; input.focus(); return;}
      submitting = true; button.disabled = true; error.textContent = '';
      try {await this.create(name); this.close();}
      catch (failure) {error.textContent = failure instanceof Error ? failure.message : String(failure); submitting = false; button.disabled = false;}
    };
    form.addEventListener('submit', event => {
      event.preventDefault(); void submit();
    });
    input.focus();
  }
  onClose() {this.contentEl.replaceChildren();}
}
