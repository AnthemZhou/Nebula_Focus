# Nebula Focus 1.4.1 — Readable record titles and layout fixes

[中文](#中文) · [English](#english)

## 中文

1.4.1 修正记录标题显示和表格交互，并统一桌面文字与手机侧栏布局。最低要求 Obsidian **1.14.5**；数据库视图需要启用 **Bases** 核心插件。

### 本次更新

- **显示真实记录标题。** 从表格打开导入记录后，页面顶部、面包屑和标签页显示明确映射的标题，而不是 UUID 文件名；也支持已有 `title` 字段及 UUID 文件的别名。仅打开或聚焦标题不会改名或修改笔记。主动修改页面顶部原生标题时，文件改名成功后同步已知的非空标题属性，保留并发修改与只读保护。
- **点击标题直接进入页面。** 表格标题和页面图标打开记录，改名统一在打开后的页面顶部进行。只有标题文字显示手形指针，空白区域不再触发标题编辑。保留键盘导航及滚动、拖选保护。
- **字体和表格排版。** 新增离线可用的 Codex 系统字体选项；桌面正文、表格内容、表头、工具栏和侧栏页面名默认为 14px，随用户文字设置缩放。校正标签顶部位置、工具栏按钮重叠及折叠块标题对齐，行操作渐变覆盖单元格的整段高度。
- **删除与滚动修复。** 表格记录右键菜单增加「将页面移到回收站」，与行菜单共用数据库会话撤销／重做。修复阅读模式旧编辑器缓存误阻止删除，以及滚到嵌入表格页面底部时的反复抖动。
- **可编辑视图说明。** 通过表格的原生布局选项修改「视图说明」，可编辑或清空「代表性样例，非完整账本」等说明，配置保存在 `.base`。
- **侧栏细节。** 桌面工具、设置和帮助图标居中；增强外观关闭悬停提示并保留辅助技术名称。手机设置位于左下角、新建页面位于右下角；顶部仓库名和搜索沿用主页面工具栏偏移，底部去掉额外的 12px 留白，圆角裁切使用同一轮廓。

### 升级与数据

保留 `data.json`，替换 `.obsidian/plugins/nebula-focus/` 下的 `main.js`、`manifest.json`、`styles.css`，再重载插件。iPhone 等待 iCloud 同步后彻底关闭并重开 Obsidian，以清除旧样式缓存。

浏览与呈现不改写 Markdown。主动改名使用原生文件改名及受保护的标题属性同步；该改名不属于数据库撤销历史。表格删除固定移入库内 `.trash`，撤销历史只保留在当前数据库会话中。源码和示例包不含私人笔记、插件设置或本机验证截图。

### 验证范围

- 全量 **792/792** 测试通过，覆盖 **56** 个文件；严格 TypeScript 构建通过；Lint 为 **0 错误、37 项警告**，未关闭规则。
- Mac 已验证导入记录的可读标题及桌面 14px 侧栏；标题映射、只读／并发保护、右键删除、滚动高度和卸载恢复均有自动化覆盖。
- 手机运行文件已同步到现有测试库。最后的顶部对齐和底部下移仍需重启应用后的真机确认，未计为实机通过；既有搜索触摸证据属于前版，不扩大为本版全量手机验收。

详见[测试记录](https://github.com/AnthemZhou/Nebula_Focus/blob/1.4.1/docs/TESTING.md)、[检查说明](https://github.com/AnthemZhou/Nebula_Focus/blob/1.4.1/docs/review-warnings.md)和[撤销范围](https://github.com/AnthemZhou/Nebula_Focus/blob/1.4.1/docs/undo-coverage.md)。GitHub Release、社区目录审核与客户端同步是不同阶段。

## English

Version 1.4.1 fixes record-title display and table interactions, coordinates desktop typography and refines the mobile drawer. It requires Obsidian **1.14.5** and the **Bases** core plugin for database views.

### Changes

- **Readable record titles.** Opened records show their explicitly mapped title in the page heading, breadcrumb and tab instead of a UUID filename. Existing `title` fields and aliases on UUID-named files are also supported. Opening or focusing the title does not rename or modify a note. Deliberate native-title edits synchronize a known nonempty title property after a successful rename, with read-only and concurrent-edit guards.
- **Titles navigate directly.** Grid titles and page icons open the record; renaming belongs to the opened page's native title. Only title text shows a pointer cursor, and blank cell space no longer starts title editing. Keyboard navigation, scrolling and selection guards remain.
- **Typography and table layout.** Add an offline Codex system-font option. Desktop body text, table values, headers, tools and sidebar page names share a 14px default that scales with the user's text preference. Align tags and collapsible headings, separate overlapping toolbar actions, and extend the row-menu fade over the cell's full height.
- **Deletion and scrolling fixes.** Add Move page to trash to the table record context menu, sharing database-session undo/redo with the row menu. Prevent stale reading-mode editor caches from blocking safe deletion, and keep the table creation row mounted to avoid repeated scroll jumps at the page bottom.
- **Editable view descriptions.** Change or clear explanatory text through View description in the table's native layout options; the value stays in `.base` configuration.
- **Sidebar details.** Center desktop rail, Settings and Help icons. Suppress hover hints in enhanced appearance while retaining accessible names. Mobile places Settings at bottom left and New page at bottom right, shares the main toolbar's top offset, removes an extra 12px footer gap and clips rounded content to one contour.

### Updating and data

Keep `data.json`; replace `main.js`, `manifest.json` and `styles.css` in `.obsidian/plugins/nebula-focus/`, then reload. On iPhone, allow iCloud sync to finish and fully quit/reopen Obsidian to clear cached styles.

Presentation does not rewrite Markdown. Explicit title edits use native renaming and guarded title-property synchronization, outside database undo history. Table deletion always uses vault `.trash`; database undo history is session-local. Public source and example archives exclude private notes, plugin settings and local validation screenshots.

### Validation scope

- **792/792** tests pass across **56** files, with a passing strict TypeScript build and **zero lint errors / 37 warnings**. No rule was disabled.
- Mac checks confirm readable imported-record titles and the 14px desktop sidebar. Automated coverage includes title mapping, read-only/concurrent guards, context-menu deletion, scroll-height stability and teardown.
- Runtime files are synced to the existing iPhone test vault. Final header alignment and footer lowering still await a device check after restarting the app; they are not reported as verified. Earlier search touch evidence is not a full acceptance run for this release.

See [testing](https://github.com/AnthemZhou/Nebula_Focus/blob/1.4.1/docs/TESTING.md), [review findings](https://github.com/AnthemZhou/Nebula_Focus/blob/1.4.1/docs/review-warnings.md) and [undo coverage](https://github.com/AnthemZhou/Nebula_Focus/blob/1.4.1/docs/undo-coverage.md). GitHub publication, community-directory review and client synchronization are separate stages.
