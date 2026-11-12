/** Filesystem-independent archive engine. The desktop host supplies all I/O;
 * importing this module on mobile neither loads Node nor accesses the disk. */
export interface ArchiveIO {
  resolve(path: string): string;
  join(...parts: string[]): string;
  dirname(path: string): string;
  relative(from: string, to: string): string;
  isAbsolute(path: string): boolean;
  realpath(path: string): Promise<string>;
  stat(path: string): Promise<{kind: 'file' | 'directory' | 'symlink' | 'other'; size: number} | null>;
  mkdir(path: string): Promise<void>;
  list(path: string): Promise<string[]>;
  read(path: string): Promise<Uint8Array>;
  writeExclusive(path: string, data: Uint8Array): Promise<void>;
  replace(path: string, data: Uint8Array): Promise<void>;
  sha256(data: Uint8Array): Promise<string>;
  uniqueId(): string;
  now(): string;
}

export type ArchiveStatus = 'copying' | 'copy-failed' | 'verified' | 'archived' | 'partial' | 'restored' | 'restore-partial';
export interface ArchiveEntry {
  path: string;
  size: number;
  sha256: string;
  removeSource: boolean;
  sourceRemoved: boolean;
}
export interface ArchiveManifest {
  format: 'nebula-focus-archive';
  version: 1;
  packagePath: string;
  vaultRoot: string;
  label: string;
  createdAt: string;
  status: ArchiveStatus;
  entries: ArchiveEntry[];
  errors: string[];
  restoredPaths?: string[];
  restoreVaultRoot?: string;
}
export interface ArchivePackageSummary {
  packagePath: string;
  label: string;
  createdAt: string;
  status: ArchiveStatus | 'invalid';
  entryCount: number;
  errors: string[];
}
export interface ArchiveRequest {
  vaultRoot: string;
  archiveRoot: string;
  label: string;
  items: {path: string; removeSource: boolean}[];
  /** Current vault configuration directory, including any custom name. */
  protectedPaths?: string[];
  trashSource(path: string): Promise<void>;
}
export class ArchiveOperationError extends Error {
  constructor(message: string, readonly packagePath?: string) {super(message); this.name = 'ArchiveOperationError';}
}

