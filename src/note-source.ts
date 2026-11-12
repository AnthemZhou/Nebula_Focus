import {getFrontMatterInfo, parseYaml} from 'obsidian';

function escaped(text: string, index: number): boolean {
  let count = 0;
  while (index > 0 && text[--index] === '\\') count++;
  return count % 2 === 1;
}

/** Keep positions/newlines intact while removing matched inline code spans. */
function maskInlineCode(text: string): string {
  const parts: string[] = [];
  let from = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '`' || escaped(text, i)) continue;
    let end = i + 1;
    while (text[end] === '`') end++;
    const ticks = text.slice(i, end);
    let close = text.indexOf(ticks, end);
    while (close >= 0 && (text[close - 1] === '`' || text[close + ticks.length] === '`')) {
      close = text.indexOf(ticks, close + ticks.length);
    }
    if (close < 0) {i = end - 1; continue;}
    const after = close + ticks.length;
    parts.push(text.slice(from, i), text.slice(i, after).replace(/[^\r\n]/g, ' '));
    from = after; i = after - 1;
  }
  parts.push(text.slice(from));
  return parts.join('');
}

function outsideCode(body: string): {text: string; inlineBase: boolean} {
  const lines = body.split(/\r?\n/), masks = maskInlineCode(body).split(/\r?\n/);
  const visible: string[] = [];
  let fence: {char: string; length: number} | undefined;
  let comment = false, inlineBase = false;
  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index];
    // Blockquoted/callout Base fences are native embedded views too.
    const unquote = (line: string) => line.replace(/^(?: {0,3}>[ \t]?)+/, '');
    if (fence) {
      const closing = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(unquote(raw))?.[1];
      if (closing?.[0] === fence.char && closing.length >= fence.length) fence = undefined;
      continue;
    }
    let line = '', offset = 0;
    while (offset < raw.length) {
      if (comment) {
        const close = raw.indexOf('-->', offset);
        const next = close < 0 ? raw.length : close + 3;
        line += ' '.repeat(next - offset); offset = next;
        if (close >= 0) comment = false;
      } else {
        // A literal HTML-comment marker inside backticks is not a comment.
        const start = masks[index].indexOf('<!--', offset);
        if (start < 0) {line += raw.slice(offset); break;}
        line += raw.slice(offset, start); offset = start; comment = true;
      }
    }
    const block = unquote(line);
    const opening = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(block);
    if (opening && !(opening[1][0] === '`' && opening[2].includes('`'))) {
      fence = {char: opening[1][0], length: opening[1].length};
      if (opening[2].trim().split(/\s+/)[0].toLowerCase() === 'base') inlineBase = true;
      continue;
    }
    // Four-space/tab code samples are not real embeds.
    if (!/^(?: {4}|\t)/.test(block)) visible.push(line);
  }
  return {text: maskInlineCode(visible.join('\n')), inlineBase};
}

function unescapeTarget(target: string): string {
  return target.replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g, '$1');
}

/** Read a CommonMark inline destination, including balanced/escaped parentheses
 * and optional quoted or parenthesized titles, without evaluating any markup.
 */
function markdownTarget(text: string, start: number): {target: string; end: number} | null {
  let cursor = start;
  while (/\s/.test(text[cursor] ?? '') && cursor < text.length) cursor++;
  const begin = cursor;
  let target: string;
  if (text[cursor] === '<') {
    cursor++;
    const targetStart = cursor;
    while (cursor < text.length && (text[cursor] !== '>' || escaped(text, cursor))) {
      if (text[cursor] === '\n' || (text[cursor] === '<' && !escaped(text, cursor))) return null;
      cursor++;
    }
    if (text[cursor] !== '>') return null;
    target = text.slice(targetStart, cursor++);
  } else {
    let depth = 0;
    while (cursor < text.length) {
      const char = text[cursor];
      if (char === '\\' && cursor + 1 < text.length) {cursor += 2; continue;}
      if (/\s/.test(char)) break;
      if (char === '(') depth++;
      if (char === ')') {if (!depth) break; depth--;}
      cursor++;
    }
    if (depth) return null;
    target = text.slice(begin, cursor);
  }
  if (!target) return null;
  if (text[cursor] === ')') return {target: unescapeTarget(target), end: cursor + 1};
  if (!/\s/.test(text[cursor] ?? '')) return null;
  while (cursor < text.length && /\s/.test(text[cursor])) cursor++;
  if (text[cursor] === ')') return {target: unescapeTarget(target), end: cursor + 1};
  const opener = text[cursor];
  if (opener !== '"' && opener !== "'" && opener !== '(') return null;
  const closer = opener === '(' ? ')' : opener;
  cursor++;
  while (cursor < text.length && (text[cursor] !== closer || escaped(text, cursor))) cursor++;
  if (text[cursor] !== closer) return null;
  cursor++;
  while (cursor < text.length && /\s/.test(text[cursor])) cursor++;
  return text[cursor] === ')' ? {target: unescapeTarget(target), end: cursor + 1} : null;
}

/** Read facts from the same file snapshot, rather than combining a new mtime
 * with an older metadata-cache parse during file-open/synchronization. */
export function noteSource(content: string): {properties: Record<string, unknown>; bases: string[]; inlineBase: boolean} {
  const info = getFrontMatterInfo(content);
  const parsed: unknown = info.exists ? parseYaml(info.frontmatter) : {};
  if (parsed !== null && (typeof parsed !== 'object' || Array.isArray(parsed))) throw new Error('笔记属性需要是键值格式');
  const properties = (parsed ?? {}) as Record<string, unknown>;
  const {text, inlineBase} = outsideCode(content.slice(info.contentStart));
  const bases = new Set<string>();
  const add = (target: string, wiki: boolean) => {
    let link = (wiki ? target.split('|')[0] : target).split('#')[0].trim();
    if (!wiki) {try {link = decodeURIComponent(link);} catch {/* Keep literal malformed URI for resolution. */}}
    if (/\.base$/i.test(link) && !/^[a-z][a-z\d+.-]*:/i.test(link)) bases.add(link);
  };
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '!' || text[i + 1] !== '[' || escaped(text, i)) continue;
    if (text[i + 2] === '[') {
      const end = text.indexOf(']]', i + 3);
      if (end >= 0 && !text.slice(i + 3, end).includes('\n')) {add(text.slice(i + 3, end), true); i = end + 1;}
      continue;
    }
    let cursor = i + 2, brackets = 1;
    while (cursor < text.length && brackets) {
      if (text[cursor] === '\\' && cursor + 1 < text.length) {cursor += 2; continue;}
      if (text[cursor] === '[') brackets++;
      if (text[cursor] === ']') brackets--;
      cursor++;
    }
    if (brackets || text[cursor] !== '(') continue;
    const destination = markdownTarget(text, cursor + 1);
    if (destination) {add(destination.target, false); i = destination.end - 1;}
  }
  return {properties, bases: [...bases], inlineBase};
}
