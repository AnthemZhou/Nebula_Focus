import {parseYaml, stringifyYaml, normalizePath, type Vault} from 'obsidian';
import {convertFinanceBase} from './finance-native';

export type MigrationResult = {converted: string[]; failed: string[]};

/** Upgrade only the retired finance layout. Notes and user-created native views
 * are untouched. A recoverable original is saved before the atomic Base edit. */
export async function migrateFinanceBases(vault: Vault, pluginId: string): Promise<MigrationResult> {
  const result: MigrationResult = {converted: [], failed: []};
  const folder = normalizePath(`${vault.configDir}/plugins/${pluginId}/backups/native-tables`);
  const ensureFolder = async (path: string) => {
    let current = '';
    for (const part of path.split('/')) {
      current = current ? `${current}/${part}` : part;
      if (!await vault.adapter.exists(current)) await vault.adapter.mkdir(current);
    }
  };
  for (const file of vault.getFiles()) {
    if (file.extension !== 'base') continue;
    let relevant = false;
    try {
      const original = await vault.read(file);
      // Do not parse or reserialize unrelated Bases, including malformed ones.
      if (!original.includes('nebula-finance')) continue;
      relevant = true;
      const converted = convertFinanceBase(parseYaml(original));
      if (!converted) {result.failed.push(file.path); continue;}
      if (!converted.changed) continue;
      await ensureFolder(folder);
      let index = 0;
      let backup: string;
      do {backup = `${folder}/${Date.now()}-${index++}.json`;} while (await vault.adapter.exists(backup));
      await vault.adapter.write(backup, JSON.stringify({path: file.path, content: original}, null, 2));
      let changed = false;
      await vault.process(file, current => {
        if (current !== original) return current;
        changed = true;
        return stringifyYaml(converted.data);
      });
      if (changed) result.converted.push(file.path);
      else result.failed.push(file.path); // Concurrent edit: leave the newer data alone.
    } catch {
      if (relevant) result.failed.push(file.path);
    }
  }
  return result;
}
