import {App, Component, ItemView, Menu, Modal, TFile, WorkspaceLeaf, setIcon} from 'obsidian';
import type {HomeConfig, HomeModule} from './home-model';

export const HOME_VIEW_TYPE = 'nebula-home';
export type HomeSource = {path: string; views: string[]; properties: string[]};
export interface HomeHost {
  config: HomeConfig;
  views: Set<HomeView>;
  update(change: (config: HomeConfig) => HomeConfig): Promise<boolean>;
  saveModule(module: HomeModule): Promise<boolean>;
  mountModule(host: HTMLElement, module: HomeModule, component: Component): Promise<void>;
  openModule(module: HomeModule): Promise<void>;
  listSources(): Promise<HomeSource[]>;
  open(): Promise<void>;
}

type ModuleSlot = {
  module: HomeModule; el: HTMLElement; title: HTMLElement; toggle: HTMLButtonElement;
  tools: HTMLElement; up: HTMLButtonElement; down: HTMLButtonElement; all?: HTMLButtonElement;
  body: HTMLElement; component?: Component; signature: string; generation: number;
};
const KIND_LABELS = {view: '数据视图', summary: '数据摘要', links: '快捷入口'};
const HEIGHTS = new Map([[300, '紧凑'], [480, '标准'], [720, '展开']]);

function button(host: HTMLElement, text: string, cls: string, action: () => void): HTMLButtonElement {
  const el = host.createEl('button', {cls, text, attr: {type: 'button'}});
  el.addEventListener('click', action); return el;
}
function iconButton(host: HTMLElement, icon: string, label: string, action: () => void): HTMLButtonElement {
  const el = button(host, '', 'nf-home-icon-button clickable-icon', action);
  el.setAttribute('aria-label', label); el.title = label; setIcon(el, icon); return el;
}
function contentKey(module: HomeModule): string {
  if (module.kind === 'links') return JSON.stringify([module.kind, module.paths]);
  return JSON.stringify(module.kind === 'summary'
    ? [module.kind, module.source, module.view, module.basePath, module.operation, module.property, module.groupBy]
    : [module.kind, module.source, module.view, module.basePath]);
}

/** A workspace view, not a new Bases layout. Each embedded module owns a child
 * Component; editing names, ordering and disclosure state preserves its DOM. */
export class HomeView extends ItemView {
  private editing = false;
  private closed = true;
  private titleEl!: HTMLElement;
  private titleForm!: HTMLFormElement;
  private titleInput!: HTMLInputElement;
  private editButton!: HTMLButtonElement;
  private addButton!: HTMLButtonElement;
  private sections!: HTMLElement;
  private empty!: HTMLElement;
  private status!: HTMLElement;
  private titleDirty = false;
  private savingTitle = false;
  private slots = new Map<string, ModuleSlot>();
  private dragged?: string;

  constructor(leaf: WorkspaceLeaf, readonly host: HomeHost) {super(leaf);}
  getViewType() {return HOME_VIEW_TYPE;}
  getDisplayText() {return this.host.config.title || '首页';}
  getIcon() {return 'house';}

  async onOpen() {
    this.closed = false;
    this.contentEl.replaceChildren(); this.contentEl.classList.add('nf-home');
    const header = this.contentEl.createDiv({cls: 'nf-home-header'});
    this.titleEl = header.createEl('h1', {cls: 'nf-home-title'});
    this.titleForm = header.createEl('form', {cls: 'nf-home-title-form'});
    this.titleInput = this.titleForm.createEl('input', {type: 'text', attr: {'aria-label': '首页名称', maxlength: '120'}});
    this.titleInput.addEventListener('input', () => {this.titleDirty = true;});
    this.titleForm.createEl('button', {text: '保存名称', attr: {type: 'submit'}});
    this.titleForm.addEventListener('submit', event => {event.preventDefault(); void this.saveTitle();});
    const actions = header.createDiv({cls: 'nf-home-header-actions'});
    this.addButton = button(actions, '添加模块', 'nf-home-add', () => this.addMenu(this.addButton));
    this.editButton = button(actions, '编辑首页', 'nf-home-edit', () => {void this.toggleEditing();});
    this.status = this.contentEl.createDiv({cls: 'nf-home-status', attr: {role: 'status', 'aria-live': 'polite'}});
    this.sections = this.contentEl.createDiv({cls: 'nf-home-sections'});
    this.empty = this.contentEl.createDiv({cls: 'nf-home-empty'});
    this.empty.createEl('p', {text: '把常用视图、数据摘要和页面入口放在这里。'});
    const add = button(this.empty, '添加第一个模块', 'mod-cta', () => this.addMenu(add));
    this.host.views.add(this); this.render();
  }

