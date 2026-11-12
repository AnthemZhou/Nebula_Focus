import {setIcon} from 'obsidian';
import {containsRelationLink, RELATION_LINK_SELECTOR, semanticProperty} from './semantic-property';
export {semanticProperty} from './semantic-property';
const KNOWN_TONES = new Map(Object.entries({Blender: 'green', AI: 'orange', C4D: 'blue', 编程: 'purple',
  技术: 'green', 流程: 'blue', 内容选题: 'yellow', B站: 'blue', 小红书: 'orange',
  教程: 'green', 预告: 'purple', 短视频内容: 'yellow', 未开始: 'yellow', 进行中: 'blue',
  制作中: 'blue', 完成: 'green', 已完成: 'green'}));

type Decoration = {tone: string | null; className: string | null; added: Set<string>; kind: 'tag' | 'relation'};
type TableFooter = {el: HTMLElement; observer: MutationObserver; focused: boolean};

function enhancedTable(view: HTMLElement): boolean {
  const explicit = view.dataset.buiEnhancedTable;
  return view.dataset.viewType === 'table' &&
    (explicit === undefined ? view.dataset.viewName === '想法收集箱' : explicit === 'true');
}
/** Main validates the native view's profile before publishing its tag columns.
 * DOM decoration never infers select fields from arbitrary prose values. */
function configuredTags(view: HTMLElement): Set<string> {
  if (!enhancedTable(view)) return new Set();
  try {
    const values: unknown = JSON.parse(view.dataset.buiTagProperties ?? '[]');
    return new Set(Array.isArray(values) ? values.filter((value): value is string =>
      typeof value === 'string' && value.startsWith('note.') && value.length > 5) : []);
  } catch {return new Set();}
}

/** Style native Bases controls without replacing their contents or input handlers. */
export function ideaTone(text: string, property: string): string {
  text = text.trim().normalize('NFC');
  if (property === '重要性') {
    const marks = text.replace(/\s/g, '');
    if (marks === '!') return 'green';
    if (marks === '!!') return 'yellow';
    if (marks === '!!!') return 'orange';
  }
  const known = KNOWN_TONES.get(text);
  if (known) return known;
  // Stable across reloads and input order, without storing a styling property.
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.codePointAt(0)!, 16777619) >>> 0;
  return ['green', 'orange', 'blue', 'purple', 'yellow'][hash % 5];
}

export class IdeaTables {
  private decorated = new Map<HTMLElement, Decoration>();
  private semanticContainers = new Map<HTMLElement, boolean>();
  private relationContainers = new Map<HTMLElement, boolean>();
  private views = new Set<HTMLElement>();
  private footers = new Map<HTMLElement, TableFooter>();

  refresh(root: ParentNode, scoped = false) {
    const current = new Set<HTMLElement>();
    const views = new Set<HTMLElement>();
    const containers = new Set<HTMLElement>();
    const relations = new Set<HTMLElement>();
    const roots = Array.from(root.querySelectorAll<HTMLElement>('.bases-view[data-view-type]'));
    if ((root as Node).nodeType === 1 && (root as HTMLElement).matches('.bases-view[data-view-type]')) roots.unshift(root as HTMLElement);
    for (const view of roots) {
      if (enhancedTable(view)) {
        views.add(view); view.classList.add('bui-ideas-base'); this.refreshFooter(view);
      }
      const tags = configuredTags(view);
      for (const field of view.querySelectorAll<HTMLElement>(
        '.bases-td[data-property], .bases-cards-property[data-property], .bases-kanban-card-property[data-property], .bui-field[data-property]')) {
        const property = field.dataset.property ?? '';
        if (!field.matches('.bui-attachment-column, .bui-title-column') && containsRelationLink(field) &&
            (semanticProperty(property) || tags.has(property) || enhancedTable(view) && property.startsWith('note.'))) {
          this.markRelation(field, relations); this.decorateRelations(field, current); continue;
        }
        if (semanticProperty(property) === 'relation' && !tags.has(property)) continue;
        if ((!tags.has(property) && !semanticProperty(property)) || field.querySelector('.bases-table-header')) continue;
        this.markContainer(field, containers);
        this.decorateValues(field, property.replace(/^note\./, ''), current);
      }
    }
    for (const field of root.querySelectorAll<HTMLElement>('.metadata-property[data-property-key]')) {
      const property = field.dataset.propertyKey ?? '';
      if (!semanticProperty(property)) continue;
      if (containsRelationLink(field)) {this.markRelation(field, relations); this.decorateRelations(field, current); continue;}
      if (semanticProperty(property) === 'relation') continue;
      this.markContainer(field, containers);
      this.decorateValues(field, property, current);
    }
    // Obsidian mounts native property suggestions outside the workspace. Only
    // decorate a popup belonging to the actively edited semantic property.
    const doc = (root as Node).ownerDocument ?? root as Document;
    const field = doc?.activeElement?.closest<HTMLElement>('.bui-semantic-property');
    const property = (field?.dataset.propertyKey ?? field?.dataset.property ?? '').replace(/^note\./, '');
    if (field && this.semanticContainers.has(field)) {
      for (const popup of root.querySelectorAll<HTMLElement>('.suggestion-container.mod-property-value[data-property-key]')) {
        if (popup.dataset.propertyKey !== property) continue;
        for (const option of popup.querySelectorAll<HTMLElement>('.suggestion-item')) {
          const value = option.textContent?.trim();
          if (value) this.decorate(option, value, property, current);
        }
      }
    }
    const within = (el: HTMLElement) => !scoped || !el.isConnected || (root as Node).contains(el);
    for (const [el, original] of this.decorated) if (within(el) && !current.has(el)) this.restore(el, original);
    for (const [el, present] of this.semanticContainers) if (within(el) && !containers.has(el)) this.restoreContainer(el, present);
    for (const [el, present] of this.relationContainers) if (within(el) && !relations.has(el)) this.restoreRelation(el, present);
    for (const view of this.views) if (within(view) && !views.has(view)) {view.classList.remove('bui-ideas-base'); this.views.delete(view);}
    for (const view of this.footers.keys()) if (within(view) && !views.has(view)) this.removeFooter(view);
    for (const view of views) this.views.add(view);
  }

