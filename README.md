# Nebula Focus

为 Obsidian Bases 提供 Notion-like 的表格、卡片和原位编辑。

[中文](#中文) · [English](#english) · [下载 / Downloads](https://github.com/AnthemZhou/Nebula_Focus/releases) · [反馈 / Issues](https://github.com/AnthemZhou/Nebula_Focus/issues)

**1.1.0** · Obsidian **1.14.5+** · Desktop + iPhone · GPL-3.0-only

## 中文

Nebula Focus 为 Obsidian 原生数据库（Bases）提供 Notion-like 的阅读与编辑体验。紧凑的表格、彩色标签和图片封面，让资料更容易浏览；笔记仍是普通 Markdown，便于直接阅读、备份和交给 AI 处理。

它面向已经整理为 Markdown 与 Bases 的资料。Notion 数据迁移完成后，可以继续使用原生文件和属性管理内容。

**目录：** [功能](#功能) · [安装](#安装) · [使用](#使用) · [数据保存](#数据保存) · [兼容范围](#兼容范围) · [开发与反馈](#开发与反馈)

### 功能

- **像页面一样浏览。** 页面侧栏把同名文件夹与笔记合成一个入口，支持搜索、收藏、同级拖动排序和新建子页面。点击名称打开正文，点击箭头展开子页。
- **清楚、紧凑的表格。** 文字自动换行，行高随内容调整。标签保留完整文字，图片以缩略图显示，点击即可放大。
- **可管理的彩色标签。** 分类字段使用稳定的标签颜色。可以选择标签，也可以从列标题打开管理面板，增加、移除候选项或调整顺序。
- **直接编辑，连续撤销。** 点击标题或右侧空白开始输入，通过页面图标进入笔记。数据库新建和原生属性事务支持按操作顺序撤销、重做。
- **自然的卡片与看板。** 自动用正文第一张有效图片作为封面，过期日期用颜色提示。看板新建按钮保留整行布局、背景底色和主题紫色轮廓，可随时切回原生外观。

### 安装

需要 Obsidian 1.14.5 或更新版本，并启用「数据库 / Bases」核心插件。支持桌面与 iPhone；已验证范围见下方兼容说明。

官方插件目录尚未批准收录。目前请从 GitHub Releases 安装；目录审核通过后，才可在 Obsidian 社区插件市场搜索 **Nebula Focus**。

1. 从 [GitHub Releases](https://github.com/AnthemZhou/Nebula_Focus/releases) 下载 `nebula-focus-1.1.0.zip`。
2. 解压到库的 `.obsidian/plugins/nebula-focus/`。
3. 确认目录内有 `main.js`、`manifest.json` 和 `styles.css`。
4. 在 Obsidian 的第三方插件设置中启用 **Nebula Focus**。
5. 打开已有的 Bases 视图，或在单独的测试库中打开 [示例库](examples/vault)。

使用早期开发插件 `native-reading-ui` 的库，应先停用它。需要保留候选标签顺序时，可在两个插件均停用后，把旧插件的 `data.json` 复制到新目录。

iPhone 使用 iCloud 库时，可先在电脑上把三个插件文件放入同一同步库的插件目录，等待同步完成，再在手机启用。更新后重新打开 Obsidian，使手机加载新代码。安装包内容以对应 Release 说明为准。

### 使用

| 操作 | 方法 |
| --- | --- |
| 打开页面侧栏 | 命令面板运行「Nebula Focus: 打开页面侧栏」，或点击功能区的侧栏图标 |
| 整理页面 | 拖动调整同级顺序；也可用 Alt + ↑ / ↓ 或行菜单的「上移 / 下移」。行菜单提供收藏，＋ 新建子页面 |
| 编辑想法标题 | 点击标题文字；点击右侧空白会把光标放在末尾。Enter 或失焦保存，Escape 取消 |
| 打开笔记 | 点击标题前的页面图标 |
| 选择标签 | 点击分类字段的值，搜索、选择或创建选项；再次点击带勾选项取消选择 |
| 管理标签列 | 点击分类列标题，增加或移除候选项、调整顺序、修改显示名称 |
| 修改标题列名称 | 点击列名称，在同款小面板中修改并点击勾号保存；排序仍使用工具栏 |
| 新建条目 | 点击网格最后一行的「新建条目」，或看板中的「新建」 |
| 查看图片 | 点击表格缩略图放大；项目看板封面使用 16:9 区域 |

页面侧栏默认显示笔记、数据库和白板；右上角「⋯」可显示附件、切换名称排序或打开原生文件列表。排序、收藏与展开状态保存在插件设置中，合并显示不会移动或改名现有文件。操作范围见[页面侧栏说明](docs/page-sidebar.md)。

移除候选项只影响选择列表，已有笔记中的标签值会保留。选项可用拖动排序，也可用 **Alt + ↑ / ↓** 调整顺序。

| 快捷键 | macOS | Windows / Linux |
| --- | --- | --- |
| 切换优化与原生外观 | ⌘⌥U | Ctrl+Alt+U |
| 撤销数据库操作 | ⌘Z | Ctrl+Z |
| 重做数据库操作 | ⌘⇧Z | Ctrl+Shift+Z |

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
| 侧栏新建页面 | 新建 Markdown 文件；首次新建子页时按需创建同名文件夹 |
| 新建条目 | 原生 Bases 创建 Markdown 笔记 |
| 撤销新建 / 重做 | 将新笔记移入库内 `.trash` / 恢复原文件 |

推荐用外部 `.base` 文件保存视图。若使用 Markdown 内联 `base` 代码块，Obsidian 原生保存视图配置时会更新该代码块。插件没有网络服务、遥测或 AI 接入。

封面使用笔记中的图片：本地附件从库内读取；若笔记引用 HTTP(S) 图片，显示封面时会向该图片的原始地址发起请求。远程服务由笔记中的链接决定，插件不上传笔记，也不发送遥测数据。

### 兼容范围

1.1.0 最低要求 Obsidian 1.14.5，已在 macOS 桌面与 iPhone 16 Pro Max 上测试。iPhone 核心操作有直接触摸验证，包括连续中文输入、标签编辑、横向滚动与旋转、卡片移动、图片放大，以及新建→加标签→撤销两次→重做两次；用户也确认了单元格与标签面板的字号一致。手机隐藏额外撤销按钮行，保留命令入口；表格单行标题在触摸区域内纵向居中，多行内容自然展开。

构建与 295 项自动测试通过。桌面浅色、深色主题已经检查；Android、iPad、第三方主题及所有手机生命周期边界尚未逐项实测。这些结果说明已验证的核心流程，不代表所有移动设备、主题和交互都完成验收。详细记录见 [iPhone 测试记录](docs/mobile-testing.md) 与 [TESTING.md](docs/TESTING.md)。

彩色标签按明确的语义字段名识别，包括领域、类型、重要性、状态、优先级、分类、发布平台、内容类型、项目和关联项目等。普通标题、摘要、日期和媒体仍按原有方式处理。这是呈现层优化，不会把文本属性转换成 Notion 的 select 或 relation 类型，也不还原 Notion 的完整数据库规则。

自动行高、标题编辑、列管理、候选面板和表格底部新建，目前针对名为「想法收集箱」的原生表格。标题列使用 `formula.想法`，从 `这里写想法` 属性生成文件链接；编辑标题更新该属性，不重命名文件。配置示例见 [想法收集箱.base](examples/vault/Bases/想法收集箱.base)。

Bases 的部分界面能力依赖内部视图结构。不识别的结构会保留原生控件，Obsidian 升级后需要重新验证。

### 开发与反馈

```sh
npm ci
npm run build
npm test
```

构建生成 `main.js`。把它与 `manifest.json`、`styles.css` 放入测试库的插件目录，再重载插件。手机后续验证复用同一个独立 iCloud 测试库，在原处更新插件文件，保留测试笔记与设置，不再每次创建编号库。验证范围见 [TESTING.md](docs/TESTING.md)。

发布前审阅并暂存公开源码、文档和版本信息，再执行 `npm run package`。源码包读取 Git 暂存区中的文件；不要暂存私人库、截图、备份或插件 `data.json`。

问题与建议请提交到 [GitHub Issues](https://github.com/AnthemZhou/Nebula_Focus/issues)，附上 Obsidian 版本、主题和复现步骤。文档层次参考 [中文技术文档写作规范](https://github.com/ruanyf/document-style-guide)，沿用 Node Console 的中文在前、英文在后形式。

## English

Nebula Focus brings a Notion-like reading and editing experience to Obsidian Bases. Compact tables, colored tags and image covers make notes easier to scan. Your notes remain ordinary Markdown, ready to read, back up or use with AI tools.

It works with content already organized as Markdown and native Bases. After a Notion migration, you can continue managing the underlying files and properties in Obsidian.

**Contents:** [Features](#features) · [Installation](#installation) · [Usage](#usage) · [Data storage](#data-storage) · [Compatibility](#compatibility) · [Development and feedback](#development-and-feedback)

### Features

- **Browse pages in one tree.** The page sidebar combines matching folders and notes, with search, favorites, sibling reordering and child-page creation. Click a title to open its note; use its arrow to expand children.
- **Clear, compact tables.** Text wraps and rows adapt to their content. Tags keep their full text. Images stay small until you click to enlarge them.
- **Manageable colored tags.** Classification fields receive stable tag colors. Select values in cells, or open a column's management panel to add, remove or reorder suggestions.
- **Inline editing with undo.** Click a title or its trailing blank area to type. Use the page icon to enter the note. Database creation and native property transactions support chronological undo and redo.
- **Cards and boards that fit Obsidian.** Covers use the first valid image in the note body. Overdue dates receive a color cue. Board New buttons span their column with the surrounding background and a purple theme outline. You can switch back to the native appearance.

### Installation

Use Obsidian 1.14.5 or later with the **Bases** core plugin enabled. Desktop and iPhone are supported; see the tested scope below.

The official plugin directory has not yet approved this plugin. Install from GitHub Releases for now. After approval, **Nebula Focus** will be searchable in Obsidian Community plugins.

1. Download `nebula-focus-1.1.0.zip` from [GitHub Releases](https://github.com/AnthemZhou/Nebula_Focus/releases).
2. Extract it into `.obsidian/plugins/nebula-focus/` inside your vault.
3. Check that the folder contains `main.js`, `manifest.json` and `styles.css`.
4. Enable **Nebula Focus** in Obsidian's community plugin settings.
5. Open an existing Base, or try the [example vault](examples/vault) in a separate test vault.

Disable the earlier development plugin `native-reading-ui` first. To preserve its suggestion order, copy its `data.json` into the new plugin folder while both plugins are disabled.

For an iPhone using an iCloud vault, copy the three plugin files into that synced vault's plugin directory from your computer, wait for synchronization, then enable the plugin on the phone. Reopen Obsidian after an update so the phone loads the new code. Each Release's notes describe its installation package.

### Usage

| Action | How |
| --- | --- |
| Open the page sidebar | Run `Nebula Focus: 打开页面侧栏` (Open page sidebar) in the command palette, or use the ribbon sidebar icon |
| Organize pages | Drag to reorder siblings, use Alt + ↑ / ↓, or use the row menu. Favorite pages from the menu; use ＋ to create a child page |
| Edit an idea title | Click its text, or click trailing blank space to place the caret at the end. Enter or blur saves; Escape cancels |
| Open a note | Click the page icon before its title |
| Select tags | Click a classification value to search, select or create; click a checked option again to deselect |
| Manage a tag column | Click its header to add or remove suggestions, reorder them, or change the display name |
| Rename the title column | Click the column name, edit it in the anchored panel and confirm with the check mark; sorting stays in the toolbar |
| Create an item | Use the grid's last-row New item button, or New on a board |
| View an image | Click a table thumbnail to enlarge it; project board covers use a 16:9 area |

The sidebar shows notes, Bases and canvases by default. Its top-right menu shows attachments, switches to name sorting or opens the native file explorer. Ordering, favorites and expanded state are stored in plugin settings; merged entries never move or rename existing files. See the [page sidebar guide](docs/page-sidebar.md).

Removing a suggestion preserves tags already stored in notes. Drag options to reorder them, or use **Alt + ↑ / ↓**.

| Shortcut | macOS | Windows / Linux |
| --- | --- | --- |
| Toggle enhanced / native appearance | ⌘⌥U | Ctrl+Alt+U |
| Undo a database operation | ⌘Z | Ctrl+Z |
| Redo a database operation | ⌘⇧Z | Ctrl+Shift+Z |

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
| Sidebar page creation | A new Markdown file, plus a matching folder when first adding children |
| Item creation | Native Bases creates a Markdown note |
| Undo creation / redo | Move the created note to the vault's `.trash` / restore the original file |

External `.base` files are recommended for views. When using an inline Markdown `base` code block, Obsidian's native configuration save updates that block. The plugin has no network service, telemetry or AI integration.

Covers use images referenced in your notes. Local attachments are read from the vault; an HTTP(S) image is requested from its original URL when displayed as a cover. The remote service is determined by the note's link. The plugin does not upload notes or send telemetry.

### Compatibility

Version 1.1.0 requires Obsidian 1.14.5 and has been tested on macOS desktop and iPhone 16 Pro Max. Core iPhone operations have direct-touch evidence: continuous Chinese input, tag editing, horizontal scrolling and rotation, card moves, image enlargement, and creation → tag edit → two undos → two redos. The user also confirmed matching tag font sizes between cells and the popup. The phone hides the extra undo-button row while retaining commands; single-line table titles are vertically centered within the touch target, while multiline content keeps its natural height.

The build and 295 automated tests pass. Desktop light and dark themes have been checked. Android, iPad, third-party themes and all phone lifecycle edge cases have not been individually tested. These results cover the verified core workflows, not every mobile device, theme or interaction. See the [iPhone test record](docs/mobile-testing.md) and [TESTING.md](docs/TESTING.md).

Colored tags recognize explicit semantic field names for areas, types, importance, status, priority, categories, publishing platforms, content types and projects. Ordinary titles, summaries, dates and media retain their usual handling. This presentation layer does not convert text properties into Notion select or relation types, or recreate Notion's full database behavior.

Automatic row heights, title editing, column management, suggestion panels and the table's new-item footer currently target a native table named `想法收集箱`. Its title column uses `formula.想法` to generate a file link from the `这里写想法` property. Editing updates that property without renaming the file. These are exact configuration names; see the [example Base](examples/vault/Bases/想法收集箱.base).

Some Bases enhancements depend on internal view structures. Unrecognized structures retain native controls. Recheck compatibility after Obsidian upgrades.

### Development and feedback

```sh
npm ci
npm run build
npm test
```

The build creates `main.js`. Copy it with `manifest.json` and `styles.css` into a test vault's plugin folder, then reload the plugin. Future phone testing reuses one separate iCloud test vault: update its plugin files in place while preserving test notes and settings, instead of creating another numbered vault for each build. See [TESTING.md](docs/TESTING.md) for verification scope.

Before publishing, review and stage public source, documentation and version files, then run `npm run package`. Source archives read the Git index. Keep private vaults, screenshots, backups and plugin `data.json` files out of the index.

Report issues or suggestions through [GitHub Issues](https://github.com/AnthemZhou/Nebula_Focus/issues), including the Obsidian version, theme and reproduction steps. The document hierarchy follows the [Chinese technical writing guide](https://github.com/ruanyf/document-style-guide) and Node Console's Chinese-first, English-second layout.

---

Copyright © 2026 Shengyu Zhou. [GPL-3.0-only](LICENSE) · [Third-party notices](THIRD-PARTY-NOTICES.md).

Notion 是交互与视觉参考。本项目与 Notion、Obsidian 无隶属关系。

Notion is an interaction and visual reference. This project is not affiliated with Notion or Obsidian.
