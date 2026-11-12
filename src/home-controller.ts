import {Component, MarkdownRenderer, Notice, Plugin, TFolder, parseYaml, stringifyYaml, type WorkspaceLeaf} from 'obsidian';
import {HOME_VIEW_TYPE, HomeView, type HomeHost, type HomeSource} from './home-view';
import {cloneHomeBase, readHomeConfig, remapHomePaths, type HomeConfig, type HomeModule} from './home-model';
import {homeQueryEntries, renderHomeSummary, summarizeHome} from './home-summary';
import {nativeHTMLElement} from './native-presentation';

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const MODULE_FOLDER = 'Nebula Views/Home';

/** One per vault. This service writes configuration only; native Bases owns
 * explicit edits to note properties. Removing a module never removes records.
 */
export class HomeController extends Component implements HomeHost {
  config: HomeConfig;
  readonly views = new Set<HomeView>();
  private writes: Promise<unknown> = Promise.resolve();
  private stopped = false;
  private loadError?: unknown;
  private restoreTimer = 0;
  private layoutReady = false;
  private restoring = new Map<WorkspaceLeaf, Promise<void>>();
  private opening?: Promise<void>;

  constructor(readonly plugin: Plugin, initial: unknown, private save: (config: HomeConfig) => Promise<void>) {
    super();
    try {this.config = readHomeConfig(initial);}
    catch (error) {this.loadError = error; this.config = readHomeConfig(undefined);}
  }

