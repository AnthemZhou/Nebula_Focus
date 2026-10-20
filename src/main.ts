import {
  App, FileView, FuzzySuggestModal, MarkdownView, Menu, Modal, Notice, Platform, Plugin,
  PluginSettingTab, Setting, TFile, TFolder, WorkspaceLeaf, getLanguage, setIcon,
} from 'obsidian';
import { FocusPage } from './page';
import { childPath, DEFAULT_SETTINGS, FocusSettings, matchesQuery, parentPath, readSettings } from './model';
import { Libraries } from './library';
import { FormatGuide } from './format-guide';
import { unclosedEmphasisExtension } from './emphasis';

type Bar = { element: HTMLElement; edit: HTMLButtonElement; location: HTMLElement; observer: MutationObserver; page?: FocusPage };

export default class NebulaFocus extends Plugin {
  settings: FocusSettings = { ...DEFAULT_SETTINGS };
  paused = false;
  private disposed = false;
  private bars = new Map<MarkdownView, Bar>();
  private resumeButton?: HTMLButtonElement;
  private timers = new Set<number>();
  private editIntent = new Set<string>();
  private fileToken = 0;
  private navigator?: NavigatorModal;
  private dialogs = new Set<Modal>();
  libraries!: Libraries;
  private libraryBars = new Map<FileView, { element: HTMLElement; file: TFile }>();
  private rawViews = new WeakSet<MarkdownView>();
  private openedPaths = new WeakMap<MarkdownView, string>();
  private formatGuide?: FormatGuide;

  text(zh: string, en: string): string {
    const language = this.settings.language === 'auto' ? getLanguage() : this.settings.language;
    return language.startsWith('zh') ? zh : en;
  }

  enabled(): boolean { return !this.disposed && (!this.settings.mobileOnly || Platform.isMobile); }
  active(): boolean { return this.enabled() && !this.paused; }

