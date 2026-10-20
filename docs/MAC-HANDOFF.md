# Mac continuation — Nebula Focus 0.6.0

**2026-10-20 follow-up:** 0.9.1 adds hold-Shift formatting help and repairs unmatched leading-star presentation. 125 automated tests and 43 current real-app checks pass in a fresh 0.9.1 temporary vault; previous test-vault edits were preserved. See TESTING.md for scope and reports.

**2026-10-20 follow-up:** 0.9.0 makes continuous native writing the default and adds independent optional Bases libraries with on-demand note properties. 102 automated and 80 real-app checks pass on this Mac. Native delayed-save synchronization, deferred file-open mode resets and property-panel CSS precedence were repaired. See README.md, PAGE-FORMAT.md and TESTING.md for current behavior and evidence. Legacy layouts remain opt-in.

**2026-10-18 follow-up:** 0.8.0 adds editing history, block formatting, merge/navigation and independent recovery drafts. See TESTING.md for the current real-app evidence.

**2026-10-17 follow-up:** 0.7.0 adds atomic, in-place text editing based on the user’s Effie reference. Current behavior and real-app evidence are in README.md and TESTING.md. The historical handoff below describes the earlier section editor.

**2026-10-17 update:** The source bundle has been continued on macOS 26.5.2 (Apple Silicon), with the real Obsidian 1.14.4 app. Three host-layout failures were reproduced and repaired: clipped card captions, clipped preset-cover names, and two-column layout in narrow desktop panes. Current results and remaining physical-device checks are recorded in [TESTING.md](TESTING.md). The original cloud handoff below is retained as history.

This source bundle includes the audited 0.6.0 implementation, compiled `main.js`, examples, build lockfile, regression tests and release workflow. The audit ran in a Linux cloud terminal, not on the owner's Mac. Do not mark Mac/iPhone validation complete from the automated results below.

Cloud status on 2026-10-16: `uname -s` returned Linux. GitHub source upload was retried after the audit and returned HTTP 403, `Resource not accessible by integration`; no branch, commit or release was published remotely. The last observed remote main is the initial commit a031dd92c496f0c1ffafa302cf6f8d433e5d8d90. Local audit commit in the cloud checkout: 213271d. The source ZIP is the continuation artifact; it does not include that checkout’s .git history.

Target repository: https://github.com/AnthemZhou/Nebula_Focus
License: GPL-3.0-only, matching the owner's Smart Align Nodes Blender add-on.

## Continue from this source folder

Open the extracted `nebula-focus` folder in a locally running coding session. First confirm `uname -s` prints `Darwin` and inspect any applicable local AGENTS.md. Do not overwrite an existing working checkout or the user's actual Obsidian vault.

Run:

```sh
npm ci
npm run build
npm test
npm run prepare:test-vault
```

The last command creates a new uniquely named temporary test vault, copies the example notes and attachments, and installs the plugin with desktop support enabled. It prints the absolute folder path. In the actual Mac Obsidian app, open that folder as a vault, enable community plugins if requested, then open Home.md.

## Original real-Obsidian handoff checklist

- Click to edit title and text; confirm Chinese IME, blur/Done/Cancel, reopen and persistence.
- Change built-in/uploaded covers, crop, icon and columns; drag vertically and horizontally; verify the exact Markdown and attachments.
- Keep an unsaved edit, modify the same note externally, then save. Confirm the external text survives and the recovery draft remains available.
- Switch notes, native mode, and pause/unload with pending input. Confirm recoverable drafts and all native controls return.
- Try internal links, embeds, code, tables, tasks, footnotes, search, native panes and narrow widths. The renderer is per-section and does not promise full Notion or third-party renderer compatibility.
- Check actual iPhone touch/keyboard separately; Mac results cannot certify iOS.

Record actual results and observed failures in docs/TESTING.md. Fix failures before calling this a tested release.

## Upload through the owner's local GitHub CLI

Check `gh auth status` without printing tokens, and confirm the authenticated owner is AnthemZhou. If a local authenticated session is available, reuse it. First inspect the remote repository's latest history and any existing local edits.

If the repository still only has the initial commit, clone it into a fresh separate checkout and copy this source tree over it while preserving the clone's `.git`. Exclude node_modules, dist and test-results. Add the source files and new scripts, then review the diff before committing and pushing. Do not force-push. An existing review branch may be used instead if cloud upload succeeded; verify its contents against this bundle.

The release workflow on main publishes a prerelease when the manifest version is added/changed, or on an exact version tag/manual run. It attaches main.js, manifest.json, styles.css and the complete source ZIP. Inspect the workflow and its outcome; do not claim GitHub publication or Obsidian community approval without their actual URLs/results.

Public community submission is a separate step from GitHub Release. The current release remains experimental until real-device checks are complete.
