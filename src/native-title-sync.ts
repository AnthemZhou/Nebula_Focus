import {Component, MarkdownView, Notice, type Plugin, type TAbstractFile, type TFile} from 'obsidian';

import {isNativeTableViewMetadata, type IdeaViewMetadata} from './idea-native';
import {tableTitleProfiles} from './table-profile';

type Mapping = {property: string; sources: Set<IdeaViewMetadata>; conflict: boolean};
type NativeTitleView = MarkdownView & {
  inlineTitleEl?: HTMLElement; titleEl?: HTMLElement; fileBeingRenamed?: TFile | null;
  saveTitle?: (this: NativeTitleView, el: HTMLElement) => unknown;
};
type Edit = {
  view: NativeTitleView; el: HTMLElement; file: TFile; path: string;
  mapping: Mapping; before: string; changed: boolean; composing: boolean;
};
type Intent = Edit & {title: string; saving: boolean};
type TitleSession = {file: TFile; before: string; changed: boolean; composing: boolean; cancelled: boolean; focused: boolean};
type Presentation = {el: HTMLElement; headingEl?: HTMLElement; shown: string; header?: string; observer: MutationObserver; restore: () => void};
class SkippedTitleSync extends Error {}
class ConflictingTitleSync extends Error {}

function readOnly(view: IdeaViewMetadata): boolean {
  return !!(view.readOnly || view.isReadOnly || view.queryController?.readOnly || view.queryController?.isReadOnly ||
    view.containerEl?.closest('[aria-readonly="true"]'));
}
function folder(path: string) {return path.slice(0, path.lastIndexOf('/') + 1);}

/** A mapped record title follows a deliberate edit of the opened page's native
 * inline title. External renames and moves never rewrite record properties.
 * Navigation registers existing mappings only; nothing is inferred or persisted.
 */
export class NativeTitleSync extends Component {
  private enabled: boolean;
  private stopped = false;
  private epoch = 0;
  private mappings = new Map<TFile, Mapping>();
  private edits = new Map<HTMLElement, Edit>();
  private intents = new Map<TFile, Intent>();
  private documents = new Map<Document, () => void>();
  private saves = new Map<NativeTitleView, () => void>();
  private presentations = new Map<NativeTitleView, Presentation>();
  private titleSessions = new Map<HTMLElement, TitleSession>();
  private refreshQueued = false;

  constructor(private plugin: Plugin, enabled = true) {super(); this.enabled = enabled;}

  onload() {
    const {app} = this.plugin;
    this.watchDocument(app.workspace.containerEl.ownerDocument);
    app.workspace.iterateAllLeaves(leaf => this.watchDocument(leaf.view.containerEl.ownerDocument));
    this.registerEvent(app.workspace.on('window-open', (_workspace, win) => this.watchDocument(win.document)));
    this.registerEvent(app.workspace.on('window-close', (_workspace, win) => this.dropDocument(win.document)));
    this.registerEvent(app.workspace.on('file-open', () => this.refreshTitles()));
    this.registerEvent(app.workspace.on('layout-change', () => this.refreshTitles()));
    this.registerEvent(app.metadataCache.on('changed', () => this.queueRefresh()));
    this.registerEvent(app.vault.on('rename', (file, oldPath) => {void this.renamed(file, oldPath);}));
    this.registerEvent(app.vault.on('delete', file => {
      for (const mapped of this.mappings.keys()) if (mapped === file) {
        this.mappings.delete(mapped); this.intents.delete(mapped);
      }
    }));
    this.refreshTitles();
  }

  /** Call from the table's open action before routing to its record. A filename
   * column does not need a mapping. Ambiguous properties remain untouched.
   */
  remember(view: unknown, file: TFile, property?: string) {
    if (!this.enabled || this.stopped || !isNativeTableViewMetadata(view)) return;
    if (readOnly(view)) {this.mappings.delete(file); this.intents.delete(file); return;}
    if (file.extension !== 'md' || !property || /^(?:alias|aliases)$/i.test(property) ||
        !tableTitleProfiles(view).some(profile => profile.kind === 'property' && profile.titleProperty === property)) return;
    const value: unknown = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter?.[property];
    if (typeof value !== 'string' || !value.trim()) return;
    const previous = this.mappings.get(file);
    if (previous) {
      if (previous.property !== property) previous.conflict = true;
      previous.sources.add(view);
    } else this.mappings.set(file, {property, sources: new Set([view]), conflict: false});
    if (view.containerEl) this.watchDocument(view.containerEl.ownerDocument);
    this.refreshTitles();
  }

