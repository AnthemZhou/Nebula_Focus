import {Component, FileSystemAdapter, Modal, Platform, Plugin, Setting, TFile, TFolder} from 'obsidian';
import type {PageNode} from './page-tree';
import {ExternalArchive, ArchiveOperationError, type ArchiveManifest, type ArchiveStatus} from './external-archive';
import {createNodeArchiveIO, defaultArchiveDirectory} from './external-archive-node';

export interface ArchivePreferences {directory: string;}
export interface PageArchiveActions {
  readonly directory: string;
  setDirectory(directory: string): Promise<void>;
  open(node: PageNode): void;
  browse(): void;
}

export function readArchivePreferences(value: unknown): ArchivePreferences {
  const raw = value && typeof value === 'object' ? value as Partial<ArchivePreferences> : {};
  return {directory: typeof raw.directory === 'string' ? raw.directory.trim() : ''};
}

/** Vault records stay untouched until a verified external package exists.
 * This controller is constructed only on desktop; its IO host loads Node lazily. */
export class ArchiveController extends Component implements PageArchiveActions {
  private preferences: ArchivePreferences;
  private engine?: ExternalArchive;
  private running = false;
  private stopped = false;

  constructor(private plugin: Plugin, initial: unknown,
    private save: (settings: ArchivePreferences) => Promise<void>, private changed: () => void) {
    super(); this.preferences = readArchivePreferences(initial);
  }

  get directory() {return this.preferences.directory || defaultArchiveDirectory(this.plugin.app.vault.getName());}
  private desktopAdapter() {
    const adapter = this.plugin.app.vault.adapter;
    if (!Platform.isDesktopApp || !(adapter instanceof FileSystemAdapter)) throw new Error('外部归档仅适用于桌面本地库');
    return adapter;
  }
  private get vaultRoot() {return this.desktopAdapter().getBasePath();}
  private get archive() {this.desktopAdapter(); return this.engine ??= new ExternalArchive(createNodeArchiveIO());}

  onload() {
    this.plugin.addCommand({id: 'open-external-archives', name: '管理外部归档', callback: () => this.browse()});
    this.registerEvent(this.plugin.app.workspace.on('file-menu', (menu, file) => {
      if (!(file instanceof TFile || file instanceof TFolder) || !file.path || file.path === '/') return;
      menu.addItem(item => item.setTitle('归档到外部…').setIcon('archive').onClick(() => this.open({
        id: file.path, parent: file.parent?.path ?? '', title: file instanceof TFile ? file.basename : file.name,
        kind: file instanceof TFolder ? 'folder' : 'page', children: [],
        ...(file instanceof TFolder ? {folderPath: file.path} : {filePath: file.path}),
      })));
    }));
  }
  onunload() {this.stopped = true;}

  async setDirectory(directory: string) {
    if (this.running) throw new Error('归档操作进行中，请完成后再更改目录');
    const next = {directory: directory.trim()};
    await this.save(next); this.preferences = next;
  }

  /** Only selected files are removed. Embedded local attachments are copied,
   * never moved: another note may still use them. Linked pages remain links. */
  private selection(node: PageNode) {
    const vault = this.plugin.app.vault;
    const selected = new Map<string, {path: string; removeSource: boolean}>();
    const visit = (file: TFile | TFolder) => {
      if (file instanceof TFile) selected.set(file.path, {path: file.path, removeSource: true});
      else for (const child of file.children) if (child instanceof TFile || child instanceof TFolder) visit(child);
    };
    if (node.folderPath) {
      const folder = vault.getFolderByPath(node.folderPath);
      if (!folder || !folder.path || folder.path === '/') throw new Error('请选择具体项目，不能归档整个库');
      visit(folder);
      const companion = vault.getFileByPath(folder.path + '.md');
      if (companion) visit(companion);
    }
    if (node.filePath) {
      const file = vault.getFileByPath(node.filePath);
      if (!file) throw new Error('页面已移动或删除，请刷新侧栏');
      visit(file);
    }
    if (!selected.size) throw new Error('这里没有可归档的文件');
    for (const item of [...selected.values()]) {
      const file = vault.getFileByPath(item.path);
      if (!file || file.extension !== 'md') continue;
      for (const embed of this.plugin.app.metadataCache.getFileCache(file)?.embeds ?? []) {
        const target = this.plugin.app.metadataCache.getFirstLinkpathDest(embed.link, file.path);
        if (target && target.extension !== 'md' && !selected.has(target.path))
          selected.set(target.path, {path: target.path, removeSource: false});
      }
    }
    return [...selected.values()];
  }

