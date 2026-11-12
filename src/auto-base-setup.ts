import {TFile, TFolder, normalizePath, parseYaml, stringifyYaml, type App, type TAbstractFile} from 'obsidian';
import {enhanceBaseProfiles} from './auto-base-profile';
import {generateBaseForNote} from './generated-base';
import {noteSource} from './note-source';

const GENERATED_FOLDER = 'Nebula Views';
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** File-open provisioning only. Rendering never saves a note or inserts an embed.
 * Existing user views win; generated files live separately and are created once.
 */
export class AutoBaseSetup {
  private pending = new Map<string, Promise<TFile[]>>();
  private enhancing = new Map<string, Promise<void>>();
  private finished = new Map<string, {mtime: number; files: TFile[]}>();

  constructor(private app: App, private pluginId: string, private enabled: () => boolean) {}

  ensure(file: TFile, retry = false): Promise<TFile[]> {
    if (!this.enabled() || !['md', 'base'].includes(file.extension)) return Promise.resolve([]);
    const sourcePath = file.path;
    const running = this.pending.get(sourcePath);
    if (running) return running;
    const previous = this.finished.get(file.path);
    if (!retry && previous?.mtime === file.stat.mtime && previous.files.every(item =>
      this.app.vault.getFileByPath(item.path) === item)) return Promise.resolve(previous.files);
    const mtime = file.stat.mtime;
    const operation = this.provision(file).then(files => {
      if (files.length && file.path === sourcePath && file.stat.mtime === mtime) this.finished.set(sourcePath, {mtime, files});
      return files;
    }).finally(() => {this.pending.delete(sourcePath);});
    this.pending.set(sourcePath, operation);
    return operation;
  }

  clear() {this.finished.clear();}

  private async provision(file: TFile): Promise<TFile[]> {
    if (file.extension === 'base') {await this.enhance(file); return [file];}
    const cache = this.app.metadataCache.getFileCache(file);
    // Wait for the host's parsed cache. A half-synced note must not manufacture
    // a self-only fallback before its embedded database becomes available.
    if (!cache || !this.enabled()) return [];
    const snapshotTime = file.stat.mtime;
    const source = noteSource(await this.app.vault.read(file));
    if (file.stat.mtime !== snapshotTime || !this.enabled()) return [];
    const references = source.bases;
    if (references.length) {
      const bases: TFile[] = [];
      for (const link of [...new Set(references)]) {
        const target = this.app.metadataCache.getFirstLinkpathDest(link, file.path);
        if (target?.extension === 'base') {await this.enhance(target); bases.push(target);}
      }
      // Even an unresolved explicit embed wins over creating another database.
      return bases;
    }
    // An inline native database already supplies this note's data view.
    // Never add a competing self-only database or rewrite the Markdown block.
    if (source.inlineBase) return [];
    const sibling = this.app.vault.getFileByPath(file.path.replace(/\.md$/i, '.base'));
    if (sibling) {await this.enhance(sibling); return [sibling];}
    const sourcePath = file.path;
    const targetPath = normalizePath(`${GENERATED_FOLDER}/${sourcePath.replace(/\.md$/i, '.base')}`);
    const existing = this.app.vault.getAbstractFileByPath(targetPath);
    if (existing) return this.reuseGenerated(existing, file.path);

    const recordFolder = this.app.vault.getFolderByPath(file.path.replace(/\.md$/i, ''));
    const children = recordFolder?.children.filter((child): child is TFile => child instanceof TFile && child.extension === 'md') ?? [];
    // A child may still be syncing. Keep the operation retryable instead of
    // saving an incomplete schema whose fields would be missing permanently.
    if (children.some(child => !this.app.metadataCache.getFileCache(child))) return [];
    const childTimes = children.map(child => ({file: child, path: child.path, mtime: child.stat.mtime}));
    const records = recordFolder ? await Promise.all(children.map(async record => ({
      path: record.path, properties: noteSource(await this.app.vault.read(record)).properties,
    }))) : [{path: file.path, properties: source.properties}];
    const data = generateBaseForNote(file, records, recordFolder?.path);
    await this.ensureFolder(targetPath.slice(0, targetPath.lastIndexOf('/')));
    if (!this.enabled() || file.path !== sourcePath || file.stat.mtime !== snapshotTime ||
        childTimes.some(child => child.file.path !== child.path || child.file.stat.mtime !== child.mtime) ||
        (recordFolder && (this.app.vault.getFolderByPath(recordFolder.path) !== recordFolder ||
          recordFolder.children.some(child => child instanceof TFile && child.extension === 'md' && !children.includes(child)) ||
          children.some(child => !recordFolder.children.includes(child))))) return [];
    // Another window or sync client may have created it while folders loaded.
    const raced = this.app.vault.getAbstractFileByPath(targetPath);
    if (raced) return this.reuseGenerated(raced, file.path);
    try {return [await this.app.vault.create(targetPath, stringifyYaml(data))];}
    catch (error) {
      const winner = this.app.vault.getAbstractFileByPath(targetPath);
      if (winner) return this.reuseGenerated(winner, file.path);
      throw error;
    }
  }

