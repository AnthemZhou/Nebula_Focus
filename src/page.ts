import { App, Component, MarkdownRenderer, MarkdownView, Menu, Modal, Notice, TFile, normalizePath } from 'obsidian';
import { CARD_MARKER, cardContent, clamp, metadata, MetaKey, moveSection, replaceSection, sections, setMeta } from './page-model';
import { COVERS } from './covers';

interface EditSession {
  file: TFile; base: string; index: number; kind: 'section'|'title';
  input: HTMLTextAreaElement|HTMLInputElement; initial: string; key: string; status: HTMLElement;
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
  private get editing(): boolean { return !!this.session; }
  private cleanupDrag?: () => void;
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
    if(this.session){this.session=undefined;++this.renderSerial;this.element.empty();}
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
    if (meta['nf-icon']) this.button(heading,meta['nf-icon'],()=>this.iconDialog()).classList.add('nf-page-icon');
    const title=heading.createEl('h1',{text:meta['nf-title'] || this.file.basename,attr:{tabindex:'0','aria-label':'修改页面标题'}});
    title.addEventListener('click',()=>this.titleEdit(title));
    title.addEventListener('keydown',e=>{if(e.key==='Enter')this.titleEdit(title);});
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
      await this.renderSection(section.text,body);
      if (this.disposed || renderSerial!==this.renderSerial) return;
      item.addEventListener('contextmenu',event=>{if(this.editing)return;event.preventDefault();item.focus();this.sectionMenu(index,event);});
      body.addEventListener('click',event=>{
        const target=event.target as HTMLElement;
        const link=target.closest('a');
        if(link) {
          if(link.classList.contains('internal-link')) {
            event.preventDefault(); void this.app.workspace.openLinkText(link.getAttribute('data-href') || link.getAttribute('href') || '',this.file!.path);
          }
          return;
        }
        if(target.closest('img')) { this.showImage(target.closest('img') as HTMLImageElement);return; }
        if(target.closest('input[type=checkbox]')){event.preventDefault();this.editSection(index,item,body);return;}
        if(target.closest('button,input,textarea,select,iframe,video,audio,.internal-embed'))return;
        const selection=window.getSelection(); if(selection && !selection.isCollapsed)return;
        this.editSection(index,item,body);
      });
      item.addEventListener('keydown',event=>{
        if (event.target===item && event.key==='Enter') this.editSection(index,item,body);
        if(event.target===handle && event.altKey && ['ArrowUp','ArrowDown'].includes(event.key)) {
          event.preventDefault(); void this.change(text=>moveSection(text,index,index+(event.key==='ArrowUp'?-1:1)));
        }
      });
    }
    if(!list.length) this.button(grid,'点击开始书写',()=>this.editSection(0,grid,grid.createDiv('nf-section-body')));
    const tail=this.element.createDiv('nf-page-tail');
    this.button(tail,'＋ 添加分区',()=>void this.change(text=>text+(text.endsWith('\n')?'\n':'\n\n')+'## 新分区\n\n点击这里书写。\n'));
    this.view.containerEl.classList.add('nf-page-mounted');
    const key=this.storageKey();
    if (this.readDraft(key)) this.button(tail,'恢复未保存草稿',()=>this.restoreDraft(key));
    this.element.scrollTop=scrollTop;
  }
  private async renderSection(text:string,body:HTMLElement):Promise<void> {
    const {enabled:cards,ordinary,links}=cardContent(text);
    const file=this.file!,component=this.component;
    await MarkdownRenderer.render(this.app,ordinary,body,file.path,component);
    if(!cards || this.disposed || component!==this.component || file!==this.file)return;
    const grid=body.createDiv('nf-cards');
    for(const link of links) {
      const [path,label]=link.split('|');
      const target=this.app.metadataCache.getFirstLinkpathDest(path,file.path);
      const card=this.button(grid,label || path,()=>void this.app.workspace.openLinkText(path,file.path));
      card.classList.add('nf-card');
      card.empty();
      const caption=card.createSpan({cls:'nf-card-label',text:label || path});
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
    if(!links.length)body.createEl('p',{cls:'nf-help',text:'添加项目链接即可显示卡片，例如：- [[项目名称]]。点击文字可修改当前分区。'});
  }
  private titleEdit(title: HTMLElement): void {
    if(this.editing || this.busy || !this.file)return;
    const input=document.createElement('input');input.value=title.textContent || '';input.className='nf-title-input';input.setAttribute('aria-label','页面标题');
    title.replaceWith(input);
    const actions=input.parentElement!.createDiv('nf-inline-actions');
    const status=actions.createSpan({text:'页面标题 · 不重命名文件'});
    const session=this.beginEdit('title',-1,input,status);
    this.button(actions,'完成',()=>void this.saveEdit(session));
    this.button(actions,'取消',()=>this.cancelEdit(session));
    input.addEventListener('input',()=>this.stashDraft());
    input.addEventListener('blur',event=>{if(!(event.relatedTarget instanceof HTMLElement) || !actions.contains(event.relatedTarget))void this.saveEdit(session);});
    input.addEventListener('keydown',event=>{
      if(event.isComposing)return;
      if(event.key==='Enter'){event.preventDefault();void this.saveEdit(session);}
      if(event.key==='Escape'){event.preventDefault();this.cancelEdit(session);}
    });
    input.focus();
  }
  private storageKey(): string {return `nebula-focus-draft:${this.file?.path}`;}
  private readDraft(key:string): {base:string; index:number; kind:string; value:string}|null {
    try {
      const value=this.app.loadLocalStorage(key);
      return value && typeof value.value==='string' && typeof value.base==='string' ? value : null;
    }catch{return null;}
  }
  private stashDraft(): void {
    const s=this.session;if(!s || s.input.value===s.initial)return;
    try {this.app.saveLocalStorage(s.key,{base:s.base,index:s.index,kind:s.kind,value:s.input.value});}
    catch {s.status.textContent='草稿缓存不可用，请保持页面打开并保存。';}
  }
  private clearSavedDraft(s:EditSession,value:string):void {
    const draft=this.readDraft(s.key);
    // A slow completion must not erase a newer draft written elsewhere.
    if(draft?.base===s.base && draft.index===s.index && draft.kind===s.kind && draft.value===value) {
      try{this.app.saveLocalStorage(s.key,null);}catch{new Notice('内容已保存，旧草稿缓存未能清理。');}
    }
  }
  private restoreDraft(key:string): void {
    const draft=this.readDraft(key);if(!draft)return;
    const modal=this.modal();modal.titleEl.setText(draft.kind==='title'?'未保存的页面标题':'未保存草稿');
    const text=modal.contentEl.createEl('textarea',{cls:'nf-inline-editor',attr:{'aria-label':'草稿内容'}});text.value=draft.value;text.readOnly=true;
    modal.contentEl.createEl('p',{text:'先复制需要的内容，关闭后粘贴到对应位置。不会自动覆盖当前文件。'});
    this.button(modal.contentEl,'删除这份缓存',()=>{
      try{this.app.saveLocalStorage(key,null);modal.close();if(!this.editing)void this.update(true).catch(e=>this.error(e));}
      catch{new Notice('无法删除草稿缓存。');}
    });modal.open();
  }
  private beginEdit(kind:'section'|'title',index:number,input:HTMLInputElement|HTMLTextAreaElement,status:HTMLElement):EditSession {
    const session={file:this.file!,base:this.source,index,kind,input,status,initial:input.value,key:this.storageKey()};
    this.session=session;return session;
  }
  private cancelEdit(s:EditSession):void {
    if(this.session!==s || this.busy)return;
    this.suspend();void this.update(true).catch(e=>this.error(e));
  }
  private async saveEdit(s:EditSession):Promise<void> {
    if(this.session!==s || this.file!==s.file || this.disposed || this.busy)return;
    if(s.input.value===s.initial){this.session=undefined;await this.update(true).catch(e=>this.error(e));return;}
    const value=s.input.value;this.busy=true;this.stashDraft();
    // Prevent additional keystrokes from being lost while a vault write is pending.
    s.input.readOnly=true;
    try {
      const next=s.kind==='title'?setMeta(s.base,'nf-title',value.trim()):
        sections(s.base)[s.index]?replaceSection(s.base,s.index,value):s.base+(s.base && !s.base.endsWith('\n')?'\n':'')+value;
      await this.write(s.base,next);
      this.clearSavedDraft(s,value);
      if(this.session===s)this.session=undefined;
    }catch(error){if(this.session===s){this.stashDraft();s.status.textContent=error instanceof Error?error.message:'保存失败';}else this.error(error);}
    finally{
      s.input.readOnly=false;this.busy=false;
      if(!this.disposed)await this.update(true).catch(e=>this.error(e));
    }
  }
  private editSection(index:number,item:HTMLElement,body:HTMLElement):void {
    if(this.editing || this.busy || !this.file)return;
    const section=sections(this.source)[index];
    item.classList.add('nf-editing');body.empty();
    const editor=body.createEl('textarea',{cls:'nf-inline-editor',attr:{'aria-label':'编辑当前分区','spellcheck':'true'}});
    editor.value=section?.text || '';
    const format=body.createDiv('nf-inline-format');
    const actions=body.createDiv('nf-inline-actions'),status=actions.createSpan({text:'当前分区 · Markdown'});
    const session=this.beginEdit('section',index,editor,status);
    const wrap=(before:string,after='')=>{
      if(this.busy)return;const start=editor.selectionStart,end=editor.selectionEnd;
      editor.setRangeText(before+editor.value.slice(start,end)+after,start,end,'select');this.stashDraft();editor.focus();
    };
    this.button(format,'粗体',()=>wrap('**','**'));this.button(format,'引用',()=>wrap('> '));this.button(format,'列表',()=>wrap('- '));
    this.button(actions,'完成',()=>void this.saveEdit(session));
    this.button(actions,'取消',()=>this.cancelEdit(session));
    editor.addEventListener('input',()=>{editor.style.height='auto';editor.style.height=`${Math.max(160,editor.scrollHeight)}px`;this.stashDraft();});
    editor.addEventListener('keydown',event=>{if(!event.isComposing && (event.ctrlKey || event.metaKey)&&event.key==='Enter'){event.preventDefault();void this.saveEdit(session);}});
    editor.addEventListener('blur',event=>{if(!(event.relatedTarget instanceof HTMLElement) || !body.contains(event.relatedTarget))void this.saveEdit(session);});
    editor.focus();editor.style.height=`${Math.max(160,editor.scrollHeight)}px`;
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
    this.button(modal.contentEl,'保存',()=>{void this.meta('nf-icon',Array.from(input.value).slice(0,8).join(''),origin).then(ok=>{if(ok)modal.close();});});modal.open();
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
    this.button(modal.contentEl,'保存裁切位置',()=>{void this.meta('nf-cover-y',Number(crop.value),origin).then(ok=>{if(ok)modal.close();});});
    this.button(modal.contentEl,'移除封面',()=>{void this.meta('nf-cover','',origin).then(ok=>{if(ok)modal.close();});});
    modal.contentEl.createEl('p',{text:'图片会保存在笔记库的 Nebula Assets 中。备份时请同时保留附件。'});modal.open();
  }
  destroy():void {this.suspend();this.disposed=true;++this.serial;++this.renderSerial;this.cleanupDrag?.();this.component.unload();for(const modal of this.modals)modal.close();this.modals.clear();this.element.remove();this.view.containerEl.classList.remove('nf-page-mounted');}
}
