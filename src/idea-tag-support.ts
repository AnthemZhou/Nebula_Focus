type Native = any;

export const IDEA_TAG_READ_ONLY = '[disabled], [aria-disabled="true"], [aria-readonly="true"], [data-readonly="true"], ' +
  '[hidden], .is-disabled, .disabled, .is-read-only, .is-readonly, .mod-readonly';

export function readIdeaTagValues(value: unknown, property: string): string[] | null {
  if (!['领域', '类型', '重要性'].includes(property)) return null;
  if (value == null) return [];
  if (property === '领域') {
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) return null;
    return [...new Set(value.filter(item => item.length > 0))];
  }
  return typeof value === 'string' ? value ? [value] : [] : null;
}

/** Shared by live pickers and inert row measurements. Connection/visibility
 * checks belong to the live editor; detached native measurement rows are valid. */
export function supportsIdeaTagCell(view: Native, cell: Native, property: string, anchor: HTMLElement): boolean {
  const entry = cell?.renderer?.entry;
  if (view?._loaded === false || view?.isReadOnly === true || view?.readOnly === true ||
      view?.queryController?.view !== view || view?.queryController?.isReadOnly === true ||
      view?.type !== 'table' || view?.config?.name !== '想法收集箱' ||
      typeof view?.updateProperty !== 'function' || !cell?.renderer?.propertyEditor ||
      entry?.file?.extension !== 'md' || typeof entry.getRawProperty !== 'function' ||
      anchor.dataset.property !== `note.${property}` || anchor.closest(IDEA_TAG_READ_ONLY) ||
      anchor.querySelector(`.bases-table-cell:is(${IDEA_TAG_READ_ONLY})`)) return false;
  try {return readIdeaTagValues(entry.getRawProperty(property), property) !== null;} catch {return false;}
}
