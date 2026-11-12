/** Money arithmetic for a read-only view. Never coerce missing values to zero,
 * infer a direction, convert currencies, or silently round source values. */
export type MoneyIssue = 'missing-amount' | 'invalid-amount' | 'precision' | 'negative-amount' | 'missing-currency' | 'unknown-currency' | 'unknown-direction';
export type MoneyRow = {amount: unknown; currency: unknown; direction: unknown};
export type CurrencyTotal = {currency: string; digits: number; income: bigint; expense: bigint; count: number};
export type MoneySummary = {rows: number; included: number; excluded: number; issues: Partial<Record<MoneyIssue, number>>; currencies: CurrencyTotal[]};

export function currencyDigits(currency: string): number {
  try {return new Intl.NumberFormat('en', {style: 'currency', currency}).resolvedOptions().maximumFractionDigits ?? 2;}
  catch {return 2;}
}

export function knownCurrency(currency: string): boolean {
  // Intl accepts arbitrary three-letter codes. An English display name equal
  // to the code means no currency is known: do not imply that it is valid money.
  try {
    const name = new Intl.NumberFormat('en', {style: 'currency', currency, currencyDisplay: 'name'})
      .formatToParts(1).find(part => part.type === 'currency')?.value;
    return !!name && name !== currency;
  } catch {return false;}
}

export function decimalUnits(value: unknown, digits = 2): {units: bigint} | {issue: MoneyIssue} {
  if (value === null || value === undefined || value === '') return {issue: 'missing-amount'};
  if (typeof value !== 'number' && typeof value !== 'string') return {issue: 'invalid-amount'};
  if (!Number.isInteger(digits) || digits < 0 || digits > 6) return {issue: 'invalid-amount'};
  if (typeof value === 'number' && (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER / 10 ** digits))
    return {issue: 'precision'};
  const text = String(value).trim();
  const parts = /^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text);
  if (!parts || text.length > 1000) return {issue: 'invalid-amount'};
  const exponent = Number(parts[4] ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 1000) return {issue: 'invalid-amount'};
  const fraction = parts[3] ?? '';
  let coefficient = parts[2] + fraction;
  const shift = digits + exponent - fraction.length;
  if (shift < 0) {
    const removed = coefficient.slice(Math.max(0, coefficient.length + shift));
    if (/[1-9]/.test(removed)) return {issue: 'precision'};
    coefficient = coefficient.slice(0, Math.max(0, coefficient.length + shift)) || '0';
  } else coefficient += '0'.repeat(shift);
  const units = BigInt(coefficient) * BigInt(parts[1] === '-' ? -1 : 1);
  return {units};
}

/** Format integer minor units without converting the total to a floating number. */
export function formatUnits(units: bigint, digits = 2): string {
  const negative = units < BigInt(0);
  const raw = (negative ? -units : units).toString().padStart(digits + 1, '0');
  const integer = digits ? raw.slice(0, -digits) : raw;
  return (negative ? '−' : '') + integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (digits ? '.' + raw.slice(-digits) : '');
}

export function summarizeMoney(rows: MoneyRow[], incomeValue = '收入', expenseValue = '支出'): MoneySummary {
  const totals = new Map<string, CurrencyTotal>();
  const result: MoneySummary = {rows: rows.length, included: 0, excluded: 0, issues: {}, currencies: []};
  const reject = (issue: MoneyIssue) => {result.excluded++; result.issues[issue] = (result.issues[issue] ?? 0) + 1;};
  for (const row of rows) {
    // An unrecognised/missing currency never joins a default CNY bucket.
    const currency = typeof row.currency === 'string' ? row.currency.trim().toUpperCase() : '';
    if (!/^[A-Z]{3}$/.test(currency)) {reject('missing-currency'); continue;}
    if (!knownCurrency(currency)) {reject('unknown-currency'); continue;}
    if (!incomeValue || !expenseValue || incomeValue === expenseValue || (row.direction !== incomeValue && row.direction !== expenseValue)) {
      reject('unknown-direction'); continue;
    }
    const digits = currencyDigits(currency);
    const parsed = decimalUnits(row.amount, digits);
    if ('issue' in parsed) {reject(parsed.issue); continue;}
    // A signed amount plus an income/expense label is ambiguous; require an
    // explicit positive magnitude instead of applying Math.abs behind the UI.
    if (parsed.units < BigInt(0)) {reject('negative-amount'); continue;}
    let bucket = totals.get(currency);
    if (!bucket) {bucket = {currency, digits, income: BigInt(0), expense: BigInt(0), count: 0}; totals.set(currency, bucket);}
    if (row.direction === incomeValue) bucket.income += parsed.units;
    else bucket.expense += parsed.units;
    bucket.count++; result.included++;
  }
  result.currencies = [...totals.values()].sort((a, b) => a.currency.localeCompare(b.currency));
  return result;
}

export function unavailableFormula(value: string): boolean {
  return /^(?:formulaResult|rollupResult|formulaCode):\/\//.test(value);
}

export function parseWikiLink(text: string): {target: string; label: string} | null {
  const match = /^\[\[([^\]|]+)(?:\|([^\]]*))?\]\]$/.exec(text);
  return match ? {target: match[1], label: match[2] || match[1].split('/').pop() || match[1]} : null;
}
