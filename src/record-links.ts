import {App, Modal, TFile, parseLinktext, setIcon} from 'obsidian';
import type {CachedMetadata, Reference} from 'obsidian';
import {loadRecordLayout, RECORD_LAYOUT_FILE, recordLayoutValue, relatedRecordRows} from './record-layout';
import type {RecordLayout, RecordTab} from './record-layout';
import {recordUrl, isPreviewImage} from './record-url';
import {recordDate} from './record-date';
import {ideaTone} from './idea-table';
import {currencyDigits, decimalUnits, formatUnits, unavailableFormula} from './finance-model';

export type RecordLink = {
  link: string; label: string; property: string; kind: 'property' | 'body' | 'attachment';
  file: TFile | null;
};
export type RecordBacklink = {file: TFile; label: string; count: number; contexts: string[]};
export type RecordProperty = {name: string; value: unknown; snapshot: boolean; unavailable: boolean};
export type RecordDetails = {
  file: TFile; title: string; indexed: boolean; properties: RecordProperty[]; outgoing: RecordLink[];
  incoming: RecordBacklink[]; sourceUrl: string | null; sourceId: string | null;
  collection: string | null; importedAt: string | null;
};

function text(value: unknown): string | null {return typeof value === 'string' && value.trim() ? value.trim() : null;}
function names(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export function recordTitle(app: App, file: TFile): string {
  const aliases: unknown = app.metadataCache.getFileCache(file)?.frontmatter?.aliases;
  return text(aliases) ?? (Array.isArray(aliases) ? aliases.map(text).find(Boolean) : null) ?? file.basename;
}

/** Only explicit source metadata can offer a remote navigation action. */
export function notionSourceUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null;
    const host = url.hostname.toLowerCase();
    return host === 'notion.so' || host.endsWith('.notion.so') || host === 'notion.site' ||
      host.endsWith('.notion.site') || host === 'app.notion.com' || host === 'www.notion.com' || host === 'notion.com'
      ? url.href : null;
  } catch {return null;}
}

function reference(app: App, source: TFile, ref: Reference, property: string, kind: RecordLink['kind']): RecordLink | null {
  // External URLs are not vault relations. In particular, never reinterpret a
  // protocol URL as an unresolved local record or create a note for it.
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(ref.link)) return null;
  const {path} = parseLinktext(ref.link);
  const file = path ? app.metadataCache.getFirstLinkpathDest(path, source.path) : source;
  const explicitLabel = ref.displayText && ref.displayText !== ref.link && ref.displayText !== file?.basename;
  return {link: ref.link, label: explicitLabel ? ref.displayText! : file ? recordTitle(app, file) : ref.displayText || ref.link,
    property, kind, file};
}

function outgoing(app: App, file: TFile, cache: CachedMetadata | null): RecordLink[] {
  const result: RecordLink[] = [], seen = new Set<string>();
  const add = (ref: Reference, property: string, kind: RecordLink['kind']) => {
    const item = reference(app, file, ref, property, kind);
    if (!item) return;
    // Preserve distinct fields and headings, but don't list the same relation
    // repeatedly merely because it appears twice in an array.
    const key = JSON.stringify([kind, property, item.file?.path ?? item.link, parseLinktext(item.link).subpath]);
    if (seen.has(key)) return;
    seen.add(key); result.push(item);
  };
  for (const ref of cache?.frontmatterLinks ?? []) {
    // Obsidian may append an array index to the key. Keep literal dotted
    // property names when they exist in the metadata.
    const property = Object.hasOwn(cache?.frontmatter ?? {}, ref.key) ? ref.key : ref.key.replace(/\.\d+$/, '');
    add(ref, property, 'property');
  }
  for (const ref of cache?.links ?? []) add(ref, '正文', 'body');
  for (const ref of cache?.embeds ?? []) add(ref, '附件', 'attachment');
  return result;
}

