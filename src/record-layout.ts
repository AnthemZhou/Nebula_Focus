import {parseLinktext} from 'obsidian';
import type {App, TFile} from 'obsidian';
import {unavailableFormula} from './finance-model';

export type RecordMetric = {property: string; label?: string; format?: 'number' | 'text'; currency?: string};
export type RecordFilter = {property: string; operator: 'equals' | 'notEquals' | 'isEmpty' | 'notEmpty'; value?: string | number | boolean | null};
export type RecordTab = {
  label: string; targetCollection: string; relationProperty: string; forwardProperty?: string;
  titleProperty: string; columns: string[]; labels?: Record<string, string>; numberProperties?: string[];
  tagProperties?: string[]; attachmentProperties?: string[]; filters?: RecordFilter[]; sort?: {property: string; direction: 'asc' | 'desc'}[];
};
export type RecordLayout = {metrics: RecordMetric[]; tabs: RecordTab[]};
export type RecordLayoutConfig = {version: 1; profiles: Record<string, RecordLayout>};
export type RecordLayoutRow = {file: TFile; values: Record<string, unknown>};
export type RecordLayoutValue = {value: unknown; unavailable: boolean; snapshot: boolean};
export const RECORD_LAYOUT_FILE = 'nebula-record-layouts.json';
const MAX_CONFIG_LENGTH = 262144;
const own = (value: Record<string, unknown>, key: string): unknown => Object.hasOwn(value, key) ? value[key] : undefined;
function object(value: unknown): value is Record<string, unknown> {return value !== null && typeof value === 'object' && !Array.isArray(value);}
function name(value: unknown): value is string {return typeof value === 'string' && value.trim().length > 0 && value.length <= 512;}
function stringList(value: unknown, max = 64): value is string[] {return Array.isArray(value) && value.length <= max && value.every(name) && new Set(value).size === value.length;}
function keys(value: Record<string, unknown>, allowed: string[]): boolean {return Object.keys(value).every(key => allowed.includes(key));}
function optional(value: Record<string, unknown>, key: string, check: (item: unknown) => boolean): boolean {return !Object.hasOwn(value, key) || check(value[key]);}
function primitive(value: unknown): boolean {return value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));}

/** Config contains only declarative fields; unknown keys and executable expressions are rejected. */
export function parseRecordLayouts(raw: string): RecordLayoutConfig | null {
  if (raw.length > MAX_CONFIG_LENGTH) return null;
  let value: unknown;
  try {value = JSON.parse(raw);} catch {return null;}
  if (!object(value) || !keys(value, ['version', 'profiles']) || value.version !== 1 || !object(value.profiles) || Object.keys(value.profiles).length > 64) return null;
  for (const [collection, profile] of Object.entries(value.profiles)) {
    if (!name(collection) || ['__proto__', 'constructor', 'prototype'].includes(collection) || !object(profile) || !keys(profile, ['metrics', 'tabs']) ||
      !Array.isArray(profile.metrics) || profile.metrics.length > 20 || !Array.isArray(profile.tabs) || profile.tabs.length > 20) return null;
    for (const metric of profile.metrics) {
      if (!object(metric) || !keys(metric, ['property', 'label', 'format', 'currency']) || !name(metric.property) ||
        !optional(metric, 'label', name) || !optional(metric, 'format', item => item === 'number' || item === 'text') ||
        !optional(metric, 'currency', item => typeof item === 'string' && /^[A-Z]{3}$/.test(item))) return null;
    }
    const labels = new Set<string>();
    for (const tab of profile.tabs) {
      if (!object(tab) || !keys(tab, ['label', 'targetCollection', 'relationProperty', 'forwardProperty', 'titleProperty', 'columns', 'labels', 'numberProperties', 'tagProperties', 'attachmentProperties', 'filters', 'sort']) ||
        !name(tab.label) || labels.has(tab.label) || !name(tab.targetCollection) || !name(tab.relationProperty) || !name(tab.titleProperty) ||
        !stringList(tab.columns) || !tab.columns.length || !tab.columns.includes(tab.titleProperty) || !optional(tab, 'forwardProperty', name) ||
        !optional(tab, 'numberProperties', stringList) || !optional(tab, 'tagProperties', stringList) || !optional(tab, 'attachmentProperties', stringList) ||
        !optional(tab, 'labels', item => object(item) && Object.keys(item).length <= 64 && Object.entries(item).every(([key, label]) => name(key) && name(label)))) return null;
      labels.add(tab.label);
      if (tab.filters !== undefined && (!Array.isArray(tab.filters) || tab.filters.length > 32 || !tab.filters.every(filter => {
        if (!object(filter) || !keys(filter, ['property', 'operator', 'value']) || !name(filter.property)) return false;
        if (filter.operator === 'isEmpty' || filter.operator === 'notEmpty') return !Object.hasOwn(filter, 'value');
        return (filter.operator === 'equals' || filter.operator === 'notEquals') && Object.hasOwn(filter, 'value') && primitive(filter.value);
      }))) return null;
      if (tab.sort !== undefined && (!Array.isArray(tab.sort) || tab.sort.length > 8 || !tab.sort.every(sort => object(sort) &&
        keys(sort, ['property', 'direction']) && name(sort.property) && (sort.direction === 'asc' || sort.direction === 'desc')))) return null;
    }
  }
  return value as RecordLayoutConfig;
}

