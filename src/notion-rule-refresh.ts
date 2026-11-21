import type {App, TFile} from 'obsidian';
import {parseDocument, isMap, isScalar, type Node} from 'yaml';
import {NotionRuleModel, type RuleRow} from './notion-rule-model';
import type {RuleValue} from './notion-formula';
import {readSources, resolveRuleLink, ruleScope} from './notion-rule-workspace';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
// Different sum orders can differ in the final few IEEE-754 bits. Preserve a
// source value that is already equal to machine precision.
function equivalentCalculation(a: unknown, b: RuleValue): boolean {
  if (typeof a === 'number' && typeof b === 'number')
    return Math.abs(a-b) <= Math.max(Math.abs(a),Math.abs(b)) * Number.EPSILON * 4;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && b.every((v,i) => equivalentCalculation(a[i],v));
  return a === b;
}
const conflict = () => Error('核算期间规则或笔记发生变化，已停止。请等待同步结束后重新运行。');
const frontmatter = /^(\uFEFF?---[^\S\r\n]*\r?\n)([\s\S]*?)(\r?\n---[^\S\r\n]*(?:\r?\n|$))/u;

function readDocument(text: string) {
  const doc = parseDocument(text);
  if (doc.errors.length || !isMap(doc.contents)) throw Error('笔记的 YAML 属性不是有效的键值表');
  return doc;
}
type Edit = {start: number; end: number; text: string};

// Change only the YAML spans owned by calculated properties. All other bytes,
// including the original body, comments, quotes and line endings, are retained.
export function patchCalculated(text: string, updates: Map<string, RuleValue>): string {
  const match = frontmatter.exec(text);
  if (!match) throw Error('记录缺少有效的 YAML 属性区');
  const [,opening,yaml] = match, doc = readDocument(yaml);
  const map = doc.contents;
  if (!isMap(map) || map.flow) throw Error('写回核算值需要分行的 YAML 顶层属性');
  const newline = opening.endsWith('\r\n') ? '\r\n' : '\n';
  const edits: Edit[] = [], missing = new Map(updates);
  for (const pair of map.items) {
    const key = pair.key;
    if (!isScalar(key) || typeof key.value !== 'string' || !updates.has(key.value)) continue;
    if (!key.range) throw Error('无法定位 YAML 字段 ' + key.value);
    const value = updates.get(key.value)!, node = pair.value as Node | null;
    const end = node?.range?.[1] ?? key.range[1];
    const start = key.range[0], expectedNewline = yaml.slice(start,end).endsWith('\n');
    missing.delete(key.value);
    // Preserve any trailing inline comment or following delimiter newline.
    edits.push({start,end,text:value === null ? '' : yaml.slice(start,key.range[1]) + ': ' + JSON.stringify(value) + (expectedNewline ? newline : '')});
  }
  let patched = yaml;
  for (const edit of edits.reverse()) patched = patched.slice(0,edit.start) + edit.text + patched.slice(edit.end);
  for (const [key,value] of missing) if (value !== null) patched += newline + JSON.stringify(key) + ': ' + JSON.stringify(value);
  const expected = doc.toJS() as Record<string,unknown>;
  for (const [key,value] of updates) {if (value === null) delete expected[key]; else expected[key] = value;}
  const checked = readDocument(patched).toJS() as Record<string,unknown>;
  if (Object.keys(checked).length !== Object.keys(expected).length ||
    !Object.keys(expected).every(k => Object.hasOwn(checked,k) && same(checked[k],expected[k]))) throw Error('无法完整保留原有 YAML 属性，已停止');
  return opening + patched + text.slice(opening.length + yaml.length);
}

// Markdown and the rules file are read up front. Vault.process provides
// per-file compare-and-swap. Membership/stat checks also guard dependencies,
// including already-processed notes, while this multi-file job is running.
export async function refreshRuleProperties(app: App, rules: TFile, enabled = () => true): Promise<number> {
  const inScope = ruleScope(app,rules);
  const files = app.vault.getMarkdownFiles().filter(inScope);
  const knownPaths = new Set([...files,rules].map(file => file.path));
  const ownChanges = new Set<string>();
  let changed = false;
  const listener = app.vault.on('modify',file => {
    if (knownPaths.has(file.path) && !ownChanges.delete(file.path)) changed = true;
  });
  try {
    return await materialize(app,rules,files,() => enabled() && !changed,ownChanges);
  } finally {app.vault.offref(listener);}
}

async function materialize(app: App, rules: TFile, files: TFile[], enabled: () => boolean, ownChanges: Set<string>) {
  const inScope = ruleScope(app,rules);
  const expected = new Map([...files, rules].map(f => [f.path,{file:f,time:f.stat.mtime,size:f.stat.size}]));
  function guard() {
    if (!enabled() || app.vault.getMarkdownFiles().filter(inScope).length !== files.length) throw conflict();
    for (const [path,s] of expected) {
      if (app.vault.getFileByPath(path) !== s.file || s.file.stat.mtime !== s.time || s.file.stat.size !== s.size) throw conflict();
    }
  }
  const sources = readSources(await app.vault.read(rules));
  const rows: RuleRow[] = [];
  const originals = new Map<string,string>(), ids = new Set<string>();
  for (const file of files) {
    const cache = app.metadataCache.getFileCache(file);
    if (!cache) throw Error('请等待 Obsidian 索引此笔记后再核算：' + file.path);
    const original = await app.vault.read(file), match = frontmatter.exec(original);
    if (!match) {
      if (cache.frontmatter?.nf_source_collection || /^(?:\uFEFF)?---[ \t]*\r?\n/u.test(original)) throw Error('记录缺少有效的 YAML 属性区：' + file.path);
      continue;
    }
    const data = readDocument(match[2]).toJS() as Record<string,unknown>;
    const source = data.nf_source_collection;
    if (typeof source !== 'string' || !Object.hasOwn(sources,source)) continue;
    if (typeof data.nf_source_id === 'string' && data.nf_source_id) {
      if (ids.has(data.nf_source_id)) throw Error('记录来源 ID 重复：' + file.path);
      ids.add(data.nf_source_id);
    }
    rows.push({key:file.path,source,properties:data});
    originals.set(file.path,original);
  }
  if (!rows.length) throw Error('此规则目录未找到可核算的记录');
  const model = new NotionRuleModel(sources,rows,(ref,row) => resolveRuleLink(app,ref,row));
  const writes = new Map<string,string>();
  for (const row of rows) {
    const updates = new Map<string,RuleValue>();
    for (const field of model.fields(row)) {
      if ('error' in field) throw Error(`核算失败，未写入。 ${row.key} · ${field.name} · ${field.error}`);
      if (field.value === null ? Object.hasOwn(row.properties,field.name) : !equivalentCalculation(row.properties[field.name],field.value))
        updates.set(field.name,field.value);
    }
    if (updates.size) writes.set(row.key,patchCalculated(originals.get(row.key)!,updates));
  }
  guard();
  let written = 0;
  try {
    for (const [path,next] of writes) {
      const stamp = expected.get(path)!;
      await app.vault.process(stamp.file,current => {
        guard();
        if (current !== originals.get(path)) throw conflict();
        ownChanges.add(path);
        return next;
      });
      // Inspect the committed bytes as well as the host's new revision.
      stamp.time = stamp.file.stat.mtime; stamp.size = stamp.file.stat.size;
      if (await app.vault.read(stamp.file) !== next) throw conflict();
      written++;
    }
    guard();
  } catch (error) {
    throw Error(`已更新 ${written} 条记录，余下记录可重新核算。 ${error instanceof Error ? error.message : '写入失败'}`);
  }
  return written;
}
