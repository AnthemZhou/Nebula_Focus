# Nebula Focus validation

## 1.3.0 release validation / 发布验证 — 2026-11-13

Final local build passes strict TypeScript and bundling. The complete **51-file suite passes 729/729 tests** in 8.46 seconds, with no failures, cancellations or skips. ESLint reports **0 errors and 39 documented warnings**; no rules were disabled to reduce that count. The final subsequent change is scoped table-spacing CSS, parsed successfully and inspected in the running app; it does not change tested TypeScript behavior.

Mac Obsidian **1.15.1**: sidebar page clicks and search results activate the main content group even when the destination already exists on the right. Pin/unpin creates and removes the dedicated section above Projects, and right-click retains the full action menu. The top-right magnifier opens all four search modes. Folder decoration is removed and hierarchy indentation is consistent. The native page menu no longer offers extra horizontal/vertical splits in enhanced mode; native commands remain available, and existing groups are not forcibly closed.

Rounded desktop sidebar, vault footer and main/right panels were inspected in **dark and light** appearance. Native appearance restores the actual file explorer and original ribbon controls; sampled UI type returns from 14px to native 15px and custom panel borders disappear. Enhanced dark appearance and Reading view were restored. Reading paragraphs, editor paragraphs and editor blank lines measured **16px type / 25.5938px line height**. Top-level reading tables now use the same 16px native widget inset; content table dimensions match. Raw-source syntax, editor focus scrolling and duplicate-title handling remain native and are not claimed pixel-identical.

Integrity: **211 Mac and 26 iPhone Markdown files are byte-identical**, with none added or removed. The Mac right-group preference now records the existing second group; phone preferences are unchanged. The runtime is installed in both existing vaults. The final desktop geometry changes are desktop-scoped; prior physical iPhone search, typography and navigation evidence is recorded below. This release pass does not add new phone light-theme, drag or direct-touch acceptance claims.

中文：1.3.0 严格构建、全量 **729/729** 自动回归通过，Lint **0 错误 / 39 项已记录警告**。Mac 实测侧栏及搜索回主区、独立置顶、右键菜单、四模式搜索、圆角区域、明暗主题和原生外观还原；结束恢复增强暗色及阅读模式。正文实测两种模式均为 **16px / 25.5938px**，阅读表格的额外间距已与原生编辑控件对齐。两端共 **237 篇 Markdown** 无内容变化。手机已有真机结果保留其原测试范围，不以桌面或自动回归替代新的触摸验收。

Local screenshots, hashes and logs stay in ignored `dist/sidebar-polish-2026-11-13/`; they are not release assets. Earlier checkpoints below describe the builds tested at those times, including their then-unreleased status.

## Sidebar navigation, mobile search and spacing / 侧栏导航、手机搜索与间距 — 2026-11-13

Development build; no release. Build and the full suite passed **721/721** tests before the final search-mode and input-method edge fixes; the final focused `workspace sidebar` run passed **170/170 across 9 files**. Changed TypeScript modules pass ESLint and strict compilation. The added behavior coverage checks main-group routing/focus, hidden-page discovery without changing sidebar settings, IME candidate-key protection, explicit clicks after a missing composition-end event, and preserving the pressed result through compositionend → input → blur → click.

Mac Obsidian 1.15.1: with the right group focused, clicking the sidebar's existing finance page reused and activated the main-group tab, preserving the right page. The footer contains only New page; node archive menus remain. Disclosure spacing is reduced. Reminder titles, date/source metadata and section spacing were inspected in dark and light themes; the renderer's extra paragraph margin around embedded Bases was removed. Native appearance restores the file explorer and removes the enhancement body class; enhanced dark mode was restored afterwards.

