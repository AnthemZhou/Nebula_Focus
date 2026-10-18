/** Logical offsets count text and explicit line breaks, independent of inline markup. */
export interface SelectionOffsets { start: number; end: number }
export function textLength(node: Node): number {
  if(node.nodeType===3)return (node.textContent || '').length;
  if(node.nodeType===1 && (node as Element).tagName==='BR')return 1;
  return Array.from(node.childNodes).reduce((length,child)=>length+textLength(child),0);
}
export function selectionOffsets(input: HTMLElement): SelectionOffsets {
  const selection=input.ownerDocument.defaultView?.getSelection();
  if(!selection?.rangeCount)return {start:textLength(input),end:textLength(input)};
  const range=selection.getRangeAt(0);
  if(!input.contains(range.startContainer) || !input.contains(range.endContainer))return {start:textLength(input),end:textLength(input)};
  const prefix=range.cloneRange();prefix.selectNodeContents(input);prefix.setEnd(range.startContainer,range.startOffset);
  const start=textLength(prefix.cloneContents());prefix.setEnd(range.endContainer,range.endOffset);
  return {start,end:textLength(prefix.cloneContents())};
}
export function placeSelection(input:HTMLElement,start:number,end=start):void {
  const doc=input.ownerDocument,selection=doc.defaultView?.getSelection();if(!selection)return;
  const point=(offset:number):[Node,number]=>{
    let remaining=Math.max(0,offset),found:[Node,number]|undefined;
    const visit=(node:Node):void=>{
      if(found)return;
      if(node.nodeType===3){const length=node.textContent?.length || 0;if(remaining<=length)found=[node,remaining];else remaining-=length;return;}
      if(node.nodeType===1 && (node as Element).tagName==='BR'){
        if(remaining===0)found=[node.parentNode!,Array.from(node.parentNode!.childNodes).indexOf(node as ChildNode)];else remaining--;return;
      }
      for(const child of Array.from(node.childNodes))visit(child);
    };visit(input);return found || [input,input.childNodes.length];
  };
  const range=doc.createRange(),a=point(start),b=point(Math.max(start,end));range.setStart(...a);range.setEnd(...b);
  selection.removeAllRanges();selection.addRange(range);
}
