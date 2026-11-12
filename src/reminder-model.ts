import type {CachedMetadata} from 'obsidian';
import {isDueProperty} from './model';

export interface Reminder {id: string; path: string; title: string; source: string; line?: number; due?: string; kind: 'task' | 'deadline'}
export interface ReminderPreferences {openOnStartup: boolean; databases: string[]}
export interface ReminderSection {key: string; label: string; dateLabel?: string; overdue: boolean; rows: Reminder[]}
export function readReminderPreferences(value: unknown): ReminderPreferences {
  const saved = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {openOnStartup: saved.openOnStartup !== false, databases: Array.isArray(saved.databases)
    ? [...new Set(saved.databases.filter((path): path is string => typeof path === 'string' && path.endsWith('.base') &&
      !/[\\:|[\]#]/.test(path) && ![...path].some(char => char.charCodeAt(0) < 32) &&
      !path.split('/').some(part => !part || part.startsWith('.'))))].slice(0, 24) : []};
}
/** Calendar dates remain local dates, not UTC midnight. Invalid dates are ignored. */
export function reminderDate(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  if (value.includes('T') && !Number.isFinite(Date.parse(value))) return;
  const match = /^(\d{4})[-/](\d{2})[-/](\d{2})(?:T.*)?$/.exec(value.trim());
  if (!match) return;
  const [, y, m, d] = match, date = new Date(+y, +m - 1, +d);
  if (date.getFullYear() === +y && date.getMonth() === +m - 1 && date.getDate() === +d) return `${y}-${m}-${d}`;
}
export function reminderDay(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function reminderGroup(row: Reminder, today = reminderDay()): '逾期' | '今天' | '接下来' | '未设日期' {
  const due = reminderDate(row.due), current = reminderDate(today) ?? reminderDay();
  return !due ? '未设日期' : due < current ? '逾期' : due === current ? '今天' : '接下来';
}
function localCalendarDate(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  // Noon avoids midnight DST transitions; setDate below advances the local
  // calendar rather than assuming that every day contains 24 hours.
  return new Date(year, month - 1, day, 12);
}
/** A compact date for individual reminders; invalid dates have no date label. */
export function formatReminderDate(due: string | undefined, today = reminderDay()): string {
  const date = reminderDate(due); if (!date) return '';
  const current = reminderDate(today) ?? reminderDay(), [year, month, day] = date.split('-');
  return `${year === current.slice(0, 4) ? '' : `${Number(year)}年`}${Number(month)}月${Number(day)}日`;
}
/** Remove only a recognized, matching task date marker from display text. */
export function reminderTitle(row: Reminder): string {
  const due = reminderDate(row.due); if (row.kind !== 'task' || !due) return row.title;
  const title = row.title.replace(/(?:📅\s*|\bdue::\s*)(\d{4}-\d{2}-\d{2})(?!\d)/gi,
    (marker: string, date: string) => reminderDate(date) === due ? '' : marker).replace(/[ \t]{2,}/g, ' ').trim();
  return title || row.title;
}
/** Nonempty scheduled sections, with undated items last. Date keys remain
 * stable when a section changes its relative label from tomorrow to today. */
export function reminderSections(rows: Reminder[], today = reminderDay()): ReminderSection[] {
  const current = reminderDate(today) ?? reminderDay(), next = localCalendarDate(current);
  next.setDate(next.getDate() + 1);
  const tomorrow = reminderDay(next), sections = new Map<string, ReminderSection>();
  for (const row of sortReminders(rows)) {
    const due = reminderDate(row.due), overdue = !!due && due < current;
    const key = !due ? 'undated' : overdue ? 'overdue' : `date:${due}`;
    let section = sections.get(key);
    if (!section) {
      const dateLabel = due ? `${formatReminderDate(due, current)} 星期${'日一二三四五六'[localCalendarDate(due).getDay()]}` : undefined;
      const relative = due === current ? '今天' : due === tomorrow ? '明天' : undefined;
      section = {key, label: !due ? '未设日期' : overdue ? '逾期' : relative ?? dateLabel!, overdue, rows: []};
      if (relative) section.dateLabel = dateLabel;
      sections.set(key, section);
    }
    section.rows.push(row);
  }
  return [...sections.values()];
}
export function noteReminders(path: string, basename: string, content: string, cache: CachedMetadata): Reminder[] {
  const front = cache.frontmatter ?? {};
  const source = typeof front.title === 'string' ? front.title : Array.isArray(front.aliases) && typeof front.aliases[0] === 'string' ? front.aliases[0] : basename;
  const lines = content.split(/\r?\n/), result: Reminder[] = [];
  // Use Obsidian's parsed list cache, so fenced examples and non-task lines
  // cannot become reminders just because they contain "- [ ]".
  for (const item of cache.listItems ?? []) {
    if (item.task !== ' ') continue;
    const line = item.position.start.line, raw = lines[line] ?? '';
    const match = /^\s*(?:>\s*)*(?:[-+*]|\d+[.)])\s+\[ \]\s+(.*)$/.exec(raw);
    if (!match) continue;
    const title = match[1].trim(); if (!title) continue;
    const dueText = /(?:📅\s*|\bdue::\s*)(\d{4}-\d{2}-\d{2})/i.exec(title)?.[1];
    result.push({id: `${path}:task:${line}`, path, title, source, line, due: reminderDate(dueText), kind: 'task'});
  }
  const status: unknown = front['状态'] ?? front.status;
  const completed = typeof status === 'string' && /^(完成|已完成|取消|已取消|done|completed|cancelled|canceled)$/i.test(status.trim());
  if (!completed) {
    const due = Object.entries(front).filter(([key]) => isDueProperty(key)).map(([, value]) => reminderDate(value)).find(Boolean);
    if (due) result.push({id: `${path}:deadline`, path, title: source, source, due, kind: 'deadline'});
  }
  return result;
}
export function sortReminders(rows: Reminder[]): Reminder[] {
  return [...rows].sort((a, b) => {
    const aDate = reminderDate(a.due), bDate = reminderDate(b.due);
    const order = aDate && bDate ? aDate.localeCompare(bDate) : aDate ? -1 : bDate ? 1 : 0;
    return order || a.source.localeCompare(b.source, 'zh-CN') || (a.line ?? -1) - (b.line ?? -1);
  });
}
