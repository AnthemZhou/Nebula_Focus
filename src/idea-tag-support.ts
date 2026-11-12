import {isIdeaViewMetadata, isIdeaCell} from './idea-native';
import {tableProfile} from './table-profile';
import {containsRelationLink} from './semantic-property';

export const IDEA_TAG_READ_ONLY = '[disabled], [aria-disabled="true"], [aria-readonly="true"], [data-readonly="true"], ' +
  '[hidden], .is-disabled, .disabled, .is-read-only, .is-readonly, .mod-readonly';

export function readIdeaTagValues(value: unknown, mode?: 'single' | 'multi'): string[] | null {
  if (mode !== 'single' && mode !== 'multi') return null;
  if (value == null) return [];
  if (mode === 'multi') {
    if (!Array.isArray(value)) return null;
    const values: unknown[] = value;
    if (!values.every((item): item is string => typeof item === 'string')) return null;
    return [...new Set(values.filter(item => item.length > 0))];
  }
  return typeof value === 'string' ? value ? [value] : [] : null;
}

/** Shared by live pickers and inert row measurements. Connection/visibility
 * checks belong to the live editor; detached native measurement rows are valid. */
export function supportsIdeaTagCell(view: unknown, cell: unknown, property: string, anchor: HTMLElement): boolean {
  if (!isIdeaViewMetadata(view) || !isIdeaCell(cell)) return false;
  const mode = tableProfile(view)?.tags[property];
  if (mode !== 'single' && mode !== 'multi') return false;
  const entry = cell.renderer?.entry;
  if (view?._loaded === false || view?.isReadOnly === true || view?.readOnly === true ||
      view?.queryController?.view !== view || view?.queryController?.isReadOnly === true ||
      view?.type !== 'table' ||
      typeof view?.updateProperty !== 'function' || !cell?.renderer?.propertyEditor ||
      entry?.file?.extension !== 'md' || typeof entry.getRawProperty !== 'function' ||
      anchor.dataset.property !== `note.${property}` || containsRelationLink(anchor) || anchor.closest(IDEA_TAG_READ_ONLY) ||
      anchor.querySelector(`.bases-table-cell:is(${IDEA_TAG_READ_ONLY})`)) return false;
  try {
    const values = readIdeaTagValues(entry.getRawProperty(property), mode);
    return values !== null && !values.some(value => /^\[\[.+\]\]$/.test(value.trim()));
  } catch {return false;}
}