Physical iPhone mirroring, same vault: black drawer, retained native vault selector at top left, glass-like search button at top right, floating accent-colored New page, bottom settings control and rounded exposed main content were observed. The persistent native mode selector is hidden only in the custom page drawer. Search displayed 26 Markdown records including sidebar-hidden samples; choosing a result closed the drawer and opened the note. A stale IME state blocked mode buttons during mirroring; the final build clears it on blur and does not block explicit pointer choices, while keeping Enter/Escape candidate guards. The user confirmed direct-touch Chinese input/filtering/keyboard layout, but reported native file browsing replaced the sidebar. The final search architecture keeps direct search, tags, bookmarks and file browsing in the same modal. After a cold restart, physical mirroring verified all four mode switches, folder descent/back, empty tag/bookmark states, cancel/reopen with the top search preserved, and result opening with drawer dismissal. The final IME commit/tap guard is covered automatically; it has no new direct-touch acceptance claim. See `mobile-testing.md`.

Integrity: Mac 211 and iPhone 26 Markdown files remain byte-identical, with no added/deleted notes. Both installed runtime directories match the build. Mac sidebar expansion changed during navigation checks; phone plugin preferences remain unchanged. Local evidence is in ignored `dist/mobile-sidebar-2026-11-13/`. Existing ResizeObserver notifications remain outside a warning-free renderer claim.


## Scheduled dates and sidebar type / 计划日期与侧栏字号 — 2026-11-13

Latest scoped update, not released: build and **130/130 focused tests in 8 files** pass (2.22s); ESLint for the changed reminder modules reports no issues. This focused run replaces no earlier full-suite result. It covers calendar-date sections, year boundaries, leap days, a real DST timezone, stable collapse keys, display-only date markers, and existing sidebar behavior.

Mac Obsidian 1.15.1: measured page labels and reminder entry **14px / 400**, section captions **13px / 400**. Dark and light reminder layouts were inspected: overdue dates sit below their titles in smaller red type; missing-date tasks remain collapsed. The dark theme was restored. Changes are proportional to the user text-size preference, not a claim to use Codex's internal CSS values.

Physical iPhone, same existing vault: after iCloud upload and application restart, dark-mode mirroring showed the new overdue date below its title and a full `2030年12月31日 星期二` date heading, without right-edge clipping. The existing idea Base remained embedded. Tapping the reminder sidebar entry closed the drawer. This was a visual/layout check, not a new keyboard, drag, or iPhone light-theme acceptance run.

中文：桌面页面名称及操作统一 14px 常规字重，项目／页面分组标题维持 13px。提醒采用今天、明天、后续具体日期分组；逾期日期移到标题下方，跨年保留年份。明暗主题均检查，结束恢复暗色。日期分组和标题去除日期标记只发生在显示层。Mac 211 篇及手机 26 篇 Markdown 的 SHA-256 对比均无变化，无新增或删除笔记。两个库的运行文件匹配构建；本地证据位于 `dist/scheduled-ui-2026-11-13/`。


## Reminders and Codex-like navigation / 提醒事项与导航 — 2026-11-13

Development build, installed in the existing Mac and iPhone vaults; not released. Build and **706/706 tests across 51 files** pass (8.18s, no skips). ESLint has zero errors and 39 pre-existing warnings. The focused `reminders` test area exercises parsed task/deadline reads, stale async cache invalidation, source rename/delete, serialized preferences, unchanged note bodies, embedded Base ownership, deferred views and cold startup.

Mac Obsidian **1.15.1** observations:

- Reminders displays two actual overdue page dates and 75 undated tasks. Undated items initially collapse. Adding the existing idea database renders its 21 records from the original Base; removing a reference does not delete its file.
- Normal reminder-source click opens in the right content group, repeat click reuses it, and Command-click opens in the main group. Sidebar hides standalone Bases; the native file explorer retains them.
- Rail width measured 40px and sidebar text 15px. Native Help/Settings move to its bottom, and the actual Settings control opens the settings window. Light/dark appearance inspected; native appearance restores the real explorer, 44px rail and original footer controls.
- Cold-reload testing caught a traversal bug: returning `Array.push()` from `iterateRootLeaves` stops Obsidian at the first leaf. The callback now returns nothing, and the fixture models the real early-exit contract. Existing deferred views load through the public lifecycle API. Two subsequent reloads each retained one reminder tab and had empty renderer error logs. A later tab-switch check recorded an existing ResizeObserver notification; this is not a claim of a warning-free renderer.
- Reminder startup can be disabled in settings. Plugin hot reload does not redirect the current view. The prior Home configuration is retained.

