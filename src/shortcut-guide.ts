import type {Hotkey} from 'obsidian';
import {callable, record} from './native-presentation';

export const APPEARANCE_HOTKEY: Hotkey = {modifiers: ['Mod', 'Alt'], key: 'U'};
export interface ShortcutHint {label: string; keys: string[][]}
export interface ShortcutGuideHost {
  target(): HTMLElement | null;
  hints(): ShortcutHint[];
  status(): string;
}

/** The hotkey registry is not a public API. Read it defensively, including an
 * explicitly cleared binding; never edit it or execute a command from help. */
export function commandHotkeys(app: unknown, id: string, fallback: Hotkey[]): Hotkey[] {
  try {
    const manager = record(app) ? app.hotkeyManager : undefined;
    let value: unknown;
    if (record(manager)) {
      if (record(manager.customKeys) && Object.prototype.hasOwnProperty.call(manager.customKeys, id)) value = manager.customKeys[id];
      else if (callable(manager.getHotkeys)) value = manager.getHotkeys.call(manager, id);
      if (value == null && callable(manager.getDefaultHotkeys)) value = manager.getDefaultHotkeys.call(manager, id);
    }
    if (value == null) return fallback;
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Hotkey => record(item) && typeof item.key === 'string' && item.key.length > 0 &&
      Array.isArray(item.modifiers) && item.modifiers.every(mod => ['Mod', 'Meta', 'Ctrl', 'Alt', 'Shift'].includes(String(mod))));
  } catch {return fallback;}
}

