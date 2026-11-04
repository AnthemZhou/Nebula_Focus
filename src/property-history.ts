type Native = any;
type Snapshot = Record<string, unknown>;
const alreadyDesired = Symbol('property-history-already-desired');

function equal(left: unknown, right: unknown, seen = new WeakMap<object, Set<object>>()): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const tag = Object.prototype.toString.call(left);
  if (tag !== Object.prototype.toString.call(right)) return false;
  if (tag === '[object Date]') return Object.is(Date.prototype.getTime.call(left), Date.prototype.getTime.call(right));
  if (tag !== '[object Object]' && tag !== '[object Array]') return false;
  if (Array.isArray(left) && left.length !== (right as unknown[]).length) return false;
  const previous = seen.get(left);
  if (previous?.has(right)) return true;
  if (previous) previous.add(right); else seen.set(left, new Set([right]));
  const keys = Object.keys(left), other = Object.keys(right);
  return keys.length === other.length && keys.every(key => Object.prototype.hasOwnProperty.call(right, key) &&
    equal((left as Snapshot)[key], (right as Snapshot)[key], seen));
}

function clone(value: unknown, seen = new WeakMap<object, unknown>()): unknown {
  if (value === null || ['undefined', 'string', 'boolean', 'number'].includes(typeof value)) return value;
  if (typeof value !== 'object') throw new Error('事务包含无法恢复的属性值');
  if (seen.has(value!)) return seen.get(value!);
  const tag = Object.prototype.toString.call(value);
  if (tag === '[object Date]') return new Date(Date.prototype.getTime.call(value));
  if (tag !== '[object Object]' && tag !== '[object Array]') throw new Error('事务包含无法恢复的属性值');
  const result: Native = Array.isArray(value) ? new Array(value.length) : {};
  seen.set(value!, result);
  for (const key of Object.keys(value!)) Object.defineProperty(result, key, {
    value: clone((value as Snapshot)[key], seen), enumerable: true, configurable: true, writable: true,
  });
  return result;
}

function snapshot(value: unknown): Snapshot {
  if (!value || Object.prototype.toString.call(value) !== '[object Object]') throw new Error('事务属性快照无效');
  return clone(value) as Snapshot;
}

/** Restore complete frontmatter snapshots through the native file manager.
 * The caller owns stacks and transaction ownership; this function never moves
 * a stack, changes view state, or reads/writes Markdown body text.
 */
export async function applyPropertyTransaction(app: Native, _view: Native, transaction: Native, redo: boolean): Promise<void> {
  const action = redo ? '重做' : '撤销';
  if (!Array.isArray(transaction?.changes)) throw new Error(`无法${action}：事务记录无效。`);
  const resolver = typeof app?.vault?.getFileByPath === 'function' ? app.vault.getFileByPath : app?.vault?.getAbstractFileByPath;
  if (typeof resolver !== 'function' || typeof app?.fileManager?.processFrontMatter !== 'function')
    throw new Error(`无法${action}：原生属性恢复接口不可用。`);
  let changes: {file: Native; path: string; expected: Snapshot; desired: Snapshot}[];
  try {
    changes = transaction.changes.map((change: Native) => ({file: change.file, path: change.file?.path,
      expected: snapshot(redo ? change.start : change.end), desired: snapshot(redo ? change.end : change.start)}));
  } catch {throw new Error(`无法${action}：事务属性快照无效，已保留操作记录。`);}

  // Keep the native transaction's ordering, and stop immediately on failure.
  // Completed changes are recognised by their full desired snapshot on retry.
  for (const {file, path, expected, desired} of changes) {
    const failure = (reason: string) => new Error(`无法${action}“${path || '此笔记'}”：${reason}`);
    const assertFile = () => {
      if (file?.extension !== 'md') throw failure('仅支持 Markdown 笔记。');
      if (!path || file.path !== path || resolver.call(app.vault, path) !== file)
        throw failure('原笔记已删除、移动或被替换，未修改其他文件。');
    };
    assertFile();
    let visited = false;
    let guardError: Error | undefined;
    try {
      await app.fileManager.processFrontMatter(file, (current: Snapshot) => {
        visited = true;
        try {
          assertFile();
          if (equal(current, desired)) throw alreadyDesired;
          if (!equal(current, expected)) throw failure('属性已被其他操作修改，未覆盖现有内容。');
        } catch (error) {
          if (error !== alreadyDesired) guardError = error as Error;
          throw error;
        }
        // Object.assign alone cannot undo a newly added property. Delete all
        // keys absent from the desired snapshot, then assign own properties.
        // defineProperty also safely restores a literal "__proto__" YAML key.
        for (const key of Object.keys(current)) if (!Object.prototype.hasOwnProperty.call(desired, key)) delete current[key];
        const restored = clone(desired) as Snapshot;
        for (const key of Object.keys(restored)) Object.defineProperty(current, key, {
          value: restored[key], enumerable: true, configurable: true, writable: true,
        });
      });
      if (!visited) throw failure('原生属性恢复未执行，已保留操作记录。');
      assertFile();
    } catch (error) {
      // Aborting the native callback also avoids an unnecessary YAML rewrite
      // when a previous attempt already restored this file successfully.
      if (error === alreadyDesired) continue;
      if (guardError) throw guardError;
      throw new Error(`无法${action}“${path}”：属性恢复未完成，已保留操作记录，可重试。`, {cause: error});
    }
  }
}