  setEnabled(value: boolean) {
    this.enabled = value;
    if (!value) {
      this.epoch++; this.mappings.clear(); this.edits.clear(); this.intents.clear();
      for (const restore of [...this.saves.values()]) restore();
      for (const presentation of [...this.presentations.values()]) presentation.restore();
      this.titleSessions.clear();
    }
    else this.refreshTitles();
  }

  /** Database mappings are explicit. On startup, a declared title or an alias of
   * an opaque imported ID is sufficient; arbitrary business fields are never guessed. */
  private displayTitle(file: TFile): string | undefined {
    if (!this.enabled || this.stopped || file.extension !== 'md') return;
    const front: Record<string, unknown> = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter ?? {};
    const text = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : undefined;
    const mapping = this.mappings.get(file);
    if (mapping && !mapping.conflict) {
      const title = text(front[mapping.property]);
      if (title) return title;
    }
    const declared = text(front.title);
    if (declared) return declared;
    if (!/^(?:[a-f\d]{32}|[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12})$/i.test(file.basename)) return;
    return text(front.aliases) ?? (Array.isArray(front.aliases) ? front.aliases.map(text).find(Boolean) : undefined);
  }

  private queueRefresh() {
    if (this.refreshQueued || !this.enabled || this.stopped) return;
    this.refreshQueued = true;
    queueMicrotask(() => {this.refreshQueued = false; this.refreshTitles();});
  }

  private refreshTitles() {
    if (!this.enabled || this.stopped) return;
    const live = new Set<NativeTitleView>();
    this.plugin.app.workspace.iterateAllLeaves(leaf => {
      if (!(leaf.view instanceof MarkdownView)) return;
      const view = leaf.view as NativeTitleView, el = view.inlineTitleEl, file = view.file;
      if (!el || !file) return;
      live.add(view);
      const title = this.displayTitle(file);
      let presentation = this.presentations.get(view);
      if (!title || presentation && (presentation.el !== el || presentation.headingEl !== view.titleEl)) {
        presentation?.restore(); presentation = undefined;
      }
      if (!title) return;
      if (!presentation) {
        const original = view.getDisplayText.bind(view), descriptor = Object.getOwnPropertyDescriptor(view, 'getDisplayText');
        const display = () => view.file && this.displayTitle(view.file) || original();
        view.getDisplayText = display;
        const observer = new el.ownerDocument.defaultView!.MutationObserver(() => this.queueRefresh());
        observer.observe(el, {childList: true, characterData: true, subtree: true});
        const headingEl = view.titleEl;
        if (headingEl) observer.observe(headingEl, {childList: true, characterData: true, subtree: true});
        const restore = () => {
          this.saves.get(view)?.();
          observer.disconnect();
          if (view.getDisplayText === display) {
            if (descriptor) Object.defineProperty(view, 'getDisplayText', descriptor);
            else delete (view as Partial<NativeTitleView>).getDisplayText;
          }
          const state = this.presentations.get(view);
          for (const target of [el, headingEl]) if (target) {
            if (state && target.textContent === state.shown && view.file) target.textContent = view.file.basename;
            this.titleSessions.delete(target);
          }
          this.presentations.delete(view);
          (leaf as typeof leaf & {updateHeader?: () => void}).updateHeader?.();
        };
        presentation = {el, headingEl, shown: title, observer, restore}; this.presentations.set(view, presentation);
        this.watchNativeSave(view);
      }
      // Metadata/layout updates must never replace the caret or an IME draft.
      for (const target of [el, presentation.headingEl]) if (target) {
        const session = this.titleSessions.get(target);
        if (!session || session.file !== file || session.cancelled || !session.focused && !session.changed) {
          if (target.textContent !== title) target.textContent = title;
        }
      }
      presentation.shown = title;
      if (presentation.header !== title) {
        presentation.header = title;
        (leaf as typeof leaf & {updateHeader?: () => void}).updateHeader?.();
      }
    });
    for (const [view, presentation] of this.presentations) if (!live.has(view)) presentation.restore();
  }