  private async exclusively<T>(action: () => Promise<T>): Promise<T> {
    if (this.stopped) throw new Error('插件已关闭，请重新打开归档');
    if (this.running) throw new Error('已有归档或恢复操作进行中');
    this.running = true;
    try {return await action();} finally {this.running = false; this.changed();}
  }

  open(node: PageNode) {
    const modal = new Modal(this.plugin.app);
    modal.setTitle('归档「' + node.title + '」');
    const archiveDirectory = this.directory;
    const description = modal.contentEl.createEl('p');
    const destination = modal.contentEl.createEl('p', {cls: 'bui-archive-path'});
    destination.textContent = '外部目录：' + archiveDirectory;
    const status = modal.contentEl.createDiv({attr: {role: 'status', 'aria-live': 'polite'}});
    let items: {path: string; removeSource: boolean}[];
    try {
      this.desktopAdapter();
      items = this.selection(node);
      const attachments = items.filter(item => !item.removeSource).length;
      description.textContent = `归档 ${items.length - attachments} 个文件${attachments ? `，另外备份 ${attachments} 个引用附件` : ''}。验证外部副本后，所选文件移入回收站；共享附件保留。`;
      modal.contentEl.createEl('p', {text: '归档后，记录不再参与当前库的表格和链接。可从「外部归档」恢复到原路径。'});
    } catch (error) {status.textContent = message(error); modal.open(); return;}
    new Setting(modal.contentEl).addButton(button => button.setButtonText('取消').onClick(() => modal.close()))
      .addButton(button => button.setButtonText('保存到外部并归档').setCta().onClick(async () => {
        button.setDisabled(true); status.textContent = '正在备份并校验…';
        try {
          const result = await this.exclusively(() => this.archive.archiveFiles({
            vaultRoot: this.vaultRoot, archiveRoot: archiveDirectory, label: node.title, items,
            protectedPaths: [this.plugin.app.vault.configDir],
            trashSource: async path => {
              if (this.stopped) throw new Error('插件已关闭，外部副本已保留，停止移除源文件');
              const file = this.plugin.app.vault.getFileByPath(path);
              if (!file) throw new Error('源文件已移动，请保留外部副本并重新检查');
              // Force recoverable local trash even if the host preference is
              // permanent deletion. A verified external copy is also retained.
              await this.plugin.app.vault.trash(file, false);
            },
          }));
          status.textContent = result.status === 'archived' ? '归档完成。外部副本与回收站均已保留。' : '外部副本已保存；部分源文件未能移入回收站，仍留在库中。';
          if (result.status === 'archived' && node.folderPath) {
            const folder = this.plugin.app.vault.getFolderByPath(node.folderPath);
            const empty = (value: TFolder): boolean => value.children.every(child => child instanceof TFolder && empty(child));
            if (folder && empty(folder)) {
              try {await this.plugin.app.vault.trash(folder, false);}
              catch {status.textContent += ' 空目录未能收起，可稍后整理。';}
            }
          }
          this.packageDetails(modal.contentEl, result);
          button.setButtonText('已保存');
        } catch (error) {
          status.textContent = message(error);
          if (error instanceof ArchiveOperationError && error.packagePath)
            modal.contentEl.createEl('p', {text: '已保留归档包：' + error.packagePath});
          button.setDisabled(false);
        }
      }));
    modal.open();
  }