中文：新提醒首页、右侧／主区导航和收紧后的侧栏已装入现有两个库，未发布。全量 706 项通过。真实 Mac 验证了自动读取、原数据库引用、目标标签复用、Command 主区打开、明暗主题和原生还原。冷启动重复首页问题经过实机复现、根因修复及回归。手机结束旧进程并重新启动后，已实际显示新版提醒页；深色真机镜像确认日期分组、点击提醒入口自动收栏、手动添加原有想法收集箱、打开来源笔记及返回后保留同一数据库引用。未重新验收中文软键盘、标签拖动及手机浅色主题。

SHA-256 comparison confirms all **211 Mac / 26 iPhone Markdown files** are unchanged, with no added notes. Both previous Home configurations are identical. Both vaults' three runtime files match the build. The idea database reference was added through each device's reminder UI; the final Mac-side iCloud settings copy had not yet received that phone preference. Temporary Mac navigation preferences returned to their previous values after closing the test tabs. Opening the existing phone source note also generated its normal automatic Base configuration, without changing Markdown.

Local ignored evidence and runtime backups: `dist/codex-navigation-2026-11-13/`. Prior checkpoints below describe earlier builds, not additional guarantees for this one.

## Previous workspace checkpoint / 前一工作区检查点 — 2026-11-13

The simplified workspace is installed in the existing Mac and iPhone test vaults, not released. Build passes; the final full suite passes **676/676 across 49 files in 8.41s**, with no skipped tests. ESLint remains at **0 errors / 39 existing warnings**. Tests added for this change cover ribbon preference persistence/restoration, early settings registration, retired Home migration, source-window page-icon routing and stale queued files. No Home data or Markdown is deleted.

- Mac Obsidian **1.15.1**: no standalone Home entry or command; compact sidebar toolbar and native bottom-left vault menu verified. The four default ribbon tools measured **22px** icons. Show all displayed nine; selecting Graph displayed five; restoring compact defaults returned four. The actual settings panel exposes these controls.
- Clicking a finance-table page icon added its note to the right content group while retaining the left finance workspace. Clicking its title instead produced an inline text field; Escape cancelled without changes. Reload retained the workspace tree and active record.
- Desktop light/dark presentation inspected. Native appearance removed the enhancement scope, restored native file-explorer navigation and ribbon visibility, with sampled icons back to **16px** and native UI text **15px**. Enhanced sidebar text sampled **14px**, row height **33px**. These are samples, not measurements of every theme or of Codex internals.
- Physical iPhone: restarted Obsidian through Mirroring and observed the new build. Home/header removed, drawer visibly narrower, native vault control retained. Selecting Finance closed the drawer and displayed its table; the page icon opened its record. Dark typography and background inspected. Mirroring then ended because the phone was in use; **phone tab-grid retention and light-theme appearance were not directly verified in this run**. Mobile ordinary-tab behavior also has automated coverage.
- SHA-256 confirms all **211 Mac / 26 iPhone Markdown files** unchanged, with none added. Both Home configurations remain unchanged. Runtime files match the build in both existing vaults. iCloud reported uploaded runtime files with no unresolved conflicts. Only Mac right-workspace/ribbon preferences changed.
- The desktop error log retained an earlier ResizeObserver undelivered-notifications entry. This is not a claim of a warning-free renderer.

