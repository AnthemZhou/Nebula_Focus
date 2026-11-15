import {App, TFile, TFolder, getFrontMatterInfo, parseYaml, stringifyYaml} from 'obsidian';
import {RecordError, object, recordFilter, recordSchema, safePath, validateFields, type RecordData} from './record-rules';
import {noteSource} from './note-source';

const MAX_BODY = 200_000;
const REQUEST_ID = 'nf_record_request_id', REQUEST_HASH = 'nf_record_request_hash';
type Snapshot = RecordData & {file: TFile; content: string};
type Database = {file: TFile; source: string; base: Record<string, unknown>; view: Record<string, unknown>;
  filter: ReturnType<typeof recordFilter>; records: Snapshot[]; candidates: Snapshot[]; schema: ReturnType<typeof recordSchema>};
export type RecordResponse = {ok: true; result: unknown} | {ok: false; error: {code: string; message: string; details?: unknown}};
const scalarText = (value: unknown, label: string, maximum = 1000) => {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) throw new RecordError('invalid_input', `${label} 不能为空，且不能超过 ${maximum} 字符`);
  return value;
};
async function revision(content: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
const canonical = (value: unknown): string => JSON.stringify(value, (_, item: unknown) => object(item) ?
  Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
function filename(title: string) {
  const name = [...title.normalize('NFC')].filter(char => char.charCodeAt(0) >= 32).join('').replace(/[\\/:*?"<>|#[\]^]/g, ' ').replace(/\s+/g, ' ').replace(/^\.+|[. ]+$/g, '').trim();
  if (!name) throw new RecordError('invalid_title', '标题无法转换为有效的文件名');
  return [...name].slice(0, 90).join('');
}
function serialize(properties: Record<string, unknown>, body: string) {
  return Object.keys(properties).length ? `---\n${stringifyYaml(properties).trimEnd()}\n---\n${body}` : body;
}

/** Shared by the desktop CLI bridge and the mobile assistant. No model or
 * network dependency; each accepted update is one compare-and-write operation. */
export class RecordService {
  private pending: Promise<unknown> = Promise.resolve();
  constructor(private app: App, private preferences: () => Record<string, unknown> = () => ({}), private enabled = () => true) {}

  async handle(input: unknown): Promise<RecordResponse> {
    try {
      if (!this.enabled()) throw new RecordError('unavailable', '记录接口已停止');
      if (!object(input)) throw new RecordError('invalid_request', '请求必须为 JSON 对象');
      if (input.vault !== undefined && input.vault !== this.app.vault.getName()) throw new RecordError('wrong_vault', '请求的仓库与当前仓库不一致');
      const run = async () => {
        if (!this.enabled()) throw new RecordError('unavailable', '记录接口已停止');
        switch (input.action) {
          case 'databases': return this.databases(input);
          case 'schema': {const db = await this.database(input); return this.describe(db);}
          case 'query': {const db = await this.database(input); const query = typeof input.query === 'string' ? input.query.toLocaleLowerCase() : '';
            const records = db.records.filter(record => !query || this.title(record, db).toLocaleLowerCase().includes(query) || record.content.toLocaleLowerCase().includes(query));
            const offset = Number.isSafeInteger(input.offset) && Number(input.offset) >= 0 ? Number(input.offset) : 0;
            const limit = Number.isSafeInteger(input.limit) ? Math.max(1, Math.min(100, Number(input.limit))) : 30;
            return {total: records.length, offset, nextOffset: offset + limit < records.length ? offset + limit : null,
              records: await Promise.all(records.slice(offset, offset + limit).map(record => this.result(record, db, false)))};}
          case 'read': {const db = await this.database(input); return this.result(this.target(db, input.path), db, true);}
          case 'create': return this.create(input);
          case 'update': return this.update(input);
          default: throw new RecordError('unknown_action', '支持 databases、schema、query、read、create、update');
        }
      };
      // Serialise writes from chat and CLI together. Reads remain independent.
      if (['create', 'update'].includes(String(input.action))) {
        const operation = this.pending.then(run); this.pending = operation.catch(() => undefined);
        return {ok: true, result: await operation};
      }
      return {ok: true, result: await run()};
    } catch (error) {
      return {ok: false, error: error instanceof RecordError ? {code: error.code, message: error.message, details: error.details} :
        {code: 'operation_failed', message: error instanceof Error ? error.message : '操作失败'}};
    }
  }

  private async databases(input: Record<string, unknown>) {
    const items: unknown[] = [], query = typeof input.query === 'string' ? input.query.toLocaleLowerCase() : '';
    const includeSelf = input.includeSelf === true;
    for (const file of this.app.vault.getFiles().filter(file => file.extension === 'base').sort((a, b) => a.path.localeCompare(b.path))) {
      try {
        safePath(file.path, '.base');
        const base: unknown = parseYaml(await this.app.vault.read(file));
        if (!object(base) || !Array.isArray(base.views)) continue;
        for (const view of base.views) if (object(view) && typeof view.name === 'string') {
          const filter = recordFilter([base.filters, view.filters]);
          if (!includeSelf && filter.scope.exactPath) continue;
          if (query && !`${file.path} ${view.name}`.toLocaleLowerCase().includes(query)) continue;
          const schema = recordSchema(base, view, [], filter);
          items.push({database: file.path, view: view.name, type: view.type, canCreate: schema.canCreate,
            folder: schema.folder, titleProperty: schema.titleProperty, unsupportedFilters: filter.unsupported});
        }
      } catch (error) {items.push({database: file.path, error: error instanceof Error ? error.message : '无法读取配置'});}
    }
    return {vault: this.app.vault.getName(), databases: items};
  }

  private async database(input: Record<string, unknown>): Promise<Database> {
    const path = safePath(input.database, '.base'), file = this.app.vault.getFileByPath(path);
    if (!file) throw new RecordError('database_not_found', '数据库不存在', {path});
    const source = await this.app.vault.read(file), base: unknown = parseYaml(source);
    if (!object(base) || !Array.isArray(base.views)) throw new RecordError('invalid_database', '数据库配置无效');
    const views = base.views.filter(object);
    const matches = input.view === undefined ? views : views.filter(view => view.name === input.view);
    if (matches.length !== 1) throw new RecordError('ambiguous_view', '请指定唯一的数据库视图', {views: views.map(view => view.name)});
    const view = matches[0], filter = recordFilter([base.filters, view.filters]);
    if (filter.unsupported.length) throw new RecordError('unsupported_filter', '该视图包含暂不支持的筛选表达式，未执行操作', {filters: filter.unsupported});
    const records: Snapshot[] = [], candidates: Snapshot[] = [];
    // Use fresh file contents, not possibly delayed frontmatter index entries.
    for (const note of this.app.vault.getMarkdownFiles()) {
      try {safePath(note.path, '.md');} catch {continue;}
      if (filter.scope.exactPath && note.path !== filter.scope.exactPath) continue;
      const folder = filter.scope.folder;
      if (folder && !note.path.startsWith(folder + '/')) continue;
      const content = await this.app.vault.read(note), properties = noteSource(content).properties;
      const record = {path: note.path, file: note, properties, content};
      candidates.push(record);
      if (filter.test(record)) records.push(record);
    }
    const settings = this.preferences(), options = object(settings.tagOptions) ? settings.tagOptions : {};
    const schema = recordSchema(base, view, records, filter, options, file.path);
    return {file, source, base, view, filter, records, candidates, schema};
  }
  private describe(db: Database) {
    return {database: db.file.path, view: db.view.name, count: db.records.length, ...db.schema,
      rules: {propertiesUseExactKeys: true, formulasAreReadOnly: true, createRequiresRequestId: true,
        updateRequiresRevision: true, nullRemovesProperty: true, attachments: '使用已存在的库内附件链接，例如 [[Attachments/发票.png]]'}};
  }
  private title(record: RecordData, db: Database): string {
    const value = db.schema.titleProperty ? record.properties[db.schema.titleProperty] : undefined;
    return typeof value === 'string' && value.trim() ? value : record.path.split('/').pop()!.replace(/\.md$/, '');
  }
  private links(path: string, title: string) {
    const uri = `obsidian://open?vault=${encodeURIComponent(this.app.vault.getName())}&file=${encodeURIComponent(path)}`;
    return {uri, markdownLink: `[${title.replace(/[\\[\]]/g, '\\$&')}](${uri})`, wikiLink: `[[${path.replace(/\.md$/, '')}|${title.replace(/[\]|\r\n]/g, ' ')}]]`};
  }
  private async result(record: Snapshot, db: Database, body: boolean) {
    const title = this.title(record, db);
    return {database: db.file.path, view: db.view.name, path: record.path, title,
      properties: Object.fromEntries(Object.entries(record.properties).filter(([key]) => !key.startsWith('nf_'))),
      revision: await revision(record.content), ...this.links(record.path, title),
      ...(body ? {body: record.content.slice(getFrontMatterInfo(record.content).contentStart)} : {})};
  }
  private target(db: Database, value: unknown) {
    const path = safePath(value, '.md'), record = db.records.find(record => record.path === path);
    if (!record) throw new RecordError('record_not_found', '记录不存在或不属于指定视图', {path});
    return record;
  }
  private checkLinks(properties: Record<string, unknown>, db: Database) {
    for (const [key, value] of Object.entries(properties)) {
      const field = db.schema.fields.find(field => field.key === key);
      if (!field || !['relation', 'attachment'].includes(field.type) || value === null) continue;
      const links: unknown[] = Array.isArray(value) ? value : [value];
      for (const link of links) {
        if (typeof link !== 'string') throw new RecordError('invalid_link', '链接须为字符串');
        const target = String(link).slice(2, -2).split('|')[0].split('#')[0];
        const file = this.app.vault.getFileByPath(target) ?? this.app.vault.getFileByPath(target + '.md') ?? this.app.metadataCache.getFirstLinkpathDest(target, db.file.path);
        if (!file || field.type === 'relation' && file.extension !== 'md') throw new RecordError('unresolved_link', `字段 ${key} 引用了不存在的文件`, {link});
      }
    }
  }
  private async unchanged(db: Database) {
    if (!this.enabled() || this.app.vault.getFileByPath(db.file.path) !== db.file || await this.app.vault.read(db.file) !== db.source)
      throw new RecordError('database_changed', '数据库配置已改变，请重新读取 schema 后再试');
  }
  private async create(input: Record<string, unknown>) {
    const db = await this.database(input), title = scalarText(input.title, 'title', 300).trim();
    const requestId = scalarText(input.requestId, 'requestId', 128);
    const body = input.body === undefined ? '' : typeof input.body === 'string' && input.body.length <= MAX_BODY ? input.body : null;
    if (body === null || getFrontMatterInfo(body).exists) throw new RecordError('invalid_body', 'body 应为正文，YAML 属性请放在 properties 中');
    if (!db.schema.canCreate) throw new RecordError('creation_unavailable', '无法确定记录目录，或此视图不允许新建。请配置 nebulaRecords.folder');
    const signature = await revision(canonical({database: db.file.path, view: db.view.name, title, body, properties: input.properties ?? {}}));
    const retried = db.candidates.find(record => record.properties[REQUEST_ID] === requestId);
    if (retried) {
      if (retried.properties[REQUEST_HASH] !== signature) throw new RecordError('request_id_conflict', '相同 requestId 对应了不同内容');
      return {...await this.result(retried, db, true), created: false, idempotent: true};
    }
    const properties = validateFields(input.properties ?? {}, db.schema.fields);
    if (db.schema.titleProperty) {
      if (Object.hasOwn(properties, db.schema.titleProperty) && properties[db.schema.titleProperty] !== title)
        throw new RecordError('title_conflict', 'title 与标题属性不一致');
      Object.assign(properties, validateFields({[db.schema.titleProperty]: title}, db.schema.fields));
    }
    const duplicate = db.records.find(record => this.title(record, db).normalize('NFC') === title.normalize('NFC'));
    if (duplicate) throw new RecordError('duplicate_title', '该数据库已有同名记录，请更新已有记录或使用不同标题', await this.result(duplicate, db, false));
    const combined: Record<string, unknown> = {...db.schema.defaults, ...properties, [REQUEST_ID]: requestId, [REQUEST_HASH]: signature};
    for (const [key, value] of Object.entries(combined)) if (value === null) delete combined[key];
    this.checkLinks(properties, db);
    const path = `${db.schema.folder ? db.schema.folder + '/' : ''}${filename(title)}.md`;
    if (this.app.vault.getAbstractFileByPath(path)) throw new RecordError('path_exists', '文件路径已存在，未覆盖', {path});
    if (!db.filter.test({path, properties: combined})) throw new RecordError('filter_mismatch', '新记录不满足目标视图的筛选条件', {filters: [db.base.filters, db.view.filters], defaults: db.schema.defaults});
    await this.unchanged(db);
    const folder = db.schema.folder!;
    if (folder && !this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
    if (folder && !(this.app.vault.getAbstractFileByPath(folder) instanceof TFolder)) throw new RecordError('invalid_folder', '记录目录不可用');
    const content = serialize(combined, body), file = await this.app.vault.create(path, content);
    return {...await this.result({file, path, content, properties: combined}, db, true), created: true};
  }
  private async update(input: Record<string, unknown>) {
    const db = await this.database(input), target = this.target(db, input.path);
    const expected = scalarText(input.expectedRevision, 'expectedRevision', 64);
    if (await revision(target.content) !== expected) throw new RecordError('revision_conflict', '页面已改变，请重新读取后再更新', await this.result(target, db, true));
    const patch = validateFields(input.properties ?? {}, db.schema.fields); this.checkLinks(patch, db);
    if (input.body !== undefined && input.append !== undefined) throw new RecordError('invalid_body', 'body 与 append 不能同时指定');
    for (const key of ['body', 'append']) if (input[key] !== undefined && (typeof input[key] !== 'string' || input[key].length > MAX_BODY))
      throw new RecordError('invalid_body', `${key} 必须是正文字符串`);
    const properties = {...target.properties};
    for (const [key, value] of Object.entries(patch)) {if (value === null) delete properties[key]; else properties[key] = value;}
    const info = getFrontMatterInfo(target.content), currentBody = target.content.slice(info.contentStart);
    const body = typeof input.body === 'string' ? input.body : typeof input.append === 'string' && input.append ?
      `${currentBody}${currentBody.endsWith('\n') || !currentBody ? '' : '\n'}${input.append}` : currentBody;
    if (getFrontMatterInfo(body).exists) throw new RecordError('invalid_body', '正文不能含起始 YAML 属性区');
    const next = Object.keys(patch).length ? serialize(properties, body) : target.content.slice(0, info.contentStart) + body;
    await this.unchanged(db);
    if (this.app.vault.getFileByPath(target.path) !== target.file) throw new RecordError('revision_conflict', '文件已移动或删除');
    if (next !== target.content) await this.app.vault.process(target.file, current => {
      if (current !== target.content || !this.enabled()) throw new RecordError('revision_conflict', '写入前页面发生变化，未覆盖');
      return next;
    });
    return {...await this.result({...target, content: next, properties}, db, true), updated: next !== target.content,
      matchesView: db.filter.test({path: target.path, properties})};
  }

  async storeAttachment(name: string, data: ArrayBuffer) {
    if (!this.enabled()) throw new RecordError('unavailable', '记录接口已停止');
    if (!/\.(png|jpe?g|webp|gif|heic|heif)$/i.test(name) || !data.byteLength || data.byteLength > 20 * 1024 * 1024)
      throw new RecordError('invalid_attachment', '请选择 20 MB 以内的图片');
    const path = await this.app.fileManager.getAvailablePathForAttachment([...name].filter(char => char.charCodeAt(0) >= 32).join('').replace(/[\\/:*?"<>|#[\]^]/g, '_'));
    const file = await this.app.vault.createBinary(path, data);
    return {path: file.path, ...this.links(file.path, file.name)};
  }
}
