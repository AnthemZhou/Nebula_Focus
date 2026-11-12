# 工作区排版与右侧标签页 / Workspace appearance and right-hand tabs

本文描述 1.3.0 的工作区外观与导航规则。具体检查范围和历史验证记录见 [TESTING.md](TESTING.md)。
This guide describes workspace appearance and navigation in 1.3.0. See [TESTING.md](TESTING.md) for validation scope and historical checkpoints.

## 中文

### 精简导航

首页改为「提醒事项」：只读汇总库内 Markdown 的未完成任务与截止日期，按逾期、今天、明天、后续各个日期及未设日期排列；点击提醒进入来源笔记。可手动添加已有 `.base` 数据库的引用，直接显示同一来源，不复制记录或生成另一份数据库。嵌入数据库保留原生编辑能力，主动编辑仍保存到源数据。

默认在冷启动时打开提醒事项，并保留原有笔记标签；插件热重载不会抢走当前页面。可在「设置 → Nebula Focus → 提醒事项」关闭「启动时打开提醒事项」，让 Obsidian 恢复上次工作页面。侧栏和命令面板也提供提醒事项入口。原模块化 Home 不再作为首页入口，但旧 `home` 配置及生成的数据视图仍保留，不删除 Markdown、属性或 `.base` 文件。

桌面侧栏省略重复库名与「工作空间」抬头；顶部右侧保留放大镜搜索，侧栏选项通过顶部或空白处的右键菜单进入，切换库保留在原生左下角入口。手机顶部显示库名并持续保留搜索按钮，底部悬浮「新建页面」。搜索按钮打开独立面板，「直接搜索」「标签」「书签」「文件列表」四种模式都在该面板内切换，不切换到原生侧栏。搜索匹配本地 Markdown 标题与正文；标签读取本地笔记元数据，文件列表可逐层展开目录。书签只读应用保存的配置，不改写书签；复杂已保存搜索不保证兼容原生高级查询语法。

页面树默认只显示 Markdown 页面及其目录，省略独立 `.base` 条目与仅含数据库配置的空目录；这些文件仍可通过文件列表、选择器及已有嵌入访问。原有置顶、项目、页面、搜索及隐藏路径仍可用。桌面外部归档保留在页面行菜单中，侧栏底部不再单列归档按钮；浏览及恢复通过侧栏顶部／空白处右键菜单的「外部归档…」，或「管理外部归档」命令进入。

「设置 → Nebula Focus → 左侧工具按钮」可逐项选择显示的工具，支持全部显示与恢复精简。默认精简已知核心按钮，未知第三方按钮保留。桌面帮助、设置按钮移动到最左侧窄竖条底部；仍使用原生按钮及其功能。设置只影响增强模式中的显示，不更改核心插件的启用状态，也不改写其他插件设置。

### 阅读与颜色

配色参考用户提供的 Codex 截图；手机借鉴 ChatGPT 的简洁文字和留白。它们是本插件的参考实现，不是读取或复制两款应用的内部主题参数。

- 桌面深色主区 `#181818`，侧栏 `#202020`，正文 `#e6e6e6`；浅色使用白色主区和浅灰侧栏。
- 正文默认 16px、行高 1.6；表格按正文字号的 0.875 倍显示，默认 14px。桌面页面侧栏为 0.875 倍，默认 14px、常规字重、行高 1.4；项目／页面分组标题维持 13px，收紧行间空隙并提高文字亮度。字号随用户设置缩放。
- 手机主要文字至少16px，正文行高1.65。左侧抽屉宽度为 `min(78vw, 320px)`，窄屏和安全区域保留至少约64px的正文空间；横屏仍受最大宽度限制。
- 桌面最左竖条宽 40px，工具图标 18px、点击区域 32px；侧栏滚动条宽 6px，平时较淡，悬停时增强对比。手机保留触摸目标。标签颜色、逾期提示和当前主题强调色仍有独立语义。
- 霞鹜文楷仍为可选字体，不因配色调整而覆盖用户选择。

