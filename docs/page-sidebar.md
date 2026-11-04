# 页面侧栏 / Page sidebar

## 中文

页面侧栏是 Nebula Focus 的内置功能。1.1.3 在「设置 → Nebula Focus → 页面侧栏」提供打开入口、启动时打开、排序方式和附件显示；启动时打开默认关闭。也可在命令面板运行「Nebula Focus: 打开页面侧栏」，或点击左侧功能区的侧栏图标。侧栏作为独立的「页面」标签显示，原生文件列表仍可使用。

### 浏览与整理

- `Home.md` 与 `Home/` 显示为一个 Home 入口。也识别文件夹内的同名笔记，例如 `Home/Home.md`。如果两种笔记同时存在，保留另一篇笔记的入口。
- 点击名称打开笔记，点击箭头展开子页面；没有正文的文件夹点击名称时展开。⌘ / Ctrl + 单击在新标签页打开。
- 搜索会找到收起的子页面，并显示其父级。搜索结果期间暂停拖动，避免在不完整的列表中调整顺序。
- 从行菜单添加收藏或取消收藏。底部「新建页面」创建根页面，行内 ＋ 或菜单中的「新建子页面」在该页面下创建笔记。
- 默认支持同级混合排序，文件夹不再固定排在笔记前面。桌面可直接拖动，也可使用 Alt + ↑ / ↓ 或行菜单的「上移 / 下移」。顺序、收藏、展开状态会在重载后保留。
- 右上角「⋯」可切换名称排序、显示附件、打开原生文件列表。切回手动排序会恢复之前保存的顺序。

键盘 ↑ / ↓ 移动焦点，→ 展开，← 收起或返回父级，Enter 打开，Shift + F10 打开行菜单。触屏保留普通滚动，排序通过行菜单完成；触屏侧栏尚未实机验证。

### 保存与范围

合并显示、收藏、搜索和排序不修改笔记正文、文件名或目录结构。侧栏设置使用 `data.json` 中的 `pageSidebar`，与标签设置共用写入队列。

新建页面是明确的文件创建操作：以用户输入的名称创建普通 `.md` 文件。在尚无同名文件夹的笔记下新建子页时，先创建该文件夹，原笔记保持原位置。重名时提示改用其他名称，不覆盖已有文件。

拖动只调整同级显示顺序，不改变父子关系。需要跨文件夹移动、重命名或删除时，使用原生文件列表。侧栏操作不属于数据库撤销历史。

## English

The page sidebar is built into Nebula Focus. Version 1.1.3 adds Settings → Nebula Focus → Page sidebar, with opening, opt-in automatic opening, sort mode and attachment controls. You can also run `Nebula Focus: 打开页面侧栏` (Open page sidebar) from the command palette, or use the sidebar ribbon icon. The Pages tab is independent of the native file explorer.

### Browsing and organization

- `Home.md` and `Home/` share one Home entry. Internal folder notes such as `Home/Home.md` are also recognized. If both notes exist, the second note remains accessible.
- Click a title to open its note, or its arrow to expand children. Folder-only entries expand on title clicks. Cmd / Ctrl + click opens a new tab.
- Search finds collapsed descendants and retains their ancestors. Reordering is disabled in search results.
- The row menu adds or removes favorites. The footer creates a root page; the row's plus button or menu creates a child page.
- Folders and notes share one sibling order. On desktop, drag rows, use Alt + ↑ / ↓, or use the row menu to move items. Ordering, favorites and expanded state survive reloads.
- The top-right menu switches to name sorting, shows attachments or opens the native file explorer. Switching back to manual sorting restores the saved order.

Use ↑ / ↓ for focus, → to expand, ← to collapse or focus the parent, Enter to open, and Shift + F10 for the row menu. Touch retains normal scrolling and uses menu actions for ordering; this sidebar has not been validated on a physical touch device.

### Storage and scope

Merging, favorites, search and ordering never change existing note contents, filenames or folder structure. Preferences are stored under `pageSidebar` in plugin `data.json`, using the same serialized write queue as tag preferences.

Explicit page creation makes a regular `.md` file with the supplied name. Adding a first child creates a matching folder if needed while keeping the parent note in place. Duplicate names show an error and never overwrite a file.

Dragging only reorders siblings. Use the native file explorer for moving between folders, renaming or deleting. Sidebar actions are outside the database undo history.
