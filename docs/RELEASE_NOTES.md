# Nebula Focus 1.3.0 — Codex-like workspace and reminders

[中文](#中文) · [English](#english)

## 中文

1.3.0 将页面导航、提醒事项与原生 Bases 整合为 Codex-like 工作区，支持桌面和 iPhone。最低要求 Obsidian **1.14.5**；数据库视图需要启用 **Bases** 核心插件。

### 新增与调整

- **提醒事项取代旧 Home 入口。** 只读汇总 Markdown 未完成任务与支持的截止日期，按逾期、今天、明天、后续日期和未设日期排列；点击回到来源。可添加已有 `.base` 数据库引用，不复制记录。默认冷启动打开，关闭启动选项后恢复上次页面。旧 `home` 配置与 `Nebula Views/Home/` 文件保留。
- **侧栏统一搜索与置顶。** 桌面和手机均从顶部右侧放大镜进入「直接搜索、标签、书签、文件列表」，切换模式不替换侧栏。原有收藏成为项目上方的置顶区域，页面和项目可直接点击图钉置顶或取消；完整操作改用右键菜单。去除文件夹装饰图标，统一层级缩进。长标题右侧渐隐，悬停约 300 毫秒后滚动，不再弹出重复全称。
- **明确主区与右侧导航。** 侧栏页面、置顶和搜索结果打开主内容区。正文内部链接、提醒来源与表格页面图标默认打开右侧标签区，Command / Ctrl 点击改为主区。根据实际布局定位主区，复用已有目标页面和第二个内容组，避免插件继续增加分栏或创建上下分屏；旧布局不会被强制关闭。
- **统一阅读与字体。** 参考 Codex 调整正文、表格、侧栏、滚动条和工具栏；桌面侧栏、底部仓库区及主／右内容区改用圆角边界，协调阅读与编辑模式的行距基线。可选离线内置 **霞鹜文楷 / LXGW WenKai**，默认仍跟随 Obsidian；代码保留等宽字体。原生外观恢复颜色、排版、左侧工具和实际文件列表。
- **桌面外部归档。** 从页面右键菜单归档到库外，复制并校验后才将源文件移入库内回收站；管理器支持浏览与恢复。手机不显示该入口，侧栏底部也不重复放置归档按钮。
- **iPhone 导航与编辑修复。** 黑色侧栏保留顶部库切换、搜索及底部新建页面，露出的主区使用圆角。搜索支持连续中文输入，处理输入法确认与点击结果交错时的刷新，进入文件列表后仍保留搜索入口。成功打开结果后收起侧栏。表格图标间距、字号与末行新建更紧凑；继续复用同一个测试库。

原有通用表格、自动 Base、关联记录、按币种收支汇总、标签管理和数据库撤销继续保留。手机隐藏额外撤销／重做按钮行，内部历史与命令入口仍在；外观切换快捷键仍为 **⌘⌥U / Ctrl+Alt+U**。桌面单独按住 Command / Ctrl 可打开快捷键速查。

### 数据与升级

浏览、外观和布局不向 Markdown 正文插入 UI 代码。主动编辑内容仍更新源笔记；查询与列配置保存在 `.base`，偏好保存在插件 `data.json`。导入的 Notion 公式与汇总是来源快照，不会因外观增强自动在本地重算；缺失值不当作零。公开示例全部为虚构数据。

更新时保留现有 `data.json`，替换 `.obsidian/plugins/nebula-focus/` 下的 `main.js`、`manifest.json`、`styles.css`，然后重载。iPhone 等待同步完成后重新打开 Obsidian，必要时彻底关闭并重开以清理旧代码缓存。内置字体随 `main.js` 分发，不需要额外下载。

Release 附件提供安装 ZIP、公开源码 ZIP、虚构示例 ZIP 和校验文件。GitHub 发布、官方社区目录审核与客户端更新同步分别进行，本说明不代表目录审核已经完成。

### 验证范围

构建、自动回归、桌面明暗主题检查和手机证据分别记录于[测试记录](https://github.com/AnthemZhou/Nebula_Focus/blob/1.3.0/docs/TESTING.md)。iPhone 记录区分直接触摸与镜像检查；已有连续中文输入、字体切换、搜索模式切换和结果导航等实际证据，不代表 Android、iPad、第三方主题或所有移动生命周期均完成验证。详见[iPhone 测试](https://github.com/AnthemZhou/Nebula_Focus/blob/1.3.0/docs/mobile-testing.md)。

使用说明：[提醒事项](https://github.com/AnthemZhou/Nebula_Focus/blob/1.3.0/docs/home.md) · [页面侧栏](https://github.com/AnthemZhou/Nebula_Focus/blob/1.3.0/docs/page-sidebar.md) · [工作区规则](https://github.com/AnthemZhou/Nebula_Focus/blob/1.3.0/docs/workspace-layout.md) · [字体](https://github.com/AnthemZhou/Nebula_Focus/blob/1.3.0/docs/fonts.md) · [外部归档](https://github.com/AnthemZhou/Nebula_Focus/blob/1.3.0/docs/external-archives.md)

## English

Version 1.3.0 brings page navigation, Reminders and native Bases into a Codex-like workspace for desktop and iPhone. It requires Obsidian **1.14.5** and the **Bases** core plugin for database views.

### Features and changes

- **Reminders replaces the old Home entry.** Read unfinished Markdown tasks and supported page deadlines, grouped into overdue, today, tomorrow, later dates and undated items. Open each source or add references to existing `.base` databases without copying records. Reminders opens on cold startup by default; disable that option to resume the previous page. Existing `home` preferences and `Nebula Views/Home/` files remain stored.
- **Unified sidebar search and pins.** The top-right magnifier on desktop and mobile opens Direct Search, Tags, Bookmarks and Files without replacing the sidebar. Existing favorites appear in a dedicated section above Projects. Pin or unpin projects and pages directly; full actions stay in context menus. Decorative folder icons are removed, child indentation is consistent, and overflowing titles fade then scroll after about 300ms without duplicate tooltips.
- **Clear main/right navigation.** Sidebar pages, pins and search results open the main content region. Internal content links, reminder sources and table page icons open on the right; Command / Ctrl-click targets the main region. Routing uses the actual layout, reusing existing destination pages and the second content group rather than adding more groups or top/bottom splits. Older layouts are not forcibly closed.
- **Consistent reading and fonts.** Notes, tables, the sidebar, scrollbars and tools take cues from Codex. Desktop sidebar, vault footer and main/right content groups have rounded boundaries, with a shared text-leading baseline across reading and editing. Optional bundled **LXGW WenKai** works offline; Follow Obsidian remains the default and code stays monospace. Native appearance restores colors, typography, left tools and the actual file explorer.
- **Desktop external archives.** Archive through page context menus to a location outside the vault. Files are copied and verified before sources move to vault trash; the manager can browse and restore them. Mobile exposes no archive controls, and the sidebar footer does not duplicate the action.
- **iPhone navigation and editing fixes.** The black drawer retains vault switching and search at the top, with a compose action below and rounded exposed content. Search supports continuous Chinese input, preserves tapped results during IME commits, and retains its entry after file browsing. Successful result navigation closes the drawer. Table icon spacing, typography and final-row creation are more compact, while testing reuses the same vault.

Reusable tables, automatic Bases, linked records, per-currency cash-flow summaries, tag management and database undo remain available. Mobile hides the extra undo/redo row while retaining history and commands. **⌘⌥U / Ctrl+Alt+U** still switches appearance; hold Command / Ctrl alone on desktop for shortcut help.

### Data and updating

Browsing and layout never insert UI markup into Markdown bodies. Explicit edits still update source notes; `.base` files store queries and columns, while plugin `data.json` stores preferences. Imported Notion formulas and rollups remain snapshots rather than becoming executable local formulas through visual enhancement. Missing values are not zero. All public examples are fictional.

Keep `data.json`, replace `main.js`, `manifest.json` and `styles.css` in `.obsidian/plugins/nebula-focus/`, then reload. On iPhone, wait for synchronization and reopen Obsidian; fully quit and restart if older code remains cached. The optional font ships inside `main.js`, with no extra download.

Release assets include installation, public-source and fictional-example ZIPs plus checksums. GitHub publication, official community-directory review and client update synchronization are separate stages; these notes do not claim that directory review has completed.

### Validation scope

Build results, automated regression checks, desktop theme checks and mobile evidence are recorded separately in [testing](https://github.com/AnthemZhou/Nebula_Focus/blob/1.3.0/docs/TESTING.md). The iPhone record distinguishes direct touch from Mirroring, including observed Chinese input, font switching, search modes and result navigation. This does not establish coverage of Android, iPad, third-party themes or every mobile lifecycle boundary. See [iPhone testing](https://github.com/AnthemZhou/Nebula_Focus/blob/1.3.0/docs/mobile-testing.md).

Guides: [Reminders](https://github.com/AnthemZhou/Nebula_Focus/blob/1.3.0/docs/home.md) · [Page sidebar](https://github.com/AnthemZhou/Nebula_Focus/blob/1.3.0/docs/page-sidebar.md) · [Workspace rules](https://github.com/AnthemZhou/Nebula_Focus/blob/1.3.0/docs/workspace-layout.md) · [Fonts](https://github.com/AnthemZhou/Nebula_Focus/blob/1.3.0/docs/fonts.md) · [External archives](https://github.com/AnthemZhou/Nebula_Focus/blob/1.3.0/docs/external-archives.md)
