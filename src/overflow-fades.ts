const SCROLLPORTS = '.markdown-preview-view, .cm-scroller, .bases-view, .nf-reminders, .nf-finance-scroll';
type Binding = {resize: ResizeObserver; update: () => void; children: Set<Element>};

/** Fade clipped content without changing its dimensions. Observing immediate
 * content roots catches both pane resizing and asynchronously rendered rows. */
export class OverflowFades {
  private bindings = new Map<HTMLElement, Binding>();

  refresh(doc: Document) {
    if (doc.body.classList.contains('is-mobile')) {
      for (const [el, binding] of this.bindings) if (el.ownerDocument === doc) this.detach(el, binding);
      return;
    }
    for (const el of doc.querySelectorAll<HTMLElement>(`.mod-root :is(${SCROLLPORTS})`)) {
      let binding = this.bindings.get(el);
      if (!binding) {
        const update = () => {
          const width = el.clientWidth, remaining = el.scrollWidth - width;
          const left = Math.abs(el.scrollLeft);
          const rtl = doc.defaultView!.getComputedStyle(el).direction === 'rtl';
          // A border, scrollbar rounding or the board's final gap can add a
          // few pixels of overflow without hiding meaningful content.
          const significant = width > 0 && remaining > 24;
          const start = significant && left > 8, end = significant && remaining - left > 8;
          el.classList.toggle('bui-overflow-left', rtl ? end : start);
          el.classList.toggle('bui-overflow-right', rtl ? start : end);
        };
        const resize = new doc.defaultView!.ResizeObserver(update);
        binding = {resize, update, children: new Set()};
        this.bindings.set(el, binding);
        resize.observe(el);
        el.addEventListener('scroll', update, {passive: true});
      }
      for (const child of binding.children) if (child.parentElement !== el) {
        binding.resize.unobserve(child); binding.children.delete(child);
      }
      for (const child of el.children) if (!binding.children.has(child)) {
        binding.children.add(child); binding.resize.observe(child);
      }
      binding.update();
    }
    for (const [el, binding] of this.bindings) if (!el.isConnected || !el.closest('.mod-root')) this.detach(el, binding);
  }

  private detach(el: HTMLElement, binding: Binding) {
    binding.resize.disconnect(); el.removeEventListener('scroll', binding.update);
    el.classList.remove('bui-overflow-left', 'bui-overflow-right');
    this.bindings.delete(el);
  }
  clear() {for (const [el, binding] of this.bindings) this.detach(el, binding);}
  forget(doc: Document) {for (const [el, binding] of this.bindings) if (el.ownerDocument === doc) this.detach(el, binding);}
}