  async onClose() {
    this.closed = true; this.host.views.delete(this);
    this.clearDrag();
    for (const slot of this.slots.values()) this.disposeSlot(slot);
    this.slots.clear(); this.contentEl.replaceChildren();
  }

  render(): void {
    if (this.closed || !this.sections) return;
    const config = this.host.config;
    this.contentEl.classList.toggle('is-editing', this.editing);
    this.titleEl.textContent = config.title;
    if (!this.titleDirty) this.titleInput.value = config.title;
    this.titleEl.hidden = this.editing; this.titleForm.hidden = !this.editing;
    this.editButton.textContent = this.editing ? '完成编辑' : '编辑首页';
    this.addButton.hidden = !this.editing;
    this.empty.hidden = config.modules.length !== 0;
    const ids = new Set(config.modules.map(module => module.id));
    for (const [id, slot] of this.slots) if (!ids.has(id)) {this.disposeSlot(slot); this.slots.delete(id);}
    let previous: HTMLElement | null = null;
    config.modules.forEach((module, index) => {
      let slot = this.slots.get(module.id);
      if (slot && slot.module.kind !== module.kind) {this.disposeSlot(slot); this.slots.delete(module.id); slot = undefined;}
      if (!slot) {slot = this.createSlot(module); this.slots.set(module.id, slot);}
      slot.module = module;
      if (previous ? previous.nextElementSibling !== slot.el : this.sections.firstElementChild !== slot.el) {
        if (previous) previous.after(slot.el); else this.sections.prepend(slot.el);
      }
      previous = slot.el;
      slot.title.textContent = module.title;
      slot.toggle.setAttribute('aria-label', `${module.collapsed ? '展开' : '收起'} ${module.title}`);
      slot.toggle.setAttribute('aria-expanded', String(!module.collapsed));
      slot.toggle.classList.toggle('is-collapsed', module.collapsed);
      slot.tools.hidden = !this.editing;
      slot.up.disabled = index === 0; slot.down.disabled = index === config.modules.length - 1;
      slot.body.hidden = module.collapsed;
      slot.el.classList.toggle('is-collapsed', module.collapsed);
      slot.body.classList.toggle('is-view', module.kind === 'view');
      if (module.kind === 'view') slot.body.style.setProperty('--nf-home-view-height', `${module.height}px`);
      const signature = contentKey(module);
      if (!module.collapsed && signature !== slot.signature) this.mount(slot, signature);
    });
  }

