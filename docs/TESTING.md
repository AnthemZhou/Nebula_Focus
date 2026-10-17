# Validation — 0.6.1 visual refresh

## Real Obsidian validation — 2026-10-17

The refreshed UI was built and tested in the same isolated Mac vault on Obsidian 1.14.4. All **30 model/simulated-host tests** pass. **24 distinct real-app checks pass**: the full run passed 23/24, with a CLI timeout in the 1024px dark-layout request; a focused wide-layout rerun passed both light and dark checks. See [raw UI results](MAC-UI-TEST-RESULTS.json).

The driver now uses Chromium focus emulation while automating the renderer, because an inactive macOS window may change `activeElement` without dispatching blur. The original blur failure was reproduced with `document.hasFocus() === false` and no blur event. The focus emulation is removed and the debugger detached in `finally`. This validates renderer save behavior, not macOS focus management or a physical phone keyboard.

Actual app screenshots were inspected for the page, inline editor, cover picker and note navigator. This caught and fixed native-button centering of search results and a negative-margin clipping the navigation buttons. The light/dark page, card captions, 320/393px widths and narrow native split remain usable without horizontal overflow. The mobile CSS configuration produces 44px-high navigation targets. Screenshots: [light](ui-0.6.1-light.png), [dark](ui-0.6.1-dark.png).

No content schema or persistence changes are included. Physical iPhone/Android and third-party themes/plugins remain unverified. The earlier 0.6.0 evidence and limitations are retained below.

---

# Historical validation — 0.6.0

## Real Mac / Obsidian run — 2026-10-17

Host: macOS 26.5.2, Apple Silicon (`Darwin arm64`). Actual running app: Obsidian 1.14.4, installer 1.13.7. All plugin writes were confined to a newly generated temporary vault. The owner's existing vault was not used for plugin tests.

`npm run build` and all **30 model/simulated-host tests** pass. The real-app driver `scripts/obsidian-smoke.cjs` additionally runs **24 checks against the running Obsidian app**, with actual Vault/MarkdownRenderer/Workspace implementations, filesystem watchers, computed layout and Chromium IME. It does not substitute the simulated host.

| Area | Observed result |
| --- | --- |
| Reading | Source bytes unchanged; replacement page mounts and native content is hidden only while active. |
| Title and section edits | Chinese text, Done, blur, unchanged saves, reopen and Markdown persistence pass. |
| Cancel and navigation | Recovery cache remains available; pending text survives note switches, source mode, pause and unload. |
| External modification | A filesystem write while editing is detected; Save refuses to overwrite it and retains the draft. |
| Covers and images | Presets and uploaded PNG data create real attachments; crop and icon persist; body-image references are written to Markdown. |
| Dragging | Vertical and horizontal pointer sequences use the real layout and hit-testing; source order changes correctly. |
| Markdown | Internal links, note embeds, code, tables, task rendering and same-section footnotes display; internal links open their target. |
| Cards | Target-title changes refresh; card navigation works; captions fit without clipping. |
| Native fallback | Source/search, Canvas, pause and plugin unload restore native controls. Navigator search filters and opens notes. |
| Narrow panes | A real desktop split at ≤650px stacks sections; no horizontal overflow. |
| Appearance | 320/393/1024 CSS-pixel viewports, default light/dark themes, and caption/column checks pass. Screenshots were inspected. |
| Chinese composition | Chromium `Input.imeSetComposition` generates real composition events; Enter during composition keeps the editor open, and Enter after commit saves. |
| Runtime | Obsidian's captured error buffer is empty. |

Desktop UI operations also checked title editing with Chinese text, the macOS native page-appearance menu/cover dialog, and a native PNG file-picker upload. The imported bytes and Markdown attachment reference matched the selected file. Native menus are verified through desktop interaction; the automated runner invokes their page-controller operations directly because macOS menus are not DOM elements. File inputs and pointer events in the driver are programmatically supplied to the real renderer. These results do not claim human finger gestures or every OS input method.

### Failures reproduced and fixed

1. Obsidian's button styling constrained gallery cards to 84px while their contents required more height, clipping the titles. Plugin button selectors now override the native defaults, cards size to their contents, and captions have their own padded element and matching accessible name.
2. The cover picker inherited a horizontal button layout, clipping preset names beside the thumbnails. Presets now stack the label above a fixed-height thumbnail.
3. Responsive columns previously used the full window width, so a 340px split pane remained in two columns. A named CSS container now uses the actual note pane width.

Intermediate driver runs exposed a viewport CLI timeout and a focus check that ran before page redraw completed. The driver now waits for the complete render and verifies focus before testing blur. One viewport-check CLI request timed out during an intermediate run. The latest full run passed 23 checks; its external-conflict setup hit a CLI timeout. A focused rerun passed that remaining check, giving 24 distinct passing checks (see [raw results](MAC-TEST-RESULTS.json)); the driver now kills a timed-out CLI child and always restores theme/viewport overrides. No plugin exception was captured.

### Reproduce

```sh
npm ci
npm run build
npm test
npm run prepare:test-vault
# Open that new folder in real Obsidian and enable Nebula Focus.
node scripts/obsidian-smoke.cjs /absolute/path/printed/by/prepare-test-vault
```

The test vault contains `.nebula-focus-test-vault`; the runner refuses an unmarked vault. It creates its own QA notes and attachments and tests plugin disable/enable. It requires Obsidian's CLI and developer commands; set `OBSIDIAN_CLI` to override the default macOS binary. Keep the app open. Reports and screenshots are written to ignored `test-results/`.

## Remaining limits

Physical iOS/Android touch, long-press, native keyboard/safe areas, hardware macOS IME candidate windows and third-party themes/plugins remain unverified. Same-section Markdown tests do not establish cross-section footnote/reference resolution or full compatibility with every embed/postprocessor. Use the native editor when required. No community-directory submission is claimed.

The standalone HTML preview still uses a simplified host; its Playwright script was not used to certify this Mac release. The previous 2026-10-16 cloud audit passed 30 simulated tests but could not run its browser due to a missing/crashing Chromium binary. The Mac evidence above comes from actual Obsidian instead.
