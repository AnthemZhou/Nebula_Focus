import {BasesView, BooleanValue, ListValue, NullValue, NumberValue, Plugin, parseLinktext, setIcon} from 'obsidian';
import type {BasesEntry, BasesPropertyId, BasesViewConfig, QueryController, TFile, Value} from 'obsidian';
import {currencyDigits, decimalUnits, formatUnits, parseWikiLink, summarizeMoney, unavailableFormula} from './finance-model';
import type {MoneyIssue} from './finance-model';
import {ideaTone} from './idea-table';
import {isPreviewImage, recordUrl} from './record-url';

const ISSUE_LABELS: Record<MoneyIssue, string> = {
  'missing-amount': '金额为空', 'invalid-amount': '金额无效', precision: '金额精度超出范围',
  'negative-amount': '负金额需确认方向', 'missing-currency': '币种缺失或格式无效', 'unknown-currency': '币种无法识别', 'unknown-direction': '方向未配置或不属于收支',
};
const DEFAULT_ORDER: BasesPropertyId[] = ['note.交易日期', 'note.流水摘要', 'note.金额', 'note.币种', 'note.方向', 'note.关联项目'];

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
function property(config: BasesViewConfig, key: string, fallback: BasesPropertyId): BasesPropertyId {
  return config.getAsPropertyId(key) ?? fallback;
}
function settingText(config: BasesViewConfig, key: string, fallback: string): string {
  const value = config.get(key);
  return typeof value === 'string' ? value : fallback;
}
function columnWidth(config: BasesViewConfig, prop: BasesPropertyId): number | null {
  const widths = config.get('columnWidths');
  if (!widths || typeof widths !== 'object' || Array.isArray(widths) || !Object.hasOwn(widths, prop)) return null;
  const value = (widths as Record<string, unknown>)[prop];
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(Math.max(64, Math.min(960, value))) : null;
}
function text(value: Value | null): string {
  return !value || value instanceof NullValue ? '' : value.toString();
}
function scalar(value: Value | null): unknown {
  if (!value || value instanceof NullValue) return null;
  return value instanceof NumberValue ? Number(value.toString()) : value.toString();
}

type RenderedRow = {el: HTMLTableRowElement; signature: string};

/** Public Bases view: all reads come from the current query and metadata cache.
 * No frontmatter, Markdown, source files or financial allocations are changed. */
export class FinanceView extends BasesView {
  type = 'nebula-finance';
  private root: HTMLElement;
  private summary: HTMLElement;
  private hint: HTMLElement;
  private scopeNote: HTMLElement;
  private table: HTMLTableElement;
  private body: HTMLTableSectionElement;
  private rows = new Map<string, RenderedRow>();
  private groups = new Map<string, HTMLTableRowElement>();
  private entries = new Map<string, BasesEntry>();
  private columnSignature = '';

  constructor(controller: QueryController, containerEl: HTMLElement, private inspect?: (file: TFile) => void) {
    super(controller);
    this.root = containerEl.createDiv({cls: 'nf-finance'});
    this.summary = this.root.createDiv({cls: 'nf-finance-summary', attr: {'aria-label': '当前筛选结果收支汇总'}});
    this.hint = this.root.createDiv({cls: 'nf-finance-hint'});
    this.scopeNote = this.root.createDiv({cls: 'nf-finance-scope-note'});
    const scroller = this.root.createDiv({cls: 'nf-finance-scroll', attr: {tabindex: '0', 'aria-label': '财务记录，可横向滚动'}});
    this.table = scroller.createEl('table', {cls: 'nf-finance-table'});
    this.table.createEl('caption', {cls: 'nf-finance-caption', text: '财务记录'});
    this.table.createEl('thead');
    this.body = this.table.createEl('tbody');
  }

  onunload(): void {this.root.remove(); this.rows.clear(); this.groups.clear(); this.entries.clear();}

