# Nebula Focus 1.0.0 validation

Tested on macOS with actual Obsidian desktop 1.14.5 on 2026-10-30.

The product under test is the current Notion-like native Bases interface only.
No tests or feature claims from earlier Nebula Focus products are counted as
1.0.0 validation.

## Automated checks

**86/86 automated tests pass.** `npm run build` performs strict TypeScript checking and produces the external-
Obsidian CommonJS bundle. `npm test` covers:

- automatic row heights, variable-height selection geometry and resize caches;
- semantic colors in tables, cards and note properties, stable unknown values,
  ordinary prose/media exclusion and unchanged relation links;
- title and column-label inline editing, Enter/blur, Escape, IME, stale views,
  read-only controls, external updates and native property transactions;
- tag selection/create/remove, list vs text values, pointer/keyboard reorder,
  serialized preference saves, failures and reload behavior;
- first-image covers, overdue dates, thumbnail enlargement and cleanup;
- suppression of irrelevant property suggestions without blocking explicit links;
- teardown during delayed settings load;
- release ZIP inclusion from the reviewed Git index, ignored/private files,
  staged blobs, symlink safety and checksum contents.

## Real-app checks performed

- The loaded plugin is `nebula-focus` version 1.0.0. The standalone development
  plugin is disabled. The only command is the current appearance toggle; the
  previous product's writing/navigation/library commands are absent.
- Clicking an idea title starts an inline text caret on the existing text, without
  opening a note or modal. A temporary typed draft is discarded with Escape.
- The “打开” button navigates to the existing Markdown note through its native
  link. Editing saves are covered by native-transaction unit tests, not described
  as a completed live-vault save test.
- Platform and content type values render as colored tags in the actual native
  publishing table. The existing controls remain editable.
- ⌘⌥U removes all custom tag/title/card decoration and restores native rendering;
  repeating it restores the optimized view. Sampled table fonts are identical
  between the two states (13.125 px / 15 px at the current UI zoom).
- The upgraded plugin was disabled/re-enabled successfully. The board retains
  first-image covers, overdue highlights and native new-item actions.
- A before/after SHA-256 inventory of 307 non-configuration vault files is
  identical: no Markdown, Base, image or other content file changed during these
  visual/cancel/navigation checks. Private paths and hashes are not published.

Minimum-version 1.14.4, third-party themes, touch/mobile and arbitrary future
Obsidian versions were not tested here. 1.0.0 is desktop-only. Guarded internal
Bases adapters should be rechecked after host upgrades. Public examples contain
fictional notes only; release packages contain no user vault or migration backup.
