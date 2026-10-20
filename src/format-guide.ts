type GuideHost = {
  target(): HTMLElement | null;
  text(zh: string, en: string): string;
};
type GuideSection = 'prefix' | 'inline';

/** A read-only guide. Modifier keys and editor transactions remain native. */
export class FormatGuide {
  private static serial = 0;
  private timer?: number;
  private origin?: HTMLElement;
  private shift?: string;
  private panel?: HTMLElement;
  private body?: HTMLElement;
  private tabs: HTMLButtonElement[] = [];
  private pinned = false;
  private composing = false;
  private pointerDown = false;
  private disposed = false;
  private entering?: Animation;
  private leaving?: HTMLElement;
  private leavingOrigin?: HTMLElement;
  private exiting?: Animation;
  private exitTimer?: number;
  private resize?: ResizeObserver;
  private motion?: MediaQueryList;
  private cleanup: Array<() => void> = [];

  constructor(private host: GuideHost) {
    this.listen(document, 'keydown', event => this.keydown(event as KeyboardEvent));
    this.listen(document, 'keyup', event => {
      if ((event as KeyboardEvent).key === 'Shift') this.cancelHold();
    });
    this.listen(document, 'compositionstart', () => { this.composing = true; this.cancelHold(); });
    this.listen(document, 'compositionend', () => { this.composing = false; });
    this.listen(document, 'beforeinput', () => this.cancelHold());
    this.listen(document, 'selectionchange', () => this.cancelHold());
    this.listen(document, 'pointerdown', event => {
      this.pointerDown = true;
      if (!this.panel?.contains(event.target as Node)) this.close();
    });
    this.listen(document, 'pointerup', () => { this.pointerDown = false; });
    this.listen(document, 'pointercancel', () => { this.pointerDown = false; });
    this.listen(document, 'focusin', event => {
      const target = event.target as Node;
      if (!this.origin?.contains(target) && !this.panel?.contains(target)) this.close();
    });
    this.listen(window, 'blur', event => {
      if (event.target !== window) return;
      this.pointerDown = false; this.composing = false; this.close(false, true);
    });
    this.listen(document, 'visibilitychange', () => { if (document.hidden) this.close(false, true); });
    this.listen(window, 'resize', () => this.position());
    if (window.visualViewport) {
      this.listen(window.visualViewport, 'resize', () => this.position());
      this.listen(window.visualViewport, 'scroll', () => this.position());
    }
    this.motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (this.motion) this.listen(this.motion, 'change', () => {
      if (!this.motion?.matches) return;
      this.entering?.cancel(); this.entering = undefined;
      this.clearLeaving();
    });
  }

  private listen(target: EventTarget, name: string, callback: EventListener): void {
    target.addEventListener(name, callback, true);
    this.cleanup.push(() => target.removeEventListener(name, callback, true));
  }

