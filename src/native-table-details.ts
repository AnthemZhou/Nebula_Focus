import {isIdeaView, isIdeaViewMetadata, isHtmlElement} from './idea-native';
import {tableProfile} from './table-profile';
import {isUnavailableValue} from './unavailable-value';

type Placeholder = {badge: HTMLElement};
type ScopeNote = {el: HTMLElement; body: HTMLElement; details?: HTMLDetailsElement; expanded: boolean};

/** Only collapse a repeated finance explanation, never an isolated source warning. */
function compactScope(view: unknown, root: HTMLElement): boolean {
  try {
    if (!isIdeaViewMetadata(view) || view.config.get?.('showSummaries') !== true) return false;
    const callout = root.closest('.callout[data-callout="info"]');
    const content = callout?.querySelector<HTMLElement>(':scope > .callout-content');
    if (!content) return false;
    return [...content.querySelectorAll('p')].some(paragraph =>
      paragraph.closest('.callout') === callout && !root.contains(paragraph) &&
      !paragraph.closest('.internal-embed, .bases-embed, .bases-view, .block-language-base, [hidden], [aria-hidden="true"]') &&
      !paragraph.querySelector('.internal-embed, .bases-embed, .bases-view, .block-language-base') &&
      paragraph.style.display !== 'none' && paragraph.style.visibility !== 'hidden' &&
      !!paragraph.textContent?.trim());
  } catch {return false;}
}

/** Presentation only: preserve provenance warnings when retiring the old layout. */
export class NativeTableDetails {
  private notes = new Map<HTMLElement, ScopeNote>();
  private placeholders = new Map<HTMLElement, Placeholder>();
  constructor(private readonly metadata: (path: string) => Record<string, unknown> | undefined) {}

  refresh(view: unknown, root: HTMLElement) {
    const profile = tableProfile(view);
    const scope = profile?.scopeNote?.trim();
    let note = this.notes.get(root);
    if (scope && root.parentElement) {
      if (!note) {
        const el = root.createDiv({cls: 'bui-table-scope'});
        note = {el, body: el, expanded: false};
        this.notes.set(root, note);
      }
      const compact = compactScope(view, root);
      if (compact !== !!note.details) {
        if (note.details) note.expanded = note.details.open;
        note.el.replaceChildren();
        note.el.classList.toggle('is-collapsible', compact);
        if (compact) {
          note.details = note.el.createEl('details');
          note.details.open = note.expanded;
          note.details.createEl('summary', {text: '数据范围'});
          note.body = note.details.createDiv({cls: 'bui-table-scope-text'});
        } else {
          note.details = undefined;
          note.body = note.el;
        }
      }
      // Native table virtualization owns the root's children. Keep this note
      // beside the view, below its toolbar, so a row update cannot remove it.
      if (note.el.parentElement !== root.parentElement) root.before(note.el);
      if (note.body.textContent !== scope) note.body.textContent = scope;
    } else if (note) {note.el.remove(); this.notes.delete(root);}
    const seen = new Set<HTMLElement>();
    if (profile && isIdeaView(view)) for (const row of view.rows ?? []) {
      const entry = row.entry;
      if (!entry) continue;
      const unavailable = this.metadata(entry.file.path)?.nf_unavailable_fields;
      if (!Array.isArray(unavailable)) continue;
      for (const cell of row.cells ?? []) {
        const property = cell.prop ?? '';
        if (!property.startsWith('note.') || !unavailable.includes(property.slice(5))) continue;
        const value = entry.getRawProperty?.(property.slice(5));
        // An imported provenance marker may outlive a later manual correction.
        // In particular, zero is a real result and must never be hidden.
        if (!isUnavailableValue(value)) continue;
        const el = cell.innerEl ?? cell.el?.querySelector<HTMLElement>('.bases-table-cell');
        if (!isHtmlElement(el) || !root.contains(el)) continue;
        seen.add(el);
        let state = this.placeholders.get(el);
        if (!state) {
          const badge = el.createSpan({cls: 'bui-unavailable-value', text: '未取得'});
          badge.title = '此字段的 Notion 计算结果尚未取得；未计作零。';
          state = {badge};
          this.placeholders.set(el, state);
        }
        el.classList.add('bui-unavailable-cell');
        if (state.badge.parentElement !== el) el.append(state.badge);
      }
    }
    for (const [el, state] of this.placeholders) {
      if ((!el.isConnected || root.contains(el)) && !seen.has(el)) this.restore(el, state);
    }
    for (const [host, note] of this.notes) if (!host.isConnected) {note.el.remove(); this.notes.delete(host);}
  }

  private restore(el: HTMLElement, state: Placeholder) {
    state.badge.remove(); el.classList.remove('bui-unavailable-cell');
    this.placeholders.delete(el);
  }
  clear() {
    for (const [el, state] of this.placeholders) this.restore(el, state);
    for (const note of this.notes.values()) note.el.remove();
    this.notes.clear();
  }
}