中文：本轮开发版已原处安装到 Mac 与唯一 iPhone 测试库，未发布。构建及 **49 个文件、676/676** 全量测试通过（8.41 秒、零跳过）；Lint **0 错误 / 39 项既有警告**。Mac 实测精简侧栏、左下角库菜单、四个默认 22px 图标、全部显示／单项开关／恢复精简、表格图标右侧打开、标题原位编辑、重载保留页面及明暗主题。原生切换恢复文件列表、原始颜色和工具栏，采样图标回到 16px、UI 字号 15px。iPhone 重启后已实际显示去除 Home 的窄侧栏、暗色表格和记录；点击 Finance 自动收栏，页面图标能打开记录。随后因手机使用中镜像断开，**本轮没有完成手机标签总览保留与浅色真机确认**，不将自动回归等同真机验收。两库共 237 篇 Markdown 和 Home 配置保持原样，未新增笔记。详见 [工作区说明](workspace-layout.md)。

Local ignored evidence: `dist/simplified-workspace-2026-11-13/` contains pre-deployment snapshots, runtime backups, light screenshot, reload workspace comparison, sync status and final integrity report. These are not release assets.

## Previous development checkpoint / 前一开发检查点 — 2026-11-12

The latest integrated build passes, and the full local suite passes **665/665 tests in 8.77s**. Lint reports **0 errors and 39 existing warnings**, with no new warning from the right-workspace module. Two archive warnings are intentionally retained: verified archive operations use recoverable local trash instead of following a preference that could permanently delete files. The preceding archive checkpoint passed 643/643 tests across 47 files in 8.74s, followed by a 31/31 focused archive run in 1.70s; those are historical results for that earlier code.

This checkpoint includes bundled fonts, shared mobile database typography, focused plaintext-title measurement, compact final-row creation, reversible sidebar hidden paths, desktop external archiving and test-suite consolidation. It now also includes screenshot-inspired typography and native right-hand work tabs for notes, Bases and Home. Earlier 590/599/606-test checkpoints remain historical evidence for their respective builds. These changes are not published. The scoped Mac workspace cases below now pass; iPhone new-tab commands and phone pinning remain unverified. Earlier observations are not a substitute for those remaining cases. See [workspace layout](workspace-layout.md), [mobile testing](mobile-testing.md), [page sidebar](page-sidebar.md), [font validation](fonts.md) and the [test-suite audit](test-suite-audit.md).

中文：最新整合构建通过，全量自动测试 **665/665 通过，耗时 8.77 秒**。Lint 为 **0 错误、39 项既有警告**，右侧工作标签页模块没有新增警告；其中 2 项归档相关警告有意保留，用可恢复的本地回收站避免永久删除。此前归档检查点的 47 个文件、643/643、8.74 秒及后续专项 31/31、1.70 秒保留为历史结果。本检查点在字体、手机排版、标题测量、末行新建、侧栏隐藏路径、桌面外部归档及测试精简之上，增加截图参考排版和用于笔记、数据库、首页的原生右侧工作标签页，尚未发布。下述 Mac 工作区实际场景已通过；iPhone 新标签页命令及手机置顶仍未验证，不用较早观察代替。

### Workspace automated scope / 工作区自动测试范围

- Right-workspace tests cover one managed split per window, sibling-tab reuse, retained left content, mobile ordinary tabs, stale saved layout markers, cancelled selection, native/unload cleanup and asynchronous closure without stealing focus.
- Home controller tests cover opening the shared dashboard in a specified leaf, retaining another Home, deferred non-Home replacement, concurrent requests, late navigation and error propagation. These navigation operations do not save Home settings or create `.base` or Markdown files.
- The layout proportions are derived from the user's Obsidian text size. Screenshot reference is not a claim to have obtained Codex's internal font values. Scoped desktop measurements are below; this iteration's mobile minimum sizes have no new measurement result.

中文：自动测试覆盖每窗口工作分栏复用、保留左侧内容、手机普通标签页、失效布局标识、取消选择、原生／卸载清理和异步关闭；首页专项验证指定标签页使用共享配置、保留另一个首页、替换 deferred 非首页、并发、后续导航及错误传播。导航本身不保存首页设置、不新建 `.base` 或 Markdown。排版按用户字号计算，截图参考不等于取得 Codex 内部参数；本轮桌面有限测量见下，手机最低字号暂无新的实测数值。

