/** Local drag presentation shared by the tag picker and catalog manager.
 * The owner still controls pointer capture, cancellation and persistence. */
export class TagDragMotion {
  private ghost?: HTMLElement;
  private readonly origin: DOMRect;
  private readonly reduceMotion: boolean;
  private peers = new Map<HTMLElement, Animation>();
  private targets = new Map<HTMLElement, DOMRect>();
  private targetScroll = 0;
  private targetListTop = 0;
  private drop?: Animation;
  private dropTimer?: number;
  private disposed = false;

  constructor(private readonly list: HTMLElement, private readonly row: HTMLElement,
      private readonly startX: number, private readonly startY: number) {
    this.origin = row.getBoundingClientRect();
    this.reduceMotion = row.ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }

  move(x: number, y: number) {
    if (this.disposed) return;
    if (!this.ghost) this.lift();
    this.ghost!.style.transform = `translate3d(${this.origin.left + x - this.startX}px, ${this.origin.top + y - this.startY}px, 0)`;
  }

  private lift() {
    const doc = this.row.ownerDocument, win = doc.defaultView!;
    const ghost = this.row.cloneNode(true) as HTMLElement;
    // The visual copy is not another selectable option or keyboard target.
    ghost.className = 'bui-tag-drag-overlay';
    ghost.removeAttribute('id'); ghost.removeAttribute('role'); ghost.removeAttribute('data-value');
    ghost.setAttribute('aria-hidden', 'true'); ghost.inert = true;
    for (const el of ghost.querySelectorAll<HTMLElement>('[id], [tabindex], button, input')) {
      el.removeAttribute('id'); el.tabIndex = -1;
    }
    const computed = win.getComputedStyle(this.row);
    for (const prop of ['display', 'align-items', 'justify-content', 'gap', 'padding', 'font-family', 'font-size', 'font-weight', 'line-height', 'color'])
      ghost.style.setProperty(prop, computed.getPropertyValue(prop));
    for (const name of ['font-size', 'font-family', 'font-weight', 'line-height']) {
      const prop = `--bui-source-tag-${name}`, value = computed.getPropertyValue(prop);
      if (value) ghost.style.setProperty(prop, value);
    }
    Object.assign(ghost.style, {position: 'fixed', left: '0px', top: '0px', margin: '0px',
      boxSizing: 'border-box', width: `${this.origin.width}px`, height: `${this.origin.height}px`,
      pointerEvents: 'none', zIndex: 'calc(var(--layer-popover, 300) + 1)', willChange: 'transform'});
    this.ghost = ghost;
    this.row.classList.add('bui-tag-drag-placeholder');
    doc.body.append(ghost);
  }

  /** Hit testing follows destination slots, not peers mid-animation. */
  rect(row: HTMLElement): Pick<DOMRect, 'top' | 'height'> {
    const rect = this.targets.get(row);
    if (!rect) return row.getBoundingClientRect();
    const dy = this.list.getBoundingClientRect().top - this.targetListTop - (this.list.scrollTop - this.targetScroll);
    return {top: rect.top + dy, height: rect.height};
  }

  reorder(rows: HTMLElement[]) {
    if (this.disposed) return;
    const before = new Map(rows.map(row => [row, row.getBoundingClientRect()]));
    this.cancelPeers();
    for (const row of rows) this.list.append(row);
    this.targets = new Map(rows.map(row => [row, row.getBoundingClientRect()]));
    this.targetScroll = this.list.scrollTop; this.targetListTop = this.list.getBoundingClientRect().top;
    if (this.reduceMotion) return;
    for (const row of rows) {
      if (row === this.row || typeof row.animate !== 'function') continue;
      const old = before.get(row)!, target = this.targets.get(row)!;
      const x = old.left - target.left, y = old.top - target.top;
      if (!x && !y) continue;
      const animation = row.animate([{transform: `translate(${x}px, ${y}px)`}, {transform: 'translate(0px, 0px)'}],
        {duration: 150, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)'});
      this.peers.set(row, animation);
      animation.onfinish = () => {if (this.peers.get(row) === animation) this.peers.delete(row);};
    }
  }

  /** Keep the placeholder until the lifted row lands; only then may the owner
   * rebuild the list or persist the reordered catalog. */
  finish(done: () => void) {
    if (this.disposed) return;
    const ghost = this.ghost;
    if (!ghost || this.reduceMotion || typeof ghost.animate !== 'function') {this.dispose(); done(); return;}
    const target = this.row.getBoundingClientRect();
    const complete = () => {
      if (this.disposed) return;
      this.dispose(); done();
    };
    this.drop = ghost.animate([{transform: ghost.style.transform},
      {transform: `translate3d(${target.left}px, ${target.top}px, 0)`}],
    {duration: 140, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)', fill: 'forwards'});
    this.drop.onfinish = complete;
    // A backgrounded WebView may stop dispatching animation frames.
    this.dropTimer = this.row.ownerDocument.defaultView!.setTimeout(complete, 200);
  }

  private cancelPeers() {
    for (const animation of this.peers.values()) {animation.onfinish = null; animation.cancel();}
    this.peers.clear();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.dropTimer !== undefined) this.row.ownerDocument.defaultView!.clearTimeout(this.dropTimer);
    if (this.drop) {this.drop.onfinish = null; this.drop.cancel();}
    this.cancelPeers(); this.targets.clear();
    this.row.classList.remove('bui-tag-drag-placeholder');
    this.ghost?.remove(); this.ghost = undefined;
  }
}
