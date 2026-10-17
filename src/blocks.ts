import MarkdownIt from 'markdown-it';

const parser = new MarkdownIt({ html: true, breaks: false });
export type BlockKind = 'heading' | 'paragraph' | 'list-item' | 'quote';
export interface TextBlock {
  start: number; end: number; source: string; inline: string; text: string;
  kind: BlockKind; tag: string; prefixes: string[]; suffix: string; eol: string;
}
const plain = (text: string) => text.replace(/\[\[([^\]\n]+)\]\]/g, (_, link: string) => {
  const [path, label] = link.split('|'); return label || path;
});
export const textKey = (text: string): string => text.replace(/\s+/g, ' ').trim();

/** Source spans refer to the original bytes; only the edited leaf is replaced. */
export function textBlocks(source: string, offset = 0): TextBlock[] {
  const lines = source.match(/[^\n]*\n|[^\n]+$/g) || [], starts = [0];
  for (const line of lines) starts.push(starts[starts.length - 1] + line.length);
  const tokens = parser.parse(source, {}), parents: typeof tokens = [], result: TextBlock[] = [];
  for (const token of tokens) {
    if (token.nesting === -1) { parents.pop(); continue; }
    if (token.nesting === 1) { parents.push(token); continue; }
    const parent = parents[parents.length - 1];
    if (token.type !== 'inline' || !token.map || !parent || !['heading_open', 'paragraph_open'].includes(parent.type)) continue;
    // Complex renderer-owned constructs remain intact and use the native editor.
    if (token.children?.some(t => ['image', 'html_inline'].includes(t.type)) || /!\[\[|\[\^|%%|\$|\^[\w-]+\s*$/.test(token.content)) continue;
    const [first, last] = token.map;
    const start = starts[first], end = starts[last] - (lines[last - 1]?.match(/\r?\n$/)?.[0].length || 0);
    const raw = source.slice(start, end), rawLines = raw.split(/\r?\n/), content = token.content.split('\n');
    const heading = parent.type === 'heading_open';
    const list = parents.some(t => t.type === 'list_item_open');
    const quote = parents.some(t => t.type === 'blockquote_open');
    // Setext heading underline stays in the suffix, outside the editable text.
    const setext = heading && rawLines.length === content.length + 1 && /^ {0,3}(?:=+|-+)\s*$/.test(rawLines[rawLines.length - 1]);
    if (rawLines.length !== content.length && !setext) continue;
    const prefixes: string[] = []; let suffix = '', safe = true;
    for (let i = 0; i < content.length; i++) {
      const at = content[i] ? rawLines[i].indexOf(content[i]) : (heading ? (rawLines[i].match(/^ {0,3}#{1,6}\s*/)?.[0].length ?? 0) : 0);
      if (at < 0) { safe = false; break; }
      const before = rawLines[i].slice(0, at), after = rawLines[i].slice(at + content[i].length);
      if (!/^[\s>#*+\-\d.)]*$/.test(before) || (i < content.length - 1 && after.trim())) { safe = false; break; }
      prefixes.push(before);
      if (i === content.length - 1) suffix = after;
    }
    if (!safe) continue;
    const eol = source.includes('\r\n') ? '\r\n' : '\n';
    if (setext) suffix += eol + rawLines[rawLines.length - 1];
    let inline = token.content;
    if (list && /^\[[ xX]\] /.test(inline)) { prefixes[0] += inline.slice(0, 4); inline = inline.slice(4); }
    const display = (parser.parseInline(inline, {})[0]?.children || []).map(t => {
      if (['text', 'code_inline'].includes(t.type)) return t.content;
      if (['softbreak', 'hardbreak'].includes(t.type)) return '\n';
      return '';
    }).join('');
    result.push({ start: offset + start, end: offset + end, source: raw, inline, text: plain(display),
      kind: heading ? 'heading' : list ? 'list-item' : quote ? 'quote' : 'paragraph',
      tag: heading ? parent.tag : 'p', prefixes, suffix, eol });
  }
  return result;
}

export function blockMarkdown(block: TextBlock, value: string): string {
  const lines = value.replace(/\r\n/g, '\n').split('\n');
  const continuation = block.prefixes[1] ?? (block.kind === 'list-item'
    ? block.prefixes[0].replace(/(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, m => ' '.repeat(m.length))
    : block.kind === 'quote' ? block.prefixes[0] : '');
  return lines.map((line, i) => (block.prefixes[i] ?? continuation) + line).join(block.eol) + block.suffix;
}
export function replaceBlock(source: string, block: TextBlock, value: string): string {
  if (source.slice(block.start, block.end) !== block.source) throw Error('文字块已变化，草稿已保留。');
  return source.slice(0, block.start) + blockMarkdown(block, value) + source.slice(block.end);
}

const inlineTags = new Set(['STRONG', 'B', 'EM', 'I', 'DEL', 'S', 'STRIKE', 'CODE', 'A', 'BR', 'SPAN', 'MARK']);
export function safeInline(element: HTMLElement): boolean {
  return [...element.querySelectorAll('*')].every(el => inlineTags.has(el.tagName) && !el.matches('.internal-embed,.math,.footnote-link,[contenteditable=false]'));
}
function escapeText(text: string): string { return text.replace(/\\/g, '\\\\').replace(/([*_[\]<>`~#+.!|=\-])/g, '\\$1'); }
/** Serialize inline formatting only. Never convert the rest of the note through HTML. */
export function inlineMarkdown(element: HTMLElement): string {
  const walk = (node: Node): string => {
    if (node.nodeType === 3) return escapeText(node.textContent || '').replace(/\u00a0/g, ' ');
    if (node.nodeType !== 1) return '';
    const el = node as HTMLElement, content = [...el.childNodes].map(walk).join('');
    switch (el.tagName) {
      case 'BR': return '  \n';
      case 'STRONG': case 'B': return content ? `**${content}**` : '';
      case 'EM': case 'I': return content ? `*${content}*` : '';
      case 'S': case 'DEL': case 'STRIKE': return content ? `~~${content}~~` : '';
      case 'MARK': return content ? `==${content}==` : '';
      case 'CODE': {
        const raw = el.textContent || '', fence = '`'.repeat(Math.max(0, ...(raw.match(/`+/g) || []).map(s => s.length)) + 1);
        const pad = /^`|`$|^ .* $/.test(raw) ? ' ' : ''; return fence + pad + raw + pad + fence;
      }
      case 'A': {
        if (el.classList.contains('internal-link')) {
          const path = el.getAttribute('data-href') || el.getAttribute('href') || '';
          const label = el.textContent || '';
          if (/[\]\n|]/.test(path) || /[\]\n]/.test(label)) throw Error('链接中含有不支持的字符，请在原生编辑器中修改。');
          return label === path ? `[[${path}]]` : `[[${path}|${label}]]`;
        }
        const href = el.getAttribute('href') || '';
        const title = el.getAttribute('title');
        return `[${content}](<${href.replace(/</g, '%3C').replace(/>/g, '%3E')}>${title ? ' "' + title.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"' : ''})`;
      }
      case 'DIV': case 'P': return content + '\n';
      default: return content;
    }
  };
  return [...element.childNodes].map(walk).join('').replace(/\n$/, '');
}