  private async reuseGenerated(candidate: TAbstractFile, source: string): Promise<TFile[]> {
    if (!(candidate instanceof TFile) || candidate.extension !== 'base') throw new Error('数据视图路径已被其他文件占用');
    const parsed: unknown = parseYaml(await this.app.vault.read(candidate));
    if (!object(parsed) || !object(parsed.nebulaSource) || parsed.nebulaSource.path !== source || parsed.nebulaSource.version !== 1) {
      throw new Error('数据视图已存在且不属于当前笔记，已保留原文件');
    }
    // Do not regenerate order, filters, widths or profiles after user edits.
    await this.enhance(candidate);
    return [candidate];
  }

  private enhance(file: TFile): Promise<void> {
    const path = file.path;
    const running = this.enhancing.get(path);
    if (running) return running;
    const operation = this.enhanceFile(file).finally(() => {this.enhancing.delete(path);});
    this.enhancing.set(path, operation);
    return operation;
  }

  private async enhanceFile(file: TFile): Promise<void> {
    const sourcePath = file.path;
    const currentIdentity = () => file.path === sourcePath && file.extension === 'base' && this.enabled();
    const original = await this.app.vault.read(file);
    const result = enhanceBaseProfiles(parseYaml(original));
    if (!result?.changed || !currentIdentity()) return;
    const folder = normalizePath(`${this.app.vault.configDir}/plugins/${this.pluginId}/backups/auto-bases`);
    // The configuration backup is outside note content and precedes the CAS.
    let path = '';
    for (const segment of folder.split('/')) {
      path = path ? `${path}/${segment}` : segment;
      if (!await this.app.vault.adapter.exists(path)) {
        try {await this.app.vault.adapter.mkdir(path);}
        catch (error) {if (!await this.app.vault.adapter.exists(path)) throw error;}
      }
    }
    const backup = `${folder}/${Date.now()}-${crypto.randomUUID()}.json`;
    if (!currentIdentity()) return;
    await this.app.vault.adapter.write(backup, JSON.stringify({path: sourcePath, content: original}));
    if (!currentIdentity()) return;
    await this.app.vault.process(file, current => current === original && currentIdentity() ? stringifyYaml(result.data) : current);
  }

  private async ensureFolder(path: string): Promise<void> {
    let current = '';
    for (const segment of path.split('/')) {
      current = current ? `${current}/${segment}` : segment;
      const existing = this.app.vault.getAbstractFileByPath(current);
      if (existing && !(existing instanceof TFolder)) throw new Error('数据视图文件夹路径已被文件占用');
      if (!existing && this.enabled()) {
        try {await this.app.vault.createFolder(current);}
        catch (error) {if (!(this.app.vault.getAbstractFileByPath(current) instanceof TFolder)) throw error;}
      }
    }
  }
}