  browse() {
    const modal = new Modal(this.plugin.app); modal.setTitle('外部归档');
    modal.contentEl.createEl('p', {text: '归档保存在当前库之外。恢复会校验内容并保留外部副本，遇到同名文件不会覆盖。'});
    let directory = this.directory;
    const controls = modal.contentEl.createDiv();
    const currentPath = modal.contentEl.createEl('p', {cls: 'bui-archive-path', text: this.directory});
    const status = modal.contentEl.createDiv({cls: 'bui-archive-status', attr: {role: 'status', 'aria-live': 'polite'}});
    const list = modal.contentEl.createDiv();
    const load = async () => {
      list.replaceChildren(); status.textContent = '正在读取归档…';
      try {
        const packages = await this.archive.listPackages(this.directory);
        status.textContent = packages.length ? '' : '此目录中还没有归档。';
        for (const pack of packages) {
          new Setting(list).setName(pack.label).setDesc((pack.createdAt ? new Date(pack.createdAt).toLocaleString() + ' · ' : '') + archiveStatus(pack.status))
            .addButton(button => button.setButtonText('查看与恢复').onClick(async () => {
              try {this.showRestore(await this.archive.inspectPackage(pack.packagePath));}
              catch (error) {status.textContent = message(error);}
            }));
        }
      } catch (error) {status.textContent = message(error);}
    };
    const location = new Setting(controls).setName('外部保存目录').setDesc('填写库外的绝对路径。更改目录不会移动已有归档。')
      .addText(text => text.setValue(directory).onChange(value => {directory = value;}))
      .addButton(button => button.setButtonText('保存并读取').onClick(async () => {
        button.setDisabled(true);
        try {await this.setDirectory(directory); currentPath.textContent = this.directory; await load();}
        catch (error) {status.textContent = message(error);}
        finally {button.setDisabled(false);}
      }));
    location.settingEl.classList.add('bui-archive-directory');
    modal.open(); void load();
  }

  private packageDetails(host: HTMLElement, manifest: ArchiveManifest) {
    host.createEl('p', {text: manifest.packagePath, cls: 'bui-archive-path'});
    new Setting(host).addButton(button => button.setButtonText('复制归档路径').onClick(async () => {
      try {await navigator.clipboard.writeText(manifest.packagePath); button.setButtonText('路径已复制');}
      catch {button.setButtonText('请手动复制上方路径');}
    }));
  }
  private showRestore(manifest: ArchiveManifest) {
    const modal = new Modal(this.plugin.app); modal.setTitle('恢复「' + manifest.label + '」');
    modal.contentEl.createEl('p', {text: `${manifest.entries.length} 个文件将按原路径恢复。外部副本保留。`});
    const files = modal.contentEl.createEl('details'); files.createEl('summary', {text: '查看文件清单'});
    const list = files.createEl('ul');
    for (const entry of manifest.entries) list.createEl('li', {text: entry.path});
    this.packageDetails(modal.contentEl, manifest);
    const status = modal.contentEl.createDiv({attr: {role: 'status', 'aria-live': 'polite'}});
    new Setting(modal.contentEl).addButton(button => button.setButtonText('取消').onClick(() => modal.close()))
      .addButton(button => button.setButtonText('恢复到当前库').setCta().onClick(async () => {
        button.setDisabled(true); status.textContent = '正在校验并恢复…';
        try {
          const result = await this.exclusively(() => this.archive.restorePackage({vaultRoot: this.vaultRoot, packagePath: manifest.packagePath,
            protectedPaths: [this.plugin.app.vault.configDir]}));
          status.textContent = `已恢复 ${result.restored.length} 个文件，保留 ${result.retained.length} 个现有附件或未移除文件。`;
          button.setButtonText('恢复完成');
        } catch (error) {status.textContent = message(error); button.setDisabled(false);}
      }));
    modal.open();
  }
}

function message(error: unknown) {return error instanceof Error ? error.message : String(error);}
function archiveStatus(status: ArchiveStatus | 'invalid') {
  return {copying: '复制中', 'copy-failed': '复制未完成', verified: '副本已验证', archived: '已归档', partial: '部分归档',
    restored: '已恢复', 'restore-partial': '部分恢复', invalid: '清单无法读取'}[status];
}
