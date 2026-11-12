import {App, Notice, parseYaml, Platform, StringValue} from 'obsidian';
import type {TFile, WorkspaceLeaf} from 'obsidian';
import {ensureCreationOrder} from './creation-order';
import {applyPropertyTransaction} from './property-history';

type UnknownMethod = (this: object, ...args: unknown[]) => unknown;
type NativeRecord = Record<string, unknown>;
function recordValue(value: unknown): value is NativeRecord {return !!value && typeof value === 'object';}
function method(value: unknown): value is UnknownMethod {return typeof value === 'function';}
function field(value: unknown, key: string): unknown {return recordValue(value) ? value[key] : undefined;}
function nativeGet(target: object, key: PropertyKey): unknown {return Reflect.get(target, key, target);}
function nativeBound(target: object, key: PropertyKey): unknown {
  const value = nativeGet(target, key);
  return method(value) ? value.bind(target) : value;
}
type QueryController = {
  view?: unknown; isReadOnly?: boolean; viewContainerEl?: HTMLElement; viewHeaderEl?: HTMLElement;
  newItemMenu: ItemMenu; requestNotifyView?: () => void;
};
type ItemMenu = {
  app?: unknown; queryController?: QueryController | null; open: UnknownMethod; close?: () => void;
  newlyCreatedFile?: unknown; popover?: {hoverEl?: HTMLElement} | null;
};
type HistoryView = {
  type?: string; _loaded?: boolean; containerEl: HTMLElement; config?: {name?: unknown; query?: {file?: unknown} | null; groupBy?: {property?: unknown} | null} | null;
  queryController: QueryController; undoStack: unknown[]; redoStack: unknown[];
  undoTransaction: UnknownMethod; redoTransaction: UnknownMethod; createTransaction?: UnknownMethod;
  createNoteInGroup?: UnknownMethod; isGroupedByFolder?: boolean; isReadOnly?: boolean;
  getEphemeralState?: () => unknown; setEphemeralState?: (state: unknown) => void; showError?: (error: unknown) => void;
};
/** A single-record table can edit its record without offering another record.
 * This is creation policy only; property transactions and history stay native. */
function allowsCreation(view: HistoryView): boolean {
  const config = view.config;
  if (!config) return true;
  try {
    const get = field(config, 'get');
    return (method(get) ? get.call(config, 'nebulaAllowCreate') : field(config, 'nebulaAllowCreate')) !== false;
  } catch {return false;}
}
function optional(value: unknown, valid: (value: unknown) => boolean): boolean {return value === undefined || valid(value);}
function htmlElement(value: unknown): value is HTMLElement {
  const constructor = field(field(field(value, 'ownerDocument'), 'defaultView'), 'HTMLElement');
  return typeof constructor === 'function' && value instanceof constructor;
}
function itemMenu(value: unknown): value is ItemMenu {
  if (!recordValue(value) || !method(value.open) || !optional(value.close, method)) return false;
  if (value.queryController != null && !recordValue(value.queryController)) return false;
  return value.popover === null || optional(value.popover, popover => recordValue(popover) && optional(popover.hoverEl, htmlElement));
}
/** Validate the native capabilities and optional shape before installing wrappers.
 * DOM checks use the element's own window so popout panes stay supported.
 */
function historyView(value: unknown): value is HistoryView {
  // Factory callbacks can expose a native instance before its config exists.
  // Some innocuous-looking properties are getters backed by that config, so
  // inspect readiness first and let a later discovery retry partial instances.
  try {
    if (!recordValue(value) || !recordValue(value.config)) return false;
    const config = value.config;
    if (!recordValue(value.queryController) || !itemMenu(value.queryController.newItemMenu)) return false;
    const boolean = (value: unknown) => typeof value === 'boolean';
    const controller = value.queryController;
    return htmlElement(value.containerEl) && method(value.undoTransaction) && method(value.redoTransaction) &&
      Array.isArray(value.undoStack) && Array.isArray(value.redoStack) &&
      optional(value.type, value => typeof value === 'string') &&
      ['_loaded', 'isGroupedByFolder', 'isReadOnly'].every(key => optional(value[key], boolean)) &&
      ['createTransaction', 'createNoteInGroup', 'getEphemeralState', 'setEphemeralState', 'showError'].every(key => optional(value[key], method)) &&
      optional(controller.isReadOnly, boolean) && optional(controller.requestNotifyView, method) &&
      optional(controller.viewContainerEl, htmlElement) && optional(controller.viewHeaderEl, htmlElement) &&
      (config.query == null || recordValue(config.query)) && (config.groupBy == null || recordValue(config.groupBy));
  } catch {return false;}
}