  private markContainer(el: HTMLElement, current: Set<HTMLElement>) {
    current.add(el);
    if (!this.semanticContainers.has(el)) this.semanticContainers.set(el, el.classList.contains('bui-semantic-property'));
    el.classList.add('bui-semantic-property');
  }

  private restoreContainer(el: HTMLElement, present: boolean) {
    if (!present) el.classList.remove('bui-semantic-property');
    this.semanticContainers.delete(el);
  }

  private markRelation(el: HTMLElement, current: Set<HTMLElement>) {
    current.add(el);
    if (!this.relationContainers.has(el)) this.relationContainers.set(el, el.classList.contains('bui-relation-property'));
    el.classList.add('bui-relation-property');
  }

  private restoreRelation(el: HTMLElement, present: boolean) {
    if (!present) el.classList.remove('bui-relation-property');
    this.relationContainers.delete(el);
  }

  private decorateRelations(field: HTMLElement, current: Set<HTMLElement>) {
    for (const link of field.querySelectorAll<HTMLElement>(RELATION_LINK_SELECTOR)) {
      const pill = link.closest<HTMLElement>('.multi-select-pill');
      const value = pill?.querySelector<HTMLElement>('.multi-select-pill-content') ?? link;
      // A native pill may carry the actual link class on its outer element.
      // Add only presentation classes, retaining its href and native handlers.
      if (pill) this.addClasses(pill, 'relation', ['bui-relation-pill'], current);
      this.addClasses(value, 'relation', ['bui-relation-link'], current);
    }
  }

  private valueIdentity(el: HTMLElement): string {
    return (el.querySelector('.multi-select-pill-content')?.textContent ?? el.textContent ?? '')
      .trim().normalize('NFC');
  }

  private decorateValues(field: HTMLElement, property: string, current: Set<HTMLElement>) {
    for (const el of field.querySelectorAll<HTMLElement>(
      '.multi-select-pill, .metadata-input-longtext, .metadata-link-inner, .internal-link, .external-link, .bases-rendered-value, .bui-field-value')) {
      // Do not decorate keys, empty input placeholders, icons or nested pieces
      // of the same native pill. Native links and editors retain their nodes.
      if (el.closest('.metadata-property-key, .bases-table-header') ||
          el.parentElement?.closest('.multi-select-pill') ||
          el.querySelector('.multi-select-pill, .metadata-input-longtext, .metadata-link-inner, .internal-link, .external-link')) continue;
      const renderer = el.closest<HTMLElement>('[data-property-type]');
      if (renderer?.dataset.propertyType && !['text', 'multitext', 'tags'].includes(renderer.dataset.propertyType)) continue;
      const value = this.valueIdentity(el);
      if (value) this.decorate(el, value, property, current);
    }
    for (const pill of field.querySelectorAll<HTMLElement>('.multi-select-pill')) {
      const value = this.valueIdentity(pill);
      if (value) this.decorate(pill, value, property, current);
    }
  }

  private decorate(el: HTMLElement, value: string, property: string, current: Set<HTMLElement>) {
    this.addClasses(el, 'tag', ['bui-native-tag', 'bui-semantic-tag'], current);
    el.setAttribute('data-bui-tone', ideaTone(value, property));
  }

  private addClasses(el: HTMLElement, kind: Decoration['kind'], classes: string[], current: Set<HTMLElement>) {
    current.add(el);
    const previous = this.decorated.get(el);
    if (previous && previous.kind !== kind) this.restore(el, previous);
    if (!this.decorated.has(el)) this.decorated.set(el, {tone: el.getAttribute('data-bui-tone'), className: el.getAttribute('class'), added: new Set(), kind});
    const original = this.decorated.get(el)!;
    for (const name of classes) {
      if (!el.classList.contains(name)) original.added.add(name);
      el.classList.add(name);
    }
  }