  private createSlot(module: HomeModule): ModuleSlot {
    const el = this.sections.createEl('section', {cls: 'nf-home-module'}); el.dataset.moduleId = module.id;
    const heading = el.createDiv({cls: 'nf-home-module-heading'});
    const toggle = iconButton(heading, 'chevron-down', '折叠模块', () => {
      void this.update(config => ({...config, modules: config.modules.map(item => item.id === module.id ? {...item, collapsed: !item.collapsed} : item)}));
    });
    toggle.classList.add('nf-home-disclosure');
    const title = heading.createEl('h2', {cls: 'nf-home-module-title'});
    const tools = heading.createDiv({cls: 'nf-home-module-tools'});
    const handle = iconButton(tools, 'grip-vertical', '拖动排列模块；也可使用上移和下移', () => {});
    handle.classList.add('nf-home-drag-handle'); handle.draggable = true;
    const up = iconButton(tools, 'arrow-up', '上移模块', () => {void this.move(module.id, -1);});
    const down = iconButton(tools, 'arrow-down', '下移模块', () => {void this.move(module.id, 1);});
    button(tools, '设置', 'nf-home-module-settings', () => {
      const current = this.slots.get(module.id)?.module;
      if (current) new HomeModuleModal(this.app, this.host, current.kind, current).open();
    });
    button(tools, '移除', 'nf-home-module-remove', () => {
      void this.update(config => ({...config, modules: config.modules.filter(item => item.id !== module.id)}));
    }).title = '从首页移除模块，保留笔记和原始视图';
    const all = module.kind === 'links' ? undefined : button(heading, '查看全部', 'nf-home-view-all', () => {
      const current = this.slots.get(module.id)?.module;
      if (current) void this.host.openModule(current).catch(error => this.report(error));
    });
    const body = el.createDiv({cls: 'nf-home-module-body'});
    const slot: ModuleSlot = {module, el, title, toggle, tools, up, down, all, body, signature: '', generation: 0};
    handle.addEventListener('dragstart', event => {
      if (!this.editing) {event.preventDefault(); return;}
      this.dragged = module.id; el.classList.add('is-dragging');
      event.dataTransfer?.setData('text/plain', module.id);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    });
    handle.addEventListener('dragend', () => this.clearDrag());
    el.addEventListener('dragover', event => {
      if (!this.editing || !this.dragged || this.dragged === module.id) return;
      event.preventDefault();
      const after = event.clientY >= el.getBoundingClientRect().top + el.getBoundingClientRect().height / 2;
      this.clearDropMarkers(); el.classList.add(after ? 'drop-after' : 'drop-before');
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    });
    el.addEventListener('drop', event => {
      if (!this.editing || !this.dragged || this.dragged === module.id) return;
      event.preventDefault(); const source = this.dragged, after = el.classList.contains('drop-after'); this.clearDrag();
      void this.update(config => {
        const moved = config.modules.find(item => item.id === source);
        if (!moved || !config.modules.some(item => item.id === module.id)) return config;
        const modules = config.modules.filter(item => item.id !== source);
        modules.splice(modules.findIndex(item => item.id === module.id) + Number(after), 0, moved);
        return {...config, modules};
      });
    });
    return slot;
  }

  private mount(slot: ModuleSlot, signature: string) {
    if (slot.component) {this.removeChild(slot.component); slot.component = undefined;}
    slot.body.replaceChildren(); slot.signature = signature;
    const generation = ++slot.generation;
    if (slot.module.kind === 'links') {
      const list = slot.body.createEl('ul', {cls: 'nf-home-links'});
      for (const path of slot.module.paths) {
        const file = this.app.vault.getFileByPath(path);
        const row = list.createEl('li');
        const link = row.createEl('a', {cls: 'internal-link nf-home-link', text: file?.basename ?? path,
          attr: {href: path, 'data-href': path}});
        link.title = path;
        link.addEventListener('click', event => {
          event.preventDefault();
          if (!file) {this.report('页面暂不可用，请检查同步或模块路径。'); return;}
          void this.app.workspace.getLeaf(event.metaKey || event.ctrlKey ? 'tab' : false).openFile(file).catch(error => this.report(error));
        });
      }
      if (!slot.module.paths.length) slot.body.createDiv({cls: 'nf-home-module-empty', text: '尚未添加页面入口'});
      return;
    }
    const loading = slot.body.createDiv({cls: 'nf-home-module-loading', text: '正在载入…'});
    const surface = slot.body.createDiv({cls: 'nf-home-module-surface'});
    const component = new Component(); slot.component = component; this.addChild(component);
    void this.host.mountModule(surface, slot.module, component).then(() => {
      if (!this.closed && slot.generation === generation) loading.remove();
    }).catch(error => {
      if (this.closed || slot.generation !== generation || !this.slots.has(slot.module.id)) return;
      loading.textContent = error instanceof Error ? error.message : '模块暂时无法载入';
      loading.classList.add('is-error');
      button(loading, '重试', 'nf-home-retry', () => this.mount(slot, signature));
    });
  }

