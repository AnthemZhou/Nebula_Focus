# 页面侧栏 / Page sidebar

1.3.0 以「提醒事项」作为可关闭的默认启动页，省略重复的「工作空间」抬头与数据库配置条目。桌面左下角保留原生库切换，帮助和设置移到最左竖条底端；手机顶部显示库名与搜索入口，底部悬浮新建页面。工具按钮可在设置中逐项选择。颜色、导航规则与手机抽屉宽度见[工作区外观](workspace-layout.md)。

Version 1.3.0 defaults to Reminders at startup, with an option to resume the previous page instead. The repeated Workspace heading and database configuration entries are omitted. Desktop vault switching remains at the lower left, with Help and Settings at the bottom of the left rail. Mobile shows the vault name and search entry at the top, with a floating New page action below. Choose visible tools in settings. See [workspace appearance](workspace-layout.md) for colors, navigation rules and mobile drawer width.

本文描述 1.3.0 的页面侧栏。置顶分组、统一搜索、标题横移、手机导航收起与桌面外部归档均包含在本版中。
This guide describes the page sidebar in 1.3.0, including pinned groups, unified search, title scrolling, mobile drawer dismissal and desktop external archives.

## 中文

页面侧栏是 Nebula Focus 的内置功能。在「设置 → Nebula Focus → 页面侧栏」可打开侧栏、设置启动时打开、排序方式和附件显示；启动时打开默认关闭。也可在命令面板运行「Nebula Focus: 打开页面侧栏」，或点击左侧功能区的侧栏图标。侧栏作为独立的「页面」标签显示，原生文件列表仍可使用。

### 浏览与整理

- `Project.md` 与 `Project/` 显示为一个 Project 入口。也识别文件夹内的同名笔记，例如 `Project/Project.md`。如果两种笔记同时存在，保留另一篇笔记的入口。
- 页面树默认只显示 Markdown 页面与包含页面的目录，不显示独立 `.base` 数据库配置，也不显示仅含这些配置的空目录。数据库仍可从页面嵌入、提醒事项添加入口、选择器或原生文件列表访问；没有删除或改动数据库文件。
- 侧栏按「置顶」「项目」「页面」分组。根目录中的文件夹及文件夹笔记归入「项目」，独立的根页面归入「页面」；项目内部仍沿用原来的父子关系，不复制或改动文件。
- 点击侧栏页面、置顶项或页面搜索结果，默认在主内容区打开；即使焦点位于右侧标签，也不替换右侧记录。主区已有同一页面时复用，否则使用未固定的当前主标签；固定标签保留。中键及「在新标签页打开」在主组新增标签，桌面另提供明确的「在右侧新标签页打开」。点击箭头展开子页面，没有正文的文件夹点击名称时展开。手机普通点击复用当前或已有页面，固定标签仍保留，也可明确选择新标签打开。
- 桌面与手机顶部右侧都使用放大镜打开独立查找面板，包含「直接搜索」「标签」「书签」「文件列表」四种模式，不替换页面侧栏。查找包含收起的子页面，原页面树的展开与排序保持不变。关闭面板保留查询；取消不会跳转页面。
- 悬停行时点击图钉即可置顶或取消置顶；完整操作保留在右键菜单中。项目与页面共用独立的「置顶」区域，位于「项目」上方，有置顶内容时出现。原有收藏无需重新设置。置顶列表可独立排序：桌面拖动、Alt + ↑ / ↓，或在右键菜单中选择「上移 / 下移」；取消置顶只移除快捷入口。
- 底部「新建页面」创建根页面，手机使用悬浮按钮；行内 ＋ 或菜单中的「新建子页面」在该页面下创建笔记。
- 默认使用手动排序。根级项目与独立页面分别在各自分组内排序，项目内部的文件夹和笔记仍共用同级顺序。桌面可直接拖动，也可使用 Alt + ↑ / ↓ 或行菜单的「上移 / 下移」。顺序、置顶、展开状态会在重载后保留。
- 右键点击侧栏顶部或空白处可切换名称排序、显示附件、打开原生文件列表。切回手动排序会恢复之前保存的顺序。