type Created = {file: TFile; path: string; content: string; ctime: number; mtime: number; removed: boolean; titleTouched?: boolean};
type RenameMarker = {changes: [{file: TFile; fromPath: string; toPath: string}]; state?: unknown};
type Session = {key: string; leaf: WorkspaceLeaf; file: unknown};
type Suspended = {session: Session; records: Map<unknown, Created>; properties: Set<unknown>; undo: unknown[]; redo: unknown[]; wasLast: boolean};
// Phone views backed by a real external Base share history across source tabs.
// Inline Bases and desktop panes retain their leaf-owned sessions.
type PhoneScope = {
  file: TFile; key: string; owners: Set<Session>; bindings: Set<Binding>; records: Map<unknown, Created>; properties: Set<unknown>;
  undo: unknown[]; redo: unknown[]; queue: Promise<void>; pendingCreates: number;
};
type Binding = {
  view: HistoryView; menu: ItemMenu; open: UnknownMethod; undo: UnknownMethod; redo: UnknownMethod;
  wrappedOpen: UnknownMethod; wrappedUndo: UnknownMethod; wrappedRedo: UnknownMethod;
  transaction?: UnknownMethod; wrappedTransaction?: UnknownMethod;
  groupCreate?: UnknownMethod; wrappedGroupCreate?: UnknownMethod; surfaces: Set<HTMLElement>;
  records: Map<unknown, Created>; properties: Set<unknown>; cleanup: (() => void)[]; queue: Promise<void>; creating: boolean;
  pendingCreates: number; pendingRecord?: Created; live: boolean;
  session?: Session; phone?: PhoneScope;
};
// A live-preview Base is a non-editable island inside CodeMirror. Stop at that
// boundary; its surrounding editor must not swallow the database shortcut.
function textTarget(target: HTMLElement): boolean {
  const closest = target.closest('input, textarea, select, [contenteditable], .cm-editor');
  return !!closest && closest.getAttribute('contenteditable') !== 'false';
}

// Property undo may serialize equivalent YAML differently. Compare native data
// and the exact body, without normalizing or writing the note itself.
function canonical(value: unknown): unknown {
  if (typeof value === 'number' && !Number.isFinite(value)) throw Error('Unsupported YAML number');
  if (value && typeof value === 'object' && !Array.isArray(value) && Object.prototype.toString.call(value) !== '[object Object]') throw Error('Unsupported YAML value');
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical((value as NativeRecord)[key])]));
  return value;
}
export function sameCreatedContent(a: string, b: string): boolean {
  if (a === b) return true;
  const split = (text: string) => {
    const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
    return match ? {body: text.slice(match[0].length), properties: canonical(parseYaml(match[1]) ?? {})}
      : {body: text, properties: {}};
  };
  try {return JSON.stringify(split(a)) === JSON.stringify(split(b));} catch {return false;}
}

/** Extend each native Base's chronological history with recoverable creation.
 * Existing transactions delegate to native methods; new property transactions
 * restore complete snapshots so undo also removes newly introduced keys.
 * No workspace-global file-create observer or global editor undo replacement.
 */
export class BaseCreationHistory {
  private bindings = new Map<unknown, Binding>();
  private surfaces = new Map<unknown, Set<HTMLElement>>();
  private suspended = new Map<string, Suspended>();
  private phones = new Set<PhoneScope>();
  private renames = new WeakSet<object>();
  private last?: Binding;
  constructor(private app: App, private changed: (view: unknown) => void = () => {}) {}