  private disposeSlot(slot: ModuleSlot) {
    slot.generation++;
    if (slot.component) this.removeChild(slot.component);
    slot.el.remove();
  }
  private clearDropMarkers() {for (const slot of this.slots.values()) slot.el.classList.remove('drop-before', 'drop-after');}
  private clearDrag() {
    this.dragged = undefined; this.clearDropMarkers();
    for (const slot of this.slots.values()) slot.el.classList.remove('is-dragging');
  }
  private async move(id: string, direction: number) {
    await this.update(config => {
      const index = config.modules.findIndex(module => module.id === id), target = index + direction;
      if (index < 0 || target < 0 || target >= config.modules.length) return config;
      const modules = [...config.modules]; [modules[index], modules[target]] = [modules[target], modules[index]];
      return {...config, modules};
    });
  }
  private async update(change: (config: HomeConfig) => HomeConfig): Promise<boolean> {
    try {
      const saved = await this.host.update(change);
      if (!this.closed) {if (!saved) this.report('未能保存，首页仍保留原来的配置。'); else {this.status.textContent = ''; this.render();}}
      return saved;
    } catch (error) {this.report(error); return false;}
  }
  private report(error: unknown) {
    if (!this.closed) this.status.textContent = error instanceof Error ? error.message : typeof error === 'string' ? error : '操作未完成，请重试。';
  }
  private async saveTitle(): Promise<boolean> {
    if (this.savingTitle) return false;
    const title = this.titleInput.value.trim();
    if (!title) {this.report('请输入首页名称。'); this.titleInput.focus(); return false;}
    this.savingTitle = true;
    try {
      const saved = await this.update(config => ({...config, title}));
      if (saved) {this.titleDirty = this.titleInput.value.trim() !== title; this.render();}
      return saved;
    } finally {this.savingTitle = false;}
  }
  private async toggleEditing() {
    if (this.editing && this.titleDirty && !await this.saveTitle()) return;
    this.editing = !this.editing; this.clearDrag(); this.render();
  }
  private addMenu(anchor: HTMLElement) {
    const menu = new Menu();
    for (const kind of ['view', 'summary', 'links'] as const) {
      menu.addItem(item => item.setTitle(KIND_LABELS[kind]).setIcon({view: 'table-2', summary: 'sigma', links: 'link'}[kind])
        .onClick(() => new HomeModuleModal(this.app, this.host, kind).open()));
    }
    const rect = anchor.getBoundingClientRect(); menu.showAtPosition({x: rect.left, y: rect.bottom});
  }
}

let modalId = 0;
export class HomeModuleModal extends Modal {
  private draft: HomeModule;
  private sources: HomeSource[] = [];
  private titleInput!: HTMLInputElement;
  private errorEl!: HTMLElement;
  private saveButton!: HTMLButtonElement;
  private closed = true;
  private saving = false;
  private ready = false;
  private existing: boolean;
  private sourceSelect?: HTMLSelectElement;
  private viewSelect?: HTMLSelectElement;
  private propertySelect?: HTMLSelectElement;
  private groupSelect?: HTMLSelectElement;
  private currencyHint?: HTMLElement;

