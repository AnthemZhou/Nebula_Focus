import type {TableProfile} from './table-profile';

// Explicit presentation hints; ordinary text is never inferred as a select.
const CLASSIFICATIONS = new Set(['领域', '类型', '重要性', '状态', '优先级', '分类', '发布平台', '内容类型',
  'status', 'type', 'priority', 'area', 'domain', 'category', 'platform', 'content type', 'content_type']);
const RELATIONS = new Set(['项目', '关联项目', '使用镜头', 'project', 'projects']);

export function semanticProperty(raw: string): 'classification' | 'relation' | null {
  const key = raw.replace(/^note\./, '').normalize('NFC').trim().toLowerCase();
  return CLASSIFICATIONS.has(key) ? 'classification' : RELATIONS.has(key) ? 'relation' : null;
}

function presentationProperty(profile: TableProfile | null, property: string): profile is TableProfile {
  if (!profile || !property.startsWith('note.')) return false;
  const name = property.slice(5);
  return name !== profile.titleProperty && !profile.attachments.includes(name);
}

export const RELATION_LINK_SELECTOR = '.internal-link, .external-link, .metadata-link-inner';

export function containsRelationLink(element: ParentNode): boolean {
  return !!element.querySelector(RELATION_LINK_SELECTOR);
}

/** Native metadata values can be nested list wrappers. Inspect values, not
 * the first rendered row, so empty or virtualized cells cannot change a column. */
export function isRelationValue(value: unknown): boolean {
  if (typeof value === 'string') return /^\[\[.+\]\]$/.test(value.trim());
  if (Array.isArray(value)) return value.some(isRelationValue);
  if (value && typeof value === 'object' && 'data' in value) return isRelationValue(value.data);
  return false;
}

/** Classification labels and related pages deliberately use separate visuals. */
export function isTableTagProperty(profile: TableProfile | null, property: string): boolean {
  return presentationProperty(profile, property) &&
    (Object.hasOwn(profile.tags, property.slice(5)) || semanticProperty(property) === 'classification');
}

/** Include explicit relationship fields even while their first row is empty. */
export function isTableRelationProperty(profile: TableProfile | null, property: string, cell?: ParentNode, linkedValues = false): boolean {
  return presentationProperty(profile, property) &&
    (semanticProperty(property) === 'relation' || linkedValues || !!cell && containsRelationLink(cell));
}
