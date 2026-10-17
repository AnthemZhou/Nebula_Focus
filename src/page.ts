import { App, Component, MarkdownRenderer, MarkdownView, Menu, Modal, Notice, TFile, normalizePath, setIcon } from 'obsidian';
import { CARD_MARKER, cardContent, clamp, frontEnd, metadata, MetaKey, moveSection, replaceSection, sections, setMeta } from './page-model';
import { COVERS } from './covers';
import { TextBlock, textBlocks, textKey, safeInline, inlineMarkdown, blockMarkdown, replaceBlock } from './blocks';

interface EditSession {
  file: TFile; base: string; kind: 'block'|'title'; block?: TextBlock;
  input: HTMLElement; initialHTML: string; key: string; status: HTMLElement;
  controls: HTMLElement; composing: boolean; cleanup: () => void;
}

/** A view over ordinary Markdown. Every content write checks the exact disk revision. */
export class FocusPage {
  readonly element: HTMLElement;
  private file: TFile | null = null;
  private source = '';
  private component = new Component();
  private modals = new Set<Modal>();
  private disposed = false;
  private serial = 0;
  private renderSerial = 0;
  private session?: EditSession;
  private busy = false;
  private pendingSave?: Promise<boolean>;
  private get editing(): boolean { return !!this.session; }
  private cleanupDrag?: () => void;
  private blocks = new WeakMap<HTMLElement, TextBlock>();
  private wiredBlocks = new WeakSet<HTMLElement>();
  constructor(private app: App, private view: MarkdownView) {
    this.element=view.containerEl.createDiv('nf-page');
    this.component.load();
  }
  async update(force = false): Promise<void> {
    const file=this.view.file;
    if (!file || this.disposed) return;
    if (file!==this.file) {
      this.suspend();
      ++this.renderSerial;this.cleanupDrag?.();this.element.empty();
      this.view.containerEl.classList.remove('nf-page-mounted');
      this.file=file; this.source='';this.element.scrollTop=0;
    }
    const serial=++this.serial;
    const data=await this.app.vault.read(file);
    if (this.disposed || serial!==this.serial || this.file!==file) return;
    if (this.session) {
      if (data!==this.session.base) this.session.status.textContent='文件已在其他位置更新。草稿已保留，取消后可重新打开并合并。';
      return;
    }
    if (this.busy) return;
    if (!force && data===this.source && this.element.childElementCount) return;
    this.source=data;
    try { await this.render(); }
    catch(error) {
      if(serial===this.serial){this.element.empty();this.view.containerEl.classList.remove('nf-page-mounted');}
      throw error;
    }
  }
  private modal(): Modal {
    const modal=new Modal(this.app),close=modal.onClose.bind(modal);
    modal.modalEl.classList.add('nf-dialog');
    modal.onClose=()=>{this.modals.delete(modal);close();};this.modals.add(modal);return modal;
  }
  private button(parent: HTMLElement, label: string, action: (event: MouseEvent)=>void): HTMLButtonElement {
    const b=parent.createEl('button',{text:label,cls:'nf-page-action',attr:{type:'button','aria-label':label}});
    b.addEventListener('click',action);return b;
  }
  private async write(expected: string, next: string): Promise<void> {
    if (!this.file || this.disposed) throw Error('页面已关闭。');
    const file=this.file;
    await this.app.vault.process(file,current=>{
      if (current!==expected) throw Error('文件已变化，未覆盖。请复制草稿，重新打开后合并。');
      return next;
    });
    if (this.file===file) this.source=next;
  }
  private error(error: unknown): void { new Notice(error instanceof Error ? error.message : '操作失败，原文未被覆盖。'); }
  private async change(transform: (text:string)=>string, origin=this.file): Promise<boolean> {
    if (this.disposed || !origin || this.file!==origin) {this.error(Error('页面已切换，请重新操作。'));return false;}
    if (this.editing || this.busy) { new Notice('请先完成当前文字输入。');return false; }
    this.busy=true;
    let saved=false;
    try {const next=transform(this.source);if(next!==this.source)await this.write(this.source,next);saved=true;}
    catch(error) { this.error(error); }
    finally {this.busy=false;await this.update(true).catch(e=>this.error(e));}
    return saved;
  }
  async meta(key: MetaKey,value: string|number, origin=this.file): Promise<boolean> {return this.change(text=>setMeta(text,key,value),origin);}
  /** Keep a draft before a mode switch, navigation or unmount. */
  suspend(): void {
    this.stashDraft();
    if(this.session){this.session.cleanup();this.session.controls.remove();this.session=undefined;++this.renderSerial;this.element.empty();}
  }

