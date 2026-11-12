import {Component, FuzzySuggestModal, ItemView, MarkdownRenderer, Notice, Platform, Plugin, TFile, WorkspaceTabs, setIcon, type WorkspaceLeaf} from 'obsidian';
import {formatReminderDate, noteReminders, readReminderPreferences, reminderDay, reminderSections, reminderTitle, sortReminders, type Reminder, type ReminderPreferences} from './reminder-model';
import type {RightWorkspaceController} from './right-workspace';

export const REMINDERS_VIEW = 'nebula-reminders';
export class RemindersController extends Component {
  preferences: ReminderPreferences;
  readonly views = new Set<RemindersView>();
  private stopped = false;
  private enabled: boolean;
  private timer = 0;
  private generation = 0;
  private opening?: Promise<void>;
  private writes: Promise<unknown> = Promise.resolve();
  private cache = new Map<string, {stamp: string; rows: Reminder[]}>();
  rows: Reminder[] = [];
  error = '';
  loading = true;
  constructor(readonly plugin: Plugin, initial: unknown, private save: (state: ReminderPreferences) => Promise<void>,
    readonly navigation: RightWorkspaceController, enabled: boolean, private coldStart: boolean) {
    super(); this.preferences = readReminderPreferences(initial); this.enabled = enabled;
  }
  get app() {return this.plugin.app;}
  onload() {
    this.plugin.registerView(REMINDERS_VIEW, leaf => new RemindersView(leaf, this));
    this.plugin.addCommand({id: 'open-reminders', name: '打开提醒事项', checkCallback: checking => {
      if (!this.enabled) return false; if (!checking) void this.open(); return true;
    }});
    this.registerEvent(this.app.metadataCache.on('changed', file => {this.invalidate(file.path);}));
    this.registerEvent(this.app.metadataCache.on('resolved', () => this.invalidate()));
    this.registerEvent(this.app.vault.on('delete', file => {this.invalidate(file.path); this.refreshDatabaseSource(file.path);}));
    this.registerEvent(this.app.vault.on('create', file => this.refreshDatabaseSource(file.path)));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      this.invalidate(oldPath);
      if (this.preferences.databases.includes(oldPath)) void this.update(state => ({...state, databases: state.databases.map(path => path === oldPath ? file.path : path)}));
    }));
    this.registerInterval(window.setInterval(() => this.schedule(), 60_000));
    this.app.workspace.onLayoutReady(() => {
      if (this.stopped) return;
      if (this.enabled && this.coldStart && this.preferences.openOnStartup) void this.open();
      this.schedule();
    });
  }
  open(): Promise<void> {
    if (this.stopped || !this.enabled) return Promise.resolve();
    if (this.opening) return this.opening;
    this.opening = this.openView().catch(error => {console.error('[Nebula Focus] 提醒事项未能打开', error); new Notice('提醒事项未能打开，请重试');})
      .finally(() => {this.opening = undefined;});
    return this.opening;
  }
  private async openView() {
    const workspace = this.app.workspace, roots: WorkspaceLeaf[] = [];
    // Workspace traversal stops when its callback returns a truthy value.
    // Array.push() would return a count and hide every tab after the first.
    workspace.iterateRootLeaves(leaf => {roots.push(leaf);});
    let leaf = roots.find(item => item.getViewState().type === REMINDERS_VIEW);
    if (!leaf) {
      const first = roots.find(item => item.getContainer() === workspace.rootSplit);
      leaf = !Platform.isMobileApp && first?.parent instanceof WorkspaceTabs
        ? workspace.createLeafInParent(first.parent, roots.filter(item => item.parent === first.parent).length)
        : workspace.getLeaf('tab');
      await leaf.setViewState({type: REMINDERS_VIEW, active: false});
    } else {
      // Background tabs are restored lazily. Let Obsidian load its existing
      // view before deciding whether a stale plugin instance needs replacing.
      if (leaf.isDeferred) await leaf.loadIfDeferred();
      if (this.stopped || leaf.getViewState().type !== REMINDERS_VIEW) return;
      if (!(leaf.view instanceof RemindersView && leaf.view.host === this)) {
        await leaf.setViewState({type: 'empty', active: false});
        if (this.stopped || leaf.getViewState().type !== 'empty') return;
        await leaf.setViewState({type: REMINDERS_VIEW, active: false});
      }
    }
    if (!this.stopped && this.enabled && leaf.getViewState().type === REMINDERS_VIEW) {
      await workspace.revealLeaf(leaf);
      if (Platform.isMobileApp) workspace.leftSplit.collapse();
      this.schedule();
    }
  }
  setEnabled(value: boolean) {this.enabled = value; if (value) this.schedule();}
  setOpenOnStartup(value: boolean) {return this.update(state => ({...state, openOnStartup: value}));}
  private invalidate(path?: string) {
    this.generation++;
    if (path) this.cache.delete(path); else this.cache.clear();
    this.schedule();
  }
  private refreshDatabaseSource(path: string) {
    if (this.preferences.databases.includes(path)) for (const view of this.views) view.renderDatabases(true);
  }
  private schedule() {
    if (this.stopped || !this.enabled || this.timer || !this.views.size) return;
    this.timer = window.setTimeout(() => {this.timer = 0; void this.refresh();}, 120);
  }
  requestRefresh() {this.schedule();}
  async refresh() {
    const generation = ++this.generation, files = this.app.vault.getMarkdownFiles(), rows: Reminder[] = [];
    let cursor = 0, failed = 0;
    await Promise.all(Array.from({length: 4}, async () => {
      while (cursor < files.length && !this.stopped) {
        const file = files[cursor++], cache = this.app.metadataCache.getFileCache(file);
        if (!cache) continue;
        const stamp = `${file.stat.mtime}:${file.stat.size}`, hit = this.cache.get(file.path);
        if (hit?.stamp === stamp) {rows.push(...hit.rows); continue;}
        try {
          const needsText = cache.listItems?.some(item => item.task === ' ');
          const found = noteReminders(file.path, file.basename, needsText ? await this.app.vault.cachedRead(file) : '', cache);
          if (this.stopped || generation !== this.generation) return;
          this.cache.set(file.path, {stamp, rows: found}); rows.push(...found);
        } catch {failed++;}
      }
    }));
    if (this.stopped || generation !== this.generation) return;
    const paths = new Set(files.map(file => file.path));
    for (const path of this.cache.keys()) if (!paths.has(path)) this.cache.delete(path);
    this.rows = sortReminders(rows); this.loading = false;
    this.error = failed ? `${failed} 篇笔记暂时无法读取，其余提醒已显示。` : '';
    for (const view of this.views) view.renderReminders();
  }
  update(change: (state: ReminderPreferences) => ReminderPreferences): Promise<boolean> {
    const work = this.writes.then(async () => {
      if (this.stopped) return false;
      const next = readReminderPreferences(change(this.preferences)); await this.save(next);
      this.preferences = next; if (!this.stopped) for (const view of this.views) view.renderDatabases(); return true;
    }).catch(error => {console.error('[Nebula Focus] 提醒事项设置未保存', error); new Notice('提醒事项设置未保存，请重试'); return false;});
    this.writes = work; return work;
  }
  chooseDatabase() {
    if (this.preferences.databases.length >= 24) {new Notice('已添加 24 个数据库，请先移除不需要的视图'); return;}
    new ReminderDatabasePicker(this.plugin, file => {void this.update(state => ({...state, databases: [...state.databases, file.path]}));}, this.preferences.databases).open();
  }
  async openReminder(row: Reminder, source: HTMLElement, event: MouseEvent) {
    const file = this.app.vault.getFileByPath(row.path); if (!file) return;
    const leaf = await this.navigation.openFileFromElement(file, source, event);
    if (row.line !== undefined && leaf?.getViewState().state?.file === row.path) leaf.setEphemeralState({line: row.line, focus: true});
  }
  onunload() {this.stopped = true; this.generation++; window.clearTimeout(this.timer); this.cache.clear();}
}