/** A read-only projection of public vault metadata; no note, Base or setting writes. */
export function inspectRecord(app: App, file: TFile): RecordDetails {
  const cache = app.metadataCache.getFileCache(file), fm: Record<string, unknown> = cache?.frontmatter ?? {};
  const snapshots = new Set(names(fm.nf_snapshot_fields)), unavailable = new Set(names(fm.nf_unavailable_fields));
  const properties = Object.entries(fm).filter(([name]) => !['position', 'aliases'].includes(name) && !name.startsWith('nf_'))
    .map(([name, value]) => ({name, value, snapshot: snapshots.has(name), unavailable: unavailable.has(name)}));
  for (const name of unavailable) if (!properties.some(property => property.name === name))
    properties.push({name, value: null, snapshot: snapshots.has(name), unavailable: true});
  const incoming: RecordBacklink[] = [];
  for (const [path, targets] of Object.entries(app.metadataCache.resolvedLinks)) {
    const count = targets[file.path];
    if (!(count > 0) || path === file.path) continue;
    const source = app.vault.getFileByPath(path);
    if (!source) continue;
    const contexts = [...new Set(outgoing(app, source, app.metadataCache.getFileCache(source))
      .filter(link => link.file?.path === file.path).map(link => link.property))];
    incoming.push({file: source, label: recordTitle(app, source), count, contexts});
  }
  incoming.sort((a, b) => a.file.path.localeCompare(b.file.path));
  return {file, title: recordTitle(app, file), indexed: cache !== null, properties, outgoing: outgoing(app, file, cache), incoming,
    sourceUrl: notionSourceUrl(fm.nf_source_url), sourceId: text(fm.nf_source_id),
    collection: text(fm.nf_source_collection), importedAt: text(fm.nf_imported_at)};
}

