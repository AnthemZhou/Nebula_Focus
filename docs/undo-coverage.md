# 撤销范围与验证 / Undo coverage

## 中文

本页描述当前源码的数据库撤销，不代表 Obsidian 的所有操作都由插件提供撤销。未另行标注的实机结论指 2026 年 10 月 30 日的 macOS、Obsidian 1.14.5 检查。2026 年 11 月 3 日，手机 R6 经 iPhone 镜像通过表格与 Home 看板跨标签页新建、撤销、重做。11 月 4 日，用户直接触摸确认 R9 的标签字号一致，以及「新建→加标签→撤销两次→重做两次」正常；这些结果不等于整个手机版本通过验收。已发布安装包以对应 Release 说明为准。

### 支持范围

数据库中新建条目，以及通过原生属性事务提交的标题、标签值和普通看板状态修改，共用按操作顺序排列的历史。若先新建、再改状态，先撤销状态，再撤销新建；重做按相反顺序恢复。

撤销新建会把该会话创建的文件移入库内 `.trash`。重做恢复同一路径的文件，并让后续属性事务指向恢复后的文件。成功操作不弹提示；无法安全执行时保留文件和操作记录并说明原因。

### 桌面与手机入口

当前 R10 开发代码按平台决定是否创建可见撤销/重做控件：手机不创建按钮，也不保留额外工具栏行；桌面仍保留按钮、快捷键与命令。桌面模拟手机外观时，样式也隐藏对应工具栏及额外行。R10 已通过构建与 295 项测试；实际 iPhone 镜像确认独立表格与 Home 嵌入看板均无额外撤销行。此为该显示调整的有限检查，不代表整套手机触摸验收完成。

隐藏的是手机上的可见按钮，数据库内部历史及命令面板的数据库撤销/重做入口保留。文本编辑继续使用原生文本撤销，不受该显示调整影响。

### 新建入口验证

| 入口或场景 | 验证状态 | 范围 |
| --- | --- | --- |
| 表格工具栏「新建」 | 实机与自动化 | 新建后撤销 |
| 想法表格末行「新建条目」 | 实机与自动化 | 新建、撤销、重做及后续标题修改 |
| 看板列底「新建」 | 实机与自动化 | 新建、撤销、重做 |
| 看板分组标题加号 | 实机与自动化 | 新建后撤销 |
| 看板工具栏「新建」 | 实机与自动化 | 新建后撤销 |
| 卡片视图新建 | 自动化，尚未实机验证 | 原生新建弹窗关闭后的撤销与重做 |
| 按文件夹分组的看板新建 | 自动化，尚未实机验证 | 原生文件创建入口、连续新建、撤销与重做 |
| 普通看板状态修改后撤销新建 | 自动化与实机原生接口验证；拖拽手势未验证 | 先恢复属性，再撤销创建；重做后属性事务使用恢复的文件 |

### 焦点、顺序与生命周期

| 场景 | 验证状态 | 预期行为 |
| --- | --- | --- |
| 阅读模式关闭新建弹窗后按撤销 | 实机与自动化 | 焦点回到所属笔记时仍可撤销数据库新建 |
| 编辑模式中的嵌入数据库，新建后按 Escape 再撤销 | 实机与自动化 | 数据库控件能撤销；正文编辑器保留文本撤销 |
| 表格标题保存后，焦点落到页面根节点 | 实机与自动化 | 在同一活动分栏恢复数据库撤销目标 |
| 滚出视口，数据库 DOM 暂时断开，再撤销 | 实机与自动化 | 同一源笔记仍打开时保留历史；滚回显示恢复后的数据 |
| 滚动导致同一外部 `.base` 嵌入被重建 | 自动化 | 同一笔记、分栏、数据库和视图重新挂载时恢复历史 |
| 连续新建、快速撤销和重做 | 自动化 | 按顺序处理，不跳过记录 |
| 新建或首次快照尚未完成就按撤销 | 自动化 | 等待新建捕获后再撤销 |
| 命令面板的数据库撤销与重做 | 自动化 | 查验命令是否可用不会执行操作；执行时使用所属会话 |
| 切换优化与原生外观 | 自动化 | 外观切换不清空数据库历史 |
| 桌面其他分栏、内联 Base 或不同外部数据库/视图 | 自动化 | 不接收其他会话的撤销历史 |
| 手机同一外部 `.base` 的同名、同类型视图 | 自动化；R6 镜像通过跨页新建撤销，R9 用户直接触摸通过新建加标签的双撤销/双重做 | 侧栏重新打开后使用所属数据库历史；关闭源页的完整真机生命周期流程仍待验收 |
| 手机占位视图就绪、原生事务异步完成时源页关闭 | 自动化 | 加入正确共享会话；串行记录创建和属性操作，不丢失或复活重做分支 |
| 文本输入、中文输入法组合、改名输入 | 自动化 | 保留文字编辑的撤销，不把输入撤销当成删除新建文件 |

### 安全边界

以下保护已纳入自动化回归：

