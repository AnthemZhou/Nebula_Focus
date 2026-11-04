import {App, Component, ItemView, Menu, Modal, Notice, Plugin, TFile, TFolder, WorkspaceLeaf, setIcon} from 'obsidian';
import {PageNode, PageTreeSettings, buildPageTree, filterPages, flattenPages, readPageTreeSettings,
  remapPageSettings, reorderPages, validPageName} from './page-tree';

export const PAGE_SIDEBAR_TYPE = 'nebula-pages';
let nextViewId = 0;

export class PageSidebar extends Component {
  settings: PageTreeSettings;
  readonly views = new Set<PageSidebarView>();
  private writes: Promise<unknown> = Promise.resolve();
  private timer = 0;
  private stopped = false;

  constructor(readonly plugin: Plugin, initial: unknown, private save: (settings: PageTreeSettings) => Promise<void>) {
    super();
    this.settings = readPageTreeSettings(initial);
  }

  get app() {return this.plugin.app;}
  tree() {return buildPageTree(this.app.vault.getRoot(), this.settings);}

  onload() {
    this.plugin.registerView(PAGE_SIDEBAR_TYPE, leaf => new PageSidebarView(leaf, this));
    this.plugin.addCommand({id: 'open-page-sidebar', name: '打开页面侧栏', callback: () => {void this.open();}});
    this.plugin.addCommand({id: 'open-native-files', name: '打开原生文件列表', callback: () => {void this.openNative();}});
    this.plugin.addRibbonIcon('panel-left', '页面侧栏', () => {void this.open();});
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

  async open() {
    try {
      const leaf = this.app.workspace.getLeavesOfType(PAGE_SIDEBAR_TYPE)[0] ?? this.app.workspace.getLeftLeaf(false);
      if (!leaf) return;
      if (leaf.view.getViewType() !== PAGE_SIDEBAR_TYPE) await leaf.setViewState({type: PAGE_SIDEBAR_TYPE, active: true});
      await this.app.workspace.revealLeaf(leaf);
    } catch (error) {this.failure('无法打开页面侧栏', error);}
  }

  async openNative() {
    try {
      const leaf = this.app.workspace.getLeavesOfType('file-explorer')[0] ?? this.app.workspace.getLeftLeaf(false);
      if (!leaf) return;
      if (leaf.view.getViewType() !== 'file-explorer') await leaf.setViewState({type: 'file-explorer', active: true});
      await this.app.workspace.revealLeaf(leaf);
    } catch (error) {this.failure('无法打开文件列表', error);}
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
  onunload() {this.stopped = true; window.clearTimeout(this.timer); this.views.clear();}

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
      try {await this.app.workspace.getLeaf(false).openFile(file);} catch (error) {this.failure('页面已创建，但未能打开', error);}
    }).open();
  }
}

export class PageSidebarView extends ItemView {
  private search!: HTMLInputElement;
  private treeEl!: HTMLElement;
  private favoritesEl!: HTMLElement;
  private scrollEl!: HTMLElement;
  private countEl!: HTMLElement;
  private liveEl!: HTMLElement;
  private nodes: PageNode[] = [];
  private rows: {node: PageNode; el: HTMLElement}[] = [];
  private pointerDrag?: {pointerId: number; source: PageNode; row: HTMLElement; x: number; y: number;
    active: boolean; target?: PageNode; after: boolean};
  private suppressClick = false;
  private transientExpanded = new Set<string>();
  private closed = false;
  private viewId = ++nextViewId;

  constructor(leaf: WorkspaceLeaf, readonly sidebar: PageSidebar) {super(leaf);}
  getViewType() {return PAGE_SIDEBAR_TYPE;}
  getDisplayText() {return '页面';}
  getIcon() {return 'panels-top-left';}