  private allowed(mapping: Mapping): boolean {
    return !mapping.conflict && [...mapping.sources].every(view => !readOnly(view) &&
      tableTitleProfiles(view).some(profile => profile.kind === 'property' && profile.titleProperty === mapping.property));
  }
  private ownTitle(target: EventTarget | null, doc: Document): NativeTitleView | undefined {
    const HTMLElement = doc.defaultView?.HTMLElement;
    if (!HTMLElement || !(target instanceof HTMLElement) || !target.matches('.inline-title, .view-header-title') ||
        target.getAttribute('contenteditable') !== 'true') return;
    let found: NativeTitleView | undefined;
    this.plugin.app.workspace.iterateAllLeaves(leaf => {
      if (leaf.view instanceof MarkdownView && [(leaf.view as NativeTitleView).inlineTitleEl,
        (leaf.view as NativeTitleView).titleEl].includes(target))
        found = leaf.view;
    });
    return found;
  }
  private begin(event: Event, doc: Document) {
    if (!this.enabled || this.stopped) return;
    const view = this.ownTitle(event.target, doc), file = view?.file;
    if (!view || !file) return;
    const el = event.target as HTMLElement;
    let mapping = this.mappings.get(file);
    if (!mapping && typeof this.plugin.app.metadataCache.getFileCache(file)?.frontmatter?.title === 'string') {
      mapping = {property: 'title', sources: new Set(), conflict: false}; this.mappings.set(file, mapping);
    }
    if (this.presentations.has(view)) this.titleSessions.set(el, {
      file, before: el.textContent?.trim() ?? '', changed: false, composing: false, cancelled: false, focused: true,
    });
    this.intents.delete(file); this.edits.delete(el);
    if (!mapping || !this.allowed(mapping)) return;
    const before: unknown = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter?.[mapping.property];
    if (typeof before !== 'string' || !before.trim()) return;
    this.edits.set(el, {view, el, file, path: file.path, mapping, before, changed: false, composing: false});
    this.watchNativeSave(view);
  }
  private editFor(event: Event): Edit | undefined {
    for (const [el, edit] of this.edits) if (event.target === el) return edit;
    return undefined;
  }
  private commit(edit: Edit) {
    const title = edit.el.textContent?.trim() ?? '';
    if (!edit.changed || edit.composing || !title || title === edit.file.basename ||
        edit.file.path !== edit.path || !this.allowed(edit.mapping)) return;
    this.intents.set(edit.file, {...edit, title, saving: false});
  }
  private watchNativeSave(view: NativeTitleView) {
    if (this.saves.has(view) || typeof view.saveTitle !== 'function') return;
    const original = view.saveTitle, descriptor = Object.getOwnPropertyDescriptor(view, 'saveTitle');
    const restore = () => {
      if (view.saveTitle === wrapped) {
        if (descriptor) Object.defineProperty(view, 'saveTitle', descriptor);
        else delete view.saveTitle;
      }
      this.saves.delete(view);
    };
    // fileBeingRenamed stays set after MarkdownView's inline blur in some hosts.
    // Limit the intent to this actual native save promise, not that stale flag.
    const prepare = (current: NativeTitleView, el: HTMLElement) => {
      const intent = current === view && current.file ? this.intents.get(current.file) : undefined;
      if (intent?.view === view && intent.el === el) intent.saving = true;
      return () => {
        if (intent && this.intents.get(intent.file) === intent) this.intents.delete(intent.file);
        const session = this.titleSessions.get(el);
        if (session) {session.changed = false; session.before = el.textContent?.trim() ?? '';}
        if (!this.edits.has(el) && !this.presentations.has(view)) restore();
        this.queueRefresh();
      };
    };
    const shouldSave = (current: NativeTitleView, el: HTMLElement) => {
      if (current !== view || !this.presentations.has(view) || ![view.inlineTitleEl, view.titleEl].includes(el)) return true;
      const session = this.titleSessions.get(el);
      return !!session && session.file === current.file && session.changed && !session.cancelled &&
        !session.composing && el.textContent?.trim() !== session.before;
    };
    function wrapped(this: NativeTitleView, el: HTMLElement): unknown {
      const finish = prepare(this, el);
      // Showing a readable label is not a request to rename the UUID file.
      if (!shouldSave(this, el)) {finish(); return Promise.resolve(true);}
      try {
        const result = original.call(this, el);
        void Promise.resolve(result).then(finish, finish);
        return result;
      } catch (error) {finish(); throw error;}
    }
    view.saveTitle = wrapped; this.saves.set(view, restore);
  }
  private watchDocument(doc: Document) {
    if (this.stopped || this.documents.has(doc)) return;
    const focus = (event: Event) => this.begin(event, doc);
    const input = (event: Event) => {
      const session = event.target instanceof doc.defaultView!.HTMLElement ? this.titleSessions.get(event.target) : undefined;
      if (session) {session.changed = true; session.cancelled = false;}
      const edit = this.editFor(event); if (!edit) return;
      edit.changed = true; this.intents.delete(edit.file);
    };
    const composition = (event: Event) => {
      const session = event.target instanceof doc.defaultView!.HTMLElement ? this.titleSessions.get(event.target) : undefined;
      if (session) session.composing = event.type === 'compositionstart';
      const edit = this.editFor(event); if (edit) edit.composing = event.type === 'compositionstart';
    };
    const blur = (event: Event) => {
      const session = event.target instanceof doc.defaultView!.HTMLElement ? this.titleSessions.get(event.target) : undefined;
      if (session) session.focused = false;
      const edit = this.editFor(event); if (edit) {this.commit(edit); this.edits.delete(edit.el);}
      this.queueRefresh();
    };
    const key = (event: KeyboardEvent) => {
      const session = event.target instanceof doc.defaultView!.HTMLElement ? this.titleSessions.get(event.target) : undefined;
      if (session && event.key === 'Escape' && !event.isComposing && !session.composing) session.cancelled = true;
      const edit = this.editFor(event); if (!edit || event.isComposing || edit.composing) return;
      if (event.key === 'Escape') {this.intents.delete(edit.file); this.edits.delete(edit.el);}
      else if (event.key === 'Enter') this.commit(edit);
    };
    doc.addEventListener('focus', focus, true); doc.addEventListener('input', input, true);
    doc.addEventListener('compositionstart', composition, true); doc.addEventListener('compositionend', composition, true);
    doc.addEventListener('blur', blur, true); doc.addEventListener('keydown', key, true);
    this.documents.set(doc, () => {
      doc.removeEventListener('focus', focus, true); doc.removeEventListener('input', input, true);
      doc.removeEventListener('compositionstart', composition, true); doc.removeEventListener('compositionend', composition, true);
      doc.removeEventListener('blur', blur, true); doc.removeEventListener('keydown', key, true);
    });
  }
  private dropDocument(doc: Document) {
    this.documents.get(doc)?.(); this.documents.delete(doc);
    for (const [el] of this.edits) if (el.ownerDocument === doc) this.edits.delete(el);
    for (const [file, intent] of this.intents) if (intent.el.ownerDocument === doc) this.intents.delete(file);
    for (const [view, restore] of this.saves) if (view.containerEl.ownerDocument === doc) restore();
    for (const [view, presentation] of this.presentations) if (view.containerEl.ownerDocument === doc) presentation.restore();
  }
  private async renamed(abstractFile: TAbstractFile, oldPath: string) {
    // The exact TFile identity is retained by a successful native rename.
    const file = [...this.intents.keys()].find(candidate => candidate === abstractFile);
    if (!file) return;
    const intent = this.intents.get(file)!; this.intents.delete(file);
    const {view, mapping, before, title} = intent, {app} = this.plugin;
    if (!intent.saving || !this.enabled || this.stopped || !this.allowed(mapping) || intent.path !== oldPath ||
        view.file !== file || view.fileBeingRenamed !== file || ![view.inlineTitleEl, view.titleEl].includes(intent.el) ||
        file.extension !== 'md' || folder(file.path) !== folder(oldPath) || file.basename !== title) return;
    const path = file.path, epoch = this.epoch;
    try {
      await app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
        if (!this.enabled || this.stopped || epoch !== this.epoch || file.path !== path ||
            app.vault.getFileByPath(path) !== file || this.mappings.get(file) !== mapping || !this.allowed(mapping))
          throw new SkippedTitleSync();
        if (!Object.hasOwn(frontmatter, mapping.property) || frontmatter[mapping.property] !== before)
          throw new ConflictingTitleSync();
        if (before === title) throw new SkippedTitleSync();
        frontmatter[mapping.property] = title;
      });
    } catch (error) {
      if (error instanceof SkippedTitleSync) return;
      new Notice(error instanceof ConflictingTitleSync
        ? '页面已改名，但标题属性同时发生变化，已保留属性值。'
        : '页面已改名，但标题属性未能同步，请检查笔记属性。');
    }
  }
  onunload() {
    this.stopped = true; this.setEnabled(false);
    for (const doc of [...this.documents.keys()]) this.dropDocument(doc);
  }
}
