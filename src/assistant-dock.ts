import {setIcon} from 'obsidian';
import type {RecordingAssistant} from './assistant';

/** Keep an independent surface: Obsidian detaches its navbar when the software
 * keyboard opens. Only mirror its drawer motion; never move a focused input.
 * Native controls stay available from the attachment menu. */
export class MobileAssistantDock {
  private surface: HTMLElement;
  private motionObserver?: MutationObserver;
  private root: HTMLElement;
  private input: HTMLTextAreaElement;
  private sendButton: HTMLButtonElement;
  private addButton: HTMLButtonElement;
  private picker: HTMLInputElement;
  private composing = false;
  private closeMenu?: () => void;
  constructor(readonly host: HTMLElement, private controller: RecordingAssistant) {
    const doc = host.ownerDocument;
    this.surface = doc.createElement('div'); this.surface.className = 'bui-ai-dock-host mod-raised';
    this.root = doc.createElement('div'); this.root.className = 'bui-ai-dock';
    this.root.setAttribute('role', 'group'); this.root.setAttribute('aria-label', 'AI 对话');
    const button = (label: string, icon: string, action: () => void) => {
      const el = doc.createElement('button'); el.type = 'button'; el.setAttribute('aria-label', label);
      setIcon(el, icon); el.addEventListener('click', event => {event.preventDefault(); event.stopPropagation(); action();});
      this.root.append(el); return el;
    };
    this.addButton = button('附件与页面操作', 'plus', () => this.menu());
    this.input = doc.createElement('textarea'); this.input.rows = 1; this.input.placeholder = '询问 AI…';
    this.input.setAttribute('aria-label', '向 AI 发送消息');
    this.input.addEventListener('input', () => {if (!this.composing) controller.setDraft(this.input.value);});
    this.input.addEventListener('compositionstart', () => {this.composing = true;});
    this.input.addEventListener('compositionend', () => {this.composing = false; controller.setDraft(this.input.value);});
    this.input.addEventListener('keydown', event => {
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.isComposing && !this.composing) {
        event.preventDefault(); this.submit();
      }
    });
    this.input.addEventListener('paste', event => {
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length && controller.config.imageInput) {event.preventDefault(); controller.addFiles(files); controller.open();}
    });
    this.root.append(this.input);
    button('查看 AI 对话', 'message-circle', () => {controller.setDraft(this.input.value); controller.open();});
    this.sendButton = button('发送', 'arrow-up', () => this.submit());
    this.sendButton.className = 'bui-ai-dock-send';
    this.picker = doc.createElement('input'); this.picker.type = 'file'; this.picker.accept = 'image/*'; this.picker.multiple = true; this.picker.hidden = true;
    this.picker.addEventListener('change', () => {
      const files = Array.from(this.picker.files ?? []); this.picker.value = ''; this.closeMenu?.();
      if (files.length) {controller.addFiles(files); controller.open();}
    });
    this.picker.addEventListener('cancel', () => this.closeMenu?.());
    this.root.append(this.picker); this.surface.append(this.root);
    host.after(this.surface); host.classList.add('bui-ai-docked');
    const syncMotion = () => {
      for (const property of ['transform', 'transition']) {
        const value = host.style.getPropertyValue(property);
        if (this.surface.style.getPropertyValue(property) !== value) this.surface.style.setProperty(property, value);
      }
    };
    const Observer = doc.defaultView?.MutationObserver;
    if (Observer) {this.motionObserver = new Observer(syncMotion); this.motionObserver.observe(host, {attributes: true, attributeFilter: ['style']});}
    syncMotion(); this.render();
  }
  get isConnected() {return this.surface.isConnected;}
  private submit() {
    if (this.composing) return;
    if (this.controller.state.busy) {this.controller.cancel(); return;}
    this.controller.setDraft(this.input.value);
    if (!this.input.value.trim() && !this.controller.state.attachments.length) return;
    this.input.blur(); this.controller.open(); void this.controller.send();
  }
  private menu() {
    if (this.closeMenu) {this.closeMenu(); return;}
    // Keep this menu in the web view. iOS native action-sheet callbacks lose
    // the trusted gesture needed to open a file input's system picker.
    const doc = this.host.ownerDocument, menu = doc.createElement('div');
    menu.className = 'bui-ai-dock-menu'; menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', '附件与页面操作'); this.addButton.setAttribute('aria-expanded', 'true');
    const add = (label: string, run: () => void, disabled = false, close = true) => {
      const item = doc.createElement('button'); item.type = 'button'; item.textContent = label;
      item.setAttribute('role', 'menuitem'); item.disabled = disabled;
      item.addEventListener('click', event => {
        event.preventDefault(); event.stopPropagation(); run(); if (close) this.closeMenu?.();
      });
      menu.append(item);
    };
    // iOS also needs the activating element to remain mounted until the picker settles.
    add('添加截图', () => this.picker.click(), this.controller.state.busy || !this.controller.config.imageInput, false);
    add('AI 设置', () => this.controller.openSettings());
    const controls = this.host.querySelectorAll<HTMLElement>('.mobile-navbar-actions .mobile-navbar-action');
    const fallback: Record<string, string> = {back: '返回', forward: '前进', search: '搜索', new: '新建页面', tabs: '标签页', menu: '页面菜单'};
    let separator = false;
    for (const control of controls) {
      const target = control.querySelector<HTMLElement>('button, .clickable-icon') ?? control;
      const label = target.getAttribute('aria-label') || control.getAttribute('aria-label') ||
        target.getAttribute('title') || Object.entries(fallback).find(([key]) => control.classList.contains(`mobile-navbar-action-${key}`))?.[1];
      if (!label) continue;
      if (!separator) {menu.append(doc.createElement('hr')); separator = true;}
      add(label, () => target.click(), target.matches(':disabled, [aria-disabled="true"], .is-disabled'));
    }
    const outside = (event: Event) => {
      if (!event.composedPath().includes(menu) && !event.composedPath().includes(this.addButton)) this.closeMenu?.();
    };
    const keys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {event.preventDefault(); this.closeMenu?.(); this.addButton.focus();}
      else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const buttons = Array.from(menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        const index = buttons.indexOf(doc.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 :
          (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
    };
    this.closeMenu = () => {
      menu.remove(); doc.removeEventListener('pointerdown', outside, true); menu.removeEventListener('keydown', keys);
      this.addButton.setAttribute('aria-expanded', 'false'); this.closeMenu = undefined;
    };
    doc.addEventListener('pointerdown', outside, true); menu.addEventListener('keydown', keys);
    const rect = this.surface.getBoundingClientRect();
    menu.style.setProperty('--bui-ai-menu-bottom', `${Math.max(12, (doc.defaultView?.innerHeight ?? rect.bottom) - rect.top + 8)}px`);
    doc.body.append(menu); menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }
  render() {
    const {draft, busy, attachments} = this.controller.state;
    if (!this.composing && this.input.value !== draft) this.input.value = draft;
    this.input.disabled = busy;
    const label = busy ? '停止' : '发送';
    if (this.sendButton.getAttribute('aria-label') !== label) {this.sendButton.setAttribute('aria-label', label); setIcon(this.sendButton, busy ? 'square' : 'arrow-up');}
    this.sendButton.disabled = !busy && !draft.trim() && !attachments.length;
    this.addButton.setAttribute('aria-label', attachments.length ? `附件与页面操作，已添加 ${attachments.length} 张截图` : '附件与页面操作');
  }
  destroy() {this.closeMenu?.(); this.motionObserver?.disconnect(); this.surface.remove(); this.host.classList.remove('bui-ai-docked');}
}