  async onload(): Promise<void> {
    this.settings = readSettings(await this.loadData());
    this.libraries = new Libraries(this);
    this.registerEditorExtension(unclosedEmphasisExtension(view =>
      view.dom.ownerDocument === document && !!view.dom.closest('.nf-writing') &&
      !!view.dom.closest('.is-live-preview')));
    this.formatGuide = new FormatGuide({
      text: (zh, en) => this.text(zh, en),
      target: () => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        return this.active() && !this.settings.legacyPages && view?.getMode() === 'source' &&
          view.containerEl.ownerDocument === document && view.containerEl.classList.contains('nf-writing')
          ? view.containerEl : null;
      },
    });
    this.addSettingTab(new FocusSettingTab(this.app, this));
    this.addRibbonIcon('panel-left', 'Nebula Focus', () => this.openNavigator());
    this.addCommand({ id: 'open-navigator', name: 'Open compact navigator', callback: () => this.openNavigator() });
    this.addCommand({ id: 'open-libraries', name: 'Open libraries', callback: () => this.libraries.open() });
    this.addCommand({ id: 'toggle-focus', name: 'Toggle focused interface', callback: () => this.togglePause() });
    this.addCommand({ id: 'restore-native', name: 'Restore original interface', callback: () => this.setPaused(true) });
    this.addCommand({ id: 'open-home', name: 'Open home note', callback: () => { void this.openHome(); } });
    this.addCommand({ id: 'preferences', name: 'Open preferences', callback: () => this.openPreferences() });
    this.addCommand({ id: 'format-guide', name: 'Show formatting guide', checkCallback: checking => {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (!this.active() || this.settings.legacyPages || view?.getMode() !== 'source' ||
          !view.containerEl.classList.contains('nf-writing')) return false;
      if (!checking) this.formatGuide?.open();
      return true;
    } });
    this.addCommand({ id: 'toggle-edit', name: 'Toggle reading and editing',
      checkCallback: checking => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) return false;
        if (!checking) void this.toggleEditing(view);
        return true;
      },
    });
    this.registerEvent(this.app.workspace.on('active-leaf-change', () => this.refresh()));
    this.registerEvent(this.app.vault.on('modify', file => this.refresh(true,file.path)));
    this.registerEvent(this.app.workspace.on('layout-change', () => this.refresh()));
    this.registerEvent(this.app.workspace.on('file-open', file => this.onFileOpened(file)));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      void this.libraries.renamed(oldPath, file.path).catch(error => this.report(error));
      if (this.settings.homePath === oldPath) {
        this.settings.homePath = file.path;
        void this.saveSettings();
      }
    }));
    this.app.workspace.onLayoutReady(() => {
      if (this.disposed) return;
      this.refresh();
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (view?.file && !view.editor?.hasFocus()) this.onFileOpened(view.file);
    });
  }

  later(callback: () => void, delay = 50): void {
    const id = window.setTimeout(() => {
      this.timers.delete(id);
      if (!this.disposed) callback();
    }, delay);
    this.timers.add(id);
  }

  private onFileOpened(file: TFile | null): void {
    this.formatGuide?.close(false, true);
    const token = ++this.fileToken;
    this.refresh();
    if (!file || !this.active()) return;
    if (!this.settings.legacyPages) {
      this.later(() => {
        if (token !== this.fileToken || !this.active()) return;
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view?.file === file && !this.rawViews.has(view)) void this.setWritingMode(view);
      });
      return;
    }
    if (!this.settings.readingFirst) return;
    this.later(() => {
      if (token !== this.fileToken || !this.active() || this.editIntent.has(file.path)) return;
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      if (view?.file?.path === file.path && view.getMode() !== 'preview' && !view.editor?.hasFocus()) {
        void this.setMode(view, 'preview');
      }
    });
  }

  async setMode(view: MarkdownView, mode: 'source' | 'preview'): Promise<void> {
    try {
      if(mode==='source')this.bars.get(view)?.page?.suspend();
      await view.leaf.setViewState({ type: 'markdown', state: { ...view.getState(), mode } });
      this.refresh();
      if (mode === 'source') view.editor?.focus();
    } catch (error) { this.report(error); }
  }

  async toggleEditing(view: MarkdownView): Promise<void> {
    if (!this.settings.legacyPages) {
      await this.setWritingMode(view, !(this.rawViews.has(view) || view.getState().source === true), true);
      return;
    }
    await this.setMode(view, view.getMode() === 'preview' ? 'source' : 'preview');
  }

  async setWritingMode(view: MarkdownView, raw = false, focus = false): Promise<void> {
    try {
      if (raw) this.rawViews.add(view); else this.rawViews.delete(view);
      const state = view.getState();
      if (view.getMode() !== 'source' || state.source !== raw) {
        await view.leaf.setViewState({ type: 'markdown', state: { ...state, mode: 'source', source: raw } });
      }
      this.refresh();
      if (focus) view.editor?.focus();
    } catch (error) { this.report(error); }
  }

  refresh(force = false, modifiedPath?: string): void {
    if (this.disposed) return;
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    const alive = new Set<MarkdownView>();
    if (this.active()) this.app.workspace.iterateAllLeaves(leaf => {
      if (!(leaf.view instanceof MarkdownView) || !leaf.view.file) return;
      const view = leaf.view;
      // Keep pop-out windows native. All changes stay in this app document.
      if (view.containerEl.ownerDocument !== document) return;
      // The file-open event can arrive after openFile has resolved and after a
      // user changes mode. Observe identity here, before displaying controls.
      if (view.file && this.openedPaths.get(view) !== view.file.path) {
        this.openedPaths.set(view, view.file.path);
        this.rawViews.delete(view);
        view.containerEl.classList.remove('nf-show-properties');
      }
      alive.add(view);
      let bar = this.bars.get(view);
      if (bar && !view.containerEl.contains(bar.element)) {
        this.removeBar(view, bar);
        bar = undefined;
      }
      if (!bar) {
        bar = this.makeBar(view);
        this.bars.set(view, bar);
      }
      const editing = view.getMode() === 'source';
      bar.location.textContent = view.file?.path.replace(/\.md$/i, '') || '';
      bar.location.title = view.file?.path || '';
      if (bar.page) {
        bar.page.element.hidden = editing;
        if (!editing) void bar.page.update(force && modifiedPath!==view.file?.path).catch(error => this.report(error));
      }
      bar.edit.hidden = this.settings.legacyPages ? !editing : !(this.rawViews.has(view) || view.getState().source === true);
      const label = this.settings.legacyPages
        ? (editing ? this.text('返回页面', 'Page') : this.text('原文', 'Source'))
        : this.text('返回写作', 'Back to writing');
      if (bar.edit.textContent !== label) bar.edit.textContent = label;
      bar.edit.setAttribute('aria-label', label);
      view.containerEl.classList.toggle('nf-reading-view', !editing);
      view.containerEl.classList.toggle('nf-typography', this.settings.calmTypography);
      view.containerEl.classList.toggle('nf-writing', !this.settings.legacyPages && !this.rawViews.has(view) && view.getState().source !== true);
    });
    for (const [view, bar] of this.bars) if (!alive.has(view)) this.removeBar(view, bar);
    this.refreshLibraries();
    const hasReplacement = !!activeView && this.bars.has(activeView);
    document.body.classList.toggle('nf-active', this.active() && hasReplacement);
    document.body.classList.toggle('nf-quiet', this.active() && hasReplacement && this.settings.quietNavigation);
    document.body.classList.toggle('nf-reading', this.active() && hasReplacement && activeView?.getMode() === 'preview');
    this.syncResumeButton();
    this.formatGuide?.sync();
  }

  private makeBar(view: MarkdownView): Bar {
    const element = document.createElement('div');
    element.className = 'nf-bar';
    element.setAttribute('role', 'toolbar');
    element.setAttribute('aria-label', 'Nebula Focus');
    const left = element.createDiv('nf-bar-left');
    this.button(left, 'panel-left', this.text('笔记', 'Notes'), () => this.openNavigator(), true);
    if (!this.settings.legacyPages) this.button(left, 'library', this.text('资料库', 'Libraries'), () => this.libraries.open());
    if (this.settings.homePath) this.button(left, 'house', this.text('首页', 'Home'), () => { void this.openHome(); });
    const location = left.createSpan('nf-location');
    const right = element.createDiv('nf-bar-right');
    const edit = this.button(right, null, this.text('返回页面', 'Page'), () => { void this.toggleEditing(view); }, true);
    this.button(right, 'ellipsis', this.text('更多', 'More'), event => this.noteMenu(view, event));
    const page = this.settings.legacyPages ? new FocusPage(this.app, view) : undefined;
    if (page) this.button(right, 'sliders-horizontal', this.text('页面外观', 'Page appearance'), event => page.pageMenu(event));
    view.containerEl.prepend(element);
    view.containerEl.classList.add('nf-managed');
    const observer = new MutationObserver(mutations => {
      if (mutations.some(m => m.type === 'attributes' && m.target instanceof HTMLElement &&
          (m.target.matches('.markdown-reading-view, .markdown-source-view') || m.attributeName === 'data-mode'))) {
        this.refresh();
      }
    });
    observer.observe(view.containerEl, { subtree: true, attributes: true, attributeFilter: ['style', 'data-mode'] });
    return { element, edit, location, observer, page };
  }

  private removeBar(view: MarkdownView, bar: Bar): void {
    bar.page?.destroy();
    bar.observer.disconnect();
    bar.element.remove();
    view.containerEl.classList.remove('nf-managed', 'nf-reading-view', 'nf-typography', 'nf-writing', 'nf-show-properties');
    this.bars.delete(view);
  }

  button(parent: HTMLElement, icon: string | null, label: string,
    callback: (event: MouseEvent) => void, showLabel = false): HTMLButtonElement {
    const button = parent.createEl('button', { cls: 'nf-button', attr: { type: 'button', 'aria-label': label, title: label } });
    if (icon) {
      const glyph = button.createSpan('nf-icon');
      glyph.setAttribute('aria-hidden', 'true');
      setIcon(glyph, icon);
    }
    if (showLabel || !icon) button.createSpan({ text: label });
    button.addEventListener('click', callback);
    return button;
  }

  private noteMenu(view: MarkdownView, event: MouseEvent): void {
    const menu = new Menu().setUseNativeMenu(false);
    if (!this.settings.legacyPages) {
      if (view.getMode() === 'source' && view.containerEl.classList.contains('nf-writing')) {
        menu.addItem(i => i.setTitle(this.text('格式速查（长按 Shift）', 'Formatting guide (hold Shift)'))
          .setIcon('circle-help').onClick(() => this.formatGuide?.open()));
      }
      if (view.file) menu.addItem(i => i.setTitle(this.text('收录到资料库', 'Add to library')).setIcon('library').onClick(() => this.libraries.open(view.file!)));
      menu.addItem(i => i.setTitle(this.text('显示笔记属性', 'Show note properties')).setIcon('list')
        .setChecked(view.containerEl.classList.contains('nf-show-properties'))
        .onClick(() => view.containerEl.classList.toggle('nf-show-properties')));
      menu.addSeparator();
    }
    menu.addItem(i => i.setTitle(this.text('查看 Markdown 源码', 'View Markdown source')).setIcon('code').onClick(() => {
      void (this.settings.legacyPages ? this.setMode(view, 'source') : this.setWritingMode(view, true, true));
    }));
    menu.addItem(i => i.setTitle(this.text('搜索笔记', 'Search notes')).setIcon('search').onClick(() => this.openNavigator(true)));
    menu.addItem(i => i.setTitle(this.text('页内查找', 'Find in note')).setIcon('text-search').onClick(async () => {
      if (this.settings.legacyPages) await this.setMode(view, 'source');
      else await this.setWritingMode(view);
      view.showSearch();
    }));
    menu.addItem(i => i.setTitle(this.text('切换已打开的页面', 'Switch open pages')).setIcon('panels-top-left').onClick(() => this.openTabs()));
    if (view.file) menu.addItem(i => i.setTitle(this.text('将此笔记设为首页', 'Use this note as home')).setIcon('house').onClick(async () => {
      this.settings.homePath = view.file!.path;
      await this.saveSettings(true);
      new Notice(this.text('已设为首页', 'Home note set'));
    }));
    menu.addSeparator();
    menu.addItem(i => i.setTitle(this.text('界面偏好', 'Preferences')).setIcon('sliders-horizontal').onClick(() => this.openPreferences()));
    menu.addItem(i => i.setTitle(this.text('显示原界面和全部工具', 'Show original interface and all tools')).setIcon('layout-template').onClick(() => this.setPaused(true)));
    menu.showAtMouseEvent(event);
  }

  private openTabs(): void {
    const leaves: WorkspaceLeaf[] = [];
    this.app.workspace.iterateAllLeaves(leaf => {
      if (leaf.getRoot() === this.app.workspace.rootSplit && leaf.view.getViewType() !== 'empty') leaves.push(leaf);
    });
    const picker = new LeafPicker(this.app, leaves, leaf => { void this.app.workspace.revealLeaf(leaf); }, () => this.untrack(picker));
    this.track(picker).open();
  }

  track<T extends Modal>(modal: T): T { this.dialogs.add(modal); return modal; }
  untrack(modal: Modal): void { this.dialogs.delete(modal); }

  openNavigator(focusSearch = false): void {
    if (this.navigator) this.navigator.close();
    this.app.workspace.leftSplit?.collapse();
    const modal = new NavigatorModal(this, focusSearch);
    this.navigator = modal;
    this.track(modal).open();
  }
  navigatorClosed(modal: NavigatorModal): void {
    if (this.navigator === modal) this.navigator = undefined;
    this.untrack(modal);
  }

  async openFile(file: TFile, edit = false): Promise<void> {
    if (edit) this.editIntent.add(file.path);
    try {
      await this.app.workspace.getLeaf(false).openFile(file, file.extension !== 'md' ? {} : { state: this.settings.legacyPages ? {
        mode: edit ? 'source' : (this.settings.readingFirst ? 'preview' : undefined),
      } : { mode: 'source', source: false } });
      if (file.extension === 'base' && this.app.workspace.getMostRecentLeaf()?.view.getViewType() !== 'bases') {
        new Notice(this.text('请在 Obsidian 设置 → 核心插件中启用「数据库」，然后重新打开资料库。', 'Enable Bases in Obsidian Settings → Core plugins, then reopen this library.'));
      }
      if (edit) this.app.workspace.getActiveViewOfType(MarkdownView)?.editor.focus();
      this.refresh();
    } catch (error) { this.report(error); }
    finally { this.later(() => this.editIntent.delete(file.path), 250); }
  }

  async openHome(): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(this.settings.homePath);
    if (file instanceof TFile) await this.openFile(file);
    else {
      new Notice(this.text('请在界面偏好中选择一篇笔记作为首页。', 'Choose an existing home note in preferences.'));
      this.openPreferences();
    }
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.fileToken++;
    this.refresh();
  }
  togglePause(): void { this.setPaused(!this.paused); }

  private syncResumeButton(): void {
    if (this.paused && this.enabled()) {
      if (!this.resumeButton) {
        this.resumeButton = this.button(document.body, 'sparkles', this.text('恢复简洁界面', 'Resume focus'), () => this.setPaused(false), true);
        this.resumeButton.classList.add('nf-resume');
      }
    } else { this.resumeButton?.remove(); this.resumeButton = undefined; }
  }

  openPreferences(): void { this.track(new PreferencesModal(this)).open(); }

  async saveSettings(rebuild = false): Promise<void> {
    await this.saveData(this.settings);
    if (rebuild) for (const [view, bar] of this.bars) this.removeBar(view, bar);
    this.refresh();
  }

  private refreshLibraries(): void {
    const alive = new Set<FileView>();
    if (this.active()) this.app.workspace.iterateAllLeaves(leaf => {
      if (!(leaf.view instanceof FileView) || leaf.view.getViewType() !== 'bases' ||
          !leaf.view.file || leaf.view.containerEl.ownerDocument !== document) return;
      const view = leaf.view, file = view.file!;
      alive.add(view);
      const existing = this.libraryBars.get(view);
      if (existing?.file === file && existing.element.isConnected) return;
      if (existing) this.removeLibraryBar(view);
      const element = document.createElement('div');
      element.className = 'nf-bar';
      element.setAttribute('role', 'toolbar');
      element.setAttribute('aria-label', this.text('资料库导航', 'Library navigation'));
      const left = element.createDiv('nf-bar-left');
      this.button(left, 'panel-left', this.text('笔记', 'Notes'), () => this.openNavigator(), true);
      this.button(left, 'library', this.text('资料库', 'Libraries'), () => this.libraries.open());
      left.createSpan({ cls: 'nf-location', text: file.basename });
      const right = element.createDiv('nf-bar-right');
      view.containerEl.prepend(element);
      view.containerEl.classList.add('nf-managed');
      this.libraryBars.set(view, { element, file });
      void this.libraries.members(file).then(() => {
        if (!element.isConnected || this.libraryBars.get(view)?.element !== element) return;
        view.containerEl.classList.add('nf-library-managed');
        this.button(right, 'plus', this.text('收录笔记', 'Choose notes'), () => this.libraries.editMembers(file), true);
        this.button(right, 'ellipsis', this.text('资料库操作', 'Library actions'), event => {
          const menu = new Menu().setUseNativeMenu(false);
          menu.addItem(i => i.setTitle(this.text('新建笔记', 'New note')).setIcon('file-plus').onClick(() => this.libraries.askNewNote(file)));
          menu.addItem(i => i.setTitle(this.text('添加字段', 'Add field')).setIcon('list-plus').onClick(() => this.libraries.askField(file)));
          menu.addSeparator();
          menu.addItem(i => i.setTitle(this.text('显示原界面和全部工具', 'Show original interface and all tools')).setIcon('layout-template').onClick(() => this.setPaused(true)));
          menu.showAtMouseEvent(event);
        });
      }).catch(() => { /* Native bases retain their own controls. */ });
    });
    for (const view of this.libraryBars.keys()) if (!alive.has(view)) this.removeLibraryBar(view);
  }

  private removeLibraryBar(view: FileView): void {
    this.libraryBars.get(view)?.element.remove();
    this.libraryBars.delete(view);
    view.containerEl.classList.remove('nf-managed', 'nf-library-managed');
  }

  renderPreferences(container: HTMLElement): void {
    const t = (zh: string, en: string) => this.text(zh, en);
    new Setting(container).setName(t('仅在手机和平板启用', 'Mobile and tablet only'))
      .addToggle(v => v.setValue(this.settings.mobileOnly).onChange(async value => { this.settings.mobileOnly = value; await this.saveSettings(); }));
    new Setting(container).setName(t('旧版页面布局', 'Legacy page layout')).setDesc(t('兼容原来的封面、分栏和分区。默认关闭，使用连续写作。', 'Optional compatibility with covers, columns and sections. Continuous writing is the default.'))
      .addToggle(v => v.setValue(this.settings.legacyPages).onChange(async value => {
        this.settings.legacyPages = value; await this.saveSettings(true);
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (view) {
          if (value) await this.setMode(view, 'preview');
          else await this.setWritingMode(view);
        }
        container.empty(); this.renderPreferences(container);
      }));
    if (this.settings.legacyPages) new Setting(container).setName(t('默认阅读', 'Reading first')).setDesc(t('打开笔记时优先阅读；点击编辑后才输入。', 'Open notes in reading mode. Use Edit when you want to write.'))
      .addToggle(v => v.setValue(this.settings.readingFirst).onChange(async value => { this.settings.readingFirst = value; await this.saveSettings(); }));
    new Setting(container).setName(t('收起阅读时的底部导航', 'Hide navigation while reading')).setDesc(t('仅在替代工具栏已出现时生效；编辑时保留系统工具栏。', 'Only hidden when the replacement toolbar is mounted. Editing tools remain available.'))
      .addToggle(v => v.setValue(this.settings.quietNavigation).onChange(async value => { this.settings.quietNavigation = value; await this.saveSettings(); }));
    new Setting(container).setName(t('舒适阅读间距', 'Comfortable reading spacing'))
      .addToggle(v => v.setValue(this.settings.calmTypography).onChange(async value => { this.settings.calmTypography = value; await this.saveSettings(); }));
    new Setting(container).setName(t('首页笔记', 'Home note')).setDesc(this.settings.homePath || t('尚未设置；不会自动创建首页内容。', 'Not set. No home content is created automatically.'))
      .addButton(v => v.setButtonText(t('选择', 'Choose')).onClick(() => {
        const picker = new HomePicker(this.app, this.app.vault.getMarkdownFiles(), async file => {
          this.settings.homePath = file.path; await this.saveSettings(true);
          container.empty(); this.renderPreferences(container);
        }, () => this.untrack(picker));
        this.track(picker).open();
      }))
      .addExtraButton(v => v.setIcon('x').setTooltip(t('清除首页设置', 'Clear home note')).onClick(async () => {
        this.settings.homePath = ''; await this.saveSettings(true); container.empty(); this.renderPreferences(container);
      }));
    new Setting(container).setName(t('语言', 'Language')).addDropdown(v => v.addOptions({ auto: 'Automatic', zh: '简体中文', en: 'English' })
      .setValue(this.settings.language).onChange(async value => {
        this.settings.language = value as FocusSettings['language']; await this.saveSettings(true);
        container.empty(); this.renderPreferences(container);
      }));
    new Setting(container).setName(t('原界面', 'Original interface')).setDesc(t('临时恢复全部工具；禁用插件也会恢复原界面。', 'Temporarily restore all controls. Disabling the plugin also restores them.'))
      .addButton(v => v.setButtonText(t('显示原界面', 'Restore')).onClick(() => this.setPaused(true)));
    container.createEl('p', { cls: 'nf-help', text: t('v0.9.2 · 连续写作，按需整理。普通笔记不会自动添加属性。资料库需要启用 Obsidian 的数据库核心插件。', 'v0.9.2 · Continuous writing, optional libraries. Notes get no automatic properties. Libraries require the Obsidian Bases core plugin.') });
  }

  report(error: unknown): void {
    console.error('Nebula Focus:', error);
    new Notice(this.text('操作未完成，请重试。原始内容未被替换。', 'Action could not be completed. Please try again.'));
  }

  onunload(): void {
    this.disposed = true;
    this.formatGuide?.destroy();
    this.libraries?.stop();
    this.fileToken++;
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers.clear();
    for (const modal of this.dialogs) modal.close();
    this.dialogs.clear();
    for (const [view, bar] of this.bars) this.removeBar(view, bar);
    for (const view of this.libraryBars.keys()) this.removeLibraryBar(view);
    this.resumeButton?.remove();
    document.body.classList.remove('nf-active', 'nf-quiet', 'nf-reading');
  }
}

class FocusSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: NebulaFocus) { super(app, plugin); }
  display(): void { this.containerEl.empty(); this.plugin.renderPreferences(this.containerEl); }
}

class PreferencesModal extends Modal {
  constructor(private plugin: NebulaFocus) { super(plugin.app); }
  onOpen(): void {
    this.titleEl.setText(this.plugin.text('界面偏好', 'Preferences'));
    this.modalEl.classList.add('nf-dialog', 'nf-preferences');
    this.plugin.renderPreferences(this.contentEl);
  }
  onClose(): void { this.contentEl.empty(); this.plugin.untrack(this); }
}

class HomePicker extends FuzzySuggestModal<TFile> {
  constructor(app: App, private files: TFile[], private choose: (file: TFile) => void, private cleanup: () => void) {
    super(app); this.setPlaceholder('Home / 首页');
  }
  getItems(): TFile[] { return this.files; }
  getItemText(file: TFile): string { return file.path; }
  onChooseItem(file: TFile): void { this.choose(file); }
  onClose(): void { super.onClose(); this.cleanup(); }
}

class LeafPicker extends FuzzySuggestModal<WorkspaceLeaf> {
  constructor(app: App, private leaves: WorkspaceLeaf[], private choose: (leaf: WorkspaceLeaf) => void, private cleanup: () => void) { super(app); }
  getItems(): WorkspaceLeaf[] { return this.leaves; }
  getItemText(leaf: WorkspaceLeaf): string { return leaf.view.getDisplayText(); }
  onChooseItem(leaf: WorkspaceLeaf): void { this.choose(leaf); }
  onClose(): void { super.onClose(); this.cleanup(); }
}

