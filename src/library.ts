import { App, Modal, Notice, TextFileView, TFile, parseYaml, stringifyYaml } from 'obsidian';
import { childPath, matchesQuery } from './model';
import { addLibraryField, libraryMembers, newLibrary, renameMembers, updateMembers } from './library-model';

export interface LibraryHost {
  app: App;
  text(zh: string, en: string): string;
  button(parent: HTMLElement, icon: string | null, label: string,
    callback: (event: MouseEvent) => void, showLabel?: boolean): HTMLButtonElement;
  track<T extends Modal>(modal: T): T;
  untrack(modal: Modal): void;
  openFile(file: TFile, edit?: boolean): Promise<void>;
  report(error: unknown): void;
}

export class Libraries {
  private stopped = false;
  private pending: Promise<void> = Promise.resolve();
  constructor(private host: LibraryHost) {}
  stop(): void { this.stopped = true; }
  files(): TFile[] {
    return this.host.app.vault.getAllLoadedFiles()
      .filter((file): file is TFile => file instanceof TFile && file.extension === 'base')
      .sort((a, b) => a.path.localeCompare(b.path));
  }
  async members(file: TFile): Promise<string[]> {
    return libraryMembers(parseYaml(await this.host.app.vault.read(file)));
  }
  async create(name: string): Promise<TFile> {
    if (this.stopped) throw new Error('unloaded');
    const path = childPath('', name.toLowerCase().endsWith('.base') ? name : `${name}.base`, false);
    const config = newLibrary(this.host.text('列表', 'Table'), this.host.text('卡片', 'Cards'));
    return this.host.app.vault.create(path, stringifyYaml(config));
  }
  async changeMembers(file: TFile, added: string[], removed: string[]): Promise<void> {
    if (this.stopped) throw new Error('unloaded');
    for (const path of added) {
      const note = this.host.app.vault.getAbstractFileByPath(path);
      if (!(note instanceof TFile) || note.extension !== 'md') throw new Error('missing-note');
    }
    await this.edit(file, source => {
      const config = parseYaml(source);
      updateMembers(config, added, removed);
      const next = stringifyYaml(config);
      return next === source ? source : next;
    });
  }
  async addField(file: TFile, name: string): Promise<void> {
    if (this.stopped) throw new Error('unloaded');
    await this.edit(file, source => {
      const config = parseYaml(source);
      addLibraryField(config, name);
      return stringifyYaml(config);
    });
  }
  async renamed(oldPath: string, newPath: string): Promise<void> {
    for (const file of this.files()) {
      if (this.stopped) return;
      // Ignore ordinary bases and malformed libraries. Never "repair" unknown filters.
      try {
        const config = parseYaml(await this.host.app.vault.read(file));
        if (!renameMembers(config, oldPath, newPath)) continue;
      } catch { continue; }
      await this.edit(file, source => {
        const config = parseYaml(source);
        return renameMembers(config, oldPath, newPath) ? stringifyYaml(config) : source;
      });
    }
  }
  private edit(file: TFile, transform: (source: string) => string): Promise<void> {
    const operation = this.pending.then(async () => {
      if (this.stopped) throw new Error('unloaded');
      const views: TextFileView[] = [];
      this.host.app.workspace.iterateAllLeaves(leaf => {
        if (leaf.view instanceof TextFileView && leaf.view.file === file) views.push(leaf.view);
      });
      // Bases uses TextFileView's delayed save and saves again on navigation.
      // Flush native view changes before transforming, then synchronize its public
      // data cache so unloading cannot write the old membership over the new one.
      for (const view of views) if (view.file === file) await view.save();
      const revisions = new Map(views.filter(view => view.file === file).map(view => [view, view.getViewData()]));
      const next = await this.host.app.vault.process(file, source => {
        if (this.stopped) throw new Error('unloaded');
        for (const [view, revision] of revisions) {
          if (view.file === file && view.getViewData() !== revision) throw new Error('library-view-changed');
        }
        return transform(source);
      });
      for (const [view, revision] of revisions) {
        if (view.file !== file) continue;
        if (view.getViewData() !== revision && view.getViewData() !== next) {
          // Do not overwrite user input arriving during an asynchronous write.
          throw new Error('library-view-changed');
        }
        view.setViewData(next, false);
        view.data = next;
      }
    });
    this.pending = operation.catch(() => {});
    return operation;
  }
  open(note?: TFile): void { this.host.track(new LibraryModal(this.host, this, note)).open(); }
  editMembers(file: TFile): void { this.host.track(new MembersModal(this.host, this, file)).open(); }
  askField(file: TFile): void {
    const t = this.host.text.bind(this.host);
    this.host.track(new LibraryNameModal(this.host, t('添加字段', 'Add field'),
      t('例如：阅读状态。字段先显示为空列，填写值时才会保存到笔记。', 'For example: reading status. An empty column does not add properties to notes.'),
      async name => { await this.addField(file, name); })).open();
  }
  askCreate(): void {
    const t = this.host.text.bind(this.host);
    this.host.track(new LibraryNameModal(this.host, t('新建资料库', 'New library'),
      t('取一个名字，然后选择要收录的笔记。', 'Choose a name, then select notes to include.'),
      async name => { const file = await this.create(name); await this.host.openFile(file); this.editMembers(file); })).open();
  }
  askNewNote(base: TFile): void {
    const t = this.host.text.bind(this.host);
    this.host.track(new LibraryNameModal(this.host, t('新建笔记', 'New note'),
      t('新笔记会收录到当前资料库，属性保持为空。', 'The new note joins this library with no properties.'),
      async name => {
        await this.members(base); // Validate before creating any note.
        const path = childPath('', name, true);
        const file = await this.host.app.vault.create(path, '');
        try { await this.changeMembers(base, [file.path], []); }
        catch (error) {
          // Preserve the created note even if the base changed during creation.
          new Notice(t('笔记已创建，但尚未收录。请在资料库中重新选择它。', 'Note created but not included yet. Select it again in the library.'));
          await this.host.openFile(file, true);
          throw error;
        }
        await this.host.openFile(file, true);
      })).open();
  }
}

