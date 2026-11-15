type Move = {element: HTMLElement; parent: HTMLElement; marker: Comment; destination: HTMLElement};
type Header = {leaf: HTMLElement; source: HTMLElement; top: HTMLElement; navHost: HTMLElement; moves: Move[]};

/** Relocate native controls, preserving their history, menus and listeners.
 * Every original position is restored on tab changes or native appearance. */
export class DesktopHeader {
  private headers = new Map<Document, Header>();
  refresh(doc: Document) {
    if (doc.body.classList.contains('is-mobile')) {this.clearDocument(doc); return;}
    const main = doc.querySelector<HTMLElement>('.workspace-tabs.nf-main-region');
    const leaf = [...main?.querySelectorAll<HTMLElement>('.workspace-leaf') ?? []]
      .find(el => !el.hidden && doc.defaultView!.getComputedStyle(el).display !== 'none');
    const source = leaf?.querySelector<HTMLElement>('.view-header');
    const top = main?.querySelector<HTMLElement>(':scope > .workspace-tab-header-container');
    const side = doc.querySelector<HTMLElement>('.workspace > .mod-left-split:not(.is-sidedock-collapsed):not(.is-collapsed) > .workspace-tabs > .workspace-tab-header-container');
    const navHost = side ?? top;
    const previous = this.headers.get(doc);
    if (previous && previous.leaf === leaf && previous.source === source && previous.top === top && previous.navHost === navHost &&
        previous.moves.every(move => move.element.parentElement === move.destination && move.marker.parentNode === move.parent)) return;
    this.clearDocument(doc);
    if (!leaf || !source || !top || !navHost) return;
    const nav = source.querySelector<HTMLElement>('.view-header-nav-buttons');
    const actions = source.querySelector<HTMLElement>('.view-actions');
    if (!nav || !actions) return;
    const moves = [[nav, navHost], [actions, top]].map(([element, destination]): Move => {
      const parent = element.parentElement!, marker = doc.createComment('nebula-native-header-position');
      parent.insertBefore(marker, element);
      if (element === nav) destination.prepend(element); else destination.append(element);
      return {element, parent, marker, destination};
    });
    source.classList.add('bui-desktop-header-source');
    top.classList.add('bui-desktop-header-top'); navHost.classList.add('bui-desktop-navigation-host');
    this.headers.set(doc, {leaf, source, top, navHost, moves});
  }
  private clearDocument(doc: Document) {
    const header = this.headers.get(doc); if (!header) return;
    this.headers.delete(doc);
    header.source.classList.remove('bui-desktop-header-source');
    header.top.classList.remove('bui-desktop-header-top'); header.navHost.classList.remove('bui-desktop-navigation-host');
    for (const move of header.moves) {
      if (move.element.parentElement === move.destination) {
        if (move.marker.parentNode === move.parent) move.parent.insertBefore(move.element, move.marker);
        else move.element.remove();
      }
      move.marker.remove();
    }
  }
  clear() {for (const doc of this.headers.keys()) this.clearDocument(doc);}
  forget(doc: Document) {this.clearDocument(doc);}
}