class NameModal extends Modal {
  constructor(private plugin: NebulaFocus, private heading: string, private submit: (name: string) => Promise<void>) { super(plugin.app); }
  onOpen(): void {
    this.titleEl.setText(this.heading);
    this.modalEl.classList.add('nf-dialog');
    const form = this.contentEl.createEl('form', { cls: 'nf-name-form' });
    const input = form.createEl('input', { type: 'text', attr: { 'aria-label': this.heading, placeholder: this.heading, autocomplete: 'off' } });
    input.required = true;
    const error = form.createEl('p', { cls: 'nf-error', attr: { role: 'alert' } });
    const submit = form.createEl('button', { text: this.plugin.text('创建', 'Create'), cls: 'mod-cta', type: 'submit' });
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (submit.disabled) return;
      submit.disabled = true;
      void this.submit(input.value).then(() => this.close()).catch(() => {
        error.setText(this.plugin.text('无法创建：请检查名称，避免重名或包含 / 等路径符号。', 'Could not create. Use a unique name without path separators.'));
        submit.disabled = false;
      });
    });
    this.plugin.later(() => input.focus());
  }
  onClose(): void { this.contentEl.empty(); this.plugin.untrack(this); }
}

class NavigatorModal extends Modal {
  private folder = '';
  private query = '';
  private list!: HTMLElement;
  private crumb!: HTMLElement;
  private sort: 'name' | 'recent' = 'name';
  constructor(private plugin: NebulaFocus, private focusSearch: boolean) { super(plugin.app); }
  onOpen(): void {
    const t = (zh: string, en: string) => this.plugin.text(zh, en);
    this.titleEl.setText(t('笔记', 'Notes'));
    this.modalEl.classList.add('nf-dialog', 'nf-navigator');
    const header = this.contentEl.createDiv('nf-nav-actions');
    this.plugin.button(header, 'library', t('资料库', 'Libraries'), () => { this.close(); this.plugin.libraries.open(); }, true);
    if (this.plugin.settings.homePath) this.plugin.button(header, 'house', t('首页', 'Home'), () => { this.close(); void this.plugin.openHome(); }, true);
    this.plugin.button(header, 'plus', t('新建', 'New'), event => this.createMenu(event), true);
    this.plugin.button(header, 'ellipsis', t('更多', 'More'), event => this.moreMenu(event));
    const search = this.contentEl.createDiv('nf-search-field');
    const searchIcon = search.createSpan({ cls: 'nf-icon', attr: { 'aria-hidden': 'true' } });
    setIcon(searchIcon, 'search');
    const input = search.createEl('input', { cls: 'nf-search', type: 'search', attr: {
      placeholder: t('搜索笔记和文件夹', 'Search notes and folders'), 'aria-label': t('搜索笔记和文件夹', 'Search notes and folders'),
      autocapitalize: 'off', autocomplete: 'off',
    } });
    input.addEventListener('input', () => { this.query = input.value; this.render(); });
    this.crumb = this.contentEl.createDiv('nf-breadcrumb');
    this.list = this.contentEl.createDiv('nf-file-list');
    this.render();
    // Prevent the mobile keyboard from appearing before the user asks to search.
    this.plugin.later(() => {
      if (!this.modalEl.isConnected) return;
      if (this.focusSearch) input.focus();
      else { input.blur(); this.modalEl.tabIndex = -1; this.modalEl.focus({ preventScroll: true }); }
    }, 0);
  }

