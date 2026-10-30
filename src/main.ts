import {Plugin, TFile, Notice, MarkdownView, Component, Menu, Modal, setIcon} from 'obsidian';
import {compactLink, firstImage, isDueProperty, isEmpty, overdue, propertyName} from './model';
import {IdeaTables} from './idea-table';
import {IdeaColumnWidths} from './idea-widths';
import {IdeaHeaders} from './idea-header';
import {IdeaRowHeights} from './idea-row-heights';
import {IdeaTagEditors} from './idea-tag-editor';
import {PropertySuggestions} from './property-suggestions';
import {IdeaTitleEditors} from './idea-title-editor';

// Obsidian has no public decorator hook for its built-in Bases views.
// Keep this small, guarded adapter separate from the public file/metadata APIs.
// An unrecognised version/shape falls back to the unchanged native renderer.
type Native = any;
type Entry = {file: TFile; getValue: (prop: string) => Native};
type Group = {key: Native; entries: Entry[]};
const TABLE_IMAGE = '.workspace-leaf-content :is(td, th, .bases-table-cell) img';

export default class NebulaFocus extends Plugin {
  adapters = new Map<Native, Presentation>();
  private timer = 0;
  private observer?: MutationObserver;
  private active = true;
  private disposed = false;
  private imageCache = new Map<string, {mtime: number; image: string | null}>();
  private linkLabels = new Set<HTMLElement>();
  private metaButtons = new Map<HTMLElement, HTMLButtonElement>();
  private edgeEmbeds = new Set<HTMLElement>();
  private edgeRoots = new Set<HTMLElement>();
  private edgeObserver?: ResizeObserver;
  private factoryRestores: (() => void)[] = [];
  private tableImages = new Map<HTMLElement, Map<string, string | null>>();
  private imagePreview?: Modal;
  private ideaTables = new IdeaTables();
  private ideaWidths = new IdeaColumnWidths();
  private ideaRows = new IdeaRowHeights();
  private ideaHeaders?: IdeaHeaders;
  private ideaTags = new IdeaTagEditors();
  private ideaTitles = new IdeaTitleEditors();
  private propertySuggestions?: PropertySuggestions;
  private uiSettings: Record<string, any> = {};
  private settingsAvailable = true;
  private settingsWrite: Promise<void> = Promise.resolve();
  private attachmentThumbnails = new Map<HTMLElement, {image: HTMLImageElement; href: string; pill: HTMLElement}>();

