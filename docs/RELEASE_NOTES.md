# Nebula Focus 0.6.0 — experimental prerelease

Portable Obsidian pages with vault-backed covers, title/icon/crop settings, direct section editing, recoverable drafts, draggable sections, responsive columns and linked-note cards. Layout is stored in ordinary Markdown frontmatter; images stay in the vault. GPL-3.0-only.

Mac validation on 2026-10-17 used macOS 26.5.2 (Apple Silicon) and the real Obsidian 1.14.4 app. The build, 30 simulated-host/model tests and 24 real-app checks pass. This includes external filesystem conflicts, draft recovery, native fallback, attachments, Chromium IME composition, real split panes and 320/393/1024px light/dark layouts.

Fixed during real Mac testing:

- Card captions and cover-preset names were clipped by Obsidian's native button styles.
- Narrow desktop split panes stayed in two columns; responsive layout now follows the note pane width.
- Card accessible labels now follow the displayed target-note title.

Download the install ZIP, complete source ZIP, examples ZIP, or individual main.js/manifest.json/styles.css files. ZIP checksums are included. Desktop support is opt-in: disable “Mobile and tablet only” in the plugin settings.

Physical iOS/Android touch and keyboards, hardware macOS IME candidate windows, third-party themes/plugins and complex cross-section Markdown remain unverified. The small-screen checks use desktop Electron viewport emulation. This is a GitHub prerelease, not an Obsidian community-directory approval. See docs/TESTING.md for methods and limits.