  constructor(app: App, private host: HomeHost, kind: HomeModule['kind'], module?: HomeModule) {
    super(app); this.existing = !!module;
    const common = {id: crypto.randomUUID(), title: KIND_LABELS[kind], collapsed: false};
    this.draft = module ? structuredClone(module) : kind === 'links' ? {...common, kind, paths: []}
      : kind === 'view' ? {...common, kind, source: '', view: '', basePath: '', height: 480}
      : {...common, kind, source: '', view: '', basePath: '', operation: 'count', property: '', groupBy: ''};
  }

  onOpen() {
    this.closed = false; this.setTitle(this.existing ? '编辑模块' : `添加${KIND_LABELS[this.draft.kind]}`);
    this.contentEl.classList.add('nf-home-module-modal');
    const form = this.contentEl.createEl('form', {cls: 'nf-home-module-form'});
    this.titleInput = this.field(form, '模块名称').createEl('input', {type: 'text', attr: {maxlength: '120'}});
    this.titleInput.value = this.draft.title;
    if (this.draft.kind === 'links') {this.buildLinks(form); this.ready = true;}
    else this.buildSource(form);
    this.errorEl = form.createDiv({cls: 'nf-home-form-error', attr: {role: 'alert'}});
    const actions = form.createDiv({cls: 'nf-home-form-actions'});
    const cancel = button(actions, '取消', '', () => {if (!this.saving) this.close();});
    this.saveButton = actions.createEl('button', {text: '保存', cls: 'mod-cta', attr: {type: 'submit'}});
    form.addEventListener('submit', event => {event.preventDefault(); void this.save(cancel);});
    if (this.draft.kind !== 'links') void this.loadSources();
  }
  onClose() {this.closed = true; this.contentEl.replaceChildren();}

  private field(host: HTMLElement, label: string): HTMLElement {
    const el = host.createEl('label', {cls: 'nf-home-field'}); el.createSpan({text: label}); return el;
  }
  private option(select: HTMLSelectElement, value: string, label = value) {select.createEl('option', {value, text: label});}

  private buildSource(form: HTMLElement) {
    if (this.draft.kind === 'links') return;
    this.sourceSelect = this.field(form, '数据来源').createEl('select');
    this.option(this.sourceSelect, '', '正在读取数据来源…'); this.sourceSelect.disabled = true;
    this.sourceSelect.addEventListener('change', () => {
      if (this.draft.kind === 'links' || !this.sourceSelect) return;
      this.draft.source = this.sourceSelect.value; this.draft.basePath = '';
      this.refreshSourceFields(true);
    });
    this.viewSelect = this.field(form, '来源视图').createEl('select');
    this.viewSelect.addEventListener('change', () => {
      if (this.draft.kind === 'links' || !this.viewSelect) return;
      this.draft.view = this.viewSelect.value; this.draft.basePath = ''; this.suggestTitle();
    });
    if (this.draft.kind === 'view') {
      const select = this.field(form, '显示高度').createEl('select');
      for (const [height, label] of HEIGHTS) this.option(select, String(height), label);
      select.value = String(this.draft.height);
      select.addEventListener('change', () => {if (this.draft.kind === 'view') this.draft.height = Number(select.value);});
    } else {
      const operation = this.field(form, '统计方式').createEl('select');
      for (const [value, label] of [['count', '记录数'], ['sum', '合计'], ['average', '平均值']]) this.option(operation, value, label);
      operation.value = this.draft.operation;
      operation.addEventListener('change', () => {
        if (this.draft.kind !== 'summary') return;
        const value = operation.value;
        if (value === 'count' || value === 'sum' || value === 'average') this.draft.operation = value;
        this.refreshSummaryFields();
      });
      this.propertySelect = this.field(form, '统计属性').createEl('select');
      this.propertySelect.addEventListener('change', () => {if (this.draft.kind === 'summary' && this.propertySelect) this.draft.property = this.propertySelect.value;});
      this.groupSelect = this.field(form, '分组属性').createEl('select');
      this.groupSelect.addEventListener('change', () => {if (this.draft.kind === 'summary' && this.groupSelect) this.draft.groupBy = this.groupSelect.value;});
      this.currencyHint = form.createEl('p', {cls: 'nf-home-form-hint', text: '金额涉及不同币种时，请按币种分组后再合计或计算平均值。'});
    }
  }

