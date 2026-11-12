import {App, Modal, TFile, TFolder, getAllTags, normalizePath, setIcon} from 'obsidian';
import type {PageNode} from './page-tree';

interface SidebarSearchActions {
  query: string;
  pages(): PageNode[];
  changed(query: string): void;
  openPage(node: PageNode, subpath?: string): Promise<boolean>;
  closed(): void;
}

type SearchMode = '直接搜索' | '标签' | '书签' | '文件列表';
const safePath = (path: string) => !path.split('/').some(part => part.startsWith('.')) && path !== 'Nebula Views' && !path.startsWith('Nebula Views/');
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** All four modes stay inside this modal; the caller's sidebar is never replaced. */
export class SidebarSearchModal extends Modal {
  private input!: HTMLInputElement;
  private results!: HTMLElement;
  private composing = false;
  private choosing = false;
  private stopped = false;
  private opening = false;
  private mode: SearchMode = '直接搜索';
  private modes = new Map<SearchMode, HTMLButtonElement>();
  private folder = '';
  private tag?: string;
  private generation = 0;
  private searchTimer = 0;
  constructor(app: App, private actions: SidebarSearchActions) {super(app);}
  onOpen() {
    this.stopped = false;
    this.modalEl.classList.add('bui-sidebar-search-modal');
    this.contentEl.replaceChildren();
    const header = this.contentEl.createDiv({cls: 'bui-sidebar-search-header'});
    this.input = header.createEl('input', {cls: 'bui-sidebar-search-input', type: 'search', placeholder: '搜索页面…',
      attr: {'aria-label': '搜索页面', autocomplete: 'off'}});
    this.input.value = this.actions.query;
    header.createEl('button', {cls: 'bui-sidebar-search-cancel', text: '取消'}).addEventListener('click', () => this.close());
    const modes = this.contentEl.createDiv({cls: 'bui-sidebar-search-modes', attr: {role: 'group', 'aria-label': '搜索范围'}});
    for (const mode of ['直接搜索', '标签', '书签', '文件列表'] as const) {
      const button = modes.createEl('button', {text: mode, attr: {'aria-pressed': String(mode === this.mode)}});
      this.modes.set(mode, button);
      button.addEventListener('click', () => {if (!this.stopped) {this.composing = false; this.mode = mode; this.update();}});
    }
    this.results = this.contentEl.createDiv({cls: 'bui-sidebar-search-results'});
    this.input.addEventListener('compositionstart', () => {this.composing = true;});
    this.input.addEventListener('compositionend', () => {this.composing = false; this.update(!this.choosing);});
    this.input.addEventListener('input', () => {if (!this.composing) this.update(!this.choosing);});
    this.contentEl.addEventListener('pointerdown', event => {
      this.choosing = !!(event.target as HTMLElement | null)?.closest?.('button');
    });
    this.input.addEventListener('blur', event => {
      this.composing = false;
      // Do not replace a result between its pointerdown/focus and click.
      // The explicit action below commits the query and completes that choice.
      const button = (event.relatedTarget as HTMLElement | null)?.closest?.('button');
      this.update(!this.choosing && !button);
    });
    const finishChoice = () => {
      this.choosing = false;
      if (!this.stopped && !this.composing) this.update();
    };
    this.contentEl.addEventListener('click', finishChoice);
    this.contentEl.addEventListener('pointercancel', finishChoice);
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
  private update(render = true) {this.actions.changed(this.input.value); if (render) this.render();}
  private render() {
    if (this.stopped) return;
    const generation = ++this.generation;
    this.contentEl.ownerDocument.defaultView?.clearTimeout(this.searchTimer);
    this.results.replaceChildren();
    for (const [mode, button] of this.modes) button.setAttribute('aria-pressed', String(mode === this.mode));
    const prompt = {'直接搜索': '搜索页面或正文', '标签': '搜索标签', '书签': '搜索书签', '文件列表': '搜索文件'}[this.mode];
    this.input.placeholder = `${prompt}…`; this.input.setAttribute('aria-label', prompt);
    const query = this.input.value.trim().toLocaleLowerCase();
    if (this.mode === '标签') {this.renderTags(query); return;}
    if (this.mode === '书签') {void this.renderBookmarks(query, generation); return;}
    if (this.mode === '文件列表') {this.renderFiles(query); return;}
    const pages = this.actions.pages().filter(node => node.kind === 'page' && node.filePath && this.safePath(node.filePath));
    const titles = pages.filter(node => node.title.toLocaleLowerCase().includes(query));
    const section = this.results.createEl('section', {cls: 'bui-sidebar-search-section'});
    section.createEl('h3', {text: `页面 · ${titles.length}`});
    for (const node of titles) this.pageButton(section, node);
    if (!query) {if (!titles.length) this.note('当前库没有可搜索的页面'); return;}
    const status = this.note('正在查找正文…');
    this.searchTimer = this.contentEl.ownerDocument.defaultView!.setTimeout(() => {
      void this.searchBodies(pages.filter(node => !titles.includes(node)), query, generation, status, titles.length);
    }, 140);
  }
  private note(text: string, host = this.results) {return host.createEl('p', {cls: 'bui-sidebar-search-note', text});}
  private pageButton(host: HTMLElement, node: PageNode, detail = node.filePath, subpath?: string) {
    return this.choice(host, node.title, detail ?? '', () => {void this.openPage(node, subpath);});
  }
  private choice(host: HTMLElement, title: string, detail: string, choose: () => void, icon?: string) {
    const button = host.createEl('button', {cls: 'bui-sidebar-search-result'});
    const label = button.createSpan({cls: 'bui-sidebar-search-title'});
    if (icon) setIcon(label.createSpan({cls: 'bui-sidebar-search-kind'}), icon);
    label.append(title);
    if (detail) button.createSpan({cls: 'bui-sidebar-search-path', text: detail});
    button.addEventListener('click', () => {if (!this.stopped) choose();}); return button;
  }
  private node(file: TFile, title?: string): PageNode {
    return {id: file.path, parent: file.parent?.path ?? '', title: title ?? file.basename, filePath: file.path,
      kind: file.extension === 'md' ? 'page' : 'attachment', children: []};
  }
  private async searchBodies(pages: PageNode[], query: string, generation: number, status: HTMLElement, titleCount: number) {
    const found: {node: PageNode; excerpt: string}[] = []; let cursor = 0, failed = 0;
    await Promise.all(Array.from({length: 4}, async () => {
      while (!this.stopped && generation === this.generation && cursor < pages.length) {
        const node = pages[cursor++], file = this.app.vault.getAbstractFileByPath(node.filePath!);
        if (!(file instanceof TFile)) continue;
        try {
          const text = await this.app.vault.cachedRead(file), at = text.toLocaleLowerCase().indexOf(query);
          if (at >= 0) found.push({node, excerpt: text.slice(Math.max(0, at - 35), at + query.length + 95).replace(/\s+/g, ' ')});
        } catch {failed++;}
      }
    }));
    if (this.stopped || generation !== this.generation) return;
    status.remove();
    if (found.length) {
      const section = this.results.createEl('section', {cls: 'bui-sidebar-search-section'});
      section.createEl('h3', {text: `正文 · ${found.length}`});
      for (const {node, excerpt} of found.sort((a, b) => a.node.filePath!.localeCompare(b.node.filePath!)))
        this.pageButton(section, node, excerpt);
    } else if (!titleCount) this.note('没有找到匹配的页面或正文');
    if (failed) this.note(`${failed} 篇笔记暂时无法读取`);
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
      for (const node of nodes.values()) if (node.title.toLocaleLowerCase().includes(query)) this.pageButton(this.results, node);
      if (!nodes.size) this.note('此标签没有可用页面');
    } else {
      const visible = [...tags].filter(([tag]) => tag.toLocaleLowerCase().includes(query)).sort(([a], [b]) => a.localeCompare(b));
      for (const [tag, pages] of visible) this.choice(this.results, tag, `${pages.length} 个页面`, () => {
        this.tag = tag; this.input.value = ''; this.update();
      }, 'tag');
      if (!visible.length) this.note(query ? '没有找到匹配的标签' : '笔记中还没有 #标签，可在正文或 tags 属性中添加。');
    }
    if (pending) this.note(`${pending} 篇笔记的标签索引尚未准备好，请稍后重试`);
  }
  private back(label: string, action: () => void) {
    this.results.createEl('button', {cls: 'bui-sidebar-search-back', text: '返回'}).addEventListener('click', action);
    this.results.createDiv({cls: 'bui-sidebar-search-location', text: label});
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
      if (entry instanceof TFolder) this.choice(this.results, entry.name, entry.path, () => {this.folder = entry.path; this.render();}, 'folder');
      else this.pageButton(this.results, this.node(entry));
    }
    if (!entries.length) this.note(query ? '没有找到匹配的文件' : '这个文件夹是空的');
  }
  private safePath(path: string) {
    const configDir = this.app.vault.configDir;
    return safePath(path) && path !== configDir && !path.startsWith(`${configDir}/`);
  }
  private async renderBookmarks(query: string, generation: number) {
    const loading = this.note('正在读取书签…'), adapter = this.app.vault.adapter;
    try {
      const enabled: unknown = JSON.parse(await adapter.read(normalizePath(`${this.app.vault.configDir}/core-plugins.json`)));
      if (this.stopped || generation !== this.generation) return;
      if (!(Array.isArray(enabled) ? enabled.includes('bookmarks') : record(enabled) && enabled.bookmarks === true)) {
        loading.textContent = '尚未启用 Obsidian 核心书签；可在设置中启用。'; return;
      }
      const path = normalizePath(`${this.app.vault.configDir}/bookmarks.json`);
      if (!await adapter.exists(path)) {loading.textContent = '还没有保存的书签'; return;}
      const saved: unknown = JSON.parse(await adapter.read(path));
      if (this.stopped || generation !== this.generation) return;
      if (!record(saved) || !Array.isArray(saved.items)) {loading.textContent = '此书签格式暂不支持；原文件未改动。'; return;}
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
      render(saved.items, this.results, 0);
      if (!count) this.note(query ? '没有找到匹配的书签' : '还没有保存的书签');
      if (visited > 2000) this.note('书签过多，请在核心书签中整理后重试');
    } catch {if (!this.stopped && generation === this.generation) loading.textContent = '书签暂时无法读取；原配置未改动。';}
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
    this.generation++; this.contentEl.ownerDocument.defaultView?.clearTimeout(this.searchTimer);
    if (this.input) this.actions.changed(this.input.value);
    this.actions.closed(); this.contentEl.replaceChildren();
  }
}