### Workspace UI observations / 工作区实际界面观察 — 2026-11-12

- Mac, Obsidian **1.15.0**: the sidebar new-tab button opened the selector; selecting a Base and a Markdown note worked. The right group's native plus button appended a tab in that group. Opening Home on the right retained the left workspace, and the root content area remained at **two tab groups**.
- Light and dark screenshots were inspected. Native appearance removed `bui-enabled`, replaced the custom sidebar with the real file explorer, and restored custom start pages to native empty pages. Already-open notes, Bases and Home remained open. Enhanced appearance and the dark theme were restored.
- The sampled visible `.bui-idea-title` text was **14px**. Its `.bases-td` ancestor measured 16px, which does not describe the nested title. Native navigation measured **13px**. These are sampled elements, not proof that every view or third-party theme matches.
- The physical iPhone reloaded the plugin, showed existing Home modules and the sidebar, and closed the sidebar on Home navigation. Mirroring then disconnected because the phone was in use. **Mobile new-tab commands remain unverified**; this is not complete phone acceptance or a direct-touch pass for those commands.
- SHA-256 comparisons confirmed all **211 Mac Markdown files** and **26 phone Markdown files** unchanged. Home settings were unchanged on both devices. Mac settings changed only `pageSidebar` expansion state and `rightWorkspace`; phone settings were unchanged.
- Desktop developer-error records contained **seven ResizeObserver undelivered messages**. Lint's zero-error result does not mean the renderer had zero runtime errors or warnings.

中文：Mac 的 Obsidian **1.15.0** 已通过侧栏新标签按钮、选择器打开数据库与笔记、右侧原生 ＋ 同组追加，以及右侧 Home 保留左侧工作台，内容区始终为 **2 个标签组**。明暗主题均已截图检查；原生切换移除增强作用域、恢复真实文件列表和空白起始页，已打开笔记／数据库／Home 保留，最后恢复增强与暗色。可见表格标题为 **14px**，外层单元格容器的 16px 不代表内部标题字号；原生导航为 **13px**，这些是有限采样。iPhone 已重载并显示原有 Home、侧栏，点击首页后收起抽屉；因手机使用中镜像再次断开，**手机新标签命令尚未验证**。Mac **211 篇**、手机 **26 篇** Markdown 哈希完全一致，Home 设置未改；Mac 仅侧栏展开与工作组状态变化，手机设置无变化。开发错误记录有 **7 条 ResizeObserver undelivered** 消息，不声称运行时零错误。

Earlier scoped iPhone font observation remains valid for its tested build: settings preview, sidebar and native test-table titles/dates/tags changed to LXGW WenKai and restored through Follow Obsidian. It does not establish acceptance of the latest layout or archive changes. 中文：此前字体切换与恢复的真机有限证据保留，不扩展为本轮最新排版或归档功能通过。详见 [fonts.md](fonts.md)。

### Earlier sidebar/archive UI observations / 工作区更新前的侧栏与归档 UI 观察 — 2026-11-12

These observations precede the typography/right-workspace update above. They preserve the earlier data and settings checks without treating its runtime hashes as evidence for the newest build.
以下观察早于上述排版与右侧工作区更新，保留当时的数据和设置保护记录；其中运行文件哈希不作为最新构建已加载的证据。