  private nativeCreateButton(view: HTMLElement): HTMLElement | null {
    if (!view.isConnected || !enhancedTable(view) || view.dataset.buiAllowCreate === 'false') return null;
    const parent = view.parentElement;
    const button = parent?.querySelector<HTMLElement>(':scope > .bases-header .bases-toolbar-new-item-menu .text-icon-button[role="button"]');
    if (!button || view.matches('[hidden], [aria-disabled="true"], [aria-readonly="true"], [data-readonly="true"], .is-disabled, .is-read-only, .is-readonly, .mod-readonly')) return null;
    const viewStyle = view.ownerDocument.defaultView?.getComputedStyle(view);
    if (viewStyle?.display === 'none' || viewStyle?.visibility === 'hidden') return null;
    for (let el: HTMLElement | null = button; el; el = el.parentElement) {
      if (el.matches('[disabled], [aria-disabled="true"], [aria-readonly="true"], [data-readonly="true"], [hidden], .is-disabled, .disabled, .is-read-only, .is-readonly, .mod-readonly')) return null;
      const style = el.ownerDocument.defaultView?.getComputedStyle(el);
      if (style?.display === 'none' || style?.visibility === 'hidden') return null;
    }
    return button;
  }

  private refreshFooter(view: HTMLElement) {
    const container = view.querySelector<HTMLElement>(':scope > .bases-table-container');
    let state = this.footers.get(view);
    if (!container || !this.nativeCreateButton(view)) {
      this.removeFooter(view);
      return;
    }
    if (!state) {
      const footer = view.ownerDocument.createElement('div');
      footer.className = 'bui-ideas-new-row';
      // Grid selection starts on press and can detach the footer before click.
      // Keep native button focus/default activation; isolate only propagation.
      for (const type of ['pointerdown', 'mousedown'])
        footer.addEventListener(type, event => event.stopPropagation(), true);
      const button = view.ownerDocument.createElement('button');
      button.type = 'button';
      button.className = 'bui-ideas-new-button';
      const icon = view.ownerDocument.createElement('span');
      icon.className = 'bui-ideas-new-icon';
      icon.setAttribute('aria-hidden', 'true');
      setIcon(icon, 'plus');
      button.append(icon, view.ownerDocument.createTextNode('新建条目'));
      button.addEventListener('click', event => {
        event.preventDefault(); event.stopPropagation();
        // Resolve the current native control at action time; native filtering,
        // permissions and file creation remain owned by Obsidian.
        if (footer.isConnected && this.footers.get(view)?.el === footer) this.nativeCreateButton(view)?.click();
      });
      footer.append(button);
      const observer = new view.ownerDocument.defaultView!.MutationObserver(() => {
        if (this.footers.get(view) === state) this.refreshFooter(view);
      });
      state = {el: footer, observer, focused: false};
      footer.addEventListener('focusin', () => {state!.focused = true;});
      footer.addEventListener('focusout', () => {if (footer.isConnected) state!.focused = false;});
      this.footers.set(view, state);
    }
    // Native virtual rendering owns the data container, tbody and their row
    // indexes. Match the native summary footer: a final child of the framed,
    // horizontally scrolling grid, after the data and any summary row.
    // Native setChildrenInPlace may detach this node during a render. Restore
    // it in the mutation microtask, without observing or modifying data rows.
    state.observer.disconnect();
    const width = container.style.width || '100%';
    if (state.el.style.width !== width) state.el.style.width = width;
    if (view.lastElementChild !== state.el) view.append(state.el);
    // Scrolling a focused footer into view can itself invoke native rendering.
    // Restore only a focus lost by detachment, never focus taken by an editor.
    if (state.focused && view.ownerDocument.activeElement === view.ownerDocument.body)
      state.el.querySelector('button')?.focus({preventScroll: true});
    state.observer.observe(view, {childList: true, attributes: true,
      attributeFilter: ['data-view-type', 'data-view-name', 'data-bui-enhanced-table', 'data-bui-allow-create']});
    state.observer.observe(container, {attributes: true, attributeFilter: ['style']});
  }

  private removeFooter(view: HTMLElement) {
    const state = this.footers.get(view);
    if (!state) return;
    state.observer.disconnect(); state.el.remove(); this.footers.delete(view);
  }

  private restore(el: HTMLElement, original: Decoration) {
    for (const name of original.added) el.classList.remove(name);
    if (original.className === null && !el.className) el.removeAttribute('class');
    original.tone === null ? el.removeAttribute('data-bui-tone') : el.setAttribute('data-bui-tone', original.tone);
    this.decorated.delete(el);
  }

  clear() {
    for (const [el, original] of this.decorated) this.restore(el, original);
    for (const [el, present] of this.semanticContainers) this.restoreContainer(el, present);
    for (const [el, present] of this.relationContainers) this.restoreRelation(el, present);
    for (const view of this.views) view.classList.remove('bui-ideas-base');
    this.views.clear();
    for (const view of this.footers.keys()) this.removeFooter(view);
  }
}
