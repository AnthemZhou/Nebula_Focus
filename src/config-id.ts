type ConfigCrypto = {
  randomUUID?: () => string;
  getRandomValues?: (values: Uint8Array) => Uint8Array;
};
let sequence = 0;

/** Identifiers for configuration files and UI modules, never credentials or
 * security tokens. Some mobile WebViews expose getRandomValues without UUIDs. */
export function configId(source: ConfigCrypto | undefined = typeof crypto === 'undefined' ? undefined : crypto): string {
  try {if (typeof source?.randomUUID === 'function') return source.randomUUID();}
  catch {/* A restricted WebView may expose a method it cannot execute. */}
  const bytes = new Uint8Array(16);
  let random = false;
  try {
    if (typeof source?.getRandomValues === 'function') {source.getRandomValues(bytes); random = true;}
  } catch {/* Non-security configuration IDs also work without Web Crypto. */}
  if (!random) {
    for (let index = 0; index < bytes.length; index++) bytes[index] = Math.floor(Math.random() * 256);
    let time = Date.now();
    for (let index = 5; index >= 0; index--) {bytes[index] = time % 256; time = Math.floor(time / 256);}
    // Retain uniqueness within this process even with a coarse clock or a
    // deterministic random source; vault.create still refuses path collisions.
    let serial = sequence = (sequence + 1) >>> 0;
    for (let index = 15; index >= 12; index--) {bytes[index] = serial % 256; serial >>>= 8;}
  }
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
