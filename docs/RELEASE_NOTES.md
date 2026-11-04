# Nebula Focus 1.1.3 — Unified page sidebar settings

[中文](#中文) · [English](#english)

## 中文

1.1.3 将已有的页面侧栏纳入 Nebula Focus 的统一设置。在「设置 → Nebula Focus → 页面侧栏」即可打开页面树，选择排序方式和附件显示，并设置是否启动时自动打开。最低要求 Obsidian **1.14.5**；表格与看板功能需要启用「数据库 / Bases」核心插件。

- **统一入口。** 同名文件夹与笔记合并显示、搜索、收藏、同级拖动排序和新建子页面，继续作为 Nebula Focus 的内置功能使用。
- **按需自动打开。** 新增启动时打开选项，默认关闭。已有收藏、顺序和展开状态继续保留。
- **避免重复侧栏。** 自动打开等待原有视图恢复完成；连续重载后只保留一个侧栏标签。停用插件会取消尚未执行的打开操作。
- **偏好安全保存。** 侧栏与标签偏好共用写入队列，保存失败时保留原状态，不改写已有笔记内容或文件路径。

严格构建与 **310/310 自动测试通过**。本地 ESLint 为 **38 项既有警告、0 项错误**，本次未增加警告。桌面实测设置页、附件显示、打开侧栏和连续重载通过；原有 310 个库内文件逐字节未变。本版设置入口尚未新增 iPhone 真机验证，具体范围见 [TESTING.md](https://github.com/AnthemZhou/Nebula_Focus/blob/1.1.3/docs/TESTING.md)。

安装可使用社区插件更新功能（目录同步后），或将附件中的 `main.js`、`manifest.json`、`styles.css` 更新到 `.obsidian/plugins/nebula-focus/`。保留原来的 `data.json`，然后重载插件。也提供包含这三个文件的安装 ZIP、公开源码 ZIP 和示例库 ZIP。

GitHub Release 发布与社区目录扫描、客户端更新同步是独立阶段；本说明不代表目录审核已经完成。

## English

Version 1.1.3 brings the existing page sidebar into Nebula Focus's settings. Open Settings → Nebula Focus → Page sidebar to open the tree, choose ordering and attachment visibility, and opt into automatic opening. It requires Obsidian **1.14.5**; table and board features also require the **Bases** core plugin.

- **One settings entry.** Merged folder notes, search, favorites, sibling drag reordering and child-page creation remain built into Nebula Focus.
- **Optional automatic opening.** The new startup option is off by default. Existing favorites, ordering and expanded state are preserved.
- **No duplicate sidebar on reload.** Automatic opening waits for existing views to finish restoring. Repeated reloads retain one sidebar tab, and unloading cancels pending automatic opening.
- **Serialized preference writes.** Sidebar and tag preferences share a write queue. Failed saves retain the previous state; preference changes never alter existing note contents or file paths.

The strict build and **310/310 automated tests pass**. Local ESLint retains **38 existing warnings and zero errors**, with no new findings. Desktop checks cover settings, attachment visibility, opening and repeated reloads; all 310 existing vault files remain byte-identical. The new settings entry has no additional actual-iPhone validation. See [TESTING.md](https://github.com/AnthemZhou/Nebula_Focus/blob/1.1.3/docs/TESTING.md) for scope.

Update through community plugins once the directory synchronizes, or replace `main.js`, `manifest.json` and `styles.css` in `.obsidian/plugins/nebula-focus/`. Keep your existing `data.json`, then reload the plugin. Installation, public-source and example-vault ZIPs are also included.

Publishing a GitHub Release is separate from directory review and in-app synchronization. These notes do not claim that directory review has completed.
