# Writing and library format — Nebula Focus 0.9.0

## Ordinary notes

A note can be a completely plain Markdown file with no YAML. Opening, typing in, or collecting a note does not create a frontmatter template. The default continuous editor is Obsidian Live Preview, with scoped presentation styles. Obsidian owns text persistence and undo history. Explicit Markdown source mode preserves access to all syntax and metadata.

User-entered property values live in the individual note's native frontmatter. The writing surface hides the property panel by default; More → Show note properties reveals it for the current file. Switching files hides it again. Existing properties are never automatically deleted. Clearing an existing value in the native property editor follows Obsidian's behavior, which may leave an empty key; this is distinct from automatically creating fields on untouched notes.

## Independent libraries

A library is a native `.base` YAML file. For example:

```yaml
nebula-focus: 1
filters:
  and:
    - file.ext == "md"
    - or:
        - file.path == "Reading/One.md"
        - file.path == "Reading/Two.md"
views:
  - type: table
    name: Table
    order:
      - file.name
      - note.reading-status
  - type: cards
    name: Cards
    order:
      - file.name
      - note.reading-status
```

The `nebula-focus` marker identifies managed membership. The first two filter clauses restrict results to explicitly selected Markdown paths. An empty selection uses `or: ["false"]`; it never defaults to the whole vault. Paths are JSON-quoted expression literals and YAML-serialized, including quotes and Unicode. No membership tag or database ID is written to a note.

Adding a field changes only view `order`. The native `note.` prefix may be normalized away by Bases; both forms refer to the same note property. `file.name`, modification time and other native file properties are computed by Obsidian, not copied into YAML. View configuration, formulas, sorts, display names and extra view filters remain in the base. A field value is shared by every library referencing that note and field name.

Membership edits apply added/removed path deltas to the latest document using Vault.process. Open native TextFileView instances are flushed and synchronized through public APIs so a delayed native save or navigation cannot overwrite a newly added member with stale configuration. An unexpected concurrent change to view data is refused. Unknown native bases and externally rewritten membership structures are not rewritten. Comments/formatting of `.base` YAML may be normalized when saving, matching native Bases behavior.

Renames of collected files or folders update managed references while the plugin is loaded. Missing references remain explicitly removable, preserving the possibility of restoring a trashed note. Renames while the plugin is disabled, external path changes, and removed membership filters may require reselecting files. Removing membership never deletes a note or clears its properties.

Library New creates an empty Markdown file and then collects it. If collection fails, the created note is kept and the UI reports that it needs to be selected again. The native New toolbar control is replaced only in recognized managed bases because native filter inference does not add a new path to an explicit membership list. Native bases keep their own New control.

## Legacy pages

The old cover/columns/sections renderer remains opt-in under Legacy page layout. Existing `nf-*` metadata, attachments, view markers and recovery drafts are preserved. See [legacy page format](LEGACY-PAGE-FORMAT.md) for its source, conflict handling and draft/history limits. These are not the storage mechanism of the new continuous editor.

## References

Native compatibility follows Obsidian's [Bases syntax](https://help.obsidian.md/bases/syntax), [view controls](https://help.obsidian.md/bases/views), and [note properties](https://help.obsidian.md/properties). `.base` files remain useful when Nebula Focus is disabled, provided the Bases core plugin is enabled.
