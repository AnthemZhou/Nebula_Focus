import {type App, MarkdownRenderChild, Modal, Notice, Plugin, TFile, debounce} from 'obsidian';
import {displayRuleValue} from './notion-formula';
import {NotionRuleModel, type RuleRow} from './notion-rule-model';

import {findRules, readSources, resolveRuleLink, ruleScope, RULES_FILE} from './notion-rule-workspace';
import {refreshRuleProperties} from './notion-rule-refresh';

class RuleView extends MarkdownRenderChild {
  private revision = 0;
  constructor(private app: App, el: HTMLElement, private path: string, private id: string, private fields: string[] = []) {super(el);}
  onload() {
    const rules = findRules(this.app, this.path);
    if (!rules) {this.containerEl.setText('未找到 ' + RULES_FILE); return;}
    const prefix = rules.path.slice(0,-RULES_FILE.length);
    const refresh = debounce(() => {void this.render(rules);}, 180, true);
    this.register(() => refresh.cancel());
    const relevant = (file: {path: string}) => file.path.startsWith(prefix) && (file.path.endsWith('.md') || file.path === rules.path);
    this.registerEvent(this.app.metadataCache.on('changed', file => {if (relevant(file)) refresh();}));
    this.registerEvent(this.app.vault.on('delete', file => {if (relevant(file)) refresh();}));
    this.registerEvent(this.app.vault.on('rename', (file,old) => {if (relevant(file) || relevant({path:old})) refresh();}));
    this.registerEvent(this.app.vault.on('modify', file => {if (file.path === rules.path) refresh();}));
    void this.render(rules);
  }
  onunload() {this.revision++;}
  private async render(rules: TFile) {
    const revision = ++this.revision;
    try {
      const sources = readSources(await this.app.vault.cachedRead(rules));
      if (this.revision !== revision) return;
      const rows: RuleRow[] = [];
      const inScope = ruleScope(this.app,rules);
      for (const file of this.app.vault.getMarkdownFiles()) {
        if (!inScope(file)) continue;
        const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
        if (!fm || typeof fm.nf_source_collection !== 'string' || !Object.hasOwn(sources, fm.nf_source_collection)) continue;
        rows.push({key:file.path,source:fm.nf_source_collection,properties:fm});
      }
      const targets = rows.filter(row => this.id ? row.properties.nf_source_id === this.id : row.key === this.path);
      if (targets.length !== 1) throw Error(targets.length ? '记录来源 ID 重复' : '未找到对应的本地记录');
      const model = new NotionRuleModel(sources,rows,(ref,row) => resolveRuleLink(this.app,ref,row));
      const fields = model.fields(targets[0], this.fields);
      const el = this.containerEl;
      el.empty();
      if (!fields.length) {el.setText('此数据源没有公式或汇总字段'); return;}
      const table = el.createEl('table'), headers = table.createEl('thead').createEl('tr');
      headers.createEl('th',{text:'字段'}); headers.createEl('th',{text:'本地核算'});
      const body = table.createEl('tbody');
      for (const field of fields) {
        const tr = body.createEl('tr');
        tr.createEl('td',{text:field.name});
        tr.createEl('td',{text:'error' in field ? '未取得 · ' + field.error : displayRuleValue(field.value)});
      }
    } catch (error) {
      if (this.revision === revision) this.containerEl.setText(error instanceof Error ? error.message : '无法读取本地核算结果');
    }
  }
}

class RuleModal extends Modal {
  private view?: RuleView;
  constructor(app: App, private file: TFile) {super(app);}
  onOpen() {
    this.setTitle('本地核算');
    this.view = new RuleView(this.app,this.contentEl,this.file.path,''); this.view.load();
  }
  onClose() {this.view?.unload(); this.contentEl.empty();}
}
export function registerNotionRules(plugin: Plugin) {
  plugin.registerMarkdownCodeBlockProcessor('nebula-notion-rules',(source,el,ctx) => {
    const [target, ...fields] = source.trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    ctx.addChild(new RuleView(plugin.app,el,ctx.sourcePath,target === '.' ? '' : target ?? '',fields));
  });
  let refreshing = false, active = true;
  plugin.register(() => {active = false;});
  plugin.addCommand({id:'refresh-notion-rule-properties',name:'更新本地表格核算值',checkCallback(checking) {
    const file = plugin.app.workspace.getActiveFile();
    const rules = file && findRules(plugin.app,file.path);
    if (!rules || refreshing) return false;
    if (!checking) {
      refreshing = true;
      void refreshRuleProperties(plugin.app,rules,() => active)
        .then(count => {if (active) new Notice(`已更新 ${count} 条记录的核算值`);})
        .catch((error: unknown) => {if (active) new Notice(error instanceof Error ? error.message : '核算更新失败',10000);})
        .finally(() => {refreshing = false;});
    }
    return true;
  }});
  plugin.addCommand({id:'inspect-notion-rules',name:'查看当前记录的本地核算',checkCallback(checking) {
    const file = plugin.app.workspace.getActiveFile();
    if (!file || !plugin.app.metadataCache.getFileCache(file)?.frontmatter?.nf_source_collection || !findRules(plugin.app,file.path)) return false;
    if (!checking) new RuleModal(plugin.app,file).open();
    return true;
  }});
}
