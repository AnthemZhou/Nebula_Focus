# Nebula Focus validation — 1.1 series

## 1.1.2 质量检查 / Quality checks（2026-11-04）

1.1.2 正在准备发布。严格 TypeScript 构建与 **308/308** 自动测试通过；新增覆盖不完整原生结构，以及未知布局/编辑器保留原生处理。与修改前使用同一 `eslint-plugin-obsidianmd@0.4.2` 比较，**1,570 项诊断 → 38 项警告、0 项错误**，不安全类型系列已清除。保留项和检查命令见[检查说明](review-warnings.md)。

CSS 去掉注释后，`!important` **24 → 15**、`:has()` **13 → 11**；修改聚焦废弃规则和选择器作用域。发布 CI 已加入 lint 与运行文件构建证明步骤，实际运行及官方 1.1.2 扫描仍待核对。本地计数不能替代官方全套检查。

桌面 Obsidian 1.14.5 实测：重新加载后的看板、表格、画廊均能展示；看板新建 → 撤销 → 重做 → 撤销通过。浅色与深色主题下检查了卡片、紫色轮廓新建按钮和标签面板。14 份原有测试 Markdown 的 SHA-256 完全一致，测试条目已撤销。初始化时原生 getter 尚不可读的情景已补回归测试，准备完成后可正常重试。

本次没有新增 iPhone 全流程通过结论。下方手机证据属于 1.1.0 / 1.1.1 及其候选构建；两版运行文件相同。后续测试继续原处更新唯一的 `Nebula-Focus-iPhone` 库。外观层仍不改 Markdown 正文或追加格式标记，主动属性编辑与纯展示分别验证。

Version 1.1.2 is in release preparation. The strict TypeScript build and **308/308** automated tests pass, including new coverage for incomplete native structures and native fallback for unknown layouts/editors. Using the same `eslint-plugin-obsidianmd@0.4.2` rules before and after the changes gives **1,570 findings → 38 warnings and zero errors**, with unsafe-type findings cleared. See the [review guide](review-warnings.md) for retained findings and commands.

Excluding CSS comments, `!important` falls **24 → 15** and `:has()` **13 → 11**, focusing on obsolete rules and selector scope. CI now configures lint and runtime-file attestations; its actual run and the official 1.1.2 scan remain to be checked. Local counts do not replace the full official review.

Desktop Obsidian 1.14.5 checks passed: reloaded board, table and gallery rendering; board create → undo → redo → undo; light/dark cards, outlined creation buttons and tag popup. SHA-256 hashes of all 14 pre-existing test Markdown files remained identical; the test-created note was undone. Regression tests cover native getters before initialization and successful retry after readiness.

There is no new full iPhone-test pass for this version. The device evidence below belongs to 1.1.0 / 1.1.1 and their candidate builds; those two released versions have identical runtime files. Future tests update the single `Nebula-Focus-iPhone` vault in place. Presentation still does not alter Markdown bodies or append formatting markers; explicit property edits are evaluated separately.

## 1.1.1 发布记录 / Release record

### 发布与目录状态（2026-11-04）

1.1.0 的真机对齐检查完成后，已发布到 GitHub 并提交官方目录。2026-11-04 的失败通知明确对应 **1.1.0**：其唯一 Error 是简介不能包含目录语境中重复的“Obsidian”字样。**1.1.1** 已删除该字样并发布到 GitHub，最新复检不再出现这一 Error。两版 `main.js` 与 `styles.css` 逐字节相同，GitHub CI 的构建与 295 项测试通过。唯一测试库已原处更新。