- Physical iPhone: the updated runtime is visibly loaded, including the `项目 2` group. Tapping Home twice closed the sidebar each time and retained existing Home modules. Neither the sidebar footer nor the finance-example row menu exposed archiving.
- Phone pinning remains **unverified**. A Mirroring menu click passed through and opened the New-page dialog; it was cancelled without creating a note. This is neither a successful pin operation nor evidence of reliable direct-touch behavior.
- Desktop: pin/unpin passed. The archive manager was checked in dark and light themes; the original dark theme was restored.
- A temporary desktop note, `Nebula归档验证-20261112.md`, completed UI archive → restore. The restored text and archive payload matched the original bytes/hash, and the manifest reached `restored`. The temporary note was then trashed and its external test package moved to ignored `dist/sidebar-archives-2026-11-12/archive-ui-sample`. User data was not altered.
- At 21:51, `main.js`, `styles.css` and `manifest.json` in both test vaults matched the repository build. At 21:52, iCloud reported those three files and `data.json` uploaded, with no conflicts. These are timestamped synchronization checks, separate from the observed device behavior.
- Final comparison confirms the phone test vault's Home and page-sidebar settings in `data.json` match the pre-deployment backup. The temporary restored note is absent, and runtime files still match the repository build.
- Desktop `dev:errors` still contains ResizeObserver-loop warnings associated with plugin reloads. No archive-related exception was observed; the console is **not** warning-free.

中文：真实 iPhone 已显示新代码及「项目 2」分组；两次点击首页均自动收起侧栏，原有 Home 模块保留。侧栏底部与财务示例行菜单均无归档入口。手机置顶没有可靠触摸通过证据：镜像菜单点击穿透，误开新建弹窗后已取消，未创建笔记。桌面置顶／取消置顶通过；归档管理器检查了明暗主题并恢复原暗色。临时笔记完成 UI 归档与恢复，原文、恢复结果及归档包字节／哈希一致，清单状态为 `restored`；随后测试笔记移入回收站、测试包移入上述本地 `dist`，用户数据未动。21:51 两个测试库的三项运行文件与仓库一致；21:52 iCloud 的三项运行文件及 `data.json` 均上传完成、无冲突。桌面重载仍有 ResizeObserver-loop 警告，未见归档异常，不表述为控制台零警告。

最终复核确认手机测试库 `data.json` 的 Home 与页面侧栏配置和本轮部署前备份完全一致，临时恢复笔记已不存在，运行文件仍与仓库构建匹配。

Local ignored evidence / 本地忽略目录证据：[round trip](../dist/sidebar-archives-2026-11-12/archive-ui-roundtrip.json), [dark manager](../dist/sidebar-archives-2026-11-12/archive-manager-dark-final.png), [light manager](../dist/sidebar-archives-2026-11-12/archive-manager-light-final.png). These artifacts are local validation material, not release assets.

## Post-1.2.0 mobile candidate / 后续手机适配候选 — 2026-11-12

The published 1.2.0 is unchanged. These subsequent local mobile fixes are not yet
released. Testing reuses **Nebula-Focus-iPhone**, preserving its settings and notes;
11 fictional finance records and a plain file-name Base were added to the same vault.

- Home forms guard Chinese/Japanese composition confirmation against premature
  submission, including WebKit's composition-end/Enter sequence. Automated
  regressions pass. The user directly confirmed Chinese module-name input and
  candidate selection on the iPhone without premature saving.
- Shared `configId` detects `randomUUID`, then `getRandomValues`, then a
  time/random/counter fallback for non-security configuration IDs only. Home
  modules, Home `.base` files and automatic Base backups use the helper. Module
  construction errors appear in the Home status area. Automated regressions pass;
  this compatibility issue is not established as the Mirroring menu failure's cause.
- Page icons reject a trailing click after a touch scroll or cancellation, while
  retaining normal taps and keyboard activation. This is automated coverage, not
  a new real-touch verdict.
- Ordinary `file.name` title-only tables reserve the 44px mobile icon target.
  Actual iPhone Mirroring confirmed the corrected spacing after disabling and
  re-enabling the plugin to clear stale CSS. Native tags and row heights are retained.
- Mirroring confirmed short-title alignment, long-title wrapping, no extra phone
  history row and the New action directly after the last idea-table row. The
  light-theme column-label popup fits the screen and follows header typography;
  popup saving and keyboard interaction still need direct touch.
- Home's empty state and add-module menu are visible. The empty-state title,
  description and purple add button remain readable in light mode and after the
  system automatically switched to dark mode; other modules are not covered by
  that observation. Earlier Mirroring clicks on Data view dismissed the menu without
  a modal. The user subsequently confirmed Add first module → Data view → choose
  Idea inbox → Save directly on the phone; “想法收集箱 测试一下” is now visible.
