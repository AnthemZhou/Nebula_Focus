# Page format v1 — Nebula Focus 0.6.0

Portable data lives in the note, not plugin settings. `nf-title`, `nf-icon`, `nf-cover`, `nf-cover-y`, `nf-columns`, `nf-ratio` are reserved top-level scalar YAML keys. Plugin-generated strings use JSON-compatible double quotes. Keep values scalar; complex YAML values and duplicate owned keys are rejected when updating. All unrelated frontmatter and body bytes are preserved when a page setting changes.

Cover paths use quoted wikilinks so Obsidian can recognize the file reference. Cover placement is vertical 0–100 (center=50). Columns are 1 or 2; ratio denotes the first column's weight. The UI offers 35, 50 or 65; reader clamps to 25–75. At a pane width of ≤650px the renderer stacks in source order, including desktop split panes. No duplicate mobile layout is stored.

Sections begin at column-zero ATX `## ` headings outside fenced code, HTML/Obsidian comments and standalone display-math blocks; subheadings stay with their parent section. Leading content without a `##` is pinned above sections. Setext headings and complex HTML are not section boundaries. Dragging changes source order and normalizes whitespace between sections to blank lines; it does not rewrite each section's internal text. Other applications can read the source without this plugin.

`<!-- nf:view=cards -->` inside a section selects a gallery. Its data consists of explicit `- [[path|optional label]]` or `* [[path]]` lines. Target files remain authoritative. Card text and cover are read from the target's metadata; there is no query engine or status mutation.

Images are separate vault attachments. Built-in vector covers are copied to `Nebula Assets` on selection; user files are imported under a unique safe name. Removing a cover does not delete the image (other pages may reference it). Attachment cleanup and page ZIP export are not implemented.

Writing uses optimistic concurrency: read revision, transform, Vault.process compares exact source before replacing. A conflict leaves the file alone and retains the inline draft. Unsaved section and title drafts use Obsidian App.loadLocalStorage/saveLocalStorage (public since 1.8.7), scoped by vault and keyed by file path. Drafts are never auto-applied. Each note has one latest recovery slot; concurrently editing the same note in several panes can replace that slot. It is not the page format or a synced backup. Successful save removes the draft. Cancel preserves a recoverable draft rather than silently discarding it.

AI reading the raw note sees these few metadata fields and optional marker. No image bytes are encoded into Markdown. No automatic AI preprocessing exists in 0.6.0; an integration may filter nf-* and view markers while retaining content order, links, and captions. Rendering order is not a substitute for explicit semantic relationships.