export class RemindersView extends ItemView {
  private expanded = new Map<string, boolean>();
  private list?: HTMLElement;
  private databases?: HTMLElement;
  private databaseComponent?: Component;
  private databaseSignature = '';
  constructor(leaf: WorkspaceLeaf, readonly host: RemindersController) {super(leaf);}
  getViewType() {return REMINDERS_VIEW;}
  getDisplayText() {return '提醒事项';}
  getIcon() {return 'list-todo';}
  async onOpen() {
    this.databaseSignature = '';
    this.contentEl.classList.add('nf-reminders'); this.contentEl.replaceChildren(); this.host.views.add(this);
    const header = this.contentEl.createDiv({cls: 'nf-reminders-header'});
    header.createEl('h1', {text: '提醒事项'});
    header.createEl('button', {text: '添加数据库'}).addEventListener('click', () => this.host.chooseDatabase());
    this.contentEl.createEl('p', {cls: 'nf-reminders-description', text: '来自笔记中的未完成任务与截止日期。点开来源继续处理。'});
    this.list = this.contentEl.createDiv({cls: 'nf-reminders-list'});
    this.databases = this.contentEl.createDiv({cls: 'nf-reminder-databases'});
    this.renderReminders(); this.renderDatabases(); this.host.requestRefresh();
  }
  renderReminders() {
    if (!this.list) return;
    this.list.replaceChildren();
    if (this.host.error) this.list.createEl('p', {cls: 'nf-reminders-description', text: this.host.error});
    if (!this.host.rows.length) {this.list.createEl('p', {cls: 'nf-reminders-empty', text: this.host.loading ? '正在读取提醒…' : '目前没有未完成任务或待处理的截止日期。'}); return;}
    const today = reminderDay();
    for (const group of reminderSections(this.host.rows, today)) {
      const section = this.list.createEl('details', {cls: 'nf-reminder-section'});
      section.dataset.section = group.key;
      section.classList.toggle('is-overdue', group.overdue);
      section.open = this.expanded.get(group.key) ?? group.key !== 'undated';
      section.addEventListener('toggle', () => {if (section.isConnected) this.expanded.set(group.key, section.open);});
      const heading = section.createEl('summary');
      heading.createSpan({cls: 'nf-reminder-section-label', text: group.label});
      if (group.dateLabel) heading.createSpan({cls: 'nf-reminder-section-date', text: group.dateLabel});
      heading.createSpan({cls: 'nf-reminder-count', text: String(group.rows.length), attr: {'aria-label': `${group.rows.length} 项`}});
      for (const row of group.rows) {
        const button = section.createEl('button', {cls: 'nf-reminder-row', attr: {title: row.path}});
        button.classList.toggle('is-overdue', group.overdue);
        const text = button.createSpan({cls: 'nf-reminder-content'});
        text.createSpan({cls: 'nf-reminder-label', text: reminderTitle(row)});
        const meta = text.createSpan({cls: 'nf-reminder-meta'});
        if (group.overdue && row.due) meta.createEl('time', {cls: 'nf-reminder-date', text: formatReminderDate(row.due, today), attr: {datetime: row.due}});
        meta.createSpan({cls: 'nf-reminder-source', text: row.kind === 'task' ? row.source : '页面截止日期'});
        button.addEventListener('click', event => {void this.host.openReminder(row, this.contentEl, event);});
      }
    }
  }
  renderDatabases(force = false) {
    if (!this.databases) return;
    const signature = JSON.stringify(this.host.preferences.databases); if (!force && signature === this.databaseSignature) return;
    this.databaseSignature = signature;
    if (this.databaseComponent) this.removeChild(this.databaseComponent);
    const component = this.addChild(new Component()); this.databaseComponent = component;
    this.databases.replaceChildren();
    for (const path of this.host.preferences.databases) {
      const file = this.app.vault.getFileByPath(path), section = this.databases.createEl('section', {cls: 'nf-reminder-database'});
      const header = section.createDiv({cls: 'nf-reminder-database-header'});
      header.createEl('h2', {text: file?.basename ?? path.split('/').at(-1) ?? path});
      const remove = header.createEl('button', {cls: 'clickable-icon', attr: {'aria-label': '从提醒事项移除此数据库'}}); setIcon(remove, 'x');
      remove.addEventListener('click', () => {void this.host.update(state => ({...state, databases: state.databases.filter(item => item !== path)}));});
      const embed = section.createDiv({cls: 'nf-reminder-base'});
      if (!file) {embed.textContent = '找不到原数据库；移除此引用不会删除记录。'; continue;}
      void MarkdownRenderer.render(this.app, `![[${path}]]`, embed, path, component).catch(() => {
        if (embed.isConnected) embed.textContent = '数据库暂时无法显示，请从原生文件列表打开检查。';
      });
    }
  }
  async onClose() {
    this.host.views.delete(this);
    if (this.databaseComponent) this.removeChild(this.databaseComponent);
    this.databaseComponent = undefined; this.contentEl.replaceChildren();
  }
}
class ReminderDatabasePicker extends FuzzySuggestModal<TFile> {
  constructor(plugin: Plugin, private choose: (file: TFile) => void, private included: string[]) {
    super(plugin.app); this.setPlaceholder('选择已有数据库');
  }
  getItems() {return this.app.vault.getFiles().filter(file => file.extension === 'base' && !this.included.includes(file.path) && readReminderPreferences({databases: [file.path]}).databases.length);}
  getItemText(file: TFile) {return `${file.basename} — ${file.path}`;}
  onChooseItem(file: TFile) {this.choose(file);}
}
