import {setIcon} from 'obsidian';
const KNOWN_TONES = new Map(Object.entries({Blender: 'green', AI: 'orange', C4D: 'blue', 编程: 'purple',
  技术: 'green', 流程: 'blue', 内容选题: 'yellow', B站: 'blue', 小红书: 'orange',
  教程: 'green', 预告: 'purple', 短视频内容: 'yellow', 未开始: 'yellow', 进行中: 'blue',
  制作中: 'blue', 完成: 'green', 已完成: 'green'}));

// Markdown/CSV migration retained values, not the original Notion property
// schema. These exact semantic field names are presentation hints, not a claim
// that an Obsidian text property has become a Notion select or relation.
const CLASSIFICATIONS = new Set(['领域', '类型', '重要性', '状态', '优先级', '分类', '发布平台', '内容类型',
  'status', 'type', 'priority', 'area', 'domain', 'category', 'platform', 'content type', 'content_type']);
const RELATIONS = new Set(['项目', '关联项目', '使用镜头', 'project', 'projects']);
export function semanticProperty(raw: string): 'classification' | 'relation' | null {
  const key = raw.replace(/^note\./, '').normalize('NFC').trim().toLowerCase();
  return CLASSIFICATIONS.has(key) ? 'classification' : RELATIONS.has(key) ? 'relation' : null;
}
type Decoration = {tone: string | null; className: string | null; added: Set<string>};

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
  private views = new Set<HTMLElement>();
  private footers = new Map<HTMLElement, HTMLElement>();

  refresh(root: ParentNode) {
    const current = new Set<HTMLElement>();
    const views = new Set<HTMLElement>();
    const containers = new Set<HTMLElement>();
    for (const view of root.querySelectorAll<HTMLElement>('.bases-view[data-view-type]')) {
      if (view.dataset.viewType === 'table' && view.dataset.viewName === '想法收集箱') {
        views.add(view); view.classList.add('bui-ideas-base'); this.refreshFooter(view);
      }
      for (const field of view.querySelectorAll<HTMLElement>(
        '.bases-td[data-property], .bases-cards-property[data-property], .bases-kanban-card-property[data-property], .bui-field[data-property]')) {
        const property = field.dataset.property ?? '';
        if (!semanticProperty(property) || field.querySelector('.bases-table-header')) continue;
        this.markContainer(field, containers);
        this.decorateValues(field, property.replace(/^note\./, ''), current);
      }
    }
    for (const field of root.querySelectorAll<HTMLElement>('.metadata-property[data-property-key]')) {
      const property = field.dataset.propertyKey ?? '';
      if (!semanticProperty(property)) continue;
      this.markContainer(field, containers);
      this.decorateValues(field, property, current);
    }
    // Obsidian mounts native property suggestions outside the workspace. Only
    // decorate a popup belonging to the actively edited semantic property.
    const doc = (root as Node).ownerDocument ?? root as Document;
    const field = doc?.activeElement?.closest<HTMLElement>('.bui-semantic-property');
    const property = (field?.dataset.propertyKey ?? field?.dataset.property ?? '').replace(/^note\./, '');
    if (semanticProperty(property)) {
      for (const popup of root.querySelectorAll<HTMLElement>('.suggestion-container.mod-property-value[data-property-key]')) {
        if (popup.dataset.propertyKey !== property) continue;
        for (const option of popup.querySelectorAll<HTMLElement>('.suggestion-item')) {
          const value = option.textContent?.trim();
          if (value) this.decorate(option, value, property, current);
        }
      }
    }
    for (const [el, original] of this.decorated) if (!current.has(el)) this.restore(el, original);
    for (const [el, present] of this.semanticContainers) if (!containers.has(el)) this.restoreContainer(el, present);
    for (const view of this.views) if (!views.has(view)) view.classList.remove('bui-ideas-base');
    for (const [view, footer] of this.footers) if (!views.has(view)) {
      footer.remove(); this.footers.delete(view);
    }
    this.views = views;
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

  private valueIdentity(el: HTMLElement): string {
    const link = el.matches('.internal-link, .external-link, .metadata-link-inner') ? el
      : el.querySelector<HTMLElement>('.internal-link, .external-link, .metadata-link-inner');
    // Link targets give the same related page a stable color across aliases.
    // Neither its displayed text nor its real href is changed.
    let value = link?.getAttribute('data-href') ?? link?.getAttribute('href') ??
      el.querySelector('.multi-select-pill-content')?.textContent ?? el.textContent ?? '';
    value = value.trim();
    const wiki = /^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/.exec(value);
    return (wiki?.[1] ?? value).normalize('NFC');
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
    // A pill containing a relation link must be colored as one pill while its
    // original link/remove controls remain intact, not as nested colored boxes.
    for (const pill of field.querySelectorAll<HTMLElement>('.multi-select-pill')) {
      const value = this.valueIdentity(pill);
      if (value) this.decorate(pill, value, property, current);
    }
  }

  private decorate(el: HTMLElement, value: string, property: string, current: Set<HTMLElement>) {
    current.add(el);
    if (!this.decorated.has(el)) this.decorated.set(el, {tone: el.getAttribute('data-bui-tone'), className: el.getAttribute('class'), added: new Set()});
    const original = this.decorated.get(el)!;
    const classes = ['bui-native-tag', 'bui-semantic-tag'];
    if (el.matches('.internal-link, .external-link, .metadata-link-inner')) classes.push('bui-semantic-link');
    for (const name of classes) {
      if (!el.classList.contains(name)) original.added.add(name);
      el.classList.add(name);
    }
    el.setAttribute('data-bui-tone', ideaTone(value, property));
  }

  private nativeCreateButton(view: HTMLElement): HTMLElement | null {
    if (!view.isConnected || view.dataset.viewName !== '想法收集箱' || view.dataset.viewType !== 'table') return null;
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
    let footer = this.footers.get(view);
    if (!this.nativeCreateButton(view)) {
      footer?.remove(); this.footers.delete(view);
      return;
    }
    if (!footer) {
      footer = view.ownerDocument.createElement('div');
      footer.className = 'bui-ideas-new-row';
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
        if (footer?.isConnected && this.footers.get(view) === footer) this.nativeCreateButton(view)?.click();
      });
      footer.append(button);
      this.footers.set(view, footer);
    }
    // A sibling footer cannot alter virtual-row positions or selection geometry.
    if (view.nextElementSibling !== footer) view.after(footer);
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
    for (const view of this.views) view.classList.remove('bui-ideas-base');
    this.views.clear();
    for (const footer of this.footers.values()) footer.remove();
    this.footers.clear();
  }
}