class LibraryModal extends Modal {
  private generation = 0;
  constructor(private host: LibraryHost, private libraries: Libraries, private note?: TFile) { super(host.app); }
  onOpen(): void {
    const t = this.host.text.bind(this.host);
    this.titleEl.setText(this.note ? t('收录到资料库', 'Add to library') : t('资料库', 'Libraries'));
    this.modalEl.classList.add('nf-dialog', 'nf-library-dialog');
    this.contentEl.createEl('p', { cls: 'nf-help', text: this.note
      ? t('收录只保存引用，不移动笔记，也不添加属性。', 'Include a reference without moving the note or adding properties.')
      : t('写作之外，给资料一个清楚的位置。', 'A place to organize notes when you need it.') });
    const actions = this.contentEl.createDiv('nf-nav-actions');
    this.host.button(actions, 'plus', t('新建资料库', 'New library'), () => { this.close(); this.libraries.askCreate(); }, true);
    const search = this.contentEl.createEl('input', { cls: 'nf-search', type: 'search', attr: {
      placeholder: t('搜索资料库', 'Search libraries'), 'aria-label': t('搜索资料库', 'Search libraries'),
    } });
    const list = this.contentEl.createDiv('nf-file-list');
    const render = async (): Promise<void> => {
      const generation = ++this.generation;
      list.empty();
      const files = this.libraries.files().filter(file => matchesQuery(file.path, search.value));
      if (!files.length) list.createEl('p', { cls: 'nf-empty', text: t('还没有资料库。新建一个，再收录需要整理的笔记。', 'Create a library, then select the notes you want to organize.') });
      for (const file of files) {
        let members: string[] | undefined;
        try { members = await this.libraries.members(file); } catch { /* Existing native base remains openable. */ }
        if (generation !== this.generation) return;
        if (this.note && !members) continue;
        const row = list.createEl('button', { cls: 'nf-file-row', type: 'button' });
        const copy = row.createSpan('nf-file-copy');
        copy.createSpan({ cls: 'nf-file-name', text: file.basename });
        copy.createSpan({ cls: 'nf-file-path', text: members
          ? `${members.length} ${t('篇笔记', 'notes')}` : file.path });
        if (this.note) {
          const included = members!.includes(this.note.path);
          row.createSpan({ cls: 'nf-help', text: included ? t('已收录', 'Included') : t('收录', 'Include') });
          row.disabled = included;
          row.addEventListener('click', () => {
            row.disabled = true;
            void this.libraries.changeMembers(file, [this.note!.path], []).then(() => {
              this.close(); new Notice(t('已收录', 'Note included'));
            }).catch(error => { row.disabled = false; this.host.report(error); });
          });
        } else row.addEventListener('click', () => { this.close(); void this.host.openFile(file); });
      }
    };
    search.addEventListener('input', () => { void render(); });
    void render();
  }
  onClose(): void { this.generation++; this.contentEl.empty(); this.host.untrack(this); }
}

