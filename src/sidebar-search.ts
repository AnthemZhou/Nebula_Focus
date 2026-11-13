import {App, Modal, Platform, TFile, TFolder, getAllTags, normalizePath, setIcon} from 'obsidian';
import type {PageNode} from './page-tree';

interface SidebarSearchActions {
  query: string;
  pages(): PageNode[];
  changed(query: string): void;
  openPage(node: PageNode, subpath?: string): Promise<boolean>;
  closed(): void;
}

type SearchMode = '直接搜索' | '标签' | '书签' | '文件列表';
interface SearchResults {
  key: string;
  element: HTMLElement;
  scrollTop: number;
  retry: boolean;
  timer?: number;
}
const safePath = (path: string) => !path.split('/').some(part => part.startsWith('.')) && path !== 'Nebula Views' && !path.startsWith('Nebula Views/');
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** All four modes stay inside this modal; the caller's sidebar is never replaced. */
export class SidebarSearchModal extends Modal {
  private input!: HTMLInputElement;
  private clearInput?: HTMLButtonElement;
  private results!: HTMLElement;
  private composing = false;
  private choosing = false;
  private stopped = false;
  private opening = false;
  private mode: SearchMode = '直接搜索';
  private modes = new Map<SearchMode, HTMLButtonElement>();
  private folder = '';
  private tag?: string;
  private cachedResults = new Map<string, SearchResults>();
  private activeResults?: SearchResults;
  private cachedQuery?: string;
  private cacheDirty = false;
  private sourceListeners: (() => void)[] = [];
  private publishedQuery = '';
  private renderedKey?: string;
  private cancelResultTouch?: () => void;
  private dismissOutside = (event: PointerEvent) => {
    const target = event.target as HTMLElement | null;
    if (!this.stopped && (target === this.containerEl || target?.classList?.contains('modal-bg'))) this.close();
  };
  constructor(app: App, private actions: SidebarSearchActions) {super(app);}
  onOpen() {
    this.stopped = false;
    this.setTitle('搜索');
    this.modalEl.classList.add('bui-sidebar-search-modal');
    this.modalEl.setAttribute('aria-label', '搜索');
    this.containerEl.addEventListener('pointerdown', this.dismissOutside);
    this.contentEl.replaceChildren();
    const header = this.contentEl.createDiv({cls: 'bui-sidebar-search-header'});
    const field = header.createDiv({cls: 'bui-sidebar-search-field'});
    setIcon(field.createSpan({cls: 'bui-sidebar-search-icon', attr: {'aria-hidden': 'true'}}), 'search');
    this.input = field.createEl('input', {cls: 'bui-sidebar-search-input', type: 'search', placeholder: '搜索页面…',
      attr: {'aria-label': '搜索页面', autocomplete: 'off'}});
    this.input.value = this.actions.query;
    this.publishedQuery = this.input.value;
    this.renderedKey = undefined;
    const changed = () => {this.cacheDirty = true;};
    for (const ref of [this.app.vault.on('create', changed), this.app.vault.on('modify', changed),
      this.app.vault.on('delete', changed), this.app.vault.on('rename', changed)]) {
      this.sourceListeners.push(() => this.app.vault.offref(ref));
    }
    const metadata = this.app.metadataCache.on('changed', changed);
    this.sourceListeners.push(() => this.app.metadataCache.offref(metadata));
    if (Platform.isPhone) {
      this.clearInput = field.createEl('button', {cls: 'bui-sidebar-search-clear', attr: {'aria-label': '清空搜索', type: 'button'}});
      setIcon(this.clearInput, 'circle-x');
      this.clearInput.addEventListener('pointerdown', event => event.preventDefault());
      this.clearInput.addEventListener('click', () => {
        this.composing = false; this.input.value = ''; this.update(); this.input.focus();
      });
      const close = header.createEl('button', {cls: 'bui-sidebar-search-close', attr: {'aria-label': '关闭搜索', type: 'button'}});
      setIcon(close, 'x');
      close.addEventListener('click', event => {event.stopPropagation(); this.close();});
    }
    this.results = this.contentEl.createDiv({cls: 'bui-sidebar-search-results', attr: {role: 'region', 'aria-label': '搜索结果'}});
    this.results.addEventListener('scroll', () => this.cancelResultTouch?.(), {capture: true, passive: true});
    const modes = this.contentEl.createDiv({cls: 'bui-sidebar-search-modes', attr: {role: 'group', 'aria-label': '搜索范围'}});
    for (const mode of ['直接搜索', '标签', '书签', '文件列表'] as const) {
      const button = modes.createEl('button', {text: mode, attr: {'aria-pressed': String(mode === this.mode)}});
      this.modes.set(mode, button);
      // A category changes the results, not the input's focus. In particular,
      // do not focus the input afterwards: a dismissed keyboard must stay so.
      button.addEventListener('pointerdown', event => {if (event.button === 0) event.preventDefault();});
      button.addEventListener('mousedown', event => {if (event.button === 0) event.preventDefault();});
      button.addEventListener('click', () => {
        if (this.stopped) return;
        this.composing = false; this.mode = mode;
        // Retry unavailable sources, but a normal category tap reuses results.
        const key = this.resultsKey(), previous = this.cachedResults.get(key);
        if (previous?.retry) {this.discardResults(previous); this.renderedKey = undefined;}
        this.update();
      });
    }
    // Match visual and keyboard order on phones: categories, results, then the
    // search field immediately above the software keyboard. Desktop stays put.
    if (Platform.isPhone) this.contentEl.replaceChildren(modes, this.results, header);
    this.input.addEventListener('compositionstart', () => {this.composing = true;});
    this.input.addEventListener('compositionend', () => {this.composing = false; this.update(!this.choosing);});
    this.input.addEventListener('input', () => {if (!this.composing) this.update(!this.choosing);});
    const beginChoice = (event: Event) => {
      this.choosing = !!(event.target as HTMLElement | null)?.closest?.('button');
    };
    this.contentEl.addEventListener('pointerdown', event => {
      beginChoice(event);
      // Keep the keyboard/layout stable until the pressed result's click has
      // opened it. Cancelling pointer focus does not cancel touch scrolling.
      if (event.button === 0 && this.choosing && this.input === this.contentEl.ownerDocument.activeElement) event.preventDefault();
    });
    this.contentEl.addEventListener('touchstart', beginChoice, {passive: true});
    this.contentEl.addEventListener('mousedown', event => {
      if (event.button === 0 && (event.target as HTMLElement | null)?.closest?.('button') &&
          this.input === this.contentEl.ownerDocument.activeElement) event.preventDefault();
    });
    this.input.addEventListener('blur', event => {
      this.composing = false;
      // Do not replace a result between its pointerdown/focus and click.
      // The explicit action below commits the query and completes that choice.
      const button = (event.relatedTarget as HTMLElement | null)?.closest?.('button');
      this.update(!this.choosing && !button);
    });
    const finishChoice = () => {
      this.cancelResultTouch?.(); this.cancelResultTouch = undefined;
      this.choosing = false;
      if (!this.stopped && !this.composing) this.update();
    };
    this.contentEl.addEventListener('click', finishChoice);
    this.contentEl.addEventListener('pointercancel', finishChoice);
    this.contentEl.addEventListener('touchcancel', finishChoice);
    this.contentEl.addEventListener('keydown', event => {
      if (this.composing || event.isComposing) {
        if (event.key === 'Enter' || event.key === 'Escape') event.stopPropagation();
        return;
      }
      if (event.key === 'Escape') {event.preventDefault(); event.stopPropagation(); this.close();}
      else if (event.target === this.input && ['ArrowDown', 'Enter'].includes(event.key)) {
        event.preventDefault(); const first = this.results.querySelector<HTMLButtonElement>('.bui-sidebar-search-result');
        if (event.key === 'Enter') first?.click(); else first?.focus();
      }
    });
    this.render(); this.input.focus();
  }
  private update(render = true) {
    if (this.input.value !== this.publishedQuery) {
      this.publishedQuery = this.input.value;
      this.actions.changed(this.input.value);
    }
    if (render) this.render();
  }
  private resultsKey() {
    return JSON.stringify([this.mode, this.input.value.trim().toLocaleLowerCase(),
      this.mode === '文件列表' ? this.folder : '', this.mode === '标签' ? this.tag : '']);
  }
  private get pane() {return this.activeResults!.element;}
  private isLive(entry: SearchResults) {return !this.stopped && !this.cacheDirty && this.cachedResults.get(entry.key) === entry;}
  private discardResults(entry: SearchResults) {
    if (entry.timer !== undefined) this.contentEl.ownerDocument.defaultView?.clearTimeout(entry.timer);
    this.cachedResults.delete(entry.key);
  }
  private clearResults() {
    for (const entry of this.cachedResults.values()) this.discardResults(entry);
    this.activeResults = undefined; this.renderedKey = undefined;
  }
  private render() {
    if (this.stopped || this.opening) return;
    if (this.clearInput) this.clearInput.hidden = !this.input.value;
    const query = this.input.value.trim().toLocaleLowerCase();
    if (this.cachedQuery !== query || this.cacheDirty) {
      this.clearResults(); this.cachedQuery = query; this.cacheDirty = false;
    }
    const key = this.resultsKey();
    // Focus/keyboard events can finalize IME input, but an unchanged query
    // must retain its result nodes and any in-flight full-text search.
    if (key === this.renderedKey) return;
    this.renderedKey = key;
    if (this.activeResults) this.activeResults.scrollTop = this.results.scrollTop;
    for (const [mode, button] of this.modes) button.setAttribute('aria-pressed', String(mode === this.mode));
    const prompt = {'直接搜索': '搜索页面或正文', '标签': '搜索标签', '书签': '搜索书签', '文件列表': '搜索文件'}[this.mode];
    this.input.placeholder = `${prompt}…`; this.input.setAttribute('aria-label', prompt);
    const cached = this.cachedResults.get(key);
    if (cached) {
      this.cachedResults.delete(key); this.cachedResults.set(key, cached);
      this.activeResults = cached;
      this.results.replaceChildren(cached.element); this.results.scrollTop = cached.scrollTop;
      return;
    }
    // Only the active pane is attached; switching back preserves its nodes,
    // scroll position and in-flight work. Bound retained folder/tag history.
    const entry: SearchResults = {key, element: this.results.createDiv(), scrollTop: 0, retry: false};
    this.cachedResults.set(key, entry); this.activeResults = entry;
    while (this.cachedResults.size > 12) this.discardResults(this.cachedResults.values().next().value!);
    this.results.replaceChildren(entry.element); this.results.scrollTop = 0;
    if (this.mode === '标签') {this.renderTags(query); return;}
    if (this.mode === '书签') {void this.renderBookmarks(query, entry); return;}
    if (this.mode === '文件列表') {this.renderFiles(query); return;}
    const pages = this.actions.pages().filter(node => node.kind === 'page' && node.filePath && this.safePath(node.filePath));
    const titles = pages.filter(node => node.title.toLocaleLowerCase().includes(query));
    const section = this.pane.createEl('section', {cls: 'bui-sidebar-search-section'});
    section.createEl('h3', {text: `页面 · ${titles.length}`});
    for (const node of titles) this.pageButton(section, node);
    if (!query) {if (!titles.length) this.note('当前库没有可搜索的页面'); return;}
    const status = this.note('正在查找正文…');
    entry.timer = this.contentEl.ownerDocument.defaultView!.setTimeout(() => {
      void this.searchBodies(pages.filter(node => !titles.includes(node)), query, entry, status, titles.length);
    }, 140);
  }
  private note(text: string, host = this.pane) {return host.createEl('p', {cls: 'bui-sidebar-search-note', text});}
  private pageButton(host: HTMLElement, node: PageNode, detail = node.filePath, subpath?: string) {
    return this.choice(host, node.title, detail ?? '', () => {void this.openPage(node, subpath);});
  }
  private choice(host: HTMLElement, title: string, detail: string, choose: () => void, icon?: string) {
    const button = host.createEl('button', {cls: 'bui-sidebar-search-result'});
    const label = button.createSpan({cls: 'bui-sidebar-search-title'});
    if (icon) setIcon(label.createSpan({cls: 'bui-sidebar-search-kind'}), icon);
    label.append(title);
    if (detail) button.createSpan({cls: 'bui-sidebar-search-path', text: detail});
    // iOS may consume the compatibility click while dismissing a keyboard.
    // Activate a completed, stationary touch at pointerup, before that focus
    // transition. Scrolling, cancellation and long presses remain gestures.
    let press: {id: number; x: number; y: number; at: number} | undefined;
    let suppressTouchClick = false;
    button.addEventListener('pointerdown', event => {
      this.cancelResultTouch?.(); this.cancelResultTouch = undefined;
      suppressTouchClick = event.pointerType === 'touch';
      press = event.pointerType === 'touch' && event.isPrimary !== false && event.button === 0
        ? {id: event.pointerId, x: event.clientX, y: event.clientY, at: event.timeStamp} : undefined;
      if (press) this.cancelResultTouch = () => {press = undefined;};
    });
    button.addEventListener('pointermove', event => {
      if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) press = undefined;
    });
    button.addEventListener('pointercancel', () => {press = undefined;});
    button.addEventListener('pointerup', event => {
      const tap = press; press = undefined;
      if (!tap || tap.id !== event.pointerId || event.timeStamp - tap.at > 600 ||
          Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 10 || this.stopped) return;
      choose();
    });
    button.addEventListener('keydown', () => {suppressTouchClick = false;});
    button.addEventListener('click', () => {
      if (suppressTouchClick) {suppressTouchClick = false; return;}
      if (!this.stopped) choose();
    });
    return button;
  }
  private node(file: TFile, title?: string): PageNode {
    return {id: file.path, parent: file.parent?.path ?? '', title: title ?? file.basename, filePath: file.path,
      kind: file.extension === 'md' ? 'page' : 'attachment', children: []};
  }
  private async searchBodies(pages: PageNode[], query: string, entry: SearchResults, status: HTMLElement, titleCount: number) {
    const found: {node: PageNode; excerpt: string}[] = []; let cursor = 0, failed = 0;
    await Promise.all(Array.from({length: 4}, async () => {
      while (this.isLive(entry) && cursor < pages.length) {
        const node = pages[cursor++], file = this.app.vault.getAbstractFileByPath(node.filePath!);
        if (!(file instanceof TFile)) continue;
        try {
          const text = await this.app.vault.cachedRead(file), at = text.toLocaleLowerCase().indexOf(query);
          if (at >= 0) found.push({node, excerpt: text.slice(Math.max(0, at - 35), at + query.length + 95).replace(/\s+/g, ' ')});
        } catch {failed++;}
      }
    }));
    if (!this.isLive(entry)) return;
    status.remove();
    if (found.length) {
      const section = entry.element.createEl('section', {cls: 'bui-sidebar-search-section'});
      section.createEl('h3', {text: `正文 · ${found.length}`});
      for (const {node, excerpt} of found.sort((a, b) => a.node.filePath!.localeCompare(b.node.filePath!))) {
        const button = this.pageButton(section, node, excerpt);
        button.classList.add('is-body-match');
      }
    } else if (!titleCount) this.note('没有找到匹配的页面或正文', entry.element);
    if (failed) {entry.retry = true; this.note(`${failed} 篇笔记暂时无法读取`, entry.element);}
  }
  private renderTags(query: string) {
    const tags = new Map<string, PageNode[]>(); let pending = 0;
    for (const node of this.actions.pages()) {
      if (!node.filePath || node.kind !== 'page' || !this.safePath(node.filePath)) continue;
      const file = this.app.vault.getAbstractFileByPath(node.filePath); if (!(file instanceof TFile)) continue;
      const cache = this.app.metadataCache.getFileCache(file); if (!cache) {pending++; continue;}
      for (const tag of new Set(getAllTags(cache) ?? [])) {const list = tags.get(tag) ?? []; list.push(node); tags.set(tag, list);}
    }
    if (this.tag) {
      const selected = this.tag;
      this.back(selected, () => {this.tag = undefined; this.render();});
      const nodes = new Map<string, PageNode>();
      for (const [tag, pages] of tags) if (tag === selected || tag.startsWith(selected + '/'))
        for (const node of pages) nodes.set(node.id, node);
      for (const node of nodes.values()) if (node.title.toLocaleLowerCase().includes(query)) this.pageButton(this.pane, node);
      if (!nodes.size) this.note('此标签没有可用页面');
    } else {
      const visible = [...tags].filter(([tag]) => tag.toLocaleLowerCase().includes(query)).sort(([a], [b]) => a.localeCompare(b));
      for (const [tag, pages] of visible) this.choice(this.pane, tag, `${pages.length} 个页面`, () => {
        this.tag = tag; this.input.value = ''; this.update();
      }, 'tag');
      if (!visible.length) this.note(query ? '没有找到匹配的标签' : '笔记中还没有 #标签，可在正文或 tags 属性中添加。');
    }
    if (pending) {this.activeResults!.retry = true; this.note(`${pending} 篇笔记的标签索引尚未准备好，请稍后重试`);}
  }
  private back(label: string, action: () => void) {
    this.pane.createEl('button', {cls: 'bui-sidebar-search-back', text: '返回'}).addEventListener('click', action);
    this.pane.createDiv({cls: 'bui-sidebar-search-location', text: label});
  }
  private renderFiles(query: string) {
    const folder = this.folder ? this.app.vault.getAbstractFileByPath(this.folder) : this.app.vault.getRoot();
    if (!(folder instanceof TFolder)) {this.folder = ''; this.note('文件夹已不存在，请再次选择文件列表'); return;}
    if (this.folder) this.back(this.folder, () => {
      this.folder = folder.parent === this.app.vault.getRoot() ? '' : folder.parent?.path ?? ''; this.render();
    });
    const matches = (entry: TFile | TFolder): boolean => this.safePath(entry.path) && (!query || entry.name.toLocaleLowerCase().includes(query) ||
      entry instanceof TFolder && entry.children.some(child => (child instanceof TFile || child instanceof TFolder) && matches(child)));
    const entries = folder.children.filter((entry): entry is TFile | TFolder => (entry instanceof TFile || entry instanceof TFolder) && matches(entry))
      .sort((a, b) => Number(b instanceof TFolder) - Number(a instanceof TFolder) || a.name.localeCompare(b.name, 'zh-CN'));
    for (const entry of entries) {
      if (entry instanceof TFolder) this.choice(this.pane, entry.name, entry.path, () => {this.folder = entry.path; this.render();}, 'folder');
      else this.pageButton(this.pane, this.node(entry));
    }
    if (!entries.length) this.note(query ? '没有找到匹配的文件' : '这个文件夹是空的');
  }
  private safePath(path: string) {
    const configDir = this.app.vault.configDir;
    return safePath(path) && path !== configDir && !path.startsWith(`${configDir}/`);
  }
  private async renderBookmarks(query: string, entry: SearchResults) {
    const loading = this.note('正在读取书签…', entry.element), adapter = this.app.vault.adapter;
    try {
      const enabled: unknown = JSON.parse(await adapter.read(normalizePath(`${this.app.vault.configDir}/core-plugins.json`)));
      if (!this.isLive(entry)) return;
      if (!(Array.isArray(enabled) ? enabled.includes('bookmarks') : record(enabled) && enabled.bookmarks === true)) {
        entry.retry = true; loading.textContent = '尚未启用 Obsidian 核心书签；可在设置中启用。'; return;
      }
      const path = normalizePath(`${this.app.vault.configDir}/bookmarks.json`);
      const exists = await adapter.exists(path);
      if (!this.isLive(entry)) return;
      if (!exists) {loading.textContent = '还没有保存的书签'; return;}
      const saved: unknown = JSON.parse(await adapter.read(path));
      if (!this.isLive(entry)) return;
      if (!record(saved) || !Array.isArray(saved.items)) {entry.retry = true; loading.textContent = '此书签格式暂不支持；原文件未改动。'; return;}
      loading.remove(); let count = 0, visited = 0;
      const render = (items: unknown[], host: HTMLElement, depth: number) => {
        if (depth > 20) return;
        for (const item of items) {
          if (++visited > 2000) return;
          if (!record(item)) continue;
          const title = typeof item.title === 'string' ? item.title : '';
          if (item.type === 'group' && Array.isArray(item.items)) {
            const group = host.createEl('section', {cls: 'bui-sidebar-search-section'});
            group.createEl('h3', {text: title || '书签分组'}); render(item.items, group, depth + 1); continue;
          }
          const path = typeof item.path === 'string' ? item.path : '';
          const label = title || path || [item.query, item.url, item.type].find((value): value is string => typeof value === 'string') || '书签';
          if (query && !label.toLocaleLowerCase().includes(query)) continue;
          count++;
          const target = this.safePath(path) ? this.app.vault.getAbstractFileByPath(path) : null;
          if (item.type === 'file' && target instanceof TFile) this.pageButton(host, this.node(target, title || undefined), target.path,
            typeof item.subpath === 'string' && item.subpath.startsWith('#') ? item.subpath : undefined);
          else if (item.type === 'folder' && target instanceof TFolder) this.choice(host, label, '文件夹书签', () => {
            this.mode = '文件列表'; this.folder = target.path; this.input.value = ''; this.update();
          }, 'folder');
          else if (item.type === 'search' && typeof item.query === 'string') {
            const raw = item.query.trim(), text = /^"[^"\\]+"$/.test(raw) ? raw.slice(1, -1) : /^[^\s:[\](){}|"-]+$/.test(raw) && !/^(AND|OR|NOT)$/i.test(raw) ? raw : undefined;
            if (text) this.choice(host, label, '按文本搜索', () => {this.mode = '直接搜索'; this.input.value = text; this.update();}, 'search');
            else this.note(`${label} — 暂不支持此保存搜索的高级表达式`, host);
          } else if (item.type === 'url' && typeof item.url === 'string' && /^https?:\/\//i.test(item.url)) {
            host.createEl('a', {cls: 'bui-sidebar-search-result', text: label, attr: {href: item.url, target: '_blank', rel: 'noopener noreferrer'}});
          } else this.note(`${label} — ${item.type === 'file' || item.type === 'folder' ? '来源已不存在或不可用' : '暂不支持此书签类型'}`, host);
        }
      };
      render(saved.items, entry.element, 0);
      if (!count) this.note(query ? '没有找到匹配的书签' : '还没有保存的书签', entry.element);
      if (visited > 2000) this.note('书签过多，请在核心书签中整理后重试', entry.element);
    } catch {if (this.isLive(entry)) {entry.retry = true; loading.textContent = '书签暂时无法读取；原配置未改动。';}}
  }
  private async openPage(node: PageNode, subpath?: string) {
    if (this.stopped || this.opening) return;
    this.composing = false;
    this.opening = true;
    try {if (await this.actions.openPage(node, subpath) && !this.stopped) this.close();}
    finally {this.opening = false;}
  }
  onClose() {
    this.stopped = true;
    this.cancelResultTouch?.(); this.cancelResultTouch = undefined;
    this.containerEl.removeEventListener('pointerdown', this.dismissOutside);
    for (const dispose of this.sourceListeners.splice(0)) dispose();
    this.clearResults();
    if (this.input) this.update(false);
    this.actions.closed(); this.contentEl.replaceChildren();
  }
}
