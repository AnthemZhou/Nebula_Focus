import {evaluateFormula, parseFormula, type RuleValue} from './notion-formula';

type Property = {
  type: string; formula?: {expression: string};
  relation?: {data_source_id: string; dual_property?: {synced_property_name: string}};
  rollup?: {function: string; relation_property_name: string; rollup_property_name: string};
};
export type RuleSources = Record<string, {properties: Record<string, Property>}>;
export type RuleRow = {key: string; source: string; properties: Record<string, unknown>};
export type RuleResult = {name: string; value: RuleValue} | {name: string; error: string};
export const computed = (type: string) => type === 'formula' || type === 'rollup';

function links(value: unknown): string[] {
  if (value === undefined || value === null || value === '') return [];
  const values = Array.isArray(value) ? value : [value];
  if (!values.every((v): v is string => typeof v === 'string' && v.length > 0)) throw Error('关联值格式无效');
  return values;
}

// All results are transient. A missing, external or conflicting link makes its
// rollup unavailable instead of contributing a plausible but incomplete total.
export class NotionRuleModel {
  private byKey = new Map<string, RuleRow>();
  private parsed = new Map<string, ReturnType<typeof parseFormula>>();
  private results = new Map<RuleRow, Map<string, RuleValue>>();
  private computing = new Map<RuleRow, Set<string>>();
  private inverse = new Map<string, Map<string, Set<string>>>();
  constructor(readonly sources: RuleSources, private rows: RuleRow[],
    private resolve: (reference: string, row: RuleRow) => string | undefined) {
    for (const row of rows) {
      if (this.byKey.has(row.key)) throw Error('记录路径重复');
      this.byKey.set(row.key, row);
    }
  }
  fields(row: RuleRow, selection: string[] = []): RuleResult[] {
    const schema = this.sources[row.source]?.properties;
    if (!schema) throw Error('记录所属数据库不在规则文件中');
    const names = selection.length ? [...new Set(selection)] : Object.keys(schema).filter(name => computed(schema[name].type));
    return names.map(name => {
      if (!Object.hasOwn(schema,name) || !computed(schema[name].type)) return {name,error:'字段不是已定义的公式或汇总'};
      try {return {name, value: this.get(row, name)};}
      catch (error) {return {name, error: error instanceof Error ? error.message : '无法核算'};}
    });
  }
  private reverseIndex(source: string, name: string) {
    const cacheKey = JSON.stringify([source,name]);
    let index = this.inverse.get(cacheKey);
    if (index) return index;
    index = new Map();
    for (const row of this.rows) {
      if (row.source !== source) continue;
      for (const link of links(row.properties[name])) {
        const key = this.resolve(link, row);
        if (!key) continue;
        let members = index.get(key); if (!members) index.set(key, members = new Set());
        members.add(row.key);
      }
    }
    this.inverse.set(cacheKey,index); return index;
  }
  private rollup(row: RuleRow, p: Property): RuleValue {
    const spec = p.rollup;
    if (!spec || !['sum','show_original'].includes(spec.function)) throw Error('不支持的汇总方式');
    const relation = this.sources[row.source].properties[spec.relation_property_name]?.relation;
    if (!relation) throw Error('缺少汇总关联字段');
    const members = new Set<string>();
    const back = relation.dual_property?.synced_property_name;
    for (const ref of links(row.properties[spec.relation_property_name])) {
      const key = this.resolve(ref, row), target = key ? this.byKey.get(key) : undefined;
      if (!target || target.source !== relation.data_source_id) throw Error('有未导入或跨库的关联记录');
      if (back && !links(target.properties[back]).some(item => this.resolve(item,target) === row.key))
        throw Error('双向关联不一致，需核对关联记录');
      members.add(target.key);
    }
    // Locally created records can carry the reverse relation before the parent
    // note is edited. Include that membership exactly once.
    if (back) {
      for (const key of this.reverseIndex(relation.data_source_id,back).get(row.key) ?? []) members.add(key);
    }
    const values = Array.from(members, key => this.get(this.byKey.get(key)!, spec.rollup_property_name));
    if (spec.function === 'show_original') return values;
    let sum = 0;
    for (const value of values) {
      if (value === null || value === '') continue;
      if (typeof value !== 'number' || !Number.isFinite(value)) throw Error('汇总字段包含非数值');
      sum += value;
    }
    return sum;
  }
  get(row: RuleRow, name: string): RuleValue {
    const schema = this.sources[row.source]?.properties;
    if (!schema || !Object.hasOwn(schema, name)) throw Error('找不到字段 ' + name);
    const spec = schema[name], raw = row.properties[name];
    if (!computed(spec.type)) {
      if (spec.type === 'relation' || spec.type === 'multi_select') return links(raw);
      if (raw === undefined || raw === null) {
        if (spec.type === 'checkbox') return false;
        return ['title','rich_text','text','select','status'].includes(spec.type) ? '' : null;
      }
      if (typeof raw === 'number' || typeof raw === 'string' || typeof raw === 'boolean') return raw;
      throw Error('不支持的字段值 ' + name);
    }
    let cache = this.results.get(row); if (!cache) this.results.set(row, cache = new Map<string, RuleValue>());
    if (cache.has(name)) return cache.get(name)!;
    let stack = this.computing.get(row); if (!stack) this.computing.set(row, stack = new Set());
    if (stack.has(name)) throw Error('循环计算依赖 ' + name);
    stack.add(name);
    try {
      let value: RuleValue;
      if (spec.type === 'rollup') value = this.rollup(row, spec);
      else {
        const expr = spec.formula?.expression;
        if (!expr) throw Error('缺少公式原文');
        let parsed = this.parsed.get(expr);
        if (!parsed) {parsed = parseFormula(expr); this.parsed.set(expr,parsed);}
        value = evaluateFormula(parsed, property => this.get(row,property));
      }
      if (typeof value === 'number' && !Number.isFinite(value)) throw Error('计算结果不是有限数值');
      cache.set(name,value); return value;
    } finally {stack.delete(name);}
  }
}