### 页面图标与右侧标签

侧栏页面、置顶项及页面搜索结果默认在最左侧的主内容标签组打开，即使当前焦点位于右侧标签组也不会替换右侧记录。主区依据实际窗口布局判断，不依赖可能丢失的插件分栏标识；只在主区查找同名页面。主内容区已打开同一页面时复用该标签；否则使用当前未固定的主标签，固定标签保留。中键或菜单「在新标签页打开」在主内容组另建标签。手机侧栏同样复用当前或已有页面，打开成功后收起侧栏。

内容内部的提醒来源、表格页面图标、阅读模式正文及属性中的真实内部链接，仍默认在右侧原生内容标签组打开；按住 Command（macOS）或 Ctrl（Windows/Linux）点击，在主内容组打开。Bases 和看板中的真实内部链接采用同一规则。目标区域已有同一页面时复用，避免重复堆积和反复增加分栏；手机使用普通标签页。表格标题文字和空白仍用于原位编辑。

桌面功能区的「在右侧打开新标签页」、页面右键菜单的「在右侧新标签页打开」，以及命令面板的对应命令都支持笔记和 `.base` 数据库。起始页提供文件选择和另开标签，已移除旧首页选项。实时预览的编辑文字、没有链接的属性控件、外部网址和当前页内的锚点跳转保持原生行为。

工作区采用侧栏、主内容区和按需打开的右侧标签区。已有第二个内容组时直接复用，新记录和新标签不会再分出第三个内容组，也不创建上下分屏。每个窗口独立判断位置。旧布局中额外的标签组不会被强制关闭或重建，以保留编辑状态；原生外观仍可使用 Obsidian 原有布局功能。

### 原生恢复与数据

按 ⌘⌥U（Windows/Linux：Ctrl+Alt+U）切换原生外观，恢复原生颜色、字号、间距、工具按钮及文件列表，帮助与设置移回原位置。现有笔记与数据库标签不关闭；自定义新标签页还原为原生空白页。停用插件同样移除这些显示覆盖。

界面样式不写入 Markdown。工具选择、工作标签组标识和显示偏好保存在插件 `data.json`，窗口布局由 Obsidian 保存。提醒事项的启动偏好与数据库路径引用存于 `reminders`；聚合读取不改任务或截止日期。用户主动编辑正文或属性时，才通过对应功能保存内容。

## English

### Simpler navigation

The landing page is now Reminders: a read-only aggregation of unfinished Markdown tasks and page deadlines, grouped into overdue, today, tomorrow, each later calendar date and undated items. Click a reminder to visit its source note. You can add references to existing `.base` databases without copying records or creating another database. Embedded databases retain native editing; explicit edits still save to their source data.

Cold startup opens Reminders by default while preserving existing note tabs; plugin hot reload does not take focus. Turn off **启动时打开提醒事项** under Settings → Nebula Focus → 提醒事项 to resume Obsidian's previous workspace instead. Reminders is also available in the sidebar and command palette. The earlier modular Home is no longer a landing-page entry; its `home` configuration and generated views remain stored. Markdown, properties and `.base` files are not deleted.

The desktop sidebar omits the repeated vault name and Workspace heading. A top-right magnifier opens search; right-click its header or blank space for sidebar options. Vault switching stays in the native lower-left control. Mobile keeps the vault name and search button at the top, with a floating New page action at the bottom. The search button opens one panel with four modes: Direct Search, Tags, Bookmarks and Files. Switching modes stays inside that panel rather than navigating to a native sidebar. Search matches local Markdown titles and body text; Tags reads local note metadata, and Files expands folders in place. Bookmarks reads the application's saved configuration without changing it. Complex saved searches are not guaranteed to support native advanced query syntax.

