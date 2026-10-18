# Validation — 0.8.0 continuous editing and recovery

## Real Obsidian validation — 2026-10-18

Host confirmed as **Darwin arm64, macOS 26.5.2**, running actual **Obsidian 1.14.4** (installer 1.13.7). Changes and injected write failures were confined to the marked temporary test vault. The personal vault was not modified.

- **90/90** model and simulated-host tests pass, including delayed-write and delayed-render navigation races.
- **24/24** real-app general regression checks: [report](MAC-0.8.0-REGRESSION.json).
- **16/16** real-app atomic block checks: [report](MAC-0.8.0-BLOCKS.json).
- **16/16** new real-app editor workflow checks: [report](MAC-0.8.0-EDITOR.json).
- All three final real-app runs completed consecutively against the final candidate build with empty captured error buffers. The block run recorded one CLI child timeout after returning a complete CDP response; the driver accepted that completed response without retrying the operation. The other two runs have no transport warnings.

New checks cover local and saved undo/redo, exact CRLF source restoration, split/merge and caret continuity, boundary navigation, eight block styles, safe refusal of nested structure conversion, empty-list exit, separate recovery drafts, individual cache deletion, complete multiline-paste recovery and retry after an injected Vault.process failure, external edit protection, cleared Setext titles, hard breaks and literal entity labels. The native Mac style menu was additionally opened and used through accessibility control; native Cmd+Z restored a format conversion. Automated workflow events and controller calls use the real Obsidian implementation; they do not certify every physical-keyboard or mobile interaction.

At **320, 393 and 1024 CSS pixels**, in default light and dark themes, tested title, paragraph and list-item rectangles, fonts, line heights, margins, padding, borders and backgrounds remain identical before, during and after editing. The new style controls and two-row draft recovery dialog also fit at 320px. Screenshots were visually inspected: [reading](ui-0.8.0-reading-light.png), [editing](ui-0.8.0-editing-light.png), [dark editing](ui-0.8.0-editing-dark.png), [recovery drafts](ui-0.8.0-drafts-light.png).

The generated offline preview also passes a real headless Chromium check at 320/393/1024px: native-content hiding, unchanged editing geometry, style-menu conversion, menu undo and keyboard redo/undo, covers, responsive columns, restoration and card navigation, with no browser page errors. The simulated host now matches Obsidian’s view-content wrapper; the demo no longer exposes its hidden native Markdown stub above the page.

### Issues found and repaired

- A single recovery slot allowed saving another block to erase an earlier cancelled draft. Drafts now have independent identities; successful writes clear only their own cache. The recovery action refreshes immediately when an edit closes, including rapid cancellation.
- A failed multiline paste omitted pasted text from recovery because it was still in detached nodes. Structural operations now persist the intended complete source before writing and retain a retryable pending operation.
- A retry could wait on its own pending save when restoring the editor. Internal caret resumption avoids that wait.
- Pending undo/redo or structure rendering could leave a newly opened note blank, reuse an old source offset in it, or target its history. Operations retain file identity, recheck render generation and validate blank insertion positions; writes lock input until completion.
- Setext deletion, literal heading hashes, reference links, hard breaks, code spaces, adjacent emphasis and Markdown-looking plaintext needed safer mapping/serialization.
- Earlier real-app runs exposed outdated single-draft assertions and a screenshot CLI timeout. The final complete runs above supersede those intermediate results.

### Reproduce

```sh
npm ci
npm run build
npm test
npm run prepare:test-vault
# Open the printed marked vault in actual Obsidian and enable the plugin.
node scripts/obsidian-smoke.cjs /absolute/path/to/the/test-vault
node scripts/obsidian-block-smoke.cjs /absolute/path/to/the/test-vault
node scripts/obsidian-editor-smoke.cjs /absolute/path/to/the/test-vault
```

Desktop viewport emulation is not a physical iPhone/Android test. Mobile keyboards, touch/long-press, system IME candidate windows and third-party themes/renderers remain unverified. Complex content and nested structure conversion use the native editor. Undo is held in memory (60 saved transactions per file, 4 MiB total per page instance); persistent recovery caches are separately bounded at 20 drafts per file. The HTML preview is a simulated host. Effie remains a reference based on its official documentation, not a claim of a hands-on Effie test.

---

# Validation — 0.7.0 atomic in-place editing

## Real Obsidian validation — 2026-10-17

Host confirmed again as **Darwin arm64, macOS 26.5.2**; actual Obsidian **1.14.4**, installer 1.13.7. All edits were tested in the marked temporary vault. The owner's personal vault was not modified.

- **40/40** model and simulated-host tests pass.
- **24/24** real Obsidian regression checks pass in one complete final run: [raw report](MAC-0.7.0-REGRESSION.json).
- **16/16** additional real-app block-editing checks pass in one complete final run: [raw report](MAC-0.7.0-BLOCKS.json).
- Both final runs have an empty captured runtime-error buffer and no CLI response-timeout warnings.

The new driver verifies that headings and paragraphs edit as separate DOM leaves, preserve bold/link formatting after saving and reopening, and change only their own Markdown span. It also covers nested list items and task checkboxes, quoted paragraphs, setext/empty headings, multiline plain-text paste, and leaving complex Markdown with its renderer. Chromium input commands exercise real Enter/new-paragraph typing and Chinese composition in paragraphs; the general regression also checks title composition.

At **320, 393 and 1024 CSS pixels**, in both default light and dark themes, the driver measures every tested heading, paragraph and list item's rectangle, font size/weight, line height, margins, padding, borders and background before, during and after editing. All measurements remain identical. The test uses desktop Electron viewport emulation, not a physical phone.

Actual screenshots were inspected: [reading](ui-0.7.0-reading-light.png), [editing a heading](ui-0.7.0-editing-light.png), [narrow dark editing](ui-0.7.0-editing-dark.png). This caught the floating controls overlapping the desktop status bar; their bottom offset was corrected. No textbox frame is added to the content.

### Failures reproduced and fixed

The real vault's asynchronous modify event forced a whole-page render immediately after a save, replacing DOM references and interrupting the newly inserted paragraph. The refresh now checks the current file's revision and retains the existing DOM for its own completed writes; changes to other files can still refresh gallery metadata. Block bindings are recalculated over the complete body, so clearing a section heading cannot shift the source mapping of neighbouring duplicate paragraphs. Desktop Enter is handled directly, while beforeinput remains available for software keyboards.

An intermediate test run also encountered the existing macOS CLI issue where a child printed its completed response but did not exit. The runner accepts only complete structured evaluation/CDP responses or returned screenshot paths in that case and records a transport warning; it never retries a write. One completed plugin-reload CLI child required termination before the final tests could start. The Obsidian app stayed running.

### Reproduce

```sh
npm ci
npm run build
npm test
npm run prepare:test-vault
# Open the printed, marked vault in real Obsidian and enable Nebula Focus.
node scripts/obsidian-smoke.cjs /absolute/path/to/the/test-vault
node scripts/obsidian-block-smoke.cjs /absolute/path/to/the/test-vault
```

The HTML demo uses a simulated host and is not evidence of real Obsidian behavior. Design references came from Effie's official documentation; this does not claim a hands-on Effie app test. Physical iOS/Android keyboards, touch/long-press, system IME candidate windows, third-party themes and renderers remain unverified. Code, tables, formulas, embeds and other complex constructs use the native editor. Dragging still operates on layout sections, independently of atomic text editing.

---

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