  private imageFile(ref: string): TFile | null {
    const path=ref.replace(/^!?(?:\[\[)(.*?)\]\]$/,'$1').split('|')[0];
    const target=this.app.metadataCache.getFirstLinkpathDest(path,this.file?.path || '');
    return target instanceof TFile ? target : null;
  }
  private async render(): Promise<void> {
    if (this.disposed || !this.file) return;
    const renderSerial=++this.renderSerial,scrollTop=this.element.scrollTop;
    this.cleanupDrag?.(); this.component.unload();this.component=new Component();this.component.load();
    this.element.empty();
    const meta=metadata(this.source), cover=meta['nf-cover'];
    if (cover) {
      const panel=this.element.createDiv('nf-cover');
      const file=this.imageFile(cover);
      if (file) {
        const img=panel.createEl('img',{attr:{src:this.app.vault.getResourcePath(file),alt:'页面封面'}});
        img.style.objectPosition=`50% ${clamp(meta['nf-cover-y'],50,0,100)}%`;
      } else panel.createDiv({cls:'nf-cover-missing',text:'封面附件缺失，可重新选择'});
      this.button(panel,'更换封面',()=>this.coverDialog());
    }
    const heading=this.element.createDiv('nf-page-heading');
    if (meta['nf-icon']) {
      const icon=this.button(heading,meta['nf-icon'],()=>this.iconDialog());
      icon.classList.add('nf-page-icon');icon.setAttribute('aria-label','修改页面图标');icon.title='修改页面图标';
    }
    const titleWrap=heading.createDiv('nf-heading-title');
    const title=titleWrap.createEl('h1',{text:meta['nf-title'] || this.file.basename,attr:{tabindex:'0','aria-label':'修改页面标题'}});
    title.addEventListener('click',()=>this.titleEdit(title));
    title.addEventListener('keydown',e=>{if(e.key==='Enter' && !title.hasAttribute('contenteditable')){e.preventDefault();this.titleEdit(title);}});
    const grid=this.element.createDiv('nf-section-grid');
    grid.dataset.columns=meta['nf-columns']==='2'?'2':'1';
    const ratio=clamp(meta['nf-ratio'],50,25,75);
    grid.style.setProperty('--nf-ratio',`${ratio}fr`);grid.style.setProperty('--nf-other',`${100-ratio}fr`);
    const list=sections(this.source);
    for (const [index,section] of list.entries()) {
      const item=grid.createDiv({cls:'nf-section',attr:{tabindex:'0','data-index':String(index)}});
      if(index===0 && !/^##\s/.test(section.text))item.classList.add('nf-intro');
      const tools=item.createDiv('nf-section-tools');
      const handle=this.button(tools,'⠿',e=>this.sectionMenu(index,e));
      handle.setAttribute('aria-label',`移动或管理分区：${section.title}`);
      handle.classList.add('nf-drag-handle');
      this.drag(handle,item,index);
      const body=item.createDiv('nf-section-body');
      await this.renderSection(section.text,body,section.start);
      if (this.disposed || renderSerial!==this.renderSerial) return;
      item.addEventListener('contextmenu',event=>{if(this.editing)return;event.preventDefault();item.focus();this.sectionMenu(index,event);});
      body.addEventListener('click',event=>{
        const target=event.target as HTMLElement;
        if(target.closest('[contenteditable=true],.nf-card'))return;
        const link=target.closest('a');
        if(link) {
          if(link.classList.contains('internal-link')) {
            event.preventDefault(); void this.app.workspace.openLinkText(link.getAttribute('data-href') || link.getAttribute('href') || '',this.file!.path);
          }
          return;
        }
        if(target.closest('img')) { this.showImage(target.closest('img') as HTMLImageElement);return; }
        if(target.matches('input[type=checkbox]')) {
          event.preventDefault();
          const leaf=target.closest('li')?.querySelector<HTMLElement>('.nf-block'),block=leaf && this.blocks.get(leaf);
          if(block)void this.change(t=>t.slice(0,block.start)+block.source.replace(/\[([ xX])\]/,(_,v)=>v===' '?'[x]':'[ ]')+t.slice(block.end));
        }
      });
      item.addEventListener('keydown',event=>{
        if (event.target===item && event.key==='Enter') {event.preventDefault();const leaf=body.querySelector<HTMLElement>('.nf-block');if(leaf)void this.editBlock(leaf);}
        if(event.target===handle && event.altKey && ['ArrowUp','ArrowDown'].includes(event.key)) {
          event.preventDefault(); void this.change(text=>moveSection(text,index,index+(event.key==='ArrowUp'?-1:1)));
        }
      });
    }
    if(!list.length) {
      const body=grid.createDiv('nf-section-body');
      const empty=body.createEl('p',{cls:'nf-empty-block',attr:{'data-placeholder':'开始书写…'}});
      const prefix=this.source && !this.source.endsWith('\n')?'\n':'';
      this.wireBlock(empty,{start:this.source.length,end:this.source.length,source:'',inline:'',text:'',kind:'paragraph',tag:'p',prefixes:[prefix],suffix:'',eol:this.source.includes('\r\n')?'\r\n':'\n'});
    }
    const tail=this.element.createDiv('nf-page-tail');
    const add=this.button(tail,'添加分区',()=>void this.change(text=>text+(text.endsWith('\n')?'\n':'\n\n')+'## 新分区\n\n点击这里书写。\n'));
    const plus=add.createSpan({cls:'nf-icon',attr:{'aria-hidden':'true'}});setIcon(plus,'plus');add.prepend(plus);
    this.view.containerEl.classList.add('nf-page-mounted');
    const key=this.storageKey();
    if (this.readDraft(key)) this.button(tail,'恢复未保存草稿',()=>this.restoreDraft(key));
    this.element.scrollTop=scrollTop;
  }
  private async renderSection(text:string,body:HTMLElement,offset:number):Promise<void> {
    const {enabled:cards,ordinary,links}=cardContent(text);
    const file=this.file!,component=this.component;
    await MarkdownRenderer.render(this.app,ordinary,body,file.path,component);
    this.bindBlocks(body,ordinary,offset);
    if(!cards || this.disposed || component!==this.component || file!==this.file)return;
    const grid=body.createDiv('nf-cards');
    for(const link of links) {
      const [path,label]=link.split('|');
      const target=this.app.metadataCache.getFirstLinkpathDest(path,file.path);
      const card=this.button(grid,label || path,()=>void this.app.workspace.openLinkText(path,file.path));
      card.classList.add('nf-card');
      card.empty();
      const content=card.createSpan('nf-card-content');
      const caption=content.createSpan({cls:'nf-card-label',text:label || path});
      const footer=content.createSpan({cls:'nf-card-footer',attr:{'aria-hidden':'true'}});
      footer.createSpan({cls:'nf-card-location',text:target?.parent?.path.replace(/^\/$/, '') || '笔记'});
      const arrow=footer.createSpan('nf-icon');setIcon(arrow,'arrow-up-right');
      if(target instanceof TFile && target.extension==='md') {
        let data:Record<string,string>;
        try {data=metadata(await this.app.vault.read(target));}
        catch {card.title='无法读取目标笔记，仍可点击打开';continue;}
        if(this.disposed || this.file!==file || component!==this.component)return;
        caption.textContent=label || data['nf-title'] || target.basename;
        card.setAttribute('aria-label',caption.textContent);
        const cover=data['nf-cover'];
        if(cover) {
          const ref=cover.replace(/^!?\[\[(.*?)\]\]$/,'$1').split('|')[0];
          const image=this.app.metadataCache.getFirstLinkpathDest(ref,target.path);
          if(image instanceof TFile) {
            const img=document.createElement('img');img.src=this.app.vault.getResourcePath(image);img.alt='';img.style.objectPosition=`50% ${clamp(data['nf-cover-y'],50,0,100)}%`;card.prepend(img);
          }
        }
      }
    }
    if(!links.length)body.createEl('p',{cls:'nf-help',text:'添加项目链接即可显示卡片，例如：- [[项目名称]]。点击文字可单独修改标题或段落。'});
  }
  private bindBlocks(body:HTMLElement,source:string,offset:number):void {
    // A tight list has no <p>; wrap only its own inline nodes, never nested items.
    for(const li of body.querySelectorAll<HTMLElement>('li,li > p')) {
      if(li.tagName==='P' && !li.querySelector(':scope > input'))continue;
      if([...li.children].some(el=>el.matches('p,.nf-list-text')))continue;
      const nodes=[...li.childNodes].filter(n=>n.nodeType===3 || (n instanceof HTMLElement && !n.matches('ul,ol,input')));
      if(!nodes.some(n=>n.textContent?.trim()))continue;
      const span=document.createElement('span');span.className='nf-list-text';li.insertBefore(span,nodes[0]);span.append(...nodes);
    }
    const candidates=[...body.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6,p,.nf-list-text')]
      .filter(el=>!el.closest('.nf-cards,.internal-embed,.callout,.footnotes') && safeInline(el) && !el.querySelector('.nf-list-text'));
    const key=(kind:string,tag:string,text:string)=>kind+'|'+tag+'|'+textKey(text);
    const elements=new Map<string,HTMLElement[]>();
    for(const el of candidates) {
      const kind=/^H[1-6]$/.test(el.tagName)?'heading':el.closest('li')?'list-item':el.closest('blockquote')?'quote':'paragraph';
      const k=key(kind,kind==='heading'?el.tagName.toLowerCase():'p',el.textContent || '');
      elements.set(k,[...(elements.get(k)||[]),el]);
    }
    const groups=new Map<string,TextBlock[]>();
    for(const block of textBlocks(source,offset)) {
      const k=key(block.kind,block.tag,block.text);groups.set(k,[...(groups.get(k)||[]),block]);
    }
    for(const [k,blocks] of groups) {
      const matches=elements.get(k);
      // Ambiguous renderer output is left untouched instead of guessing source offsets.
      if(!matches || matches.length!==blocks.length)continue;
      blocks.forEach((block,i)=>this.wireBlock(matches[i],block));
    }
  }
  private wireBlock(el:HTMLElement,block:TextBlock):void {
    this.blocks.set(el,block);el.classList.add('nf-block');el.dataset.blockStart=String(block.start);el.tabIndex=0;
    if(this.wiredBlocks.has(el))return;this.wiredBlocks.add(el);
    el.addEventListener('click',event=>{
      if(this.session?.input===el || (event.target as HTMLElement).closest('a,img,input,button'))return;
      const selection=window.getSelection();if(selection && !selection.isCollapsed)return;
      void this.editBlock(el);
    });
    el.addEventListener('keydown',event=>{
      if(event.target===el && !el.hasAttribute('contenteditable') && event.key==='Enter') {event.preventDefault();void this.editBlock(el);}
    });
  }
  private rebindBlocks():void {
    const grid=this.element.querySelector<HTMLElement>('.nf-section-grid');if(!grid)return;
    let source=this.source;
    for(const section of sections(source).reverse())source=source.slice(0,section.start)+cardContent(section.text).ordinary+source.slice(section.end);
    const offset=frontEnd(source);this.bindBlocks(grid,source.slice(offset),offset);
  }
  private titleEdit(title:HTMLElement):void {void this.editBlock(title,true);}
  private async editBlock(input:HTMLElement,title=false):Promise<void> {
    if(this.pendingSave)await this.pendingSave;
    if(this.disposed || !this.file || this.busy || !input.isConnected || this.session?.input===input)return;
    if(this.session && !await this.saveEdit(this.session))return;
    const block=this.blocks.get(input);if(!title && !block)return;
    const controls=this.view.containerEl.createDiv({cls:'nf-edit-controls',attr:{'aria-label':'文字编辑操作'}});
    const status=controls.createSpan({cls:'nf-edit-status',attr:{role:'status','aria-live':'polite'}});
    const s:EditSession={file:this.file,base:this.source,kind:title?'title':'block',block,input,
      initialHTML:input.innerHTML,key:this.storageKey(),status,controls,composing:false,cleanup:()=>{}};
    this.session=s;
    input.classList.add('nf-block-editor');input.setAttribute('contenteditable','true');input.setAttribute('spellcheck','true');
    input.setAttribute('role','textbox');input.setAttribute('aria-multiline',title?'false':'true');input.setAttribute('aria-label',title?'页面标题':'编辑当前文字块');
    const action=(label:string,icon:string,callback:()=>void)=>{const b=this.button(controls,label,callback);b.empty();b.title=label;setIcon(b,icon);};
    action('完成','check',()=>void this.saveEdit(s));action('取消','undo-2',()=>this.cancelEdit(s));
    const onInput=()=>this.stashDraft();
    const onStart=()=>{s.composing=true;};
    const onEnd=()=>{s.composing=false;this.stashDraft();if(document.activeElement!==input)void this.saveEdit(s);};
    const onBlur=(event:FocusEvent)=>{
      if(s.composing)return;
      if(event.relatedTarget instanceof HTMLElement && controls.contains(event.relatedTarget))return;
      void this.saveEdit(s);
    };
    const onKey=(event:KeyboardEvent)=>{
      if(event.isComposing || s.composing)return;
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.cancelEdit(s);return;}
      if(event.key==='Enter' && (title || event.ctrlKey || event.metaKey)) {event.preventDefault();event.stopPropagation();void this.saveEdit(s);return;}
      if(event.key==='Enter' && (!event.shiftKey || s.block?.kind==='heading')){event.preventDefault();event.stopPropagation();void this.splitBlock(s);return;}
      if((event.ctrlKey || event.metaKey) && ['b','i'].includes(event.key.toLowerCase())) {
        event.preventDefault();event.stopPropagation();document.execCommand(event.key.toLowerCase()==='b'?'bold':'italic');this.stashDraft();
      }
    };
    const onBefore=(event:InputEvent)=>{
      if(event.isComposing || s.composing)return;
      if(event.inputType==='insertParagraph') {event.preventDefault();if(title)void this.saveEdit(s);else void this.splitBlock(s);}
      if(event.inputType==='insertLineBreak' && (title || s.block?.kind==='heading')){event.preventDefault();if(title)void this.saveEdit(s);else void this.splitBlock(s);}
    };
    const onPaste=(event:ClipboardEvent)=>{
      event.preventDefault();const text=event.clipboardData?.getData('text/plain') || '';
      // Native insertText retains the browser's undo stack and rejects pasted HTML.
      if(!title && /[\r\n]/.test(text)){void this.splitBlock(s,text.replace(/\r\n?/g,'\n').split(/\n+/));return;}
      document.execCommand('insertText',false,title?text.replace(/\r?\n/g,' '):text);this.stashDraft();
    };
    input.addEventListener('input',onInput);input.addEventListener('blur',onBlur);input.addEventListener('keydown',onKey);
    input.addEventListener('beforeinput',onBefore);input.addEventListener('paste',onPaste);
    input.addEventListener('compositionstart',onStart);input.addEventListener('compositionend',onEnd);
    s.cleanup=()=>{
      input.removeEventListener('input',onInput);input.removeEventListener('blur',onBlur);input.removeEventListener('keydown',onKey);
      input.removeEventListener('beforeinput',onBefore);input.removeEventListener('paste',onPaste);
      input.removeEventListener('compositionstart',onStart);input.removeEventListener('compositionend',onEnd);
      input.removeAttribute('contenteditable');input.removeAttribute('role');input.removeAttribute('aria-multiline');
      input.removeAttribute('aria-label');if(title)input.setAttribute('aria-label','修改页面标题');
      input.classList.remove('nf-block-editor');
    };
    input.focus({preventScroll:true});
    const selection=window.getSelection();
    if(selection && !input.contains(selection.anchorNode)) {const range=document.createRange();range.selectNodeContents(input);range.collapse(false);selection.removeAllRanges();selection.addRange(range);}
  }
  private storageKey(): string {return `nebula-focus-draft:${this.file?.path}`;}
  private readDraft(key:string): {base:string; index?:number; kind:string; value:string; start?:number; end?:number}|null {
    try {
      const value=this.app.loadLocalStorage(key);
      return value && typeof value.value==='string' && typeof value.base==='string' ? value : null;
    }catch{return null;}
  }
  private value(s:EditSession):string {return s.kind==='title'?(s.input.textContent || ''):inlineMarkdown(s.input);}
  private stashDraft():void {
    const s=this.session;if(!s || s.input.innerHTML===s.initialHTML)return;
    try {this.app.saveLocalStorage(s.key,{base:s.base,kind:s.kind,value:this.value(s),start:s.block?.start,end:s.block?.end});}
    catch {s.status.textContent='草稿缓存不可用，请保持页面打开并保存。';}
  }
  private clearSavedDraft(s:EditSession,value:string):void {
    const draft=this.readDraft(s.key);
    if(draft?.base===s.base && draft.kind===s.kind && draft.start===s.block?.start && draft.value===value) {
      try{this.app.saveLocalStorage(s.key,null);}catch{new Notice('内容已保存，旧草稿缓存未能清理。');}
    }
  }
  private restoreDraft(key:string):void {
    const draft=this.readDraft(key);if(!draft)return;
    const modal=this.modal();modal.titleEl.setText(draft.kind==='title'?'未保存的页面标题':'未保存草稿');
    const text=modal.contentEl.createEl('textarea',{cls:'nf-draft-text',attr:{'aria-label':'草稿内容'}});text.value=draft.value;text.readOnly=true;
    modal.contentEl.createEl('p',{text:'先复制需要的内容，关闭后粘贴到对应位置。不会自动覆盖当前文件。'});
    this.button(modal.contentEl,'删除这份缓存',()=>{
      try{this.app.saveLocalStorage(key,null);modal.close();if(!this.editing)void this.update(true).catch(e=>this.error(e));}
      catch{new Notice('无法删除草稿缓存。');}
    });modal.open();
  }
  private cancelEdit(s:EditSession):void {
    if(this.session!==s || this.busy)return;
    this.stashDraft();s.input.innerHTML=s.initialHTML;s.cleanup();s.controls.remove();this.session=undefined;
    void this.update(true).catch(e=>this.error(e));
  }
  private saveEdit(s:EditSession):Promise<boolean> {
    if(this.pendingSave)return this.pendingSave;
    const pending=this.commitEdit(s);this.pendingSave=pending;
    void pending.finally(()=>{if(this.pendingSave===pending)this.pendingSave=undefined;});
    return pending;
  }
  private async commitEdit(s:EditSession):Promise<boolean> {
    if(this.session!==s || this.file!==s.file || this.disposed || this.busy || s.composing)return false;
    if(s.input.innerHTML===s.initialHTML) {s.cleanup();s.controls.remove();this.session=undefined;return true;}
    let value:string;
    try {value=this.value(s);}catch(error){s.status.textContent=error instanceof Error?error.message:'保存失败';return false;}
    this.busy=true;this.stashDraft();s.input.setAttribute('contenteditable','false');
    let saved=false,rebuild=false;
    try {
      const next=s.kind==='title'?setMeta(s.base,'nf-title',value.trim()):replaceBlock(s.base,s.block!,value);
      await this.write(s.base,next);this.clearSavedDraft(s,value);saved=true;
      rebuild=s.block?.tag==='h2' && (!s.block.inline.trim() || !value.trim());
      if(this.session===s){
        if(s.kind==='title')s.input.textContent=value.trim() || s.file.basename;
        else {const source=blockMarkdown(s.block!,value);this.wireBlock(s.input,{...s.block!,source,end:s.block!.start+source.length,inline:value,text:s.input.textContent||''});}
        s.cleanup();s.controls.remove();this.session=undefined;this.rebindBlocks();
      }
    }catch(error){if(this.session===s){s.status.textContent=error instanceof Error?error.message:'保存失败';s.input.setAttribute('contenteditable','true');}else this.error(error);}
    finally{this.busy=false;if((this.file!==s.file || rebuild) && !this.disposed)await this.update(true).catch(e=>this.error(e));}
    return saved;
  }
  private async splitBlock(s:EditSession,pasted?:string[]):Promise<void> {
    if(this.session!==s || this.busy || s.composing || !s.block)return;
    const selection=window.getSelection();if(!selection?.rangeCount)return;
    const range=selection.getRangeAt(0);if(!s.input.contains(range.startContainer) || !s.input.contains(range.endContainer))return;
    const before=range.cloneRange(),after=range.cloneRange();before.selectNodeContents(s.input);before.setEnd(range.startContainer,range.startOffset);
    after.selectNodeContents(s.input);after.setStart(range.endContainer,range.endOffset);
    const left=document.createElement('span'),right=document.createElement('span');left.append(before.cloneContents());right.append(after.cloneContents());
    const pieces=pasted || ['', ''];left.append(document.createTextNode(pieces[0]));
    const parts=[left,...pieces.slice(1).map(text=>{const span=document.createElement('span');span.textContent=text;return span;})];
    const last=parts[parts.length-1],caretOffset=last.textContent?.length || 0;last.append(...right.childNodes);
    const block=s.block,eol=block.eol,isList=block.kind==='list-item' && /(?:[-+*]|\d+[.)])\s/.test(block.prefixes[0]);
    const prefix=block.kind==='list-item' || block.kind==='quote'?block.prefixes[0].replace(/\[[xX]\]/,'[ ]'):'';
    const separator=isList?eol:eol+eol;
    const sources=parts.map((part,i)=>i===0?blockMarkdown(block,inlineMarkdown(part)):prefix+inlineMarkdown(part));
    const replacement=sources.join(separator);
    this.busy=true;this.stashDraft();s.input.setAttribute('contenteditable','false');
    try {
      await this.write(s.base,s.base.slice(0,block.start)+replacement+s.base.slice(block.end));
      this.clearSavedDraft(s,this.value(s));
      if(this.session!==s || this.file!==s.file)return;
      s.input.replaceChildren(...left.childNodes);s.cleanup();s.controls.remove();this.session=undefined;
      this.wireBlock(s.input,{...block,source:sources[0],end:block.start+sources[0].length,inline:inlineMarkdown(s.input),text:s.input.textContent||''});
      let next=s.input,start=block.start+sources[0].length;
      for(let i=1;i<parts.length;i++) {
        const previous=next;
        if(isList){
          const old=previous.closest('li')!,li=document.createElement('li');
          const checkbox=old.querySelector<HTMLInputElement>(':scope > input');
          if(checkbox){const clone=checkbox.cloneNode() as HTMLInputElement;clone.checked=false;li.append(clone);li.className=old.className;li.classList.remove('is-checked');li.dataset.task=' ';}
          next=li.createSpan('nf-list-text');old.after(li);
          // Nested children follow the text after the caret in both DOM and source.
          for(const nested of Array.from(old.children).filter(el=>el.matches('ul,ol')))li.append(nested);
        } else {next=document.createElement('p');previous.after(next);}
        next.append(...parts[i].childNodes);next.classList.add('nf-empty-block');next.setAttribute('data-placeholder','继续书写…');
        start+=separator.length;
        this.wireBlock(next,{start,end:start+sources[i].length,source:sources[i],inline:inlineMarkdown(next),text:next.textContent||'',kind:block.kind==='heading'?'paragraph':block.kind,tag:'p',prefixes:[prefix],suffix:'',eol});
        start+=sources[i].length;
      }
      this.rebindBlocks();this.busy=false;await this.editBlock(next);
      const caret=document.createRange();caret.selectNodeContents(next);caret.collapse(true);
      // Plain pasted text is the first node; leave the caret before the old suffix.
      if(caretOffset && next.firstChild?.nodeType===3)caret.setStart(next.firstChild,Math.min(caretOffset,next.firstChild.textContent?.length||0));
      caret.collapse(true);selection.removeAllRanges();selection.addRange(caret);
    }catch(error){if(this.session===s){s.input.setAttribute('contenteditable','true');s.status.textContent=error instanceof Error?error.message:'保存失败';}else this.error(error);}
    finally{this.busy=false;if(this.file!==s.file && !this.disposed)await this.update(true).catch(e=>this.error(e));}
  }
  private sectionMenu(index:number,event:MouseEvent):void {
    const menu=new Menu(),count=sections(this.source).length;
    if(index>0 && (index>1 || /^##\s/.test(sections(this.source)[0].text)))menu.addItem(i=>i.setTitle('上移').onClick(()=>void this.change(t=>moveSection(t,index,index-1))));
    if(index<count-1 && (index>0 || /^##\s/.test(sections(this.source)[0].text)))menu.addItem(i=>i.setTitle('下移').onClick(()=>void this.change(t=>moveSection(t,index,index+1))));
    menu.addItem(i=>i.setTitle('切换卡片 / 普通图文').onClick(()=>void this.change(t=>{const block=sections(t)[index].text;const marker=CARD_MARKER,parsed=cardContent(block);return replaceSection(t,index,parsed.enabled?block.slice(0,parsed.markerStart)+block.slice(parsed.markerStart).replace(marker,''):block.replace(/^(##[^\n]*\n)?/,prefix=>prefix+'\n'+marker+'\n'));})));
    menu.addItem(i=>i.setTitle('在后面插入分区').onClick(()=>void this.change(t=>{
      const s=sections(t)[index];return t.slice(0,s.end)+'\n## 新分区\n\n点击这里书写。\n\n'+t.slice(s.end);
    })));
    menu.showAtMouseEvent(event);
  }
  private drag(handle:HTMLButtonElement,item:HTMLElement,index:number):void {
    let suppress=false;
    handle.addEventListener('click',event=>{if(suppress){event.preventDefault();event.stopImmediatePropagation();suppress=false;}},true);
    handle.addEventListener('pointerdown',event=>{
      if(event.button!==0 || this.editing || this.busy || item.classList.contains('nf-intro'))return;
      this.cleanupDrag?.();
      event.preventDefault();const y=event.clientY,x=event.clientX,pointer=event.pointerId;let target=index,active=false;
      const move=(e:PointerEvent)=>{
        if(e.pointerId!==pointer)return;
        if(Math.hypot(e.clientX-x,e.clientY-y)>7)active=true;if(!active)return;
        item.classList.add('nf-dragging');
        const hit=document.elementFromPoint(e.clientX,e.clientY)?.closest<HTMLElement>('.nf-section');
        if(hit && this.element.contains(hit))target=Number(hit.dataset.index);
        this.element.querySelectorAll('.nf-drop-target').forEach(el=>el.classList.remove('nf-drop-target'));
        if(hit && this.element.contains(hit))hit.classList.add('nf-drop-target');
        if(e.clientY<70)this.element.scrollTop-=18;else if(e.clientY>window.innerHeight-80)this.element.scrollTop+=18;
      };
      const cleanup=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',up);document.removeEventListener('pointercancel',cancel);item.classList.remove('nf-dragging');this.element.querySelectorAll('.nf-drop-target').forEach(el=>el.classList.remove('nf-drop-target'));this.cleanupDrag=undefined;};
      const up=(e:PointerEvent)=>{if(e.pointerId!==pointer)return;cleanup();if(active){suppress=true;if(index!==target)void this.change(t=>moveSection(t,index,target));}};
      const cancel=(e:PointerEvent)=>{if(e.pointerId===pointer)cleanup();};this.cleanupDrag=cleanup;
      document.addEventListener('pointermove',move);document.addEventListener('pointerup',up);document.addEventListener('pointercancel',cancel);
    });
  }
  private showImage(img:HTMLImageElement):void {const modal=this.modal();modal.modalEl.classList.add('nf-image-modal');modal.contentEl.createEl('img',{attr:{src:img.src,alt:img.alt}});modal.open();}
  private iconDialog():void {
    const origin=this.file,modal=this.modal();modal.titleEl.setText('页面图标');const input=modal.contentEl.createEl('input',{attr:{placeholder:'例如 📁','aria-label':'页面图标'}});input.value=metadata(this.source)['nf-icon'] || '';
    modal.modalEl.classList.add('nf-icon-dialog');
    this.button(modal.contentEl,'保存',()=>{void this.meta('nf-icon',Array.from(input.value).slice(0,8).join(''),origin).then(ok=>{if(ok)modal.close();});}).classList.add('nf-primary');modal.open();
  }
  pageMenu(event:MouseEvent):void {
    const menu=new Menu();
    menu.addItem(i=>i.setTitle('插入图片分区').onClick(()=>this.insertImage()));
    menu.addItem(i=>i.setTitle('封面与裁切').onClick(()=>this.coverDialog()));
    menu.addItem(i=>i.setTitle('页面图标').onClick(()=>this.iconDialog()));
    menu.addItem(i=>i.setTitle('单栏布局').onClick(()=>void this.meta('nf-columns',1)));
    for(const ratio of [35,50,65])menu.addItem(i=>i.setTitle(`双栏 ${ratio} / ${100-ratio}（宽屏）`).onClick(()=>void this.change(t=>setMeta(setMeta(t,'nf-columns',2),'nf-ratio',ratio))));
    menu.showAtMouseEvent(event);
  }
  private insertImage():void {
    if(this.editing){new Notice('请先完成当前输入。');return;}
    const file=this.file,modal=this.modal();modal.titleEl.setText('插入图片');
    const input=modal.contentEl.createEl('input',{type:'file',attr:{accept:'image/png,image/jpeg,image/webp,image/gif,image/avif','aria-label':'上传正文图片'}});
    input.addEventListener('change',()=>{const image=input.files?.[0];if(!image)return;
      if(image.size>20*1024*1024 || !/\.(png|jpe?g|webp|gif|avif)$/i.test(image.name)){new Notice('请选择 20 MB 以内的图片。');return;}
      void image.arrayBuffer().then(async data=>{
        if(this.file!==file || this.disposed)throw Error('页面已切换。');
        const asset=await this.asset(image.name.replace(/[^\p{L}\p{N}._-]/gu,'-'),data);
        if(this.file!==file || this.disposed)throw Error('页面已切换；图片已保留在附件目录。');
        if(await this.change(t=>t+'\n\n## 图片\n\n![['+asset.path+']]\n\n点击添加说明。\n',file))modal.close();
      }).catch(error=>this.error(error));
    });modal.open();
  }
  private async asset(name:string,data:string|ArrayBuffer):Promise<TFile> {
    const dir='Nebula Assets';if(!this.app.vault.getAbstractFileByPath(dir))await this.app.vault.createFolder(dir);
    const path=normalizePath(`${dir}/${Date.now()}-${Math.random().toString(36).slice(2,8)}-${name}`);
    return typeof data==='string'?await this.app.vault.create(path,data):await this.app.vault.createBinary(path,data);
  }
  private coverDialog():void {
    if(this.editing){new Notice('请先完成当前文字输入。');return;}
    const modal=this.modal();modal.titleEl.setText('页面封面');modal.modalEl.classList.add('nf-cover-dialog');
    const origin=this.file;
    const choose=async(name:string,data:string|ArrayBuffer)=>{
      try {
        if(this.disposed || this.file!==origin)throw Error('页面已切换，请重新选择封面。');
        const image=await this.asset(name,data);
        if(this.disposed || this.file!==origin)throw Error('页面已切换；图片已保留在附件目录。');
        if(await this.meta('nf-cover',`[[${image.path}]]`,origin))modal.close();
      }catch(error){this.error(error);}
    };
    const presets=modal.contentEl.createDiv('nf-cover-presets');
    for(const [name,svg]of Object.entries(COVERS)) {
      const b=this.button(presets,name,()=>void choose(`${name}.svg`,svg));
      b.createEl('img',{attr:{src:`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,alt:name}});
    }
    const label=modal.contentEl.createEl('label',{text:'上传图片（最大 20 MB）'});
    const upload=label.createEl('input',{type:'file',attr:{accept:'image/png,image/jpeg,image/webp,image/gif,image/avif','aria-label':'上传封面'}});
    upload.addEventListener('change',()=>{
      const file=upload.files?.[0];if(!file)return;
      if(file.size>20*1024*1024 || !/\.(png|jpe?g|webp|gif|avif)$/i.test(file.name)){new Notice('请选择 20 MB 以内的 PNG、JPEG、WebP、GIF 或 AVIF 图片。');return;}
      void file.arrayBuffer().then(data=>choose(file.name.replace(/[^\p{L}\p{N}._-]/gu,'-'),data)).catch(e=>this.error(e));
    });
    const cropLabel=modal.contentEl.createEl('label',{text:'垂直裁切位置'});
    const crop=cropLabel.createEl('input',{type:'range',attr:{min:'0',max:'100','aria-label':'封面裁切位置'}});crop.value=metadata(this.source)['nf-cover-y'] || '50';
    const actions=modal.contentEl.createDiv('nf-dialog-actions');
    this.button(actions,'移除封面',()=>{void this.meta('nf-cover','',origin).then(ok=>{if(ok)modal.close();});});
    this.button(actions,'保存裁切位置',()=>{void this.meta('nf-cover-y',Number(crop.value),origin).then(ok=>{if(ok)modal.close();});}).classList.add('nf-primary');
    modal.contentEl.createEl('p',{text:'图片会保存在笔记库的 Nebula Assets 中。备份时请同时保留附件。'});modal.open();
  }
  destroy():void {this.suspend();this.disposed=true;++this.serial;++this.renderSerial;this.cleanupDrag?.();this.component.unload();for(const modal of this.modals)modal.close();this.modals.clear();this.element.remove();this.view.containerEl.classList.remove('nf-page-mounted');}
}
