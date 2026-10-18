import MarkdownIt from 'markdown-it';

const parser = new MarkdownIt({ html: true, breaks: false });
export type BlockKind = 'heading' | 'paragraph' | 'list-item' | 'quote';
export interface TextBlock {
  start: number; end: number; source: string; inline: string; text: string;
  kind: BlockKind; tag: string; prefixes: string[]; suffix: string; eol: string;
}
// Obsidian wiki links are literal labels: Markdown inside a filename must not
// accidentally become emphasis, an entity or a reference link while mapping it.
parser.inline.ruler.before('link', 'nf_wikilink', (state, silent) => {
  if (state.src.slice(state.pos, state.pos + 2) !== '[[') return false;
  const end = state.src.indexOf(']]', state.pos + 2);
  if (end < 0) return false;
  const raw = state.src.slice(state.pos + 2, end);
  if (!raw || /[\[\]\r\n]/.test(raw)) return false;
  if (!silent) {
    const token = state.push('nf_wikilink', '', 0), divider = raw.indexOf('|');
    token.content = divider < 0 ? raw : raw.slice(divider + 1) || raw.slice(0, divider);
  }
  state.pos = end + 2; return true;
});
export const textKey = (text: string): string => text.replace(/\s+/g, ' ').trim();

function lineParts(raw: string, content: string, headingMarkup: string): {before: string; after: string}|undefined {
  // Searching only the first occurrence mistakes literal '#' text for its
  // heading marker. Require both a structural prefix and a valid suffix.
  for (let at = 0; at <= raw.length; at++) {
    if (raw.slice(at, at + content.length) !== content) continue;
    const before = raw.slice(0, at), after = raw.slice(at + content.length);
    if (headingMarkup.startsWith('#')) {
      const marker = before.match(/(#{1,6})([ \t]*)$/);
      if (!marker || marker[1] !== headingMarkup || (content && !marker[2])) continue;
      if (!content && !marker[2] && /[ \t]/.test(raw[at] || '')) continue;
      if (!/^[\s>*+\-\d.)]*$/.test(before.slice(0, marker.index))) continue;
      if (after && !/^(?:[ \t]+#+)?[ \t]*$/.test(after) && !(!content && /^#+[ \t]*$/.test(after))) continue;
    } else if (!/^[\s>*+\-\d.)]*$/.test(before) || after.trim()) continue;
    return {before, after};
  }
  return undefined;
}
function withoutHeading(prefix: string, block: Pick<TextBlock, 'kind'>): string {
  return block.kind === 'heading' ? prefix.replace(/#{1,6}[ \t]*$/, '') : prefix;
}
function continuePrefix(prefix: string): string {
  // A checkbox is inline content, not part of a list's indentation width.
  return prefix.replace(/\[[ xX]\][ \t]*$/, '').replace(/(?:[-+*]|\d+[.)])[ \t]+/g, marker => ' '.repeat(marker.length));
}
export function continuationPrefix(block: TextBlock): string {
  return continuePrefix(withoutHeading(block.prefixes[0] || '', block));
}
export function nextBlockPrefix(block: TextBlock): string {
  const prefix = withoutHeading(block.prefixes[0] || '', block);
  if (block.kind !== 'list-item') return continuationPrefix(block);
  const markers = [...prefix.matchAll(/(?:[-+*]|\d+[.)])[ \t]+/g)];
  const last = markers[markers.length - 1]?.index;
  return prefix.replace(/(?:[-+*]|\d+[.)])[ \t]+/g, (marker, at: number) => at === last ? marker : ' '.repeat(marker.length)).replace(/\[[xX]\]/, '[ ]');
}