  async onload() {
    try {
      const saved = await this.loadData();
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) this.uiSettings = saved;
    } catch {this.settingsAvailable = false;}
    if (this.disposed) return;
    this.ideaTags = new IdeaTagEditors({
      read: key => {
        const value = this.uiSettings.tagOptionOrder?.[key];
        return Array.isArray(value) && value.every(item => typeof item === 'string') ? value : undefined;
      },
      write: (key, values) => this.saveTagOrder(key, values),
    });
    this.propertySuggestions = new PropertySuggestions(this.app);
    document.body.classList.add('bui-enabled');
    this.edgeObserver = new ResizeObserver(() => this.schedule());
    this.addCommand({id: 'toggle-reading-ui', name: '切换 Notion-like / 原生外观',
      hotkeys: [{modifiers: ['Mod', 'Alt'], key: 'U'}], callback: () => {
      this.active = !this.active;
      document.body.classList.toggle('bui-enabled', this.active);
      if (!this.active) this.clearPresentation();
      this.schedule();
      this.app.workspace.trigger('css-change');
      new Notice(this.active ? '阅读优化已开启' : '已恢复原生外观');
    }});
    this.app.workspace.onLayoutReady(() => { if (this.disposed) return; this.installFactories(); this.scan(); });
    for (const event of ['layout-change', 'active-leaf-change', 'file-open'] as const)
      this.registerEvent(this.app.workspace.on(event as any, () => this.schedule()));
    this.registerEvent(this.app.metadataCache.on('changed', file => {
      this.imageCache.delete(file.path);
      for (const adapter of this.adapters.values()) adapter.invalidate();
      this.schedule();
    }));
    this.registerEvent(this.app.vault.on('rename', () => {this.imageCache.clear(); this.schedule();}));
    this.registerEvent(this.app.workspace.on('css-change', () => {this.ideaWidths.invalidate(); this.ideaRows.invalidate(); this.schedule();}));
    const fontsChanged = () => {this.ideaWidths.invalidate(); this.ideaRows.invalidate(); this.schedule();};
    document.fonts?.addEventListener('loadingdone', fontsChanged);
    this.register(() => document.fonts?.removeEventListener('loadingdone', fontsChanged));
    this.registerDomEvent(window, 'resize', () => this.schedule());
    this.registerDomEvent(document, 'focusin', () => this.schedule());
    this.registerDomEvent(document, 'input', () => this.schedule());
    // Replace press-and-hold zoom only on table thumbnails. Modified clicks
    // and image links keep their native navigation behaviour.
    this.registerDomEvent(document, 'mousedown', event => {
      if (this.tableImageTarget(event)) { event.preventDefault(); event.stopPropagation(); }
    }, true);
    this.registerDomEvent(document, 'click', event => {
      const img = this.tableImageTarget(event);
      if (!img) return;
      event.preventDefault(); event.stopPropagation();
      this.openTableImage(img);
    }, true);
    this.registerDomEvent(document, 'keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const img = this.tableImageTarget(event);
      if (!img) return;
      event.preventDefault(); event.stopPropagation();
      this.openTableImage(img);
    }, true);
    this.registerInterval(window.setInterval(() => {
      // Refresh deadline styling without replacing focused cards or images.
      for (const adapter of this.adapters.values()) adapter.refreshDeadlines();
      this.schedule();
    }, 60_000));
    this.observer = new MutationObserver(records => {
      if (records.some(r => {
        if (!(r.target instanceof Element)) return false;
        if (r.target.closest('.bui-presentation')) return false;
        return this.app.workspace.containerEl.contains(r.target) ||
          !!r.target.closest('.suggestion-container.mod-property-value') ||
          [...r.addedNodes, ...r.removedNodes].some(n => n instanceof Element && n.matches('.suggestion-container.mod-property-value'));
      })) this.schedule();
    });
    this.observer.observe(document.body, {childList: true, subtree: true});
  }

  private installFactories() {
    const registrations = (this.app as Native).internalPlugins?.plugins?.bases?.instance?.registrations;
    if (!registrations) return;
    for (const type of ['kanban', 'cards']) {
      const registration = registrations instanceof Map ? registrations.get(type) : registrations[type];
      if (!registration || typeof registration.factory !== 'function') continue;
      const original = registration.factory;
      const plugin = this;
      const wrapped = function(this: Native, ...args: Native[]) {
        const view = original.apply(this, args);
        plugin.attach(view);
        return view;
      };
      registration.factory = wrapped;
      this.factoryRestores.push(() => {if (registration.factory === wrapped) registration.factory = original;});
    }
  }

  schedule() {
    if (this.timer) return;
    this.timer = window.setTimeout(() => {this.timer = 0; this.scan();}, 70);
  }

  private saveTagOrder(key: string, values: string[]): Promise<void> {
    // Serialize explicit preference changes and preserve other plugin settings.
    // If loading failed, do not overwrite a settings file we could not read.
    const order = [...values];
    const write = this.settingsWrite.then(async () => {
      if (!this.settingsAvailable) throw new Error('Plugin settings unavailable');
      const next = {...this.uiSettings, tagOptionOrder: {...this.uiSettings.tagOptionOrder, [key]: order}};
      await this.saveData(next);
      this.uiSettings = next;
    });
    this.settingsWrite = write.catch(() => {});
    return write;
  }

  private scan() {
    if (!this.active) return;
    this.propertySuggestions?.refresh(document);
    // Native drag frames only need column positions; defer decoration and
    // content measurements until the resize adapter finishes the gesture.
    if (this.ideaRows.isResizing()) return;
    const seen = new Set<Native>();
    const visit = (component: Native, depth = 0) => {
      if (!component || seen.has(component) || depth > 14) return;
      seen.add(component);
      if (component.controller?.view) this.attach(component.controller.view);
      if (component.queryController && component.config) this.attach(component);
      for (const child of component._children ?? []) visit(child, depth + 1);
    };
    this.app.workspace.iterateAllLeaves(leaf => {
      visit(leaf.view);
      const el = leaf.view.containerEl;
      el.classList.toggle('bui-has-bases', !!el.querySelector('.bases-embed, .block-language-base'));
      if (leaf.view instanceof MarkdownView) this.decorateNote(leaf.view);
    });
    for (const [view, adapter] of this.adapters) {
      if (!view._loaded || !adapter.host.isConnected) { adapter.destroy(); this.adapters.delete(view); }
      else adapter.render();
    }
    this.ideaTables.refresh(document);
    this.ideaTitles.prune();
    this.ideaWidths.prune();
    this.ideaRows.prune();
    this.ideaHeaders?.prune();
    this.ideaTags.prune();
    this.decorateTables();
    this.decorateIdeaAttachments();
    this.decorateTableImages();
    for (const el of this.edgeRoots) if (!el.isConnected) {this.edgeObserver?.unobserve(el); this.edgeRoots.delete(el);}
    for (const el of this.edgeEmbeds) if (!el.isConnected) this.edgeEmbeds.delete(el);
  }

  attach(view: Native) {
    if (this.active && view?.type === 'table') {
      if (this.ideaWidths.refresh(view)) view.updateVirtualDisplay();
      if (this.ideaRows.refresh(view)) view.updateVirtualDisplay();
      (this.ideaHeaders ??= new IdeaHeaders(this.app)).attach(view);
      this.ideaTags.attach(view);
      this.ideaTitles.refresh(view);
      return;
    }
    if (!this.active || this.adapters.has(view) || !['kanban', 'cards'].includes(view?.type)) return;
    if (!(view.containerEl instanceof HTMLElement) || !(view.queryController?.viewContainerEl instanceof HTMLElement) ||
      typeof view.onDataUpdated !== 'function' || typeof view.config?.getOrder !== 'function') return;
    if (view.type === 'kanban' && (typeof view.moveCardToColumn !== 'function' || typeof view.canMoveCard !== 'function')) return;
    const adapter = new Presentation(this, view);
    this.adapters.set(view, adapter);
    view.register(() => {adapter.destroy(); this.adapters.delete(view);});
  }

  image(file: TFile): string | null {
    const cached = this.imageCache.get(file.path);
    if (cached?.mtime === file.stat.mtime) return cached.image;
    const image = firstImage(this.app.metadataCache.getFileCache(file)?.embeds, link =>
      this.app.metadataCache.getFirstLinkpathDest(link, file.path)?.path ?? null);
    const result = image && !/^https?:\/\//i.test(image)
      ? this.app.vault.getResourcePath(this.app.vault.getFileByPath(image)!) : image;
    this.imageCache.set(file.path, {mtime: file.stat.mtime, image: result});
    return result;
  }

  cover(entry: Entry, _view: Native): string | null {
    // Presentation derives its cover from content; no helper property is required.
    return this.image(entry.file);
  }

  private decorateNote(view: MarkdownView) {
    const root = view.containerEl;
    this.extendBasesToEdge(root);
    const h1 = root.querySelector<HTMLElement>('.markdown-preview-section h1');
    const inlineTitle = root.querySelector<HTMLElement>('.inline-title');
    root.querySelectorAll('.bui-duplicate-heading').forEach(el => el.classList.remove('bui-duplicate-heading'));
    if (h1 && inlineTitle && inlineTitle.offsetHeight > 0 &&
        h1.textContent?.trim() === inlineTitle.textContent?.trim()) h1.classList.add('bui-duplicate-heading');
    const metadata = root.querySelector<HTMLElement>('.metadata-container');
    if (metadata) {
      const reading = view.getMode() === 'preview';
      let count = 0;
      for (const row of metadata.querySelectorAll<HTMLElement>('.metadata-property[data-property-key]')) {
        const key = row.dataset.propertyKey ?? '';
        row.classList.toggle('bui-cover-property', reading && /^(封面|cover|banner)$/i.test(key));
        const auxiliary = reading && /^(notion_id|source_id)$/i.test(key);
        row.classList.toggle('bui-low-priority', auxiliary);
        if (auxiliary) count++;
      }
      let button = this.metaButtons.get(metadata);
      if (count && !button) {
        button = metadata.createEl('button', {cls:'bui-aux-toggle'});
        button.addEventListener('click', event => {
          event.preventDefault(); event.stopPropagation();
          metadata.classList.toggle('bui-show-aux');
          this.schedule();
        });
        this.metaButtons.set(metadata, button);
      }
      if (button) {
        button.hidden = !count;
        const expanded = metadata.classList.contains('bui-show-aux');
        const text = expanded ? '收起辅助属性' : `显示辅助属性（${count}）`;
        if (button.textContent !== text) button.textContent = text;
        button.setAttribute('aria-expanded', String(expanded));
      }
    }
  }

  private decorateTables() {
    for (const el of document.querySelectorAll<HTMLElement>('.bases-td[data-property]')) {
      const prop = el.dataset.property ?? '';
      const date = el.querySelector<HTMLInputElement>('input[type="date"], input[type="datetime-local"]');
      el.classList.toggle('bui-overdue', isDueProperty(prop) && overdue(date?.value ?? el.textContent?.trim()));
      const link = el.querySelector<HTMLElement>('.external-link, .metadata-link-inner');
      if (link && /^(视频链接|链接|url|website)$/i.test(propertyName(prop)) &&
          !el.contains(document.activeElement)) {
        const text = link.textContent ?? '';
        const label = compactLink(text);
        if (label) {
          // Keep the native editable value intact. A CSS pseudo-element is
          // display-only; focus reveals the original URL for normal editing.
          this.linkLabels.add(link);
          link.removeAttribute('data-bui-label');
          const size = link.ownerDocument.defaultView?.getComputedStyle(link).fontSize;
          if (size) link.style.setProperty('--bui-link-font-size', size);
          link.setAttribute('data-bui-label', label);
        } else {
          link.removeAttribute('data-bui-label');
          link.style.removeProperty('--bui-link-font-size');
          this.linkLabels.delete(link);
        }
      }
    }
    document.querySelectorAll<HTMLElement>('.metadata-property[data-property-key]').forEach(el => {
      const key = el.dataset.propertyKey ?? '';
      const date = el.querySelector<HTMLInputElement>('input[type="date"], input[type="datetime-local"]');
      el.classList.toggle('bui-overdue', isDueProperty(key) && overdue(date?.value));
    });
  }

  private tableImageTarget(event: MouseEvent | KeyboardEvent): HTMLImageElement | null {
    if (!this.active || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
        ('button' in event && event.button !== 0)) return null;
    const target = event.target;
    if (!(target instanceof Element) || !target.matches(TABLE_IMAGE) || target.closest('a[href]')) return null;
    return target as HTMLImageElement;
  }

  private decorateIdeaAttachments() {
    const seen = new Set<HTMLElement>();
    for (const link of document.querySelectorAll<HTMLElement>('.bui-ideas-base .bases-td[data-property="note.文件和媒体"] .multi-select-pill-content.internal-link[data-href]')) {
      const href = link.dataset.href ?? '';
      if (!/\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(href)) continue;
      const pill = link.parentElement;
      const file = this.app.vault.getFileByPath(href) ?? this.app.metadataCache.getFirstLinkpathDest(href, '');
      if (!pill || !file) continue;
      seen.add(link);
      const previous = this.attachmentThumbnails.get(link);
      if (previous?.href === href && previous.image.parentElement === pill) continue;
      if (previous) {previous.image.remove(); previous.pill.classList.remove('bui-attachment-with-thumb');}
      const image = document.createElement('img');
      image.className = 'bui-attachment-thumb';
      image.src = this.app.vault.getResourcePath(file);
      image.alt = href.split('/').pop() ?? '图片';
      image.draggable = false;
      pill.prepend(image); pill.classList.add('bui-attachment-with-thumb');
      this.attachmentThumbnails.set(link, {image, href, pill});
    }
    for (const [link, {image, pill}] of this.attachmentThumbnails) if (!seen.has(link)) {
      image.remove(); pill.classList.remove('bui-attachment-with-thumb'); this.attachmentThumbnails.delete(link);
    }
  }

  private decorateTableImages() {
    for (const [img, attributes] of this.tableImages) if (!img.isConnected) {
      for (const [name, value] of attributes) value === null ? img.removeAttribute(name) : img.setAttribute(name, value);
      this.tableImages.delete(img);
    }
    for (const img of document.querySelectorAll<HTMLImageElement>(TABLE_IMAGE)) {
      if (this.tableImages.has(img) || img.closest('a[href]')) continue;
      this.tableImages.set(img, new Map(['tabindex', 'role', 'aria-label', 'title'].map(name => [name, img.getAttribute(name)])));
      img.tabIndex = 0;
      img.setAttribute('role', 'button');
      img.setAttribute('aria-label', `放大图片：${img.alt || '图片'}`);
      img.title = '点击放大';
    }
  }

  private openTableImage(img: HTMLImageElement) {
    const src = img.currentSrc || img.src;
    if (!src) return;
    this.imagePreview?.close();
    img.focus({preventScroll: true});
    const modal = this.imagePreview = new Modal(this.app);
    modal.modalEl.classList.add('bui-image-preview');
    modal.modalEl.setAttribute('aria-label', `图片预览：${img.alt || '图片'}`);
    modal.contentEl.createEl('img', {attr: {src, alt: img.alt || '图片'}});
    modal.onClose = () => {
      modal.contentEl.replaceChildren();
      if (this.imagePreview === modal) this.imagePreview = undefined;
      if (img.isConnected) img.focus({preventScroll: true});
    };
    modal.open();
  }

  private extendBasesToEdge(root: HTMLElement) {
    for (const embed of root.querySelectorAll<HTMLElement>('.bases-embed, .block-language-base')) {
      const scroller = embed.closest<HTMLElement>('.markdown-preview-view, .cm-scroller');
      if (!scroller || !embed.getBoundingClientRect().width) continue;
      if (!this.edgeRoots.has(scroller)) {
        this.edgeRoots.add(scroller);
        this.edgeObserver?.observe(scroller);
      }
      // Measure against the unexpanded right edge to avoid a feedback loop.
      const previous = parseFloat(embed.style.getPropertyValue('--bui-right-bleed')) || 0;
      const originalRight = embed.getBoundingClientRect().right - previous;
      const paneRight = scroller.getBoundingClientRect().left + scroller.clientLeft + scroller.clientWidth;
      const bleed = `${Math.max(0, paneRight - originalRight).toFixed(2)}px`;
      embed.classList.add('bui-edge-to-pane');
      if (embed.style.getPropertyValue('--bui-right-bleed') !== bleed)
        embed.style.setProperty('--bui-right-bleed', bleed);
      this.edgeEmbeds.add(embed);
    }
  }

  private clearPresentation() {
    this.imagePreview?.close();
    this.propertySuggestions?.clear();
    this.ideaTags.clear();
    this.ideaTitles.clear();
    this.ideaTables.clear();
    this.ideaWidths.clear();
    this.ideaRows.clear();
    this.ideaHeaders?.clear();
    for (const {image, pill} of this.attachmentThumbnails.values()) {image.remove(); pill.classList.remove('bui-attachment-with-thumb');}
    this.attachmentThumbnails.clear();
    for (const [img, attributes] of this.tableImages)
      for (const [name, value] of attributes) value === null ? img.removeAttribute(name) : img.setAttribute(name, value);
    this.tableImages.clear();
    for (const adapter of this.adapters.values()) adapter.destroy();
    this.adapters.clear();
    for (const el of this.linkLabels) {
      el.removeAttribute('data-bui-label');
      el.style.removeProperty('--bui-link-font-size');
    }
    this.linkLabels.clear();
    for (const [metadata, button] of this.metaButtons) {button.remove(); metadata.classList.remove('bui-show-aux');}
    this.metaButtons.clear();
    document.querySelectorAll('.bui-duplicate-heading,.bui-overdue,.bui-has-bases,.bui-has-ideas,.bui-low-priority,.bui-cover-property').forEach(el =>
      el.classList.remove('bui-duplicate-heading','bui-overdue','bui-has-bases','bui-has-ideas','bui-low-priority','bui-cover-property'));
    for (const el of this.edgeEmbeds) {
      el.classList.remove('bui-edge-to-pane');
      el.style.removeProperty('--bui-right-bleed');
    }
    this.edgeEmbeds.clear();
    this.edgeObserver?.disconnect(); this.edgeRoots.clear();
  }

  onunload() {
    this.disposed = true;
    this.active = false;
    this.observer?.disconnect();
    window.clearTimeout(this.timer);
    for (const restore of this.factoryRestores) restore();
    this.clearPresentation();
    document.body.classList.remove('bui-enabled');
    this.app.workspace.trigger('css-change');
  }
}

