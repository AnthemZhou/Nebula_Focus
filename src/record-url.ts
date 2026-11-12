/** Presentation-only URL helpers. Queries/signatures remain in navigation hrefs, never visible labels. */
export function recordUrl(raw: string): {href: string; label: string; title: string} | null {
  let url: URL;
  try {url = new URL(raw);} catch {return null;}
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  const decode = (text: string) => {try {return decodeURIComponent(text);} catch {return text;}};
  const safePath = Array.from(decode(url.pathname)).filter(character => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127).join('').split(/[?#]/)[0];
  const filename = safePath.split('/').filter(Boolean).pop() ?? '';
  const isFile = /\.(?:pdf|png|jpe?g|gif|webp|avif|bmp|svg|heic|tiff?|txt|csv|md|docx?|xlsx?|pptx?|zip|7z|rar|mp[34]|wav|mov)$/i.test(filename);
  const display = isFile ? filename : url.host + (safePath === '/' ? '' : safePath);
  const label = display.length > 64 ? display.slice(0, 63) + '…' : display;
  // Keep the tooltip compact too; never expose URL credentials, query values, or fragments.
  const titleText = url.host + (safePath === '/' ? '' : safePath);
  return {href: url.href, label, title: titleText.length > 160 ? titleText.slice(0, 159) + '…' : titleText};
}

/** Only local raster formats are thumbnailed; SVG/remote content is not automatically embedded. */
export function isPreviewImage(path: string): boolean {return /\.(?:png|jpe?g|gif|webp|avif|bmp)$/i.test(path);}
