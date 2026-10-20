# Validation — 0.9.2 bottom-centered formatting guide

## Real Obsidian validation — 2026-10-20

Tested on **Darwin arm64, macOS 26.5.2**, with actual **Obsidian 1.14.4** (installer 1.13.7). The marked temporary vault created for 0.9.1 was reused with the 0.9.2 plugin files. No personal vault was modified.

- **130/130** automated tests pass. Added coverage includes visible-pane geometry, pane resize observation and cleanup, keyboard category tabs, old/new animation isolation and reduced motion.
- **27/27** real-app formatting checks pass: [report](MAC-0.9.2-FORMAT.json). The final run has no transport warnings and no captured runtime errors.
- Actual key, mouse and IME events verify the original Shift/star behavior, native undo, read-only category switching, preserved editor focus, Escape, file changes, raw mode, pause and unload.
- A real vertical split and sidebar expansion verify that the sheet remains centered in the active writing pane with 12 px bottom clearance. At 320/393/1024 CSS pixels in both themes, document geometry stays unchanged, syntax is 24 px and labels are 16 px. English labels fit the narrow layout.
- Entry/exit animations and rapid reopen are tested in the actual renderer. Emulated reduced motion removes both animations. A 393 × 430 window keeps the card area scrollable with the controls visible. At 1024 × 240 and 1024 × 280, the whole sheet scrolls and every card remains reachable.

The prior release's 24 writing/Bases checks remain historical evidence below; they were not rerun for this presentation change. The full automated suite includes those existing model regressions. The offline gallery contains 18 actual-app captures of the current guide and writing/library examples. Its browser check loads all 18 captures at each of 320/393/1024 px without horizontal overflow or page errors. Narrow desktop viewports do not certify physical phone behavior.

The earlier user-used 0.6.0 test vault was also updated by replacing only the three plugin files. They match the final 0.9.2 build byte for byte, the plugin loads as 0.9.2, and its existing Home.md remains byte-identical.

### Presentation and lifecycle

The sheet uses the intersection of the active writing pane and visible viewport, rather than the whole window, for positioning and size limits. ResizeObserver tracks split and sidebar changes. The Paragraph and Text tabs show only one group at a time. Closing ends interaction immediately while a separate inert node finishes its 140 ms exit. A new opening, file change, blur or plugin unload cleans up the old animation. System reduced motion skips the 240 ms entry and the exit.

Review found that fixed controls could squeeze the cards to zero height in very short panes. When available sheet height is below 280 px, the entire sheet scrolls without reducing font size; the final real-app checks cover reaching its footer and returning to the close control. Normal-height panes retain separate body scrolling.

### Reproduce

```sh
npm ci
npm run build
npm test
npm run prepare:test-vault
# Open the marked vault in actual Obsidian and enable Nebula Focus and Bases.
node scripts/obsidian-format-smoke.cjs /absolute/path/to/the/test-vault
node scripts/capture-writing-examples.cjs /absolute/path/to/the/test-vault
node scripts/demo.mjs
```

Physical mobile keyboards/touch, the system IME candidate window, third-party themes and minimum-version Obsidian 1.9.0 remain unverified.

---

# Previous validation — 0.9.1 formatting guide and literal stars

## Real Obsidian validation — 2026-10-20

Confirmed **Darwin arm64, macOS 26.5.2**, with **Obsidian 1.14.4** (installer 1.13.7). A fresh marked temporary vault was used so the owner's edits in the previous test vault remained intact. No personal vault was modified.

- **125/125** automated tests pass, including real CodeMirror DOM tests, parser range/incremental-cache cases, keyboard lifecycle tests and previous library/legacy regressions.
- **19/19** real-app formatting checks: [report](MAC-0.9.1-FORMAT.json). Native key events reproduce Shift+8, complete an italic pair, undo it, create a list, hold/release Shift and select with Shift+Arrow. Native IME input, fixed-menu focus, Escape, file changes, pause, raw mode and unload are covered.
- **24/24** real-app continuous-writing and native Bases checks: [report](MAC-0.9.1-WRITING.json). This includes Chinese input, heading geometry, native history, optional properties, membership and delayed-save preservation.

Both final reports have no transport warnings and empty captured runtime-error buffers. Guide geometry remains within the viewport at 320, 393 and 1024 CSS pixels in light and dark themes, without shifting the document. The offline gallery contains 18 actual-app captures; all load without horizontal overflow or browser errors at each of those widths. Narrow desktop viewports do not certify physical mobile behavior.

### Root cause and repairs

The real editor stored only `*普通文字 Alpha。`, but its stream highlighter emitted italic spans through the rest of the paragraph. Nebula's CSS hid that unmatched star, making the format change unexplained. A visual CodeMirror extension now checks independent CommonMark source ranges, keeps an unmatched leading star visible and clears only spurious italic styling. Completed and multiline emphasis remain native. Source text, selection and native automatic-pair settings are preserved. Incremental parser fragments avoid reparsing every unchanged block on each keystroke in long documents.