class Presentation {
  host: HTMLElement;
  private native: HTMLElement;
  private el: HTMLElement;
  private original: Native;
  private wrapped: Native;
  private signature = '';
  private dead = false;
  private component = new Component();
  private dragged: Entry | null = null;
  private draggedGroup: Group | null = null;
  private originalHidden: boolean;

  constructor(private plugin: NebulaFocus, private view: Native) {
    this.host = view.queryController.viewContainerEl;
    this.native = view.containerEl;
    this.originalHidden = this.native.hidden;
    this.el = this.host.createDiv('bui-presentation');
    this.component.load();
    this.original = view.onDataUpdated;
    const adapter = this;
    this.wrapped = function(this: Native, ...args: Native[]) {
      adapter.signature = '';
      const result = adapter.original.apply(this, args);
      adapter.render();
      return result;
    };
    view.onDataUpdated = this.wrapped;
    this.el.addEventListener('keydown', event => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' &&
          !(event.target instanceof HTMLInputElement)) {
        const action = event.shiftKey ? view.redoTransaction : view.undoTransaction;
        if (typeof action === 'function') {event.preventDefault(); action.call(view);}
      }
    });
    this.render();
  }

  invalidate() {this.signature = '';}

  refreshDeadlines() {
    this.el.querySelectorAll<HTMLElement>('[data-bui-due]').forEach(field => {
      const past = overdue(field.dataset.buiDue, new Date(), field.dataset.buiStatus);
      field.classList.toggle('bui-overdue', past);
      field.title = past ? '已超过截止日期' : '';
    });
  }

  render() {
    if (this.dead || !this.view.data) return;
    const view = this.view;
    const groups: Group[] = view.type === 'kanban' ? view.orderedGroups : view.data.groupedData;
    // Preserve native behaviour for huge collections and unknown configuration.
    if (!Array.isArray(groups) || (view.data.data?.length ?? 0) > 500 ||
        (view.type === 'kanban' && !view.config.groupBy)) {
      this.native.hidden = this.originalHidden;
      this.el.hidden = true;
      return;
    }
    let signature: string;
    try {
      signature = JSON.stringify([view.config.getOrder(), view.config.get('image'), view.config.get('cardSize'),
        view.config.get('columnWidth'), groups.map(g => [g.key?.toString(), g.entries.map(e =>
          [e.file.path, e.file.stat.mtime, ...view.config.getOrder().map((p: string) => e.getValue(p)?.toString())])])]);
    } catch { this.fallback(); return; }
    if (signature === this.signature) return;
    this.signature = signature;
    try {
      this.native.hidden = true;
      this.el.hidden = false;
      this.component.unload(); this.component = new Component(); this.component.load();
      this.el.replaceChildren();
      this.el.classList.toggle('bui-board', view.type === 'kanban');
      this.el.classList.toggle('bui-gallery', view.type === 'cards');
      if (view.type === 'kanban') this.el.style.setProperty('--bui-column-width', `${Math.max(240, Math.min(360, Number(view.config.get('columnWidth')) || 260))}px`);
      else this.el.style.setProperty('--bui-card-size', `${Math.max(180, Math.min(360, Number(view.config.get('cardSize')) || 220))}px`);
      for (const group of groups) this.group(group);
      if (!groups.length) this.el.createDiv({cls: 'bui-empty', text: '当前视图没有记录'});
    } catch (error) {
      console.warn('Native Reading UI: native renderer retained', error);
      this.fallback();
    }
  }

  private group(group: Group) {
    const board = this.view.type === 'kanban';
    const section = this.el.createEl('section', {cls: board ? 'bui-column' : 'bui-gallery-group'});
    if (board || group.key?.toString()) {
      const heading = section.createDiv('bui-group-heading');
      heading.createEl('h3', {text: group.key?.toString() || '未设置'});
      heading.createSpan({cls: 'bui-count', text: String(group.entries.length)});
      if (board && !this.view.isReadOnly && typeof this.view.moveColumn === 'function') {
        heading.draggable = true;
        heading.addEventListener('dragstart', event => {
          if ((event.target as Element).closest('button')) {event.preventDefault(); return;}
          this.draggedGroup = group;
          event.dataTransfer?.setData('text/plain', group.key?.toString() || '');
          if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
        });
        heading.addEventListener('dragend', () => {this.draggedGroup = null;});
      }
      if (board && !this.view.isReadOnly && typeof this.view.createNoteInGroup === 'function') {
        const add = heading.createEl('button', {cls: 'bui-add clickable-icon', attr: {'aria-label': '在此列新建笔记'}});
        setIcon(add, 'plus');
        add.addEventListener('click', () => this.view.createNoteInGroup(group));
      }
    }
    const list = section.createDiv(board ? 'bui-column-cards' : 'bui-gallery-grid');
    for (const entry of group.entries) this.card(list, entry);
    if (board && !this.view.isReadOnly && typeof this.view.createNoteInGroup === 'function') {
      const add = section.createEl('button', {cls: 'bui-column-new', attr: {'aria-label': `在${group.key?.toString() || '未设置'}列新建笔记`}});
      setIcon(add.createSpan(), 'plus');
      add.createSpan({text: '新建'});
      add.addEventListener('click', () => this.view.createNoteInGroup(group));
    }
    if (board) {
      section.addEventListener('dragover', event => {
        if (!this.draggedGroup && (!this.dragged || !this.view.canMoveCard(this.dragged.file))) return;
        event.preventDefault(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
        section.classList.add('bui-drop-target');
      });
      section.addEventListener('dragleave', event => {
        if (!(event.relatedTarget instanceof Node) || !section.contains(event.relatedTarget)) section.classList.remove('bui-drop-target');
      });
      section.addEventListener('drop', event => {
        if (this.draggedGroup) {
          event.preventDefault();
          section.classList.remove('bui-drop-target');
          const moved = this.draggedGroup; this.draggedGroup = null;
          this.view.moveColumn(moved, this.view.orderedGroups.indexOf(group));
          return;
        }
        if (!this.dragged || !this.view.canMoveCard(this.dragged.file)) return;
        event.preventDefault();
        const entry = this.dragged; this.dragged = null;
        section.classList.remove('bui-drop-target');
        // Only an explicit user drop invokes the original native mutation.
        Promise.resolve(this.view.moveCardToColumn(entry.file, group.key))
          .catch((error: Error) => new Notice(error.message));
      });
    }
  }

  private card(parent: HTMLElement, entry: Entry) {
    const app = this.plugin.app;
    const board = this.view.type === 'kanban';
    const card = parent.createEl('article', {cls: 'bui-card'});
    card.dataset.path = entry.file.path;
    const cover = this.plugin.cover(entry, this.view);
    if (cover) {
      const image = card.createEl('img', {cls: 'bui-cover', attr: {
        src: cover, alt: entry.file.basename, loading: 'lazy', draggable: 'false',
      }});
      image.addEventListener('error', () => image.remove(), {once: true});
    }
    const content = card.createDiv('bui-card-content');
    const title = content.createEl('a', {cls: 'bui-card-title internal-link', text: entry.file.basename,
      attr: {href: entry.file.path, 'data-href': entry.file.path}});
    title.addEventListener('click', event => {
      event.preventDefault();
      app.workspace.openLinkText(entry.file.path, '', event.metaKey || event.ctrlKey);
    });
    card.addEventListener('click', event => {
      if ((event.target as Element).closest('a,button,input')) return;
      app.workspace.openLinkText(entry.file.path, '', event.metaKey || event.ctrlKey);
    });
    card.addEventListener('contextmenu', event => {
      event.preventDefault();
      const menu = new Menu();
      menu.addItem(item => item.setTitle('打开笔记').setIcon('file-text').onClick(() => app.workspace.openLinkText(entry.file.path, '')));
      menu.addItem(item => item.setTitle('在新标签页打开').setIcon('file-plus').onClick(() => app.workspace.openLinkText(entry.file.path, '', true)));
      app.workspace.trigger('file-menu', menu, entry.file, 'link-context-menu');
      menu.showAtMouseEvent(event);
    });
    if (board && this.view.canMoveCard(entry.file)) {
      card.draggable = true;
      card.addEventListener('dragstart', event => {
        this.dragged = entry;
        event.dataTransfer?.setData('text/plain', entry.file.path);
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      });
      card.addEventListener('dragend', () => {
        this.dragged = null;
        this.el.querySelectorAll('.bui-drop-target').forEach(el => el.classList.remove('bui-drop-target'));
      });
    }
    const fields = content.createDiv(board ? 'bui-card-fields' : 'bui-card-meta');
    const fm = app.metadataCache.getFileCache(entry.file)?.frontmatter ?? {};
    for (const prop of this.view.config.getOrder() as string[]) {
      if (prop === 'file.name') continue;
      let value: Native;
      try { value = entry.getValue(prop); } catch {continue;}
      const name = propertyName(prop);
      const raw = Object.prototype.hasOwnProperty.call(fm, name) ? fm[name]
        : (value?.data !== undefined ? value.data : value?.toString());
      if (!value || isEmpty(raw) || (raw === 'null' && value.data === undefined && !Object.prototype.hasOwnProperty.call(fm, name))) continue;
      const field = fields.createDiv('bui-field');
      field.dataset.property = name;
      const label = this.view.config.getDisplayName(prop);
      field.createSpan({cls: 'bui-field-label', text: label});
      const output = field.createDiv('bui-field-value');
      if (typeof value.renderTo === 'function') value.renderTo(output, (app as Native).renderContext);
      else output.textContent = value.toString();
      if (isDueProperty(prop)) {
        field.dataset.buiDue = String(fm[name] ?? value.data ?? value.toString());
        field.dataset.buiStatus = String(fm.状态 ?? fm.status ?? '');
        const past = overdue(field.dataset.buiDue, new Date(), field.dataset.buiStatus);
        field.classList.toggle('bui-overdue', past);
        if (past) field.title = '已超过截止日期';
      }
      if (name === '项目下一步') field.classList.add('bui-next-step');
      if (name === '项目摘要') field.classList.add('bui-summary');
    }
  }

  private fallback() {
    this.native.hidden = this.originalHidden;
    this.el.hidden = true;
    this.signature = '';
  }
  destroy() {
    if (this.dead) return;
    this.dead = true;
    if (this.view.onDataUpdated === this.wrapped) this.view.onDataUpdated = this.original;
    this.native.hidden = this.originalHidden;
    this.component.unload();
    this.el.remove();
    if (this.view._loaded && typeof this.view.updateVirtualDisplay === 'function') this.view.updateVirtualDisplay();
  }
}
