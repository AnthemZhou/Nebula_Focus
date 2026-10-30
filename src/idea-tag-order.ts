/** Optional plugin-data adapter. This never reads or writes a note or Base. */
export interface IdeaTagOrderStore {
  read(key: string): readonly string[] | undefined;
  write(key: string, values: string[]): void | Promise<void>;
}

export function cleanTagOrder(values: unknown): string[] {
  return Array.isArray(values) ? [...new Set(values.filter((value): value is string =>
    typeof value === 'string' && value.length > 0))] : [];
}

/** An actual .base file identifies all its embedded and independent views.
 * Inline Bases fall back to their containing note plus view name. */
export function ideaTagOrderKey(view: any, property: string): string | null {
  const file = view?.config?.query?.file;
  const path = typeof file === 'string' ? file : file?.path;
  if (typeof path === 'string' && path) return JSON.stringify([path, property]);
  const controller = view?.queryController;
  let source: unknown;
  try {source = typeof controller?.sourcePath === 'function' ? controller.sourcePath() : controller?.sourcePath;} catch { /* Unsupported controller. */ }
  source ||= controller?.currentFile?.path;
  return typeof source === 'string' && source
    ? JSON.stringify([source, view?.config?.name ?? '', property]) : null;
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