  private async loadSources() {
    try {
      const sources = await this.host.listSources(); if (this.closed || !this.sourceSelect || this.draft.kind === 'links') return;
      this.sources = sources; this.sourceSelect.replaceChildren();
      this.option(this.sourceSelect, '', sources.length ? '选择数据来源' : '暂未找到数据视图');
      for (const source of sources) this.option(this.sourceSelect, source.path, source.path.replace(/\.base$/i, ''));
      const sourcePath = this.draft.source;
      if (sourcePath && !sources.some(source => source.path === sourcePath)) this.option(this.sourceSelect, sourcePath, `${sourcePath}（暂不可用）`);
      this.sourceSelect.value = sourcePath; this.sourceSelect.disabled = !sources.length;
      this.ready = true; this.refreshSourceFields();
      if (!sources.length) this.errorEl.textContent = '请先为笔记打开一个数据视图，再回来添加模块。';
    } catch (error) {
      if (!this.closed) this.errorEl.textContent = error instanceof Error ? error.message : '数据来源暂时无法读取，请关闭后重试。';
    }
  }

  private refreshSourceFields(sourceChanged = false) {
    if (this.draft.kind === 'links' || !this.viewSelect) return;
    const sourcePath = this.draft.source;
    const source = this.sources.find(item => item.path === sourcePath);
    this.viewSelect.replaceChildren(); this.option(this.viewSelect, '', '选择视图');
    for (const name of source?.views ?? []) this.option(this.viewSelect, name);
    if (!source?.views.includes(this.draft.view)) {
      if (sourceChanged || !this.draft.view) this.draft.view = source?.views[0] ?? '';
      else this.option(this.viewSelect, this.draft.view, `${this.draft.view}（暂不可用）`);
    }
    this.viewSelect.value = this.draft.view; this.viewSelect.disabled = !source?.views.length;
    if (this.draft.kind === 'summary' && this.propertySelect && this.groupSelect) {
      for (const [select, label] of [[this.propertySelect, '选择属性'], [this.groupSelect, '不分组']] as const) {
        select.replaceChildren(); this.option(select, '', label);
        for (const property of source?.properties ?? []) this.option(select, property, property.replace(/^note\./, ''));
      }
      if (!source?.properties.includes(this.draft.property)) {
        if (sourceChanged) this.draft.property = '';
        else if (this.draft.property) this.option(this.propertySelect, this.draft.property, `${this.draft.property}（暂不可用）`);
      }
      if (!source?.properties.includes(this.draft.groupBy)) {
        if (sourceChanged) this.draft.groupBy = '';
        else if (this.draft.groupBy) this.option(this.groupSelect, this.draft.groupBy, `${this.draft.groupBy}（暂不可用）`);
      }
      this.propertySelect.value = this.draft.property; this.groupSelect.value = this.draft.groupBy;
      this.refreshSummaryFields();
    }
    this.suggestTitle();
  }
  private refreshSummaryFields() {
    if (this.draft.kind !== 'summary') return;
    if (this.propertySelect) this.propertySelect.disabled = this.draft.operation === 'count';
    if (this.currencyHint) this.currencyHint.hidden = this.draft.operation === 'count';
  }
  private suggestTitle() {
    if (this.draft.kind === 'links' || this.existing || this.titleInput.value !== KIND_LABELS[this.draft.kind]) return;
    if (this.draft.view) this.titleInput.value = this.draft.kind === 'summary' ? `${this.draft.view} · 摘要` : this.draft.view;
  }