- 有未撤销正文改动、未保存草稿、文件移动或文件对象被替换时，不删除文件。
- 重做路径已有文件时，不覆盖现有文件。
- 属性已由其他操作改动时，不覆盖当前值；部分属性恢复失败时可重试已完成的步骤。
- 只读视图和已卸载的插件不继续创建或修改文件。
- 桌面与内联 Base 在源页面结束后清空历史；手机共享会话保留到最后一个所属页面关闭或离开该来源。停用插件或重启会结束所有会话，不恢复旧历史。
- 插件启用前创建的旧文件不会被追溯当作本次新建记录。

### 不属于本次数据库撤销

候选标签的增加、隐藏和排序，列名、列宽、筛选、排序等视图配置，普通文件删除，以及按文件夹分组时的跨文件夹移动，均不属于本次数据库撤销历史。正文编辑继续使用 Obsidian 自己的文本撤销。

自动化测试模拟了具体交互与生命周期，不等同于所有主题、平台和未来 Obsidian 版本的界面验证。完整构建与测试记录见 [TESTING.md](TESTING.md)。

## English

This page describes database undo in the current source. It does not claim that the plugin adds undo to every Obsidian operation. Unless noted otherwise, live results refer to macOS and Obsidian 1.14.5 checks on October 30, 2026. On November 3, R6 passed cross-tab creation, undo and redo for the table and Home board through iPhone Mirroring. On November 4, the user directly confirmed matching tag font sizes in R9 and the creation → tag edit → two undos → two redos sequence. These results do not establish full mobile acceptance. Published packages follow their Release notes.

### Supported operations

Database creation and title, tag-value or ordinary board-state edits submitted through native property transactions share chronological history. After creating a note and changing its status, undo restores the status first, then undoes creation. Redo restores creation before its subsequent edits.

Undo creation moves the session's new file to the vault's `.trash`. Redo restores its original path and reconnects subsequent property transactions to the restored file. Successful actions are silent. If an action cannot proceed safely, the file and history entry are retained with an explanation.

### Desktop and phone controls

The current R10 development code creates visible undo/redo controls by platform: phones do not create these buttons or retain their extra toolbar row. Desktop buttons, shortcuts and commands remain available. Desktop mobile emulation also hides the toolbar and its extra row through styling. R10 passes the build and 295 tests. Actual iPhone Mirroring confirmed no extra undo row in the standalone table or Home embedded board. This is a scoped visual check of that change, not full mobile touch acceptance.

Only the visible phone buttons are hidden. Internal database history and the command-palette undo/redo fallback remain available. Native text undo is unchanged.

### Creation entry points

| Entry point or scenario | Verification | Scope |
| --- | --- | --- |
| Table toolbar New | Live and automated | Creation followed by undo |
| Idea-table New item footer | Live and automated | Creation, undo, redo and a subsequent title edit |
| Board column New | Live and automated | Creation, undo and redo |
| Board group-header plus | Live and automated | Creation followed by undo |
| Board toolbar New | Live and automated | Creation followed by undo |
| Cards-view creation | Automated; not yet checked live | Undo and redo after closing the native creation popover |
| Folder-grouped board creation | Automated; not yet checked live | Native file-creation path, repeated creation, undo and redo |
| Board-state change followed by creation undo | Automated and live native-API checks; drag gesture not checked | Restore properties before undoing creation; redo reconnects property transactions |

### Focus, ordering and session lifetime

Live checks cover undo after closing the creation popover in reading mode, embedded creation followed by Escape and undo in editing mode, post-save focus falling back to the page root, and undo while the database DOM is temporarily disconnected by scrolling.

Automated checks also cover remounting the same external `.base`, rapid repeated undo and redo, undo queued during creation, explicit commands, appearance toggling and preserving text/IME undo. Phone tests cover shared external-Base history across standalone tabs and Home embeds, loading placeholders becoming real owners, source tabs closing during asynchronous operations, restored-file identity and redo invalidation.

Desktop and inline Base history belongs to the source note and pane. On phones, the same real external `.base` view, matched by name and type, shares chronological history across standalone tabs and Home embeds. Different files or views remain isolated. Temporary DOM unmounting does not end a session. Phone shared history survives one source closing while another owning page remains; closing or navigating away from the last owner ends it. Disabling the plugin or restarting clears all sessions. R6 Mirroring verified creation/undo/redo after sidebar reopening for both the table and Home. R9 direct-touch feedback confirmed creation followed by a tag edit, two undos and two redos. Closing-source lifecycle workflows still need direct device checks.

### Safety and exclusions

Automated protections preserve notes with subsequent body edits, unsaved drafts, moved paths or replaced file objects. Redo never overwrites an occupied path. Conflicting property edits are retained, failed property restoration can be retried, and read-only or unloaded views cannot continue mutations. Files created before the plugin was active are not retroactively treated as new entries.

Candidate additions, hiding and ordering; column configuration; ordinary file deletion; and cross-folder moves in folder-grouped boards are outside this database history. Body editing continues to use Obsidian's own text undo.

Automated coverage is not equivalent to live validation on every theme, platform or future Obsidian version. See [TESTING.md](TESTING.md) for build and test results.