/** Nearest matching ancestor wins. Malformed local configuration is never silently bypassed. */
export async function loadRecordLayout(app: App, file: TFile, collection: string | null): Promise<{profile: RecordLayout | null; path?: string; error?: string}> {
  if (!collection) return {profile: null};
  const parts = file.path.split('/'); parts.pop();
  for (let depth = parts.length; depth >= 0; depth--) {
    const path = [...parts.slice(0, depth), RECORD_LAYOUT_FILE].join('/');
    const source = app.vault.getFileByPath(path);
    if (!source) continue;
    try {
      if (source.stat?.size > MAX_CONFIG_LENGTH) return {profile: null, path, error: '记录布局配置过大'};
      const config = parseRecordLayouts(await app.vault.cachedRead(source));
      if (!config) return {profile: null, path, error: '记录布局配置无效，请检查版本和字段'};
      if (Object.hasOwn(config.profiles, collection)) return {profile: config.profiles[collection], path};
    } catch {return {profile: null, path, error: '无法读取记录布局配置'};}
  }
  return {profile: null};
}

export function recordLayoutValue(values: Record<string, unknown>, property: string, missingIsUnavailable = true): RecordLayoutValue {
  const unavailable = Array.isArray(values.nf_unavailable_fields) && values.nf_unavailable_fields.includes(property);
  const snapshot = Array.isArray(values.nf_snapshot_fields) && values.nf_snapshot_fields.includes(property);
  const value = own(values, property);
  // Missing configured metrics are not evidence of a zero or an empty formula result.
  return {value, unavailable: unavailable || missingIsUnavailable && value === undefined || typeof value === 'string' && unavailableFormula(value), snapshot};
}

function links(app: App, source: TFile, value: unknown): {file: TFile | null; target: string}[] {
  const result: {file: TFile | null; target: string}[] = [];
  for (const item of Array.isArray(value) ? value : [value]) {
    if (typeof item !== 'string') continue;
    if (/^https?:\/\//i.test(item.trim())) {result.push({target: item.trim(), file: null}); continue;}
    const wiki = /^\s*\[\[([^\n]+?)\]\]\s*$/.exec(item);
    if (!wiki) continue;
    const target = wiki[1].split('|')[0], parsed = parseLinktext(target);
    if (!parsed.path || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(parsed.path)) continue;
    result.push({target, file: app.metadataCache.getFirstLinkpathDest(parsed.path, source.path)});
  }
  return result;
}
function empty(value: unknown): boolean {return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);}
function accepts(values: Record<string, unknown>, filters: RecordFilter[]): boolean {
  return filters.every(filter => {
    const state = recordLayoutValue(values, filter.property, false);
    if (state.unavailable) return false;
    const value = state.value;
    if (filter.operator === 'isEmpty') return empty(value);
    if (filter.operator === 'notEmpty') return !empty(value);
    const equal = Array.isArray(value) ? value.includes(filter.value) : value === filter.value;
    return filter.operator === 'equals' ? equal : !equal;
  });
}
function compare(a: unknown, b: unknown, direction: 'asc' | 'desc'): number {
  if (empty(a) || empty(b)) return empty(a) ? empty(b) ? 0 : 1 : -1;
  const value = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), undefined, {numeric: true});
  return direction === 'asc' ? value : -value;
}

/** Exact database identity + resolved file identity, never name matching or an inferred financial relationship. */
export function relatedRecordRows(app: App, file: TFile, tab: RecordTab): {rows: RecordLayoutRow[]; unresolved: string[]} {
  const sourceValues: Record<string, unknown> = app.metadataCache.getFileCache(file)?.frontmatter ?? {};
  const forward = tab.forwardProperty ? links(app, file, own(sourceValues, tab.forwardProperty)) : [];
  const paths = new Set(forward.flatMap(link => link.file ? [link.file.path] : []));
  const rows = app.vault.getMarkdownFiles().flatMap(candidate => {
    if (candidate.path === file.path) return [];
    const values: Record<string, unknown> = app.metadataCache.getFileCache(candidate)?.frontmatter ?? {};
    if (values.nf_source_collection !== tab.targetCollection || !accepts(values, tab.filters ?? [])) return [];
    const backlink = links(app, candidate, own(values, tab.relationProperty)).some(link => link.file?.path === file.path);
    const authoritative = Object.hasOwn(values, tab.relationProperty) && !recordLayoutValue(values, tab.relationProperty, false).unavailable;
    return backlink || !authoritative && paths.has(candidate.path) ? [{file: candidate, values}] : [];
  });
  rows.sort((a, b) => {
    for (const sort of tab.sort ?? []) {
      const av = recordLayoutValue(a.values, sort.property, false), bv = recordLayoutValue(b.values, sort.property, false);
      const result = compare(av.unavailable ? undefined : av.value, bv.unavailable ? undefined : bv.value, sort.direction);
      if (result) return result;
    }
    return a.file.path.localeCompare(b.file.path);
  });
  return {rows, unresolved: [...new Set(forward.filter(link => !link.file).map(link => link.target))]};
}