  private buildLinks(form: HTMLElement) {
    if (this.draft.kind !== 'links') return;
    const field = this.field(form, '添加页面');
    const inputRow = field.createDiv({cls: 'nf-home-link-picker'});
    const input = inputRow.createEl('input', {type: 'search', placeholder: '搜索笔记名称或路径'});
    const datalist = form.createEl('datalist'); datalist.id = `nf-home-note-list-${++modalId}`; input.setAttribute('list', datalist.id);
    const selected = form.createEl('ul', {cls: 'nf-home-selected-links'});
    const files = this.app.vault.getMarkdownFiles().sort((a, b) => a.path.localeCompare(b.path));
    const suggestions = () => {
      const query = input.value.trim().toLocaleLowerCase(); datalist.replaceChildren();
      for (const file of files.filter(file => !query || file.path.toLocaleLowerCase().includes(query)).slice(0, 60)) datalist.createEl('option', {value: file.path, text: file.basename});
    };
    const render = () => {
      selected.replaceChildren(); if (this.draft.kind !== 'links') return;
      for (const path of this.draft.paths) {
        const file = this.app.vault.getFileByPath(path), row = selected.createEl('li');
        const label = row.createDiv(); label.createSpan({text: file?.basename ?? path});
        if (file && file.path !== `${file.basename}.md`) label.createEl('small', {text: file.path});
        iconButton(row, 'x', `移除 ${file?.basename ?? path}`, () => {
          if (this.draft.kind === 'links') {this.draft.paths = this.draft.paths.filter(item => item !== path); render();}
        });
      }
    };
    const add = () => {
      if (this.draft.kind !== 'links') return;
      const value = input.value.trim();
      const direct = this.app.vault.getFileByPath(value) ?? this.app.vault.getFileByPath(`${value}.md`);
      const matches = files.filter(file => file.basename === value);
      const file = direct instanceof TFile && direct.extension === 'md' ? direct : matches.length === 1 ? matches[0] : null;
      if (!file) {this.errorEl.textContent = '请选择一篇笔记；同名笔记请使用完整路径。'; return;}
      if (!this.draft.paths.includes(file.path)) this.draft.paths.push(file.path);
      input.value = ''; this.errorEl.textContent = ''; render(); suggestions(); input.focus();
    };
    button(inputRow, '添加', '', add);
    input.addEventListener('input', suggestions);
    input.addEventListener('keydown', event => {if (event.key === 'Enter') {event.preventDefault(); add();}});
    suggestions(); render();
  }

  private async save(cancel: HTMLButtonElement) {
    if (this.saving || !this.ready) return;
    const title = this.titleInput.value.trim();
    if (!title) {this.errorEl.textContent = '请输入模块名称。'; this.titleInput.focus(); return;}
    if (this.draft.kind === 'links') {
      if (!this.draft.paths.length) {this.errorEl.textContent = '请至少添加一篇笔记。'; return;}
    } else {
      const sourcePath = this.draft.source;
      const source = this.sources.find(item => item.path === sourcePath);
      if (!source || !this.draft.view || !source.views.includes(this.draft.view)) {this.errorEl.textContent = '请选择可用的数据来源和视图。'; return;}
      if (this.draft.kind === 'summary' && this.draft.operation !== 'count' && !this.draft.property) {this.errorEl.textContent = '请选择要统计的属性。'; return;}
    }
    const module = {...this.draft, title};
    const controls = [...this.contentEl.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>('input, select, button')]
      .map(control => ({control, disabled: control.disabled}));
    this.saving = true;
    for (const {control} of controls) control.disabled = true;
    this.saveButton.disabled = true; cancel.disabled = true; this.errorEl.textContent = '';
    try {
      const saved = await this.host.saveModule(module);
      if (saved) this.close();
      else if (!this.closed) this.errorEl.textContent = '未能保存，你的配置仍保留在这里，可以重试。';
    } catch (error) {if (!this.closed) this.errorEl.textContent = error instanceof Error ? error.message : '未能保存，请重试。';}
    finally {this.saving = false; if (!this.closed) for (const {control, disabled} of controls) control.disabled = disabled;}
  }
}
