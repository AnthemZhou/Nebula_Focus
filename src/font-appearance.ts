export type FontChoice = 'default' | 'lxgw-wenkai';
export const BUNDLED_FONT_FAMILY = 'Nebula Focus WenKai';
export const BUNDLED_FONT_CLASS = 'bui-font-wenkai';

export function readFontChoice(value: unknown): FontChoice {
  return value === 'lxgw-wenkai' ? value : 'default';
}

export interface FontPreferences {
  get(): FontChoice;
  set(value: FontChoice): Promise<boolean>;
  mount(doc: Document): void;
}

type FontState = {wanted: boolean; face?: FontFace; ready: boolean; failed?: boolean};

/** Load the bundled font only on selection, separately for each renderer.
 * A late WebKit load must never re-enable it after a native-mode switch/unload. */
export class FontAppearance {
  private states = new Map<Document, FontState>();
  private stopped = false;

  constructor(private source: string, private changed: () => void, private failed: (error: unknown) => void) {}

  sync(doc: Document, wanted: boolean): void {
    if (this.stopped) return;
    const previous = this.states.get(doc);
    if (previous) {
      previous.wanted = wanted;
      this.apply(doc, previous);
      // Retry only after an explicit off/on selection, never on every scan.
      if (!wanted && previous.failed) this.forget(doc);
      return;
    }
    if (!wanted) {doc.body?.classList.remove(BUNDLED_FONT_CLASS); return;}
    const state: FontState = {wanted, ready: false};
    this.states.set(doc, state);
    try {
      const Font = doc.defaultView?.FontFace;
      if (!Font || !doc.fonts) throw new Error('当前环境无法加载内置字体');
      const face = new Font(BUNDLED_FONT_FAMILY, `url("${this.source}")`, {weight: '400', style: 'normal', display: 'swap'});
      state.face = face;
      void face.load().then(() => {
        if (this.stopped || this.states.get(doc) !== state) return;
        doc.fonts.add(face);
        state.ready = true;
        this.apply(doc, state);
      }).catch((error: unknown) => {
        if (this.stopped || this.states.get(doc) !== state) return;
        state.failed = true;
        if (state.wanted) this.failed(error);
        else this.forget(doc);
      });
    } catch (error) {state.failed = true; this.failed(error);}
  }

  private apply(doc: Document, state: FontState): void {
    const enabled = state.wanted && state.ready;
    if (!doc.body || doc.body.classList.contains(BUNDLED_FONT_CLASS) === enabled) return;
    doc.body.classList.toggle(BUNDLED_FONT_CLASS, enabled);
    this.changed();
  }

  forget(doc: Document): void {
    const state = this.states.get(doc);
    this.states.delete(doc);
    doc.body?.classList.remove(BUNDLED_FONT_CLASS);
    if (state?.face) doc.fonts?.delete(state.face);
  }

  destroy(): void {
    this.stopped = true;
    for (const doc of this.states.keys()) this.forget(doc);
  }
}
