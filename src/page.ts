import { App, Component, MarkdownRenderer, MarkdownView, Menu, Modal, Notice, TFile, normalizePath, setIcon } from 'obsidian';
import { CARD_MARKER, cardContent, clamp, frontEnd, metadata, MetaKey, moveSection, replaceSection, sections, setMeta } from './page-model';
import { COVERS } from './covers';
import { DraftStore, RecoveryDraft, createDraftId } from './drafts';
import { EditHistory, CaretAnchor } from './history';
import { selectionOffsets, placeSelection, textLength } from './caret';
import { TextBlock, textBlocks, textKey, safeInline, inlineMarkdown, blockMarkdown, replaceBlock, nextBlockPrefix, continuationPrefix } from './blocks';

type BlockStyle = 'paragraph'|'h1'|'h2'|'h3'|'bullet'|'ordered'|'task'|'quote';
interface LocalEdit { html:string; start:number; end:number }
interface PendingEdit { next:string; anchor:CaretAnchor; draftId:string; edited:string; beforeCaret:CaretAnchor; }
interface EditSession {
  file: TFile; base: string; kind: 'block'|'title'; block?: TextBlock;
  input: HTMLElement; initialHTML: string; key: string; status: HTMLElement;
  controls: HTMLElement; composing: boolean; cleanup: () => void;
  id:string; createdAt:number; local:LocalEdit[]; cursor:number; lastInput:string; lastInputAt:number;
  pending?:PendingEdit; menuOpen:boolean;
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
  private readonly history = new EditHistory();
  private readonly drafts: DraftStore;
  private deferredRefresh = false;
  private readonly historyKey = (event:KeyboardEvent):void => {
    if(!this.element.contains(event.target as Node) && !this.session?.controls.contains(event.target as Node))return;
    if(event.isComposing || this.session?.composing || !(event.metaKey || event.ctrlKey))return;
    const key=event.key.toLowerCase();
    if(key==='z' || key==='y'){event.preventDefault();event.stopPropagation();void (key==='y' || event.shiftKey?this.redo():this.undo());}
  };
  private get editing(): boolean { return !!this.session; }
  private cleanupDrag?: () => void;
  private blocks = new WeakMap<HTMLElement, TextBlock>();
  private wiredBlocks = new WeakSet<HTMLElement>();
  constructor(private app: App, private view: MarkdownView) {
    this.element=view.containerEl.createDiv('nf-page');this.drafts=new DraftStore(app);
    view.containerEl.addEventListener('keydown',this.historyKey,true);
    this.component.load();
  }
  async update(force = false): Promise<void> {
    const file=this.view.file;
    if (!file || this.disposed) return;
    if (file!==this.file) {
      this.suspend();
      ++this.renderSerial;this.cleanupDrag?.();this.element.empty();
      this.view.containerEl.classList.remove('nf-page-mounted');
      this.file=file; this.source='';this.deferredRefresh=false;this.element.scrollTop=0;
    }
    const serial=++this.serial;
    const data=await this.app.vault.read(file);
    if (this.disposed || serial!==this.serial || this.file!==file) return;
    if (this.busy) return;
    if (this.session) {
      if (data!==this.session.base) {this.deferredRefresh=true;this.session.status.textContent='文件已在其他位置更新。草稿已保留，取消后可重新打开并合并。';}
      return;
    }
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
  private async write(expected: string, next: string, record=true, beforeCaret?:CaretAnchor, afterCaret?:CaretAnchor): Promise<void> {
    if (!this.file || this.disposed) throw Error('页面已关闭。');
    const file=this.file;
    await this.app.vault.process(file,current=>{
      if (current!==expected) throw Error('文件已变化，未覆盖。请复制草稿，重新打开后合并。');
      return next;
    });
    if (this.file===file) this.source=next;
    if(record)this.history.push(file.path,{before:expected,after:next,beforeCaret,afterCaret});
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
    this.refreshRecoveryAction();
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
  private snapshot(input:HTMLElement):LocalEdit {return {html:input.innerHTML,...selectionOffsets(input)};}
  private anchor(s=this.session):CaretAnchor|undefined {
    return s?{kind:s.kind,start:s.block?.start,offset:selectionOffsets(s.input).start}:undefined;
  }
  private recordLocal(s:EditSession,type=''):void {
    const next=this.snapshot(s.input),current=s.local[s.cursor];if(next.html===current.html)return;
    if(s.pending){s.pending=undefined;s.status.textContent='上次操作的完整草稿已保留，可在恢复草稿中查看。';}
    const now=Date.now(),group=/^(insertText|deleteContentBackward|deleteContentForward)$/.test(type) && s.lastInput===type && now-s.lastInputAt<700 && s.cursor>0 && s.cursor===s.local.length-1;
    s.local=s.local.slice(0,s.cursor+1);
    if(group)s.local[s.cursor]=next;else{s.local.push(next);s.cursor++;}
    if(s.local.length>80){s.local.shift();s.cursor--;}
    s.lastInput=type;s.lastInputAt=now;this.history.clearRedo(s.file.path);
  }
  private async editBlock(input:HTMLElement,title=false,internal=false):Promise<void> {
    if(this.pendingSave && !internal)await this.pendingSave;
    if(this.disposed || !this.file || this.busy || !input.isConnected || this.session?.input===input)return;
    if(this.session && !await this.saveEdit(this.session))return;
    if(!input.isConnected || this.disposed)return;
    const block=this.blocks.get(input);if(!title && !block)return;
    const controls=this.view.containerEl.createDiv({cls:'nf-edit-controls',attr:{'aria-label':'文字编辑操作'}});
    const status=controls.createSpan({cls:'nf-edit-status',attr:{role:'status','aria-live':'polite'}});
    const s:EditSession={file:this.file,base:this.source,kind:title?'title':'block',block,input,
      initialHTML:input.innerHTML,key:this.storageKey(),status,controls,composing:false,cleanup:()=>{},
      id:createDraftId(),createdAt:Date.now(),local:[this.snapshot(input)],cursor:0,lastInput:'',lastInputAt:0,menuOpen:false};
    this.session=s;
    input.classList.add('nf-block-editor');input.setAttribute('contenteditable','true');input.setAttribute('spellcheck','true');
    input.setAttribute('role','textbox');input.setAttribute('aria-multiline',title?'false':'true');input.setAttribute('aria-label',title?'页面标题':'编辑当前文字块');
    controls.addEventListener('pointerdown',event=>{if((event.target as Element).closest('button'))event.preventDefault();});
    const action=(label:string,icon:string,callback:(event:MouseEvent)=>void)=>{const b=this.button(controls,label,callback);b.empty();b.title=label;setIcon(b,icon);};
    if(!title){const label=block!.kind==='heading'?block!.tag.toUpperCase():block!.kind==='list-item'?'列表':block!.kind==='quote'?'引用':'正文';const style=this.button(controls,label,event=>this.formatMenu(s,event));style.classList.add('nf-text-style');style.setAttribute('aria-label','文字样式');style.title='文字样式与撤销';const chevron=style.createSpan('nf-icon');setIcon(chevron,'chevron-down');}
    action('完成','check',()=>void this.saveEdit(s));action('取消','undo-2',()=>this.cancelEdit(s));
    const onInput=(event:Event)=>{if(!s.composing)this.recordLocal(s,(event as InputEvent).inputType);this.stashDraft();};
    const onStart=()=>{s.local[s.cursor]=this.snapshot(input);s.composing=true;};
    const onEnd=()=>{s.composing=false;this.recordLocal(s,'composition');this.stashDraft();if(document.activeElement!==input && !s.menuOpen)void this.saveEdit(s);};
    const onBlur=(event:FocusEvent)=>{
      if(s.composing || s.menuOpen)return;
      if(event.relatedTarget instanceof HTMLElement && controls.contains(event.relatedTarget))return;
      void this.saveEdit(s);
    };
    const boundary=(direction:-1|1):boolean=>{const selection=selectionOffsets(input);return selection.start===selection.end && selection.start===(direction<0?0:textLength(input));};
    const onKey=(event:KeyboardEvent)=>{
      if(event.isComposing || s.composing)return;
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.cancelEdit(s);return;}
      if(event.key==='Enter' && (title || event.ctrlKey || event.metaKey)){event.preventDefault();event.stopPropagation();void this.saveEdit(s);return;}
      if(event.key==='Enter' && (!event.shiftKey || s.block?.kind==='heading')){event.preventDefault();event.stopPropagation();void this.splitBlock(s);return;}
      if(!title && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey){
        const direction=event.key==='Backspace' || event.key==='ArrowLeft' || event.key==='ArrowUp'?-1:1;
        if(['Backspace','Delete'].includes(event.key) && boundary(direction) && this.mergeCandidate(s,direction)){event.preventDefault();event.stopPropagation();void this.mergeBlock(s,direction);return;}
        if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key) && boundary(direction) && this.adjacent(input,direction)){event.preventDefault();event.stopPropagation();void this.moveCaret(s,direction);return;}
      }
      if((event.ctrlKey || event.metaKey) && ['b','i'].includes(event.key.toLowerCase())){event.preventDefault();event.stopPropagation();this.inlineFormat(s,event.key.toLowerCase()==='b'?'bold':'italic');}
    };
    const onBefore=(event:InputEvent)=>{
      if(event.isComposing || s.composing)return;
      if(event.inputType==='historyUndo' || event.inputType==='historyRedo'){event.preventDefault();void(event.inputType==='historyUndo'?this.undo():this.redo());return;}
      if(event.inputType==='insertParagraph'){event.preventDefault();if(title)void this.saveEdit(s);else void this.splitBlock(s);return;}
      if(event.inputType==='insertLineBreak' && (title || s.block?.kind==='heading')){event.preventDefault();if(title)void this.saveEdit(s);else void this.splitBlock(s);return;}
      if(!title && ['deleteContentBackward','deleteContentForward'].includes(event.inputType)){
        const direction=event.inputType==='deleteContentBackward'?-1:1;if(boundary(direction) && this.mergeCandidate(s,direction)){event.preventDefault();void this.mergeBlock(s,direction);return;}
      }
      s.local[s.cursor]={...s.local[s.cursor],...selectionOffsets(input)};
    };
    const onPaste=(event:ClipboardEvent)=>{
      event.preventDefault();const text=event.clipboardData?.getData('text/plain') || '';
      if(!title && /[\r\n]/.test(text)){void this.splitBlock(s,text.replace(/\r\n?/g,'\n').split(/\n+/));return;}
      document.execCommand('insertText',false,title?text.replace(/\r?\n/g,' '):text);this.recordLocal(s,'paste');this.stashDraft();
    };
    input.addEventListener('input',onInput);input.addEventListener('blur',onBlur);input.addEventListener('keydown',onKey);
    input.addEventListener('beforeinput',onBefore);input.addEventListener('paste',onPaste);
    input.addEventListener('compositionstart',onStart);input.addEventListener('compositionend',onEnd);
    s.cleanup=()=>{
      input.removeEventListener('input',onInput);input.removeEventListener('blur',onBlur);input.removeEventListener('keydown',onKey);
      input.removeEventListener('beforeinput',onBefore);input.removeEventListener('paste',onPaste);
      input.removeEventListener('compositionstart',onStart);input.removeEventListener('compositionend',onEnd);
      input.removeAttribute('contenteditable');input.removeAttribute('role');input.removeAttribute('aria-multiline');
      input.removeAttribute('aria-label');if(title)input.setAttribute('aria-label','修改页面标题');input.classList.remove('nf-block-editor');
    };
    input.focus({preventScroll:true});
    const selection=window.getSelection();if(selection && !input.contains(selection.anchorNode))placeSelection(input,textLength(input));
    s.local[0]=this.snapshot(input);
  }
  private inlineFormat(s:EditSession,command:'bold'|'italic'):void {
    if(this.session!==s || this.busy || s.composing)return;
    s.local[s.cursor]={...s.local[s.cursor],...selectionOffsets(s.input)};
    s.input.focus({preventScroll:true});document.execCommand(command);this.recordLocal(s,'format');this.stashDraft();
  }
  private formatMenu(s:EditSession,event:MouseEvent):void {
    if(this.session!==s || s.composing)return;
    const saved=selectionOffsets(s.input),menu=new Menu();s.menuOpen=true;
    const focus=()=>{if(this.session===s){s.input.focus({preventScroll:true});placeSelection(s.input,saved.start,saved.end);}};
    const choices:[BlockStyle,string][]=[['paragraph','正文'],['h1','一级标题'],['h2','二级标题'],['h3','三级标题'],['bullet','无序列表'],['ordered','有序列表'],['task','待办事项'],['quote','引用']];
    for(const [style,label]of choices)menu.addItem(item=>item.setTitle(label).onClick(()=>{focus();void this.formatBlock(style);}));
    menu.addSeparator();menu.addItem(item=>item.setTitle('粗体 · ⌘/Ctrl B').onClick(()=>{focus();this.inlineFormat(s,'bold');}));
    menu.addItem(item=>item.setTitle('斜体 · ⌘/Ctrl I').onClick(()=>{focus();this.inlineFormat(s,'italic');}));
    menu.addSeparator();menu.addItem(item=>item.setTitle('撤销 · ⌘/Ctrl Z').onClick(()=>void this.undo()));menu.addItem(item=>item.setTitle('重做 · ⌘/Ctrl Shift Z').onClick(()=>void this.redo()));
    menu.onHide(()=>{s.menuOpen=false;if(this.session===s && !this.busy)focus();});menu.showAtMouseEvent(event);
  }
  private storageKey(): string {return `nebula-focus-draft:${this.file?.path}`;}
  private readDrafts(key:string):RecoveryDraft[] {try{return this.drafts.list(key);}catch(error){this.error(error);return [];}}
  private refreshRecoveryAction():void {
    const tail=this.element.querySelector<HTMLElement>('.nf-page-tail');if(!tail)return;
    const key=this.storageKey(),existing=tail.querySelector('.nf-draft-recovery');
    if(this.readDrafts(key).length){if(!existing)this.button(tail,'恢复未保存草稿',()=>this.restoreDraft(key)).classList.add('nf-draft-recovery');}
    else existing?.remove();
  }
  private value(s:EditSession):string {return s.kind==='title'?(s.input.textContent || ''):inlineMarkdown(s.input);}
  private stashDraft():void {
    const s=this.session;if(!s || s.input.innerHTML===s.initialHTML)return;
    try{this.drafts.upsert(s.key,{id:s.id,createdAt:s.createdAt,updatedAt:Date.now(),base:s.base,kind:s.kind,value:this.value(s),start:s.block?.start,end:s.block?.end});}
    catch(error){s.status.textContent=error instanceof Error?error.message:'草稿缓存不可用，请保持页面打开并保存。';}
  }
  private clearSavedDraft(s:EditSession,value:string):void {
    try{this.drafts.remove(s.key,s.id,{base:s.base,kind:s.kind,value});}catch{new Notice('内容已保存，旧草稿缓存未能清理。');}
  }
  private restoreDraft(key:string):void {
    const drafts=this.readDrafts(key);if(!drafts.length)return;
    const modal=this.modal();modal.titleEl.setText('恢复未保存草稿');modal.modalEl.classList.add('nf-drafts-dialog');
    const list=modal.contentEl.createDiv('nf-draft-list');
    for(const draft of drafts){
      const row=list.createDiv('nf-draft-item');const time=draft.createdAt?new Date(draft.updatedAt || draft.createdAt).toLocaleString():'旧版草稿';
      row.createEl('p',{text:(draft.kind==='title'?'页面标题':draft.kind==='replacement'?'完整操作草稿':'文字块草稿')+' · '+time});
      const text=row.createEl('textarea',{cls:'nf-draft-text',attr:{'aria-label':'草稿内容'}});text.value=draft.value;text.readOnly=true;
      this.button(row,'删除这份缓存',()=>{try{this.drafts.remove(key,draft.id);row.remove();if(!list.childElementCount)modal.close();if(!this.editing)void this.update(true).catch(e=>this.error(e));}catch(error){this.error(error);}});
    }
    modal.contentEl.createEl('p',{text:'复制需要的内容后粘贴到对应位置。每份草稿独立保留，不会自动覆盖文件。'});modal.open();
  }
  private closeSession(s:EditSession):void {s.cleanup();s.controls.remove();if(this.session===s){this.session=undefined;this.refreshRecoveryAction();}}
  private cancelEdit(s:EditSession):void {
    if(this.session!==s || this.busy)return;this.stashDraft();s.input.innerHTML=s.initialHTML;this.closeSession(s);
    void this.update(true).catch(e=>this.error(e));
  }
  private saveEdit(s:EditSession):Promise<boolean> {
    if(this.pendingSave)return this.pendingSave;
    const pending=this.commitEdit(s);this.pendingSave=pending;void pending.finally(()=>{if(this.pendingSave===pending)this.pendingSave=undefined;});return pending;
  }
  private async commitEdit(s:EditSession):Promise<boolean> {
    if(this.session!==s || this.file!==s.file || this.disposed || this.busy || s.composing)return false;
    if(s.pending)return this.applyStructure(s,s.pending);
    if(s.input.innerHTML===s.initialHTML){this.closeSession(s);if(this.deferredRefresh){this.deferredRefresh=false;await this.update(true);}return true;}
    let value:string;try{value=this.value(s);}catch(error){s.status.textContent=String(error);return false;}
    this.busy=true;this.stashDraft();s.input.setAttribute('contenteditable','false');let saved=false,rebuild=false;
    try{
      const next=s.kind==='title'?setMeta(s.base,'nf-title',value.trim()):replaceBlock(s.base,s.block!,value);
      await this.write(s.base,next,true,{kind:s.kind,start:s.block?.start,offset:s.local[0].start},this.anchor(s));this.clearSavedDraft(s,value);saved=true;
      rebuild=s.block?.tag==='h2' && (!s.block.inline.trim() || !value.trim());
      if(this.session===s){
        if(s.kind==='title')s.input.textContent=value.trim() || s.file.basename;
        else{const source=blockMarkdown(s.block!,value);this.wireBlock(s.input,{...s.block!,source,end:s.block!.start+source.length,inline:value,text:s.input.textContent||''});}
        this.closeSession(s);this.rebindBlocks();this.deferredRefresh=false;
      }
    }catch(error){if(this.session===s){s.status.textContent=error instanceof Error?error.message:'保存失败';s.input.setAttribute('contenteditable','true');}else this.error(error);}
    finally{this.busy=false;if((this.file!==s.file || rebuild) && !this.disposed)await this.update(true).catch(e=>this.error(e));}
    return saved;
  }
  private editedSource(s:EditSession):string {return s.kind==='title'?setMeta(s.base,'nf-title',this.value(s).trim()):replaceBlock(s.base,s.block!,this.value(s));}
  private async structure(s:EditSession,next:string,anchor:CaretAnchor):Promise<boolean> {
    const pending:PendingEdit={next,anchor,draftId:createDraftId(),edited:this.editedSource(s),beforeCaret:this.anchor(s)!};
    return this.applyStructure(s,pending);
  }
  private async applyStructure(s:EditSession,pending:PendingEdit):Promise<boolean> {
    if(this.session!==s || this.busy || s.composing || this.file!==s.file)return false;
    s.pending=pending;
    // Persist the intended result before writing. Clipboard text is not yet in the live DOM.
    try{this.drafts.upsert(s.key,{id:pending.draftId,createdAt:Date.now(),base:s.base,kind:'replacement',value:pending.next,start:0,end:s.base.length});}
    catch(error){s.status.textContent=String(error);return false;}
    this.busy=true;this.stashDraft();s.input.setAttribute('contenteditable','false');let saved=false;
    try{
      await this.write(s.base,pending.next,false);
      const initial={kind:s.kind,start:s.block?.start,offset:s.local[0].start};
      if(pending.edited!==s.base)this.history.push(s.file.path,{before:s.base,after:pending.edited,beforeCaret:initial,afterCaret:pending.beforeCaret});
      this.history.push(s.file.path,{before:pending.edited,after:pending.next,beforeCaret:pending.beforeCaret,afterCaret:pending.anchor});
      this.clearSavedDraft(s,this.value(s));try{this.drafts.remove(s.key,pending.draftId);}catch{new Notice('内容已保存，旧草稿缓存未能清理。');}
      saved=true;
      if(this.session===s && this.file===s.file){
        this.closeSession(s);this.deferredRefresh=false;
        const generation=this.renderSerial+1;await this.render();
        if(this.file===s.file && this.renderSerial===generation && !this.session){this.busy=false;await this.resumeAt(pending.anchor);}
      }
    }catch(error){if(this.session===s){s.input.setAttribute('contenteditable','true');s.status.textContent=(error instanceof Error?error.message:'保存失败')+' 完整操作草稿已保留，点击完成可重试。';}else this.error(error);}
    finally{this.busy=false;if(this.file!==s.file && !this.disposed)await this.update(true).catch(e=>this.error(e));}
    return saved;
  }
  private async resumeAt(anchor:CaretAnchor):Promise<void> {
    if(this.disposed || !this.file)return;
    if(anchor.kind==='title'){const el=this.element.querySelector<HTMLElement>('.nf-page-heading h1');if(el){await this.editBlock(el,true,true);placeSelection(el,anchor.offset);}return;}
    const start=anchor.start ?? frontEnd(this.source),leaves=[...this.element.querySelectorAll<HTMLElement>('.nf-section-body .nf-block')];
    let el=leaves.find(node=>this.blocks.get(node)?.start===start);
    if(!el){
      if(start<0 || start>this.source.length || (start>0 && this.source[start-1]!=='\n'))return;
      // Blank Markdown paragraphs have no rendered node. Mount only the requested blank slot.
      const section=sections(this.source).findIndex(part=>start>=part.start && start<=part.end);
      const body=this.element.querySelector<HTMLElement>(`.nf-section[data-index="${Math.max(0,section)}"] .nf-section-body`) || this.element.querySelector<HTMLElement>('.nf-section-body');
      if(!body)return;
      const line=this.source.slice(start).split(/\r?\n/)[0];
      const listPrefix=/^[ \t>]*(?:[-+*]|\d+[.)])[ \t]+(?:\[[ xX]\][ \t]*)?$/.test(line);
      const quotePrefix=/^(?:[ \t]*>)+[ \t]*$/.test(line);
      if(line.trim() && !listPrefix && !quotePrefix)return;
      const prefix=listPrefix || quotePrefix?line:'';
      const emptyItem=listPrefix?[...body.querySelectorAll<HTMLElement>('li')].find(item=>!item.textContent?.trim() && !item.querySelector('ul,ol,.nf-block')):undefined;
      if(emptyItem){el=emptyItem.createSpan('nf-list-text');}
      else{
        el=document.createElement('p');const next=leaves.find(node=>(this.blocks.get(node)?.start ?? -1)>start && body.contains(node));
        const emptyQuote=quotePrefix?[...body.querySelectorAll<HTMLElement>('blockquote')].find(item=>!item.textContent?.trim() && !item.querySelector('.nf-block,img')):undefined;
        if(emptyQuote)emptyQuote.append(el);
        else{
          let slot:HTMLElement=el;
          if(quotePrefix){slot=document.createElement('blockquote');slot.append(el);}
          if(next){
            let top:HTMLElement=next;while(top.parentElement!==body && top.parentElement)top=top.parentElement;
            const previous=leaves.filter(node=>(this.blocks.get(node)?.start ?? Infinity)<start).pop();
            // Markdown renders a temporarily blank paragraph between two list
            // items as one list. Split its DOM until the paragraph gains text.
            const nextItem=next.closest('li');
            if(previous && top.contains(previous) && top.matches('ul,ol') && nextItem?.parentElement===top){
              const following=top.cloneNode(false) as HTMLElement;
              let child:ChildNode|null=nextItem;while(child){const sibling:ChildNode|null=child.nextSibling;following.append(child);child=sibling;}
              top.after(slot,following);
            }else body.insertBefore(slot,top);
          }else body.append(slot);
        }
      }
      el.classList.add('nf-empty-block');el.setAttribute('data-placeholder','继续书写…');
      this.wireBlock(el,{start,end:start+prefix.length,source:prefix,inline:'',text:'',kind:listPrefix?'list-item':quotePrefix?'quote':'paragraph',tag:'p',prefixes:[prefix],suffix:'',eol:this.source.includes('\r\n')?'\r\n':'\n'});
    }
    await this.editBlock(el,false,true);placeSelection(el,anchor.offset);
  }
  async undo():Promise<void>{await this.travelHistory(false);}
  async redo():Promise<void>{await this.travelHistory(true);}
  private async travelHistory(redo:boolean):Promise<void> {
    if(this.busy || this.disposed || !this.file || this.session?.composing)return;
    const s=this.session,file=this.file;
    if(s){
      this.recordLocal(s);
      const index=s.cursor+(redo?1:-1);
      if(index>=0 && index<s.local.length){s.cursor=index;const snapshot=s.local[index];s.input.innerHTML=snapshot.html;s.input.focus({preventScroll:true});placeSelection(s.input,snapshot.start,snapshot.end);s.lastInput='';this.stashDraft();return;}
      if(s.pending){s.status.textContent='上次操作尚未保存，请先完成或取消；完整草稿已经保留。';return;}
      if(s.input.innerHTML!==s.initialHTML && !await this.saveEdit(s))return;
    }
    if(this.file!==file || this.disposed)return;
    const transaction=redo?this.history.peekRedo(file.path):this.history.peekUndo(file.path);if(!transaction)return;
    const expected=redo?transaction.before:transaction.after,next=redo?transaction.after:transaction.before;
    const active=this.session;this.busy=true;active?.input.setAttribute('contenteditable','false');
    try{
      await this.write(expected,next,false);
      if(redo)this.history.markRedone(file.path);else this.history.markUndone(file.path);
      if(this.file===file){
        if(this.session)this.closeSession(this.session);
        const generation=this.renderSerial+1;await this.render();
        const anchor=redo?transaction.afterCaret:transaction.beforeCaret;
        if(anchor && this.file===file && this.renderSerial===generation && !this.session){this.busy=false;await this.resumeAt(anchor);}
      }
    }catch(error){if(this.session)this.session.status.textContent='文件已变化，未执行撤销或重做。请先处理当前草稿。';this.error(error);}
    finally{
      this.busy=false;if(active && this.session===active)active.input.setAttribute('contenteditable','true');
      if(this.file!==file && !this.disposed)await this.update(true).catch(error=>this.error(error));
    }
  }
  private adjacent(input:HTMLElement,direction:-1|1):HTMLElement|undefined {
    const leaves=[...this.element.querySelectorAll<HTMLElement>('.nf-section-body .nf-block')];return leaves[leaves.indexOf(input)+direction];
  }
  private async moveCaret(s:EditSession,direction:-1|1):Promise<void> {
    const target=this.adjacent(s.input,direction);if(!target)return;
    if(await this.saveEdit(s)){
      if(target.isConnected){await this.editBlock(target);placeSelection(target,direction<0?textLength(target):0);}
      else {
        const block=this.blocks.get(target);
        if(block && this.file===s.file)await this.resumeAt({kind:'block',start:block.start+(block.start>=s.block!.end?this.source.length-s.base.length:0),offset:direction<0?textLength(target):0});
      }
    }
  }
  private mergeCandidate(s:EditSession,direction:-1|1):HTMLElement|undefined {
    if(!s.block || s.block.kind==='heading')return;
    const other=this.adjacent(s.input,direction),block=other && this.blocks.get(other);if(!other || !block || block.kind!==s.block.kind)return;
    const a=direction<0?block:s.block,b=direction<0?s.block:block;
    if(this.source.slice(a.end,b.start).trim())return;
    if(s.block.kind==='list-item'){
      const li=s.input.closest('li'),next=other.closest('li');
      if(!li || !next || li===next || li.parentElement!==next.parentElement || li.querySelector('ul,ol') || next.querySelector('ul,ol'))return;
      if(li.querySelectorAll('.nf-block').length!==1 || next.querySelectorAll('.nf-block').length!==1)return;
    }else if(s.input.parentElement!==other.parentElement)return;
    return other;
  }
  private async mergeBlock(s:EditSession,direction:-1|1):Promise<void> {
    const other=this.mergeCandidate(s,direction);if(!other || !s.block)return;
    const first=direction<0?other:s.input,last=direction<0?s.input:other,a=this.blocks.get(first)!,b=this.blocks.get(last)!;
    const combined=document.createElement('span');combined.append(...Array.from(first.cloneNode(true).childNodes),...Array.from(last.cloneNode(true).childNodes));
    const next=s.base.slice(0,a.start)+blockMarkdown(a,inlineMarkdown(combined))+s.base.slice(b.end);
    await this.structure(s,next,{kind:'block',start:a.start,offset:textLength(first)});
  }
  private async splitBlock(s:EditSession,pasted?:string[]):Promise<void> {
    if(this.session!==s || this.busy || s.composing || !s.block)return;
    if(!pasted && !s.input.textContent?.trim() && ['list-item','quote'].includes(s.block.kind)){await this.formatBlock('paragraph');return;}
    const selection=window.getSelection();if(!selection?.rangeCount)return;
    const range=selection.getRangeAt(0);if(!s.input.contains(range.startContainer) || !s.input.contains(range.endContainer))return;
    const before=range.cloneRange(),after=range.cloneRange();before.selectNodeContents(s.input);before.setEnd(range.startContainer,range.startOffset);
    after.selectNodeContents(s.input);after.setStart(range.endContainer,range.endOffset);
    const left=document.createElement('span'),right=document.createElement('span');left.append(before.cloneContents());right.append(after.cloneContents());
    const pieces=pasted || ['', ''];left.append(document.createTextNode(pieces[0]));
    const parts=[left,...pieces.slice(1).map(text=>{const span=document.createElement('span');span.textContent=text;return span;})];
    const last=parts[parts.length-1],offset=textLength(last);last.append(...right.childNodes);
    const block=s.block,eol=block.eol,prefix=nextBlockPrefix(block),isList=block.kind==='list-item' && /(?:[-+*]|\d+[.)])\s/.test(prefix);
    const separator=isList?eol:eol+eol;
    const nextBlock={...block,kind:(isList?'list-item':block.kind==='quote'?'quote':'paragraph') as TextBlock['kind'],tag:'p',prefixes:[prefix],suffix:''};
    const sources=parts.map((part,i)=>blockMarkdown(i===0?block:nextBlock,inlineMarkdown(part)));
    const replacement=sources.join(separator),start=block.start+sources.slice(0,-1).reduce((length,part)=>length+part.length+separator.length,0);
    await this.structure(s,s.base.slice(0,block.start)+replacement+s.base.slice(block.end),{kind:'block',start,offset});
  }
  async formatBlock(style:BlockStyle):Promise<void> {
    const s=this.session;if(!s?.block || this.busy || s.composing)return;
    const block=s.block,li=s.input.closest('li');
    // Do not detach nested children or turn their source into accidental code blocks.
    if((li && (li.querySelector('ul,ol') || li.querySelectorAll('.nf-block').length>1)) || /^\s{2,}|^\s*>.*>/.test(block.prefixes[0])){s.status.textContent='此处包含嵌套内容，请在原生 Markdown 编辑器中调整结构。';return;}
    const prefix=style==='paragraph'?'':/^h[1-3]$/.test(style)?'#'.repeat(Number(style[1]))+' ':style==='bullet'?'- ':style==='ordered'?'1. ':style==='task'?'- [ ] ':'> ';
    const kind:TextBlock['kind']=style.startsWith('h')?'heading':['bullet','ordered','task'].includes(style)?'list-item':style==='quote'?'quote':'paragraph';
    const value=kind==='heading'?inlineMarkdown(s.input).replace(/\s*\n\s*/g,' '):inlineMarkdown(s.input);
    const converted:TextBlock={...block,kind,tag:kind==='heading'?style:'p',prefixes:[prefix],suffix:''};
    const gap=block.start>0 && s.base[block.start-1]!=='\n'?block.eol:'';
    let replacement=gap+blockMarkdown(converted,value),start=block.start+gap.length;
    if(style==='paragraph' && ['list-item','quote'].includes(block.kind)){
      // Add only missing blank-line separators; preserve existing whitespace.
      const before=s.base.slice(0,block.start),after=s.base.slice(block.end);
      if(before && !/\n[ \t]*\r?\n$/.test(before)){replacement=block.eol+replacement;start+=block.eol.length;}
      if(after && !/^\r?\n[ \t]*\r?\n/.test(after))replacement+=block.eol;
    }
    await this.structure(s,s.base.slice(0,block.start)+replacement+s.base.slice(block.end),{kind:'block',start,offset:selectionOffsets(s.input).start});
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
  destroy():void {this.view.containerEl.removeEventListener('keydown',this.historyKey,true);this.suspend();this.disposed=true;++this.serial;++this.renderSerial;this.cleanupDrag?.();this.component.unload();for(const modal of this.modals)modal.close();this.modals.clear();this.element.remove();this.view.containerEl.classList.remove('nf-page-mounted');}
}