  onDataUpdated(): void {
    const entries = this.data.data;
    const titleProp = property(this.config, 'titleProperty', 'note.流水摘要');
    const amountProp = property(this.config, 'amountProperty', 'note.金额');
    const directionProp = property(this.config, 'directionProperty', 'note.方向');
    const currencyProp = property(this.config, 'currencyProperty', 'note.币种');
    const order = this.config.getOrder();
    const columns = order.length ? order : DEFAULT_ORDER;
    const isTitle = (prop: BasesPropertyId) => prop === titleProp || prop === 'file.name' || prop === 'file.link';
    const iconProperty = columns.find(isTitle);
    const separateIcon = iconProperty === undefined;
    const widths = columns.map(prop => columnWidth(this.config, prop));
    const tags = new Set(strings(this.config.get('tagProperties')));
    const attachments = new Set(strings(this.config.get('attachmentProperties')));
    const numbers = new Set([...strings(this.config.get('numberProperties')), amountProp]);
    const columnSignature = JSON.stringify([columns.map((prop, index) => [prop, this.config.getDisplayName(prop), widths[index]]),
      iconProperty, [...tags], [...numbers]]);
    if (this.columnSignature !== columnSignature) {
      this.columnSignature = columnSignature;
      const head = this.table.tHead!;
      head.empty();
      const row = head.createEl('tr');
      if (separateIcon) row.createEl('th', {cls: 'nf-finance-icon-cell', text: '记录', attr: {scope: 'col'}});
      for (const [index, prop] of columns.entries()) {
        const cell = row.createEl('th', {text: this.config.getDisplayName(prop), attr: {scope: 'col'}});
        cell.classList.toggle('nf-finance-tag-cell', tags.has(prop));
        cell.classList.toggle('nf-finance-number', numbers.has(prop));
        this.applyWidth(cell, widths[index]);
      }
      this.rows.forEach(row => {row.signature = '';});
    }
    this.entries = new Map(entries.map(entry => [entry.file.path, entry]));
    const showSummaries = this.config.get('showSummaries') !== false;
    this.summary.hidden = !showSummaries;
    this.hint.hidden = !showSummaries;
    this.hint.textContent = showSummaries ? '汇总按币种分别计算。编辑记录请切换到表格视图。' : '';
    const scopeNote = settingText(this.config, 'scopeNote', '').trim();
    this.scopeNote.textContent = scopeNote;
    this.scopeNote.hidden = !scopeNote;
    if (showSummaries) this.renderSummary(entries, amountProp, currencyProp, directionProp);
    const desired: HTMLElement[] = [];
    const currentRows = new Set<string>();
    const currentGroups = new Set<string>();
    let groupIndex = 0;
    for (const group of this.data.groupedData) {
      const groupKey = String(groupIndex++) + ':' + text(group.key ?? null);
      if (group.hasKey()) {
        const key = groupKey;
        currentGroups.add(key);
        let row = this.groups.get(key);
        if (!row) {row = this.body.createEl('tr', {cls: 'nf-finance-group'}); row.createEl('th', {attr: {scope: 'rowgroup'}}); this.groups.set(key, row);}
        const cell = row.firstElementChild as HTMLTableCellElement;
        cell.colSpan = columns.length + Number(separateIcon); cell.empty();
        const name = cell.createDiv({cls: 'nf-finance-group-name'});
        this.renderValue(name, group.key ?? null, '', false, '');
        name.createSpan({text: ` · ${group.entries.length}`});
        if (showSummaries) {
          const totals = cell.createDiv({cls: 'nf-finance-group-summary'});
          this.renderSummary(group.entries, amountProp, currencyProp, directionProp, totals, false);
        }
        desired.push(row);
      }
      for (const entry of group.entries) {
        const key = groupKey + '\u0000' + entry.file.path;
        currentRows.add(key);
        const metadata = this.app.metadataCache.getFileCache(entry.file)?.frontmatter;
        const snapshots = strings(metadata?.nf_snapshot_fields);
        const unavailable = strings(metadata?.nf_unavailable_fields);
        const currency = text(this.availableValue(entry, currencyProp));
        const signature = JSON.stringify([columns.map(p => text(entry.getValue(p))), text(entry.getValue(titleProp)),
          currency, snapshots, unavailable, [...tags], [...numbers], [...attachments]]);
        let row = this.rows.get(key);
        if (!row) {row = {el: this.body.createEl('tr'), signature: ''}; this.rows.set(key, row);}
        if (row.signature !== signature) {
          row.el.empty(); row.signature = signature;
          const rawTitle = text(entry.getValue(titleProp));
          const title = parseWikiLink(rawTitle)?.label || rawTitle || entry.file.basename;
          if (separateIcon) this.recordIcon(row.el.createEl('td', {cls: 'nf-finance-icon-cell'}), entry, title);
          for (const [index, prop] of columns.entries()) {
            const cell = row.el.createEl('td');
            cell.classList.toggle('nf-finance-number', numbers.has(prop));
            cell.classList.toggle('nf-finance-tag-cell', tags.has(prop));
            this.applyWidth(cell, widths[index]);
            const name = prop.replace(/^(note|formula|file)\./, '');
            const value = entry.getValue(prop);
            let target: HTMLElement = cell;
            if (isTitle(prop)) {
              cell.classList.add('nf-finance-title-cell');
              target = cell.createDiv({cls: 'nf-finance-title-content'});
              if (prop === iconProperty) this.recordIcon(target, entry, title);
            }
            if ((prop.startsWith('note.') && unavailable.includes(name)) || unavailableFormula(text(value))) {
              target.createSpan({cls: 'nf-finance-unavailable', text: '未取得', attr: {title: '此字段的 Notion 计算结果尚未取得；未计作零。'}});
            } else if (isTitle(prop)) {
              const button = target.createEl('button', {cls: 'nf-finance-link nf-finance-record-title', text: title});
              button.addEventListener('click', () => this.openRecord(entry.file.path));
            } else if (numbers.has(prop)) {
              this.renderNumber(cell, value, currency);
            } else this.renderValue(cell, value, entry.file.path, tags.has(prop), name, attachments.has(prop));
            if (prop.startsWith('note.') && snapshots.includes(name)) cell.createSpan({cls: 'nf-finance-snapshot', text: '快照', attr: {title: '来自导入时的计算结果，不在本地重新计算。'}});
          }
        }
        desired.push(row.el);
      }
    }
    for (const [key, row] of this.rows) if (!currentRows.has(key)) {row.el.remove(); this.rows.delete(key);}
    for (const [key, row] of this.groups) if (!currentGroups.has(key)) {row.remove(); this.groups.delete(key);}
    // Retain unchanged row nodes and their keyboard focus during metadata/cache
    // updates; a changed filter or explicit sort alone moves their positions.
    let cursor = this.body.firstElementChild;
    for (const row of desired) {
      if (cursor === row) cursor = cursor.nextElementSibling;
      else this.body.insertBefore(row, cursor);
    }
    this.root.classList.toggle('is-empty', entries.length === 0);
    const tableLabel = settingText(this.config, 'tableLabel', '财务记录').trim() || '财务记录';
    this.table.caption!.textContent = entries.length ? `${tableLabel} · ${entries.length} 条` : `${tableLabel} · 当前筛选下没有记录`;
  }

