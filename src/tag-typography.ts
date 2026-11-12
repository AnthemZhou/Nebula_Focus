import {object, isHtmlElement} from './idea-native';
/** Body-level popovers do not inherit the table's font settings. Snapshot the
 * visible value once on open, including custom fonts and mobile text scaling. */
export function inheritPopoverTypography(popup: HTMLElement, source: HTMLElement) {
  const style = source.ownerDocument.defaultView?.getComputedStyle(source);
  if (!style) return;
  // Read computed values, not inline declarations: a relative source font must
  // not be resolved again against the body-mounted popup's different parent.
  for (const name of ['font-size', 'font-family', 'font-weight', 'line-height']) {
    const actual = style.getPropertyValue(name).trim();
    if (actual) popup.style.setProperty(`--bui-source-tag-${name}`, actual);
  }
}

export function inheritTagTypography(popup: HTMLElement, anchor: HTMLElement, view: unknown, property: string) {
  const value = (cell: HTMLElement) => cell.querySelector<HTMLElement>(
    '.multi-select-pill-content, .metadata-input-longtext, .bases-rendered-value');
  let source = value(anchor);
  if (!source) {
    // A catalog opens from the header. Its typography should follow the column's
    // values, not the independently sized header label.
    const container = object(view) && isHtmlElement(view.containerEl) ? view.containerEl : undefined;
    for (const cell of container?.querySelectorAll<HTMLElement>('.bases-td') ?? []) {
      if (cell.dataset.property !== `note.${property}` || !cell.isConnected) continue;
      source = value(cell);
      if (source) break;
    }
  }
  source ??= anchor;
  inheritPopoverTypography(popup, source);
}