function hasRendererOwnedSyntax(source: string): boolean {
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '\\') { i++; continue; }
    if (source[i] === '`') {
      const fence = source.slice(i).match(/^`+/)![0];
      let end = i + fence.length;
      while ((end = source.indexOf(fence, end)) >= 0) {
        if (source[end - 1] !== '`' && source[end + fence.length] !== '`') break;
        end += fence.length;
      }
      if (end >= 0) { i = end + fence.length - 1; continue; }
      i += fence.length - 1; continue;
    }
    if (source.slice(i, i + 3) === '![[') return true;
    if (source.slice(i, i + 2) === '[[') {
      const end = source.indexOf(']]', i + 2);
      if (end >= 0) { i = end + 1; continue; }
    }
    if (source.slice(i, i + 2) === '[^' || source.slice(i, i + 2) === '%%' || source[i] === '$') return true;
    if (source[i] === '^' && /^\^[\w-]+\s*$/.test(source.slice(i))) return true;
  }
  return false;
}

/** Source spans refer to the original bytes; only the edited leaf is replaced. */
export function textBlocks(source: string, offset = 0): TextBlock[] {
  const lines = source.match(/[^\n]*\n|[^\n]+$/g) || [], starts = [0];
  for (const line of lines) starts.push(starts[starts.length - 1] + line.length);
  const env = {}, tokens = parser.parse(source, env), parents: typeof tokens = [], result: TextBlock[] = [];
  for (const token of tokens) {
    if (token.nesting === -1) { parents.pop(); continue; }
    if (token.nesting === 1) { parents.push(token); continue; }
    const parent = parents[parents.length - 1];
    if (token.type !== 'inline' || !token.map || !parent || !['heading_open', 'paragraph_open'].includes(parent.type)) continue;
    // Complex renderer-owned constructs remain intact and use the native editor.
    if (token.children?.some(t => ['image', 'html_inline'].includes(t.type)) || hasRendererOwnedSyntax(token.content)) continue;
    const heading = parent.type === 'heading_open', setext = heading && ['=', '-'].includes(parent.markup);
    // inline.map excludes a setext underline. Include it so a split can never
    // move that underline onto the newly inserted paragraph.
    const [first, last] = setext && parent.map ? parent.map : token.map;
    const start = starts[first], end = starts[last] - (lines[last - 1]?.match(/\r?\n$/)?.[0].length || 0);
    const raw = source.slice(start, end), rawLines = raw.split(/\r?\n/), content = token.content.split('\n');
    const list = parents.some(t => t.type === 'list_item_open');
    const quote = parents.some(t => t.type === 'blockquote_open');
    if (rawLines.length !== content.length + (setext ? 1 : 0)) continue;
    const prefixes: string[] = []; let suffix = '', safe = true;
    for (let i = 0; i < content.length; i++) {
      const parts = lineParts(rawLines[i], content[i], heading && !setext ? parent.markup : '');
      if (!parts) { safe = false; break; }
      prefixes.push(parts.before);
      if (i === content.length - 1) suffix = parts.after;
    }
    if (!safe) continue;
    if (heading && !setext && !token.content) {
      if (!/[ \t]$/.test(prefixes[0])) prefixes[0] += ' ';
      if (suffix && !/^[ \t]/.test(suffix)) suffix = ' ' + suffix;
    }
    const eol = lines[first]?.match(/\r?\n$/)?.[0] || source.match(/\r?\n/)?.[0] || '\n';
    if (setext) suffix += eol + rawLines[rawLines.length - 1];
    let inline = token.content;
    if (list && /^\[[ xX]\] /.test(inline)) { prefixes[0] += inline.slice(0, 4); inline = inline.slice(4); }
    const display = (parser.parseInline(inline, env)[0]?.children || []).map(t => {
      if (['text', 'code_inline', 'nf_wikilink'].includes(t.type)) return t.content;
      if (['softbreak', 'hardbreak'].includes(t.type)) return '\n';
      return '';
    }).join('');
    const block: TextBlock = { start: offset + start, end: offset + end, source: raw, inline, text: display,
      kind: heading ? 'heading' : list ? 'list-item' : quote ? 'quote' : 'paragraph',
      tag: heading ? parent.tag : 'p', prefixes, suffix, eol };
    result.push(block);
  }
  return result;
}

export function blockMarkdown(block: TextBlock, value: string): string {
  // An empty setext title would turn its underline into a horizontal rule.
  if(block.kind==='heading' && !value.trim() && /\r?\n/.test(block.suffix))
    return continuationPrefix(block)+'#'.repeat(Number(block.tag.slice(1)))+' ';
  const lines = value.replace(/\r\n/g, '\n').split('\n');
  return lines.map((line, i) => (block.prefixes[i] ?? continuationPrefix(block)) + line).join(block.eol) + block.suffix;
}
export function replaceBlock(source: string, block: TextBlock, value: string): string {
  if (source.slice(block.start, block.end) !== block.source) throw Error('文字块已变化，草稿已保留。');
  return source.slice(0, block.start) + blockMarkdown(block, value) + source.slice(block.end);
}

const inlineTags = new Set(['STRONG', 'B', 'EM', 'I', 'DEL', 'S', 'STRIKE', 'CODE', 'A', 'BR', 'SPAN', 'MARK']);
export function safeInline(element: HTMLElement): boolean {
  return [...element.querySelectorAll('*')].every(el => inlineTags.has(el.tagName) && !el.matches('.internal-embed,.math,.footnote-link,[contenteditable=false]'));
}
function escapeText(text: string): string { return text.replace(/\\/g, '\\\\').replace(/([*_[\]<>`~#+.!|=\-&$%^])/g, '\\$1'); }
const marks: Record<string, string> = {STRONG:'strong', B:'strong', EM:'em', I:'em', DEL:'del', S:'del', STRIKE:'del', MARK:'mark'};
function normalizeMarks(parent: HTMLElement, active = new Set<string>()): void {
  for (const child of [...parent.children] as HTMLElement[]) {
    const mark = marks[child.tagName];
    normalizeMarks(child, new Set(mark ? [...active, mark] : active));
    if (mark && active.has(mark)) child.replaceWith(...child.childNodes);
  }
  for (const child of [...parent.children] as HTMLElement[]) {
    if (!child.parentNode || !marks[child.tagName]) continue;
    let next = child.nextSibling, merged = false;
    while (next?.nodeType === 1 && marks[(next as HTMLElement).tagName] === marks[child.tagName]) {
      const sibling = next as HTMLElement; child.append(...sibling.childNodes); next = sibling.nextSibling; sibling.remove(); merged = true;
    }
    if (merged) normalizeMarks(child, new Set([...active, marks[child.tagName]]));
  }
}
function wrap(content: string, delimiter: string): string {
  // Markdown emphasis cannot open or close against whitespace. Keep that space
  // visually identical outside the delimiters, including nested formatting.
  const leading = content.match(/^\s*/)?.[0] || '', trailing = content.match(/\s*$/)?.[0] || '';
  const inner = content.slice(leading.length, content.length - trailing.length);
  return inner ? leading + delimiter + inner + delimiter + trailing : content;
}
/** Serialize inline formatting only. Never convert the rest of the note through HTML. */
export function inlineMarkdown(element: HTMLElement): string {
  const copy = element.cloneNode(true) as HTMLElement; normalizeMarks(copy);
  const children = (parent: Node): string => [...parent.childNodes].map((child, i, siblings) => {
    // MarkdownRenderer adds a source newline after <br>. It is not a second
    // user-entered line break; keeping both would split the paragraph on save.
    if (child.nodeType === 3 && i && (siblings[i - 1] as HTMLElement).nodeName === 'BR') {
      return escapeText((child.textContent || '').replace(/^\r?\n/, ''));
    }
    return walk(child);
  }).join('');
  const walk = (node: Node): string => {
    if (node.nodeType === 3) return escapeText(node.textContent || '');
    if (node.nodeType !== 1) return '';
    const el = node as HTMLElement, content = children(el);
    switch (el.tagName) {
      case 'BR': return '  \n';
      case 'STRONG': case 'B': return wrap(content, '**');
      case 'EM': case 'I': return wrap(content, '*');
      case 'S': case 'DEL': case 'STRIKE': return wrap(content, '~~');
      case 'MARK': return wrap(content, '==');
      case 'CODE': {
        const raw = el.textContent || ''; if (!raw) return '';
        const fence = '`'.repeat(Math.max(0, ...(raw.match(/`+/g) || []).map(s => s.length)) + 1);
        const pad = /^`|`$/.test(raw) || (/^ .* $/.test(raw) && /[^ ]/.test(raw)) ? ' ' : '';
        return fence + pad + raw + pad + fence;
      }
      case 'A': {
        if (el.classList.contains('internal-link')) {
          const path = el.getAttribute('data-href') || el.getAttribute('href') || '';
          const label = el.textContent || '';
          if (!path || /[\]\r\n|]/.test(path) || /[\]\r\n]/.test(label)) throw Error('链接中含有不支持的字符，请在原生编辑器中修改。');
          return label === path ? `[[${path}]]` : `[[${path}|${label}]]`;
        }
        const href = el.getAttribute('href') || '';
        const title = el.getAttribute('title');
        const destination = href.replace(/[<>\\\s]/g, char => encodeURIComponent(char)).replace(/&/g, '&amp;');
        const escapedTitle = title?.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/&/g, '&amp;');
        return `[${content}](<${destination}>${escapedTitle ? ' "' + escapedTitle + '"' : ''})`;
      }
      case 'DIV': case 'P': return content + '\n';
      default: return content;
    }
  };
  // A pasted indentation must not turn a text paragraph into an indented code
  // block on reload. One character reference keeps the exact visible spaces.
  return children(copy).replace(/\n$/, '').replace(/(^|\n)([ \t]+)(?=[^\r\n \t])/g, (_, line: string, spaces: string) =>
    line + (spaces[0] === '\t' ? '&#9;' : '&#32;') + spaces.slice(1));
}