  private applyWidth(cell: HTMLElement, width: number | null): void {
    if (width === null) return;
    cell.classList.add('nf-finance-sized-column');
    cell.style.setProperty('--nf-finance-column-width', `${width}px`);
  }

  private recordIcon(parent: HTMLElement, entry: BasesEntry, title: string): void {
    const icon = parent.createEl('button', {cls: 'nf-finance-record-icon', attr: {type: 'button', 'aria-label': `查看记录与关联：${title}`}});
    setIcon(icon, 'file-text');
    icon.addEventListener('click', () => this.openRecord(entry.file.path));
  }

  private openRecord(path: string): void {
    const entry = this.entries.get(path);
    if (!entry || this.app.vault.getFileByPath(path) !== entry.file) return;
    if (this.inspect) this.inspect(entry.file);
    else this.openNativeFile(entry.file);
  }

  private openNativeFile(file: TFile, subpath = ''): void {
    if (this.app.vault.getFileByPath(file.path) !== file) return;
    void this.app.workspace.getLeaf(false).openFile(file, subpath ? {eState: {subpath}} : undefined);
  }

  private renderSummary(entries: BasesEntry[], amount: BasesPropertyId, currency: BasesPropertyId, direction: BasesPropertyId,
    target = this.summary, showCount = true): void {
    const result = summarizeMoney(entries.map(entry => ({amount: scalar(this.availableValue(entry, amount)),
      currency: scalar(this.availableValue(entry, currency)), direction: scalar(this.availableValue(entry, direction))})),
    settingText(this.config, 'incomeValue', '收入'), settingText(this.config, 'expenseValue', '支出'));
    target.empty();
    if (showCount) target.createDiv({cls: 'nf-finance-summary-scope', text: `当前筛选 · ${result.rows} 条 · ${result.included} 条计入收支`});
    for (const total of result.currencies) {
      const group = target.createDiv({cls: 'nf-finance-currency'});
      group.createSpan({cls: 'nf-finance-currency-name', text: total.currency});
      for (const [label, value, cls] of [['收入', total.income, 'income'], ['支出', total.expense, 'expense'], ['净额', total.income - total.expense, 'net']] as const) {
        const item = group.createDiv({cls: 'nf-finance-total ' + cls});
        item.createSpan({text: label}); item.createEl('strong', {text: formatUnits(value, total.digits)});
      }
    }
    if (result.excluded) {
      const details = target.createEl('details', {cls: 'nf-finance-exclusions'});
      details.createEl('summary', {text: `${result.excluded} 条未计入收支汇总`});
      const list = details.createEl('ul');
      for (const [issue, count] of Object.entries(result.issues)) list.createEl('li', {text: `${ISSUE_LABELS[issue as MoneyIssue]}：${count}`});
    }
  }

