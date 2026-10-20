type GuideHost = {
  target(): HTMLElement | null;
  text(zh: string, en: string): string;
};

/** A read-only guide. Modifier keys and editor transactions remain native. */
export class FormatGuide {
  private timer?: number;
  private origin?: HTMLElement;
  private shift?: string;
  private panel?: HTMLElement;
  private pinned = false;
  private composing = false;
  private pointerDown = false;
  private disposed = false;
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
      this.pointerDown = false; this.composing = false; this.close();
    });
    this.listen(document, 'visibilitychange', () => { if (document.hidden) this.close(); });
    this.listen(window, 'resize', () => this.position());
  }

  private listen(target: EventTarget, name: string, callback: EventListener): void {
    target.addEventListener(name, callback, true);
    this.cleanup.push(() => target.removeEventListener(name, callback, true));
  }

  private keydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.panel) {
      event.preventDefault();
      event.stopPropagation();
      this.close(true);
      return;
    }
    if (event.key !== 'Shift' || event.altKey || event.ctrlKey || event.metaKey ||
        event.isComposing || this.composing || this.pointerDown) {
      this.cancelHold();
      return;
    }
    if (event.repeat || this.pinned) return;
    // Pressing both Shift keys is a chord, not a request for help.
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
    this.timer = undefined;
    this.shift = undefined;
    if (!this.pinned) this.close();
  }

  /** Called after workspace, mode and preference changes. */
  sync(): void {
    if (this.origin && this.host.target() !== this.origin) this.close();
  }

  open(pinned = true): void {
    if (this.disposed) return;
    const origin = this.host.target();
    if (!origin) return;
    this.close();
    this.origin = origin;
    this.pinned = pinned;
    const t = (zh: string, en: string) => this.host.text(zh, en);
    const panel = document.createElement('aside');
    this.panel = panel;
    panel.className = 'nf-format-guide';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    panel.setAttribute('aria-label', t('格式速查', 'Formatting guide'));
    const header = panel.appendChild(document.createElement('div'));
    header.className = 'nf-guide-header';
    const title = header.appendChild(document.createElement('strong'));
    title.textContent = t('格式速查', 'Formatting guide');
    const close = header.appendChild(document.createElement('button'));
    close.type = 'button';
    close.className = 'nf-guide-close';
    close.textContent = '×';
    close.setAttribute('aria-label', t('关闭格式速查', 'Close formatting guide'));
    close.addEventListener('click', () => this.close(true));
    const hint = panel.appendChild(document.createElement('p'));
    hint.className = 'nf-guide-hint';
    hint.textContent = pinned
      ? t('段首输入符号，再按空格。Esc 关闭。', 'Type a prefix, then Space. Esc to close.')
      : t('段首输入符号，再按空格。松开 Shift 收起。', 'Type a prefix, then Space. Release Shift to close.');
    const rows = [
      ['#', t('大标题', 'Heading 1'), 'space'],
      ['##', t('中标题', 'Heading 2'), 'space'],
      ['###', t('小标题', 'Heading 3'), 'space'],
      [t('- 或 *', '- or *'), t('无序列表', 'Bullet list'), 'space'],
      ['1.', t('有序列表', 'Numbered list'), 'space'],
      ['- [ ]', t('待办事项', 'Task list'), 'space'],
      ['>', t('引用', 'Quote'), 'space'],
      ['```', t('代码块', 'Code block'), 'enter'],
    ];
    const list = panel.appendChild(document.createElement('dl'));
    list.className = 'nf-guide-prefixes';
    for (const [prefix, label, key] of rows) {
      const term = list.appendChild(document.createElement('dt'));
      term.appendChild(document.createElement('code')).textContent = prefix;
      const cap = term.appendChild(document.createElement('kbd'));
      cap.textContent = key === 'space' ? t('空格', 'Space') : 'Enter';
      list.appendChild(document.createElement('dd')).textContent = label;
    }
    const inline = panel.appendChild(document.createElement('div'));
    inline.className = 'nf-guide-inline';
    const label = inline.appendChild(document.createElement('p'));
    label.textContent = t('文字两侧成对输入', 'Wrap text on both sides');
    for (const [syntax, zh, en] of [['*文字*', '斜体', 'Italic'], ['**文字**', '加粗', 'Bold'], ['==文字==', '高亮', 'Highlight']]) {
      const row = inline.appendChild(document.createElement('div'));
      row.appendChild(document.createElement('code')).textContent = t(syntax, syntax.replace('文字', 'text'));
      row.appendChild(document.createElement('span')).textContent = t(zh, en);
    }
    const foot = panel.appendChild(document.createElement('p'));
    foot.className = 'nf-guide-foot';
    foot.textContent = t('Shift + 8 只输入 *。想保留星号原样，输入 \\*。代码块以另一行 ``` 结束。',
      'Shift + 8 types *. Use \\* for a literal star. End a code block with ``` on a new line.');
    document.body.append(panel);
    this.position();
    if (pinned) close.focus({ preventScroll: true });
  }

  private position(): void {
    if (!this.panel || !this.origin) return;
    const bounds = this.origin.getBoundingClientRect();
    const width = this.panel.getBoundingClientRect().width;
    const height = this.panel.getBoundingClientRect().height;
    this.panel.style.right = `${Math.max(12, Math.min(window.innerWidth - width - 12, window.innerWidth - bounds.right + 16))}px`;
    this.panel.style.bottom = `${Math.max(12, Math.min(window.innerHeight - height - 12, window.innerHeight - bounds.bottom + 16))}px`;
  }

  close(restoreFocus = false): void {
    if (this.timer !== undefined) window.clearTimeout(this.timer);
    const origin = this.origin;
    const focusWasInside = !!this.panel?.contains(document.activeElement);
    this.timer = undefined;
    this.shift = undefined;
    this.panel?.remove();
    this.panel = undefined;
    this.origin = undefined;
    this.pinned = false;
    if (restoreFocus && focusWasInside && origin && this.host.target() === origin) {
      origin.querySelector<HTMLElement>('.cm-content')?.focus({ preventScroll: true });
    }
  }

  destroy(): void {
    this.disposed = true;
    this.close();
    for (const off of this.cleanup) off();
    this.cleanup = [];
  }
}
