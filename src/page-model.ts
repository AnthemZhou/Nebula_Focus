/** Portable page metadata; content is ordinary Markdown, sections start at ##. */
export interface Section { start: number; end: number; text: string; title: string }
export const META_KEYS = ['nf-cover','nf-cover-y','nf-title','nf-icon','nf-columns','nf-ratio'] as const;
export type MetaKey = typeof META_KEYS[number];
export function frontEnd(text: string): number {
  const opening = /^(?:\uFEFF)?---[ \t]*\r?\n/.exec(text);
  if (!opening) return 0;
  const closing = /^(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/m.exec(text.slice(opening[0].length));
  return closing ? opening[0].length + closing.index + closing[0].length : 0;
}
export function metadata(text: string): Record<string,string> {
  const end = frontEnd(text), result: Record<string,string> = {};
  if (!end) return result;
  for (const line of text.slice(0,end).split(/\r?\n/)) {
    const m = /^(?:["']?)(nf-[\w-]+)(?:["']?):[ \t]*(.*?)\s*$/.exec(line);
    if (!m) continue;
    const quoted = /^("(?:\\.|[^"\\])*")[ \t]*(?:#.*)?$/.exec(m[2]);
    const single = /^'((?:''|[^'])*)'[ \t]*(?:#.*)?$/.exec(m[2]);
    try {
      if (quoted) result[m[1]] = JSON.parse(quoted[1]);
      else if (single) result[m[1]] = single[1].replace(/''/g,"'");
      else if (!/^[\[\]{|>&*!"']/.test(m[2])) result[m[1]] = m[2].replace(/[ \t]+#.*$/,'').trim();
    } catch { /* Unsupported YAML is left untouched, not interpreted as layout. */ }
  }
  return result;
}
export function setMeta(text: string, key: MetaKey, value: string | number): string {
  if (!META_KEYS.includes(key)) throw Error('Unknown metadata');
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const end = frontEnd(text);
  if (!end && /^(?:\uFEFF)?---[ \t]*\r?\n/.test(text)) throw Error('Unclosed frontmatter');
  const field = `${key}: ${JSON.stringify(value)}`;
  if (!end) return `${text.startsWith('\uFEFF')?'\uFEFF':''}---${eol}${field}${eol}---${eol}${text.replace(/^\uFEFF/,'')}`;
  const lines = text.slice(0,end).match(/[^\n]*\n|[^\n]+$/g) || [];
  const keyPattern=new RegExp(`^(?:${key}|"${key}"|'${key}')[ \\t]*:`);
  const indexes = lines.map((line,i)=>keyPattern.test(line) ? i : -1).filter(i=>i>=0);
  if (indexes.length > 1) throw Error('Duplicate layout key');
  if (indexes.length) {
    const i = indexes[0];
    if (/^[ \t]*[|>[{*&!]/.test(lines[i].replace(keyPattern,''))) throw Error('Layout metadata must be a simple scalar');
    for(let n=i+1;n<lines.length && !/^\S/.test(lines[n]);n++) {
      if (/^\s+[^\s#]/.test(lines[n])) throw Error('Layout metadata must be a scalar');
    }
    lines[i] = field+(lines[i].endsWith('\r\n')?'\r\n':'\n');
  } else lines.splice(lines.length-1,0,field+eol);
  return lines.join('')+text.slice(end);
}
export const CARD_MARKER='<!-- nf:view=cards -->';
/** Structural lines only: never interpret code, comments or display math as UI. */
function bodyLines(text:string): {text:string; start:number; structural:boolean}[] {
  let start=0,fence='',fenceLength=0,comment='',math=false,raw='';
  return (text.match(/[^\n]*\n|[^\n]+$/g)||[]).map(line=>{
    let structural=!fence && !comment && !math && !raw;
    const marker=/^ {0,3}(`{3,}|~{3,})/.exec(line);
    if(fence) {
      if(marker && marker[1][0]===fence && marker[1].length>=fenceLength && /^\s*$/.test(line.slice(marker[0].length)))fence='';
    } else if(comment) { if(line.includes(comment))comment=''; }
    else if(raw) { if(line.toLowerCase().includes(`</${raw}>`))raw=''; }
    else if(math) { if(/^\s*\$\$\s*$/.test(line))math=false; }
    else if(marker) {fence=marker[1][0];fenceLength=marker[1].length;structural=false;}
    else if(/^\s*\$\$\s*$/.test(line)){math=true;structural=false;}
    else {
      const html=/^ {0,3}<(pre|script|style|textarea)(?:\s|>)/i.exec(line);
      if(html){structural=false;if(!line.toLowerCase().includes(`</${html[1].toLowerCase()}>`))raw=html[1].toLowerCase();}
      for(const [open,close]of [['<!--','-->'],['%%','%%']]) {
        const index=line.indexOf(open);
        if(index>=0){if(line.indexOf(close,index+open.length)<0)comment=close;if(line.trim()!==CARD_MARKER)structural=false;break;}
      }
    }
    const result={text:line,start,structural};start+=line.length;return result;
  });
}
export function cardContent(text:string): {enabled:boolean; ordinary:string; links:string[]; markerStart:number} {
  const lines=bodyLines(text),marker=lines.find(line=>line.structural && line.text.trim()===CARD_MARKER);
  const links:string[]=[];
  const ordinary=marker?lines.map(line=>{
    if(line===marker)return line.text.replace(/[^\r\n]/g,' ');
    const link=line.structural?/^[-*] \[\[([^\]\r\n]+)\]\][ \t]*(?:\r?\n)?$/.exec(line.text):null;
    if(link){links.push(link[1]);return line.text.replace(/[^\r\n]/g,' ');}
    return line.text;
  }).join(''):text;
  return {enabled:!!marker,ordinary,links,markerStart:marker?.start ?? -1};
}
export function sections(text: string): Section[] {
  const offset = frontEnd(text), body = text.slice(offset), starts: number[] = [];
  for (const line of bodyLines(body)) {
    if (line.structural && /^##[ \t]+\S/.test(line.text)) starts.push(offset+line.start);
  }
  if (!starts.length || starts[0] > offset) starts.unshift(offset);
  return starts.map((start,i)=>({start,end:starts[i+1] ?? text.length,text:text.slice(start,starts[i+1] ?? text.length),title:(/^##\s+(.+)/m.exec(text.slice(start,starts[i+1] ?? text.length))?.[1] || '正文').trim()})).filter(s=>s.text.trim());
}
export function replaceSection(text: string, index: number, value: string): string {
  const s=sections(text)[index]; if (!s) throw Error('Section missing');
  const eol=text.includes('\r\n')?'\r\n':'\n';
  let body=value.replace(/\r?\n/g,eol);
  if (s.end<text.length) body=body.replace(/(?:\r?\n)*$/,'')+eol+eol;
  return text.slice(0,s.start)+body+text.slice(s.end);
}
export function moveSection(text: string, from: number, to: number): string {
  const list=sections(text); if (!list[from] || !list[to]) throw Error('Section missing');
  if (from===to) return text;
  if (!/^##\s/.test(list[0].text) && (from===0 || to===0)) throw Error('标题前的说明保持在页面顶部；请移动二级标题分区。');
  const [moved]=list.splice(from,1); list.splice(to,0,moved);
  const eol=text.includes('\r\n')?'\r\n':'\n';
  return text.slice(0,frontEnd(text))+list.map(s=>s.text.replace(/(?:\r?\n)*$/,'')).join(eol+eol)+eol;
}
export function clamp(value: string | undefined, fallback: number, min: number, max: number): number {
  const n=Number(value); return value!==undefined && Number.isFinite(n) ? Math.min(max,Math.max(min,n)) : fallback;
}