  async onOpen() {
    this.closed = false;
    this.contentEl.replaceChildren();
    this.contentEl.classList.add('bui-page-sidebar');
    const header = this.contentEl.createDiv({cls: 'bui-pages-header'});
    const logo = header.createSpan({cls: 'bui-pages-logo'}); setIcon(logo, 'panels-top-left');
    const title = header.createDiv({cls: 'bui-pages-workspace'});
    title.createDiv({text: this.app.vault.getName(), cls: 'bui-pages-vault'});
    title.createDiv({text: '工作空间', cls: 'bui-pages-caption'});
    this.iconButton(header, 'ellipsis', '侧栏选项', event => this.options(event));

    const searchBox = this.contentEl.createDiv({cls: 'bui-pages-search'});
    setIcon(searchBox.createSpan(), 'search');
    this.search = searchBox.createEl('input', {type: 'search', placeholder: '搜索页面…'});
    this.search.setAttribute('aria-label', '搜索页面');
    this.search.addEventListener('input', () => this.render());
    this.search.addEventListener('keydown', event => {
      if (event.key === 'Escape') {this.search.value = ''; this.render();}
      if (event.key === 'ArrowDown') {event.preventDefault(); this.rows[0]?.el.focus();}
    });
    this.scrollEl = this.contentEl.createDiv({cls: 'bui-pages-scroll'});
    this.favoritesEl = this.scrollEl.createDiv({cls: 'bui-pages-favorites'});
    const heading = this.scrollEl.createDiv({cls: 'bui-pages-section'});
    heading.createSpan({text: '页面'});
    this.countEl = heading.createSpan({cls: 'bui-pages-count'});
    this.iconButton(heading, 'list-collapse', '全部收起', () => {
      this.search.value = '';
      this.transientExpanded.clear(); void this.sidebar.update(state => ({...state, expanded: []}));
    });
    this.treeEl = this.scrollEl.createDiv({cls: 'bui-pages-tree', attr: {role: 'tree', 'aria-label': '工作空间页面'}});
    const footer = this.contentEl.createDiv({cls: 'bui-pages-footer'});
    const create = footer.createEl('button', {cls: 'bui-pages-create'});
    setIcon(create.createSpan(), 'plus'); create.createSpan({text: '新建页面'});
    create.addEventListener('click', () => this.sidebar.createPage());
    this.liveEl = this.contentEl.createDiv({cls: 'bui-pages-live', attr: {'aria-live': 'polite'}});
    this.sidebar.views.add(this);
    this.revealActive(this.app.workspace.getActiveFile()?.path);
  }

  async onClose() {
    this.cancelDrag();
    this.closed = true; this.sidebar.views.delete(this); this.contentEl.replaceChildren();
  }

