/** Recovery drafts are separate from note contents and must never evict each other. */
export interface RecoveryDraft {
  id: string;
  base: string;
  kind: string;
  value: string;
  start?: number;
  end?: number;
  index?: number;
  createdAt: number;
  updatedAt?: number;
}

export interface DraftStorage {
  loadLocalStorage(key: string): unknown;
  saveLocalStorage(key: string, value: unknown): void;
}

interface DraftEnvelope { version: 2; drafts: RecoveryDraft[]; }
export const MAX_RECOVERY_DRAFTS = 20;

export class DraftStoreError extends Error {
  constructor(readonly code: 'invalid' | 'full' | 'read' | 'write', message: string) {
    super(message);
    this.name = 'DraftStoreError';
  }
}

let sequence = 0;
/** One ID per editing session, retained while that session's draft changes. */
export function createDraftId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `draft-${Date.now().toString(36)}-${(++sequence).toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function invalid(): never {
  throw new DraftStoreError('invalid', '恢复草稿缓存格式异常，原缓存未被覆盖。');
}

function record(value: unknown): RecoveryDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const draft = value as Record<string, unknown>;
  if (typeof draft.id !== 'string' || !draft.id || typeof draft.base !== 'string' ||
      typeof draft.kind !== 'string' || !draft.kind || typeof draft.value !== 'string' ||
      typeof draft.createdAt !== 'number' || !Number.isFinite(draft.createdAt) || draft.createdAt < 0) return invalid();
  for (const key of ['start', 'end', 'index'] as const) {
    if (draft[key] !== undefined && (typeof draft[key] !== 'number' || !Number.isSafeInteger(draft[key]) || draft[key] < 0)) return invalid();
  }
  if (typeof draft.start === 'number' && typeof draft.end === 'number' && draft.end < draft.start) return invalid();
  if (draft.updatedAt !== undefined && (typeof draft.updatedAt !== 'number' || !Number.isFinite(draft.updatedAt) || draft.updatedAt < 0)) return invalid();
  const result: RecoveryDraft = { id: draft.id, base: draft.base, kind: draft.kind, value: draft.value, createdAt: draft.createdAt };
  for (const key of ['start', 'end', 'index', 'updatedAt'] as const) {
    if (draft[key] !== undefined) result[key] = draft[key] as number;
  }
  return result;
}

/**
 * Uses the existing per-file storage key. Each operation reads the latest envelope,
 * so independent FocusPage instances do not overwrite one another's cached copies.
 * Reads migrate legacy records in memory; only explicit mutations write storage.
 */
export class DraftStore {
  constructor(private storage: DraftStorage) {}

  list(key: string): RecoveryDraft[] {
    let raw: unknown;
    try { raw = this.storage.loadLocalStorage(key); }
    catch { throw new DraftStoreError('read', '无法读取恢复草稿，原缓存未被覆盖。'); }
    if (raw === null || raw === undefined) return [];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return invalid();
    const value = raw as Record<string, unknown>;
    let drafts: RecoveryDraft[];
    if (value.version === 2) {
      if (!Array.isArray(value.drafts)) return invalid();
      drafts = value.drafts.map(record);
      if (new Set(drafts.map(draft => draft.id)).size !== drafts.length) return invalid();
    } else if (value.version === undefined && typeof value.base === 'string' && typeof value.value === 'string') {
      // Older versions did not record timestamps; zero means the date is unknown.
      drafts = [record({ ...value, id: 'legacy-v1', kind: typeof value.kind === 'string' && value.kind ? value.kind : 'block', createdAt: 0 })];
    } else return invalid();
    return drafts.sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt));
  }

  upsert(key: string, value: RecoveryDraft): RecoveryDraft {
    const next = record(value), drafts = this.list(key);
    const index = drafts.findIndex(draft => draft.id === next.id);
    if (index < 0 && drafts.length >= MAX_RECOVERY_DRAFTS) {
      throw new DraftStoreError('full', `已保留 ${MAX_RECOVERY_DRAFTS} 份恢复草稿。请先复制或删除其中一份；当前输入尚未加入缓存。`);
    }
    if (index >= 0) {
      next.createdAt = drafts[index].createdAt;
      drafts[index] = next;
    } else drafts.push(next);
    this.write(key, drafts);
    return { ...next };
  }

  /** Optional expected content prevents a delayed save from clearing a newer draft. */
  remove(key: string, id: string, expected?: Pick<RecoveryDraft, 'base' | 'kind' | 'value'>): boolean {
    const drafts = this.list(key), target = drafts.find(draft => draft.id === id);
    if (!target || (expected && (target.base !== expected.base || target.kind !== expected.kind || target.value !== expected.value))) return false;
    this.write(key, drafts.filter(draft => draft.id !== id));
    return true;
  }

  private write(key: string, drafts: RecoveryDraft[]): void {
    const value: DraftEnvelope | null = drafts.length ? { version: 2, drafts } : null;
    try { this.storage.saveLocalStorage(key, value); }
    catch { throw new DraftStoreError('write', '无法保存恢复草稿，请保持页面打开并保存笔记。'); }
  }
}
