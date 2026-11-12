import {BooleanValue, NullValue, NumberValue, StringValue} from 'obsidian';

export type HomeSummaryEntry = {file: {path: string}; getValue(property: string): unknown};
export type HomeSummaryOperation = 'count' | 'sum' | 'average';
export type HomeSummaryOptions = {operation: HomeSummaryOperation; property?: string; groupBy?: string};
export type HomeSummaryIssue = 'missing' | 'invalid' | 'unsafe' | 'invalid-group' | 'read-error';
export type HomeSummaryGroup = {
  label: string; value: string; count: number; excluded: number; available: boolean;
  approximate?: boolean; error?: 'unsafe-total';
};
export type HomeSummaryResult = {
  operation: HomeSummaryOperation; rows: number; included: number; excluded: number;
  issues: Partial<Record<HomeSummaryIssue, number>>; groups: HomeSummaryGroup[];
  error?: 'invalid-options' | 'read-error';
};
type Decimal = {units: bigint; scale: number};
type Bucket = {label: string; total: Decimal; count: number; excluded: number};
const ZERO = BigInt(0), TEN = BigInt(10), MAX = BigInt(Number.MAX_SAFE_INTEGER);
const LABELS: Record<HomeSummaryOperation, string> = {count: '记录数', sum: '合计', average: '平均值'};
const ISSUES: Record<HomeSummaryIssue, string> = {
  missing: '数字属性为空', invalid: '不是数字属性值', unsafe: '数值超出安全范围',
  'invalid-group': '分组属性不是单个值', 'read-error': '查询值暂未取得',
};
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function entry(value: unknown): value is HomeSummaryEntry {
  return record(value) && record(value.file) && typeof value.file.path === 'string' &&
    !!value.file.path && typeof value.getValue === 'function';
}

/** Only the complete current native filter result is eligible. A partial or
 * unfamiliar query must not become a visible-row count or a whole-vault total. */
