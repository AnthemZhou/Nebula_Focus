import {tableProfile} from './table-profile';

/** Native layout options save simple view-level settings in the .base file. */
export function tableContentOptions(options: unknown, config: unknown): unknown {
  const profile = tableProfile(config);
  if (!profile || !Array.isArray(options)) return options;
  const hasScopeOption = (items: unknown[]): boolean => items.some(option => {
    if (!option || typeof option !== 'object') return false;
    const value = option as Record<string, unknown>;
    return value.key === 'nebulaScopeNote' ||
      (value.type === 'group' && Array.isArray(value.items) && hasScopeOption(value.items));
  });
  let scopeAdded = hasScopeOption(options);
  const scope = {type: 'text', key: 'nebulaScopeNote', displayName: '视图说明', default: profile.scopeNote ?? ''};
  const rewrite = (items: unknown[]): unknown[] => {
    const result: unknown[] = [];
    for (const option of items) {
      if (!option || typeof option !== 'object') {result.push(option); continue;}
      const value = option as Record<string, unknown>;
      if (value.key === 'rowHeight') {
        result.push({type: 'dropdown', key: 'nebulaRowMode', displayName: '内容显示',
          default: profile.wrap ? 'wrap' : 'clip', options: {wrap: '自动换行 · 完整显示', clip: '单行折叠'}});
        if (!scopeAdded) {result.push(scope); scopeAdded = true;}
      } else if (value.type === 'group' && Array.isArray(value.items)) result.push({...value, items: rewrite(value.items)});
      else result.push(option);
    }
    return result;
  };
  const result = rewrite(options);
  if (!scopeAdded) result.push(scope);
  return result;
}