function propertyText(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.map(propertyText).join('、') || '—';
  if (typeof value === 'object') {
    try {return JSON.stringify(value);} catch {return '无法显示此属性';}
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint')
    return String(value);
  return '无法显示此属性';
}

export class RecordInspectorModal extends Modal {
  private generation = 0;
  private activeLayout = false;
  private history: TFile[] = [];
  constructor(app: App, private file: TFile) {super(app);}

  onOpen() {this.render();}
  onClose() {this.generation++; this.contentEl.replaceChildren();}

  private render() {
    const generation = ++this.generation;
    this.activeLayout = false;
    this.modalEl.classList.remove('nf-record-layout-modal');
    this.contentEl.replaceChildren(); this.contentEl.addClass('bui-record-inspector');
    const file = this.app.vault.getFileByPath(this.file.path);
    if (file !== this.file) {
      this.setTitle('记录已移动或删除');
      this.contentEl.createEl('p', {text: '请从数据库重新打开这条记录。'}); return;
    }
    const details = inspectRecord(this.app, file);
    this.setTitle(details.title);
    const actions = this.contentEl.createDiv({cls: 'bui-record-actions'});
    if (this.history.length) {
      const back = actions.createEl('button', {text: '返回上一记录'});
      back.addEventListener('click', () => {this.file = this.history.pop()!; this.render();});
    }
    const open = actions.createEl('button', {text: '打开笔记'});
    open.addEventListener('click', () => {void this.openFile(file);});
    if (details.sourceUrl) actions.createEl('a', {text: '打开 Notion 原记录 ↗', cls: 'external-link',
      attr: {href: details.sourceUrl, target: '_blank', rel: 'noopener noreferrer'}});
    const refresh = actions.createEl('button', {text: '刷新', cls: 'bui-record-refresh'});
    refresh.addEventListener('click', () => this.render());
    if (!details.indexed) this.contentEl.createEl('p', {text: '笔记仍在索引中，完成后请刷新。', cls: 'bui-record-caption'});
    const parts = file.path.split('/'); parts.pop();
    const hasConfig = Array.from({length: parts.length + 1}, (_, i) => [...parts.slice(0, i), RECORD_LAYOUT_FILE].join('/'))
      .some(path => this.app.vault.getFileByPath(path));
    if (!details.collection || !hasConfig) {this.renderDetails(this.contentEl, details); return;}
    const loading = this.contentEl.createEl('p', {text: '正在读取记录布局…', cls: 'bui-record-caption'});
    void loadRecordLayout(this.app, file, details.collection).then(result => {
      if (generation !== this.generation) return;
      loading.remove();
      if (result.error) this.contentEl.createEl('p', {text: result.error, cls: 'bui-record-caption', attr: {role: 'status'}});
      if (result.profile) {
        this.activeLayout = true;
        this.modalEl.classList.add('nf-record-layout-modal');
        this.renderLayout(details, result.profile);
        const raw = this.contentEl.createEl('details', {cls: 'nf-record-layout-raw'});
        raw.createEl('summary', {text: '全部属性与原始关联'});
        this.renderDetails(raw, details);
      } else this.renderDetails(this.contentEl, details);
    }).catch(() => {
      if (generation !== this.generation) return;
      loading.remove();
      this.contentEl.createEl('p', {text: '无法展示记录布局，请刷新或打开原笔记。', attr: {role: 'alert'}});
    });
  }

  private renderDetails(parent: HTMLElement, details: RecordDetails) {
    const related = this.section('此记录关联到', parent);
    if (!details.outgoing.length) related.createEl('p', {text: '暂无本地关联', cls: 'bui-record-caption'});
    for (const link of details.outgoing) {
      const row = related.createDiv({cls: 'bui-record-link-row'});
      row.createSpan({text: link.property, cls: 'bui-record-context'});
      if (link.file) this.fileButton(row, link.file, link.label, link.link);
      else row.createSpan({text: `${link.label} · 未解析的本地链接`, cls: 'bui-record-unresolved'});
    }
    const back = this.section('关联到此记录', parent);
    if (!details.incoming.length) back.createEl('p', {text: '暂无反向关联', cls: 'bui-record-caption'});
    for (const link of details.incoming) {
      const row = back.createDiv({cls: 'bui-record-link-row'});
      row.createSpan({text: link.contexts.join('、') || '笔记链接', cls: 'bui-record-context'});
      this.fileButton(row, link.file, link.label);
      row.createSpan({text: `${link.count} 处引用`, cls: 'bui-record-caption'});
    }
    const fields = this.section('属性', parent);
    const available = details.properties.filter(property => !property.unavailable);
    if (!available.length) fields.createEl('p', {text: '暂无属性', cls: 'bui-record-caption'});
    const list = fields.createEl('dl', {cls: 'bui-record-properties'});
    for (const property of available) {
      const term = list.createEl('dt', {text: property.name});
      if (property.snapshot) term.createSpan({text: '快照', cls: 'bui-record-badge'});
      const value = list.createEl('dd');
      const relations = details.outgoing.filter(link => link.kind === 'property' && link.property === property.name);
      const items = Array.isArray(property.value) ? property.value : [property.value];
      for (const item of items) this.propertyValue(value, item, relations);
      if (!items.length) value.textContent = '—';
    }
    if (details.properties.some(property => property.snapshot)) fields.createEl('p', {
      text: '快照保留导入时的公式或汇总结果，不会在本地重新计算。', cls: 'bui-record-caption'});
    const unavailable = details.properties.filter(property => property.unavailable);
    if (unavailable.length) {
      const missing = parent.createEl('details', {cls: 'bui-record-section bui-record-unavailable'});
      missing.createEl('summary', {text: `源数据未提供的属性（${unavailable.length}）`});
      missing.createEl('p', {text: '这些字段没有可用的导入结果，不代表零值或空结果。', cls: 'bui-record-caption'});
      const names = missing.createEl('ul');
      for (const property of unavailable) names.createEl('li', {text: property.name});
    }
    if (details.sourceId || details.collection || details.importedAt) {
      const source = parent.createEl('details', {cls: 'bui-record-section bui-record-provenance'});
      source.createEl('summary', {text: '来源信息'});
      for (const [label, value] of [['记录 ID', details.sourceId], ['数据库', details.collection], ['备份时间', details.importedAt]])
        if (value) source.createEl('p', {text: `${label}：${value}`, cls: 'bui-record-source-id'});
    }
  }

  private section(title: string, parent = this.contentEl): HTMLElement {
    const section = parent.createEl('section', {cls: 'bui-record-section'});
    section.createEl('h3', {text: title}); return section;
  }

  private fileButton(parent: HTMLElement, file: TFile, label: string, link?: string) {
    const button = parent.createEl('button', {cls: 'bui-record-file', attr: {type: 'button', title: file.path}});
    const icon = button.createSpan({cls: 'bui-record-file-icon'}); setIcon(icon, file.extension === 'md' ? 'file-text' : 'paperclip');
    button.createSpan({text: label});
    button.addEventListener('click', event => {void this.navigateFile(file, event.metaKey || event.ctrlKey, link);});
  }

  private propertyValue(parent: HTMLElement, value: unknown, relations: RecordLink[]) {
    const item = parent.createDiv({cls: 'bui-record-property-item'});
    // A files/media property can contain wiki links, external URLs and plain
    // text together. Decorate each complete wiki link without dropping its
    // neighbours or treating prose containing a link as the entire value.
    const wiki = typeof value === 'string' ? /^\s*\[\[([^\n]+)\]\]\s*$/.exec(value) : null;
    const pieces = wiki?.[1].split('|'), target = pieces?.[0];
    const link = target ? relations.find(relation => relation.link === target) : undefined;
    if (!link) {this.layoutValue(item, value, false, false); return;}
    const label = pieces && pieces.length > 1 ? pieces.slice(1).join('|') : link.label;
    if (link.file) this.fileButton(item, link.file, label, link.link);
    else item.createSpan({text: `${label} · 未解析的本地链接`, cls: 'bui-record-unresolved'});
  }

  private renderLayout(details: RecordDetails, profile: RecordLayout) {
    const root = this.contentEl.createDiv({cls: 'nf-record-layout'});
    const values: Record<string, unknown> = this.app.metadataCache.getFileCache(details.file)?.frontmatter ?? {};
    if (profile.metrics.length) {
      const metrics = root.createDiv({cls: 'nf-record-layout-metrics'});
      for (const metric of profile.metrics) {
        const state = recordLayoutValue(values, metric.property), item = metrics.createDiv({cls: 'nf-record-layout-metric'});
        item.createSpan({text: metric.label ?? metric.property, cls: 'nf-record-layout-metric-label'});
        const value = item.createSpan({cls: 'nf-record-layout-metric-value'});
        this.layoutValue(value, state.value, state.unavailable, metric.format === 'number', metric.currency);
        if (state.snapshot) item.createSpan({text: '来源快照', cls: 'bui-record-badge'});
      }
      root.createEl('p', {text: '指标保留来源值；未取得的计算结果不代表零，也不会以当前样本推算。', cls: 'bui-record-caption'});
    }
    if (!profile.tabs.length) return;
    const tabs = root.createDiv({cls: 'nf-record-layout-tabs', attr: {role: 'tablist', 'aria-label': '关联记录'}});
    const panels = root.createDiv({cls: 'nf-record-layout-panels'});
    const controls: {button: HTMLButtonElement; panel: HTMLElement}[] = [];
    const activate = (index: number) => controls.forEach(({button, panel}, i) => {
      button.setAttribute('aria-selected', String(i === index)); button.tabIndex = i === index ? 0 : -1; panel.hidden = i !== index;
    });
    profile.tabs.forEach((tab, index) => {
      const result = relatedRecordRows(this.app, details.file, tab);
      const button = tabs.createEl('button', {text: `${tab.label} · ${result.rows.length}`, attr: {type: 'button', role: 'tab'}});
      const panel = panels.createDiv({cls: 'nf-record-layout-panel', attr: {role: 'tabpanel', 'aria-label': tab.label}});
      controls.push({button, panel});
      button.addEventListener('click', () => activate(index));
      button.addEventListener('keydown', event => {
        const target = event.key === 'ArrowRight' ? (index + 1) % profile.tabs.length : event.key === 'ArrowLeft' ? (index + profile.tabs.length - 1) % profile.tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? profile.tabs.length - 1 : -1;
        if (target < 0) return;
        event.preventDefault(); activate(target); controls[target].button.focus();
      });
      if (result.unresolved.length) panel.createEl('p', {text: `${result.unresolved.length} 条关联尚未导入（含外部链接）；本表仅展示已有的本地记录，不能代表完整账本。`, cls: 'bui-record-caption'});
      if (!result.rows.length) {panel.createEl('p', {text: '暂无符合条件的本地关联记录', cls: 'bui-record-caption'}); return;}
      const scroll = panel.createDiv({cls: 'nf-record-layout-table-scroll'});
      const table = scroll.createEl('table', {cls: 'nf-record-layout-table'}), head = table.createEl('thead').createEl('tr');
      for (const property of tab.columns) {
        const cell = head.createEl('th', {text: tab.labels && Object.hasOwn(tab.labels, property) ? tab.labels[property] : property, attr: {scope: 'col'}});
        cell.classList.toggle('nf-record-layout-tag-cell', tab.tagProperties?.includes(property) ?? false);
        cell.classList.toggle('nf-record-layout-number', tab.numberProperties?.includes(property) ?? false);
      }
      const body = table.createEl('tbody');
      for (const row of result.rows) {
        const tr = body.createEl('tr');
        for (const property of tab.columns) {
          const cell = tr.createEl('td', {cls: property === tab.titleProperty ? 'nf-record-layout-title' : ''}), state = recordLayoutValue(row.values, property, false);
          cell.classList.toggle('nf-record-layout-tag-cell', tab.tagProperties?.includes(property) ?? false);
          cell.classList.toggle('nf-record-layout-number', tab.numberProperties?.includes(property) ?? false);
          if (recordDate(state.value) || typeof state.value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(state.value)) cell.classList.add('nf-record-layout-date');
          if (property === tab.titleProperty) this.fileButton(cell, row.file, typeof state.value === 'string' && state.value ? state.value : recordTitle(this.app, row.file));
          else this.layoutCell(cell, row.file, property, state.value, state.unavailable, tab);
          if (state.snapshot) cell.createSpan({text: '快照', cls: 'bui-record-badge'});
        }
      }
    });
    activate(0);
  }

  private layoutCell(parent: HTMLElement, file: TFile, property: string, value: unknown, unavailable: boolean, tab: RecordTab) {
    if (unavailable) {this.layoutValue(parent, value, true, false); return;}
    const list = (Array.isArray(value) ? value : [value]).filter(item => item !== undefined && item !== null && item !== '');
    for (const item of list) {
      const cell = parent.createDiv({cls: tab.tagProperties?.includes(property) ? 'nf-record-layout-tag nf-finance-tag' : 'nf-record-layout-item'});
      if (tab.tagProperties?.includes(property)) cell.dataset.buiTone = ideaTone(propertyText(item), property);
      const wiki = typeof item === 'string' ? /^\s*\[\[([^\n]+)\]\]\s*$/.exec(item) : null;
      if (wiki) {
        const pieces = wiki[1].split('|'), parsed = parseLinktext(pieces[0]);
        const target = this.app.metadataCache.getFirstLinkpathDest(parsed.path, file.path);
        if (target && tab.attachmentProperties?.includes(property) && isPreviewImage(target.path)) {
          const label = pieces[1] || target.name;
          const button = cell.createEl('button', {cls: 'nf-record-layout-thumbnail', attr: {type: 'button', 'aria-label': `打开图片：${label}`}});
          button.createEl('img', {attr: {src: this.app.vault.getResourcePath(target), alt: label, loading: 'lazy'}});
          button.addEventListener('click', () => {void this.openFile(target);});
        } else if (target) this.fileButton(cell, target, pieces[1] || recordTitle(this.app, target), pieces[0]);
        else cell.createSpan({text: `${pieces[1] || pieces[0]} · 未导入`, cls: 'bui-record-unresolved'});
      } else this.layoutValue(cell, item, false, tab.numberProperties?.includes(property) ?? false);
    }
    if (!list.length) parent.textContent = '—';
  }

  private layoutValue(parent: HTMLElement, value: unknown, unavailable: boolean, numeric: boolean, currency?: string) {
    if (unavailable || typeof value === 'string' && unavailableFormula(value)) {parent.textContent = '未取得'; return;}
    if (numeric && value !== null && value !== '') {
      const digits = currency ? currencyDigits(currency) : 2, parsed = decimalUnits(value, digits);
      if ('units' in parsed) {parent.textContent = `${currency ? currency + ' ' : ''}${formatUnits(parsed.units, digits)}`; return;}
    }
    const date = recordDate(value);
    if (date) {parent.textContent = date.text; parent.setAttribute('title', date.source); return;}
    const url = typeof value === 'string' ? recordUrl(value) : null;
    if (url) {
      parent.createEl('a', {text: url.label, cls: 'external-link', attr: {href: url.href, title: url.title, target: '_blank', rel: 'noopener noreferrer'}});
    } else if (typeof value === 'string' && /^https?:\/\//i.test(value)) parent.textContent = '无效外部链接';
    else parent.textContent = propertyText(value);
  }

  private async navigateFile(file: TFile, newTab: boolean, link?: string) {
    if (newTab || file.extension !== 'md' || link && parseLinktext(link).subpath) {await this.openFile(file, newTab, link); return;}
    if (this.app.vault.getFileByPath(file.path) !== file) {this.render(); return;}
    const generation = this.generation;
    const profile = this.activeLayout ? true : (await loadRecordLayout(this.app, file, inspectRecord(this.app, file).collection)).profile;
    if (generation !== this.generation) return;
    if (profile) {this.history.push(this.file); this.file = file; this.render();}
    else await this.openFile(file, newTab, link);
  }

  private async openFile(file: TFile, newTab = false, link?: string) {
    // A stale inspector must never recreate a missing note implicitly.
    if (this.app.vault.getFileByPath(file.path) !== file) {this.render(); return;}
    const subpath = link ? parseLinktext(link).subpath : '';
    const generation = this.generation;
    try {
      await this.app.workspace.getLeaf(newTab ? 'tab' : false).openFile(file,
        subpath ? {eState: {subpath}} : undefined);
      if (generation === this.generation) this.close();
    } catch {
      if (generation !== this.generation) return;
      this.contentEl.createEl('p', {text: '无法打开这条记录，请确认文件仍可用。', attr: {role: 'alert'}});
    }
  }
}

export function openRecordInspector(app: App, file: TFile): RecordInspectorModal {
  const modal = new RecordInspectorModal(app, file); modal.open(); return modal;
}