const PACKAGE_PREFIX = 'nebula-archive-';
const MANIFEST = 'manifest.json';
const STATUSES = new Set<ArchiveStatus>(['copying', 'copy-failed', 'verified', 'archived', 'partial', 'restored', 'restore-partial']);
const message = (error: unknown): string => error instanceof Error ? error.message : String(error);
const hasControlCharacter = (value: string): boolean => [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
// A package can move between case-sensitive and case-insensitive disks. Reject
// aliases before copying, including macOS's decomposed Unicode filenames.
const pathKey = (value: string): string => value.normalize('NFC').toLowerCase();

export function validArchiveRelativePath(value: unknown): value is string {
  return typeof value === 'string' && !!value && value.length <= 4096 &&
    !value.includes('\\') && !hasControlCharacter(value) && !value.startsWith('/') &&
    !value.includes(':') && value.split('/').every(part => !!part && !part.startsWith('.'));
}

export class ExternalArchive {
  constructor(private io: ArchiveIO) {}

  private inside(parent: string, target: string): boolean {
    const relative = this.io.relative(parent, target).replace(/\\/g, '/');
    return !relative || (!relative.startsWith('../') && relative !== '..' && !this.io.isAbsolute(relative));
  }

  private disjoint(first: string, second: string): void {
    if (this.inside(first, second) || this.inside(second, first))
      throw new ArchiveOperationError('归档目录必须在库外，且不能包含当前库');
  }

  /** Inspect each existing ancestor: lstat of the final file alone would miss
   * a symlinked parent and permit a path to escape its declared root. */
  private async directories(path: string, create: boolean): Promise<boolean> {
    const parts: string[] = [];
    let current = path;
    while (this.io.dirname(current) !== current) {parts.unshift(current); current = this.io.dirname(current);}
    parts.unshift(current);
    for (const part of parts) {
      const info = await this.io.stat(part);
      if (!info) {
        if (!create) return false;
        await this.io.mkdir(part);
        const created = await this.io.stat(part);
        if (created?.kind !== 'directory') throw new ArchiveOperationError('目录创建未通过检查');
      } else if (info.kind !== 'directory') throw new ArchiveOperationError('不支持符号链接或非目录路径');
    }
    return true;
  }

  private root(path: string): string {
    if (!path || !this.io.isAbsolute(path) || hasControlCharacter(path))
      throw new ArchiveOperationError('请填写有效的绝对目录路径');
    const resolved = this.io.resolve(path);
    if (this.io.dirname(resolved) === resolved) throw new ArchiveOperationError('不能使用文件系统根目录');
    return resolved;
  }

  private async canonicalRoot(value: string): Promise<string> {
    const root = this.root(value);
    await this.directories(root, false); // Reject symlinks before resolving case aliases.
    const missing: string[] = [];
    let ancestor = root;
    while (!await this.io.stat(ancestor)) {
      const parent = this.io.dirname(ancestor);
      missing.unshift(this.io.relative(parent, ancestor)); ancestor = parent;
    }
    return this.root(this.io.join(await this.io.realpath(ancestor), ...missing));
  }

  private relative(root: string, path: string): string {
    if (!validArchiveRelativePath(path)) throw new ArchiveOperationError('归档中包含无效的相对路径');
    const destination = this.io.join(root, ...path.split('/'));
    if (!this.inside(root, destination) || destination === root) throw new ArchiveOperationError('文件路径超出指定目录');
    return destination;
  }

  private protect(paths: string[], protectedPaths: string[] = []): void {
    const protectedRoots = protectedPaths.map(path => {
      if (!path || this.io.isAbsolute(path) || path.includes('\\') || path.includes(':') || hasControlCharacter(path) ||
          path.split('/').some(part => !part || part === '.' || part === '..'))
        throw new ArchiveOperationError('库配置目录路径无效');
      return pathKey(path);
    });
    for (const path of paths) {
      if (!validArchiveRelativePath(path)) throw new ArchiveOperationError('不能归档或恢复隐藏文件、配置目录或无效路径');
      const lower = pathKey(path);
      if (protectedRoots.some(root => lower === root || lower.startsWith(root + '/') || root.startsWith(lower + '/')))
        throw new ArchiveOperationError('不能归档或恢复库配置目录');
    }
  }

  private async regular(path: string): Promise<{size: number}> {
    if (!await this.directories(this.io.dirname(path), false)) throw new ArchiveOperationError('文件目录不存在');
    const info = await this.io.stat(path);
    if (info?.kind !== 'file') throw new ArchiveOperationError('归档只接受普通文件，不支持符号链接');
    return info;
  }

  private async bytes(path: string): Promise<Uint8Array> {
    await this.regular(path);
    const bytes = await this.io.read(path);
    await this.regular(path);
    return bytes;
  }

  private async verify(path: string, entry: ArchiveEntry): Promise<void> {
    const bytes = await this.bytes(path);
    if (bytes.byteLength !== entry.size || await this.io.sha256(bytes) !== entry.sha256)
      throw new ArchiveOperationError(`文件校验失败：${entry.path}`);
  }

  private async save(manifest: ArchiveManifest): Promise<void> {
    await this.directories(manifest.packagePath, false);
    const target = this.io.join(manifest.packagePath, MANIFEST);
    const info = await this.io.stat(target);
    if (info && info.kind !== 'file') throw new ArchiveOperationError('归档清单不是普通文件', manifest.packagePath);
    await this.io.replace(target, new TextEncoder().encode(JSON.stringify(manifest, null, 2) + '\n'));
  }

  private validateManifest(value: unknown, packagePath: string): ArchiveManifest {
    if (!value || typeof value !== 'object') throw new ArchiveOperationError('归档清单格式无效', packagePath);
    const raw = value as Partial<ArchiveManifest>;
    if (raw.format !== 'nebula-focus-archive' || raw.version !== 1 ||
        typeof raw.label !== 'string' || typeof raw.createdAt !== 'string' ||
        typeof raw.vaultRoot !== 'string' || !this.io.isAbsolute(raw.vaultRoot) ||
        !raw.status || !STATUSES.has(raw.status) || !Array.isArray(raw.entries) || !raw.entries.length ||
        !Array.isArray(raw.errors) || raw.errors.some(error => typeof error !== 'string'))
      throw new ArchiveOperationError('归档清单格式无效', packagePath);
    const paths = new Set<string>();
    const entries = raw.entries.map(entry => {
      if (!entry || !validArchiveRelativePath(entry.path) || paths.has(pathKey(entry.path)) ||
          !Number.isSafeInteger(entry.size) || entry.size < 0 || !/^[a-f0-9]{64}$/.test(entry.sha256) ||
          typeof entry.removeSource !== 'boolean' || typeof entry.sourceRemoved !== 'boolean' ||
          entry.sourceRemoved && !entry.removeSource)
        throw new ArchiveOperationError('归档清单包含无效或重复文件', packagePath);
      paths.add(pathKey(entry.path));
      return {...entry};
    });
    for (const path of paths) for (const ancestor of path.split('/').slice(0, -1).map((_, i, all) => all.slice(0, i + 1).join('/')))
      if (paths.has(ancestor)) throw new ArchiveOperationError('归档文件路径相互嵌套', packagePath);
    const restoredPaths = raw.restoredPaths;
    if (restoredPaths !== undefined && (!Array.isArray(restoredPaths) || restoredPaths.some(path => typeof path !== 'string' || !entries.some(entry => entry.path === path))))
      throw new ArchiveOperationError('归档恢复记录无效', packagePath);
    if (raw.restoreVaultRoot !== undefined && (typeof raw.restoreVaultRoot !== 'string' || !this.io.isAbsolute(raw.restoreVaultRoot)))
      throw new ArchiveOperationError('归档恢复目录无效', packagePath);
    return {format: 'nebula-focus-archive', version: 1, packagePath, vaultRoot: raw.vaultRoot,
      label: raw.label, createdAt: raw.createdAt, status: raw.status, entries, errors: [...raw.errors],
      ...(restoredPaths ? {restoredPaths: [...new Set(restoredPaths)]} : {}),
      ...(raw.restoreVaultRoot ? {restoreVaultRoot: raw.restoreVaultRoot} : {})};
  }

  private async manifest(packagePath: string): Promise<ArchiveManifest> {
    const root = await this.canonicalRoot(packagePath);
    if (!await this.directories(root, false)) throw new ArchiveOperationError('归档包不存在', root);
    let parsed: unknown;
    try {parsed = JSON.parse(new TextDecoder().decode(await this.bytes(this.io.join(root, MANIFEST))));}
    catch (error) {throw new ArchiveOperationError(`无法读取归档清单：${message(error)}`, root);}
    return this.validateManifest(parsed, root);
  }

  async inspectPackage(packagePath: string): Promise<ArchiveManifest> {
    const manifest = await this.manifest(packagePath);
    const payload = this.io.join(manifest.packagePath, 'files');
    for (const entry of manifest.entries) await this.verify(this.relative(payload, entry.path), entry);
    return manifest;
  }

  async listPackages(archiveRoot: string): Promise<ArchivePackageSummary[]> {
    const root = await this.canonicalRoot(archiveRoot);
    if (!await this.directories(root, false)) return [];
    const results: ArchivePackageSummary[] = [];
    for (const name of await this.io.list(root)) {
      if (!name.startsWith(PACKAGE_PREFIX) || !validArchiveRelativePath(name) || name.includes('/')) continue;
      const packagePath = this.io.join(root, name);
      const info = await this.io.stat(packagePath);
      if (info?.kind !== 'directory') continue;
      try {
        const manifest = await this.manifest(packagePath);
        results.push({packagePath, label: manifest.label, createdAt: manifest.createdAt,
          status: manifest.status, entryCount: manifest.entries.length, errors: manifest.errors});
      } catch (error) {results.push({packagePath, label: name, createdAt: '', status: 'invalid', entryCount: 0, errors: [message(error)]});}
    }
    return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async archiveFiles(request: ArchiveRequest): Promise<ArchiveManifest> {
    const vaultRoot = await this.canonicalRoot(request.vaultRoot), archiveRoot = await this.canonicalRoot(request.archiveRoot);
    this.disjoint(vaultRoot, archiveRoot);
    if (!await this.directories(vaultRoot, false)) throw new ArchiveOperationError('库目录不存在');
    if (!request.items.length) throw new ArchiveOperationError('没有可归档的文件');
    this.protect(request.items.map(item => item.path), request.protectedPaths);
    const entries: ArchiveEntry[] = [], paths = new Set<string>();
    // Finish every source preflight before creating an archive or trashing data.
    for (const item of request.items) {
      const source = this.relative(vaultRoot, item.path);
      if (paths.has(pathKey(item.path)) || typeof item.removeSource !== 'boolean') throw new ArchiveOperationError('归档文件重复或参数无效');
      paths.add(pathKey(item.path));
      const bytes = await this.bytes(source);
      entries.push({path: item.path, size: bytes.byteLength, sha256: await this.io.sha256(bytes), removeSource: item.removeSource, sourceRemoved: false});
    }
    await this.directories(archiveRoot, true);
    const createdAt = this.io.now();
    const packageName = PACKAGE_PREFIX + createdAt.replace(/[^0-9]/g, '') + '-' + this.io.uniqueId().replace(/[^a-z0-9-]/gi, '');
    const packagePath = this.io.join(archiveRoot, packageName);
    await this.io.mkdir(packagePath); // exclusive: an existing package is never reused.
    const manifest: ArchiveManifest = {format: 'nebula-focus-archive', version: 1, packagePath, vaultRoot,
      label: request.label.trim() || '归档', createdAt, status: 'copying', entries, errors: []};
    try {
      await this.save(manifest);
      const payload = this.io.join(packagePath, 'files');
      await this.io.mkdir(payload);
      for (const entry of entries) {
        const source = this.relative(vaultRoot, entry.path), target = this.relative(payload, entry.path);
        const bytes = await this.bytes(source);
        if (bytes.byteLength !== entry.size || await this.io.sha256(bytes) !== entry.sha256)
          throw new ArchiveOperationError(`复制期间源文件已变化：${entry.path}`);
        await this.directories(this.io.dirname(target), true);
        await this.io.writeExclusive(target, bytes);
        await this.verify(target, entry);
      }
      // A complete second pass makes trashing contingent on every copied file.
      await this.inspectPackage(packagePath);
      manifest.status = 'verified'; await this.save(manifest);
    } catch (error) {
      manifest.status = 'copy-failed'; manifest.errors.push(message(error));
      try {await this.save(manifest);} catch {/* Keep the original error; no source has been trashed. */}
      throw new ArchiveOperationError(`归档复制未完成，源文件已保留：${message(error)}`, packagePath);
    }
    for (const entry of entries) {
      if (!entry.removeSource) continue;
      try {
        await this.verify(this.relative(vaultRoot, entry.path), entry);
        await request.trashSource(entry.path);
        if (await this.io.stat(this.relative(vaultRoot, entry.path))) throw new ArchiveOperationError(`源文件仍在原位置：${entry.path}`);
        entry.sourceRemoved = true;
        await this.save(manifest);
      } catch (error) {
        manifest.status = 'partial'; manifest.errors.push(`移入回收站未完成：${entry.path}；${message(error)}`);
        try {await this.save(manifest);} catch {/* Verified payload remains independently recoverable. */}
        return manifest;
      }
    }
    manifest.status = 'archived';
    try {await this.save(manifest);}
    catch (error) {throw new ArchiveOperationError(`文件已归档，最终状态写入失败：${message(error)}`, packagePath);}
    return manifest;
  }

  async restorePackage({vaultRoot: requestedRoot, packagePath, protectedPaths}: {vaultRoot: string; packagePath: string; protectedPaths?: string[]}): Promise<{packagePath: string; restored: string[]; retained: string[]}> {
    const vaultRoot = await this.canonicalRoot(requestedRoot), packageRoot = await this.canonicalRoot(packagePath);
    this.disjoint(vaultRoot, packageRoot);
    if (!await this.directories(vaultRoot, false)) throw new ArchiveOperationError('目标库目录不存在');
    const manifest = await this.inspectPackage(packageRoot);
    this.protect(manifest.entries.map(entry => entry.path), protectedPaths);
    if (manifest.status === 'copying' || manifest.status === 'copy-failed') throw new ArchiveOperationError('未完成复制的归档不能自动恢复', packageRoot);
    const restored: string[] = [], retained: string[] = [];
    // Conflicts anywhere reject the entire attempt before writing any files.
    for (const entry of manifest.entries) {
      const target = this.relative(vaultRoot, entry.path);
      await this.directories(this.io.dirname(target), false);
      const existing = await this.io.stat(target);
      if (!existing) continue;
      if (!entry.sourceRemoved || manifest.status === 'restore-partial' && manifest.restoreVaultRoot === vaultRoot && manifest.restoredPaths?.includes(entry.path)) {
        await this.verify(target, entry); retained.push(entry.path);
      } else throw new ArchiveOperationError(`恢复目标已存在，未覆盖任何文件：${entry.path}`, packageRoot);
    }
    const previousRestored = manifest.restoreVaultRoot === vaultRoot ? manifest.restoredPaths ?? [] : [];
    try {
      for (const entry of manifest.entries) {
        if (retained.includes(entry.path)) continue;
        const target = this.relative(vaultRoot, entry.path);
        await this.directories(this.io.dirname(target), true);
        const bytes = await this.bytes(this.relative(this.io.join(packageRoot, 'files'), entry.path));
        if (bytes.byteLength !== entry.size || await this.io.sha256(bytes) !== entry.sha256)
          throw new ArchiveOperationError(`恢复期间归档内容已变化：${entry.path}`);
        await this.io.writeExclusive(target, bytes);
        restored.push(entry.path);
        await this.verify(target, entry);
      }
      // Recheck all targets, including retained shared attachments.
      for (const entry of manifest.entries) await this.verify(this.relative(vaultRoot, entry.path), entry);
      manifest.status = 'restored'; manifest.restoreVaultRoot = vaultRoot;
      manifest.restoredPaths = [...new Set([...previousRestored, ...restored])];
      await this.save(manifest);
      return {packagePath: packageRoot, restored, retained};
    } catch (error) {
      manifest.status = 'restore-partial'; manifest.restoreVaultRoot = vaultRoot;
      manifest.restoredPaths = [...new Set([...previousRestored, ...restored])];
      manifest.errors.push(`恢复未完成：${message(error)}`);
      try {await this.save(manifest);} catch {/* The archive payload is never deleted. */}
      throw new ArchiveOperationError(`恢复未完成；归档包保留，已写入 ${restored.length} 个文件：${message(error)}`, packageRoot);
    }
  }
}