The page tree shows Markdown pages and their folders by default, omitting standalone `.base` entries and folders containing only database configurations. Those files remain accessible through file lists, selectors and existing embeds. Pins, projects, pages, searching and hidden paths remain available. Desktop external archiving stays in page row menus, without a separate footer button. Browse or restore archives through **外部归档…** in the header/blank-space context menu or the **管理外部归档** (Manage external archives) command.

Under Settings → Nebula Focus → 左侧工具按钮 (Left toolbar buttons), choose individual visible tools, show all, or restore the compact defaults. Known core tools are simplified by default; unknown third-party tools stay visible. Desktop Help and Settings move to the bottom of the narrow left rail, retaining their native controls and behavior. This changes presentation in enhanced mode only, not core-plugin enablement or other plugins' settings.

### Reading and colors

Desktop colors take cues from the supplied Codex screenshots, while mobile adopts a restrained ChatGPT-like reading layout. These are our own reference implementations, not extracted internal design values.

- Dark desktop uses `#181818` for the main surface, `#202020` for the sidebar and `#e6e6e6` for body text; light mode uses white and pale gray surfaces.
- Body text defaults to 16px with 1.6 leading; tables use 0.875 of that size, 14px by default. Desktop page labels use 0.875, or 14px by default, with regular weight and 1.4 leading; section captions remain 13px, tighter spacing and brighter text. Sizes scale with the user's setting.
- Primary mobile text is at least 16px, with 1.65 body leading. The left drawer uses `min(78vw, 320px)`, retaining approximately 64px or more for the content area on narrow/safe-area screens. Landscape remains capped.
- The desktop rail is 40px wide, with 18px icons in 32px hit targets. The sidebar scrollbar is 6px wide, subdued normally and stronger on hover. Mobile touch targets remain larger. Tags, overdue states and the user's accent color retain their meanings.
- Optional LXGW WenKai remains independent of these colors.

### Page icons and right-hand tabs

Sidebar page entries, pins and page-search results open in the leftmost main content tab group, even when a right-hand tab currently has focus. The actual window layout defines that region, independently of saved plugin markers; matching pages are searched only within the main group. An existing main-region tab for the page is reused; otherwise the current unpinned main tab is used, preserving pinned tabs. Middle-click or **在新标签页打开** (Open in new tab) creates a new tab within the main group. Mobile sidebar navigation likewise reuses the current or an existing page and closes the drawer after successful navigation.

Links inside content—reminder sources, table page icons and actual internal links in reading-mode notes, properties, Bases and board titles—continue to open in the managed right-hand content group by default. Command-click on macOS or Ctrl-click on Windows/Linux opens in the main content group. An existing tab for the same page in the destination region is reused, avoiding duplicate tabs and repeated splits; mobile uses ordinary tabs. Table title text and trailing blank space remain inline editing targets.

The right-tab ribbon button, page context menu and matching commands open Markdown notes or Bases. The start selector offers file selection and another tab, without the historical Home. Live Preview editing text, property controls without links, external URLs and same-page fragment navigation retain native behavior.

The workspace uses a sidebar, a main content group and an optional right-hand tab group. An existing second group is reused; opening records or more tabs does not add a third content group or create top/bottom splits. Each window resolves its own regions. Additional groups in older layouts are not forcibly closed or recreated, preserving editor state. Native appearance retains Obsidian’s original layout capabilities.

### Native appearance and storage

⌘⌥U (Ctrl+Alt+U on Windows/Linux) restores native colors, type sizes, spacing, toolbar visibility and the file explorer; Help and Settings return to their original position. Open notes and Bases remain; custom start pages become native empty pages. Disabling the plugin also removes these presentation overrides.

Styles are not written into Markdown. Tool visibility, work-group identifiers and display preferences live in plugin `data.json`; Obsidian saves the window layout. Reminder startup preferences and database path references live under `reminders`; aggregation does not change tasks or deadlines. Explicit edits to note text or properties continue to save through their normal features.
