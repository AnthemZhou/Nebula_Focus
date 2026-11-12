# 提醒事项首页与历史 Home / Reminders and historical Home

## 1.3.0：提醒事项 / Reminders in 1.3.0

首页改为「提醒事项」，只读汇总库内 Markdown 中由 Obsidian 识别的未完成任务与支持的截止日期属性，参考 Apple 提醒事项「计划」按日期分组：逾期、今天、明天、后续各个具体日期、未设日期。逾期日期放在标题下方；同一天的后续事项共用日期标题，同年省略年份，跨年保留年份。未设日期默认折叠。点击提醒进入来源笔记；任务会定位到原行。它不接入苹果提醒事项，也不复制任务或改变笔记的完成状态。

默认在冷启动时打开提醒事项，同时保留原有笔记标签；插件热重载不会抢走当前页面。关闭「设置 → Nebula Focus → 提醒事项 → 启动时打开提醒事项」，即可继续由 Obsidian 恢复上次页面。也可从侧栏的「提醒事项」或同名命令进入。

「添加数据库」引用已有 `.base`，直接嵌入同一来源，不复制数据库配置或记录。移除此引用只调整首页显示，不删除数据库。数据库保留原生操作；用户主动编辑属性仍会保存到源 Markdown。启动偏好与数据库路径列表存于插件 `data.json` 的 `reminders`，没有 UI 代码写入正文。

The landing page is now Reminders, a read-only aggregation of unfinished Markdown tasks recognized by Obsidian and supported page-deadline properties. Following the Scheduled list pattern in Apple Reminders, it groups items into overdue, today, tomorrow, each later calendar date, and undated. Overdue dates sit under their titles; upcoming items share a date heading. Years appear for dates outside the current year. Undated items start collapsed. Clicking an item opens its source note and locates the task line. It does not connect to Apple Reminders, duplicate tasks or change completion states.

Cold startup opens Reminders by default and preserves existing note tabs; plugin hot reload does not take focus. Turn off **启动时打开提醒事项** under Settings → Nebula Focus → 提醒事项 to let Obsidian resume the previous page. The sidebar and command palette also provide access.

Add database references an existing `.base` and embeds the same source without copying configurations or records. Removing a reference only changes this landing page. Native database operations remain available, so explicit property edits still save to source Markdown. Startup preferences and database paths live under `reminders` in plugin `data.json`; no UI code is written into note bodies.

## 历史功能：模块化 Home（1.2.0） / Historical modular Home (1.2.0)

> 以下为已发布 1.2.0 的旧模块化首页记录。1.3.0 不再提供该 Home 入口；现有 `home` 配置和生成的数据视图文件保留，与新的提醒事项配置分开保存。
> The following documents the modular Home from release 1.2.0. Version 1.3.0 no longer exposes that Home entry. Its existing `home` configuration and generated views remain stored separately from Reminders.

## 中文

1.2.0 提供独立首页。从页面侧栏点击「首页」，或运行「打开首页」命令进入。它不依赖 `Home.md`，也不会向笔记正文写入仪表盘代码。

### 使用

点击「编辑首页」修改首页名称、添加模块或调整顺序。空白首页也提供添加入口。

| 模块 | 设置与操作 |
| --- | --- |
| 数据视图 | 选择已有 `.base` 和其中一个视图，设置标题与显示高度。模块内继续使用原生表格、看板等视图；「查看全部」打开该模块的独立视图 |
| 数据摘要 | 选择来源视图、记录数 / 合计 / 平均值，以及需要统计、分组的属性 |
| 快捷入口 | 搜索并添加已有笔记。同名笔记使用完整路径区分，点击入口打开原笔记 |

模块可以折叠，也可以在编辑状态上移、下移或移除。桌面支持通过拖动手柄排列；手机可用上移、下移按钮。本轮尚未完成该首页功能的 iPhone 真机复测。

### 数据与配置

每个数据视图或摘要模块都会把选定视图的配置复制到 `Nebula Views/Home/<UUID>.base`。记录仍来自原来的 Markdown 文件，不复制记录。添加模块后，源 `.base` 后续调整的筛选、排序等不会自动同步到这个独立模块；可以用模块自己的原生工具栏调整它的筛选与排序。

摘要读取原生查询的完整筛选结果，不只计算屏幕上可见的行。合计与平均值使用所选数字属性；涉及不同币种时，必须自己选择「币种」作为分组属性，插件不会自动判断或换算币种。未取得查询结果、缺失数值或没有有效数字时，不以零替代；已经确认查询为空时，记录数可以显示为零。排除项可展开查看原因。

首页名称、模块顺序和模块设置保存在 `.obsidian/plugins/nebula-focus/data.json` 的 `home` 字段。移除模块只删除首页中的布局条目，保留对应 `.base` 和所有 Markdown。浏览与布局调整不改写笔记正文；在原生数据视图中主动编辑属性时，仍更新原 Markdown 的 YAML 属性。

## English

Version 1.2.0 provides a standalone Home. Use **首页** in the page sidebar or the **打开首页** (Open Home) command. It does not depend on `Home.md` or insert dashboard markup into note bodies.

### Usage

Choose **编辑首页** (Edit Home) to rename Home, add modules or rearrange them. An empty Home also provides an Add button.

| Module | Setup and actions |
| --- | --- |
| Data view | Select an existing `.base` and one of its views, then choose a title and height. The module keeps the native table, board or other view; View all opens its independent view |
| Summary | Select a source view, Count / Sum / Average, and the properties to measure or group by |
| Shortcuts | Search for existing notes and add them. Use full paths to distinguish duplicate names; each shortcut opens the original note |

Modules can collapse. Edit mode provides Move up, Move down and Remove. Desktop users can also drag a module by its handle; phones can use the move buttons. This Home feature has not yet received a separate physical-iPhone retest.

### Data and configuration

Each data-view or summary module copies the selected view configuration to `Nebula Views/Home/<UUID>.base`. Records continue to come from their original Markdown files; records are not duplicated. Later filter, sort or other configuration changes in the source `.base` do not automatically update an independent module. Use the module's own native toolbar to adjust its filters and sorting.

Summaries use the complete native filtered query, not just visible rows. Sum and Average use the selected numeric property. For amounts in different currencies, explicitly select the currency property for grouping; the plugin does not infer or convert currencies. An unavailable query, missing values or the absence of valid numbers does not become a zero. A confirmed empty query may report a count of zero. Expand exclusions to inspect their reasons.

Home's title, module order and settings are stored under `home` in `.obsidian/plugins/nebula-focus/data.json`. Removing a module removes only its Home layout entry; its `.base` and Markdown files remain. Browsing or rearranging Home does not rewrite note bodies. Explicit property edits in a native data view still update the original note's YAML properties.
