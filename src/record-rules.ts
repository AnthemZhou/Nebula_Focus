import {tableProfile, tableTitleProfiles} from './table-profile';

export type RecordData = {path: string; properties: Record<string, unknown>};
export type FieldType = 'text' | 'number' | 'checkbox' | 'date' | 'datetime' | 'list' | 'select' | 'multi-select' | 'relation' | 'attachment' | 'unknown';
export type RecordField = {key: string; label: string; type: FieldType; writable: boolean; options?: string[]};
export type RecordScope = {folder?: string; exactPath?: string; defaults: Record<string, unknown>};
export class RecordError extends Error {
  constructor(public code: string, message: string, public details?: unknown) {super(message);}
}
export function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
export function safePath(value: unknown, extension?: string, empty = false): string {
  if (typeof value !== 'string' || (!value && !empty) || /[\\:#|]/.test(value) || [...value].some(char => char.charCodeAt(0) < 32) || value.startsWith('/') ||
      value.split('/').some(part => part === '..' || part === '.' || part.startsWith('.') || (!part && value !== '')) ||
      (extension && !value.endsWith(extension))) throw new RecordError('invalid_path', '请使用库内的完整相对路径', {path: value});
  return value;
}
export function fieldKey(value: string) {return value.startsWith('note.') ? value.slice(5) : value;}
export function writableKey(key: string) {return !!key && !/^(?:nf_|file\.|formula\.)/.test(key) && !['__proto__', 'constructor', 'prototype', 'position'].includes(key);}
const parent = (path: string) => path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
const inside = (path: string, folder: string) => !folder || path.startsWith(folder + '/');
const list = (value: unknown): string[] => Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
function literal(text: string): unknown {
  if (text.startsWith("'") && text.endsWith("'")) return text.slice(1, -1).replace(/\\(['\\])/g, '$1');
  try {return JSON.parse(text);} catch {throw new Error('Unsupported literal');}
}
function reference(text: string): string {
  const bracket = /^note\[\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*\]$/.exec(text);
  if (bracket) return 'note.' + String(literal(bracket[1]));
  if (/^(file\.(path|folder|ext|name)|note\.[^()[\]<>!=]+|[\p{L}\p{N}_-]+)$/u.test(text))
    return /^(file|note)\./.test(text) ? text : 'note.' + text;
  throw new Error('Unsupported property');
}
function valueOf(record: RecordData, ref: string): unknown {
  if (ref.startsWith('note.')) return Object.hasOwn(record.properties, ref.slice(5)) ? record.properties[ref.slice(5)] : null;
  if (ref === 'file.path') return record.path;
  if (ref === 'file.folder') return parent(record.path);
  if (ref === 'file.ext') return record.path.split('.').pop();
  if (ref === 'file.name') return record.path.split('/').pop()?.replace(/\.md$/, '');
  return null;
}
type Predicate = (record: RecordData) => boolean;
export type RecordFilter = {test: Predicate; unsupported: string[]; scope: RecordScope; properties: Set<string>};
/** A deliberately bounded Bases filter interpreter. Unknown expressions never
 * execute as JavaScript and never silently widen a write's database scope. */
export function recordFilter(filters: unknown[]): RecordFilter {
  const unsupported: string[] = [], properties = new Set<string>();
  const scopes: {folder?: string; exactPath?: string}[] = [], defaults: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  const ref = (text: string) => {const name = reference(text.trim()); if (name.startsWith('note.')) properties.add(name.slice(5)); return name;};
  const compile = (filter: unknown, required: boolean, depth = 0): Predicate => {
    if (depth > 30) {unsupported.push('Filter nesting exceeds 30'); return () => false;}
    if (filter === undefined || filter === null) return () => true;
    if (object(filter)) {
      const keys = Object.keys(filter);
      if (keys.length === 1 && ['and', 'or', 'not'].includes(keys[0]) && Array.isArray(filter[keys[0]])) {
        const kind = keys[0], parts = (filter[kind] as unknown[]).map(part => compile(part, required && kind === 'and', depth + 1));
        return record => kind === 'and' ? parts.every(test => test(record)) : kind === 'or' ? parts.some(test => test(record)) : !parts.some(test => test(record));
      }
    }
    if (typeof filter === 'string') {
      const text = filter.trim();
      try {
        const folder = /^file\.inFolder\((.*)\)$/.exec(text), tag = /^file\.hasTag\((.*)\)$/.exec(text);
        if (folder || tag) {
          const name = literal((folder ?? tag)![1]); if (typeof name !== 'string') throw new Error('Expected string');
          if (folder) {if (required) scopes.push({folder: safePath(name.replace(/\/$/, ''), undefined, true)}); return record => inside(record.path, name.replace(/\/$/, ''));}
          throw new Error('file.hasTag requires a native tag index');
        }
        const comparison = /^(.+?)\s*(==|!=|>=|<=|>|<)\s*(.+)$/.exec(text);
        if (comparison) {
          const key = ref(comparison[1]), op = comparison[2], expected = literal(comparison[3].trim());
          if (object(expected) || Array.isArray(expected)) throw new Error('Expected scalar');
          if (required && op === '==') {
            if (key === 'file.folder' && typeof expected === 'string') scopes.push({folder: safePath(expected, undefined, true)});
            if (key === 'file.path' && typeof expected === 'string') scopes.push({exactPath: safePath(expected, '.md')});
            if (key.startsWith('note.')) {
              const property = key.slice(5);
              if (Object.hasOwn(defaults, property) && defaults[property] !== expected) throw new Error('Conflicting defaults');
              Object.defineProperty(defaults, property, {value: expected, enumerable: true, configurable: true, writable: true});
            }
          }
          return record => {
            const actual = valueOf(record, key);
            if (op === '==') return actual === expected;
            if (op === '!=') return actual !== expected;
            if ((typeof actual !== 'number' && typeof actual !== 'string') || typeof actual !== typeof expected) return false;
            const compare = (left: number | string, right: number | string) => left === right ? 0 : left > right ? 1 : -1;
            const order = compare(actual, expected as number | string);
            return op === '>' ? order > 0 : op === '<' ? order < 0 : op === '>=' ? order >= 0 : order <= 0;
          };
        }
        const contains = /^(.+)\.contains\((.*)\)$/.exec(text);
        if (contains) {const key = ref(contains[1]), expected = literal(contains[2]); return record => {
          const actual = valueOf(record, key); return Array.isArray(actual) ? actual.includes(expected) : typeof actual === 'string' && typeof expected === 'string' && actual.includes(expected);
        };}
        const negated = text.startsWith('!'), key = ref(negated ? text.slice(1) : text);
        return record => negated ? !valueOf(record, key) : !!valueOf(record, key);
      } catch { /* Surface unsupported expressions before any write. */ }
    }
    unsupported.push(typeof filter === 'string' ? filter : JSON.stringify(filter)); return () => false;
  };
  const tests = filters.map(filter => compile(filter, true));
  const folder = scopes.flatMap(scope => scope.folder === undefined ? [] : [scope.folder]).sort((a, b) => b.length - a.length)[0];
  const exactPath = scopes.find(scope => scope.exactPath)?.exactPath;
  return {test: record => tests.every(test => test(record)), unsupported, scope: {folder, exactPath, defaults}, properties};
}

function observedType(values: unknown[]): FieldType {
  const present = values.filter(value => value != null && value !== '' && value !== 'formulaResult://pending');
  if (!present.length) return 'unknown';
  if (present.every(value => typeof value === 'number')) return 'number';
  if (present.every(value => typeof value === 'boolean')) return 'checkbox';
  if (present.every(value => Array.isArray(value) && value.every(item => typeof item === 'string'))) {
    if (present.some(value => (value).some(item => /^\[\[.+\]\]$/.test(item)))) return 'relation';
    return 'list';
  }
  if (present.every(value => typeof value === 'string')) {
    if (present.every(value => /^\d{4}-\d{2}-\d{2}$/.test(value))) return 'date';
    if (present.every(value => /^\d{4}-\d{2}-\d{2}T/.test(value))) return 'datetime';
    if (present.every(value => /^\[\[.+\]\]$/.test(value))) return 'relation';
    return 'text';
  }
  return 'unknown';
}
export function recordSchema(base: Record<string, unknown>, view: Record<string, unknown>, records: RecordData[], filter: RecordFilter,
  preferences: Record<string, unknown> = {}, basePath = '') {
  const profile = tableProfile(view);
  if (view.nebulaTable != null && !profile) throw new RecordError('invalid_database', 'nebulaTable 配置不完整，请补齐标题、标签、换行和附件配置');
  const titles = tableTitleProfiles({...view, query: base});
  const titleProperty = profile?.titleProperty ?? titles.find(title => title.kind === 'property')?.titleProperty ?? null;
  const explicit = object(view.nebulaRecords) ? view.nebulaRecords : object(base.nebulaRecords) ? base.nebulaRecords : {};
  const declared = object(explicit.fields) ? explicit.fields : {};
  const keys = new Set([...list(view.order), ...Object.keys(object(base.properties) ? base.properties : {}),
    ...list(view.numberProperties), ...list(view.dateProperties), ...list(view.tagProperties), ...list(view.attachmentProperties),
    ...Object.keys(profile?.tags ?? {}), ...Object.keys(declared), ...filter.properties].map(fieldKey));
  if (titleProperty) keys.add(titleProperty);
  for (const record of records) for (const key of Object.keys(record.properties)) if (writableKey(key)) keys.add(key);
  if (object(view.groupBy) && typeof view.groupBy.property === 'string') keys.add(fieldKey(view.groupBy.property));
  const fields: RecordField[] = [];
  for (const key of keys) {
    const raw = object(declared[key]) ? declared[key] : {};
    const values = records.map(record => record.properties[key]);
    const config = object(base.properties) ? base.properties[key] ?? base.properties[`note.${key}`] : undefined;
    const label = object(config) && typeof config.displayName === 'string' ? config.displayName : key;
    let type: FieldType = observedType(values);
    if (key === titleProperty) type = 'text';
    if (list(view.numberProperties).map(fieldKey).includes(key)) type = 'number';
    if (list(view.dateProperties).map(fieldKey).includes(key)) type = 'date';
    if (profile?.tags[key] || list(view.tagProperties).map(fieldKey).includes(key)) type = profile?.tags[key] === 'multi' ? 'multi-select' : 'select';
    if (profile?.attachments.includes(key) || list(view.attachmentProperties).map(fieldKey).includes(key)) type = 'attachment';
    if (object(view.groupBy) && fieldKey(String(view.groupBy.property)) === key && list(view.groupOrder).length) type = 'select';
    const types: FieldType[] = ['text', 'number', 'checkbox', 'date', 'datetime', 'list', 'select', 'multi-select', 'relation', 'attachment', 'unknown'];
    if (typeof raw.type === 'string' && types.includes(raw.type as FieldType)) type = raw.type as FieldType;
    const savedPreference = preferences[JSON.stringify([basePath, key])];
    const preference = object(savedPreference) ? savedPreference : {};
    const hidden = list(preference.hidden);
    const options = [...new Set([...values.flatMap(value => typeof value === 'string' ? [value] : list(value)),
      ...(object(view.groupBy) && fieldKey(String(view.groupBy.property)) === key ? list(view.groupOrder) : []), ...list(preference.added), ...list(raw.options)])]
      .filter(value => !hidden.includes(value) && !value.startsWith('formulaResult://'));
    const computed = records.some(record => list(record.properties.nf_unavailable_fields).includes(key));
    fields.push({key, label, type, writable: writableKey(key) && raw.readOnly !== true && !computed,
      ...(['select', 'multi-select'].includes(type) ? {options} : {})});
  }
  const folder = typeof explicit.folder === 'string' ? safePath(explicit.folder, undefined, true) : filter.scope.folder;
  return {titleProperty, fields, folder, exactPath: filter.scope.exactPath,
    defaults: {...(object(explicit.defaults) ? explicit.defaults : {}), ...filter.scope.defaults},
    canCreate: folder !== undefined && !filter.scope.exactPath && view.nebulaAllowCreate !== false && !filter.unsupported.length,
    unsupportedFilters: filter.unsupported};
}
export function validateFields(input: unknown, fields: RecordField[]): Record<string, unknown> {
  if (!object(input)) throw new RecordError('invalid_fields', 'properties 必须是字段与值的对象');
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const [key, value] of Object.entries(input)) {
    const field = fields.find(field => field.key === key);
    if (!field) throw new RecordError('unknown_field', `未知字段：${key}。请先读取 schema`, {fields});
    if (!field.writable) throw new RecordError('read_only_field', `字段不能写入：${key}`);
    const strings = Array.isArray(value) && value.every(item => typeof item === 'string');
    let valid = value === null;
    if (['text', 'select'].includes(field.type)) valid ||= typeof value === 'string';
    if (field.type === 'number') valid ||= typeof value === 'number' && Number.isFinite(value);
    if (field.type === 'checkbox') valid ||= typeof value === 'boolean';
    if (field.type === 'date') valid ||= typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
    if (field.type === 'datetime') valid ||= typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));
    if (['list', 'multi-select'].includes(field.type)) valid ||= strings;
    if (['relation', 'attachment'].includes(field.type)) valid ||= (typeof value === 'string' ? [value] : strings ? value : [false])
      .every(item => typeof item === 'string' && /^\[\[[^\r\n\]]+\]\]$/.test(item));
    if (field.type === 'unknown') valid ||= ['string', 'boolean'].includes(typeof value) || typeof value === 'number' && Number.isFinite(value) || strings;
    if (!valid) throw new RecordError('invalid_field_type', `字段 ${key} 需要 ${field.type}`, {field, value});
    if (field.options?.length && value !== null && (Array.isArray(value) ? value : [value]).some(item => !field.options!.includes(String(item))))
      throw new RecordError('unknown_option', `字段 ${key} 的选项不存在`, {field, value});
    Object.defineProperty(result, key, {value, enumerable: true, writable: true, configurable: true});
  }
  return result;
}
