# Nebula Focus 1.4.0 — Focused navigation and full-screen mobile search

[中文](#中文) · [English](#english)

## 中文

1.4.0 完善 Codex-like 工作区的导航与编辑：主页面更专注，iPhone 搜索变为全屏页面，新建与删除记录更直接。最低要求 Obsidian **1.14.5**；数据库视图需要启用 **Bases** 核心插件。

### 本次更新

- **直接新建页面。** 点击侧栏「新建页面」立即创建空白 Markdown 并在主区打开，不再先弹出命名窗口；在页面原生标题处命名即可。自动避开同名文件，重复点击不会同时创建多页；手机打开后收起侧栏。
- **iPhone 全屏搜索。** 顶部切换直接搜索、标签、书签和文件列表，底部输入区随键盘调整。结果一次轻点即可打开；切换分类保持键盘原有状态，收起键盘不会再次搜索，返回已查看分类复用结果与滚动位置。查询或源数据变化时更新缓存。桌面搜索保留宽面板与底部分类。
- **表格编辑与整行删除。** 修复连续按 Delete / Backspace 时输入光标消失、长标题被裁切的问题。首列的「⋯ → 将页面移到回收站」可移除整条记录及对应笔记，并通过数据库会话历史撤销／重做；保护未保存草稿、文件身份和恢复路径冲突。桌面行操作悬停覆盖在文字右侧，不再永久挤占标题空间。
- **专注的主区与侧栏。** 桌面主区只显示当前页面标题，按需保留右侧标签区；底层原生标签和未保存状态仍保留。修复置顶页打开位置、重复选中背景和标签切换的黄色高光。库切换移到顶部搜索左侧，导航文字、分界线、圆角和悬停说明统一整理。
- **可改名提醒事项与简化设置。** 提醒事项可在页面、侧栏菜单或设置里改名；常用字体、提醒名称与启动选项直接显示，其余选项收进「更多设置」。调整提醒分组、日期与折叠箭头间距。
- **手机侧栏与明暗外观。** 新建页面移至底部右侧，设置放在其左侧；打开应用时侧栏保持收起。展开侧栏时，露出的主区使用圆角与渐变遮罩。统一手机文字基线、背景和标签周边的呈现；原生外观切换继续恢复原生控件与排版。

### 数据与升级

外观调整不向 Markdown 正文插入 UI 代码；用户主动新建、编辑、改名或删除时才变更相应笔记。列与查询配置留在 `.base`，偏好留在 `data.json`。本次删除动作固定移入库内 `.trash`，不会永久删除；数据库历史属于当前会话，不跨重启保存，也不接管其他删除入口。手机仍隐藏额外撤销／重做按钮行。

更新时保留 `data.json`，替换 `.obsidian/plugins/nebula-focus/` 下的 `main.js`、`manifest.json`、`styles.css`，再重载插件。iPhone 等待同步完成后重新打开 Obsidian；旧代码仍缓存时彻底关闭并重开应用。可选霞鹜文楷仍随 `main.js` 离线分发。

附件包括三个标准运行文件、安装 ZIP、公开源码 ZIP、虚构示例 ZIP 和 ZIP 校验文件。GitHub Release 与社区目录审核、客户端更新同步是不同阶段。

### 验证

- 完整自动测试 **775/775** 通过，严格 TypeScript 构建通过；Lint **0 错误、40 项警告**。有意保留的兼容性与 API 建议见[检查说明](https://github.com/AnthemZhou/Nebula_Focus/blob/1.4.0/docs/review-warnings.md)。
- Mac 实测连续删字、表格删除及撤销／重做、主区导航、原生外观恢复与明暗主题。
- iPhone 搜索的单击打开、键盘状态与分类缓存获得直接触摸确认；直接新建、原生标题改名与侧栏收起通过真机镜像检查。没有将镜像结果当作新增中文软键盘验收；手机整行删除本轮未单独真机补测。
- 回归检查后，两端原有 **241 篇 Markdown** 内容未变；临时测试笔记已移到回收站，未新建测试库。

详见[测试记录](https://github.com/AnthemZhou/Nebula_Focus/blob/1.4.0/docs/TESTING.md)、[iPhone 测试](https://github.com/AnthemZhou/Nebula_Focus/blob/1.4.0/docs/mobile-testing.md)、[撤销范围](https://github.com/AnthemZhou/Nebula_Focus/blob/1.4.0/docs/undo-coverage.md)。

## English

Version 1.4.0 refines navigation and editing in the Codex-like workspace: a focused main page, full-screen iPhone search, and more direct page creation and removal. It requires Obsidian **1.14.5**, with the **Bases** core plugin enabled for database views.

### Changes

- **Create pages directly.** New page immediately creates an empty Markdown file and opens it in the main region without a naming dialog. Name it through the native page title. Filename collisions and concurrent clicks are guarded; mobile closes the drawer after opening.
- **Full-screen iPhone search.** Categories sit above results; the bottom input follows the keyboard. One tap opens a result. Category changes preserve the keyboard's open/closed state; dismissing the keyboard does not restart searching. Revisiting a category reuses its results and scroll position, with invalidation when the query or source data changes. Desktop retains a wide search panel with categories below.
- **Table editing and row removal.** Fix lost focus during consecutive Delete / Backspace input and clipped long titles. The first-column menu can move the record's note to vault trash, with database-session undo/redo and checks for unsaved drafts, stale file identities and restore collisions. Desktop row actions overlay the title edge on hover instead of reserving permanent space.
- **Focused main region and sidebar.** The desktop main group displays the current page title, while optional companion tabs remain on the right. Native leaves and unsaved state are preserved underneath. Fix pinned-page routing, duplicate selection backgrounds and yellow navigation flashes. Move vault switching beside top search and refine navigation type, dividers, corners and hover information.
- **Rename Reminders and simplify settings.** Change its name from the page, sidebar menu or settings. Font, reminder name and startup settings are immediately visible; advanced options live under More settings. Reminder groups, date metadata and disclosure spacing are more consistent.
- **Mobile drawer and theme refinements.** New page sits at bottom right, with Settings on its left; startup keeps the drawer closed. Exposed main content has rounded corners and a native fading backdrop. Mobile typography and light/dark surfaces are coordinated; native appearance continues to restore host controls and styling.

### Data and updating

Presentation changes do not insert UI code into Markdown bodies. Explicit creation, editing, renaming and removal change the relevant notes. Queries and columns stay in `.base`; preferences stay in `data.json`. This row-removal action always uses vault `.trash`, not permanent deletion. Database history is session-local, does not survive restart, and does not capture other deletion entry points. Mobile still hides the extra undo/redo row.

Keep `data.json`, replace `main.js`, `manifest.json` and `styles.css` in `.obsidian/plugins/nebula-focus/`, then reload. On iPhone, wait for sync and reopen Obsidian; fully quit and restart if old code remains cached. Optional LXGW WenKai remains embedded in `main.js` for offline use.

Assets include the three standard runtime files, installation/source/fictional-example ZIPs and ZIP checksums. GitHub publication, community-directory review and client update synchronization are separate stages.

### Validation

- **775/775** automated checks and the strict TypeScript build pass. Lint reports **zero errors and 40 warnings**; retained compatibility and API recommendations are explained in [review notes](https://github.com/AnthemZhou/Nebula_Focus/blob/1.4.0/docs/review-warnings.md).
- Mac checks cover consecutive text deletion, record removal and undo/redo, main-region navigation, native restoration and both themes.
- Direct iPhone touch confirms single-tap search navigation, keyboard state and category caching. Physical Mirroring verifies direct creation, native-title rename and drawer dismissal. That is not a new Chinese software-keyboard acceptance claim; mobile row deletion was not separately retested on-device this round.
- The **241 existing Markdown notes** across both vaults remain unchanged after regression checks. Temporary notes were moved to trash, and the existing phone test vault was reused.

See [testing](https://github.com/AnthemZhou/Nebula_Focus/blob/1.4.0/docs/TESTING.md), [iPhone evidence](https://github.com/AnthemZhou/Nebula_Focus/blob/1.4.0/docs/mobile-testing.md) and [undo coverage](https://github.com/AnthemZhou/Nebula_Focus/blob/1.4.0/docs/undo-coverage.md).
