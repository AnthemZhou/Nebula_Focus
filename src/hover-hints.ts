import {Component, type Plugin} from 'obsidian';

type HiddenTitle = {title: string; label?: string};

/** Suppress browser title bubbles on the hovered ancestor chain only. Obsidian
 * tooltip elements are hidden separately by the enabled appearance stylesheet.
 * Neither menus nor link previews are involved in this controller. */
class DocumentHoverHints {
  private target?: Element;
  private ancestors: Element[] = [];
  private titles = new Map<Element, HiddenTitle>();
  private observer?: MutationObserver;

  constructor(private doc: Document, private enabled: () => boolean) {
    const Observer = doc.defaultView?.MutationObserver;
    if (Observer) this.observer = new Observer(() => {
      // The host can update a date or button title while the pointer stays put.
      for (const element of this.ancestors) this.suppress(element);
    });
    doc.addEventListener('pointerover', this.enter, true);
    doc.addEventListener('pointerout', this.leave, true);
    doc.defaultView?.addEventListener('blur', this.blur);
  }

  private enter = (event: PointerEvent) => {
    this.target = event.composedPath().find((node): node is Element => (node as Node).nodeType === 1);
    this.refresh();
  };

  private leave = (event: PointerEvent) => {
    const related = event.relatedTarget as Node | null;
    this.target = related?.nodeType === 1 ? related as Element : undefined;
    this.refresh();
  };

  private blur = () => {this.target = undefined; this.refresh();};

  refresh() {
    const ancestors: Element[] = [];
    if (this.enabled() && this.target?.isConnected) {
      for (let element: Element | null = this.target; element; element = element.parentElement)
        ancestors.push(element);
    }
    this.observer?.disconnect();
    for (const element of this.titles.keys()) if (!ancestors.includes(element)) this.restore(element);
    this.ancestors = ancestors;
    for (const element of ancestors) {
      this.suppress(element);
      this.observer?.observe(element, {attributes: true, attributeFilter: ['title']});
    }
  }

  private suppress(element: Element) {
    const title = element.getAttribute('title');
    // A host removal supersedes our stored value, including before observer delivery.
    if (title === null) {this.restore(element); return;}
    if (!title) return;
    const record = this.titles.get(element) ?? {title};
    record.title = title;
    if (record.label && element.getAttribute('aria-label') === record.label) {
      element.setAttribute('aria-label', title); record.label = title;
    } else if (!element.hasAttribute('aria-label') && !element.hasAttribute('aria-labelledby') &&
        !element.textContent?.trim() && !element.getAttribute('alt') && !element.getAttribute('value') &&
        !('labels' in element && (element as HTMLInputElement).labels?.length)) {
      // A title-only icon still needs a name for assistive technology.
      element.setAttribute('aria-label', title); record.label = title;
    }
    this.titles.set(element, record);
    element.setAttribute('title', '');
  }

  private restore(element: Element) {
    const record = this.titles.get(element);
    if (!record) return;
    this.titles.delete(element);
    if (element.getAttribute('title') === '') element.setAttribute('title', record.title);
    if (record.label && element.getAttribute('aria-label') === record.label) element.removeAttribute('aria-label');
  }

  destroy() {
    this.observer?.disconnect(); this.ancestors = []; this.target = undefined;
    for (const element of this.titles.keys()) this.restore(element);
    this.doc.removeEventListener('pointerover', this.enter, true);
    this.doc.removeEventListener('pointerout', this.leave, true);
    this.doc.defaultView?.removeEventListener('blur', this.blur);
  }
}

export class HoverHints extends Component {
  private documents = new Map<Document, DocumentHoverHints>();
  private stopped = false;

  constructor(private plugin: Plugin, private enabled = true) {super();}

  onload() {
    const workspace = this.plugin.app.workspace;
    this.attach(workspace.containerEl.ownerDocument);
    workspace.iterateAllLeaves(leaf => this.attach(leaf.view.containerEl.ownerDocument));
    this.registerEvent(workspace.on('window-open', (_workspace, win) => this.attach(win.document)));
    this.registerEvent(workspace.on('window-close', (_workspace, win) => {
      this.documents.get(win.document)?.destroy(); this.documents.delete(win.document);
    }));
  }

  private attach(doc: Document) {
    if (this.stopped || this.documents.has(doc)) return;
    this.documents.set(doc, new DocumentHoverHints(doc, () => this.enabled && !this.stopped));
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    for (const hints of this.documents.values()) hints.refresh();
  }

  onunload() {
    this.stopped = true;
    for (const hints of this.documents.values()) hints.destroy();
    this.documents.clear();
  }
}