- The user's remaining Home feedback was excessive module-title spacing. Home-only
  CSS reduces heading spacing from 10px to 6px and embed spacing from 8px to zero;
  the native toolbar now uses automatic height with mobile targets of at least
  44px. Actual light-theme desktop styles confirm the Home embed margin is `0px` instead of
  `8px 0 12px` and toolbar height is 32px instead of 40px; the screenshot layout
  is normal. After the user fully restarted Obsidian, physical-iPhone Mirroring
  in dark mode confirmed tighter spacing: with the module title staying near
  y=412, the toolbar center moved from about y=513 to y=491 and the header top
  from y=560 to y=535 in matching 708×1564 screenshots. These are screenshot
  coordinates, not CSS measurements. Collapse/expand restored the complete table
  and retained the user's module name. Module height and Markdown are unchanged.
  This is a scoped light-desktop/dark-iPhone spacing pass, not all-phone acceptance.
- After the JavaScript fixes, the strict build and **590/590** full automated tests
  pass, with **zero skipped tests**. Lint has **zero errors and 38 existing warnings**.
  The subsequent Home-spacing-only CSS adjustment passes **44/44** reading/style
  tests; this is not a new full-suite run. The runtime files are
  synchronized to the same iCloud test vault: `main.js`, `styles.css` and
  `manifest.json` hashes match the current build. The plugin was disabled/re-enabled
  on the phone; that retained the previous spacing until a full application restart.
  The new spacing is now visually confirmed on the physical phone. Individual
  remaining touch checks are recorded separately. Runtime hashes are recorded
  in [mobile-testing.md](mobile-testing.md).
- In the phone's dark theme, the fictional finance table's column-label popup,
  tag picker and summary text remained readable at matching text sizes. Mirrored
  popup clicks still reached underlying cells, so save/selection is not a pass.
  Home's title-edit form opened and closed without saving; data-module creation
  and Chinese module-name entry were subsequently confirmed by direct touch.
- Initial, post-spacing and final phone collapse/expand checks confirm all **15 pre-existing Markdown files**
  remain byte-identical by SHA-256. Added
  fictional fixtures are separate from that check. No UI code was added to bodies.

中文：以上是 1.2.0 发布后的本地候选修复，尚未发布。复用唯一手机测试库，已确认普通文件名标题避让图标、想法表格布局和浅色列名弹窗；用户已直接触摸确认 Home 添加想法收集箱数据模块及模块名称中文输入正常，手机显示「想法收集箱 测试一下」。此前镜像菜单未显示配置弹窗的现象不代表真实触摸故障。Home 标题间距已通过浅色桌面和深色真实 iPhone 的有限视觉复测；手机须彻底重启 Obsidian 后才显示新样式，折叠／展开后内容完整恢复。其他触摸与主题场景保留各自的证据限制。详细记录见 [mobile-testing.md](mobile-testing.md)。

## 1.1.2 质量检查 / Quality checks（2026-11-04）

1.1.2 已发布到 GitHub，发布 CI 通过。严格 TypeScript 构建与 **308/308** 自动测试通过；新增覆盖不完整原生结构，以及未知布局/编辑器保留原生处理。与修改前使用同一 `eslint-plugin-obsidianmd@0.4.2` 比较，**1,570 项诊断 → 38 项警告、0 项错误**，不安全类型系列已清除。保留项和检查命令见[检查说明](review-warnings.md)。

CSS 去掉注释后，`!important` **24 → 15**、`:has()` **13 → 11**；修改聚焦废弃规则和选择器作用域。发布 CI 已加入 lint 与运行文件构建证明步骤，实际 CI 已成功，官方 1.1.2 扫描已 Completed、无 Error，构建逐字节复现与来源证明通过。本地计数不能替代官方全套检查。

