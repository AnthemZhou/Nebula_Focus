/** Touch opens choices first. A hardware-keyboard activation may still put the
 * caret directly in search, as desktop users expect. Direct taps on real inputs
 * keep their native focus behavior; no timer or synthetic keyboard is needed. */
export function preferPopoverInputFocus(anchor: HTMLElement, keyboard = false): boolean {
  const doc = anchor.ownerDocument, win = doc.defaultView;
  return keyboard || !(doc.body.matches('.is-mobile, .bui-touch') || win?.matchMedia?.('(any-pointer: coarse)').matches);
}

/** Keep fixed popovers inside the part of the WebView that is actually visible.
 * On iOS the keyboard and pinch/pan change visualViewport without necessarily
 * changing innerHeight. Anchor visibility still uses the layout viewport so a
 * keyboard-covered cell does not dismiss the editor the user is typing into.
 */
export function positionAnchoredPopover(anchor: HTMLElement, popup: HTMLElement, preferredWidth: number): boolean {
  const win = popup.ownerDocument.defaultView;
  if (!win || !anchor.isConnected || !popup.isConnected) return false;
  const bounds = anchor.getBoundingClientRect(), margin = 8;
  if (bounds.bottom < 0 || bounds.top > win.innerHeight || bounds.right < 0 || bounds.left > win.innerWidth) return false;
  const viewport = win.visualViewport;
  const valid = viewport && Number.isFinite(viewport.width) && Number.isFinite(viewport.height) && viewport.width > 0 && viewport.height > 0;
  const left = valid ? viewport.offsetLeft : 0, top = valid ? viewport.offsetTop : 0;
  const width = valid ? viewport.width : win.innerWidth, height = valid ? viewport.height : win.innerHeight;
  const popupWidth = Math.min(preferredWidth, Math.max(0, width - margin * 2));
  const maxHeight = Math.max(0, height - margin * 2);
  popup.classList.add('bui-anchored-popover');
  popup.style.width = `${popupWidth}px`; popup.style.maxHeight = `${maxHeight}px`;
  popup.style.left = `${Math.max(left + margin, Math.min(bounds.left, left + width - popupWidth - margin))}px`;
  const popupHeight = Math.min(popup.getBoundingClientRect().height, maxHeight);
  const below = bounds.bottom + 4, above = bounds.top - popupHeight - 4;
  const desiredTop = below + popupHeight <= top + height - margin || above < top + margin ? below : above;
  popup.style.top = `${Math.max(top + margin, Math.min(desiredTop, top + height - popupHeight - margin))}px`;
  return true;
}

/** Return one cleanup for every viewport listener; closed dialogs cannot retain
 * references or react to subsequent keyboard/rotation updates. */
export function watchPopoverViewport(popup: HTMLElement, reposition: () => void): () => void {
  const doc = popup.ownerDocument, win = doc.defaultView;
  if (!win) return () => {};
  const scroll = (event: Event) => {
    const target = event.target as Node | null;
    if (!target?.nodeType || !popup.contains(target)) reposition();
  };
  doc.addEventListener('scroll', scroll, true);
  win.addEventListener('resize', reposition);
  win.visualViewport?.addEventListener('resize', reposition);
  win.visualViewport?.addEventListener('scroll', reposition);
  const viewport = win.visualViewport;
  return () => {
    doc.removeEventListener('scroll', scroll, true);
    win.removeEventListener('resize', reposition);
    viewport?.removeEventListener('resize', reposition);
    viewport?.removeEventListener('scroll', reposition);
  };
}

/** Scrolling a touch list must never turn the release into an option selection
 * or a delete-button click, including WebViews that synthesize a trailing click.
 * No pointer default is cancelled here: native scrolling remains available.
 */
export function guardTouchScrollClicks(root: HTMLElement): () => void {
  let touch: {id: number; x: number; y: number} | undefined, ignoreClick = false;
  const down = (event: PointerEvent) => {
    ignoreClick = false;
    touch = event.pointerType === 'touch' ? {id: event.pointerId, x: event.clientX, y: event.clientY} : undefined;
  };
  const move = (event: PointerEvent) => {
    if (touch && event.pointerId === touch.id && Math.hypot(event.clientX - touch.x, event.clientY - touch.y) > 8) ignoreClick = true;
  };
  const cancel = (event: PointerEvent) => {if (touch && event.pointerId === touch.id) {ignoreClick = true; touch = undefined;}};
  const scroll = () => {if (touch) ignoreClick = true;};
  const up = (event: PointerEvent) => {if (touch && event.pointerId === touch.id) touch = undefined;};
  const key = () => {ignoreClick = false; touch = undefined;};
  const click = (event: MouseEvent) => {
    if (!ignoreClick) return;
    ignoreClick = false; event.preventDefault(); event.stopImmediatePropagation();
  };
  root.addEventListener('pointerdown', down, true);
  root.addEventListener('pointermove', move, true);
  root.addEventListener('pointercancel', cancel, true);
  root.addEventListener('pointerup', up, true);
  root.addEventListener('scroll', scroll, true);
  root.addEventListener('keydown', key, true);
  root.addEventListener('click', click, true);
  return () => {
    root.removeEventListener('pointerdown', down, true);
    root.removeEventListener('pointermove', move, true);
    root.removeEventListener('pointercancel', cancel, true);
    root.removeEventListener('pointerup', up, true);
    root.removeEventListener('scroll', scroll, true);
    root.removeEventListener('keydown', key, true);
    root.removeEventListener('click', click, true);
  };
}