export function homeQueryEntries(view: unknown): HomeSummaryEntry[] | null {
  try {
    if (!record(view) || view._loaded === false) return null;
    const controller = record(view.queryController) ? view.queryController : null;
    const query = view.queryData ?? controller?.queryData ?? view.data;
    if (!record(query) || !Array.isArray(query.data)) return null;
    const result: HomeSummaryEntry[] = [], paths = new Set<string>();
    for (const item of query.data) {
      if (!entry(item) || paths.has(item.file.path)) return null;
      paths.add(item.file.path); result.push(item);
    }
    return result;
  } catch {return null;}
}
function property(name: string | undefined): string {
  const value = name?.trim() ?? '';
  return !value || /^(?:note|file|formula)\./.test(value) ? value : `note.${value}`;
}
function missing(value: unknown): boolean {return value == null || value instanceof NullValue;}
function number(value: unknown): number | HomeSummaryIssue {
  if (missing(value)) return 'missing';
  // Text that looks numeric stays text. Only the actual native NumberValue API
  // may convert its own public numeric representation into a JS number.
  if (value instanceof NumberValue) {
    const text = value.toString().trim();
    if (!text) return 'invalid';
    value = Number(text);
  }
  if (typeof value !== 'number') return 'invalid';
  return Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER ? value : 'unsafe';
}
function decimal(value: number): Decimal {
  const [coefficient, exponentText = '0'] = String(value).toLowerCase().split('e');
  const dot = coefficient.indexOf('.');
  const scale = Math.max(0, (dot < 0 ? 0 : coefficient.length - dot - 1) - Number(exponentText));
  const exponent = Number(exponentText) - (dot < 0 ? 0 : coefficient.length - dot - 1);
  return {units: BigInt(coefficient.replace('.', '')) * (exponent > 0 ? TEN ** BigInt(exponent) : BigInt(1)), scale};
}
function add(total: Decimal, next: Decimal): Decimal {
  const scale = Math.max(total.scale, next.scale);
  return {units: total.units * TEN ** BigInt(scale - total.scale) + next.units * TEN ** BigInt(scale - next.scale), scale};
}
function absolute(value: bigint): bigint {return value < ZERO ? -value : value;}
function fixed(units: bigint, scale: number): string {
  const raw = absolute(units).toString().padStart(scale + 1, '0');
  const whole = scale ? raw.slice(0, -scale) : raw;
  const fraction = scale ? raw.slice(-scale).replace(/0+$/, '') : '';
  return `${units < ZERO ? '−' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}
function quotient(total: Decimal, count: number): {value: string; approximate: boolean} {
  const denominator = TEN ** BigInt(total.scale) * BigInt(count);
  const magnitude = absolute(total.units), negative = total.units < ZERO;
  // Eight displayed fractional digits normally suffice. For tiny nonzero
  // values use scientific notation rather than rounding the whole value to 0.
  let exponent = 0;
  if (magnitude && magnitude * TEN ** BigInt(8) < denominator) {
    while (magnitude * TEN ** BigInt(exponent) < denominator) exponent++;
  }
  const scaled = magnitude * TEN ** BigInt(8 + exponent);
  const remainder = scaled % denominator;
  let rounded = scaled / denominator;
  if (remainder * BigInt(2) >= denominator) rounded++;
  const value = fixed(negative ? -rounded : rounded, 8);
  return {value: exponent ? `${value}e-${exponent}` : value, approximate: remainder !== ZERO};
}
function group(value: unknown): {key: string; label: string} | null {
  if (missing(value)) return {key: 'missing', label: '未分组'};
  if (value instanceof StringValue) value = value.toString();
  else if (value instanceof BooleanValue) {
    const text = value.toString();
    if (text !== 'true' && text !== 'false') return null;
    value = text === 'true';
  } else if (value instanceof NumberValue) {
    const parsed = number(value);
    if (typeof parsed !== 'number') return null;
    value = parsed;
  }
  if (typeof value === 'string') {
    const label = value.trim().normalize('NFC');
    return label ? {key: `text:${label}`, label} : {key: 'missing', label: '未分组'};
  }
  if (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER)
    return {key: `number:${value}`, label: String(value)};
  if (typeof value === 'boolean') return {key: `boolean:${value}`, label: value ? '是' : '否'};
  return null;
}

/** Arithmetic stays in decimal integer units; a string never becomes a number,
 * missing results never become zero, and configured groups never share a total. */
export function summarizeHome(entries: readonly HomeSummaryEntry[], options: HomeSummaryOptions): HomeSummaryResult {
  const {operation} = options;
  const result: HomeSummaryResult = {operation, rows: entries.length, included: 0, excluded: 0, issues: {}, groups: []};
  const measure = property(options.property), grouping = property(options.groupBy);
  if (!Object.hasOwn(LABELS, operation) || operation !== 'count' && !measure) {
    result.error = 'invalid-options'; return result;
  }
  const buckets = new Map<string, Bucket>();
  const reject = (issue: HomeSummaryIssue, bucket?: Bucket) => {
    result.excluded++; result.issues[issue] = (result.issues[issue] ?? 0) + 1;
    if (bucket) bucket.excluded++;
    if (issue === 'read-error') result.error = 'read-error';
  };
  if (!grouping) buckets.set('all', {label: LABELS[operation], total: {units: ZERO, scale: 0}, count: 0, excluded: 0});
  for (const item of entries) {
    let bucket: Bucket | undefined;
    try {
      const classification = grouping ? group(item.getValue(grouping)) : {key: 'all', label: LABELS[operation]};
      if (!classification) {reject('invalid-group'); continue;}
      bucket = buckets.get(classification.key);
      if (!bucket) {
        bucket = {label: classification.label, total: {units: ZERO, scale: 0}, count: 0, excluded: 0};
        buckets.set(classification.key, bucket);
      }
      if (operation !== 'count') {
        const value = number(item.getValue(measure));
        if (typeof value !== 'number') {reject(value, bucket); continue;}
        bucket.total = add(bucket.total, decimal(value));
      }
      bucket.count++; result.included++;
    } catch {reject('read-error', bucket);}
  }
  for (const bucket of buckets.values()) {
    const output: HomeSummaryGroup = {label: bucket.label, value: '未取得', count: bucket.count, excluded: bucket.excluded, available: false};
    if (!result.error && (operation === 'count' || bucket.count)) {
      const denominator = TEN ** BigInt(bucket.total.scale) * BigInt(operation === 'average' ? bucket.count : 1);
      if (operation !== 'count' && absolute(bucket.total.units) > MAX * denominator) output.error = 'unsafe-total';
      else {
        output.available = true;
        if (operation === 'count') output.value = String(bucket.count);
        else if (operation === 'sum') output.value = fixed(bucket.total.units, bucket.total.scale);
        else Object.assign(output, quotient(bucket.total, bucket.count));
      }
    }
    result.groups.push(output);
  }
  return result;
}

type CreationWindow = Window & {createEl: typeof createEl; createFragment: typeof createFragment};
const rendered = new WeakMap<HTMLElement, {signature: string; children: ChildNode[]}>();
/** Theme classes are supplied by Home; no note content or native rows change. */
export function renderHomeSummary(host: HTMLElement, result: HomeSummaryResult): void {
  const signature = JSON.stringify(result);
  const previous = rendered.get(host);
  if (previous?.signature === signature && previous.children.length === host.childNodes.length &&
      previous.children.every((child, index) => host.childNodes[index] === child)) return;
  const expanded = host.querySelector('details')?.open ?? false;
  const win = host.ownerDocument.win as CreationWindow;
  const fragment = win.createFragment();
  const add = <K extends keyof HTMLElementTagNameMap>(parent: Node, tag: K, cls: string, text?: string) => {
    const el = win.createEl(tag); el.className = cls;
    if (text !== undefined) el.textContent = text;
    parent.appendChild(el); return el;
  };
  add(fragment, 'p', 'nf-home-summary-scope', `当前筛选 · ${result.rows} 条 · ${result.included} 条计入`);
  if (result.error) add(fragment, 'p', 'nf-home-summary-error', result.error === 'invalid-options'
    ? '未取得：请选择有效的统计方式和数字属性。' : '未取得：部分查询值暂时无法读取，请等待数据库刷新。');
  else {
    const list = add(fragment, 'dl', 'nf-home-summary-groups');
    list.setAttribute('aria-label', LABELS[result.operation]);
    for (const group of result.groups) {
      const metric = add(list, 'div', 'nf-home-summary-metric');
      add(metric, 'dt', 'nf-home-summary-label', group.label);
      const value = add(metric, 'dd', 'nf-home-summary-value');
      value.classList.toggle('is-unavailable', !group.available);
      if (group.approximate) add(value, 'span', 'nf-home-summary-approximate', '≈');
      value.appendChild(host.ownerDocument.createTextNode(group.value));
      if (group.error) add(metric, 'span', 'nf-home-summary-error', '结果超出安全范围');
    }
    if (!result.groups.length) add(fragment, 'p', 'nf-home-summary-empty', result.operation === 'count' ? '当前筛选没有记录 · 0 条' : '未取得：当前筛选没有有效数字。');
  }
  if (result.excluded) {
    const details = add(fragment, 'details', 'nf-home-summary-exclusions'); details.open = expanded;
    add(details, 'summary', '', `${result.excluded} 条未计入`);
    const list = add(details, 'ul', '');
    for (const [issue, count] of Object.entries(result.issues)) add(list, 'li', '', `${ISSUES[issue as HomeSummaryIssue]}：${count}`);
  }
  host.replaceChildren(fragment); rendered.set(host, {signature, children: Array.from(host.childNodes)});
}