  private render(): void {
    const t = (zh: string, en: string) => this.plugin.text(zh, en);
    this.list.empty(); this.crumb.empty();
    const searching = !!this.query.trim();
    if (!searching && this.folder) this.plugin.button(this.crumb, 'arrow-left', t('上一级', 'Up'), () => { this.folder = parentPath(this.folder); this.render(); }, true);
    this.crumb.createSpan({ text: searching ? t('搜索结果', 'Search results') : (this.folder || t('全部笔记', 'All notes')) });
    const base = this.folder ? this.app.vault.getAbstractFileByPath(this.folder) : this.app.vault.getRoot();
    const items = searching ? this.app.vault.getAllLoadedFiles().filter(f => !!f.path && matchesQuery(f.path, this.query))
      : base instanceof TFolder ? [...base.children] : [];
    const readable = items.filter(f => f instanceof TFolder || (f instanceof TFile && ['md', 'base', 'canvas', 'pdf'].includes(f.extension)))
      .sort((a, b) => {
        if (a instanceof TFolder !== (b instanceof TFolder)) return a instanceof TFolder ? -1 : 1;
        if (this.sort === 'recent' && a instanceof TFile && b instanceof TFile) return b.stat.mtime - a.stat.mtime;
        return a.name.localeCompare(b.name, undefined, { numeric: true });
      });
    const status = this.list.createDiv({ cls: 'nf-sr-only', attr: { role: 'status', 'aria-live': 'polite' } });
    status.setText(`${readable.length} ${t('项', 'items')}`);
    if (!readable.length) this.list.createEl('p', { cls: 'nf-empty', text: searching ? t('没有找到匹配内容。', 'No matching notes.') : t('这里还没有笔记。点击新建开始。', 'No notes here yet. Use New to get started.') });
    for (const item of readable.slice(0, 150)) {
      const row = this.list.createEl('button', { cls: 'nf-file-row', type: 'button' });
      const icon = row.createSpan('nf-file-icon'); icon.setAttribute('aria-hidden', 'true');
      setIcon(icon, item instanceof TFolder ? 'folder' : item instanceof TFile && item.extension === 'base' ? 'table-2' : 'file-text');
      const copy = row.createSpan('nf-file-copy');
      copy.createSpan({ cls: 'nf-file-name', text: item instanceof TFile ? item.basename : item.name });
      if (searching) copy.createSpan({ cls: 'nf-file-path', text: item.path });
      row.addEventListener('click', () => {
        if (item instanceof TFolder) {
          this.folder = item.path; this.query = '';
          const input = this.contentEl.querySelector<HTMLInputElement>('.nf-search'); if (input) input.value = '';
          this.render();
        } else if (item instanceof TFile) { this.close(); void this.plugin.openFile(item); }
      });
    }
    if (readable.length > 150) this.list.createEl('p', { cls: 'nf-help', text: t('显示前 150 项，请搜索以缩小范围。', 'Showing 150 items. Search to narrow the results.') });
  }