桌面 Obsidian 1.14.5 实测：重新加载后的看板、表格、画廊均能展示；看板新建 → 撤销 → 重做 → 撤销通过。浅色与深色主题下检查了卡片、紫色轮廓新建按钮和标签面板。14 份原有测试 Markdown 的 SHA-256 完全一致，测试条目已撤销。初始化时原生 getter 尚不可读的情景已补回归测试，准备完成后可正常重试。

本次没有新增 iPhone 全流程通过结论。下方手机证据属于 1.1.0 / 1.1.1 及其候选构建；两版运行文件相同。后续测试继续原处更新唯一的 `Nebula-Focus-iPhone` 库。外观层仍不改 Markdown 正文或追加格式标记，主动属性编辑与纯展示分别验证。

Version 1.1.2 is published on GitHub with passing release CI. The strict TypeScript build and **308/308** automated tests pass, including new coverage for incomplete native structures and native fallback for unknown layouts/editors. Using the same `eslint-plugin-obsidianmd@0.4.2` rules before and after the changes gives **1,570 findings → 38 warnings and zero errors**, with unsafe-type findings cleared. See the [review guide](review-warnings.md) for retained findings and commands.

Excluding CSS comments, `!important` falls **24 → 15** and `:has()` **13 → 11**, focusing on obsolete rules and selector scope. CI now configures lint and runtime-file attestations; the actual CI run passed and the official 1.1.2 scan is Completed without Errors, with byte-identical build reproduction and verified attestations. Local counts do not replace the full official review.

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

The published 1.0.0 baseline passed 86/86 tests. The released 1.1.1 build, including the page sidebar, passed 295/295. **The released 1.1.2 build passes 308/308 automated tests (2026-11-04).** `npm run build` performs strict TypeScript checking and produces the external-
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

## 1.1.3 sidebar settings integration — 2026-11-04

Version 1.1.3 adds a Page sidebar section to Nebula Focus's own settings tab.
The checks below cover the local build; release CI and directory review are separate stages.

- Strict build and 310 automated tests pass. Lint retains the existing 38 warnings
  with no errors; the settings tab adds no warnings.
- Real-app settings navigation, opening the sidebar and attachment toggles passed.
  Startup opening is opt-in and is enabled in the preview vault.
- Startup opening is deferred until the host restores views. After fixing a reload
  race, two consecutive reloads each retained exactly one sidebar and one settings tab.
- Existing favorites and sibling order survive settings writes. Tests cover invalid
  setting values, concurrent updates, failed saves and unloading before layout readiness.
- The 1.1.3 installation ZIP matches all three installed runtime files and
  excludes vault preferences. All 310 pre-existing vault content files remain byte-identical.


## 1.2.0 Home, linked data and appearance — 2026-11-12

- Strict TypeScript/build and **578/578** automated tests pass. Lint has zero errors
  and the same 38 existing warnings.
- Desktop Obsidian 1.14.5: column-label popup text and input inherit the clicked
  header’s computed font in light and dark themes. Native file-name tables show
  page buttons; clicking the title starts editing and clicking the icon opens the note.
- Native appearance restores the actual file explorer in place. Sampled computed
  styles for the sidebar, paragraph, header and table value match a disabled-plugin
  baseline. The mode survives reload; rapid toggles preserve the final choice.
- Sidebar labels follow native font size, weight, padding and line-height tokens.
  Tests also cover multiple windows, stale callbacks and native multiline-class cleanup.
- Home retains a single functional tab across reload, including late placeholders and
  deferred views. Automatic repair neither creates a tab nor steals focus.
- Filename history tests cover creation → rename → two undos → two redos,
  view remounts, mobile shared history, path collisions and external file changes.
- Original preview Markdown files remained byte-identical throughout these checks.
  Public examples contain fictional data; private vaults are not release assets.
- Existing Obsidian ResizeObserver notifications were observed during native view
  remounting. These checks do not establish a warning-free renderer or a new iPhone
  hardware pass for Home/automatic data/finance features.