侧栏打开与内容内部跳转分工不同：正文内部链接、提醒来源及数据库页面图标仍默认在右侧打开；Command（macOS）或 Ctrl（Windows/Linux）＋点击改为主内容区。表格标题文字仍用于原位编辑。详见[工作区导航规则](workspace-layout.md#页面图标与右侧标签)。

键盘 ↑ / ↓ 移动焦点，→ 展开，← 收起或返回父级，Enter 打开，Shift + F10 打开行菜单。手机保留普通触摸滚动，长按条目可打开操作菜单，行内保留置顶按钮。成功打开页面或刚创建的页面后，左侧抽屉自动收起；展开目录或打开失败不会收起，桌面侧栏保持打开。这轮手机抽屉与触摸布局变更的真机验证以 [iPhone 测试记录](mobile-testing.md)为准。

### 统一查找面板

- 「直接搜索」匹配本地 Markdown 标题与正文，显示对应页面及路径。
- 「标签」读取笔记正文与属性中的本地标签，从标签查找相关页面。
- 「书签」只读 Obsidian 保存的书签配置，保留分组关系，不创建另一套书签或改写原配置。
- 「文件列表」在面板内展开目录并浏览文件，不打开另一套原生侧栏。

独立搜索包含仅从侧栏隐藏的笔记，继续排除系统目录、回收站及生成视图目录。搜索与筛选在本地执行；它不是原生高级搜索引擎的完整替代，书签中的复杂已保存查询不承诺原生查询语法兼容。点击结果才打开对应内容，切换模式本身不会跳转工作页面。

### 字体与长标题

侧栏参考 Codex 的紧凑导航：默认桌面页面文字 14px、行高 1.4，随用户正文字号缩放，收紧行间空隙并提高文字亮度。普通页面与目录都省略装饰图标，目录保留展开箭头；子项按标题基线统一缩进。滚动条宽 6px，平时较淡，悬停时增强对比。长标题在右侧渐隐；桌面鼠标停留在标题上约 300 毫秒后，只有超出可见宽度的文字才缓慢横移，移开鼠标后恢复原位置。不再额外弹出完整标题提示框；屏幕阅读器仍可读取完整名称。手机、触屏及系统启用「减少动态效果」时不启动横移动画，标题文字本身不会被改写。

切换到原生外观时，页面侧栏原位替换为真正的原生文件列表；重新启用优化外观后，恢复原有搜索、滚动位置、置顶和展开状态。

### 桌面外部归档

桌面行菜单提供「归档到外部…」。侧栏底部不再单列归档按钮；从顶部／空白处右键菜单的「外部归档…」或命令面板「Nebula Focus: 管理外部归档」打开管理界面，浏览及恢复已归档内容。手机不显示归档入口。归档会复制并校验文件，再将源文件移入库内回收站，与只改变显示的「隐藏页面路径」不同。范围、保存位置与恢复方式见[外部归档](external-archives.md)。

### 保存与范围

合并显示、置顶、搜索和排序不修改笔记正文、文件名或目录结构。侧栏设置使用 `data.json` 中的 `pageSidebar`，与标签设置共用写入队列；置顶继续使用既有 `favorites` 数组保存顺序，没有创建另一份收藏数据。

在「设置 → Nebula Focus → 页面侧栏 → 隐藏页面路径」中，每行填写一个库内相对路径，例如 `Guide.md` 或 `Archive`，再点击「保存」。文件路径隐藏该文件；文件夹路径隐藏该文件夹及其子项。隐藏项不出现在侧栏页面树和置顶项中；桌面与手机独立页面搜索仍可查找，不会因此重新显示侧栏条目。删除对应行并保存即可恢复侧栏显示，已有收藏和排序设置会保留。

路径按完整名称匹配，不使用通配符；`Archive` 不会隐藏 `Archive notes`，也不会自动隐藏同名的 `Archive.md`。需要隐藏同名笔记与文件夹时分别填写。生成视图的 `Nebula Views` 目录和所有独立 `.base` 条目自动从页面侧栏省略。隐藏仅影响页面侧栏，不移动、删除或修改文件；原生文件列表、页面嵌入和既有链接仍可访问它们。自定义列表存于 `pageSidebar.hiddenPaths`，文件重命名时会同步更新相应路径。

新建页面是明确的文件创建操作：以用户输入的名称创建普通 `.md` 文件。在尚无同名文件夹的笔记下新建子页时，先创建该文件夹，原笔记保持原位置。重名时提示改用其他名称，不覆盖已有文件。

拖动只调整同级显示顺序，不改变父子关系。需要跨文件夹移动、重命名或删除时，使用原生文件列表。侧栏操作不属于数据库撤销历史。

## English

The page sidebar is built into Nebula Focus. Settings → Nebula Focus → Page sidebar provides opening, opt-in automatic opening, sort mode and attachment controls. You can also run `Nebula Focus: 打开页面侧栏` (Open page sidebar) from the command palette, or use the sidebar ribbon icon. The Pages tab is independent of the native file explorer.

### Browsing and organization

- `Project.md` and `Project/` share one Project entry. Internal folder notes such as `Project/Project.md` are also recognized. If both notes exist, the second note remains accessible.
- The page tree shows Markdown pages and their containing folders by default. Standalone `.base` configurations and folders containing only those configurations are omitted. Databases remain accessible through page embeds, the Reminders add-database action, selectors and the native file explorer; no database files are deleted or changed.
- The sidebar groups entries under **置顶** (Pinned), **项目** (Projects) and **页面** (Pages). Root folders and folder notes appear under Projects; standalone root pages appear under Pages. Children retain their existing hierarchy, without copying or modifying files.
- Sidebar pages, pins and page-search results open in the main content region, without replacing right-hand records even when a right-hand tab has focus. An existing main-region tab for the page is reused; otherwise the current unpinned main tab is used, preserving pinned tabs. Middle-click and Open in new tab add a main-group tab; desktop also offers an explicit Open in new right-hand tab action. Arrows expand children; folder-only entries expand on title clicks. Mobile normal clicks reuse the current or an existing page while preserving pinned tabs; an explicit new-tab action is also available.
- Desktop and mobile use a top-right magnifier to open one panel with Direct Search, Tags, Bookmarks and Files modes, without replacing the page sidebar. Search includes collapsed descendants without changing the tree expansion or ordering. Closing preserves the query; cancelling does not navigate away.
- Use the row pin action to pin or unpin a page or project; full actions remain in its context menu. Pinned entries share a dedicated section above Projects, shown when it has entries. Existing favorites need no setup. Reorder pins independently with desktop dragging, Alt + ↑ / ↓, or Move up / Move down in the context menu. Unpinning only removes the shortcut.
- The footer creates a root page, using a floating button on mobile; the row's plus button or menu creates a child page.
- Manual sorting is the default. Root projects and standalone pages reorder within their own groups; folders and notes inside a project still share one sibling order. On desktop, drag rows, use Alt + ↑ / ↓, or use the row menu to move items. Ordering, pins and expanded state survive reloads.
- Right-click the sidebar header or blank space to change sorting, show attachments or open the native file explorer. Switching back to manual sorting restores the saved order.

Sidebar navigation and links inside content have different roles: actual internal note links, reminder sources and database page icons still open on the right by default. Command-click on macOS or Ctrl-click on Windows/Linux opens them in the main content region. Table title text remains an inline editing target. See [workspace navigation](workspace-layout.md#page-icons-and-right-hand-tabs).

Use ↑ / ↓ for focus, → to expand, ← to collapse or focus the parent, Enter to open, and Shift + F10 for the row menu. Mobile retains normal touch scrolling; long-press a row for its context menu, with a visible pin action on the row. Successful navigation to an existing or newly created page closes the left drawer. Expanding a folder or a failed navigation leaves it open; desktop sidebars stay open. Consult the [iPhone test record](mobile-testing.md) for physical-device validation of these drawer and touch-layout changes.

### Unified search panel

- Direct Search matches local Markdown titles and body text, showing the corresponding pages and paths.
- Tags reads local tags from note content and properties to find related pages.
- Bookmarks reads Obsidian's saved bookmark configuration and retains groups without creating a separate bookmark collection or changing the configuration.
- Files expands folders and browses files inside the panel instead of opening another native sidebar.

The separate search includes notes hidden only from the sidebar while excluding system, trash and generated-view directories. Searching and filtering run locally. This is not a complete replacement for the native advanced search engine: complex saved queries in bookmarks are not guaranteed to support native query syntax. Only choosing a result opens its content; switching modes does not navigate the workspace.

### Typography and long titles

The sidebar takes cues from Codex's compact navigation: desktop page labels default to 14px with 1.4 leading, tighter spacing and brighter text, scaled with the user's body size. Pages and folders omit decorative icons; folders retain disclosure arrows and child titles use consistent indentation. The scrollbar is 6px wide, subdued normally and stronger on hover. Long titles fade at the right edge. On desktop, hovering over a title for about 300 milliseconds slowly scrolls only the overflowing text; leaving restores its position. Full-title hover tooltips are omitted while accessible names remain complete. Mobile, touch input and the system's reduced-motion preference disable this animation. The title text is never rewritten.

Native appearance replaces the Pages sidebar with a real native file explorer in the same location. Re-enabling enhanced appearance restores its search, scroll position, pins and expanded state.

### Desktop external archives

Desktop row menus provide **归档到外部…** (Archive externally). There is no separate Archive footer button. Open the manager from **外部归档…** in the header/blank-space context menu or the **Nebula Focus: 管理外部归档** (Manage external archives) command to browse and restore archived content. Archive entries are absent on mobile. Archiving copies and verifies files before moving sources to the vault's local trash; unlike Hidden page paths, it changes which files remain in the active vault. See [external archives](external-archives.md) for scope, storage and restoration.

### Storage and scope

Merging, pins, search and ordering never change existing note contents, filenames or folder structure. Preferences are stored under `pageSidebar` in plugin `data.json`, using the same serialized write queue as tag preferences. Pins keep their order in the existing `favorites` array rather than creating a second set of favorite data.

Settings → Nebula Focus → Page sidebar → 隐藏页面路径 (Hidden page paths) controls which entries appear. Enter one vault-relative path per line, such as `Guide.md` or `Archive`, then choose Save. A file path hides that file; a folder path hides its subtree. Hidden items are absent from the sidebar tree and pins. The separate desktop/mobile page finder can still find these notes without restoring their sidebar entries. Remove a line and save to show it in the sidebar again; existing favorite and ordering preferences are retained.

Paths match complete names, without wildcards: `Archive` does not hide `Archive notes` or the separate `Archive.md` note. List both paths when hiding a same-name note and folder. The generated `Nebula Views` directory and all standalone `.base` entries are automatically omitted from the sidebar. Hiding affects only the page sidebar; it never moves, deletes or modifies files. The native file explorer, page embeds and existing links retain access. Custom paths are stored in `pageSidebar.hiddenPaths` and follow file/folder renames.

Explicit page creation makes a regular `.md` file with the supplied name. Adding a first child creates a matching folder if needed while keeping the parent note in place. Duplicate names show an error and never overwrite a file.

Dragging only reorders siblings. Use the native file explorer for moving between folders, renaming or deleting. Sidebar actions are outside the database undo history.
