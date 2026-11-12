import {tableProfile} from './table-profile';

type RecordValue = Record<string, unknown>;
function record(value: unknown): value is RecordValue {return !!value && typeof value === 'object';}
function callable(value: unknown): value is (...args: unknown[]) => unknown {return typeof value === 'function';}
function readOnly(value: unknown): boolean {return record(value) && (value.isReadOnly === true || value.readOnly === true);}
function closestReadOnly(value: unknown): boolean {
  return record(value) && callable(value.closest) && !!value.closest.call(value, READ_ONLY);
}
function validSort(value: unknown): value is Sort {
  return record(value) && typeof value.property === 'string' &&
    typeof value.direction === 'string' && ['ASC', 'DESC'].includes(value.direction);
}
type Sort = {property: string; direction: string; [key: string]: unknown};
const READ_ONLY = '[disabled], [aria-disabled="true"], [aria-readonly="true"], [data-readonly="true"], .is-read-only, .is-readonly, .mod-readonly';

/** Append an oldest-first tiebreaker to this external Base's existing sort.
 * true means the native save callback accepted the change; false means skipped.
 * Obsidian 1.14.5 schedules disk writes without returning their completion, so
 * this cannot promise that the queued write has reached disk. No note is written.
 */
export async function ensureCreationOrder(view: unknown): Promise<boolean> {
  if (!record(view) || !record(view.config) || !record(view.config.query)) return false;
  const config = view.config, query = view.config.query, controller = view.queryController;
  if (view.type !== 'table' || !tableProfile(view) || view._loaded === false ||
      !callable(config.getSort) || !callable(query.saveFn)) return false;
  if ([view, config, query, controller].some(readOnly)) return false;
  if (closestReadOnly(view.containerEl) || closestReadOnly(view.theadEl)) return false;
  const path = typeof query.file === 'string' ? query.file : record(query.file) ? query.file.path : undefined;
  // Inline Bases can save their configuration into the containing Markdown.
  // Require the native query's own external .base identity, not sourcePath:
  // sourcePath often points to the Markdown note embedding an external Base.
  if (typeof path !== 'string' || !/\.base$/i.test(path) || /^(?:[a-z]+:|\/)/i.test(path)) return false;
  const current: unknown = config.getSort();
  if (!Array.isArray(current) || !current.every(validSort)) return false;
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
