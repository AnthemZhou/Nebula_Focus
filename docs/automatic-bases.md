# 自动数据视图 / Automatic data views

1.2.0 在打开 Markdown 时准备外部 `.base` 配置，不向正文插入代码块、嵌入语法或 UI 信息。页面菜单中的「打开数据视图」或命令「打开当前笔记的数据视图」可进入该表格。

## 复用与创建

1. 页面已嵌入 `.base`：复用链接的文件。同步尚未取得该文件时等待，不另建重复表。
2. 已有原生 `base` 代码块：继续使用内嵌视图，不重复生成。没有嵌入视图但存在同目录同名 `.base` 时，复用现有文件。
3. 都没有：在 `Nebula Views/<原笔记路径>.base` 创建配置。存在同名目录时，查询其中的直接 Markdown 子文件（空目录也保留为集合）；否则只查询当前笔记。不会查询全库、递归子目录或从普通正文猜测记录。

配置创建一次后保留用户修改的视图、筛选、排序和列宽。首次自动列出最多 32 个真实用户属性；其他属性仍可从原生属性菜单添加。没有标题属性的笔记使用原生文件名列。只有明确的 `title`、`标题`、`名称` 字符串字段会作为记录标题显示；点击标题或图标打开记录，在页面顶部原生标题中改名；标准 `tags` 数组可呈现为多选标签。普通文本、列表、关系和财务规则不自动猜测。

旧「想法收集箱」的标题公式及标签映射被固化为 `nebulaTable`，之后更改视图名称仍保留交互。其他已有表格仅在标题映射可明确识别时补齐配置；已有显式配置不会被替换。修改现有配置前先保存原文件备份，遇到并发编辑则保留用户的较新内容。

## 数据边界

- 记录正文、YAML 属性和 `[[关联链接]]` 仍在 Markdown，AI 可直接读写。
- 布局、字段映射和查询在外部 `.base`；生成的文件含 `nebulaSource` 来源标识。
- 浏览和生成配置不会改写 Markdown。标签等属性编辑仍通过原生 Bases 更新源属性。记录标题点击后打开页面；顶部原生标题改名由 Obsidian 重命名文件，已登记的明确标题映射可同步已有属性，见下文。
- 关闭优化外观时暂停自动生成。需要自定义类别、附件或计算规则时，在视图配置中明确声明，插件不从正文臆测。
- 不自动移动或删除已经生成的配置；源文件跨目录移动后需检查视图查询范围。此功能尚未单独完成 iPhone 真机复测。

从带明确标题映射的表格打开记录后，主动修改页面顶部原生标题，会在文件改名成功后同步该记录已有的非空字符串标题属性。同步前核对原值；缺失或空字段、别名、只读来源、多种标题映射冲突或并发修改均不覆盖。不会添加新字段，也不会扫描正文标题、同步外部批量改名或文件夹移动。

## English

Version 1.2.0 prepares an external `.base` when a Markdown note opens. It never inserts UI markup, code blocks or embeds into the note body. Use the note menu's **打开数据视图** (Open data view) or the **打开当前笔记的数据视图** command to open it.

An embedded Base is reused first; an existing native `base` code block stays inline without creating a duplicate. A same-folder, same-stem Base is next. An unresolved explicit embed waits for synchronization instead of creating a duplicate. Otherwise, a configuration is created under `Nebula Views/<original note path>.base`. An existing same-stem folder becomes a collection of its direct Markdown children, including an empty folder; other notes query only themselves. The plugin does not scan prose for implied records or widen a query to the whole vault.

Generated configurations preserve subsequent changes to views, filters, sorting and column widths. Up to 32 observed user properties are initially visible. Explicit string fields named `title`, `标题` or `名称` can provide linked record titles; standard `tags` arrays can provide multiselect tags. Click a title or its icon to open the record; rename it in the native page-top title. Without a title property, the native file-name column remains. Other text, lists, relations and financial rules are not guessed.

The legacy idea inbox's mapping is materialized as `nebulaTable`, so renaming its view no longer removes enhancements. Existing explicit profiles always win. Updates to existing configurations are backed up and use compare-and-swap, preserving concurrent edits.

Markdown remains the data source for AI. Views and mappings are external, and merely opening a note never changes its content. Explicit property edits still use native Bases transactions. Generation pauses in native-appearance mode. Generated files are not automatically moved or deleted; review query scopes after moving a source note. These changes have not yet received separate physical-iPhone validation.

After opening a record from a table with an explicit title mapping, deliberately editing its native page-top title synchronizes the existing nonempty string title property only after the file rename succeeds. The original value is checked before writing. Missing or empty fields, aliases, read-only sources, conflicting mappings and concurrent edits are left untouched. No field is added, prose heading scanned, or external bulk rename or folder move synchronized.