  private createMenu(event: MouseEvent): void {
    const t = (zh: string, en: string) => this.plugin.text(zh, en);
    const menu = new Menu();
    menu.addItem(i => i.setTitle(t('新建笔记', 'New note')).setIcon('file-plus').onClick(() => this.askName(true)));
    menu.addItem(i => i.setTitle(t('新建文件夹', 'New folder')).setIcon('folder-plus').onClick(() => this.askName(false)));
    menu.showAtMouseEvent(event);
  }

  private askName(note: boolean): void {
    const folder = this.folder;
    const modal = new NameModal(this.plugin, note ? this.plugin.text('笔记名称', 'Note name') : this.plugin.text('文件夹名称', 'Folder name'), async name => {
      const path = childPath(folder, name, note);
      if (this.app.vault.getAbstractFileByPath(path)) throw new Error('already-exists');
      if (note) {
        const file = await this.app.vault.create(path, '');
        this.close(); await this.plugin.openFile(file, true);
      } else { await this.app.vault.createFolder(path); this.render(); }
    });
    this.plugin.track(modal).open();
  }

  private moreMenu(event: MouseEvent): void {
    const t = (zh: string, en: string) => this.plugin.text(zh, en);
    const menu = new Menu();
    menu.addItem(i => i.setTitle(t('按名称排序', 'Sort by name')).setChecked(this.sort === 'name').onClick(() => { this.sort = 'name'; this.render(); }));
    menu.addItem(i => i.setTitle(t('最近修改优先', 'Recently modified first')).setChecked(this.sort === 'recent').onClick(() => { this.sort = 'recent'; this.render(); }));
    menu.addSeparator();
    menu.addItem(i => i.setTitle(t('界面偏好', 'Preferences')).setIcon('sliders-horizontal').onClick(() => { this.close(); this.plugin.openPreferences(); }));
    menu.addItem(i => i.setTitle(t('原文件管理与全部工具', 'Original file manager and all tools')).setIcon('folder-open').onClick(() => {
      this.close(); this.plugin.setPaused(true); this.app.workspace.leftSplit.expand();
    }));
    menu.showAtMouseEvent(event);
  }
  onClose(): void { this.contentEl.empty(); this.plugin.navigatorClosed(this); }
}
