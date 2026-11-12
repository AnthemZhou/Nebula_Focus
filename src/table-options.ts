import {tableProfile} from './table-profile';

/** Replace only the native fixed-height setting on explicitly enhanced tables. */
export function tableContentOptions(options: unknown, config: unknown): unknown {
  const profile = tableProfile(config);
  if (!profile || !Array.isArray(options)) return options;
  return options.map((option: unknown): unknown => {
    if (!option || typeof option !== 'object') return option;
    const value = option as Record<string, unknown>;
    if (value.key === 'rowHeight') return {type: 'dropdown', key: 'nebulaRowMode', displayName: '内容显示',
      default: profile.wrap ? 'wrap' : 'clip', options: {wrap: '自动换行 · 完整显示', clip: '单行折叠'}};
    if (value.type === 'group' && Array.isArray(value.items)) return {...value, items: tableContentOptions(value.items, config)};
    return option;
  });
}
