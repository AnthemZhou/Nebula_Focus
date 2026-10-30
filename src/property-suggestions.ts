import {AbstractInputSuggest, App} from 'obsidian';

type Native = any;
type Patch = {name: string; original: Native; wrapper: Native; descriptor?: PropertyDescriptor};
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
  private instances = new WeakMap<HTMLElement, Native>();
  private prototype = (AbstractInputSuggest as Native)?.prototype;

  constructor(private app: App) {}

  /** Call on each existing plugin scan. No view/editor recreation is needed. */
  refresh(root: ParentNode) {
    if (!this.active && !this.install()) return;
    const doc = (root as Node).ownerDocument ?? root as Document;
    const input = doc.activeElement as HTMLElement | null;
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
    const owner = this, generation = ++this.generation;
    for (const name of names) {
      const original = target[name], descriptor = Object.getOwnPropertyDescriptor(target, name);
      const wrapper = function(this: Native, ...args: Native[]) {
        if (owner.active && owner.generation === generation && owner.isPropertySuggest(this)) {
          const input = this.textInputEl ?? this.inputEl;
          owner.instances.set(input, this);
          if (owner.suppressedInput(input, this.context.key, this.getValue?.())) {
            owner.dismiss(this);
            return;
          }
        }
        return original.apply(this, args);
      };
      target[name] = wrapper;
      this.patches.push({name, original, wrapper, descriptor});
    }
    return true;
  }

  private isPropertySuggest(suggest: Native): boolean {
    const input = suggest?.textInputEl ?? suggest?.inputEl;
    return suggest?.app === this.app && typeof suggest.context?.key === 'string' &&
      suggest.suggestEl?.classList?.contains('mod-property-value') &&
      input?.nodeType === 1 && typeof suggest.close === 'function';
  }

  private keyFor(input: HTMLElement): string | null {
    return input.closest<HTMLElement>('.metadata-property[data-property-key]')?.dataset.propertyKey ??
      input.closest<HTMLElement>('.bases-td[data-property]')?.dataset.property ?? null;
  }

  private suppressedInput(input: HTMLElement, explicitKey?: string, value?: unknown): boolean {
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

  private dismiss(suggest: Native) {
    suggest.runnable?.cancel?.();
    suggest.manager?.runnable?.cancel?.();
    suggest.close();
    // Native close clears values when isOpen; also clear a pending/closed
    // chooser so a stale async result cannot remain selected offscreen.
    suggest.suggestions?.setSuggestions?.([]);
  }

  private dismissExistingPopup(input: HTMLElement, doc: Document) {
    const key = this.keyFor(input);
    if (!key) return;
    const popups = [...doc.querySelectorAll<HTMLElement>('.suggestion-container.mod-property-value[data-property-key]')];
    const popup = popups[popups.length - 1];
    if (!popup || normalize(popup.dataset.propertyKey ?? '') !== normalize(key)) return;
    const scope = (this.app as Native).keymap?.getWindowStack?.(doc.defaultView)?.scope;
    const bindings = scope?.keys;
    if (!Array.isArray(bindings)) return;
    // Verify the specific native property-value scope before calling its Escape
    // callback. No keyboard event is dispatched to the editor, so its own Escape
    // handler cannot revert text, blur, commit, or interrupt IME composition.
    if (!['ArrowUp', 'ArrowDown', 'Enter', 'Tab', '#', '^'].every(key => bindings.some(binding => binding.key === key))) return;
    const escape = bindings.find(binding => binding.key === 'Escape' && typeof binding.func === 'function' &&
      /\.onEscapeKey\(/.test(Function.prototype.toString.call(binding.func)));
    if (!escape) return;
    escape.func(new doc.defaultView!.KeyboardEvent('keydown', {key: 'Escape'}));
  }

  clear() {
    this.active = false; this.generation++;
    for (const patch of this.patches) if (this.prototype[patch.name] === patch.wrapper) {
      if (patch.descriptor) Object.defineProperty(this.prototype, patch.name, patch.descriptor);
      else delete this.prototype[patch.name];
    }
    this.patches = [];
  }
}
