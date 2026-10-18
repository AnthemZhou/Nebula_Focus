/** A logical caret survives DOM replacement while keeping history independent of the UI. */
export interface CaretAnchor {
  readonly kind: 'title' | 'block';
  readonly start?: number;
  readonly offset: number;
}

/** The complete source strings are intentional: undo must restore every original byte. */
export interface SourceTransaction {
  readonly before: string;
  readonly after: string;
  readonly beforeCaret?: CaretAnchor;
  readonly afterCaret?: CaretAnchor;
}

export interface HistoryOptions {
  /** Maximum transactions retained for each file. Zero disables history. */
  maxEntries?: number;
  /** Maximum combined UTF-8 source bytes across all files. Zero disables history. */
  maxBytes?: number;
}

interface Entry { transaction: SourceTransaction; bytes: number }
interface FileHistory { undo: Entry[]; redo: Entry[]; bytes: number }

function limit(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('History limits must be non-negative safe integers.');
  return value;
}

function snapshot(transaction: SourceTransaction): SourceTransaction {
  const anchor = (caret: CaretAnchor | undefined) => caret && Object.freeze({ ...caret });
  return Object.freeze({
    before: transaction.before,
    after: transaction.after,
    beforeCaret: anchor(transaction.beforeCaret),
    afterCaret: anchor(transaction.afterCaret),
  });
}

/** In-memory history. The caller changes stacks only after its source write succeeds. */
export class EditHistory {
  private readonly files = new Map<string, FileHistory>();
  private readonly encoder = new TextEncoder();
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private bytes = 0;

  constructor(options: HistoryOptions = {}) {
    this.maxEntries = limit(options.maxEntries, 60);
    this.maxBytes = limit(options.maxBytes, 4 * 1024 * 1024);
  }

  /** Returns false for an unchanged source or an edit too large to retain. */
  push(fileKey: string, transaction: SourceTransaction): boolean {
    let history = this.files.get(fileKey);
    const head = history?.undo[history.undo.length - 1]?.transaction.after
      ?? history?.redo[history.redo.length - 1]?.transaction.before;
    if (head !== undefined && head !== transaction.before) {
      // A different writer changed the source. Never undo across that boundary.
      this.reset(fileKey);
      history = undefined;
    }
    if (transaction.before === transaction.after) return false;

    const bytes = this.encoder.encode(transaction.before).byteLength + this.encoder.encode(transaction.after).byteLength;
    if (!this.maxEntries || bytes > this.maxBytes) {
      // Skipping this edit while retaining earlier edits would make undo unsafe.
      this.reset(fileKey);
      return false;
    }
    if (!history) {
      history = { undo: [], redo: [], bytes: 0 };
      this.files.set(fileKey, history);
    }
    this.clearRedo(fileKey);
    history.undo.push({ transaction: snapshot(transaction), bytes });
    history.bytes += bytes;
    this.bytes += bytes;
    while (history.undo.length > this.maxEntries) this.removeOldest(history);
    this.touch(fileKey, history);

    // Prefer the active file; evict older files before shortening its recent history.
    while (this.bytes > this.maxBytes && this.files.size > 1) {
      const oldest = this.files.keys().next().value;
      if (oldest !== undefined) this.reset(oldest);
    }
    while (this.bytes > this.maxBytes && history.undo.length) this.removeOldest(history);
    return true;
  }

  peekUndo(fileKey: string): SourceTransaction | undefined {
    const undo = this.files.get(fileKey)?.undo;
    return undo?.[undo.length - 1]?.transaction;
  }

  peekRedo(fileKey: string): SourceTransaction | undefined {
    const redo = this.files.get(fileKey)?.redo;
    return redo?.[redo.length - 1]?.transaction;
  }

  markUndone(fileKey: string): SourceTransaction | undefined {
    const history = this.files.get(fileKey);
    const entry = history?.undo.pop();
    if (!history || !entry) return undefined;
    history.redo.push(entry);
    this.touch(fileKey, history);
    return entry.transaction;
  }

  markRedone(fileKey: string): SourceTransaction | undefined {
    const history = this.files.get(fileKey);
    const entry = history?.redo.pop();
    if (!history || !entry) return undefined;
    history.undo.push(entry);
    this.touch(fileKey, history);
    return entry.transaction;
  }

  clearRedo(fileKey: string): void {
    const history = this.files.get(fileKey);
    if (!history) return;
    const removed = history.redo.reduce((total, entry) => total + entry.bytes, 0);
    history.redo = [];
    history.bytes -= removed;
    this.bytes -= removed;
    if (!history.undo.length) this.files.delete(fileKey);
  }

  reset(fileKey: string): void {
    const history = this.files.get(fileKey);
    if (history) this.bytes -= history.bytes;
    this.files.delete(fileKey);
  }

  private touch(fileKey: string, history: FileHistory): void {
    this.files.delete(fileKey);
    this.files.set(fileKey, history);
  }

  private removeOldest(history: FileHistory): void {
    const entry = history.undo.shift();
    if (!entry) return;
    history.bytes -= entry.bytes;
    this.bytes -= entry.bytes;
  }
}