class MembersModal extends Modal {
  private closed = false;
  constructor(private host: LibraryHost, private libraries: Libraries, private file: TFile) { super(host.app); }
  onOpen(): void { void this.render().catch(error => { this.host.report(error); this.close(); }); }
  private async render(): Promise<void> {
    const initial = new Set(await this.libraries.members(this.file));
    if (this.closed) return;
    const selected = new Set(initial);
    const t = this.host.text.bind(this.host);
    this.titleEl.setText(t('收录笔记', 'Choose notes'));
    this.modalEl.classList.add('nf-dialog', 'nf-members-dialog');
    this.contentEl.createEl('p', { cls: 'nf-help', text: t('勾选以收录，取消勾选以移出。笔记正文和属性都会保留。', 'Check to include, uncheck to remove. Notes and their properties are preserved.') });
    const search = this.contentEl.createEl('input', { cls: 'nf-search', type: 'search', attr: {
      'aria-label': t('搜索笔记', 'Search notes'), placeholder: t('搜索笔记', 'Search notes'),
    } });
    const list = this.contentEl.createDiv('nf-member-list');
    const footer = this.contentEl.createDiv('nf-library-footer');
    const status = footer.createSpan({ cls: 'nf-help', attr: { 'aria-live': 'polite' } });
    const error = this.contentEl.createEl('p', { cls: 'nf-error', attr: { role: 'alert' } });
    const notes = this.host.app.vault.getMarkdownFiles();
    // Missing references remain removable; never silently expand an empty library to all notes.
    const paths = [...new Set([...initial, ...notes.map(note => note.path)])]
      .sort((a, b) => Number(initial.has(b)) - Number(initial.has(a)) || a.localeCompare(b));
    const updateCount = () => status.setText(`${selected.size} ${t('篇已选', 'selected')}`);
    const render = () => {
      list.empty();
      const matching = paths.filter(path => matchesQuery(path, search.value));
      for (const path of matching.slice(0, 150)) {
        const label = list.createEl('label', { cls: 'nf-member-row' });
        const checkbox = label.createEl('input', { type: 'checkbox' });
        checkbox.checked = selected.has(path);
        label.createSpan({ text: path.replace(/\.md$/, '') });
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) selected.add(path); else selected.delete(path);
          updateCount();
        });
      }
      if (!matching.length) list.createEl('p', { cls: 'nf-empty', text: t('没有匹配的笔记。', 'No matching notes.') });
      if (matching.length > 150) list.createEl('p', { cls: 'nf-help', text: t('显示前 150 项，搜索可找到其他笔记。', 'Showing 150 items. Search for other notes.') });
    };
    const save = this.host.button(footer, null, t('保存收录', 'Save selection'), () => {
      save.disabled = true;
      const added = [...selected].filter(path => !initial.has(path));
      const removed = [...initial].filter(path => !selected.has(path));
      void this.libraries.changeMembers(this.file, added, removed).then(() => this.close()).catch(() => {
        error.setText(t('未能保存。笔记可能已改名，或资料库筛选已被修改；请关闭后重新打开。', 'Could not save. A note or library scope changed. Close and reopen this dialog.'));
        save.disabled = false;
      });
    }, true);
    save.classList.add('mod-cta');
    search.addEventListener('input', render);
    render(); updateCount();
  }
  onClose(): void { this.closed = true; this.contentEl.empty(); this.host.untrack(this); }
}

class LibraryNameModal extends Modal {
  constructor(private host: LibraryHost, private heading: string, private description: string,
    private submit: (name: string) => Promise<void>) { super(host.app); }
  onOpen(): void {
    const t = this.host.text.bind(this.host);
    this.titleEl.setText(this.heading);
    this.modalEl.classList.add('nf-dialog');
    this.contentEl.createEl('p', { cls: 'nf-help', text: this.description });
    const form = this.contentEl.createEl('form', { cls: 'nf-name-form' });
    const input = form.createEl('input', { type: 'text', attr: { 'aria-label': this.heading, autocomplete: 'off' } });
    input.required = true;
    const error = form.createEl('p', { cls: 'nf-error', attr: { role: 'alert' } });
    const submit = form.createEl('button', { type: 'submit', cls: 'mod-cta', text: t('确定', 'Confirm') });
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (submit.disabled) return;
      submit.disabled = true;
      void this.submit(input.value.trim()).then(() => this.close()).catch(() => {
        error.setText(t('未能保存。请检查名称是否为空、重名或含特殊字符。', 'Could not save. Check for an empty, duplicate or invalid name.'));
        submit.disabled = false;
      });
    });
  }
  onClose(): void { this.contentEl.empty(); this.host.untrack(this); }
}
