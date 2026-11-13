# Nebula Focus

为 Markdown 与 Bases 提供 Codex-like 工作区：清晰的页面侧栏、提醒事项、紧凑表格与原位编辑。

A Codex-like workspace for Markdown and Bases, with focused navigation, reminders, compact tables and inline editing.

[中文](#中文) · [English](#english) · [下载 / Downloads](https://github.com/AnthemZhou/Nebula_Focus/releases) · [反馈 / Issues](https://github.com/AnthemZhou/Nebula_Focus/issues)

**1.4.0** · Obsidian **1.14.5+** · Desktop + iPhone · GPL-3.0-only

## 中文

Nebula Focus 让本地 Markdown 成为更容易浏览和编辑的工作区。界面参考 Codex 的导航与排版，手机侧栏借鉴 ChatGPT 的简洁布局；资料仍保存为普通 Markdown、属性和链接，AI 可以直接读取与编辑这些数据。

1.4.0 带来直接新建页面、桌面单主区标题、手机全屏搜索、可改名的提醒事项与精简设置，并支持撤销表格行菜单删除。项目早期借鉴 Notion 数据库的展示，但不会把任意 Markdown 自动还原成完整的 Notion 数据库。

**目录：** [功能](#功能) · [安装](#安装) · [使用](#使用) · [数据保存](#数据保存) · [兼容范围](#兼容范围) · [开发与反馈](#开发与反馈)

### 功能

- **清晰的页面侧栏。** 顶部左侧切换仓库，右侧放大镜搜索；同名文件夹与笔记合成一个入口，按「置顶、项目、页面」组织。页面和目录省略装饰图标，子项统一缩进。鼠标悬停时可置顶或新建子页，完整操作放在右键菜单；长标题右侧渐隐，停留约 300 毫秒后横向滚动，不再重复弹出全称。
- **同一个搜索入口。** 放大镜打开「直接搜索、标签、书签、文件列表」，包含仅在侧栏隐藏的笔记。桌面使用搜索面板；iPhone 使用全屏页面，顶部分类、底部输入框随软键盘避让。查询与数据未变时，来回切换分类复用结果和滚动位置，并保持键盘原来的打开或收起状态。
- **简单的工作区。** 桌面主区顶部只显示当前页面标题，底层已有原生标签保留，切回原生外观即可恢复显示。左侧栏点击始终进入主内容区；正文内部链接、提醒来源和表格页面图标默认打开右侧标签区，按住 Command / Ctrl 点击改为主内容区。已有目标页面与右侧标签区会被复用，插件不继续增加分栏或创建上下分屏。手机使用普通标签页，打开侧栏结果后自动收起抽屉。
- **提醒事项首页。** 自动读取 Markdown 未完成任务与支持的截止日期，按逾期、今天、明天、后续日期和未设日期排列。可改页面名称、手动引用已有 `.base` 数据库；关闭启动选项后恢复上次工作页面。
- **直接新建页面。** 点击「新建页面」即创建唯一命名的空白 Markdown，在主区打开；无需命名弹窗，名称通过页面顶部的原生标题修改。子页面采用相同流程，正文不写入重复标题或 UI 标记。
- **紧凑的原生数据库。** 配置后的表格支持原位标题编辑、彩色标签、内容行高、紧凑缩略图和关联记录。看板自动使用笔记第一张有效图片作为封面，过期日期保留颜色提示；新建、属性编辑与数据库撤销沿用源 Markdown 数据。
- **一致的阅读外观。** 正文、表格和侧栏采用协调的字号与颜色，阅读和编辑模式统一文字行距基线。可选内置 **霞鹜文楷 / LXGW WenKai**，无需联网或安装系统字体；代码仍使用等宽字体。随时切回 Obsidian 原生外观。
- **桌面外部归档。** 从页面右键菜单将暂时不用的页面或项目归档到库外：先复制并校验，再将源文件移入库内回收站。管理器可以浏览与恢复；手机不显示归档入口。

自动 Base、财务汇总与记录详情继续支持已有配置。打开 Markdown 时复用已有视图，或生成只查询当前笔记／同名目录直接子页的外部 Base。收支按币种分别汇总，关联通过 Markdown 链接访问；导入的公式和汇总快照不会自动变成本地实时公式，未取得的值不会补成零。详见[自动数据视图](docs/automatic-bases.md)、[财务表格](docs/finance-view.md)与[记录详情](docs/record-layout.md)。

### 安装

需要 Obsidian 1.14.5 或更新版本；使用数据库视图时启用 **Bases / 数据库** 核心插件。

1. 从 [GitHub Releases](https://github.com/AnthemZhou/Nebula_Focus/releases) 下载 `nebula-focus-1.4.0.zip`。
2. 解压到库的 `.obsidian/plugins/nebula-focus/`，确认有 `main.js`、`manifest.json`、`styles.css`。
3. 在 Obsidian 第三方插件设置中启用 **Nebula Focus**。
4. 打开现有笔记或 Base，也可在独立测试库中体验[虚构示例](examples/vault)。

更新时保留现有 `data.json`，替换上述三个运行文件，再重载插件。使用早期 `native-reading-ui` 开发插件的库，应先停用旧插件；如需迁移候选顺序，在两个插件均停用时复制旧 `data.json`。

iPhone 使用 iCloud 库时，可在电脑更新同一库的插件目录，等待同步完成，再重新打开手机上的 Obsidian。若仍显示旧界面，彻底关闭并重开应用。GitHub Release、官方社区目录审核和客户端更新同步是不同阶段，安装附件以对应 Release 为准。

### 使用

| 操作 | 方法 |
| --- | --- |
| 打开页面侧栏 | 设置 → Nebula Focus → 更多设置 → 页面侧栏 → 打开侧栏；也可用命令面板或左侧图标 |
| 搜索与浏览 | 点击侧栏顶部右侧放大镜，切换直接搜索、标签、书签或文件列表 |
| 置顶项目或页面 | 点击行内图钉；置顶区域显示在项目上方，再点图钉取消置顶 |
| 整理页面 | 拖动调整同级顺序，或使用 Alt + ↑ / ↓；右键菜单保留新建子页、排序和归档等操作 |
| 打开主页面 | 点击左侧栏页面、置顶项或搜索结果 |
| 新建页面 | 点击侧栏「新建页面」创建空白 `未命名.md`；同名时递增编号，再在页面顶部原生标题处改名 |
| 查看相关记录 | 点击正文内部链接、提醒来源或数据表前的页面图标，在右侧打开；Command / Ctrl 点击改为主区 |
| 编辑记录标题 | 点击标题文字或右侧空白；Enter / 失焦保存，Escape 取消 |
| 打开或改名提醒事项 | 点击侧栏入口；点击页面标题、右键入口或在设置中改名。「添加数据库」引用已有 Base |
| 选择与管理标签 | 点击分类值选择，再点带勾选项取消；点击列标题管理候选项、顺序与显示名称 |
| 新建条目 | 点击表格最后一行「新建条目」或看板中的「新建」 |
| 删除表格页面 | 行菜单「⋯ → 将页面移到回收站」移入库内 `.trash`，支持本次数据库会话的撤销／重做 |
| 查看图片 | 点击表格缩略图放大；看板封面使用 16:9 区域 |
| 更换字体 | 设置 → Nebula Focus → 字体 → 显示字体，选择跟随 Obsidian 或霞鹜文楷 |

提醒事项默认在冷启动时打开，插件热重载不抢走当前页面。关闭「设置 → Nebula Focus → 提醒事项 → 启动时打开提醒事项」后，由 Obsidian 恢复上次页面。旧版模块化 Home 已退出入口，原 `home` 配置与生成的 Base 文件保留，不迁移或删除其中的记录。

设置默认显示字体和提醒事项等常用项，侧栏排序、隐藏页面、桌面工具按钮与外部归档收在「更多设置」；手机隐藏桌面专用项。桌面新建入口位于提醒事项上方，手机位于侧栏底部右侧，设置在其左；手机启动和成功打开页面后保持侧栏收起。

侧栏只显示 Markdown 页面及其目录，独立 `.base` 配置仍可从搜索面板文件列表、已有嵌入和选择器访问。右键顶部或空白处可调整侧栏选项。左侧竖条按钮可在设置中选择显示项，帮助和设置位于底部。详见[页面侧栏](docs/page-sidebar.md)与[工作区导航](docs/workspace-layout.md)。

| 快捷键 | macOS | Windows / Linux |
| --- | --- | --- |
| 切换优化与原生外观 | ⌘⌥U | Ctrl+Alt+U |
| 撤销数据库操作 | ⌘Z | Ctrl+Z |
| 重做数据库操作 | ⌘⇧Z | Ctrl+Shift+Z |

单独按住 Command / Ctrl 约 0.6 秒，可查看桌面快捷键速查；松开收起。原生外观会恢复字体、间距、颜色、左侧工具和真正的文件列表，暂停自动生成 Base；重新启用后保留置顶、排序和展开状态。

数据库历史涵盖数据库中新建条目、通过原生属性事务提交的标题／标签／普通看板状态修改，以及表格行菜单移入回收站的删除；编辑文字优先使用文字撤销。手机隐藏额外撤销按钮，保留历史和命令入口。同一外部 Base 的同名、同类型手机视图可共享会话历史；关闭最后一个所属页面、停用插件或重启后清空，不跨重启保存。候选项设置、列配置、其他入口的文件删除、侧栏新建页面及跨文件夹移动不属于该数据库历史。详见[撤销覆盖范围](docs/undo-coverage.md)。

### 数据保存

浏览和外观调整不会向 Markdown 正文或文件末尾写入 UI 代码。用户主动编辑内容时，才通过相应操作更新源文件。

| 数据或操作 | 保存位置 |
| --- | --- |
| 配色、字号、间距、封面、布局测量 | CSS 与内存中的呈现层 |
| 主动修改标题、标签或看板状态 | 源笔记 YAML 属性；编辑原生文件名列通过 Obsidian 重命名文件 |
| 列名称、列宽、排序、筛选、分组 | 原生 `.base` 配置 |
| 候选项、置顶、侧栏顺序、字体与外观偏好 | 插件 `data.json` |
| 提醒事项名称、启动与数据库引用 | `data.json` 的 `reminders`；不复制任务或数据库记录 |
| 自动数据视图 | `Nebula Views/<原笔记路径>.base`，或复用原 Base |
| 记录详情布局 | `nebula-record-layouts.json`；数据与关联仍在 Markdown 中 |
| 历史 Home 配置 | 原 `home` 设置和 `Nebula Views/Home/` 文件保留，1.3.0 不再提供旧首页入口 |
| 外部归档 | 用户选定的库外目录；校验后源文件进入库内回收站 |

推荐使用外部 `.base` 文件。Markdown 内联 `base` 代码块的配置保存由 Obsidian 原生功能更新该代码块。插件没有网络服务、遥测或 AI 接入；远程封面仅请求笔记所引用图片的原始地址，不上传笔记。

字体随 `main.js` 内嵌分发，默认不加载，选择后离线启用。字体保留独立的 SIL OFL 授权，见[字体说明](docs/fonts.md)与[第三方声明](THIRD-PARTY-NOTICES.md)。

### 兼容范围

本版面向 macOS 桌面与 iPhone；Android、iPad、第三方主题和全部移动生命周期边界尚未逐项验证。桌面、真机镜像和直接触摸的证据分别记录，不能将某个流程通过视作所有界面均已通过。具体范围见[版本说明](docs/RELEASE_NOTES.md)、[测试记录](docs/TESTING.md)与[iPhone 测试](docs/mobile-testing.md)。

部分 Bases 增强依赖内部视图结构，不识别时保留原生控件。标题、标签与内容行高通过 `.base` 中的 `nebulaTable` 映射配置；旧想法收集箱配置可继续使用。分类标签与关联页面是不同操作：关联保留链接和导航，不伪装成可增删的分类选项。Notion 的 select、relation、公式与汇总语义不会仅凭外观自动完整迁移。

### 开发与反馈

```sh
npm ci
npm run lint
npm run build
npm test
```

构建生成 `main.js`。将它与 `manifest.json`、`styles.css` 放入现有测试库，再重载。定向测试可运行 `npm test -- workspace sidebar`；完整检查仍使用 `npm test`。手机验证复用同一个 iCloud 测试库，保留笔记与设置。

发布前审阅并暂存公开源码、文档和版本信息，再运行 `npm run package`。源码包读取 Git 暂存区；不要暂存私人库、截图、备份或插件 `data.json`。发布检查与保留警告见[检查说明](docs/review-warnings.md)，测试组织见[测试审计](docs/test-suite-audit.md)。

请通过 [GitHub Issues](https://github.com/AnthemZhou/Nebula_Focus/issues) 提供 Obsidian 版本、主题与复现步骤。文档采用 Node Console 的中文在前、英文在后层次，参考[中文技术文档写作规范](https://github.com/ruanyf/document-style-guide)。

## English

Nebula Focus makes local Markdown easier to browse and edit. Its navigation and typography take cues from Codex, while the mobile sidebar follows ChatGPT's restrained layout. Notes remain ordinary Markdown, properties and links that AI tools can read and edit directly.

Version 1.4.0 adds direct page creation, a single current-page header on desktop, full-screen phone search, renameable Reminders, simpler settings and undo for table row-menu deletion. The project initially borrowed from Notion's database presentation; it does not automatically turn arbitrary Markdown into a complete Notion database.

**Contents:** [Features](#features) · [Installation](#installation) · [Usage](#usage) · [Data storage](#data-storage) · [Compatibility](#compatibility) · [Development and feedback](#development-and-feedback)

### Features

- **Focused page navigation.** The vault picker sits at the top left, beside the Search magnifier. Matching folders and notes share one entry, organized under Pinned, Projects and Pages. Pages and folders omit decorative icons, with consistent child indentation. Hover actions pin entries or create children; full actions remain in the context menu. Long titles fade at the edge and scroll after about 300ms, without a duplicate full-title tooltip.
- **One search entry.** Search offers Direct Search, Tags, Bookmarks and Files, including sidebar-hidden notes. Desktop uses a panel; iPhone uses a full-screen page with top categories and a bottom input above the software keyboard. Switching categories reuses results and scroll positions while the query and data are unchanged, preserving the keyboard's open or dismissed state.
- **A simple workspace.** Desktop shows only the current page title above the main region. Existing native tabs remain underneath and reappear in native appearance. Sidebar clicks always open the main content region. Internal content links, reminder sources and table page icons open the right-hand tab group; Command / Ctrl-click opens them in the main region. Existing target pages and right-hand groups are reused rather than adding more splits or creating top/bottom panes. Mobile uses ordinary tabs and dismisses the drawer after opening a sidebar result.
- **Reminders.** Read unfinished Markdown tasks and supported page deadlines, grouped into overdue, today, tomorrow, later dates and undated items. Rename the page or reference existing `.base` databases; disable startup opening to resume the previous page.
- **Direct page creation.** New page creates a uniquely named, empty Markdown file and opens it in the main region. Rename through the native page title, without a naming dialog. Child pages follow the same flow; no duplicate heading or UI markup is inserted into the body.
- **Compact native databases.** Configured tables support inline titles, colored tags, content-driven row heights, compact thumbnails and linked records. Boards use the first valid image in a note as a cover, with overdue-date color cues. Creation, property edits and database undo use the source Markdown data.
- **Consistent reading.** Notes, tables and the sidebar share coordinated typography and colors, with a common text-leading baseline across reading and editing. Optional **LXGW WenKai** works offline without a system-font installation; code stays monospace. Native Obsidian appearance remains one shortcut away.
- **Desktop external archives.** Archive unused pages or projects outside the vault through their context menu. Files are copied and verified before sources move to the vault trash. The manager can browse and restore them; mobile has no archive controls.

Automatic Bases, finance summaries and record layouts retain existing configurations. Opening Markdown reuses a Base or creates an external view scoped to the note or its same-stem folder's direct children. Cash-flow summaries separate currencies and related records use Markdown links. Imported formulas and rollups remain snapshots rather than executable local formulas; unavailable values are never replaced with zero. See [automatic data views](docs/automatic-bases.md), [finance tables](docs/finance-view.md) and [record layouts](docs/record-layout.md).

### Installation

Requires Obsidian 1.14.5 or later. Enable the **Bases** core plugin for database views.

1. Download `nebula-focus-1.4.0.zip` from [GitHub Releases](https://github.com/AnthemZhou/Nebula_Focus/releases).
2. Extract into `.obsidian/plugins/nebula-focus/` in your vault, containing `main.js`, `manifest.json` and `styles.css`.
3. Enable **Nebula Focus** in Obsidian's Community plugins settings.
4. Open an existing note or Base, or try the [fictional examples](examples/vault) in a separate test vault.

When updating, keep `data.json`, replace those three runtime files and reload the plugin. Disable the old `native-reading-ui` development plugin first if present; transfer its `data.json` with both plugins disabled when retaining old candidate ordering.

For an iCloud vault on iPhone, update the same vault's plugin folder from the computer, wait for sync, then reopen Obsidian on the phone. Fully quit and restart if it retains the old interface. GitHub releases, official directory review and client update synchronization are separate stages; release assets define the available package.

### Usage

| Action | Method |
| --- | --- |
| Open the page sidebar | Settings → Nebula Focus → 更多设置 / More settings → Page sidebar → Open sidebar; or use the command palette/ribbon |
| Search and browse | Use the top-right magnifier and switch between Direct Search, Tags, Bookmarks and Files |
| Pin a page or project | Use its pin action; the dedicated section appears above Projects. Pin again to remove the shortcut |
| Organize pages | Drag siblings or use Alt + ↑ / ↓; right-click for child creation, ordering and archive actions |
| Open the main page | Click a sidebar page, pin or search result |
| Create a page | Use sidebar New page to create an empty `未命名.md`, adding a number if needed; rename through its native page title |
| Inspect related records | Click an internal content link, reminder source or table page icon to open on the right; Command / Ctrl-click targets the main region |
| Edit a record title | Click the text or trailing space; Enter/blur saves, Escape cancels |
| Open or rename Reminders | Use its sidebar entry; rename through the page title, entry context menu or settings. Add database references an existing Base |
| Choose and manage tags | Click a classification value; click a checked option again to deselect. Column headers manage suggestions, order and display names |
| Create a record | Use the grid's final New item row or the board's New action |
| Delete a table page | Row menu ⋯ → Move page to trash moves it to vault `.trash`, with undo/redo in the current database session |
| View images | Click a thumbnail to enlarge it; board covers use 16:9 areas |
| Choose a font | Settings → Nebula Focus → 字体 / Fonts → 显示字体 / Display font |

Reminders opens on cold startup by default; hot reload does not take focus. Disable **启动时打开提醒事项** under Settings → Nebula Focus → 提醒事项 to resume the previous workspace. The old modular Home is no longer an entry point; its `home` preferences and generated Base files remain stored without moving or deleting records.

Settings initially show common controls such as fonts and Reminders. More settings contains sidebar sorting, hidden pages, desktop tools and external archives; phones omit desktop-only options. Desktop New page sits above Reminders; mobile places it at the bottom right beside Settings. The phone drawer stays closed at startup and closes after successful page navigation.

The sidebar shows Markdown pages and their folders. Standalone `.base` files remain accessible through Files in the search panel, existing embeds and selectors. Right-click the header or blank space for sidebar options. Choose visible left-rail tools in settings; Help and Settings sit at its bottom. See [page navigation](docs/page-sidebar.md) and [workspace behavior](docs/workspace-layout.md).

| Shortcut | macOS | Windows / Linux |
| --- | --- | --- |
| Toggle enhanced / native appearance | ⌘⌥U | Ctrl+Alt+U |
| Undo a database operation | ⌘Z | Ctrl+Z |
| Redo a database operation | ⌘⇧Z | Ctrl+Shift+Z |

Hold Command / Ctrl alone for about 0.6 seconds to show desktop shortcut help; release to dismiss it. Native appearance restores fonts, spacing, colors, left tools and the actual file explorer, and pauses automatic Base generation. Re-enabling retains pins, ordering and expansion state.

Database history covers database record creation, title/tag/ordinary board-state edits submitted through native property transactions, and table row-menu deletion to vault trash. Typing keeps normal text undo. Mobile hides extra undo buttons but retains history and command access. The same named/type view of an external Base can share session history across mobile tabs; closing its last owner, disabling the plugin or restarting clears it. History does not survive restarts. Candidate settings, column configuration, deletion through other entry points, sidebar page creation and cross-folder moves are outside this database history. See [undo coverage](docs/undo-coverage.md).

### Data storage

Browsing and appearance changes do not insert UI code into Markdown bodies or append it to files. Explicit content edits update their source files through the corresponding operation.

| Data or action | Storage |
| --- | --- |
| Colors, typography, spacing, covers and geometry | CSS and in-memory presentation |
| Explicit title, tag or board-state edits | Source-note YAML; editing a native file-name column renames the note through Obsidian |
| Column names, widths, sorting, filters and groups | Native `.base` configuration |
| Suggestions, pins, sidebar order, font and appearance preferences | Plugin `data.json` |
| Reminder name, startup and database references | `reminders` in `data.json`; no task or record copies |
| Automatic data views | `Nebula Views/<original note path>.base`, or a reused Base |
| Record-detail layouts | `nebula-record-layouts.json`; data and relations remain in Markdown |
| Historical Home settings | Existing `home` preferences and `Nebula Views/Home/` files remain; 1.3.0 removes the old entry point |
| External archives | A user-selected directory outside the vault; verified sources move to vault trash |

External `.base` files are recommended. Obsidian's native save updates an inline Markdown `base` block when changing its configuration. The plugin has no network service, telemetry or AI integration. Remote covers request only the original image URL referenced by the note, without uploading notes.

The optional font and its license ship inside `main.js`. Font data loads offline only when selected. The font retains its separate SIL OFL license; see [fonts](docs/fonts.md) and [third-party notices](THIRD-PARTY-NOTICES.md).

### Compatibility

This release targets macOS desktop and iPhone. Android, iPad, third-party themes and every mobile lifecycle boundary have not been individually validated. Desktop, physical-device mirroring and direct-touch evidence are recorded separately; passing one flow does not establish that every interface has passed. See [release notes](docs/RELEASE_NOTES.md), [testing](docs/TESTING.md) and [iPhone validation](docs/mobile-testing.md).

Some Bases enhancements depend on internal view structure and retain native controls when unrecognized. Titles, tags and content-driven row heights use explicit `nebulaTable` profiles; legacy idea-inbox mappings remain usable. Classification tags and related pages have different interactions: relations retain links and navigation rather than imitating editable classification options. Notion select, relation, formula and rollup semantics do not migrate completely through appearance alone.

### Development and feedback

```sh
npm ci
npm run lint
npm run build
npm test
```

The build creates `main.js`. Copy it with `manifest.json` and `styles.css` into the existing test vault, then reload. Use `npm test -- workspace sidebar` for focused checks and `npm test` for the full suite. Phone testing reuses one iCloud test vault, preserving notes and settings.

Review and stage public source, documentation and version files before running `npm run package`. Source archives read the Git index; never stage private vaults, screenshots, backups or plugin `data.json`. See [review findings](docs/review-warnings.md) and the [test-suite audit](docs/test-suite-audit.md).

Report the Obsidian version, theme and reproduction steps through [GitHub Issues](https://github.com/AnthemZhou/Nebula_Focus/issues). This document follows Node Console's Chinese-first, English-second hierarchy and the [Chinese technical writing guide](https://github.com/ruanyf/document-style-guide).

---

Copyright © 2026 Shengyu Zhou. [GPL-3.0-only](LICENSE) · [Third-party notices](THIRD-PARTY-NOTICES.md).

Codex、ChatGPT 与 Notion 是设计参考；本项目与 OpenAI、Notion、Obsidian 无隶属关系。

Codex, ChatGPT and Notion are design references. This project is not affiliated with OpenAI, Notion or Obsidian.