export function hotkeyCaps(hotkey: Hotkey, mac: boolean): string[] {
  const symbols: Record<string, string> = mac
    ? {Mod: '⌘', Meta: '⌘', Ctrl: '⌃', Alt: '⌥', Shift: '⇧'}
    : {Mod: 'Ctrl', Meta: 'Win', Ctrl: 'Ctrl', Alt: 'Alt', Shift: 'Shift'};
  const keys: Record<string, string> = {ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', ' ': 'Space', Escape: 'Esc'};
  return [...new Set(hotkey.modifiers.map(mod => symbols[mod])), keys[hotkey.key] ?? hotkey.key.toUpperCase()];
}

export function shortcutHints(app: unknown, mac: boolean, pluginId: string): ShortcutHint[] {
  const hint = (label: string, id: string, fallback: Hotkey[]): ShortcutHint => ({label,
    keys: commandHotkeys(app, id, fallback).map(key => hotkeyCaps(key, mac))});
  return [
    hint('优化 / 原生外观', `${pluginId}:toggle-reading-ui`, [APPEARANCE_HOTKEY]),
    hint('编辑 / 阅读模式', 'markdown:toggle-preview', [{modifiers: ['Mod'], key: 'E'}]),
    hint('快速切换笔记', 'switcher:open', [{modifiers: ['Mod'], key: 'O'}]),
    hint('命令面板', 'command-palette:open', [{modifiers: ['Mod'], key: 'P'}]),
    // These are the plugin's direct history bindings, shared with native text
    // undo. They are not the optional command-palette history bindings.
    {label: '撤销当前操作', keys: [hotkeyCaps({modifiers: ['Mod'], key: 'Z'}, mac)]},
    {label: '重做当前操作', keys: [hotkeyCaps({modifiers: ['Mod', 'Shift'], key: 'Z'}, mac)]},
  ];
}

/** Read-only modifier-hold help. It never focuses an element, consumes input,
 * or changes a note. Each desktop window owns its timers and listeners. */
export class ShortcutGuide {
  private timer?: number;
  private exitTimer?: number;
  private panel?: HTMLElement;
  private leaving?: HTMLElement;
  private origin?: HTMLElement;
  private held = false;
  private blocked = false;
  private pointerDown = false;
  private composing = false;
  private disposed = false;
  private down = new Set<string>();
  private cleanup: (() => void)[] = [];
  private resize?: ResizeObserver;
  private motion: MediaQueryList | undefined;

  constructor(private win: Window, private mac: boolean, private host: ShortcutGuideHost) {
    const doc = win.document;
    this.listen(win, 'keydown', event => this.keydown(event as KeyboardEvent));
    this.listen(win, 'keyup', event => {
      const key = (event as KeyboardEvent).key;
      this.down.delete(key);
      // macOS can omit the letter's keyup while Command is held. Do not leave
      // that key stuck in the chord guard after the modifier is released.
      if (key === this.modifier) {this.down.clear(); this.held = false; this.blocked = false; this.hide();}
    });
    this.listen(doc, 'compositionstart', () => {this.composing = true; this.cancel();});
    this.listen(doc, 'compositionend', () => {this.composing = false;});
    this.listen(doc, 'beforeinput', () => this.cancel());
    this.listen(doc, 'pointerdown', () => {this.pointerDown = true; this.cancel();});
    this.listen(doc, 'pointerup', () => {this.pointerDown = false;});
    this.listen(doc, 'pointercancel', () => {this.pointerDown = false;});
    this.listen(doc, 'wheel', () => this.cancel());
    this.listen(win, 'blur', event => {if (event.target === win) this.reset();});
    this.listen(doc, 'visibilitychange', () => {if (doc.hidden) this.reset();});
    this.listen(doc, 'focusin', () => this.cancel());
    this.listen(win, 'resize', () => this.position());
    this.listen(win.visualViewport, 'resize', () => this.position());
    this.listen(win.visualViewport, 'scroll', () => this.position());
    this.motion = win.matchMedia?.('(prefers-reduced-motion: reduce)');
    this.listen(this.motion, 'change', () => {if (this.motion?.matches) this.clearLeaving();});
  }

  private get modifier() {return this.mac ? 'Meta' : 'Control';}
  private listen(target: EventTarget | null | undefined, name: string, run: EventListener) {
    target?.addEventListener(name, run, true);
    this.cleanup.push(() => target?.removeEventListener(name, run, true));
  }
  private keydown(event: KeyboardEvent) {
    if (this.disposed) return;
    const primary = event.key === this.modifier;
    if (!primary) {this.down.add(event.key); this.cancel(); return;}
    const solo = this.mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
    if (!solo || event.altKey || event.shiftKey || event.isComposing || this.composing || this.pointerDown || this.down.size) {
      this.held = true; this.cancel(); return;
    }
    if (event.repeat || this.held || this.blocked || event.defaultPrevented) return;
    this.held = true;
    const origin = this.host.target();
    if (!origin?.isConnected || origin.ownerDocument !== this.win.document || this.win.document.querySelector('.modal-container')) return;
    this.origin = origin;
    this.timer = this.win.setTimeout(() => {
      this.timer = undefined;
      if (this.held && !this.blocked && this.host.target() === origin && origin.isConnected && !this.win.document.hidden) this.show(origin);
    }, 600);
  }

  private show(origin: HTMLElement) {
    this.clearLeaving();
    const panel = this.win.document.body.createEl('aside', {cls: 'bui-shortcut-guide', attr: {
      role: 'region', 'aria-label': '快捷键速查', 'aria-live': 'polite',
    }});
    this.panel = panel;
    const header = panel.createDiv('bui-shortcut-guide-header');
    header.createEl('strong', {text: '快捷键速查'});
    header.createSpan({text: this.host.status(), cls: 'bui-shortcut-guide-status'});
    const list = panel.createEl('dl', {cls: 'bui-shortcut-guide-list'});
    for (const hint of this.host.hints()) {
      const row = list.createDiv('bui-shortcut-guide-row');
      row.createEl('dt', {cls: 'bui-shortcut-guide-label', text: hint.label});
      const bindings = row.createEl('dd', {cls: 'bui-shortcut-guide-bindings'});
      if (!hint.keys.length) bindings.createSpan({text: '未设置', cls: 'bui-shortcut-guide-status'});
      for (const caps of hint.keys) {
        const binding = bindings.createSpan('bui-shortcut-guide-binding');
        for (const cap of caps) binding.createEl('kbd', {text: cap});
      }
    }
    panel.createDiv({cls: 'bui-shortcut-guide-footer', text: `松开 ${this.mac ? '⌘' : 'Ctrl'} 收起`});
    panel.setAttribute('aria-description', '撤销优先作用于当前文字或数据库');
    this.position();
    const Observer = origin.ownerDocument.defaultView?.ResizeObserver;
    if (Observer && this.panel) {this.resize = new Observer(() => this.position()); this.resize.observe(origin);}
  }

  private position() {
    const panel = this.panel, origin = this.origin;
    if (!panel || !origin) return;
    if (!origin.isConnected || this.host.target() !== origin) {this.cancel(true); return;}
    const rect = origin.getBoundingClientRect(), viewport = this.win.visualViewport;
    const vx = viewport?.offsetLeft ?? 0, vy = viewport?.offsetTop ?? 0;
    const vw = viewport?.width ?? this.win.innerWidth, vh = viewport?.height ?? this.win.innerHeight;
    const left = Math.max(vx, rect.left), right = Math.min(vx + vw, rect.right);
    const top = Math.max(vy, rect.top), bottom = Math.min(vy + vh, rect.bottom);
    if (right - left < 160 || bottom - top < 100) {this.cancel(true); return;}
    const width = Math.min(520, right - left - 24);
    panel.style.width = `${width}px`;
    panel.style.left = `${left + (right - left - width) / 2}px`;
    panel.style.bottom = `${this.win.innerHeight - bottom + 12}px`;
    panel.style.maxHeight = `${bottom - top - 24}px`;
    panel.classList.toggle('bui-shortcut-guide-narrow', width < 460);
  }

  cancel(immediate = false) {this.blocked = this.held; this.hide(immediate);}
  private hide(immediate = false) {
    if (this.timer !== undefined) this.win.clearTimeout(this.timer);
    this.timer = undefined;
    this.resize?.disconnect(); this.resize = undefined;
    this.origin = undefined;
    const panel = this.panel; this.panel = undefined;
    this.clearLeaving();
    if (!panel) return;
    if (immediate || this.motion?.matches) {panel.remove(); return;}
    panel.inert = true; panel.setAttribute('aria-hidden', 'true');
    panel.classList.add('is-leaving'); this.leaving = panel;
    this.exitTimer = this.win.setTimeout(() => this.clearLeaving(), 160);
  }
  private clearLeaving() {
    if (this.exitTimer !== undefined) this.win.clearTimeout(this.exitTimer);
    this.exitTimer = undefined; this.leaving?.remove(); this.leaving = undefined;
  }
  reset() {
    this.held = false; this.blocked = false; this.pointerDown = false; this.composing = false;
    this.down.clear(); this.hide(true);
  }
  dispose() {
    this.disposed = true; this.reset();
    for (const cleanup of this.cleanup) cleanup();
    this.cleanup = [];
  }
}
