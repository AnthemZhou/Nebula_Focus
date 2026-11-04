type Native = any;
type Sort = {property: string; direction: string; [key: string]: unknown};
const READ_ONLY = '[disabled], [aria-disabled="true"], [aria-readonly="true"], [data-readonly="true"], .is-read-only, .is-readonly, .mod-readonly';

/** Append an oldest-first tiebreaker to this external Base's existing sort.
 * true means the native save callback accepted the change; false means skipped.
 * Obsidian 1.14.5 schedules disk writes without returning their completion, so
 * this cannot promise that the queued write has reached disk. No note is written.
 */
export async function ensureCreationOrder(view: Native): Promise<boolean> {
  const config = view?.config, query = config?.query, controller = view?.queryController;
  if (view?.type !== 'table' || config?.name !== '想法收集箱' || view?._loaded === false ||
      typeof config.getSort !== 'function' || typeof query?.saveFn !== 'function') return false;
  if ([view, config, query, controller].some(target => target?.isReadOnly === true || target?.readOnly === true)) return false;
  if (view.containerEl?.closest?.(READ_ONLY) || view.theadEl?.closest?.(READ_ONLY)) return false;
  const path = typeof query.file === 'string' ? query.file : query.file?.path;
  // Inline Bases can save their configuration into the containing Markdown.
  // Require the native query's own external .base identity, not sourcePath:
  // sourcePath often points to the Markdown note embedding an external Base.
  if (typeof path !== 'string' || !/\.base$/i.test(path) || /^(?:[a-z]+:|\/)/i.test(path)) return false;
  const current: unknown = config.getSort();
  if (!Array.isArray(current) || current.some(item => !item || typeof item.property !== 'string' ||
      !['ASC', 'DESC'].includes(item.direction))) return false;
  if (current.some(item => item.property === 'file.ctime')) return false;
  const previous = Object.getOwnPropertyDescriptor(config, 'sort');
  if (previous && (!('value' in previous) || previous.writable === false)) return false;
  if (!previous && !Object.isExtensible(config)) return false;
  const next: Sort[] = [...current, {property: 'file.ctime', direction: 'ASC'}];
  const snapshot = JSON.stringify(next);
  config.sort = next;
  try {
    // query.save() in 1.14.5 discards saveFn's return value. Invoke its exact
    // callback with the same receiver and query argument so Promise errors from
    // supported implementations can also be caught and rolled back.
    await query.saveFn.call(query, query);
    return true;
  } catch (error) {
    // Do not overwrite a newer user sort arriving during an asynchronous save.
    if (config.sort === next && JSON.stringify(next) === snapshot) {
      if (previous) Object.defineProperty(config, 'sort', previous);
      else delete config.sort;
    }
    throw error;
  }
}