官方条目：[Nebula Focus](https://community.obsidian.md/plugins/nebula-focus)。最新管理页面显示 1.1.1（提交 `9ce1bab`）的扫描为 **Completed**，无 Error；构建复现通过，生成的 `main.js` 与发布附件逐字节相同。公开页面曾显示版本 **1.1.1** 和 **Add to Obsidian** 安装入口。目录最终发布状态仍在核对；扫描 Completed 与出现安装入口不能单独证明已上架。重新打开 macOS 客户端插件市场后搜索 Nebula Focus，结果仍为 0；手机从插件库安装尚未确认，搜索不可用的原因尚未确定。原生内部类型适配与 CSS 检查仍有 Warning，发布附件溯源与附加 ZIP 仍有 Recommendation；这不是零警告结果。


### Release and directory status (2026-11-04)

After the final actual-iPhone alignment check, version 1.1.0 was published on GitHub and submitted to the directory. The failure notification dated 2026-11-04 explicitly refers to **1.1.0**: its only Error was the redundant word “Obsidian” in the directory description. Version **1.1.1** removes that word and is published on GitHub; its latest scan no longer reports that Error. Both versions have byte-identical `main.js` and `styles.css`; GitHub CI build and all 295 tests pass. The single persistent test vault was updated in place.

[Official listing](https://community.obsidian.md/plugins/nebula-focus): the latest management page shows the scan for **1.1.1** (commit `9ce1bab`) as **Completed** with no Errors. Build reproduction passed: the generated `main.js` matches the release asset byte for byte. The public page was observed showing version **1.1.1** and an **Add to Obsidian** installation entry. Final directory publication status remains under verification; a completed scan and a visible installation entry alone do not confirm marketplace availability. After reopening the macOS community browser, searching for Nebula Focus still returned zero results. Phone marketplace installation remains unverified, and the cause of search unavailability has not been established. Native internal-type adapter and CSS findings remain Warnings; artifact attestations and extra ZIP attachments remain Recommendations. This is not a zero-warning result.


## 1.1.0 pre-release verification record — 2026-11-04

At this pre-release checkpoint, version **1.1.0** was in release preparation, with Obsidian **1.14.5** as the minimum
and mobile loading enabled. The current build and **295/295** automated tests pass.
Core iPhone workflows have direct user confirmation, including consistent tag
font sizes and creation → tag edit → two undos → two redos. R10's removal of the
visible phone history row passed scoped actual-device Mirroring checks.

The latest single-line phone-title alignment fix balances vertical padding using
`1lh`: the 32px link text previously sat at the top of a 44px touch row. The CSS
fix is complete; its actual-phone display and inline-edit visual checks passed through Mirroring.

Testing now reuses **one** persistent iCloud vault, `Nebula-Focus-iPhone` (formerly
R10), and updates plugin files in place. Nine older iCloud test vaults were
archived locally under ignored `dist` storage with their data retained. No more
numbered iCloud vaults are created for each build.

At this checkpoint, the directory submission had not yet been sent; the user had confirmed the developer-policy agreement and ongoing-maintenance commitment. The 1.1.1 scan observations and unconfirmed publication status are recorded at the top of this document. Android,
iPad, third-party themes and untested lifecycle edge cases remain stated coverage
limits; they are not collectively treated as a new release-blocking checklist.
The dated R2–R10 sections below preserve historical observations and decisions,
not the current submission status. The published 1.0.0 baseline is also retained.

本节记录发布前的检查结果：当时 **1.1.0 正在准备发布**，最低 Obsidian **1.14.5**，允许移动端加载；当前构建与 **295/295** 测试通过。核心 iPhone 流程已有用户直接确认，R10 隐藏手机撤销行已有有限真机镜像证据。最新单行标题垂直偏移已用基于 `1lh` 的平衡内边距修复：原先 32px 链接文字在 44px 点击行中贴顶；本次真机镜像中的显示与原位编辑视觉检查通过。

当前只保留一个 iCloud 测试库 **Nebula-Focus-iPhone**（原 R10），今后原处升级。9 个旧库的数据已保留归档到本地忽略的 `dist`，不再逐轮新建编号库。此检查时点尚未提交官方目录，用户已同意开发者政策与持续维护承诺；当前 1.1.1 扫描记录及尚未确认的目录发布状态见本文顶部。下方 R2–R10 是历史记录；Android、iPad、第三方主题及其他未测边界是明确的覆盖限制，不把所有历史待测项重新列为当前发布阻断。

## Final iPhone title alignment check

On 2026-11-04, the updated persistent iCloud vault was reloaded on the actual iPhone. Single-line text and its page icon are centered within the first-line touch area in both display and inline edit. The full purple selection outline remains visible; multiline text keeps natural wrapping and tag-expanded rows remain top-aligned. The 13 original fictional Markdown files remain byte-for-byte unchanged.

## Automated checks

The published 1.0.0 baseline passed 86/86 tests. The released 1.1.1 build, including the page sidebar, passed 295/295. **The 1.1.2 candidate passes 308/308 automated tests (2026-11-04).** `npm run build` performs strict TypeScript checking and produces the external-
Obsidian CommonJS bundle. `npm test` covers:

- automatic row heights, variable-height selection geometry and resize caches;
- semantic colors in tables, cards and note properties, stable unknown values,
  ordinary prose/media exclusion and unchanged relation links;
- inline title editing and anchored column-label settings, explicit save/cancel,
  Escape, IME, stale views, read-only controls, external updates and native property transactions;
- tag selection/create/remove, list vs text values, pointer/keyboard reorder,
  serialized preference saves, failures and reload behavior;
- first-image covers, overdue dates, thumbnail enlargement and cleanup;
- suppression of irrelevant property suggestions without blocking explicit links;
- teardown during delayed settings load;
- release ZIP inclusion from the reviewed Git index, ignored/private files,
  staged blobs, symlink safety and checksum contents.
- grid-contained footer recovery after native rendering, focus and creation delegation;
- blank-space title clicks and end-of-text caret placement;
- creation-time sort tie-breaking without Markdown writes;
- chronological creation/property undo and redo, recoverable trash, restored file
  identity, content/path protection, async lifecycle races, input/IME undo isolation;
- full frontmatter snapshot restoration (including removal of newly added keys),
  conflict detection and safe retries after partial failures.
- table decoration before paint, local observer isolation, root replacement and
  height-adapter teardown order, with no duplicate controls or cross-table cleanup;
- column candidate management, persistent additions/hiding/reordering, drag
  cancellation, IME, read-only states, failed-save rollback and focus retention;
- silent successful creation/undo/redo and atomic option preference writes.
- board/custom presentation, toolbar, footer and popup focus routing; folder-group
  creation; pending creation/initial-read queues; same-note virtual detach/remount;
  loading-placeholder, cross-pane and closed-session isolation;
- clean stale editor snapshots after property undo, shared child-editor ownership,
  real unsaved drafts and close-time flush races.
- complete creation/property/native undo and redo isolation when reusing a view
  for another configuration or note; pending creation handover to a replacement,
  including an immediate undo or second creation queued on that replacement.
- phone history shared by the same real external Base and view across standalone
  tabs and Home embeds, placeholder-owner promotion, asynchronous source closure,
  shared queues and native stack replacement; desktop and inline Base isolation;
- whole-row tag reordering after a short touch hold, ordinary scroll/tap
  preservation, deselection through checked options and hidden selected values;
- first-data table geometry before paint, coalesced navigation discovery,
  retained live offscreen cards and unchanged-data DOM preservation.
- tag query/renderer acknowledgement ordering, late earlier acknowledgements,
  failed latest writes and external undo; stable inert minimum-width measurement
  for empty first cells, virtualized cells and hidden remove controls, while row
  measurement retains native overflow behavior.

## Published 1.0.0 baseline real-app checks

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

## Local follow-up real-app checks (2026-10-30)

- Clicked the grid's last-row new-item button: a temporary note appeared after
  the existing empty items; the native result count increased from 23 to 24.
- Clicked the blank area to the right of its title; the native selection range
  was collapsed at the end of the inline editor. Enter saved a temporary title.
- Pressed ⌘Z twice: the first removed the newly added title property, the second
  moved the created note into the vault trash and restored the count to 23.
- Pressed ⌘⇧Z twice: the original file and then the edited title were restored.
  Repeated undo cleaned up the temporary note; existing entries were retained.
- The native post-save focus loss to `document.body` did not break undo. Recovery
  is restricted to the last database in the active pane; other inputs retain
  their own text undo.
- Creation undo/redo commands are now present alongside the appearance toggle.
  No earlier product's writing/navigation/library features were introduced.
- Compared all 309 pre-existing non-configuration content files after cleanup:
  only the intended external idea Base's creation-time sort rule changed. Every
  existing Markdown file retained its SHA-256 hash; no file was missing and no
  new non-trash content remained. Reload cleared the temporary test history.

These checks cover the local follow-up source and installed development build;
they do not claim the existing 1.0.0 release assets have been republished.

## Additional UI polish checks (2026-10-30)

- Sampled visible idea-title controls on animation frames during three matching
  cross-table scroll gestures. Before the synchronous render changes, 9 of 1,555
  sampled frames had undecorated visible titles (150 total missing controls).
  After the change, 0 of 1,525 sampled frames did. This measures that specific
  interaction, not a universal frame-time or theme benchmark.
- Visually checked the first row's focus ring: all four sides are now painted
  inside the grid. Board new-item buttons use native theme tokens; the later undo
  pass restores their full column width with a purple outline.
- Opened the area-column manager, created a temporary candidate, dragged it to
  the top and confirmed the same order in the cell picker. Reloaded the plugin
  and confirmed persistence. Removed the temporary candidate and cleaned its
  test-only hidden preference; existing note values were not touched.
- Created a temporary item (23 to 24 results), then used keyboard undo (back to
  23). Both successful actions had zero `.notice` elements. Error notices remain.
- All 307 content files present at the start of this polish pass retained their
  SHA-256 hashes. No content file was missing or added outside trash, and plugin
  settings matched their pre-test values after temporary candidate cleanup.
- README language sections, matching contents links and local reference paths
  were checked. The original Node Console writing reference is recorded in
  [documentation-style.md](documentation-style.md).

## Board undo and session checks (2026-10-30)

- In reading mode, checked the board column footer, group-header plus and toolbar
  New. Each newly created temporary file could be undone with the keyboard, both
  in the untouched title and after Escape returned focus to the note.
- Checked the idea table toolbar and final grid row; their created files could
  also be undone. Successful actions produced no notices.
- Redid a board creation, scrolled its native container out of the document
  (`isConnected: false`, `_loaded: true`), and undid it from the same open note.
  The retained history removed only that temporary file; returning to the board
  showed the original result count.
- In Live Preview, checked board creation followed by Escape and keyboard undo.
  The non-editable embedded database remains distinct from the surrounding text
  editor's undo context.
- Through the real board's native APIs, created a temporary note, changed its
  status, undid the status and creation, redid both, then undid both for cleanup.
  Verified disk properties, recovered-file identity, history order and zero
  success notices. This uncovered and fixed a clean popup editor retaining an
  old saved snapshot after native property restoration. The drag gesture itself
  was not validated by this API sequence.
- Visually verified full-width, neutral-background New buttons with only a purple
  outline. Card-view and folder-group creation are covered by automated fixtures,
  not claimed as live UI checks.
- Full scope and unsupported operations are listed in
  [undo-coverage.md](undo-coverage.md).

## iPhone development checks (2026-11-01 to 2026-11-04)

The current source adds database touch undo/redo controls, card/column menus,
viewport-aware popovers, and precise capture of the phone's native creation path.
Regression coverage includes phone creation without `newlyCreatedFile`, isolation
from concurrent unrelated creations, failed-creation retries, stale/read-only
controllers, cancelled touch gestures and mobile versus keyboard focus routing.

The R2 test build was exercised on iPhone 16 Pro Max with Obsidian 1.14.5 (387).
Board and table creation/undo/redo, continuous Chinese input, tag editing,
horizontal scrolling, rotation, card moves and thumbnail preview have device
evidence. User acceptance also found small text, tag layout/keyboard concerns and
hard-to-find history controls; this is not a passing mobile release verdict.

Follow-up source makes undo/redo labels visible, uses body-sized mobile database
text, and separates opening a tag panel from focusing its input. Visible labels
and larger text were observed in R4/R5; full touch acceptance remains incomplete. See
[mobile-testing.md](mobile-testing.md) for per-scenario results and release gates.
All 13 original fictional R2 and R4 Markdown bodies still match the packaged fixtures;
explicit user property edits and view configuration are checked separately.

R4 direct-touch acceptance still failed on tag spacing, popup density/removal
icons, creation undo and the grid footer gap. R5 fixes an independently
reproduced history loss when an open phone tab loses its DOM connection, moves
native bottom-bar clearance after the grid footer, and tightens mobile tags.
Only supported custom-picker cells hide native remove controls; read-only,
unknown and recycled cells retain their fallback. Shared row measurement uses
the same support checks. Dragging lifts an inert overlay, animates peer movement
and lands before saving, with cancellation/teardown and reduced-motion tests.
R5 passed the build and 234 tests and was loaded on the physical iPhone. Mirroring
confirmed the footer immediately follows the last row and the history controls
are visible. Creation followed by reopening the Base from the sidebar produced
a second tab with disabled undo; undo in the original tab still worked. The user
confirmed this is their normal return path. The subsequent touch review requested
no X on selected tags, whole-row dragging, and less visible progressive rendering
on both table and Home Back/Forward navigation; it was not a visual acceptance.

R6 shares chronological phone history for the same external Base and view across
tabs and Home embeds. Checked options toggle selection without a chip X. Whole-row
touch dragging starts after a 180 ms hold, while quick swipes remain scrolling and
the grip remains immediate. Initial table layout completes before paint, navigation
discovery runs in a microtask, and live detached boards/unchanged card data retain
their DOM. The build and **259/259** tests pass. The separate R6 candidate was loaded
on the phone and its vault name confirmed after configuration reload. Mirroring
verified standalone table creation 6→7, sidebar reopening in another tab with undo
enabled, undo 7→6 and redo 6→7. The Home board passed the same sidebar-return flow
3→4→3→4. A third table tab also inherited available undo. No success notices appeared.
All 13 original Markdown bodies remain unchanged; the two newly created fictional
notes are retained. Mirrored tag and title input did not establish successful edits.
The November 4 direct-touch review failed on popup/cell tag-update synchronization,
an unwanted circle when holding the grip, and visible two-line-to-one-line changes
when navigating between the gallery and idea table. The combined property sequence
was not confirmed. R7 refreshes authoritative query and cell-renderer state before
updating the popup, with 12 tag regressions covering acknowledgement ordering,
failed latest writes and external undo. Row measurement retains native overflow,
and an inert minimum-width probe handles empty first cells, virtualization and
hidden remove controls. Initial geometry waits for the actual query owner. Board
footer buttons match the cards' 9px radius, and grip/drag-overlay styles suppress
the unwanted circle. The R7 build and **273/273** tests pass, as does
`git diff --check`. Its fresh candidate vault is copied to iCloud with matching
runtime hashes. Later R7 phone loading reproduced a row-height change; R8 corrected
that reproduction through Mirroring. Neither established complete touch acceptance.
Runtime hashes and remaining
checks are in [mobile-testing.md](mobile-testing.md). No mobile release or directory
submission has occurred.

Minimum-version 1.14.4, third-party themes and arbitrary future
Obsidian versions were not tested here. 1.0.0 is desktop-only. Guarded internal
Bases adapters should be rechecked after host upgrades. Public examples contain
fictional notes only; release packages contain no user vault or migration backup.


## Page sidebar local development checks — 2026-11-04

Validated on Obsidian desktop 1.14.5, macOS. This is a local development addition,
not a new published release. That sidebar validation build passed strict TypeScript
compilation and all 292 tests; the later R9 results are recorded below.

- Sibling and internal folder-note merging retains every note, including the
  ambiguous case with both a sibling note and an internal note. Folders and
  pages share one order; attachments can be shown separately.
- Search reaches collapsed descendants and preserves ancestors. Tests cover
  per-folder sorting, path renames, stale settings and creation-name validation.
- Real-app title clicks open the intended Markdown file; disclosure clicks
  expand children without navigating. Favorites, expansion and sorting persist
  through plugin reload, with exactly one sidebar view after repeated opens.
- Actual pointer drags moved a root page above and below its siblings, saved
  each order and restored the starting order without opening the dragged page.
  Pointer capture replaced OS HTML dragging after real-app testing exposed
  missing native drop events. Cross-parent, canceled and outside-tree drags are
  covered by tests; keyboard reorder retains focus.
- Favorite menu actions and the favorite's navigation passed in the running app.
  The new-page dialog opens with its name field focused and cancels cleanly.
  Automated creation tests cover first-child folders, duplicate names and double
  submission; real-vault creation was not exercised.
- Sidebar and tag settings share one write queue; concurrent preference changes
  retain each other, and failed writes report an error while preserving state.
- SHA-256 comparison of all 310 original vault content files found no changed,
  added or removed files. Installed JS and CSS match the verified build.
- Final preview keeps Home in favorites and expands the current page. Existing
  native explorer, search and bookmarks tabs remain available.

The sidebar is scoped to same-parent ordering and does not move files between
folders. Physical touch-device validation is still outstanding.


## R9 desktop theme checks and mobile candidate — 2026-11-04

The complete current source, including the existing page sidebar, passed strict
TypeScript compilation, the build and **295/295** automated tests. R9 uses the full
source; it does not use R8's isolated build that excluded sidebar work. The published
1.0.0 desktop release has not been replaced.

Checked the separate fictional R9 vault in actual Obsidian desktop **1.14.5**, in
both light and dark themes:

- Native cell tags, selected popup tags and popup options have the same computed
  **13.125px** font size and **400** weight at the user's existing settings; the
  native font setting was not reduced. Semantic tag colors remained readable in
  both themes.
- Native remove controls in managed tag cells have `display: none`, including
  hover. There are zero trailing Open-button elements. The leading page icon
  remains the intended navigation control.
- The title-column header opens an anchored settings panel styled like the tag
  manager. Opening and Escape cancellation were checked in the app. No rename
  was saved in this visual run; save/IME/error cases are automated-test coverage.
- Board New buttons have a transparent `rgba(0, 0, 0, 0)` background, the cards'
  **9px** radius and a purple outline. The project-next-step and project-summary
  property labels use `--text-accent` (light theme sampled RGB **138, 92, 245**).
  Overdue-date red remains intact.
- All **13** original fictional Markdown files remained byte-identical after
  the visual/cancel checks.

`dist/Nebula-Focus-iPhone-R9` is packaged. The pristine ZIP was copied into a new
same-named iCloud test vault without overwriting older test vaults. R9 has loaded
on the iPhone; Mirroring confirmed the vault name, six-row table without trailing
Open buttons, and the anchored title-column rename panel. Mirroring clicks still
trigger native tag menus or pass through popup controls, so they do not establish
direct-touch behavior. The user's subsequent direct-phone R9 feedback **confirmed
consistent tag font sizes between cells and the popup**, and **creation → tag edit
→ two undos → two redos working**. These two cases have real-touch passing evidence;
other synchronization, reordering, theme and lifecycle scenarios retain their
recorded limits. The user requested hiding mobile undo/redo controls while keeping
desktop controls; the follow-up adjustment needs its own validation.

**Full mobile acceptance remains pending.** No mobile release or directory submission
has occurred. Package hashes and the remaining device checks are recorded in
[mobile-testing.md](mobile-testing.md).


## R10 phone history-button visibility — 2026-11-04

The build and **295/295** automated tests pass. The pristine
`dist/Nebula-Focus-iPhone-R10.zip` was extracted into a new same-named iCloud vault;
older test vaults were not overwritten. Actual iPhone Mirroring confirmed the R10
vault loaded and the following scoped visual results:

- The standalone idea table has six results and no Undo/Redo row. Its native
  toolbar sits immediately above the column headers.
- The Home embedded board has three results and no Undo/Redo row. Card and column
  touch menus remain present.

A read-only byte comparison after those observations confirmed all **13** original
fictional Markdown files in iCloud R10 remain identical to the example sources.

This checks only the requested visible-control change. It does not replace the
other remaining phone scenarios or establish a new complete touch acceptance.
R9's direct-touch tag-font and combined creation/tag undo results remain recorded
above. Desktop controls, internal phone history and the command fallback are
retained; native text undo is unchanged. No public mobile release or directory
submission has occurred. Runtime and ZIP hashes are recorded in
[mobile-testing.md](mobile-testing.md).

### 中文记录

R10 构建与 **295/295** 自动测试通过。原始 ZIP 解压到 iCloud 同名新测试库，未覆盖旧库；实际 iPhone 镜像已确认 R10 加载。独立想法表格显示 6 个结果，原生工具栏紧邻列头，不再出现撤销/重做额外一行；Home 嵌入看板显示 3 个结果，同样无该行，卡片及分组触摸菜单仍保留。观察后的只读逐字节比较确认 iCloud R10 的 13 篇原始虚构 Markdown 与示例源文件完全一致。这仅是本次显示调整的有限真机检查，不代表完整触摸验收或正式发布。桌面入口、手机内部历史与命令回退保留，原生文本撤销不变。
