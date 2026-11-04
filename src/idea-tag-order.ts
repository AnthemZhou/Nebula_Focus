import {object} from './idea-native';
/** Optional plugin-data adapter. This never reads or writes a note or Base. */
export interface IdeaTagOrderStore {
  read(key: string): readonly string[] | undefined;
  write(key: string, values: string[]): void | Promise<void>;
  readOptions?(key: string): {added?: unknown; hidden?: unknown} | undefined;
  writeOptions?(key: string, options: IdeaTagOptions): void | Promise<void>;
}
export type IdeaTagOptions = {order: string[]; added: string[]; hidden: string[]};

export function cleanTagOrder(values: unknown): string[] {
  return Array.isArray(values) ? [...new Set(values.filter((value): value is string =>
    typeof value === 'string' && value.length > 0))] : [];
}

/** An actual .base file identifies all its embedded and independent views.
 * Inline Bases fall back to their containing note plus view name. */
export function ideaTagOrderKey(view: unknown, property: string): string | null {
  if (!object(view)) return null;
  const config = object(view.config) ? view.config : undefined;
  const query = object(config?.query) ? config.query : undefined;
  const file = query?.file;
  const path = typeof file === 'string' ? file : object(file) ? file.path : undefined;
  if (typeof path === 'string' && path) return JSON.stringify([path, property]);
  const controller = object(view.queryController) ? view.queryController : undefined;
  let source: unknown;
  try {source = typeof controller?.sourcePath === 'function' ? (controller.sourcePath as () => unknown).call(controller) : controller?.sourcePath;} catch { /* Unsupported controller. */ }
  source ||= object(controller?.currentFile) ? controller.currentFile.path : undefined;
  return typeof source === 'string' && source
    ? JSON.stringify([source, config?.name ?? '', property]) : null;
}

export function applyTagOrder(values: readonly string[], order: readonly string[]): string[] {
  const remaining = new Set(values), result: string[] = [];
  for (const value of order) if (remaining.delete(value)) result.push(value);
  return [...result, ...remaining];
}

/** Preserve slots for options currently absent from the query (for example a
 * filtered Base). Reordering the visible candidates must not forget them. */
export function mergeTagOrder(saved: readonly string[], visible: readonly string[], next: readonly string[]): string[] {
  const full = cleanTagOrder([...saved, ...visible]), visibleSet = new Set(visible);
  const validNext = cleanTagOrder(next);
  if (validNext.length !== visibleSet.size || validNext.some(value => !visibleSet.has(value))) return full;
  let index = 0;
  return full.map(value => visibleSet.has(value) ? validNext[index++] : value);
}
