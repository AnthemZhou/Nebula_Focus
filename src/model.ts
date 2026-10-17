export interface FocusSettings {
  mobileOnly: boolean;
  readingFirst: boolean;
  quietNavigation: boolean;
  calmTypography: boolean;
  homePath: string;
  language: 'auto' | 'zh' | 'en';
}

export const DEFAULT_SETTINGS: FocusSettings = {
  mobileOnly: true, readingFirst: true, quietNavigation: true,
  calmTypography: true, homePath: '', language: 'auto',
};

export function readSettings(raw: unknown): FocusSettings {
  const result = { ...DEFAULT_SETTINGS };
  if (!raw || typeof raw !== 'object') return result;
  const value = raw as Record<string, unknown>;
  for (const key of ['mobileOnly', 'readingFirst', 'quietNavigation', 'calmTypography'] as const) {
    if (typeof value[key] === 'boolean') result[key] = value[key];
  }
  if (typeof value.homePath === 'string') result.homePath = value.homePath;
  if (value.language === 'zh' || value.language === 'en') result.language = value.language;
  return result;
}

// Only a single new name is accepted. Never interpret user input as a path.
export function childPath(folder: string, name: string, note: boolean): string {
  const clean = name.trim();
  if (!clean || clean === '.' || clean === '..' || /[\\/:*?"<>|\u0000-\u001f]/.test(clean)
      || clean.startsWith('.') || /[. ]$/.test(clean)) throw new Error('invalid-name');
  const filename = note && !clean.toLowerCase().endsWith('.md') ? `${clean}.md` : clean;
  return folder ? `${folder}/${filename}` : filename;
}

export function matchesQuery(path: string, query: string): boolean {
  const normalized = path.normalize('NFKC').toLocaleLowerCase();
  return query.normalize('NFKC').trim().toLocaleLowerCase().split(/\s+/)
    .every(part => normalized.includes(part));
}

export function parentPath(path: string): string {
  return path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
}
