/* A small public-API simulation for tests and the interactive demo.
 * It is not the Obsidian app and is never shipped in main.js. */
function createHost(win, seed = {}) {
  const doc = win.document;
  function build(parent, tag, options = {}) {
    if (typeof options === 'string') options = { cls: options };
    const el = doc.createElement(tag);
    if (options.cls) el.className = options.cls;
    if (options.text) el.textContent = options.text;
    if (options.type) el.type = options.type;
    for (const [k, v] of Object.entries(options.attr || {})) el.setAttribute(k, v);
    parent.append(el); return el;
  }
  for (const proto of [win.HTMLElement.prototype]) {
    proto.createEl = function(tag, options) { return build(this, tag, options); };
    proto.createDiv = function(options) { return build(this, 'div', options); };
    proto.createSpan = function(options) { return build(this, 'span', options); };
    proto.empty = function() { this.replaceChildren(); };
    proto.setText = function(text) { this.textContent = text; };
  }
  class Events {
    constructor() { this.handlers = new Map(); }
    on(name, fn) { const ref = { name, fn, owner: this }; const list = this.handlers.get(name) || []; list.push(ref); this.handlers.set(name, list); return ref; }
    offref(ref) { this.handlers.set(ref.name, (this.handlers.get(ref.name) || []).filter(x => x !== ref)); }
    trigger(name, ...args) { for (const {fn} of [...(this.handlers.get(name) || [])]) fn(...args); }
  }
  class TFile {
    constructor(path, text = '') {
      this.path = path; this.name = path.split('/').pop(); this.extension = this.name.split('.').pop();
      this.basename = this.name.slice(0, -(this.extension.length + 1)); this.text = text;
      this.stat = { mtime: 1700000000000, ctime: 1700000000000, size: text.length };
    }
  }
  class TFolder { constructor(path) { this.path = path; this.name = path.split('/').pop(); this.children = []; } }
  const root = new TFolder('');
  class Vault extends Events {
    constructor() { super(); this.files = new Map([['', root]]); this.writes = []; }
    getRoot() { return root; }
    getName() { return 'Test vault'; }
    async read(file) { return file.text; }
    async process(file, fn) {const next=fn(file.text);file.text=next;this.writes.push(file.path);this.trigger('modify',file);return next;}
    async createBinary(path, data) {return this.create(path, data);}
    getResourcePath(file) {return typeof file.text==='string' && file.extension==='svg' ? 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(file.text) : ''; }
    getAbstractFileByPath(path) { return this.files.get(path) || null; }
    getAllLoadedFiles() { return [...this.files.values()]; }
    getMarkdownFiles() { return this.getAllLoadedFiles().filter(f => f instanceof TFile && f.extension === 'md'); }
    add(file) {
      const folderPath = file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '';
      let parent = this.files.get(folderPath);
      if (!parent) parent = this.add(new TFolder(folderPath));
      parent.children.push(file); file.parent = parent; this.files.set(file.path, file); return file;
    }
    async create(path, content) { if (this.files.has(path)) throw Error('exists'); this.writes.push(path); return this.add(new TFile(path, content)); }
    async createFolder(path) { if (this.files.has(path)) throw Error('exists'); this.writes.push(path); return this.add(new TFolder(path)); }
  }
  const vault = new Vault();
  const defaults = {
    'Home.md': '# 留一点空间，给内容\n\n这里是阅读界面的演示笔记。点击左上角「笔记」浏览项目，点击「编辑」开始输入。\n\n## 让工具在需要时出现\n\n阅读时只保留必要入口。其他操作在右上角「更多」里。\n\n> 首页的具体内容将在后续设计。本页只是演示。',
    '项目/示例项目.md': '# 示例项目\n\n项目资料与笔记可以在这里阅读。分镜和资产视图将在后续设计。',
    '项目/制作笔记.md': '# 制作笔记\n\n这是示例内容。可以试试编辑，再点击完成回到阅读。',
    '灵感/阅读清单.md': '# 阅读清单\n\n让注意力回到内容本身。',
  };
  for (const [path, text] of Object.entries(seed.files || defaults)) vault.add(new TFile(path, text));
  const workspaceRoot = doc.querySelector('.workspace') || doc.body.createDiv('workspace');
  class MarkdownView {
    constructor(leaf) {
      this.leaf = leaf; this.mode = 'source'; this.containerEl = workspaceRoot.createDiv('workspace-leaf-content');
      this.containerEl.dataset.type = 'markdown';
      this.header = this.containerEl.createDiv({ cls: 'view-header', text: '原生标题与操作' });
      this.contentEl = this.containerEl.createDiv('view-content');
      this.preview = this.contentEl.createDiv('markdown-reading-view markdown-preview-view');
      this.source = this.contentEl.createEl('textarea', { cls: 'markdown-source-view', attr: {'aria-label': '编辑正文'} });
      this.source.addEventListener('input', () => { if (this.file) this.file.text = this.source.value; });
      this.editor = { hasFocus: () => doc.activeElement === this.source, focus: () => this.source.focus() };
    }
    getViewType() { return 'markdown'; }
    getMode() { return this.mode; }
    getState() { return {file: this.file?.path, mode: this.mode}; }
    getDisplayText() { return this.file?.basename || ''; }
    showSearch() { new Notice('演示：这里会打开页内查找。'); }
    render() {
      this.containerEl.setAttribute('data-mode', this.mode);
      this.source.value = this.file?.text || '';
      this.preview.empty();
      // Text nodes only: uploaded or typed HTML never executes.
      for (const line of (this.file?.text || '').split('\n')) {
        if (!line.trim()) continue;
        const tag = line.startsWith('# ') ? 'h1' : line.startsWith('## ') ? 'h2' : line.startsWith('> ') ? 'blockquote' : 'p';
        this.preview.createEl(tag, {text: line.replace(/^(#{1,2} |> )/, '')});
      }
      this.preview.style.display = this.mode === 'preview' ? '' : 'none';
      this.source.style.display = this.mode === 'source' ? '' : 'none';
    }
  }
  class Workspace extends Events {
    constructor() {
      super(); this.containerEl = workspaceRoot; this.rootSplit = {}; this.leaves = [];
      this.leftSplit = { collapsed: true, collapse() { this.collapsed = true; }, expand() { this.collapsed = false; } };
      this.rightSplit = this.leftSplit;
    }
    getActiveViewOfType(type) { return this.current?.view instanceof type ? this.current.view : null; }
    iterateAllLeaves(callback) { this.leaves.forEach(callback); }
    getLeaf() { return this.current; }
    onLayoutReady(callback) { callback(); }
    async revealLeaf(leaf) { this.current = leaf; this.trigger('active-leaf-change', leaf); }
  }
  const workspace = new Workspace();
  class Leaf {
    constructor() { this.view = new MarkdownView(this); }
    getRoot() { return workspace.rootSplit; }
    async setViewState(state) { this.view.mode = state.state.mode; this.view.render(); workspace.trigger('layout-change'); }
    async openFile(file, options = {}) {
      this.view.file = file; this.view.mode = options.state?.mode || 'source'; this.view.render();
      workspace.current = this; workspace.trigger('file-open', file); workspace.trigger('active-leaf-change', this);
    }
  }
  const leaf = new Leaf(); workspace.current = leaf; workspace.leaves.push(leaf);
  leaf.view.file = vault.getMarkdownFiles()[0]; leaf.view.render();
  workspace.openLinkText=async(path,source)=>{const file=vault.getAbstractFileByPath(path)||vault.getAbstractFileByPath(path+'.md');if(file)await leaf.openFile(file);};
  const app = { vault, workspace, loadLocalStorage(key){try{return JSON.parse(win.localStorage.getItem((seed.vaultId || 'test-vault')+':'+key));}catch{return null;}}, saveLocalStorage(key,data){key=(seed.vaultId || 'test-vault')+':'+key;if(data===null)win.localStorage.removeItem(key);else win.localStorage.setItem(key,JSON.stringify(data));}, metadataCache:{getFirstLinkpathDest(path){return vault.getAbstractFileByPath(path)||vault.getAbstractFileByPath(path+'.md');}} };
  class Component { load(){} unload(){} }
  class MarkdownRenderer { static async render(app,text,element) {
    if(seed.renderMarkdown){
      element.innerHTML=seed.renderMarkdown(text);
      const walker=doc.createTreeWalker(element,win.NodeFilter.SHOW_TEXT),nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
      for(const node of nodes){
        if(node.parentElement.closest('code,pre'))continue;
        const parts=node.textContent.split(/(!?\[\[[^\]\n]+\]\])/g);if(parts.length===1)continue;
        const fragment=doc.createDocumentFragment();
        for(const part of parts){const match=/^(!?)\[\[(.*?)\]\]$/.exec(part);if(!match){fragment.append(doc.createTextNode(part));continue;}
          const [path,label]=match[2].split('|'),el=doc.createElement(match[1]?'img':'a');
          if(match[1]){const file=app.metadataCache.getFirstLinkpathDest(path);if(file)el.src=app.vault.getResourcePath(file);el.alt=label||path;}
          else{el.className='internal-link';el.setAttribute('href',path);el.dataset.href=path;el.textContent=label||path;}fragment.append(el);
        }node.replaceWith(fragment);
      }return;
    }
    for(const line of text.split('\n')) {
      if(!line.trim())continue;
      const img=/^!\[\[(.*?)\]\]$/.exec(line);
      if(img){const file=app.metadataCache.getFirstLinkpathDest(img[1]);if(file)element.createEl('img',{attr:{src:app.vault.getResourcePath(file),alt:img[1]}});continue;}
      const tag=line.startsWith('## ')?'h2':line.startsWith('# ')?'h1':line.startsWith('> ')?'blockquote':'p';
      const el=element.createEl(tag);
      const parts=line.replace(/^(#{1,2} |> )/,'').split(/(\[\[[^\]]+\]\])/g);
      for(const part of parts){const m=/^\[\[(.*?)\]\]$/.exec(part);if(m){const [path,label]=m[1].split('|');el.createEl('a',{text:label||path,cls:'internal-link',attr:{href:path,'data-href':path}});}else el.append(doc.createTextNode(part));}
    }
  }}
  class Plugin {
    constructor() { this.app = app; this.refs = []; this.commands = []; this.ribbon = []; }
    async loadData() { return seed.settings || {}; }
    async saveData(data) { this.saved = structuredClone(data); }
    addCommand(command) { this.commands.push(command); }
    addSettingTab() {}
    addRibbonIcon(icon, name, callback) { this.ribbon.push(callback); }
    registerEvent(ref) { this.refs.push(ref); }
    cleanup() { this.onunload(); this.refs.forEach(ref => ref.owner.offref(ref)); }
  }
  class Modal {
    constructor(app) {
      this.app = app; this.containerEl = doc.createElement('div'); this.containerEl.className = 'modal-container';
      this.modalEl = this.containerEl.createDiv('modal');
      this.titleEl = this.modalEl.createEl('h2', {cls: 'modal-title'});
      const close = this.modalEl.createEl('button', {text: '×', cls: 'modal-close-button', attr:{'aria-label':'关闭'}});
      close.addEventListener('click', () => this.close());
      this.contentEl = this.modalEl.createDiv('modal-content');
      this.containerEl.addEventListener('keydown', e => { if (e.key === 'Escape') this.close(); });
    }
    open() { doc.body.append(this.containerEl); this.onOpen?.(); }
    close() { this.onClose?.(); this.containerEl.remove(); }
    onClose() {}
  }
  class FuzzySuggestModal extends Modal {
    setPlaceholder(text) { this.placeholder = text; }
    onOpen() {
      const input = this.contentEl.createEl('input', {type:'search', attr:{placeholder:this.placeholder || '搜索'}});
      const list = this.contentEl.createDiv();
      const render = () => { list.empty(); for (const item of this.getItems().filter(x => this.getItemText(x).toLowerCase().includes(input.value.toLowerCase()))) {
        const b = list.createEl('button', {text:this.getItemText(item), cls:'nf-file-row'});
        b.addEventListener('click', () => { this.onChooseItem(item); this.close(); });
      }}; input.addEventListener('input', render); render();
    }
  }
  class Notice { constructor(text) { const el = doc.body.createDiv({cls:'notice', text}); win.setTimeout(() => el.remove(), 2000); } }
  const openMenus = new Set();
  class Menu {
    constructor() { this.el = doc.createElement('div'); this.el.className = 'menu'; this.hideCallbacks = []; this.visible = false; }
    addItem(fn) {
      const b = this.el.createEl('button', {cls:'menu-item'});
      const menu = this;
      const api = { setTitle(t) { b.textContent = t; return api; }, setIcon() {return api;}, setChecked(v) { if(v) b.dataset.checked = 'true'; return api; },
        onClick(cb) { b.addEventListener('click', () => { cb(); menu.hide(); }); return api; } };
      fn(api); return this;
    }
    addSeparator() { this.el.createEl('hr'); return this; }
    onHide(callback) { this.hideCallbacks.push(callback); return this; }
    hide() {
      if (!this.visible) return;
      this.visible = false; openMenus.delete(this); this.el.remove();
      if (this.dismiss) doc.removeEventListener('click', this.dismiss);
      for (const callback of this.hideCallbacks) callback();
    }
    showAtMouseEvent() {
      for (const menu of openMenus) menu.hide();
      doc.body.append(this.el); this.visible = true; openMenus.add(this);
      win.setTimeout(() => {
        if (!this.visible) return;
        this.dismiss = e => { if (!this.el.contains(e.target)) this.hide(); };
        doc.addEventListener('click', this.dismiss);
      }, 0);
    }
  }
  class Setting {
    constructor(container) { this.el = container.createDiv('setting-item'); this.info = this.el.createDiv('setting-item-info'); this.controls = this.el.createDiv('setting-item-control'); }
    setName(text) { this.info.createDiv({text, cls:'setting-item-name'}); return this; }
    setDesc(text) { this.info.createDiv({text, cls:'setting-item-description'}); return this; }
    addToggle(fn) { const el = this.controls.createEl('input',{type:'checkbox'}); const a={ setValue(v){el.checked=v;return a;},onChange(cb){el.addEventListener('change',()=>cb(el.checked));return a;} }; fn(a); return this; }
    addButton(fn) { const el = this.controls.createEl('button'); const a={setButtonText(t){el.textContent=t;return a;},onClick(cb){el.addEventListener('click',cb);return a;}};fn(a);return this; }
    addExtraButton(fn) {const el=this.controls.createEl('button');const a={setIcon(){el.textContent='×';return a;},setTooltip(t){el.title=t;return a;},onClick(cb){el.addEventListener('click',cb);return a;}};fn(a);return this;}
    addDropdown(fn) {const el=this.controls.createEl('select');const a={addOptions(o){for(const[v,t]of Object.entries(o)){const opt=el.createEl('option',{text:t});opt.value=v;}return a;},setValue(v){el.value=v;return a;},onChange(cb){el.addEventListener('change',()=>cb(el.value));return a;}};fn(a);return this;}
  }
  const paths={ 'panel-left':'M4 4h16v16H4z M9 4v16', house:'m3 11 9-8 9 8 M5 10v11h14V10 M9 21v-7h6v7', ellipsis:'M5 12h.01M12 12h.01M19 12h.01', plus:'M12 5v14M5 12h14', folder:'M3 7h7l2 2h9v11H3z M3 7V4h7l2 3', 'file-text':'M5 3h10l4 4v14H5z M14 3v5h5 M8 12h8M8 16h6', 'arrow-left':'m11 5-7 7 7 7M4 12h16', sparkles:'m12 3 2 7 7 2-7 2-2 7-2-7-7-2 7-2z' };
  function setIcon(el, name) { const svg=doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');const p=doc.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',paths[name]||paths['file-text']);svg.append(p);el.append(svg); }
  class PluginSettingTab {constructor(app,plugin){this.app=app;this.plugin=plugin;this.containerEl=doc.createElement('div');}}
  return { app, leaf, vault, root, api: {Component,MarkdownRenderer,normalizePath:path=>path.replace(/\\/g,'/'),Plugin,PluginSettingTab,MarkdownView,Modal,Menu,Notice,Setting,TFile,TFolder,FuzzySuggestModal,Platform:{isMobile: seed.mobile !== false},getLanguage:()=>seed.language||'zh',setIcon}, setView(type){workspace.current={view:{getViewType:()=>type}};workspace.trigger('active-leaf-change',workspace.current);} };
}
if (typeof module !== 'undefined') module.exports = { createHost };