  private availableValue(entry: BasesEntry, prop: BasesPropertyId): Value | null {
    const unavailable: unknown = this.app.metadataCache.getFileCache(entry.file)?.frontmatter?.nf_unavailable_fields;
    if (prop.startsWith('note.') && strings(unavailable).includes(prop.slice(5))) return null;
    const value = entry.getValue(prop);
    return unavailableFormula(text(value)) ? null : value;
  }

  private renderNumber(cell: HTMLElement, value: Value | null, currency: string): void {
    if (!value || value instanceof NullValue) {cell.createSpan({cls: 'nf-finance-empty', text: '—'}); return;}
    const digits = currencyDigits(currency.trim().toUpperCase());
    const parsed = decimalUnits(scalar(value), digits);
    if ('units' in parsed) cell.createSpan({text: formatUnits(parsed.units, digits)});
    else {
      cell.createSpan({text: text(value)});
      cell.createSpan({cls: 'nf-finance-unavailable', text: '需核对', attr: {title: ISSUE_LABELS[parsed.issue]}});
    }
  }

  private renderValue(cell: HTMLElement, value: Value | null, sourcePath: string, tag: boolean, propertyName: string, attachment = false): void {
    if (!value || value instanceof NullValue || text(value) === '') {cell.createSpan({cls: 'nf-finance-empty', text: '—'}); return;}
    if (value instanceof ListValue) {
      const list = cell.createDiv({cls: 'nf-finance-values'});
      if (attachment) list.classList.add('nf-finance-attachments');
      for (let i = 0; i < value.length(); i++) this.renderValue(list, value.get(i), sourcePath, tag, propertyName, attachment);
      return;
    }
    if (value instanceof BooleanValue) {cell.createSpan({text: value.isTruthy() ? '是' : '否'}); return;}
    const raw = text(value);
    if (unavailableFormula(raw)) {cell.createSpan({cls: 'nf-finance-unavailable', text: '未取得'}); return;}
    const link = parseWikiLink(raw);
    if (link) {
      const {path, subpath} = parseLinktext(link.target);
      const destination = attachment ? this.app.metadataCache.getFirstLinkpathDest(path, sourcePath) : null;
      const preview = attachment && destination && isPreviewImage(destination.path);
      cell.closest('td')?.classList.add(attachment ? 'nf-finance-attachment-cell' : 'nf-finance-relation');
      const button = cell.createEl('button', {cls: preview ? 'nf-finance-thumbnail' : 'nf-finance-link',
        attr: {type: 'button', 'aria-label': `打开${attachment ? '附件' : '记录'}：${link.label}`}});
      if (preview) {
        const image = button.createEl('img', {attr: {src: this.app.vault.getResourcePath(destination),
          alt: link.label, width: '32', height: '32', loading: 'lazy'}});
        image.addEventListener('error', () => {image.remove(); setIcon(button, 'paperclip');}, {once: true});
      } else button.textContent = link.label;
      button.addEventListener('click', () => {
        const destination = this.app.metadataCache.getFirstLinkpathDest(path, sourcePath);
        if (!destination || this.app.vault.getFileByPath(destination.path) !== destination) {
          button.title = '未解析的本地链接'; button.classList.add('nf-finance-unavailable'); return;
        }
        if (this.inspect && destination.extension === 'md' && !subpath && !attachment) this.inspect(destination);
        else this.openNativeFile(destination, subpath);
      });
    } else if (/^https?:\/\//i.test(raw)) {
      const url = recordUrl(raw);
      if (!url) {cell.createSpan({cls: 'nf-finance-unavailable', text: '链接无效'}); return;}
      const anchor = cell.createEl('a', {cls: 'nf-finance-link nf-finance-external', href: url.href,
        attr: {title: url.title, target: '_blank', rel: 'noopener noreferrer'}});
      anchor.createSpan({text: url.label, cls: 'nf-finance-external-label'});
      setIcon(anchor.createSpan({cls: 'nf-finance-external-icon'}), 'external-link');
      if (attachment) cell.createSpan({cls: 'nf-finance-unavailable', text: '未下载', attr: {title: '此附件保留外部链接，尚无本地文件。'}});
    } else {
      if (/^\d{4}[-/]\d{2}[-/]\d{2}(?:[T ].*)?$/.test(raw)) cell.closest('td')?.classList.add('nf-finance-date');
      const span = cell.createSpan({cls: tag ? 'nf-finance-tag' : '', text: raw});
      if (tag) span.dataset.buiTone = ideaTone(raw, propertyName);
    }
  }
}