  private keydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.panel) {
      event.preventDefault(); event.stopPropagation(); this.close(true); return;
    }
    if (event.key !== 'Shift' || event.altKey || event.ctrlKey || event.metaKey ||
        event.isComposing || this.composing || this.pointerDown) {
      this.cancelHold(); return;
    }
    if (event.repeat || this.pinned) return;
    if (this.shift || this.panel) { this.cancelHold(); return; }
    const target = this.host.target();
    const editor = event.target instanceof HTMLElement ? event.target.closest('.cm-content') : null;
    if (!target || !editor || !target.contains(editor) || document.getSelection()?.isCollapsed === false) return;
    this.origin = target;
    this.shift = event.code || event.key;
    this.timer = window.setTimeout(() => {
      this.timer = undefined;
      if (this.shift && this.host.target() === this.origin && this.origin.contains(document.activeElement)) this.open(false);
    }, 600);
  }

  private cancelHold(): void {
    if (this.timer !== undefined) window.clearTimeout(this.timer);
    this.timer = undefined; this.shift = undefined;
    if (!this.pinned) this.close();
  }

  sync(): void {
    const target = this.host.target();
    if ((this.origin && target !== this.origin) || (this.leavingOrigin && target !== this.leavingOrigin)) this.close(false, true);
  }

  open(pinned = true): void {
    if (this.disposed) return;
    const origin = this.host.target();
    if (!origin) return;
    this.close(false, true);
    this.origin = origin; this.pinned = pinned;
    const t = (zh: string, en: string) => this.host.text(zh, en);
    const id = `nf-guide-${++FormatGuide.serial}`;
    const panel = document.createElement('aside');
    this.panel = panel;
    panel.className = 'nf-format-guide';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    panel.setAttribute('aria-labelledby', `${id}-title`);
    const header = panel.appendChild(document.createElement('div'));
    header.className = 'nf-guide-header';
    const title = header.appendChild(document.createElement('strong'));
    title.id = `${id}-title`; title.textContent = t('格式速查', 'Formatting guide');
    const close = header.appendChild(document.createElement('button'));
    close.type = 'button'; close.className = 'nf-guide-close'; close.textContent = '×';
    close.setAttribute('aria-label', t('关闭格式速查', 'Close formatting guide'));
    close.addEventListener('click', () => this.close(true));
    const tabs = panel.appendChild(document.createElement('div'));
    tabs.className = 'nf-guide-tabs'; tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', t('格式类型', 'Format category'));
    for (const [section, label] of [['prefix', t('段首', 'Paragraph')], ['inline', t('文字', 'Text')]] as const) {
      const tab = tabs.appendChild(document.createElement('button'));
      tab.type = 'button'; tab.textContent = label; tab.dataset.section = section;
      tab.id = `${id}-${section}`; tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', `${id}-content`);
      // Browsing the temporary card must not blur the writing editor.
      tab.addEventListener('mousedown', event => { if (!this.pinned) event.preventDefault(); });
      tab.addEventListener('click', () => this.selectSection(section));
      tab.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : 1 - this.tabs.indexOf(tab);
        this.selectSection(next === 0 ? 'prefix' : 'inline'); this.tabs[next].focus();
      });
      this.tabs.push(tab);
    }
    this.body = panel.appendChild(document.createElement('div'));
    this.body.className = 'nf-guide-body'; this.body.id = `${id}-content`;
    this.body.setAttribute('role', 'tabpanel'); this.body.tabIndex = 0;
    const footer = panel.appendChild(document.createElement('div'));
    footer.className = 'nf-guide-footer';
    footer.textContent = pinned ? t('Esc 关闭', 'Esc to close') : t('松开 Shift 收起', 'Release Shift to close');
    this.selectSection('prefix');
    document.body.append(panel);
    this.position();
    if (this.panel !== panel) return;
    if (window.ResizeObserver) {
      this.resize = new window.ResizeObserver(() => this.position());
      this.resize.observe(origin);
    }
    if (panel.animate && !this.motion?.matches) {
      const entering = panel.animate([
        {opacity: 0, transform: 'translateY(18px) scale(.985)'},
        {opacity: 1, transform: 'none'},
      ], {duration: 240, easing: 'cubic-bezier(.16,1,.3,1)'});
      this.entering = entering;
      entering.onfinish = () => { if (this.entering === entering) { this.entering = undefined; entering.cancel(); } };
    }
    if (pinned) close.focus({preventScroll: true});
  }

  private selectSection(section: GuideSection): void {
    if (!this.body || !this.panel) return;
    const t = (zh: string, en: string) => this.host.text(zh, en);
    for (const tab of this.tabs) {
      const selected = tab.dataset.section === section;
      tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
      if (selected) this.body.setAttribute('aria-labelledby', tab.id);
    }
    this.body.replaceChildren(); this.body.scrollTop = 0;
    const hint = this.body.appendChild(document.createElement('p'));
    hint.className = 'nf-guide-hint';
    hint.textContent = section === 'prefix'
      ? t('段首输入，再按空格', 'Start a line, then press Space')
      : t('在文字两侧配对输入', 'Wrap text on both sides');
    const grid = this.body.appendChild(document.createElement('ul'));
    grid.className = `nf-guide-grid nf-guide-${section}`;
    const rows = section === 'prefix' ? [
      ['#', t('大标题', 'Heading 1'), ''], ['##', t('中标题', 'Heading 2'), ''], ['###', t('小标题', 'Heading 3'), ''],
      [t('- 或 *', '- or *'), t('无序列表', 'Bullet list'), ''], ['1.', t('有序列表', 'Numbered list'), ''],
      ['- [ ]', t('待办事项', 'Task list'), ''], ['>', t('引用', 'Quote'), ''], ['```', t('代码块', 'Code block'), 'code'],
    ] : [
      [t('*文字*', '*text*'), t('斜体', 'Italic'), 'italic'],
      [t('**文字**', '**text**'), t('加粗', 'Bold'), 'bold'],
      [t('==文字==', '==text=='), t('高亮', 'Highlight'), 'highlight'],
    ];
    for (const [syntax, label, kind] of rows) {
      const card = grid.appendChild(document.createElement('li'));
      card.className = `nf-guide-card${kind ? ` nf-guide-${kind}` : ''}`;
      card.appendChild(document.createElement('code')).textContent = syntax;
      const caption = card.appendChild(document.createElement('span'));
      caption.className = 'nf-guide-label'; caption.textContent = label;
      if (kind === 'code') {
        const enter = caption.appendChild(document.createElement('kbd')); enter.textContent = 'Enter';
        card.title = t('按 Enter 换行；用另一行 ``` 结束代码块', 'Press Enter; close with ``` on another line');
      }
    }
    if (section === 'inline') {
      const note = this.body.appendChild(document.createElement('p'));
      note.className = 'nf-guide-note';
      note.append(document.createTextNode(t('保留星号原样：', 'Literal star: ')));
      note.appendChild(document.createElement('code')).textContent = '\\*';
    }
  }

  private position(): void {
    if (!this.panel || !this.origin) return;
    const bounds = this.origin.getBoundingClientRect(), viewport = window.visualViewport;
    const left = Math.max(bounds.left, viewport?.offsetLeft ?? 0);
    const top = Math.max(bounds.top, viewport?.offsetTop ?? 0);
    const right = Math.min(bounds.right, viewport ? viewport.offsetLeft + viewport.width : window.innerWidth);
    const bottom = Math.min(bounds.bottom, viewport ? viewport.offsetTop + viewport.height : window.innerHeight);
    const width = Math.min(640, right - left - 24), height = bottom - top - 24;
    if (width < 120 || height < 120) { this.close(false, true); return; }
    this.panel.style.width = `${width}px`;
    this.panel.style.left = `${left + (right - left - width) / 2}px`;
    this.panel.style.bottom = `${window.innerHeight - bottom + 12}px`;
    this.panel.style.maxHeight = `${height}px`;
    this.panel.classList.toggle('nf-guide-narrow', width < 540);
    this.panel.classList.toggle('nf-guide-short', height < 280);
  }

  private clearLeaving(): void {
    if (this.exitTimer !== undefined) window.clearTimeout(this.exitTimer);
    this.exitTimer = undefined;
    this.exiting?.cancel(); this.exiting = undefined;
    this.leaving?.remove(); this.leaving = undefined; this.leavingOrigin = undefined;
  }

  close(restoreFocus = false, immediate = false): void {
    if (this.timer !== undefined) window.clearTimeout(this.timer);
    const origin = this.origin, panel = this.panel;
    const focusWasInside = !!panel?.contains(document.activeElement);
    this.timer = undefined; this.shift = undefined;
    this.panel = undefined; this.body = undefined; this.tabs = [];
    this.origin = undefined; this.pinned = false;
    this.resize?.disconnect(); this.resize = undefined;
    if (!panel) { if (immediate) this.clearLeaving(); return; }
    const style = window.getComputedStyle(panel);
    const start = {opacity: style.opacity || '1', transform: style.transform || 'none'};
    this.entering?.cancel(); this.entering = undefined;
    this.clearLeaving();
    // Interaction ends immediately. The short exit belongs only to this old
    // node, so a fast reopen or an old animation callback cannot close new help.
    if (immediate || this.motion?.matches || !panel.animate) panel.remove();
    else {
      panel.dataset.closing = ''; panel.setAttribute('aria-hidden', 'true'); panel.inert = true;
      for (const button of panel.querySelectorAll('button')) button.disabled = true;
      this.leaving = panel; this.leavingOrigin = origin;
      this.exiting = panel.animate([start, {opacity: 0, transform: 'translateY(10px) scale(.985)'}], {duration: 140, easing: 'ease-out'});
      const remove = () => { if (this.leaving === panel) this.clearLeaving(); else panel.remove(); };
      this.exiting.onfinish = remove;
      this.exitTimer = window.setTimeout(remove, 200);
    }
    if (restoreFocus && focusWasInside && origin && this.host.target() === origin) {
      origin.querySelector<HTMLElement>('.cm-content')?.focus({preventScroll: true});
    }
  }

  destroy(): void {
    this.disposed = true; this.close(false, true);
    for (const off of this.cleanup) off(); this.cleanup = [];
  }
}
