# Nebula Focus 1.1.1 — Notion-like Bases on desktop and iPhone

[中文](#中文) · [English](#english)

## 中文

1.1.1 根据官方目录检查移除简介中重复的产品名称，仅调整发布元数据；运行代码和样式与 1.1.0 相同。下文为 1.1 系列的功能与验证范围。

1.1.0 将 Notion-like 的原生 Bases 表格、看板和原位编辑带到 iPhone，并加入页面侧栏。最低要求 Obsidian **1.14.5**，启用「数据库 / Bases」核心插件。

- **手机编辑与撤销。** 同一外部 Base 的视图在独立标签页与 Home 嵌入页之间共享历史，从文件列表重新打开后可继续撤销新建和属性编辑。手机隐藏额外撤销/重做按钮行，保留内部历史与命令入口；桌面按钮、快捷键和原生文本撤销不变。
- **稳定、紧凑的标签与表格。** 单元格与选项面板采用一致字号，标签选择通过带勾选项增删。修正首次测量与返回页面时的换行差异；整行长按可拖动标签，快速滑动保留滚动。新建条目按钮紧跟网格末行。
- **清楚的页面入口。** 点击标题或右侧空白原位编辑，只通过前面的页面图标进入笔记；列名称使用锚定设置面板修改，排序保留在工具栏。修正手机表格单行标题在触摸区域内偏上的问题，多行内容保持自然展开。
- **贴合主题的卡片。** 正文第一张有效图片用作封面，逾期日期保留红色提示。「项目下一步」「项目摘要」属性名使用主题紫色，新建按钮与卡片圆角一致，保留背景底色和紫色轮廓。
- **页面侧栏。** 合并显示同名文件夹与笔记，支持搜索、收藏、同级拖动排序和新建子页面；仅改变显示与插件设置，不移动或重命名已有文件。

外观优化不会改写 Markdown 正文或添加格式标记。明确的数据编辑使用原生 YAML 属性事务，视图配置保存在 `.base`，候选项与侧栏偏好保存在插件设置。AI 仍可直接读取 Markdown、YAML 和附件链接。

构建与 **295 项自动测试通过**。桌面实际检查了浅色、深色主题；iPhone 核心流程有用户直接触摸验证，包括中文输入、标签操作、横滑与旋转、卡片移动、图片预览，以及新建→加标签→撤销两次→重做两次。用户确认单元格与面板标签字号一致。手机独立表格与 Home 看板的额外撤销行已通过真机镜像确认隐藏。

这些是已验证的具体流程；Android、iPad、第三方主题及全部手机生命周期边界尚未逐项实测。部分增强依赖原生 Bases 内部结构，无法识别的结构保留原生控件。彩色标签按语义字段识别，不声称还原 Notion 的全部数据库类型与规则。

从 [GitHub Releases](https://github.com/AnthemZhou/Nebula_Focus/releases) 下载运行包，在库的 `.obsidian/plugins/nebula-focus/` 放置 `main.js`、`manifest.json` 和 `styles.css`。官方插件目录尚未批准收录；批准后才能在社区插件市场直接搜索安装。后续手机验证复用一个独立 iCloud 测试库，原处更新插件文件并保留测试内容。

## English

Version 1.1.1 removes the redundant host-product name from the description to satisfy the directory check. Runtime code and styles are unchanged from 1.1.0; the 1.1 feature and verification notes follow.

Version 1.1.0 brings Notion-like native Bases tables, boards and inline editing to iPhone and adds a page sidebar. It requires Obsidian **1.14.5** with the **Bases** core plugin enabled.

- **Phone editing and undo.** Views of the same external Base share chronological history across standalone tabs and Home embeds, so reopening from the file list preserves creation and property undo. Phones hide the extra Undo/Redo button row but retain internal history and commands. Desktop buttons, shortcuts and native text undo remain unchanged.
- **Stable, compact tags and tables.** Cells and option panels use matching font sizes; checked options toggle selection. First-layout and return-navigation measurements use consistent wrapping. Hold a whole option row to reorder; quick swipes remain scrolling. The New item action follows the grid's final record.
- **Clear page navigation.** Click a title or trailing blank space to edit in place; use its leading page icon to open the note. Rename columns in an anchored settings panel and sort from the toolbar. Single-line phone table titles are vertically centered within the touch target, while multiline content keeps its natural height.
- **Theme-aware cards.** Covers use the first valid body image, overdue dates remain red, and project-next-step and project-summary labels use the theme accent. New buttons match card corners with the surrounding background and a purple outline.
- **Page sidebar.** Matching folders and notes appear as one entry, with search, favorites, sibling reordering and child-page creation. Existing files are not moved or renamed by the merged presentation.

Presentation changes do not rewrite Markdown bodies or append formatting markers. Explicit data edits use native YAML property transactions; views live in `.base` files, and candidate/sidebar preferences live in plugin settings. Markdown, YAML and attachment links remain directly readable by AI tools.

The build and **295 automated tests pass**. Actual desktop checks covered light and dark themes. Core iPhone workflows have direct-touch evidence: Chinese input, tag operations, horizontal scrolling and rotation, card moves, image previews, and creation → tag edit → two undos → two redos. The user confirmed matching tag font sizes between cells and the popup. Actual iPhone Mirroring confirmed that the standalone table and Home board no longer show the extra undo row.

These are results for specific verified workflows. Android, iPad, third-party themes and every phone lifecycle edge case have not been individually tested. Some enhancements rely on internal Bases structures; unrecognized structures retain native controls. Semantic field recognition does not recreate every Notion database type or rule.

Download the runtime package from [GitHub Releases](https://github.com/AnthemZhou/Nebula_Focus/releases) and place `main.js`, `manifest.json` and `styles.css` in the vault's `.obsidian/plugins/nebula-focus/` folder. The official plugin directory has not yet approved the plugin; community search installation becomes available after approval. Future phone verification reuses one separate iCloud test vault, updating plugin files in place while preserving test content.