The guide never performs an editor transaction. Shift starts a 600 ms timer only within the active writing editor; chords, selections, IME, pointer actions and blur cancel it. The fixed version supports focus and Escape. Testing repaired two additional lifecycle issues: a captured element blur incorrectly closing fixed help, and a second Shift not dismissing already visible temporary help.

The correction is intentionally limited to ordinary top-level paragraphs beginning with one star. YAML, HTML, lists, headings, quotes and paragraphs containing Obsidian wiki links, comments or math keep native rendering. No broader Markdown parser replacement is claimed. Third-party themes/plugins and physical iPhone/Android keyboards remain unverified.

---

## Previous release — 0.9.0 continuous writing and optional libraries

## Real Obsidian validation — 2026-10-20

Host confirmed as **Darwin arm64, macOS 26.5.2**, running **Obsidian 1.14.4** (installer 1.13.7). The installed plugin files match the release candidate byte for byte. Work was confined to the marked temporary test vault; the personal vault was not changed.

- **102/102** model and simulated-host tests pass, including managed library scope, concurrent membership deltas, native delayed-save synchronization, disk failure, mode persistence and all legacy regressions.
- **24/24** new real-app writing/library checks: [report](MAC-0.9.0-WRITING.json).
- **24/24** real-app legacy/general checks: [report](MAC-0.9.0-REGRESSION.json).
- **16/16** real-app legacy block checks: [report](MAC-0.9.0-BLOCKS.json).
- **16/16** real-app legacy editing/history checks: [report](MAC-0.9.0-EDITOR.json).

All four final reports have empty captured runtime-error buffers. The writing and general runs each recorded one CLI child timeout after returning a complete evaluation response. The bounded transport accepted the completed response without repeating the operation. The other two reports have no transport warnings.

The writing driver exercises the real native editor with Chromium IME composition, key input, cross-paragraph replacement, Cmd+Z and Shift+Cmd+Z. Heading and bold text retain identical measured rectangles and fonts on entering text. Explicit raw mode remains selected after deferred file-open notifications. Existing YAML properties are hidden by default and can be toggled explicitly without rewriting the note.

The library driver verifies that creation, membership changes, adding columns and empty-cell focus/blur do not modify Markdown. Typing in a real native table cell writes only that note's property; the uncollected note remains byte-identical. Native view configuration retains membership; a real mouse click on a native card opens continuous writing. It also covers removal without deleting values, multiple libraries, rename tracking, immediate navigation after creating a note, ordinary native bases and pause/resume.

At **320, 393 and 1024 CSS pixels**, default light/dark writing and library toolbars fit the actual app panes. The screenshots in the offline gallery are the shipped example notes in real Obsidian: [writing](ui-0.9.0-writing-light.png), [library](ui-0.9.0-library-light.png). The gallery is a read-only screenshot viewer, not an editor simulation. Its browser check loads all 12 captures at each of the three viewport widths without horizontal overflow or page errors.

### Issues found and repaired

- A native Bases TextFileView could save stale configuration on navigation and erase a just-added membership. Native changes are now flushed before a library mutation, then the public view data/cache is synchronized after the atomic file update. Simulated races and actual create-and-immediately-open behavior are covered.
- Obsidian's deferred file-open notification could undo an explicit switch to Markdown source. File identity is now observed before the toolbar is displayed, so a late notification cannot replace the user's newer mode choice.
- Native styling for notes that already contain frontmatter overrode the first property-hiding rule. The scoped writing rule now takes precedence; tests include existing values and both directions of the explicit toggle.
- Driver timing was tightened to wait for editor content and native menu actions. Card opening uses a real pointer position because the native card view resolves its target from coordinates.

### Reproduce

```sh
npm ci
npm run build
npm test
npm run prepare:test-vault
# Open the printed marked vault in actual Obsidian and enable Nebula Focus and Bases.
node scripts/obsidian-writing-smoke.cjs /absolute/path/to/the/test-vault
# These drivers explicitly select the optional legacy layout and Legacy Home fixture:
node scripts/obsidian-smoke.cjs /absolute/path/to/the/test-vault
node scripts/obsidian-block-smoke.cjs /absolute/path/to/the/test-vault
node scripts/obsidian-editor-smoke.cjs /absolute/path/to/the/test-vault
# Restore writing/Home, capture only shipped examples, then build the offline gallery:
node scripts/capture-writing-examples.cjs /absolute/path/to/the/test-vault
node scripts/demo.mjs
```

The main.js tested has SHA-256 `015f2abc0170318ba5c7434fb05d8122fd4899159a07977c6e0ba2e56903b5a1`; styles.css has `902b406bd036354f9f7c163fbd7c7df408ba037a107b9d7f853ba6672247ea9b`.

Physical iPhone/Android keyboards, touch, the system Chinese candidate window, third-party themes and minimum-version 1.9.0 are not certified by this Mac 1.14.4 run. Links, code, math and other complex syntax retain native Live Preview editing behavior; the common heading/emphasis markers receive the stable presentation styles. Plain writing uses Obsidian's own save/history/recovery, while the legacy draft cache belongs only to the optional legacy editor. Renames while the plugin is unloaded may require reselecting library members.

---

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
