import {Platform} from 'obsidian';
import type {ArchiveIO} from './external-archive';
declare const require: (id: string) => unknown;

/** Call only after the host's desktop guard. No Node modules load at import. */
export function createNodeArchiveIO(): ArchiveIO {
  if (!Platform.isDesktop) throw new Error('外部归档仅适用于桌面');
  const fs = require('node:fs/promises') as typeof import('node:fs/promises');
  const path = require('node:path') as typeof import('node:path');
  const crypto = require('node:crypto') as typeof import('node:crypto');
  const constants = (require('node:fs') as typeof import('node:fs')).constants;
  return {
    resolve: value => path.resolve(value), join: (...parts) => path.join(...parts),
    dirname: value => path.dirname(value), relative: (from, to) => path.relative(from, to), isAbsolute: value => path.isAbsolute(value),
    realpath: value => fs.realpath(value),
    async stat(value) {
      try {
        const info = await fs.lstat(value);
        return {kind: info.isSymbolicLink() ? 'symlink' : info.isFile() ? 'file' : info.isDirectory() ? 'directory' : 'other', size: info.size};
      } catch (error) {if ((error as {code?: string}).code === 'ENOENT') return null; throw error;}
    },
    async mkdir(value) {await fs.mkdir(value, {mode: 0o700});},
    list: value => fs.readdir(value),
    async read(value) {
      const handle = await fs.open(value, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      try {return new Uint8Array(await handle.readFile());} finally {await handle.close();}
    },
    async writeExclusive(value, data) {
      const handle = await fs.open(value, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0), 0o600);
      try {await handle.writeFile(data); await handle.sync();} finally {await handle.close();}
    },
    async replace(value, data) {
      const temp = path.join(path.dirname(value), '.' + path.basename(value) + '-' + crypto.randomUUID() + '.tmp');
      const handle = await fs.open(temp, 'wx', 0o600);
      try {await handle.writeFile(data); await handle.sync();}
      catch (error) {await handle.close(); await fs.unlink(temp).catch(() => {}); throw error;}
      await handle.close();
      try {await fs.rename(temp, value);} catch (error) {await fs.unlink(temp).catch(() => {}); throw error;}
    },
    async sha256(data) {return crypto.createHash('sha256').update(data).digest('hex');},
    uniqueId: () => crypto.randomUUID(), now: () => new Date().toISOString(),
  };
}

export function defaultArchiveDirectory(vaultName: string): string {
  if (!Platform.isDesktop) throw new Error('外部归档仅适用于桌面');
  const path = require('node:path') as typeof import('node:path');
  const os = require('node:os') as typeof import('node:os');
  const printable = [...vaultName].map(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127 ? '-' : character).join('');
  const safe = printable.replace(/[\\/<>:"|?*]/g, '-').trim().replace(/^\.+|\.+$/g, '').trim().slice(0, 120) || 'Vault';
  return path.join(os.homedir(), 'Documents', 'Nebula Focus Archives', safe);
}
