export const IMAGE_EXT = /\.(?:png|jpe?g|gif|webp|avif|bmp|svg)(?:[?#].*)?$/i;
export function propertyName(prop: string): string {
  return prop.replace(/^note\./, '');
}
export function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || value === '' ||
    (Array.isArray(value) && value.length === 0);
}
export function isDueProperty(prop: string): boolean {
  return /^(截止日期|截止时间|到期日期|到期时间|deadline|due|due date|due_date)$/i.test(propertyName(prop));
}
/** Date-only deadlines stay current for the entire local calendar day. */
export function overdue(value: unknown, now = new Date(), status?: unknown): boolean {
  if (typeof status === 'string' && /^(完成|已完成|取消|已取消|done|completed|cancelled|canceled)$/i.test(status.trim())) return false;
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})[-/](\d{2})[-/](\d{2})$/.exec(value);
  if (match) {
    const [year, month, day] = match.slice(1).map(Number);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return false;
    return now >= new Date(year, month - 1, day + 1);
  }
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && now.getTime() > time;
}
export function firstImage(
  embeds: {link: string}[] | undefined,
  resolve: (link: string) => string | null,
): string | null {
  for (const embed of embeds ?? []) {
    const raw = embed.link.replace(/^\s*<|>\s*$/g, '').trim();
    if (/^https?:\/\//i.test(raw)) {
      if (IMAGE_EXT.test(raw)) return raw;
      continue;
    }
    const link = raw.split('|')[0].split('#')[0];
    const found = resolve(link);
    if (found && IMAGE_EXT.test(found)) return found;
  }
  return null;
}
export function compactLink(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol)) return null;
    if (/(^|\.)bilibili\.com$/.test(parsed.hostname)) return '查看 B 站视频 ↗';
    if (/(^|\.)xiaohongshu\.com$/.test(parsed.hostname)) return '查看小红书 ↗';
    return parsed.hostname.replace(/^www\./, '') + ' ↗';
  } catch { return null; }
}
