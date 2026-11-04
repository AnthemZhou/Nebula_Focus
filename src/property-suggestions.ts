import {AbstractInputSuggest, App} from 'obsidian';

type NativeMethod = (this: unknown, ...args: unknown[]) => unknown;
type PropertySuggest = Record<string, unknown> & {context: {key: string}; close: NativeMethod};
type Patch = {name: string; original: NativeMethod; wrapper: NativeMethod; descriptor?: PropertyDescriptor};
const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' ? value as Record<string, unknown> : undefined;
const isMethod = (value: unknown): value is NativeMethod => typeof value === 'function';
/** These editors can belong to another window, so avoid the global Element constructor. */
function suggestInput(suggest: Record<string, unknown>): Element | undefined {
  const input = suggest.textInputEl ?? suggest.inputEl, value = record(input);
  return value?.nodeType === 1 && typeof value.tagName === 'string' &&
    typeof value.closest === 'function' && typeof value.matches === 'function' ? input as Element : undefined;
}
function callMethod(target: unknown, name: string, ...args: unknown[]): unknown {
  const object = record(target), method = object?.[name];
  return isMethod(method) ? method.apply(object, args) : undefined;
}
const CLASSIFICATIONS = new Set(['状态', '类型', '重要性', '领域', '优先级', '分类', '发布平台', '内容类型',
  'status', 'type', 'priority', 'area', 'domain']);
const normalize = (key: string) => key.replace(/^note\./, '').normalize('NFC').trim().toLowerCase();

/** Disable property-history completion for free prose and media, while keeping
 * native editing and explicitly requested [[ link completion intact.
 *
 * Obsidian 1.14.5's property suggest inherits AbstractInputSuggest. Closing the
 * actual suggest removes its keymap scope and selected values; hiding its DOM
 * would leave Enter/Tab capable of accepting an invisible old value.
 */
export class PropertySuggestions {
  private patches: Patch[] = [];
  private active = false;
  private generation = 0;
  private instances = new WeakMap<Element, PropertySuggest>();
  private prototype = record(AbstractInputSuggest?.prototype);

  constructor(private app: App) {}

  /** Call on each existing plugin scan. No view/editor recreation is needed. */
  refresh(root: ParentNode) {
    if (!this.active && !this.install()) return;
    const doc = (root as Node).ownerDocument ?? root as Document;
    const input = doc.activeElement;
    if (!input || !this.suppressedInput(input)) return;
    const instance = this.instances.get(input);
    if (instance) {this.dismiss(instance); return;}
    // A popup may already be open when the presentation is enabled. This is
    // the only case whose suggest instance predates all our wrappers.
    this.dismissExistingPopup(input, doc);
  }

  private install(): boolean {
    const target = this.prototype;
    if (!target) return false;
    const names = ['onInputChange', 'showSuggestions'];
    if (names.some(name => typeof target[name] !== 'function' || (() => {
      const descriptor = Object.getOwnPropertyDescriptor(target, name);
      return descriptor && !descriptor.configurable && !descriptor.writable;
    })())) return false;
    this.active = true;
    const generation = ++this.generation;
    const suppress = (suggest: unknown) => {
      if (!this.active || this.generation !== generation || !this.isPropertySuggest(suggest)) return false;
      const input = suggestInput(suggest);
      if (!input) return false;
      this.instances.set(input, suggest);
      if (!this.suppressedInput(input, suggest.context.key, callMethod(suggest, 'getValue'))) return false;
      this.dismiss(suggest);
      return true;
    };
    for (const name of names) {
      const original = target[name], descriptor = Object.getOwnPropertyDescriptor(target, name);
      if (!isMethod(original)) continue;
      const wrapper = function(this: unknown, ...args: unknown[]) {
        if (suppress(this)) return;
        return original.apply(this, args);
      };
      target[name] = wrapper;
      this.patches.push({name, original, wrapper, descriptor});
    }
    return true;
  }

  private isPropertySuggest(suggest: unknown): suggest is PropertySuggest {
    const value = record(suggest);
    if (!value || value.app !== this.app || typeof record(value.context)?.key !== 'string' ||
      !suggestInput(value) || !isMethod(value.close)) return false;
    return callMethod(record(value.suggestEl)?.classList, 'contains', 'mod-property-value') === true;
  }

  private keyFor(input: Element): string | null {
    return input.closest<HTMLElement>('.metadata-property[data-property-key]')?.dataset.propertyKey ??
      input.closest<HTMLElement>('.bases-td[data-property]')?.dataset.property ?? null;
  }

  private suppressedInput(input: Element, explicitKey?: string, value?: unknown): boolean {
    const rawKey = explicitKey ?? this.keyFor(input);
    if (!rawKey) return false;
    const key = normalize(rawKey);
    if (CLASSIFICATIONS.has(key)) return false;
    const text = typeof value === 'string' ? value :
      input.tagName === 'INPUT' || input.tagName === 'TEXTAREA' ? (input as HTMLInputElement).value : input.textContent ?? '';
    // Match the native link branch exactly. Plain URLs/pasted text still use
    // the original editor's normal commit behavior without history suggestions.
    if (text.startsWith('[[')) return false;
    return key === '文件和媒体' || input.matches('.metadata-input-longtext');
  }

  private dismiss(suggest: PropertySuggest) {
    callMethod(suggest.runnable, 'cancel');
    callMethod(record(suggest.manager)?.runnable, 'cancel');
    suggest.close();
    // Native close clears values when isOpen; also clear a pending/closed
    // chooser so a stale async result cannot remain selected offscreen.
    callMethod(suggest.suggestions, 'setSuggestions', []);
  }

  private dismissExistingPopup(input: Element, doc: Document) {
    const key = this.keyFor(input);
    if (!key) return;
    const popups = [...doc.querySelectorAll<HTMLElement>('.suggestion-container.mod-property-value[data-property-key]')];
    const popup = popups[popups.length - 1];
    if (!popup || normalize(popup.dataset.propertyKey ?? '') !== normalize(key)) return;
    const stack = record(callMethod(this.app.keymap, 'getWindowStack', doc.defaultView));
    const values = record(stack?.scope)?.keys;
    if (!Array.isArray(values)) return;
    const bindings: unknown[] = values;
    // Verify the specific native property-value scope before calling its Escape
    // callback. No keyboard event is dispatched to the editor, so its own Escape
    // handler cannot revert text, blur, commit, or interrupt IME composition.
    if (!['ArrowUp', 'ArrowDown', 'Enter', 'Tab', '#', '^'].every(key => bindings.some(binding => record(binding)?.key === key))) return;
    if (!doc.defaultView) return;
    for (const binding of bindings) {
      const escape = record(binding), callback = escape?.func;
      if (escape?.key !== 'Escape' || !isMethod(callback) || !/\.onEscapeKey\(/.test(Function.prototype.toString.call(callback))) continue;
      callback.call(escape, new doc.defaultView.KeyboardEvent('keydown', {key: 'Escape'}));
      break;
    }
  }

  clear() {
    this.active = false; this.generation++;
    if (!this.prototype) return;
    for (const patch of this.patches) if (this.prototype[patch.name] === patch.wrapper) {
      if (patch.descriptor) Object.defineProperty(this.prototype, patch.name, patch.descriptor);
      else delete this.prototype[patch.name];
    }
    this.patches = [];
  }
}