  get app() {return this.plugin.app;}
  onload() {
    this.plugin.registerView(HOME_VIEW_TYPE, leaf => new HomeView(leaf, this));
    this.plugin.addCommand({id: 'open-home', name: '打开首页', callback: () => {void this.open();}});
    this.app.workspace.onLayoutReady(() => {
      if (this.stopped) return;
      this.layoutReady = true; this.scheduleRestore();
    });
    // Reload/lazy restoration can mount placeholders after the first ready
    // callback. Reconcile existing leaves without creating or activating any.
    const restore = () => this.scheduleRestore();
    this.registerEvent(this.app.workspace.on('layout-change', restore));
    this.registerEvent(this.app.workspace.on('active-leaf-change', restore));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      void this.update(config => remapHomePaths(config, oldPath, file.path));
    }));
  }

  private homeLeaves(): WorkspaceLeaf[] {
    const leaves: WorkspaceLeaf[] = [];
    this.app.workspace.iterateAllLeaves(leaf => {
      // A DeferredView or missing-plugin placeholder need not report the saved
      // view type through view.getViewType()/getLeavesOfType().
      if (leaf.getViewState().type === HOME_VIEW_TYPE) leaves.push(leaf);
    });
    return leaves;
  }

  private scheduleRestore() {
    if (this.stopped || !this.layoutReady || this.restoreTimer) return;
    this.restoreTimer = window.setTimeout(() => {
      this.restoreTimer = 0;
      if (this.stopped) return;
      for (const leaf of this.homeLeaves())
        void this.restoreLeaf(leaf).catch(error => {if (!this.stopped) this.failure('首页恢复未完成', error);});
    }, 0);
  }

  open(): Promise<void> {
    if (this.stopped) return Promise.resolve();
    if (this.opening) return this.opening;
    const operation = this.openHome().finally(() => {this.opening = undefined;});
    this.opening = operation;
    return operation;
  }

  private async openHome() {
    if (this.loadError) this.failure('首页配置无法读取，原文件已保留', this.loadError);
    try {
      const existing = this.homeLeaves()[0] ?? [...this.restoring.keys()][0];
      const leaf = existing ?? this.app.workspace.getLeaf('tab');
      await this.restoreLeaf(leaf, !existing);
      if (!this.stopped && leaf.view instanceof HomeView && leaf.view.host === this)
        await this.app.workspace.revealLeaf(leaf);
    } catch (error) {this.failure('首页未能打开', error);}
  }

  private restoreLeaf(leaf: WorkspaceLeaf, newLeaf = false): Promise<void> {
    const running = this.restoring.get(leaf);
    if (running) return running;
    if (this.stopped || leaf.view instanceof HomeView && leaf.view.host === this) return Promise.resolve();
    if (!newLeaf && leaf.getViewState().type !== HOME_VIEW_TYPE) return Promise.resolve();
    const operation = (async () => {
      if (leaf.isDeferred) {
        await leaf.loadIfDeferred();
        // Loading may finish after the user has chosen another page. Never
        // turn that destination back into Home or reset a now-valid Home.
        if (this.stopped || leaf.getViewState().type !== HOME_VIEW_TYPE ||
            leaf.view instanceof HomeView && leaf.view.host === this) return;
      }
      const state = leaf.getViewState();
      if (!newLeaf && state.type !== HOME_VIEW_TYPE) return;
      if (state.type === HOME_VIEW_TYPE) {
        // setViewState can reuse a same-type placeholder instead of calling
        // the newly registered factory. Reset its type without detaching it.
        await leaf.setViewState({type: 'empty', active: false});
        if (leaf.getViewState().type !== 'empty') return;
      }
      if (!this.stopped) await leaf.setViewState({...state, type: HOME_VIEW_TYPE, active: false});
    })().finally(() => {this.restoring.delete(leaf);});
    this.restoring.set(leaf, operation);
    return operation;
  }

  update(change: (config: HomeConfig) => HomeConfig): Promise<boolean> {
    return this.enqueue(async () => {
      const changed = change(this.config);
      if (changed === this.config) return;
      await this.commit(readHomeConfig(changed));
    });
  }

  saveModule(module: HomeModule): Promise<boolean> {
    return this.enqueue(async () => {
      // Validate the complete candidate before creating any files.
      const next = readHomeConfig({...this.config, modules: this.config.modules.some(item => item.id === module.id)
        ? this.config.modules.map(item => item.id === module.id ? module : item) : [...this.config.modules, module]});
      const target = next.modules.find(item => item.id === module.id)!;
      const previous = this.config.modules.find(item => item.id === module.id);
      if (target.kind !== 'links') {
        const reuse = previous && previous.kind !== 'links' && previous.kind === target.kind &&
          previous.source === target.source && previous.view === target.view && previous.basePath === target.basePath &&
          target.basePath && this.app.vault.getFileByPath(target.basePath);
        if (reuse) await this.assertOwned(target.basePath, target.id);
        else {
          const source = this.app.vault.getFileByPath(target.source);
          if (!source || source.extension !== 'base') throw new Error('请选择仍然存在的数据视图');
          const parsed: unknown = parseYaml(await this.app.vault.read(source));
          const cloned = cloneHomeBase(parsed, target.view, target.id);
          // Context-dependent queries would change meaning when moved to Home.
          const expressions = JSON.stringify([cloned.filters, cloned.formulas, cloned.views]);
          if (/\bthis\s*[.[]/.test(expressions)) throw new Error('此视图依赖当前笔记，请先选择使用固定筛选条件的视图');
          if (target.kind === 'summary' && Array.isArray(cloned.views) && object(cloned.views[0])) {
            cloned.views[0].type = 'table';
            cloned.views[0].nebulaAllowCreate = false;
          }
          await this.ensureFolder(MODULE_FOLDER);
          if (this.stopped) throw new Error('插件已关闭');
          // New source/view gets a new file: never overwrite an existing edited
          // module view or an unrelated path, including a cross-device collision.
          target.basePath = `${MODULE_FOLDER}/${crypto.randomUUID()}.base`;
          await this.app.vault.create(target.basePath, stringifyYaml(cloned));
        }
      }
      await this.commit(next);
    });
  }

  private enqueue(operation: () => Promise<void>): Promise<boolean> {
    const result = this.writes.then(async () => {
      if (this.stopped) return false;
      if (this.loadError) throw this.loadError instanceof Error ? this.loadError : new Error('首页配置无法读取');
      await operation(); return true;
    }).catch(error => {this.failure('首页设置未能保存', error); return false;});
    this.writes = result;
    return result;
  }

  private async commit(config: HomeConfig) {
    if (this.stopped) throw new Error('插件已关闭');
    await this.save(config);
    this.config = config;
    if (!this.stopped) for (const view of this.views) view.render();
  }

  async listSources(): Promise<HomeSource[]> {
    const sources: HomeSource[] = [];
    for (const file of this.app.vault.getFiles().filter(file => file.extension === 'base' && !file.path.startsWith(MODULE_FOLDER + '/'))) {
      try {
        const parsed: unknown = parseYaml(await this.app.vault.read(file));
        if (!object(parsed) || !Array.isArray(parsed.views)) continue;
        const views = parsed.views.filter(object).filter(view => typeof view.name === 'string' && typeof view.type === 'string');
        const properties = new Set<string>();
        for (const view of views) if (Array.isArray(view.order)) for (const value of view.order) {
          if (typeof value === 'string') properties.add(/^(?:note|file|formula)\./.test(value) ? value : `note.${value}`);
        }
        if (object(parsed.properties)) for (const key of Object.keys(parsed.properties)) properties.add(/^(?:note|file|formula)\./.test(key) ? key : `note.${key}`);
        if (object(parsed.formulas)) for (const key of Object.keys(parsed.formulas)) properties.add(`formula.${key}`);
        if (views.length) sources.push({path: file.path, views: views.map(view => String(view.name)), properties: [...properties]});
      } catch {/* A malformed unrelated Base must not prevent selecting another source. */}
    }
    return sources.sort((a, b) => a.path.localeCompare(b.path));
  }

  async openModule(module: HomeModule) {
    if (module.kind === 'links') return;
    const file = this.app.vault.getFileByPath(module.basePath);
    if (!file || file.extension !== 'base') {new Notice('模块视图已移动或不存在，请重新选择数据来源'); return;}
    await this.app.workspace.getLeaf('tab').openFile(file);
  }

  async mountModule(host: HTMLElement, module: HomeModule, component: Component): Promise<void> {
    if (module.kind === 'links') return;
    let alive = true;
    component.register(() => {alive = false;});
    await this.assertOwned(module.basePath, module.id);
    if (!alive || this.stopped) return;
    const summary = module.kind === 'summary';
    const output = summary ? host.createDiv({cls: 'nf-home-summary-output', text: '正在读取数据…'}) : undefined;
    const embed = host.createDiv({cls: summary ? 'nf-home-summary-query' : 'nf-home-data-view'});
    if (summary) {embed.setAttribute('aria-hidden', 'true'); embed.inert = true;}
    // The embed syntax exists only in this renderer call, never in a Markdown file.
    await MarkdownRenderer.render(this.app, `![[${module.basePath}]]`, embed, module.source, component);
    if (!alive || this.stopped) return;
    if (summary && output) this.watchSummary(embed, output, module, component);
  }

  private watchSummary(embed: HTMLElement, output: HTMLElement, module: Extract<HomeModule, {kind: 'summary'}>, component: Component) {
    const wrapped = new Map<Record<string, unknown>, {original: (...args: unknown[]) => unknown; replacement: (...args: unknown[]) => unknown}>();
    let stopped = false, timer = 0, signature = '';
    const win = embed.ownerDocument.win;
    const unavailable = () => {
      if (signature === 'unavailable') return;
      signature = 'unavailable'; output.replaceChildren();
      output.createDiv({cls: 'nf-home-summary-error', text: '暂未取得数据，请打开视图检查来源和筛选。'});
    };
    const render = (view: unknown) => {
      if (stopped) return;
      const entries = homeQueryEntries(view);
      if (!entries) {unavailable(); return;}
      const result = summarizeHome(entries, module);
      const next = JSON.stringify(result);
      if (next !== signature) {renderHomeSummary(output, result); signature = next;}
    };
    const discover = () => {
      timer = 0;
      if (stopped) return;
      const seen = new Set<unknown>(); let found = false;
      const visit = (value: unknown, depth: number) => {
        if (!object(value) || seen.has(value) || depth > 16) return;
        seen.add(value);
        const root = value.containerEl;
        if (value.type === 'table' && nativeHTMLElement(root) && embed.contains(root) && typeof value.onDataUpdated === 'function') {
          found = true;
          if (!wrapped.has(value)) {
            const original = value.onDataUpdated as (...args: unknown[]) => unknown;
            const replacement = function(this: unknown, ...args: unknown[]) {
              const result: unknown = original.apply(this, args);
              render(value); return result;
            };
            wrapped.set(value, {original, replacement}); value.onDataUpdated = replacement;
          }
          render(value);
        }
        if (object(value.controller)) visit(value.controller.view, depth + 1);
        if (object(value.queryController)) visit(value.queryController.view, depth + 1);
        if (Array.isArray(value._children)) for (const child of value._children) visit(child, depth + 1);
      };
      visit(component, 0);
      if (!found) unavailable();
    };
    const schedule = () => {if (!stopped && !timer) timer = win.setTimeout(discover, 0);};
    const observer = new MutationObserver(schedule);
    observer.observe(embed, {childList: true, subtree: true});
    // Metadata events also cover a hidden embed whose table has no visible rows.
    const event = this.app.metadataCache.on('changed', schedule);
    component.register(() => {
      stopped = true; win.clearTimeout(timer); observer.disconnect(); this.app.metadataCache.offref(event);
      for (const [view, item] of wrapped) if (view.onDataUpdated === item.replacement) view.onDataUpdated = item.original;
      wrapped.clear();
    });
    discover();
  }

  private async assertOwned(path: string, id: string) {
    const file = this.app.vault.getFileByPath(path);
    if (!file || file.extension !== 'base') throw new Error('模块视图不存在，请在编辑首页中重新选择来源');
    const parsed: unknown = parseYaml(await this.app.vault.read(file));
    if (!object(parsed) || !object(parsed.nebulaHomeModule) || parsed.nebulaHomeModule.version !== 1 || parsed.nebulaHomeModule.id !== id) {
      throw new Error('该文件不是此模块的数据视图，已保留原文件');
    }
  }

  private async ensureFolder(path: string) {
    let current = '';
    for (const part of path.split('/')) {
      current = current ? `${current}/${part}` : part;
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (existing && !(existing instanceof TFolder)) throw new Error('首页视图路径被其他文件占用');
      if (!existing) {
        try {await this.app.vault.createFolder(current);}
        catch (error) {if (!(this.app.vault.getAbstractFileByPath(current) instanceof TFolder)) throw error;}
      }
    }
  }

  private failure(message: string, error: unknown) {
    console.error('[Nebula Focus] ' + message, error);
    new Notice(message + '：' + (error instanceof Error ? error.message : String(error)));
  }
  onunload() {this.stopped = true; window.clearTimeout(this.restoreTimer); this.views.clear();}
}
