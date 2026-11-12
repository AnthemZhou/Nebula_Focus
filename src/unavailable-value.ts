/** Imported missing-result metadata must never hide a subsequently entered value. */
export function isUnavailableValue(value: unknown): boolean {
  return value == null || (typeof value === 'string' &&
    (!value.trim() || value.trim().startsWith('formulaResult://'))) ||
    (Array.isArray(value) && value.length === 0);
}
