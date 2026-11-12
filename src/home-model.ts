type HomeModuleCommon = {id: string; title: string; collapsed: boolean};
export type HomeViewModule = HomeModuleCommon & {
  kind: 'view'; source: string; view: string; basePath: string; height: number;
};
export type HomeSummaryModule = HomeModuleCommon & {
  kind: 'summary'; source: string; view: string; basePath: string;
  operation: 'count' | 'sum' | 'average'; property: string; groupBy: string;
};
export type HomeLinksModule = HomeModuleCommon & {kind: 'links'; paths: string[]};
export type HomeModule = HomeViewModule | HomeSummaryModule | HomeLinksModule;
export type HomeConfig = {version: 1; title: string; modules: HomeModule[]};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
function namedBaseView(value: unknown): value is Record<string, unknown> & {name: string; type: string} {
  return record(value) && nonempty(value.type) && nonempty(value.name);
}
function moduleId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z\d_-]+$/i.test(value);
}
function safePath(value: unknown, empty = false): value is string {
  if (value === '' && empty) return true;
  if (!nonempty(value)) return false;
  let path = value;
  for (let pass = 0; pass < 4; pass++) {
    if (/^[a-z][a-z\d+.-]*:/i.test(path) || path.includes('\\') || [...path].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) ||
        path.split('/').some(part => !part || part === '.' || part === '..')) return false;
    let decoded: string;
    try {decoded = decodeURIComponent(path);} catch {return true;}
    if (decoded === path) return true;
    path = decoded;
  }
  // Deeply encoded paths are unnecessary for vault APIs, which take literal paths.
  return false;
}

/** Clone declarative values without sharing nested settings with the source.
 * Unknown same-version fields survive a read/save cycle. Functions and cycles
 * cannot occur in persisted config and are rejected instead of silently dropped.
 */
function copy(value: unknown, ancestors = new Set<object>()): unknown {
  if (value === null || value === undefined || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object' || ancestors.has(value)) throw new Error('配置包含不支持或循环的数据');
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error('配置日期无效');
    return new Date(value.getTime());
  }
  if (!Array.isArray(value) && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw new Error('配置包含不支持的数据类型');
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return value.map(item => copy(item, ancestors));
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      Object.defineProperty(result, key, {value: copy(item, ancestors), enumerable: true, configurable: true, writable: true});
    }
    return result;
  } finally {ancestors.delete(value);}
}

function validModule(value: unknown): value is HomeModule {
  if (!record(value) || !moduleId(value.id) || typeof value.title !== 'string' || typeof value.collapsed !== 'boolean') return false;
  if (value.kind === 'links') return Array.isArray(value.paths) && value.paths.every(path => safePath(path));
  if ((value.kind !== 'view' && value.kind !== 'summary') || !safePath(value.source) || !safePath(value.basePath, true) || !nonempty(value.view)) return false;
  if (value.kind === 'view') return typeof value.height === 'number' && Number.isFinite(value.height) && value.height > 0;
  return (value.operation === 'count' || value.operation === 'sum' || value.operation === 'average') &&
    typeof value.property === 'string' && typeof value.groupBy === 'string';
}

/** Missing configuration starts with a blank home, never business-specific modules.
 * Invalid/future schemas throw, so a caller cannot accidentally replace them with
 * an empty default during save. */
export function readHomeConfig(value: unknown): HomeConfig {
  if (value === undefined || value === null) return {version: 1, title: '首页', modules: []};
  if (!record(value) || value.version !== 1) throw new Error('首页配置版本不受支持，已保留原配置');
  if (typeof value.title !== 'string' || !Array.isArray(value.modules) || !value.modules.every(validModule)) {
    throw new Error('首页配置格式无效，已保留原配置');
  }
  if (new Set(value.modules.map(module => module.id)).size !== value.modules.length) throw new Error('首页模块标识重复，已保留原配置');
  return copy(value) as HomeConfig;
}

export function reorderHomeModules(config: HomeConfig, id: string, targetId: string, after: boolean): HomeConfig {
  const from = config.modules.findIndex(module => module.id === id);
  if (from < 0 || id === targetId || !config.modules.some(module => module.id === targetId)) return config;
  const modules = config.modules.filter(module => module.id !== id);
  const target = modules.findIndex(module => module.id === targetId) + Number(after);
  modules.splice(target, 0, config.modules[from]);
  return modules.every((module, index) => module === config.modules[index]) ? config : {...config, modules};
}

/** Update exact file references or descendants of a renamed folder only. */
export function remapHomePaths(config: HomeConfig, oldPath: string, newPath: string): HomeConfig {
  if (!safePath(oldPath) || !safePath(newPath)) throw new Error('重命名路径必须是安全的库内相对路径');
  if (oldPath === newPath) return config;
  const remap = (path: string) => path === oldPath || path.startsWith(`${oldPath}/`) ? newPath + path.slice(oldPath.length) : path;
  let changed = false;
  const modules = config.modules.map(module => {
    if (module.kind === 'links') {
      const paths = module.paths.map(remap);
      if (paths.every((path, index) => path === module.paths[index])) return module;
      changed = true; return {...module, paths};
    }
    const source = remap(module.source), basePath = remap(module.basePath);
    if (source === module.source && basePath === module.basePath) return module;
    changed = true; return {...module, source, basePath};
  });
  return changed ? {...config, modules} : config;
}

/** Each home module owns one independent native Base view. Query constraints and
 * all declarative settings are copied; source files and Markdown are untouched. */
export function cloneHomeBase(parsed: unknown, viewName: string, id: string): Record<string, unknown> {
  if (!record(parsed) || !Array.isArray(parsed.views) || !parsed.views.every(namedBaseView) ||
      !nonempty(viewName) || !moduleId(id) ||
      (parsed.formulas !== undefined && !record(parsed.formulas)) || (parsed.properties !== undefined && !record(parsed.properties))) {
    throw new Error('来源数据视图配置无效');
  }
  const selected = parsed.views.filter(view => view.name === viewName);
  if (selected.length !== 1) throw new Error(selected.length ? '来源中有多个同名视图，请先重命名' : '所选来源视图不存在');
  const data = copy(parsed) as Record<string, unknown>;
  const view = copy(selected[0]) as Record<string, unknown>;
  view.name = '首页视图';
  data.views = [view];
  data.nebulaHomeModule = {version: 1, id};
  delete data.nebulaSource;
  return data;
}