  /** Change only the basename through Obsidian's link-aware file manager.
   * The same serialized history owns creation, source properties and renames. */
  async rename(view: unknown, candidate: unknown, basename: string): Promise<void> {
    this.attach(view);
    const binding = this.bindings.get(view), path = field(candidate, 'path');
    if (!binding || !this.available(binding) || typeof path !== 'string') throw Error('当前数据库不可编辑，未重命名笔记');
    if (typeof basename !== 'string' || !basename || basename !== basename.trim() || basename === '.' || basename === '..' ||
        /[\\/:*?"<>|]/.test(basename) || [...basename].some(char => char.charCodeAt(0) < 32) ||
        /[. ]$/.test(basename) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(basename))
      throw Error('笔记名称不能为空，或包含文件名不支持的字符');
    const toPath = path.slice(0, path.lastIndexOf('/') + 1) + basename + '.md';
    this.pending(binding, 1); this.last = binding;
    return this.serial(binding, async () => {
      if (!this.available(binding)) throw Error('数据库已关闭或不可编辑，未重命名笔记');
      const file = this.app.vault.getFileByPath(path);
      if (!file || file !== candidate || file.path !== path || file.extension !== 'md')
        throw Error('原笔记已移动或被替换，未重命名其他文件');
      if (toPath === path) return;
      const marker: RenameMarker = {changes: [{file, fromPath: path, toPath}], state: binding.view.getEphemeralState?.()};
      await this.moveFilename(file, path, toPath);
      // A successful native operation can finish after its original renderer
      // unmounts. Keep the marker in the original still-open session only.
      this.renames.add(marker);
      const phone = binding.phone;
      if (phone && this.phones.has(phone) && this.phoneOpen(phone)) {
        phone.redo = []; phone.undo.push(marker); this.syncPhone(phone);
      } else if (!phone && binding.live) {
        binding.view.redoStack = []; binding.view.undoStack.push(marker);
      } else if (!phone && binding.session && this.sessionOpen(binding.session)) {
        const replacement = [...this.bindings.values()].find(peer => peer.live && !peer.phone && peer.session?.key === binding.session?.key);
        const saved = this.suspended.get(binding.session.key);
        if (replacement) {replacement.view.redoStack = []; replacement.view.undoStack.push(marker); this.notify(replacement);}
        else if (saved) {saved.redo = []; saved.undo.push(marker);}
      }
      if (binding.live) binding.view.queryController.requestNotifyView?.();
    }, () => {this.pending(binding, -1);});
  }

  private async moveFilename(file: TFile, fromPath: string, toPath: string): Promise<void> {
    // Retrying a completed move is harmless when a native refresh interrupted
    // the history transition; a different identity or path is never adopted.
    if (file.path === toPath && this.app.vault.getAbstractFileByPath(toPath) === file) return;
    if (file.extension !== 'md' || file.path !== fromPath || this.app.vault.getAbstractFileByPath(fromPath) !== file)
      throw Error('原笔记已移动或被替换，重命名记录已保留');
    const occupied = this.app.vault.getAbstractFileByPath(toPath);
    if (occupied && occupied !== file) throw Error('目标名称已有文件，未覆盖；重命名记录已保留');
    if (typeof this.app.fileManager.renameFile !== 'function') throw Error('原生重命名接口不可用');
    await this.app.fileManager.renameFile(file, toPath);
    if (file.path !== toPath || this.app.vault.getAbstractFileByPath(toPath) !== file)
      throw Error('未能确认重命名结果，请检查笔记路径');
  }

  private isRename(marker: unknown): marker is RenameMarker {
    return recordValue(marker) && this.renames.has(marker);
  }

  attach(view: unknown) {
    if (!historyView(view)) return;
    const menu = view?.queryController?.newItemMenu;
    if (!view?.containerEl?.isConnected || view._loaded === false || !menu ||
        typeof menu.open !== 'function' || typeof view.undoTransaction !== 'function' ||
        typeof view.redoTransaction !== 'function' || !Array.isArray(view.undoStack) || !Array.isArray(view.redoStack)) return;
    const existing = this.bindings.get(view);
    const session = this.session(view);
    if (existing && existing.menu === menu && existing.session?.key === session?.key) {this.resume(existing); return;}
    if (existing) this.detach(existing, true);
    // A controller reuses its menu when changing view. It has only one owner.
    for (const binding of this.bindings.values()) if (binding.menu === menu) this.detach(binding, true);
    const binding: Binding = {view, menu, open: menu.open, undo: view.undoTransaction, redo: view.redoTransaction,
      wrappedOpen: () => undefined, wrappedUndo: () => undefined, wrappedRedo: () => undefined,
      records: new Map(), properties: new Set(), surfaces: this.surfaces.get(view) ?? new Set(), cleanup: [], queue: Promise.resolve(), creating: false, pendingCreates: 0, live: true};
    binding.session = session;
    this.joinPhone(binding);
    let pendingOwner: Binding | undefined;
    // A preview may replace a detached instance with a fresh component while
    // keeping the same open-note/database session.
    if (!binding.phone && session && menu.queryController?.view === view) for (const old of this.bindings.values())
      if (old.session?.key === session.key && !this.visible(old)) {
        if (old.pendingCreates) pendingOwner = old;
        else this.detach(old, true);
      }
    const history = {pending: this.pending.bind(this), notify: this.notify.bind(this), serial: this.serial.bind(this),
      available: this.available.bind(this), captureAvailable: this.captureAvailable.bind(this), capture: this.capture.bind(this),
      phoneCreationReceiver: this.phoneCreationReceiver.bind(this), historyReceiver: this.historyReceiver.bind(this),
      enqueue: this.enqueue.bind(this), setLast: () => {this.last = binding;}, app: this.app};
    binding.wrappedOpen = function(...args: unknown[]) {
      if (!allowsCreation(view)) return;
      if (!itemMenu(this)) return binding.open.apply(this, args);
      history.pending(binding, 1); history.setLast();
      return history.serial(binding, async () => {
      const available = () => allowsCreation(view) && history.available(binding) && this.queryController?.view === view && view.queryController?.newItemMenu === this;
      if (!available() || binding.creating) return;
      binding.creating = true;
      const previous = this.newlyCreatedFile;
      try {
        try {await ensureCreationOrder(view);} catch {new Notice('新建排序未能保存，保留原排序');}
        if (!available()) return;
        const created: unknown[] = [];
        const result = await binding.open.apply(history.phoneCreationReceiver(this, created), args);
        const file = created.length === 1 ? created[0] : this.newlyCreatedFile;
        if (history.captureAvailable(binding) && file && file !== previous) await history.capture(binding, file);
        return result;
      } finally {binding.creating = false;}
      }, () => {history.pending(binding, -1); history.notify(binding);});
    };
    binding.wrappedUndo = function() {return history.enqueue(binding, false);};
    binding.wrappedRedo = function() {return history.enqueue(binding, true);};
    // Native folder-group creation bypasses newItemMenu and returns no TFile.
    // Use its same native file-manager API only for this explicit branch.
    if (typeof view.createNoteInGroup === 'function') {
      const groupCreate = view.createNoteInGroup;
      binding.groupCreate = groupCreate;
      binding.wrappedGroupCreate = function(group: unknown, ...args: unknown[]) {
        if (!allowsCreation(view)) return;
        const key = field(group, 'key');
        const manager = history.app.fileManager;
        const createMarkdown = field(manager, 'createNewMarkdownFile'), folderPath = field(key, 'data');
        if (!view.isGroupedByFolder || view.config?.groupBy?.property !== 'file.folder' ||
            typeof StringValue !== 'function' || !(key instanceof StringValue) || typeof folderPath !== 'string' ||
            !method(createMarkdown))
          return groupCreate.call(this, group, ...args);
        history.pending(binding, 1); history.setLast();
        return history.serial(binding, async () => {
          if (!allowsCreation(view) || !history.available(binding)) return;
          const folder = history.app.vault.getFolderByPath(folderPath);
          if (!folder) {new Notice('目标文件夹不存在，未新建笔记'); return;}
          binding.creating = true;
          try {
            const file = await createMarkdown.call(manager, folder);
            if (history.captureAvailable(binding)) await history.capture(binding, file);
          } catch (error) {
            if (typeof view.showError === 'function') view.showError(error);
            else new Notice(error instanceof Error ? error.message : '新建未完成');
          } finally {binding.creating = false;}
        }, () => {history.pending(binding, -1); history.notify(binding);});
      };
      view.createNoteInGroup = binding.wrappedGroupCreate;
    }
    if (typeof view.createTransaction === 'function') {
      const transactionMethod = view.createTransaction;
      binding.transaction = transactionMethod;
      binding.wrappedTransaction = function(...args: unknown[]) {
        return history.serial(binding, async () => {
          if (!binding.live || binding.phone && !history.available(binding)) return;
          const previous = (binding.phone?.undo ?? view.undoStack).at(-1);
          const result = await transactionMethod.apply(history.historyReceiver(binding, this), args);
          const transaction = (binding.phone?.undo ?? view.undoStack).at(-1);
          if (transaction && transaction !== previous) binding.properties.add(transaction);
          history.setLast();
          return result;
        });
      };
      view.createTransaction = binding.wrappedTransaction;
    }
    menu.open = binding.wrappedOpen;
    view.undoTransaction = binding.wrappedUndo; view.redoTransaction = binding.wrappedRedo;
    this.bindings.set(view, binding);
    if (pendingOwner) {
      // A replacement can mount before the old view's native creation settles.
      // Queue its actions behind that owner, then hand over the complete history.
      // Mark it pending so an immediate undo is queued rather than dropped.
      const previous = pendingOwner;
      binding.pendingCreates++;
      binding.queue = (async () => {
        let queued: Promise<void>;
        do {queued = previous.queue; await queued;} while (queued !== previous.queue);
        if (!binding.live || !binding.session || !this.sessionOpen(binding.session)) return;
        if (previous.live) this.detach(previous, true);
        this.resume(binding);
      })().finally(() => {binding.pendingCreates--;});
    } else this.resume(binding);
    if (binding.phone) this.notify(binding);
  }

  private joinPhone(binding: Binding) {
    const {session, view, menu} = binding;
    const base = view.config?.query?.file, path = typeof base === 'string' ? base : field(base, 'path');
    const file = typeof path === 'string' ? this.app.vault.getFileByPath(path) : null;
    if (!Platform?.isPhone || !session || !file || file.extension !== 'base' || menu.queryController?.view !== view) return;
    const key = JSON.stringify([view.config?.name, view.type]);
    for (const scope of this.phones) if (!this.phoneOpen(scope)) this.phones.delete(scope);
    let scope = [...this.phones].find(item => item.file === file && item.key === key);
    if (!scope) {
      scope = {file, key, owners: new Set(), bindings: new Set(), records: binding.records, properties: binding.properties,
        undo: view.undoStack, redo: view.redoStack, queue: Promise.resolve(), pendingCreates: 0};
      this.phones.add(scope);
    }
    binding.phone = scope; scope.owners.add(session); scope.bindings.add(binding);
    binding.records = scope.records; binding.properties = scope.properties;
    this.syncPhone(scope);
  }

  private phoneOpen(scope: PhoneScope): boolean {
    if (this.app.vault.getAbstractFileByPath(scope.file.path) !== scope.file) return false;
    return [...scope.owners].some(session => this.sessionOpen(session));
  }

  private syncPhone(scope: PhoneScope) {
    for (const peer of scope.bindings) if (peer.live) {
      peer.view.undoStack = scope.undo; peer.view.redoStack = scope.redo;
    }
  }

  private notify(binding: Binding) {
    if (binding.phone) for (const peer of binding.phone.bindings) {if (peer.live) this.changed(peer.view);}
    else this.changed(binding.view);
  }

  private pending(binding: Binding, change = 0): number {
    const owner = binding.phone ?? binding;
    return owner.pendingCreates += change;
  }

  private captureAvailable(binding: Binding): boolean {
    // A native phone create already in flight can finish after its source tab
    // is replaced or closed, provided another tab still owns this same Base.
    return this.available(binding) || !!binding.phone && this.phones.has(binding.phone) && this.phoneOpen(binding.phone);
  }

  private historyReceiver(binding: Binding, receiver: object): object {
    const scope = binding.phone;
    if (!scope) return receiver;
    // Native transactions may finish after their view unmounts, and assign
    // entirely new stack arrays. Keep those reads/writes in the shared scope;
    // all other native methods retain their real view receiver.
    const syncPhone = () => this.syncPhone(scope);
    return new Proxy(receiver, {
      get(target, key) {
        if (key === 'undoStack') return scope.undo;
        if (key === 'redoStack') return scope.redo;
        return nativeBound(target, key);
      },
      set(target, key, value: unknown) {
        if (key === 'undoStack' || key === 'redoStack') {
          if (!Array.isArray(value)) return false;
          scope[key === 'undoStack' ? 'undo' : 'redo'] = value;
          syncPhone(); return true;
        }
        return Reflect.set(target, key, value, target);
      },
    });
  }

  private serial<T>(binding: Binding, action: () => Promise<T>, done?: () => void): Promise<T> {
    const owner = binding.phone ?? binding;
    const task = owner.queue.then(async () => {
      if (binding.phone) this.syncPhone(binding.phone);
      try {return await action();}
      finally {
        if (binding.phone) this.syncPhone(binding.phone);
        this.notify(binding);
      }
    }).finally(done);
    owner.queue = task.then(() => {}, () => {});
    return task;
  }

  /** On phones the native menu opens a tab and returns before assigning its
   * desktop-only newlyCreatedFile field. Observe only this invocation's exact
   * createNewFile return value; never patch the shared file manager or listen
   * for unrelated vault creates. Other methods keep their original receiver.
   */
  private phoneCreationReceiver(menu: ItemMenu, created: unknown[]): ItemMenu {
    const app = menu.app, manager = field(app, 'fileManager');
    if (!Platform?.isPhone || app !== this.app || !recordValue(manager) || !method(manager.createNewFile)) return menu;
    const managerReceiver = new Proxy(manager, {get(target, key) {
      const value = nativeGet(target, key);
      if (key === 'createNewFile' && method(value)) return async (...args: unknown[]) => {
        const file = await value.apply(target, args); created.push(file); return file;
      };
      return method(value) ? value.bind(target) : value;
    }});
    const appReceiver = new Proxy(app, {get(target, key) {
      if (key === 'fileManager') return managerReceiver;
      return nativeBound(target, key);
    }});
    return new Proxy(menu, {get(target, key, receiver) {
      return key === 'app' ? appReceiver : Reflect.get(target, key, receiver) as unknown;
    }});
  }

  // Markdown preview destroys off-screen Base instances. Keep their history in
  // the owning open note, rather than treating scrolling as closing a database.
  private session(view: HistoryView): Session | undefined {
    const base = view.config?.query?.file;
    const path = typeof base === 'string' ? base : field(base, 'path');
    if (typeof path !== 'string' || !path.endsWith('.base')) return;
    let result: Session | undefined;
    this.app.workspace.iterateAllLeaves(leaf => {
      const id = field(leaf, 'id'), file = field(leaf.view, 'file');
      if (id && file && leaf.view.containerEl?.contains(view.containerEl))
        result = {leaf, file,
          key: JSON.stringify([id, field(file, 'path'), path, view.config?.name, view.type])};
    });
    return result;
  }
  private sessionOpen(session: Session): boolean {
    // A phone can detach the whole inactive tab's DOM while keeping that tab
    // open. Conversely, a closed leaf can leave its DOM connected until the
    // next layout. Workspace membership, not rendering, owns the session.
    if (field(session.leaf.view, 'file') !== session.file) return false;
    let registered = false;
    this.app.workspace.iterateAllLeaves(leaf => {if (leaf === session.leaf) registered = true;});
    return registered;
  }
  private resume(binding: Binding) {
    binding.session ??= this.session(binding.view);
    // A loading placeholder may become the query owner without changing its
    // instance, menu or session, so retry eligibility on the attach fast path.
    if (!binding.phone) {
      this.joinPhone(binding);
      if (binding.phone) this.notify(binding);
    }
    if (binding.phone) {this.syncPhone(binding.phone); return;}
    const saved = binding.session && this.suspended.get(binding.session.key);
    // Loading placeholders share the key but are not the actual query owner.
    if (!saved || !this.sessionOpen(saved.session) || !this.available(binding) ||
        binding.menu.queryController?.view !== binding.view || binding.creating ||
        binding.view.undoStack.length || binding.view.redoStack.length) return;
    binding.records = saved.records; binding.properties = saved.properties;
    binding.view.undoStack = saved.undo; binding.view.redoStack = saved.redo;
    this.suspended.delete(saved.session.key);
    if (saved.wasLast && !this.last) this.last = binding;
  }

  registerSurface(view: unknown, root: HTMLElement): () => void {
    const surfaces = this.surfaces.get(view) ?? new Set<HTMLElement>();
    this.surfaces.set(view, surfaces); surfaces.add(root);
    this.attach(view);
    const binding = this.bindings.get(view);
    if (binding) binding.surfaces = surfaces;
    return () => {surfaces.delete(root); if (!surfaces.size) this.surfaces.delete(view);};
  }

  private available(binding: Binding): boolean {
    const {view} = binding;
    return binding.live && (!binding.phone || this.phones.has(binding.phone) && this.phoneOpen(binding.phone) && !!binding.session && this.sessionOpen(binding.session)) &&
      view._loaded !== false && (view.containerEl.isConnected || !!binding.session && this.sessionOpen(binding.session)) &&
      view.queryController?.view === view && !view.isReadOnly && !view.queryController?.isReadOnly;
  }

  private visible(binding: Binding): boolean {
    const roots = [binding.view.queryController?.viewContainerEl, ...binding.surfaces, binding.view.containerEl].filter(Boolean) as HTMLElement[];
    return roots.some(root => root.isConnected && !root.hidden &&
      (typeof root.checkVisibility !== 'function' || root.checkVisibility({checkVisibilityCSS: true})));
  }

  private async capture(binding: Binding, candidate: unknown) {
    const path = field(candidate, 'path');
    const file = typeof path === 'string' ? this.app.vault.getFileByPath(path) : null;
    if (!file || file !== candidate || file.extension !== 'md') return;
    const {view, menu} = binding;
    const record: Created = {file, path: file.path, content: '', ctime: file.stat.ctime, mtime: file.stat.mtime, removed: false};
    binding.pendingRecord = record;
    const title = menu.newlyCreatedFile === file && menu.popover?.hoverEl?.querySelector('.inline-title');
    if (title) {
      const touched = () => {record.titleTouched = true;};
      title.addEventListener('input', touched);
      binding.cleanup.push(() => title.removeEventListener('input', touched));
    }
    try {
      const content = await this.app.vault.read(file);
      if (this.captureAvailable(binding) && file.path === record.path && this.app.vault.getAbstractFileByPath(file.path) === file) {
        const marker = {changes: [], state: view.getEphemeralState?.()};
        record.content = content; binding.records.set(marker, record);
        if (binding.phone) {
          binding.phone.redo = []; binding.phone.undo.push(marker); this.syncPhone(binding.phone);
        } else {view.redoStack = []; view.undoStack.push(marker);}
        this.last = binding;
        this.notify(binding);
      }
    } finally {if (binding.pendingRecord === record) binding.pendingRecord = undefined;}
  }

  private focus(binding: Binding) {
    const surface = [...binding.surfaces].find(root => root.isConnected && !root.hidden);
    (surface ?? binding.view.containerEl)?.focus({preventScroll: true});
  }

  private enqueue(binding: Binding, redo: boolean): Promise<void> {
    return this.serial(binding, () => this.apply(binding, redo));
  }

  private liveDraft(record: Created, binding: Binding): boolean {
    const visited = new Set<unknown>(), editors = new Map<object, string>();
    const cleanSnapshots = new Set<unknown>(), dirtySnapshots = new Set<unknown>();
    let dirty = false;
    const visit = (component: unknown, depth = 0) => {
      if (!recordValue(component) || visited.has(component) || depth > 12) return;
      visited.add(component);
      if (component.file === record.file && recordValue(component.editor) && method(component.editor.getValue)) {
        const editor = component.editor, getValue = component.editor.getValue, value = getValue.call(editor);
        if (typeof value !== 'string') throw Error('无法确认笔记编辑器内容，未撤销新建');
        editors.set(editor, value);
        if (component.dirty === true || component.saveAgain === true) dirtySnapshots.add(editor);
        // Native property undo updates MarkdownView.data before its source
        // editor. An unchanged last-saved editor is not an unsaved user draft.
        // The child editor component shares this same editor object, so collect
        // owner evidence first instead of flagging that duplicate as a draft.
        if (component.dirty === false && component.saveAgain !== true &&
            typeof component.lastSavedData === 'string' && value === component.lastSavedData &&
            typeof component.data === 'string' && sameCreatedContent(record.content, component.data)) cleanSnapshots.add(editor);
      }
      if (Array.isArray(component._children)) for (const child of component._children as unknown[]) visit(child, depth + 1);
      for (const key of ['view', 'embed', 'markdownView']) if (component[key] && component[key] !== component) visit(component[key], depth + 1);
    };
    this.app.workspace.iterateAllLeaves(leaf => visit(leaf.view));
    visit(binding.menu.popover);
    for (const [editor, value] of editors) if (!sameCreatedContent(record.content, value) &&
        (!cleanSnapshots.has(editor) || dirtySnapshots.has(editor))) dirty = true;
    const title = binding.menu.popover?.hoverEl?.querySelector('.inline-title');
    if (binding.menu.newlyCreatedFile === record.file && title && title.textContent?.trim() !== record.file.basename) dirty = true;
    return dirty;
  }

  private async apply(binding: Binding, redo: boolean) {
    if (!this.available(binding) || binding.creating) return;
    const {view} = binding;
    const source = redo ? view.redoStack : view.undoStack;
    const target = redo ? view.undoStack : view.redoStack;
    const marker = source.at(-1), record = binding.records.get(marker);
    const owned = () => binding.live || !!binding.phone && this.phones.has(binding.phone) && this.phoneOpen(binding.phone);
    const unchanged = () => source === (redo ? binding.phone?.redo ?? view.redoStack : binding.phone?.undo ?? view.undoStack) &&
      target === (redo ? binding.phone?.undo ?? view.undoStack : binding.phone?.redo ?? view.redoStack) && source.at(-1) === marker;
    if (this.isRename(marker)) {
      try {
        const change = marker.changes[0];
        await this.moveFilename(change.file, redo ? change.fromPath : change.toPath, redo ? change.toPath : change.fromPath);
        if (!owned() || !unchanged()) return;
        source.pop(); target.push(marker);
        if (binding.live) {
          if (marker.state) view.setEphemeralState?.(marker.state);
          view.queryController.requestNotifyView?.(); this.focus(binding);
        }
      } catch (error) {new Notice(error instanceof Error ? error.message : '重命名撤销未完成，历史记录已保留');}
      return;
    }
    if (!record) {
      if (binding.properties.has(marker)) {
        try {
          await applyPropertyTransaction(this.app, view, marker, redo);
          if (!owned() || !unchanged()) return;
          source.pop(); target.push(marker);
          if (binding.live) {
            if (field(marker, 'state')) view.setEphemeralState?.(field(marker, 'state'));
            view.queryController.requestNotifyView?.();
          }
        } catch (error) {new Notice(error instanceof Error ? error.message : '属性撤销未完成，历史记录已保留');}
      } else await (redo ? binding.redo : binding.undo).call(this.historyReceiver(binding, view));
      if (binding.live) this.focus(binding);
      return;
    }
    const current = () => binding.live && view._loaded !== false && !view.isReadOnly && !view.queryController?.isReadOnly &&
      source === (redo ? view.redoStack : view.undoStack) && target === (redo ? view.undoStack : view.redoStack) && source.at(-1) === marker;
    try {
      if (!redo) {
        if (record.file.path !== record.path || this.app.vault.getAbstractFileByPath(record.path) !== record.file)
          throw Error('笔记已移动或被替换，未撤销新建');
        if (this.liveDraft(record, binding)) throw Error('笔记已有后续改动，请先撤销内容修改');
        const before = await this.app.vault.read(record.file);
        if (!current()) return;
        if (!sameCreatedContent(record.content, before)) throw Error('笔记已有后续改动，请先撤销内容修改');
        // Close only this creation's editor before removing its file. Native
        // close flushes pending editor work; verify again after that work settles.
        if (binding.menu.newlyCreatedFile === record.file) binding.menu.close?.();
        const window = view.containerEl.ownerDocument.defaultView;
        if (!window) throw Error('笔记窗口已关闭，未撤销新建');
        await new Promise<void>(resolve => window.setTimeout(resolve, 50));
        if (!current()) return;
        const contents = await this.app.vault.read(record.file);
        if (!current()) return;
        if (this.liveDraft(record, binding) || record.file.path !== record.path ||
            this.app.vault.getAbstractFileByPath(record.path) !== record.file || !sameCreatedContent(record.content, contents))
          throw Error('笔记已有后续改动，未撤销新建');
        // Always use the vault's recoverable trash, regardless of delete prefs.
        await this.app.vault.trash(record.file, false);
        record.removed = true;
      } else {
        if (this.app.vault.getAbstractFileByPath(record.path)) throw Error('原路径已有文件，未覆盖；无法重做新建');
        const previous = record.file;
        record.file = await this.app.vault.create(record.path, record.content, {ctime: record.ctime, mtime: record.mtime});
        record.removed = false;
        // Property transactions following creation must target the restored TFile.
        for (const transaction of [...(binding.phone?.undo ?? view.undoStack), ...(binding.phone?.redo ?? view.redoStack)])
          if (recordValue(transaction) && Array.isArray(transaction.changes))
            for (const change of transaction.changes as unknown[]) if (recordValue(change) && change.file === previous) change.file = record.file;
      }
      if (!owned() || !unchanged()) return;
      const index = source.indexOf(marker);
      if (index >= 0) source.splice(index, 1);
      target.push(marker);
      if (binding.live) {
        view.queryController.requestNotifyView?.();
        if (field(marker, 'state')) view.setEphemeralState?.(field(marker, 'state'));
        this.focus(binding);
      }
    } catch (error) {new Notice(error instanceof Error ? error.message : '操作未完成，历史记录已保留');}
  }

  private find(target: EventTarget | null): Binding | undefined {
    const element = target as HTMLElement | null;
    if (!element?.closest) return;
    for (const binding of this.bindings.values()) {
      if (!this.available(binding)) continue;
      const {view} = binding;
      if ([view.containerEl, view.queryController?.viewContainerEl, view.queryController?.viewHeaderEl,
        binding.menu.popover?.hoverEl, ...binding.surfaces].some(root => root?.contains(element))) return binding;
    }
  }

  private background(target: EventTarget | null): Binding | undefined {
    const binding = this.last;
    if (!binding || !this.available(binding)) return;
    const leaf = binding.view.containerEl.closest('.workspace-leaf.mod-active') ??
      binding.session?.leaf.view.containerEl?.closest('.workspace-leaf.mod-active');
    if (!leaf) return;
    // Off-screen detached previews remain usable in their same open note.
    // Connected but CSS-hidden source/preview twins must not receive shortcuts.
    if (!this.visible(binding) && binding.view.containerEl.isConnected) return;
    // Obsidian returns focus here when a new-note popover is dismissed.
    // Do not follow focus into another editor, pane, button or arbitrary text.
    const element = target as HTMLElement | null;
    if (target === document.body || (element?.matches?.('.markdown-preview-view') &&
        (element.contains(binding.view.queryController?.viewContainerEl ?? binding.view.containerEl) ||
         !binding.view.containerEl.isConnected && binding.session?.leaf.view.containerEl?.contains(element)))) return binding;
  }

  handleKey(event: KeyboardEvent): boolean {
    if (event.defaultPrevented || event.isComposing || event.altKey || !(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return false;
    const binding = this.find(event.target) ?? this.background(event.target);
    if (!binding || !this.available(binding) ||
        (!(event.shiftKey ? binding.view.redoStack : binding.view.undoStack).length && (event.shiftKey || !this.pending(binding)))) return false;
    const target = event.target as HTMLElement;
    if (textTarget(target)) {
      // A newly opened, untouched native title has no text edit to undo. All
      // other inputs retain native text/IME undo rather than deleting a note.
      const title = target.closest('.inline-title');
      const record = binding.pendingRecord ?? binding.records.get(binding.view.undoStack.at(-1));
      if (event.shiftKey || !title || !record || record.titleTouched || record.file.path !== record.path || binding.menu.newlyCreatedFile !== record.file || title.textContent?.trim() !== record.file.basename) return false;
    }
    event.preventDefault(); event.stopImmediatePropagation(); this.last = binding;
    void this.enqueue(binding, event.shiftKey); return true;
  }

  command(redo: boolean, checking: boolean): boolean {
    const binding = this.find(document.activeElement) ?? this.background(document.body);
    if (!binding || !this.available(binding) || (!(redo ? binding.view.redoStack : binding.view.undoStack).length && (redo || !this.pending(binding)))) return false;
    if (!checking) void this.enqueue(binding, redo); return true;
  }

  forView(view: unknown, redo: boolean, checking: boolean): boolean {
    const binding = this.bindings.get(view);
    if (!binding || !this.available(binding) || (!(redo ? binding.view.redoStack : binding.view.undoStack).length && (redo || !this.pending(binding)))) return false;
    if (!checking) {this.last = binding; void this.enqueue(binding, redo);}
    return true;
  }

  prune() {
    for (const scope of this.phones) if (!this.phoneOpen(scope)) this.phones.delete(scope);
    for (const [key, saved] of this.suspended) if (!this.sessionOpen(saved.session)) this.suspended.delete(key);
    for (const binding of this.bindings.values()) if (binding.view._loaded === false ||
        !binding.view.containerEl.isConnected && (!binding.session || !this.sessionOpen(binding.session)) ||
        binding.view.queryController.view !== binding.view || binding.session && !this.sessionOpen(binding.session)) this.detach(binding, true);
    for (const binding of this.bindings.values()) this.resume(binding);
  }
  private detach(binding: Binding, preserve = false) {
    const saved = !binding.phone && preserve && binding.session && this.sessionOpen(binding.session) &&
      (binding.records.size || binding.properties.size || binding.view.undoStack.length || binding.view.redoStack.length || this.pending(binding));
    if (saved && binding.session) {
      this.suspended.set(binding.session.key, {session: binding.session, records: new Map(binding.records),
        properties: new Set(binding.properties), undo: [...binding.view.undoStack], redo: [...binding.view.redoStack], wasLast: this.last === binding});
    }
    // A native view instance can be reused for another configuration or note.
    // Move all transactions into the suspended scope, or discard them when its
    // source closed; none may leak into the new scope's native undo handler.
    const scoped = preserve && !!binding.session;
    if (scoped) {binding.view.undoStack = []; binding.view.redoStack = [];}
    binding.phone?.bindings.delete(binding);
    binding.live = false;
    for (const cleanup of binding.cleanup) cleanup();
    if (binding.menu.open === binding.wrappedOpen) binding.menu.open = binding.open;
    if (binding.view.undoTransaction === binding.wrappedUndo) binding.view.undoTransaction = binding.undo;
    if (binding.view.redoTransaction === binding.wrappedRedo) binding.view.redoTransaction = binding.redo;
    if (binding.wrappedTransaction && binding.view.createTransaction === binding.wrappedTransaction) binding.view.createTransaction = binding.transaction;
    if (binding.wrappedGroupCreate && binding.view.createNoteInGroup === binding.wrappedGroupCreate) binding.view.createNoteInGroup = binding.groupCreate;
    const removed = new Set<unknown>([...binding.records.values()].filter(record => record.removed).map(record => record.file));
    if (!scoped) for (const key of ['undoStack', 'redoStack'] as const) binding.view[key] = binding.view[key].flatMap(item => {
      if (binding.records.has(item) || this.isRename(item)) return [];
      if (!recordValue(item) || !Array.isArray(item.changes)) return [item];
      const original: unknown[] = item.changes;
      const changes = original.filter(change => !recordValue(change) || !removed.has(change.file));
      if (changes.length === original.length) return [item];
      return changes.length ? [{...item, changes}] : [];
    });
    this.bindings.delete(binding.view);
    if (this.last === binding) this.last = undefined;
  }
  clear() {for (const binding of this.bindings.values()) this.detach(binding); this.surfaces.clear(); this.suspended.clear(); this.phones.clear(); this.renames = new WeakSet();}
}
