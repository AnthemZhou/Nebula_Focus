import type { Extension } from '@codemirror/state';
import { Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate } from '@codemirror/view';
import { TreeFragment, type ChangedRange, type Tree } from '@lezer/common';
import { parser } from '@lezer/markdown';
import { frontEnd } from './page-model';

export interface EmphasisRange { from: number; to: number }
export interface UnclosedEmphasis { markers: EmphasisRange[]; plain: EmphasisRange[] }

/** CommonMark source ranges, independent of the native stream highlighter's open-em state.
 * Deliberately limited to a single leading star in top-level prose. Lists, quotes,
 * headings, raw HTML, YAML and Obsidian-specific constructs retain native behavior.
 */
export function findUnclosedEmphasis(source: string): UnclosedEmphasis {
  return analyzeEmphasis(source, () => parser.parse(source));
}

function analyzeEmphasis(source: string, parse: () => Tree): UnclosedEmphasis {
  const result: UnclosedEmphasis = {markers: [], plain: []};
  if (!/(?:^|\n) {0,3}\*(?![\s*])/.test(source)) return result;
  const front = frontEnd(source);
  if (!front && /^(?:\uFEFF)?---[ \t]*\r?\n/.test(source)) return result;
  const tree = parse();
  for (let paragraph = tree.topNode.firstChild; paragraph; paragraph = paragraph.nextSibling) {
    if (paragraph.name !== 'Paragraph' || paragraph.from < front) continue;
    const text = source.slice(paragraph.from, paragraph.to);
    if (!/^\*[^\s*]/.test(text) || /\[\[|%%|\$/.test(text)) continue;
    // Looking across the complete paragraph preserves legitimate soft-linebreak
    // emphasis. Stars inside InlineCode are never mistaken for a closing mark.
    const cursor = paragraph.cursor(), protectedRanges: EmphasisRange[] = [];
    let paired = false, opaque = false;
    do {
      if (cursor.name === 'Emphasis') {
        if (cursor.from === paragraph.from) paired = true;
        protectedRanges.push({from: cursor.from, to: cursor.to});
      } else if (cursor.name === 'InlineCode') protectedRanges.push({from: cursor.from, to: cursor.to});
      else if (cursor.name === 'HTMLTag' || cursor.name === 'Comment') opaque = true;
    } while (cursor.next() && cursor.from < paragraph.to);
    if (paired || opaque) continue;
    result.markers.push({from: paragraph.from, to: paragraph.from + 1});
    // Keep every independently valid emphasis/code span, including nested runs
    // and emphasized link labels. Only the spurious surrounding italic is reset.
    protectedRanges.sort((a,b) => a.from-b.from || b.to-a.to);
    let from = paragraph.from;
    for (const keep of protectedRanges) {
      if (keep.from > from) result.plain.push({from, to: keep.from});
      from = Math.max(from, keep.to);
    }
    if (from < paragraph.to) result.plain.push({from, to: paragraph.to});
  }
  return result;
}

/** Visual decorations only: no transaction changes the note or native settings. */
export function unclosedEmphasisExtension(enabled: (view: EditorView) => boolean): Extension {
  const plain = Decoration.mark({class:'nf-unclosed-emphasis'});
  const marker = Decoration.mark({class:'nf-literal-asterisk'});
  const plugin = ViewPlugin.fromClass(class {
    decorations: DecorationSet = Decoration.none;
    private active = false;
    private observer?: MutationObserver;
    private queued = false;
    private destroyed = false;
    private fragments: readonly TreeFragment[] = [];
    constructor(private view: EditorView) {
      this.rebuild();
      // Mode/pause classes can change after CodeMirror's own mode transaction.
      // Observe only that enablement change; token DOM churn never dispatches.
      const root = view.dom.closest('.workspace-leaf-content') || view.dom.parentElement;
      const Observer = view.dom.ownerDocument.defaultView?.MutationObserver;
      if (root && Observer) {
        this.observer = new Observer(() => {
          if (this.destroyed || this.queued || enabled(view) === this.active) return;
          this.queued = true;
          queueMicrotask(() => {
            this.queued = false;
            if (!this.destroyed && enabled(view) !== this.active) view.dispatch({});
          });
        });
        this.observer.observe(root, {attributes:true, attributeFilter:['class'], subtree:true});
      }
    }
    update(update: ViewUpdate): void {
      if (update.docChanged && this.fragments.length) {
        const changes: ChangedRange[] = [];
        update.changes.iterChangedRanges((fromA, toA, fromB, toB) => changes.push({fromA, toA, fromB, toB}));
        this.fragments = TreeFragment.applyChanges(this.fragments, changes);
      }
      if (update.docChanged || enabled(update.view) !== this.active) this.rebuild();
    }
    private rebuild(): void {
      this.active = enabled(this.view);
      if (!this.active) {this.decorations = Decoration.none; this.fragments = []; return;}
      const source = this.view.state.doc.toString();
      const ranges = analyzeEmphasis(source, () => {
        // Reuse unchanged Markdown blocks after each edit. Keeping fragments per
        // editor avoids reparsing a long manuscript on every keystroke, while
        // the parser still reevaluates boundaries changed by fences or blank lines.
        const tree = parser.parse(source, this.fragments);
        this.fragments = TreeFragment.addTree(tree);
        return tree;
      });
      this.decorations = Decoration.set([
        ...ranges.plain.map(range => plain.range(range.from,range.to)),
        ...ranges.markers.map(range => marker.range(range.from,range.to)),
      ], true);
    }
    destroy(): void {this.destroyed = true; this.observer?.disconnect();}
  }, {decorations:value => value.decorations});
  const theme = EditorView.baseTheme({
    '.nf-unclosed-emphasis, .nf-unclosed-emphasis .cm-em': {fontStyle:'normal'},
    '.nf-literal-asterisk': {fontStyle:'normal', color:'var(--text-normal)'},
    // CodeMirror can merge same-range classes or nest mark spans. Cover both
    // arrangements, including a native formatting span around our marker.
    '.cm-formatting-em:has(.nf-literal-asterisk), .cm-formatting-em.nf-literal-asterisk, .nf-literal-asterisk .cm-formatting-em': {
      display:'inline !important', fontSize:'inherit !important', letterSpacing:'normal !important', color:'var(--text-normal)',
    },
  });
  return [plugin, theme];
}
