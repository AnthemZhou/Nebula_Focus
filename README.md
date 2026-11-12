# Nebula Focus

为 Obsidian 提供 Notion-like 的页面侧栏、Bases 表格、卡片和原位编辑。

[中文](#中文) · [English](#english) · [下载 / Downloads](https://github.com/AnthemZhou/Nebula_Focus/releases) · [反馈 / Issues](https://github.com/AnthemZhou/Nebula_Focus/issues)

**1.2.0** · Obsidian **1.14.5+** · Desktop + iPhone · GPL-3.0-only

## 中文

Nebula Focus 内置 Notion-like 页面侧栏，并为原生数据库（Bases）提供阅读与编辑优化。紧凑的表格、彩色标签和图片封面，让资料更容易浏览；笔记仍是普通 Markdown，便于直接阅读、备份和交给 AI 处理。

它面向 Markdown 与 Bases 资料，提供独立首页、自动数据视图和记录关联。Notion 数据迁移完成后，可以继续使用原生文件和属性管理内容；它不自动还原 Notion 的全部数据库规则。

**目录：** [功能](#功能) · [安装](#安装) · [使用](#使用) · [数据保存](#数据保存) · [兼容范围](#兼容范围) · [开发与反馈](#开发与反馈)

### 功能

1.2.0 把标题编辑、标签和内容行高扩展为可配置的通用表格。财务工作台使用原生 Bases 切换流水、项目、报销与发票；旧「财务关联」布局会转为表格，保留筛选、排序、分组、列宽和已有视图。已启用的收支汇总按币种分别展示，来源快照与未取得的计算值保留标识。记录详情可沿 Markdown 链接查看关联记录。见[财务表格说明](docs/finance-view.md)、[记录详情配置](docs/record-layout.md)和[虚构示例](examples/vault/Finance/README.md)。

独立[首页](docs/home.md)提供数据视图、数据摘要与快捷入口三类模块。从页面侧栏或「打开首页」命令进入，点击「编辑首页」配置、折叠或排列模块。每个数据模块使用独立 `.base` 配置，共用原 Markdown 记录；源视图之后的修改不会自动同步到模块。摘要支持记录数、合计、平均值与分组，使用完整筛选结果；涉及不同币种时，请明确按币种分组。

- **像页面一样浏览。** 页面侧栏把同名文件夹与笔记合成一个入口，支持搜索、收藏、同级拖动排序和新建子页面。字号、字重与间距跟随原生文件列表；普通页面不重复显示文档图标，数据库等类型保留图标。点击名称打开正文，点击箭头展开子页。
- **自动准备数据视图。** 打开 Markdown 时复用已有 Base，或生成只查询当前笔记／同名目录直接子页的外部 Base；不会从正文猜测数据库关系。入口、识别范围和边界见[自动数据视图](docs/automatic-bases.md)。
- **清楚、紧凑的表格。** 文字自动换行，行高随内容调整。标签保留完整文字，图片以缩略图显示，点击即可放大。
- **可管理的彩色标签。** 分类字段使用稳定的标签颜色。可以选择标签，也可以从列标题打开管理面板，增加、移除候选项或调整顺序。
- **直接编辑，连续撤销。** 点击标题或右侧空白开始输入，通过页面图标进入笔记。数据库新建和原生属性事务支持按操作顺序撤销、重做。
- **自然的卡片与看板。** 自动用正文第一张有效图片作为封面，过期日期用颜色提示。看板新建按钮保留整行布局、背景底色和主题紫色轮廓，可随时切回原生外观。

### 安装

需要 Obsidian 1.14.5 或更新版本，并启用「数据库 / Bases」核心插件。支持桌面与 iPhone；已验证范围见下方兼容说明。

安装包以 [GitHub Releases](https://github.com/AnthemZhou/Nebula_Focus/releases) 中实际发布的附件为准。GitHub 发布、社区目录扫描与客户端更新同步是独立阶段。

1. 从 [GitHub Releases](https://github.com/AnthemZhou/Nebula_Focus/releases) 下载 `nebula-focus-1.2.0.zip`。
2. 解压到库的 `.obsidian/plugins/nebula-focus/`。
3. 确认目录内有 `main.js`、`manifest.json` 和 `styles.css`。
4. 在 Obsidian 的第三方插件设置中启用 **Nebula Focus**。
5. 打开已有的 Bases 视图，或在单独的测试库中打开 [示例库](examples/vault)。

使用早期开发插件 `native-reading-ui` 的库，应先停用它。需要保留候选标签顺序时，可在两个插件均停用后，把旧插件的 `data.json` 复制到新目录。

iPhone 使用 iCloud 库时，可先在电脑上把三个插件文件放入同一同步库的插件目录，等待同步完成，再在手机启用。更新后重新打开 Obsidian，使手机加载新代码。安装包内容以对应 Release 说明为准。

### 使用

| 操作 | 方法 |
| --- | --- |
| 打开页面侧栏 | 在「设置 → Nebula Focus → 页面侧栏」点击「打开侧栏」；也可使用命令面板或功能区图标 |
| 整理页面 | 拖动调整同级顺序；也可用 Alt + ↑ / ↓ 或行菜单的「上移 / 下移」。行菜单提供收藏，＋ 新建子页面 |
| 编辑记录标题 | 点击标题文字；点击右侧空白会把光标放在末尾。Enter 或失焦保存，Escape 取消 |
| 打开笔记 | 在数据表格中点击标题前的页面图标；标题文字用于编辑 |
| 配置首页 | 打开「首页」→「编辑首页」，添加数据视图、数据摘要或快捷入口 |
| 打开笔记的数据视图 | 使用页面菜单「打开数据视图」或同名命令 |
| 选择标签 | 点击分类字段的值，搜索、选择或创建选项；再次点击带勾选项取消选择 |
| 管理标签列 | 点击分类列标题，增加或移除候选项、调整顺序、修改显示名称 |
| 修改标题列名称 | 点击列名称，在同款小面板中修改并点击勾号保存；排序仍使用工具栏 |
| 新建条目 | 点击网格最后一行的「新建条目」，或看板中的「新建」 |
| 查看图片 | 点击表格缩略图放大；项目看板封面使用 16:9 区域 |

在「设置 → Nebula Focus → 页面侧栏」管理启动时打开、排序方式和附件显示；启动时打开默认关闭。

页面侧栏默认显示笔记、数据库和白板；右上角「⋯」可显示附件、切换名称排序或打开原生文件列表。排序、收藏与展开状态保存在插件设置中，合并显示不会移动或改名现有文件。操作范围见[页面侧栏说明](docs/page-sidebar.md)。

移除候选项只影响选择列表，已有笔记中的标签值会保留。选项可用拖动排序，也可用 **Alt + ↑ / ↓** 调整顺序。

| 快捷键 | macOS | Windows / Linux |
| --- | --- | --- |
| 切换优化与原生外观 | ⌘⌥U | Ctrl+Alt+U |
| 撤销数据库操作 | ⌘Z | Ctrl+Z |
| 重做数据库操作 | ⌘⇧Z | Ctrl+Shift+Z |

桌面快捷键速查：单独按住 **Command（Mac）/ Ctrl（Windows、Linux）约 0.6 秒**，提示面板从当前内容区域底部浮起，松开收起。显示外观切换、阅读模式、笔记切换、命令面板与撤销/重做；命令快捷键跟随 Obsidian 中的自定义设置。组合键、输入法和拖动不会触发提示，提示不会移动光标或修改笔记。浅色、深色主题和系统“减少动态效果”均受支持。

按 **⌘⌥U / Ctrl+Alt+U** 切换外观时，正文和表格恢复原生字体、间距与布局，页面侧栏原位切回真正的原生文件列表。切换回来保留页面侧栏的收藏、排序与展开状态；外观选择跨插件重载与应用重启保存。原生模式也暂停自动生成 Base，不会被启动选项重新切回增强侧栏。

命令面板也提供外观切换和数据库撤销、重做。手机上隐藏撤销/重做按钮及其额外一行，桌面按钮、快捷键和命令保持可用；手机内部历史与命令面板入口保留。表格工具栏、网格末行、看板工具栏、分组加号和列底新建使用对应数据库的历史。编辑文字时，撤销优先作用于文字输入。新建、撤销和重做成功后不弹出提示；操作失败时会说明原因。

撤销范围包括数据库新建，以及通过原生属性事务提交的标题、标签值和普通看板状态修改。候选标签设置、列配置、文件删除和按文件夹分组的跨文件夹移动，不属于这套数据库撤销。各入口及验证状态见[撤销覆盖范围](docs/undo-coverage.md)。

想法收集箱保留已有排序，并在需要时追加创建时间升序，让同值的空条目依次排列。桌面与内联 Base 的历史属于当前笔记和分栏；滚动引起的暂时卸载不结束会话。手机上，同一外部 `.base` 的同名、同类型视图在独立标签页和 Home 嵌入页之间共享历史，方便从侧栏返回后继续撤销；其他数据库和视图保持隔离。关闭最后一个所属页面、停用插件或重启后，该会话历史清空。笔记已有未撤销的正文改动、已移动或被替换时，插件会保留文件；重做也不会覆盖同名文件。

### 数据保存

外观优化不修改 Markdown 正文，也不向正文或文件末尾添加样式标记。AI 可以直接读取原有正文、YAML 属性和附件链接。

| 数据或操作 | 保存位置 |
| --- | --- |
| 配色、字号、间距、封面、布局测量 | CSS 与内存中的呈现层 |
| 主动修改标题、标签或看板状态 | 原生属性操作更新 Markdown 开头的 YAML |
| 列名称、列宽、排序、筛选、分组 | 原生 `.base` 配置 |
| 候选项、隐藏候选项、候选顺序 | 插件 `data.json` |
| 侧栏顺序、收藏、展开状态 | 插件 `data.json` 的 `pageSidebar` |
| 首页名称、模块顺序与设置 | 插件 `data.json` 的 `home`；各数据模块的独立视图保存在 `Nebula Views/Home/<UUID>.base` |
| 自动数据视图 | `Nebula Views/<原笔记路径>.base`；复用已有视图时保留原位置 |
| 记录详情布局 | `nebula-record-layouts.json`；数据与关联仍是 Markdown 属性和链接 |
| 外观选择 | 插件 `data.json` 的 `appearanceMode` |
| 侧栏新建页面 | 新建 Markdown 文件；首次新建子页时按需创建同名文件夹 |
| 新建条目 | 原生 Bases 创建 Markdown 笔记 |
| 撤销新建 / 重做 | 将新笔记移入库内 `.trash` / 恢复原文件 |

推荐用外部 `.base` 文件保存视图。若使用 Markdown 内联 `base` 代码块，Obsidian 原生保存视图配置时会更新该代码块。插件没有网络服务、遥测或 AI 接入。

封面使用笔记中的图片：本地附件从库内读取；若笔记引用 HTTP(S) 图片，显示封面时会向该图片的原始地址发起请求。远程服务由笔记中的链接决定，插件不上传笔记，也不发送遥测数据。

### 兼容范围

最低要求 Obsidian 1.14.5。1.1.0 / 1.1.1 的运行代码与样式相同，已有 macOS 桌面与 iPhone 16 Pro Max 的测试记录。iPhone 核心操作有直接触摸验证，包括连续中文输入、标签编辑、横向滚动与旋转、卡片移动、图片放大，以及新建→加标签→撤销两次→重做两次；用户也确认了单元格与标签面板的字号一致。手机隐藏额外撤销按钮行，保留命令入口；表格单行标题在触摸区域内纵向居中，多行内容自然展开。

1.2.0 新增首页、自动数据视图和财务关联的测试范围，与早期 iPhone 验证分别记录。这些新功能尚未单独完成 iPhone 真机复测；Android、iPad、第三方主题及全部移动端生命周期边界也未逐项实测。构建、自动测试和桌面验证以本版 [Release 说明](docs/RELEASE_NOTES.md)为准；既有测试记录见 [TESTING.md](docs/TESTING.md)、[iPhone 测试记录](docs/mobile-testing.md)与[财务验证](docs/finance-validation.md)。

彩色标签按明确的语义字段名识别，包括领域、类型、重要性、状态、优先级、分类、发布平台、内容类型、项目和关联项目等。普通标题、摘要、日期和媒体仍按原有方式处理。这是呈现层优化，不会把文本属性转换成 Notion 的 select 或 relation 类型，也不还原 Notion 的完整数据库规则。

原位标题编辑、标签和内容行高通过 `.base` 中的 `nebulaTable` 明确映射到字段。旧「想法收集箱」的 `formula.想法` 映射会保存为通用配置，之后更改视图名称仍可使用；编辑标题更新对应属性，不重命名文件。已有显式配置不会被覆盖。配置示例见 [想法收集箱.base](examples/vault/Bases/想法收集箱.base)和[财务表格说明](docs/finance-view.md)。

Bases 的部分界面能力依赖内部视图结构。不识别的结构会保留原生控件，Obsidian 升级后需要重新验证。

自动生成 Base 不等于任意 Markdown 都会变成完整 Notion 数据库：只识别明确的属性和查询范围，其他关系、附件与计算规则需要配置。导入的 Notion 公式和汇总值是来源快照，不会自动成为本地实时公式；未取得的值不补成零。首页摘要与本地收支汇总按各自规则计算，不能据少量样例推算完整余额。

### 开发与反馈

```sh
npm ci
npm run lint
npm run build
npm test
```

构建生成 `main.js`。把它与 `manifest.json`、`styles.css` 放入测试库的插件目录，再重载插件。手机后续验证复用同一个独立 iCloud 测试库，在原处更新插件文件，保留测试笔记与设置，不再每次创建编号库。验证范围见 [TESTING.md](docs/TESTING.md)。

发布前审阅并暂存公开源码、文档和版本信息，再执行 `npm run package`。源码包读取 Git 暂存区中的文件；不要暂存私人库、截图、备份或插件 `data.json`。

发布检查使用 `eslint-plugin-obsidianmd@0.4.2`；保留的 API 建议和兼容性警告有逐项说明，未使用 `eslint-disable` 屏蔽。参见[检查说明与更新机制](docs/review-warnings.md)。

问题与建议请提交到 [GitHub Issues](https://github.com/AnthemZhou/Nebula_Focus/issues)，附上 Obsidian 版本、主题和复现步骤。文档层次参考 [中文技术文档写作规范](https://github.com/ruanyf/document-style-guide)，沿用 Node Console 的中文在前、英文在后形式。

## English

Nebula Focus includes a Notion-like page sidebar and improves reading and editing in native Bases. Compact tables, colored tags and image covers make notes easier to scan. Your notes remain ordinary Markdown, ready to read, back up or use with AI tools.

It works with Markdown and native Bases, adding a standalone Home, automatic data views and linked records. After a Notion migration, you can keep managing native files and properties. It does not automatically reproduce every Notion database rule.

**Contents:** [Features](#features) · [Installation](#installation) · [Usage](#usage) · [Data storage](#data-storage) · [Compatibility](#compatibility) · [Development and feedback](#development-and-feedback)

### Features

Version 1.2.0 makes title editing, tags and content-driven row heights available through configurable table profiles. The finance workspace uses native Bases for ledger, project, reimbursement and invoice views. Legacy **Linked finance** layouts convert to tables while retaining filters, sorting, groups, widths and existing views. Enabled cash-flow summaries remain separated by currency, with source snapshots and unavailable calculations identified. Record details follow Markdown links to related records. See [finance tables](docs/finance-view.md), [record layouts](docs/record-layout.md) and the [fictional example](examples/vault/Finance/README.md).

The standalone [Home](docs/home.md) offers data views, summaries and note shortcuts. Open it from the page sidebar or the Open Home command, then choose Edit Home to configure, collapse or reorder modules. Each data module uses an independent `.base` while sharing original Markdown records; later source-view changes do not automatically update the module. Summaries support Count, Sum, Average and grouping over the complete filtered query. Explicitly group by currency when working with multiple currencies.

- **Browse pages in one tree.** The sidebar combines matching folders and notes, with search, favorites, sibling reordering and child-page creation. Typography and spacing follow the native file explorer. Ordinary pages omit repetitive document icons; types such as Bases retain meaningful icons. Click a title to open its note; use its arrow to expand children.
- **Prepare data views automatically.** Opening Markdown reuses an existing Base or creates an external Base scoped to that note or its same-stem folder’s direct children. Relations are not guessed from prose. See [automatic data views](docs/automatic-bases.md) for detection and limits.
- **Clear, compact tables.** Text wraps and rows adapt to their content. Tags keep their full text. Images stay small until you click to enlarge them.
- **Manageable colored tags.** Classification fields receive stable tag colors. Select values in cells, or open a column's management panel to add, remove or reorder suggestions.
- **Inline editing with undo.** Click a title or its trailing blank area to type. Use the page icon to enter the note. Database creation and native property transactions support chronological undo and redo.
- **Cards and boards that fit Obsidian.** Covers use the first valid image in the note body. Overdue dates receive a color cue. Board New buttons span their column with the surrounding background and a purple theme outline. You can switch back to the native appearance.

### Installation

Use Obsidian 1.14.5 or later with the **Bases** core plugin enabled. Desktop and iPhone are supported; see the tested scope below.

Use the actual published assets on [GitHub Releases](https://github.com/AnthemZhou/Nebula_Focus/releases). GitHub publication, community-directory review and in-app update synchronization are separate stages.

1. Download `nebula-focus-1.2.0.zip` from [GitHub Releases](https://github.com/AnthemZhou/Nebula_Focus/releases).
2. Extract it into `.obsidian/plugins/nebula-focus/` inside your vault.
3. Check that the folder contains `main.js`, `manifest.json` and `styles.css`.
4. Enable **Nebula Focus** in Obsidian's community plugin settings.
5. Open an existing Base, or try the [example vault](examples/vault) in a separate test vault.

Disable the earlier development plugin `native-reading-ui` first. To preserve its suggestion order, copy its `data.json` into the new plugin folder while both plugins are disabled.

For an iPhone using an iCloud vault, copy the three plugin files into that synced vault's plugin directory from your computer, wait for synchronization, then enable the plugin on the phone. Reopen Obsidian after an update so the phone loads the new code. Each Release's notes describe its installation package.

### Usage

| Action | How |
| --- | --- |
| Open the page sidebar | Use Settings → Nebula Focus → 页面侧栏 (Page sidebar), the command palette or the sidebar ribbon icon |
| Organize pages | Drag to reorder siblings, use Alt + ↑ / ↓, or use the row menu. Favorite pages from the menu; use ＋ to create a child page |
| Edit a record title | Click its text, or click trailing blank space to place the caret at the end. Enter or blur saves; Escape cancels |
| Open a note | In a data table, click the page icon before the title; the title text is for editing |
| Configure Home | Open Home → Edit Home to add data views, summaries or note shortcuts |
| Open a note’s data view | Use Open data view in the note menu or the matching command |
| Select tags | Click a classification value to search, select or create; click a checked option again to deselect |
| Manage a tag column | Click its header to add or remove suggestions, reorder them, or change the display name |
| Rename the title column | Click the column name, edit it in the anchored panel and confirm with the check mark; sorting stays in the toolbar |
| Create an item | Use the grid's last-row New item button, or New on a board |
| View an image | Click a table thumbnail to enlarge it; project board covers use a 16:9 area |

Use Settings → Nebula Focus → Page sidebar for automatic opening, ordering and attachment visibility. Automatic opening is opt-in.

The sidebar shows notes, Bases and canvases by default. Its top-right menu shows attachments, switches to name sorting or opens the native file explorer. Ordering, favorites and expanded state are stored in plugin settings; merged entries never move or rename existing files. See the [page sidebar guide](docs/page-sidebar.md).

Removing a suggestion preserves tags already stored in notes. Drag options to reorder them, or use **Alt + ↑ / ↓**.

| Shortcut | macOS | Windows / Linux |
| --- | --- | --- |
| Toggle enhanced / native appearance | ⌘⌥U | Ctrl+Alt+U |
| Undo a database operation | ⌘Z | Ctrl+Z |
| Redo a database operation | ⌘⇧Z | Ctrl+Shift+Z |

For desktop shortcut help, hold **Command on Mac / Ctrl on Windows or Linux alone for about 0.6 seconds** to reveal a sheet from the bottom of the current content pane; release to dismiss. It shows appearance, reading mode, note switching, command palette and undo/redo shortcuts, with command bindings read from Obsidian's current custom settings. Chords, IME composition and dragging suppress it. Help never moves focus or writes notes, and respects light/dark themes and reduced motion.

Use **⌘⌥U / Ctrl+Alt+U** to restore native note and table typography, spacing and layout, and replace the Pages sidebar with a real native file explorer in the same location. Switching back preserves page favorites, order and expanded state. The appearance choice persists across plugin reloads and app restarts. Native mode also pauses automatic Base generation, and startup options do not switch it back to the enhanced sidebar.

The command palette also provides appearance, undo and redo commands. The plugin hides the phone undo/redo buttons and their extra row while retaining desktop buttons, shortcuts and commands. Phone history and command-palette access remain available. Table toolbars, grid footers, board toolbars, group plus buttons and column New buttons use their database's history. While typing, undo remains a text-editing action. Successful creation, undo and redo are silent; failures explain what happened.

Database undo covers item creation and title, tag-value or ordinary board-state edits submitted through native property transactions. Candidate settings, column configuration, file deletion and cross-folder moves in folder-grouped boards are outside this history. See [undo coverage](docs/undo-coverage.md) for supported entry points and their verification status.

The idea table preserves its existing sort and adds creation time ascending when needed to order otherwise tied empty entries. Desktop and inline Base history belongs to the current note and pane; temporary scroll unmounting does not end that session. On phones, the same external `.base` view, matched by name and type, shares history across standalone tabs and Home embeds so sidebar navigation retains undo. Other databases and views remain isolated. Closing the last owning page, disabling the plugin or restarting clears that session. Notes with subsequent body edits, moved notes or replaced files are preserved. Redo never overwrites an existing file.

### Data storage

Visual changes do not modify the Markdown body or append style markers. AI tools can read the original body, YAML properties and attachment links directly.

| Data or action | Storage |
| --- | --- |
| Colors, typography, spacing, covers and layout measurements | CSS and in-memory presentation |
| Explicit title, tag or board-state edits | Native property operations update YAML at the start of the Markdown file |
| Column names, widths, sorting, filters and grouping | Native `.base` configuration |
| Suggestions, hidden suggestions and suggestion order | Plugin `data.json` |
| Sidebar ordering, favorites and expanded state | `pageSidebar` in plugin `data.json` |
| Home title, module order and settings | `home` in plugin `data.json`; each data module's independent view is stored under `Nebula Views/Home/<UUID>.base` |
| Automatic data views | `Nebula Views/<original note path>.base`; reused views keep their location |
| Record-detail layout | `nebula-record-layouts.json`; data and relations remain Markdown properties and links |
| Appearance choice | `appearanceMode` in plugin `data.json` |
| Sidebar page creation | A new Markdown file, plus a matching folder when first adding children |
| Item creation | Native Bases creates a Markdown note |
| Undo creation / redo | Move the created note to the vault's `.trash` / restore the original file |

External `.base` files are recommended for views. When using an inline Markdown `base` code block, Obsidian's native configuration save updates that block. The plugin has no network service, telemetry or AI integration.

Covers use images referenced in your notes. Local attachments are read from the vault; an HTTP(S) image is requested from its original URL when displayed as a cover. The remote service is determined by the note's link. The plugin does not upload notes or send telemetry.

### Compatibility

Obsidian 1.14.5 is required. Versions 1.1.0 and 1.1.1 have identical runtime code and styles, with recorded testing on macOS desktop and iPhone 16 Pro Max. Core iPhone operations have direct-touch evidence: continuous Chinese input, tag editing, horizontal scrolling and rotation, card moves, image enlargement, and creation → tag edit → two undos → two redos. The user also confirmed matching tag font sizes between cells and the popup. The phone hides the extra undo-button row while retaining commands; single-line table titles are vertically centered within the touch target, while multiline content keeps its natural height.

Testing for the new Home, automatic Base and finance features in 1.2.0 is recorded separately from earlier iPhone checks. These new features have not received a separate physical-iPhone retest. Android, iPad, third-party themes and all mobile lifecycle boundaries have not been individually tested. Consult this version’s [release notes](docs/RELEASE_NOTES.md) for build, automated and desktop results, and [TESTING.md](docs/TESTING.md), [iPhone testing](docs/mobile-testing.md) and [finance validation](docs/finance-validation.md) for earlier evidence.

Colored tags recognize explicit semantic field names for areas, types, importance, status, priority, categories, publishing platforms, content types and projects. Ordinary titles, summaries, dates and media retain their usual handling. This presentation layer does not convert text properties into Notion select or relation types, or recreate Notion's full database behavior.

Inline title editing, tags and content-driven row heights use explicit field mappings in a `.base` file’s `nebulaTable` profile. The legacy idea inbox’s `formula.想法` mapping is saved as a reusable profile, so renaming the view no longer removes its enhancements. Editing updates the mapped property without renaming the file. Existing explicit profiles are preserved. See the [example Base](examples/vault/Bases/想法收集箱.base) and [finance table configuration](docs/finance-view.md).

Automatic Base generation does not turn arbitrary Markdown into a complete Notion database. It recognizes explicit properties and query scopes; other relations, attachments and calculation rules require configuration. Imported Notion formulas and rollups remain source snapshots, not automatically executable local formulas. Unavailable values never become zero. Home summaries and local cash-flow summaries follow their own configured rules; a small sample cannot establish a complete balance.

Some Bases enhancements depend on internal view structures. Unrecognized structures retain native controls. Recheck compatibility after Obsidian upgrades.

### Development and feedback

```sh
npm ci
npm run lint
npm run build
npm test
```

The build creates `main.js`. Copy it with `manifest.json` and `styles.css` into a test vault's plugin folder, then reload the plugin. Future phone testing reuses one separate iCloud test vault: update its plugin files in place while preserving test notes and settings, instead of creating another numbered vault for each build. See [TESTING.md](docs/TESTING.md) for verification scope.

Before publishing, review and stage public source, documentation and version files, then run `npm run package`. Source archives read the Git index. Keep private vaults, screenshots, backups and plugin `data.json` files out of the index.

Release checks use `eslint-plugin-obsidianmd@0.4.2`. Retained API suggestions and compatibility warnings are documented individually; no `eslint-disable` directives suppress them. See [review findings and update behavior](docs/review-warnings.md).

Report issues or suggestions through [GitHub Issues](https://github.com/AnthemZhou/Nebula_Focus/issues), including the Obsidian version, theme and reproduction steps. The document hierarchy follows the [Chinese technical writing guide](https://github.com/ruanyf/document-style-guide) and Node Console's Chinese-first, English-second layout.

---

Copyright © 2026 Shengyu Zhou. [GPL-3.0-only](LICENSE) · [Third-party notices](THIRD-PARTY-NOTICES.md).

Notion 是交互与视觉参考。本项目与 Notion、Obsidian 无隶属关系。

Notion is an interaction and visual reference. This project is not affiliated with Notion or Obsidian.
