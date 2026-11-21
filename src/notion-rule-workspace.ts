import type {App, TFile} from 'obsidian';
import type {RuleSources, RuleRow} from './notion-rule-model';

export const RULES_FILE = 'nebula-notion-rules.json';
export function findRules(app: App, path: string): TFile | null {
  const parts = path.split('/'); parts.pop();
  while (true) {
    const file = app.vault.getFileByPath([...parts, RULES_FILE].join('/'));
    if (file) return file;
    if (!parts.pop()) return null;
  }
}
export function readSources(text: string): RuleSources {
  const config: unknown = JSON.parse(text);
  if (!config || typeof config !== 'object' || !('version' in config) || config.version !== 1 ||
    !('sources' in config) || !config.sources || typeof config.sources !== 'object') throw Error('无法读取 Notion 核算规则文件');
  const sources = config.sources as RuleSources;
  for (const source of Object.values(sources)) {
    if (!source?.properties || typeof source.properties !== 'object' ||
      !Object.values(source.properties).every(p => p && typeof p.type === 'string')) throw Error('规则文件缺少字段类型');
  }
  return sources;
}

export function ruleScope(app: App, rules: TFile) {
  const prefix = rules.path.slice(0,-RULES_FILE.length);
  return (file: TFile) => file.path.startsWith(prefix) &&
    !file.path.slice(prefix.length).split('/').some(p => p.startsWith('_') || p.startsWith('.')) &&
    findRules(app,file.path)?.path === rules.path;
}
export function resolveRuleLink(app: App, ref: string, row: RuleRow) {
  const link = /^\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]$/.exec(ref);
  return link ? app.metadataCache.getFirstLinkpathDest(link[1],row.key)?.path : undefined;
}
