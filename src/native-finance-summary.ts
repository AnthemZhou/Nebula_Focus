import {NullValue, NumberValue, StringValue} from 'obsidian';
import {formatUnits, summarizeMoney, unavailableFormula} from './finance-model';
import type {MoneyIssue, MoneySummary} from './finance-model';
import {isIdeaEntry, object} from './idea-native';
import type {IdeaEntry, IdeaFile} from './idea-native';
import {tableProfile} from './table-profile';
import {isUnavailableValue} from './unavailable-value';

const ISSUE_LABELS: Record<MoneyIssue, string> = {
  'missing-amount': '金额为空', 'invalid-amount': '金额无效', precision: '金额精度超出范围',
  'negative-amount': '负金额需确认方向', 'missing-currency': '币种缺失或格式无效',
  'unknown-currency': '币种无法识别', 'unknown-direction': '方向未配置或不属于收支',
};

type SummaryConfig = {get(key: string): unknown};
function isSummaryConfig(value: unknown): value is SummaryConfig {
  return object(value) && typeof value.get === 'function';
}

function setting(config: SummaryConfig, key: string, fallback: string): string {
  const value = config.get(key);
  return typeof value === 'string' ? value : fallback;
}

function property(config: SummaryConfig, key: string, fallback: string): string {
  const value = setting(config, key, fallback);
  return /^(?:note|formula|file)\./.test(value) ? value : `note.${value}`;
}

/** Accept host Value objects and raw primitives without converting lists to money.
 * NumberValue remains a number so decimalUnits can reject unsafe numeric precision;
 * StringValue retains exact source decimals, including values beyond Number limits.
 */
function scalar(value: unknown): unknown {
  if (value === null || value === undefined || value instanceof NullValue) return null;
  if (value instanceof NumberValue) return Number(value.toString());
  if (value instanceof StringValue) return value.toString();
  return value;
}

function currentEntries(view: Record<string, unknown>): IdeaEntry[] | null {
  const controller = object(view.queryController) ? view.queryController : null;
  // queryData is the current filter result, not virtualized visible rows. Never
  // fall back to all vault files or group entries to synthesize a wider balance.
  const query = view.queryData ?? controller?.queryData ?? view.data;
  if (!object(query) || !Array.isArray(query.data) || !query.data.every(isIdeaEntry)) return null;
  return query.data;
}

type SummaryNode = {el: HTMLElement; signature: string};
type CreationWindow = Window & {createEl: typeof createEl; createFragment: typeof createFragment};

/** A read-only sibling of a native table. Native row virtualization cannot clear it. */
export class NativeFinanceSummary {
  private nodes = new Map<HTMLElement, SummaryNode>();

  constructor(private metadata: (file: IdeaFile) => unknown) {}

  refresh(value: unknown, root: HTMLElement): void {
    for (const [host, item] of this.nodes) if (host !== root && !host.isConnected) {
      item.el.remove(); this.nodes.delete(host);
    }
    try {
      if (!object(value) || value.type !== 'table' || !tableProfile(value) || !isSummaryConfig(value.config) ||
          value.config.get('showSummaries') !== true || !root.parentElement) {
        this.remove(root); return;
      }
      const entries = currentEntries(value);
      if (!entries) {this.remove(root); return;}
      const amount = property(value.config, 'amountProperty', 'note.金额');
      const currency = property(value.config, 'currencyProperty', 'note.币种');
      const direction = property(value.config, 'directionProperty', 'note.方向');
      const rows = entries.map(entry => {
        const metadata = this.metadata(entry.file);
        const unavailable: unknown = object(metadata) ? metadata.nf_unavailable_fields : undefined;
        const read = (prop: string): unknown => {
          const value = scalar(entry.getValue ? entry.getValue(prop)
            : prop.startsWith('note.') ? entry.getRawProperty?.(prop.slice(5)) : null);
          if (prop.startsWith('note.') && Array.isArray(unavailable) && unavailable.includes(prop.slice(5)) && isUnavailableValue(value)) return null;
          return typeof value === 'string' && unavailableFormula(value.trim()) ? null : value;
        };
        return {amount: read(amount), currency: read(currency), direction: read(direction)};
      });
      const result = summarizeMoney(rows, setting(value.config, 'incomeValue', '收入'), setting(value.config, 'expenseValue', '支出'));
      const signature = JSON.stringify(result, (_key, item: unknown) => typeof item === 'bigint' ? item.toString() : item);
      let node = this.nodes.get(root);
      if (!node) {
        const win = root.ownerDocument.win as CreationWindow;
        const el = win.createEl('section');
        el.className = 'nf-native-finance-summary';
        el.setAttribute('aria-label', '当前筛选记录的收支汇总');
        node = {el, signature: ''}; this.nodes.set(root, node);
      }
      if (node.el.nextElementSibling !== root) root.before(node.el);
      if (node.signature === signature) return;
      this.render(node.el, result); node.signature = signature;
    } catch {
      // An unrecognized native query or transient cache failure must not leave
      // stale totals visible or interrupt the table's own editing lifecycle.
      this.remove(root);
    }
  }

  clear(): void {
    for (const {el} of this.nodes.values()) el.remove();
    this.nodes.clear();
  }

  private remove(root: HTMLElement): void {
    this.nodes.get(root)?.el.remove(); this.nodes.delete(root);
  }

  private render(el: HTMLElement, result: MoneySummary): void {
    const expanded = el.querySelector('details')?.open ?? false;
    const win = el.ownerDocument.win as CreationWindow;
    const fragment = win.createFragment();
    const add = <K extends keyof HTMLElementTagNameMap>(parent: Node, tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => {
      const child = win.createEl(tag); child.className = cls;
      if (text !== undefined) child.textContent = text;
      parent.appendChild(child); return child;
    };
    add(fragment, 'span', 'nf-native-finance-summary-scope', `当前筛选 · ${result.rows} 条 · ${result.included} 条计入收支`);
    for (const total of result.currencies) {
      const currency = add(fragment, 'div', 'nf-native-finance-currency-group');
      add(currency, 'span', 'nf-native-finance-currency', total.currency);
      const group = add(currency, 'dl', 'nf-native-finance-totals');
      group.setAttribute('aria-label', total.currency);
      for (const [label, value, kind] of [['收入', total.income, 'income'], ['支出', total.expense, 'expense'], ['净额', total.income - total.expense, 'net']] as const) {
        // Keep each label/value pair together when a narrow pane wraps totals.
        const metric = add(group, 'div', 'nf-native-finance-metric');
        add(metric, 'dt', 'nf-native-finance-total-label', label);
        add(metric, 'dd', `nf-native-finance-total-value ${kind}`, formatUnits(value, total.digits));
      }
    }
    if (result.excluded) {
      const details = add(fragment, 'details', 'nf-native-finance-exclusions'); details.open = expanded;
      add(details, 'summary', '', `${result.excluded} 条未计入收支汇总`);
      const list = add(details, 'ul', '');
      for (const [issue, count] of Object.entries(result.issues)) add(list, 'li', '', `${ISSUE_LABELS[issue as MoneyIssue]}：${count}`);
    }
    el.replaceChildren(fragment);
  }
}
