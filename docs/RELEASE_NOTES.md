# Nebula Focus 1.2.0 — Home and linked data views

[中文](#中文) · [English](#english)

## 中文

1.2.0 增加可配置首页、自动数据视图和 Markdown 记录关联，并统一原生外观切换。最低要求 Obsidian **1.14.5**；数据视图需要启用 **Bases** 核心插件。

- **模块化首页。** 从侧栏或「打开首页」命令进入，添加数据视图、数据摘要和快捷入口。模块支持折叠、上下移动和移除，桌面也可拖动排列。摘要按原生查询的完整筛选结果计算记录数、合计或平均值；涉及不同币种时须明确按币种分组。每个数据模块在 `Nebula Views/Home/<UUID>.base` 保存独立配置，记录仍来自原 Markdown。源视图后续修改不自动同步到模块；移除模块保留 Base 与记录。
- **自动准备 Base。** 打开 Markdown 时优先复用已有视图，或在 `Nebula Views/` 创建外部配置。新视图只查询当前笔记或同名目录中的直接 Markdown 子文件；标题和标签只按明确字段识别。旧想法收集箱的映射保存为通用 `nebulaTable` 配置，重命名视图仍保留交互；已有显式配置和用户修改继续保留。
- **通用表格与关联记录。** 标题编辑、标签面板、内容行高与紧凑附件可用于已配置的数据表。财务账本继续使用原生表格和视图管理；旧「财务关联」布局转换时保留已有筛选、排序、分组、列宽和视图。只读记录详情可按配置显示指标与关联表格，沿本地 Markdown 链接追溯记录。收支汇总按币种分别计算，缺失值与来源快照有明确标识。
- **更完整的原生外观切换。** **⌘⌥U / Ctrl+Alt+U** 恢复正文与表格的原生字体、间距和布局，左侧页面栏原位切为真正的原生文件列表。选择跨重载和重启保存；切回增强外观保留侧栏收藏、顺序和展开状态。这是外观切换，不是停用插件。
- **统一文字与导航。** 页面侧栏采用原生导航字号、字重和间距，普通页面不重复显示文档图标；数据表格仍保留用于打开记录的笔记图标。表头跟随原生字体设置，已配置的标签列不拆字换行，详情中的「未取得」与表格文字保持协调。桌面单独按住 Command / Ctrl 可查看快捷键速查，松开收起。

**数据边界。** 浏览、外观和布局调整不向 Markdown 正文插入 UI 代码；主动编辑标题、标签等仍会更新源笔记属性；编辑原生文件名列会重命名笔记，并遵循 Obsidian 的链接更新设置。首页配置保存在插件 `data.json`，查询与字段映射在 `.base`，记录详情配置在独立 JSON。任意 Markdown 不会自动变成完整 Notion 数据库；导入的 Notion 公式与汇总结果仍是快照，不自动在本地重算。缺失结果不当作零，也不从局部样例推算完整资金余额。公开示例全部为虚构数据。

**验证范围。** 严格构建与 578 项自动测试通过；lint 为 0 个错误、38 个既有警告。桌面实测覆盖深浅主题下的列名编辑字号、页面图标导航、原生切换与重载；原生模式抽查样式与禁用插件时一致。  新首页、自动 Base 与财务关联没有单独完成 iPhone 真机复测；早期 iPhone 核心流程的验证记录不代表本轮新增功能全部通过。功能与历史测试边界见[首页](https://github.com/AnthemZhou/Nebula_Focus/blob/1.2.0/docs/home.md)、[自动数据视图](https://github.com/AnthemZhou/Nebula_Focus/blob/1.2.0/docs/automatic-bases.md)、[财务验证](https://github.com/AnthemZhou/Nebula_Focus/blob/1.2.0/docs/finance-validation.md)和[测试记录](https://github.com/AnthemZhou/Nebula_Focus/blob/1.2.0/docs/TESTING.md)。

更新时保留现有 `data.json`，替换 `.obsidian/plugins/nebula-focus/` 下的 `main.js`、`manifest.json`、`styles.css` 并重载插件。Release 附件另含安装 ZIP、公开源码 ZIP、虚构示例 ZIP 和校验文件。GitHub 发布与官方目录扫描、客户端更新同步分别进行；本说明不代表官方审核已经完成。

## English

Version 1.2.0 adds a configurable Home, automatic data views and linked Markdown records, with a more complete native-appearance toggle. It requires Obsidian **1.14.5** and the **Bases** core plugin for data views.

- **Modular Home.** Open Home from the sidebar or command palette, then add data views, summaries and note shortcuts. Collapse, move or remove modules; desktop users can also drag them. Summaries use the complete native filtered query for Count, Sum or Average. Explicitly group by currency for mixed-currency amounts. Each data module stores independent configuration under `Nebula Views/Home/<UUID>.base` while using the original Markdown records. Later source-view changes do not automatically update a module. Removing a module preserves its Base and records.
- **Automatic Base setup.** Opening Markdown reuses an existing view where possible, or creates an external configuration under `Nebula Views/`. New views query only the current note or a same-stem folder’s direct Markdown children. Titles and tags use explicit field detection. Legacy idea-inbox mappings become reusable `nebulaTable` profiles and survive view renaming; existing explicit profiles and user changes are preserved.
- **Reusable tables and linked records.** Configured tables gain title editing, tag panels, content-driven row heights and compact attachments. Finance books retain native tables and view management. Converting legacy Linked finance layouts preserves filters, sorting, groups, widths and views. A read-only inspector displays configured metrics and related tables, following local Markdown links. Cash-flow summaries separate currencies and identify unavailable values and source snapshots.
- **Native appearance throughout.** **⌘⌥U / Ctrl+Alt+U** restores native note and table typography, spacing and layout, and replaces the Pages sidebar with a real file explorer in place. The choice persists across reloads and restarts. Switching back retains sidebar favorites, order and expanded state. This changes appearance rather than disabling the plugin.
- **Consistent text and navigation.** Sidebar typography and spacing follow native navigation tokens. Ordinary page entries omit repetitive document icons, while data tables retain the note icon used to open a record. Headers follow native font settings, configured tag columns keep unbroken text, and unavailable-value labels stay proportional to table text. Hold Command / Ctrl alone on desktop to show shortcut help; release to dismiss it.

**Data boundaries.** Browsing and layout changes never insert UI markup into Markdown bodies. Explicit title, tag or other property edits still update the source notes. Editing a native file-name column renames its note through Obsidian’s link-aware file manager. Home settings live in plugin `data.json`, queries and field mappings in `.base`, and record layouts in separate JSON. Arbitrary Markdown does not automatically become a complete Notion database. Imported Notion formulas and rollups remain snapshots rather than executable local formulas. Missing values are not zero, and a partial sample cannot establish a complete financial balance. All public examples are fictional.

**Validation scope.** Strict build and all 578 automated tests pass. Lint reports zero errors and 38 pre-existing warnings. Desktop checks cover column-editor typography in both themes, page-icon navigation, native appearance and reload; sampled native-mode styles match the plugin-disabled baseline.  The new Home, automatic Base and finance features have not received a separate physical-iPhone retest. Earlier core iPhone checks do not establish that every new feature passes. See [Home](https://github.com/AnthemZhou/Nebula_Focus/blob/1.2.0/docs/home.md), [automatic data views](https://github.com/AnthemZhou/Nebula_Focus/blob/1.2.0/docs/automatic-bases.md), [finance validation](https://github.com/AnthemZhou/Nebula_Focus/blob/1.2.0/docs/finance-validation.md) and [testing](https://github.com/AnthemZhou/Nebula_Focus/blob/1.2.0/docs/TESTING.md) for behavior and historical evidence.

Keep your existing `data.json`, replace `main.js`, `manifest.json` and `styles.css` in `.obsidian/plugins/nebula-focus/`, then reload. Release assets also include installation, public-source and fictional-example ZIPs plus checksums. GitHub publication is separate from official directory review and in-app update synchronization; these notes do not claim that directory review has completed.
