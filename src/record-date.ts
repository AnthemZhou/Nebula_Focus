/** Display an explicit instant in the current browser timezone; never assume a timezone for plain dates/text. */
export function recordDate(value: unknown): {text: string; source: string} | null {
  let date: Date, source: string;
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null;
    date = value; source = value.toISOString();
  } else if (typeof value === 'string') {
    const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
    if (!match) return null;
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (month < 1 || month > 12 || day < 1 || day > days[month - 1] || Number(match[4]) > 23 || Number(match[5]) > 59 ||
      Number(match[6] ?? 0) > 59 || Number(match[10] ?? 0) > 23 || Number(match[11] ?? 0) > 59) return null;
    date = new Date(value); source = value;
    if (!Number.isFinite(date.getTime())) return null;
  } else return null;
  const pad = (number: number) => String(number).padStart(2, '0');
  const day = `${String(date.getFullYear()).padStart(4, '0')}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}:${pad(date.getMinutes())}${date.getSeconds() ? ':' + pad(date.getSeconds()) : ''}`;
  return {text: `${day} ${time}`, source};
}