  revealActive(path?: string) {
    if (this.closed || !this.treeEl) return;
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
    if (this.closed || !this.treeEl) return;
    this.cancelDrag();
    const activeElement = this.contentEl.ownerDocument.activeElement as HTMLElement | null;
    const focused = activeElement?.closest<HTMLElement>('.bui-page-row');
    const focusId = focused && this.treeEl.contains(focused) ? focused.dataset.id : undefined;
    const scroll = this.scrollEl.scrollTop;
    this.nodes = this.sidebar.tree();
    const query = this.search.value.trim();
    const visible = filterPages(this.nodes, query);
    const all = flattenPages(this.nodes);
    this.countEl.textContent = String(all.filter(node => !!node.filePath).length);
    this.favoritesEl.replaceChildren();
    if (!query) {
      const favorites = this.sidebar.settings.favorites.map(id => all.find(node => node.id === id || node.filePath === id))
        .filter((node): node is PageNode => !!node);
      if (favorites.length) {
        this.favoritesEl.createDiv({cls: 'bui-pages-section', text: '收藏'});
        for (const node of favorites) this.renderFavorite(node);
      }
    }
    this.treeEl.replaceChildren(); this.rows = [];
    this.renderNodes(visible, this.treeEl, 0, !!query);
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
        'aria-posinset': String(index + 1), 'aria-setsize': String(nodes.length), 'aria-label': node.title}});
      row.dataset.id = node.id;
      row.style.setProperty('--page-depth', String(depth));
      row.title = node.filePath ?? node.folderPath ?? node.title;
      const isActive = !!node.filePath && node.filePath === this.app.workspace.getActiveFile()?.path;
      row.classList.toggle('is-active', isActive); row.setAttribute('aria-selected', String(isActive));
      const hasChildren = node.children.length > 0;
      const expanded = searching || this.expanded(node);
      if (hasChildren) row.setAttribute('aria-expanded', String(expanded));
      const disclosure = row.createEl('button', {cls: 'bui-page-disclosure', attr: {tabindex: '-1', 'aria-label': expanded ? '收起 ' + node.title : '展开 ' + node.title}});
      if (hasChildren) {
        setIcon(disclosure, 'chevron-right'); disclosure.classList.toggle('is-expanded', expanded);
        disclosure.addEventListener('click', event => {event.stopPropagation(); if (!searching) this.toggle(node);});
        if (searching) disclosure.disabled = true;
      } else {disclosure.disabled = true; disclosure.setAttribute('aria-hidden', 'true');}
      const icon = row.createSpan({cls: 'bui-page-icon'}); setIcon(icon, this.nodeIcon(node));
      row.createSpan({cls: 'bui-page-title', text: node.title});
      const actions = row.createSpan({cls: 'bui-page-actions'});
      this.iconButton(actions, 'ellipsis', node.title + ' 的操作', event => {event.stopPropagation(); this.nodeMenu(node, event);}, -1);
      if (node.kind === 'page' || node.kind === 'folder') this.iconButton(actions, 'plus', '在 ' + node.title + ' 下新建页面', event => {
        event.stopPropagation(); this.sidebar.createPage(node);
      }, -1);
      row.addEventListener('click', event => {
        if (this.suppressClick) {event.preventDefault(); return;}
        void this.openNode(node, event.metaKey || event.ctrlKey);
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
    const row = this.favoritesEl.createDiv({cls: 'bui-page-favorite'});
    const open = row.createEl('button', {cls: 'bui-page-favorite-open'});
    setIcon(open.createSpan({cls: 'bui-page-icon'}), this.nodeIcon(node));
    open.createSpan({cls: 'bui-page-title', text: node.title});
    open.title = node.filePath ?? node.id;
    open.addEventListener('click', event => {void this.openNode(node, event.metaKey || event.ctrlKey);});
    open.addEventListener('contextmenu', event => {event.preventDefault(); this.nodeMenu(node, event);});
    this.iconButton(row, 'star', '取消收藏 ' + node.title, () => this.favorite(node));
  }

  private nodeIcon(node: PageNode) {
    return {page: 'file-text', database: 'table-2', canvas: 'layout-dashboard', folder: 'folder', attachment: 'paperclip'}[node.kind];
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

  private async openNode(node: PageNode, newTab = false) {
    if (!node.filePath) {this.toggle(node); return;}
    const file = this.app.vault.getAbstractFileByPath(node.filePath);
    if (!(file instanceof TFile)) {this.sidebar.refresh(); return;}
    try {await this.app.workspace.getLeaf(newTab ? 'tab' : false).openFile(file);}
    catch (error) {this.sidebar.failure('无法打开页面', error);}
  }

  private favorite(node: PageNode) {
    void this.sidebar.update(state => {
      const aliases = [node.id, node.filePath];
      const exists = state.favorites.some(id => aliases.includes(id));
      return {...state, favorites: exists ? state.favorites.filter(id => !aliases.includes(id)) : [...state.favorites, node.id]};
    });
  }

  private siblings(node: PageNode) {
    return node.parent === this.app.vault.getRoot().path ? this.nodes : flattenPages(this.nodes).find(item => item.id === node.parent)?.children ?? [];
  }

  private move(node: PageNode, target: PageNode, after: boolean) {
    const order = reorderPages(this.siblings(node), node.id, target.id, after);
    if (!order) return;
    void this.sidebar.update(state => ({...state, sort: 'manual', order: {...state.order, [node.parent]: order}})).then(saved => {
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
      event.preventDefault(); void this.openNode(node, event.metaKey || event.ctrlKey);
    } else if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      event.preventDefault();
      const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
      this.nodeMenu(node, {clientX: box.left + 30, clientY: box.bottom} as MouseEvent);
    }
  }

  private dragEvents(row: HTMLElement, node: PageNode) {
    // Pointer capture avoids Electron's OS drag session swallowing local drops.
    // Touch keeps ordinary scrolling; its menu offers the same ordering actions.
    row.addEventListener('pointerdown', event => {
      this.suppressClick = false;
      if (event.button !== 0 || event.pointerType === 'touch' || (event.target as HTMLElement).closest('button')) return;
      this.cancelDrag(); row.focus({preventScroll: true});
      this.pointerDrag = {pointerId: event.pointerId, source: node, row, x: event.clientX, y: event.clientY, active: false, after: false};
      try {row.setPointerCapture?.(event.pointerId);} catch {this.pointerDrag = undefined;}
    });
    row.addEventListener('pointermove', event => this.pointerMove(event));
    row.addEventListener('pointerup', event => {
      const drag = this.pointerDrag;
      if (!drag || drag.pointerId !== event.pointerId) return;
      if (drag.active) {event.preventDefault(); event.stopPropagation(); this.pointerMove(event);}
      this.cancelDrag();
      if (drag.active && drag.target) this.move(drag.source, drag.target, drag.after);
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
    const hit = this.contentEl.ownerDocument.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('.bui-page-row');
    if (!hit || !this.treeEl.contains(hit)) return;
    const target = this.siblings(drag.source).find(node => node.id === hit.dataset.id && node.id !== drag.source.id);
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

  private clearDrop() {this.treeEl.querySelectorAll('.drop-before,.drop-after').forEach(el => el.classList.remove('drop-before', 'drop-after'));}

  private nodeMenu(node: PageNode, event: MouseEvent) {
    const menu = new Menu().setUseNativeMenu(false);
    if (node.filePath) menu.addItem(item => item.setTitle('在新标签页打开').setIcon('external-link').onClick(() => this.openNode(node, true)));
    const favorite = this.sidebar.settings.favorites.some(id => id === node.id || id === node.filePath);
    menu.addItem(item => item.setTitle(favorite ? '取消收藏' : '添加到收藏').setIcon('star').onClick(() => this.favorite(node)));
    if (node.kind === 'page' || node.kind === 'folder') menu.addItem(item => item.setTitle('新建子页面').setIcon('plus').onClick(() => this.sidebar.createPage(node)));
    if (!this.search.value.trim()) {
      menu.addSeparator();
      const siblings = this.siblings(node), index = siblings.findIndex(item => item.id === node.id);
      menu.addItem(item => item.setTitle('上移').setIcon('arrow-up').setDisabled(index <= 0).onClick(() => this.move(node, siblings[index - 1], false)));
      menu.addItem(item => item.setTitle('下移').setIcon('arrow-down').setDisabled(index >= siblings.length - 1).onClick(() => this.move(node, siblings[index + 1], true)));
    }
    menu.showAtPosition({x: event.clientX, y: event.clientY});
  }

  private options(event: MouseEvent) {
    const menu = new Menu().setUseNativeMenu(false);
    menu.addItem(item => item.setTitle('手动排序（拖动或 Alt + ↑ / ↓）').setChecked(this.sidebar.settings.sort === 'manual')
      .onClick(() => {void this.sidebar.update(state => ({...state, sort: 'manual'}));}));
    menu.addItem(item => item.setTitle('按名称排序').setChecked(this.sidebar.settings.sort === 'name')
      .onClick(() => {void this.sidebar.update(state => ({...state, sort: 'name'}));}));
    menu.addSeparator();
    menu.addItem(item => item.setTitle('显示附件').setChecked(this.sidebar.settings.showAttachments)
      .onClick(() => {void this.sidebar.update(state => ({...state, showAttachments: !state.showAttachments}));}));
    menu.addItem(item => item.setTitle('打开原生文件列表').setIcon('folder-open').onClick(() => this.sidebar.openNative()));
    menu.showAtPosition({x: event.clientX, y: event.clientY});
  }
}

class NewPageModal extends Modal {
  constructor(app: App, private parentTitle: string | undefined, private create: (name: string) => Promise<void>) {super(app);}
  onOpen() {
    this.setTitle(this.parentTitle ? '新建子页面' : '新建页面');
    this.contentEl.createEl('p', {text: this.parentTitle ? '添加到「' + this.parentTitle + '」' : '添加到工作空间', cls: 'bui-pages-caption'});
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
