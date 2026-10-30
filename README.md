# Nebula Focus 1.0.0

Notion-like native Bases UI for Obsidian. 紧凑表格、彩色标签、图片封面与原位编辑；笔记保持普通 Markdown。

1.0.0 以这套原生数据库呈现优化为完整产品，不包含旧版写作布局、导航器、独立资料库管理或格式速查。桌面插件，GPL-3.0-only。

## 当前功能

- 在原生 Bases 表格和笔记属性中，把领域、类型、状态、发布平台、内容类型、项目等分类字段显示为稳定颜色的标签；原生输入、链接和删除按钮保留。
- 紧凑的「想法收集箱」：文字自动换行、单行内容只占一行、较高的行顶部对齐，列宽不把标签拆成单字。调整列宽时复用测量结果，结束拖动后再计算内容高度。
- 点击想法标题直接编辑；点击页面图标或悬浮出现的「打开」进入笔记。Enter/失焦保存、Escape 取消，兼容中文输入法和原生属性撤销。
- 点击列名原位改显示名称；排序保留在原生排序工具栏。类型选择面板支持彩色选项、搜索、创建、移除，以及拖动选项顺序（键盘 Alt + ↑/↓）。
- 原生卡片/看板以正文第一张有效图片作为封面，项目看板使用 16:9 图片区域。过期截止日期着色，隐藏空的展示字段；新建操作仍调用原生 Bases。
- 表格图片保持缩略图尺寸，点击放大；文字链接去掉下划线。取消普通文本和「文件和媒体」的历史值推荐，不影响显式 `[[` 文件链接输入。
- 默认快捷键 **⌘⌥U（Mac）/ Ctrl+Alt+U（Windows/Linux）** 切换优化与原生外观；也可在命令面板执行 `Nebula Focus: 切换 Notion-like / 原生外观`。

## 安装

从 [1.0.0 Release](https://github.com/AnthemZhou/Nebula_Focus/releases/tag/1.0.0) 下载 `nebula-focus-1.0.0.zip`，解压到库的 `.obsidian/plugins/nebula-focus/`，然后启用 Nebula Focus 与 Obsidian「数据库 / Bases」核心插件。目录应包含 `main.js`、`manifest.json`、`styles.css`。

已使用开发版 `native-reading-ui` 的库应先停用它，再启用 Nebula Focus，避免同时增强同一个表格。可在停用状态把旧插件 `data.json` 复制到新目录，保留候选标签顺序；不会自动迁移或重写笔记。

## 数据边界与 AI 读取

自动显示、图片封面、颜色、字号、行距和外观切换均不修改 Markdown 正文，也不会给笔记添加样式标记。AI 可以直接读取原有 Markdown、YAML 属性和附件链接。

| 操作 | 保存位置 |
| --- | --- |
| 样式、标签颜色、图片封面、布局测量 | CSS / 内存中的呈现层，不写笔记 |
| 用户主动修改想法标题、标签，或拖动看板状态 | 原生 Bases 事务更新 Markdown 开头的 YAML 属性 |
| 列显示名、列宽、排序、筛选、分组 | 原生 `.base` 视图配置 |
| 候选标签的显示顺序 | `.obsidian/plugins/nebula-focus/data.json` |
| 新建条目 | 原生 Bases 创建 Markdown 笔记 |

无需把格式信息追加到 Markdown 尾部。外部 `.base` 文件与插件设置保存视图信息，正文更干净。若使用 Markdown 内联 `base` 代码块，Obsidian 原生视图配置的保存会更新该代码块；插件不执行正文迁移。

## 兼容范围

最低 Obsidian 1.14.4，当前实测桌面版 1.14.5。1.0.0 为桌面端版本；手机、平板和第三方主题尚未验证。

Notion 的 Markdown/CSV 导出不包含完整属性 schema，插件不会把 text 类型伪装成真正的 Notion select/relation。当前按明确语义字段名着色：领域、类型、重要性、状态、优先级、分类、发布平台、内容类型、项目、关联项目、使用镜头，以及源码注册表中的英文名称。新增值颜色稳定；普通标题、摘要、备注、日期和媒体不会被误当成标签。

自动行高、标题编辑、列名编辑、候选标签面板和底部新建针对名为「想法收集箱」的原生表格。标题列使用 `formula.想法`，从 `这里写想法` 属性显示原生文件链接；编辑只更新此属性，不重命名文件。可运行的通用示例见 `examples/vault/` 或 examples ZIP。

Bases 尚无公开的原生视图装饰扩展点，因此少量适配使用经过检查的内部视图结构；不识别时保留原生控件。Obsidian 升级后应重新验证。插件不包含网络服务、遥测或 AI 接入。

## 开发与发布

```sh
npm ci
npm run build
npm test
# 审阅并暂存公开源码、文档和版本信息后：
npm run package
```

源码包只读取 Git 暂存区中审阅过的文件，不包含本地备份、用户数据或未跟踪文件。安装包仅包含运行文件、许可证和说明。不要暂存自己的 vault、插件 data.json 或私人截图。验证记录见 [TESTING.md](docs/TESTING.md)。

Copyright © 2026 Shengyu Zhou. [GPL-3.0-only](LICENSE)。Notion 为交互与视觉参考，本项目与 Notion / Obsidian 无隶属关系。依赖说明见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