export function registerFinanceView(plugin: Plugin, inspectRecord?: (file: TFile) => void): boolean {
  return plugin.registerBasesView('nebula-finance', {
    name: '财务关联', icon: 'wallet-cards', factory: (controller, container) => new FinanceView(controller, container, inspectRecord),
    options: () => [
      {type: 'property', key: 'titleProperty', displayName: '记录标题', default: 'note.流水摘要'},
      {type: 'property', key: 'amountProperty', displayName: '收支金额', default: 'note.金额'},
      {type: 'property', key: 'directionProperty', displayName: '收支方向', default: 'note.方向'},
      {type: 'property', key: 'currencyProperty', displayName: '币种', default: 'note.币种'},
      {type: 'text', key: 'incomeValue', displayName: '收入对应的值', default: '收入'},
      {type: 'text', key: 'expenseValue', displayName: '支出对应的值', default: '支出'},
      {type: 'toggle', key: 'showSummaries', displayName: '显示收支汇总', default: true},
      {type: 'text', key: 'scopeNote', displayName: '数据范围说明', default: ''},
      {type: 'text', key: 'tableLabel', displayName: '表格名称', default: '财务记录'},
      {type: 'multitext', key: 'tagProperties', displayName: '显示为标签的属性 ID'},
      {type: 'multitext', key: 'numberProperties', displayName: '显示为金额的其他属性 ID'},
      {type: 'multitext', key: 'attachmentProperties', displayName: '文件与媒体属性 ID'},
    ],
  });
}
