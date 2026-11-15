# Nebula Focus 1.5.0 — AI recording, CLI and workspace refinements

[中文](#中文) · [English](#english)

## 中文

1.5.0 增加手机 AI 记录、电脑外部 AI 的 CLI 接口，以及标签管理、桌面导航和搜索层级。最低要求 Obsidian **1.14.5**；数据库需要启用 **Bases** 核心插件。

- **AI 记录聊天。** 手机侧栏新增「AI 记录」，支持文字和截图，通过工具识别外部 `.base` 数据库与字段，新建或更新记录后返回真实页面卡片。截图原件按库内附件设置保存。聊天只暂存于本次插件运行期间。
- **通用 API 配置。** 提供 OpenAI、DeepSeek 快速填写，地址、模型和密钥名称均可编辑，支持兼容 Chat Completions 的其他服务。图片输入可按模型能力开关；密钥使用 Obsidian SecretStorage，不写入插件 `data.json`。只有主动发送时才请求所选 API，没有遥测。
- **外部 AI + CLI。** `scripts/obsidian-records.cjs` 提供数据库发现、字段定义、查询、读取、新建和更新，与手机共用记录规则。显式指定仓库、按字段类型校验、使用幂等新建及版本冲突保护；返回 Obsidian 页面链接。
- **标签管理。** 标签候选右侧新增操作菜单，支持颜色、重命名和删除。数据库字段改动保留原生属性历史；候选配置与颜色不属于记录撤销。
- **桌面工作区。** 前进／后退移动到窗口左上角，移除重复标题；统一顶栏对齐与图标位置。分栏使用细边界和更大的拖动区域。桌面内容保留布局宽度并在显著溢出时渐隐，小幅看板溢出不再误加阴影；列宽下限容纳属性名。
- **搜索层级。** 分类使用胶囊背景，子页面增加缩进与层级符号，保留分类结果缓存。

### 安装与验证范围

保留 `data.json`，替换 `.obsidian/plugins/nebula-focus/` 下的 `main.js`、`manifest.json`、`styles.css` 后重载。iPhone 等待同步后彻底关闭并重开 Obsidian。AI 配置入口为「设置 → Nebula Focus → AI 记录 → 配置 API」。模型必须支持工具调用，截图需模型支持图片输入。

自动测试、严格构建和打包检查见[测试记录](https://github.com/AnthemZhou/Nebula_Focus/blob/1.5.0/docs/TESTING.md)。真实 Mac CLI 已验证临时记录的创建、更新、附件链接、重复请求与版本冲突；原有笔记未修改。手机入口、设置与图片来源菜单已有镜像检查，但未完成真实 API 识图或手机软键盘的完整验收。没有提供实际模型密钥，验证未向外部 AI 发送截图或笔记。

AI/CLI 写入不进入 Bases 的界面撤销栈；停止处理不会撤销已经完成的写入。当前仅识别受支持过滤条件的外部 `.base`，不支持任意公式或内联数据库。更多限制、配置与调用示例见 [AI 记录与 CLI](https://github.com/AnthemZhou/Nebula_Focus/blob/1.5.0/docs/ai-recording.md)。公开安装包、源码包和示例包不含私人库、密钥、插件设置或本机验证截图。

## English

Version 1.5.0 adds mobile AI recording, a desktop CLI for external AI, tag management and workspace refinements. Requires Obsidian **1.14.5** and **Bases** for database views.

- **AI recording chat:** send text and screenshots, discover external Base schemas, create/update records and receive actual page links. Original images follow vault attachment settings; chat history stays in memory.
- **Configurable providers:** editable OpenAI/DeepSeek presets and custom Chat Completions endpoints/models. Optional image capability, SecretStorage credentials, explicit-send requests only, no telemetry.
- **External AI + CLI:** database discovery, schema, query, read, create and update through `scripts/obsidian-records.cjs`, sharing the mobile validation layer. Explicit vault selection, typed fields, idempotent creates and revision checks protect existing records.
- **Tag options:** change colors, rename and remove options from each tag's menu. Record changes retain native property history; preference changes are outside record undo.
- **Desktop layout:** move navigation beside window controls, remove the duplicate title, align headers/icons and refine divider hit areas. Preserve desktop content width with fades for significant overflow, suppress insignificant board fades and enforce header-aware column minimums.
- **Search:** pill-shaped categories, child indentation and hierarchy markers, with existing category caching retained.

Keep `data.json` when replacing the three runtime files. On iPhone, wait for sync and fully restart Obsidian. Configure a tool-capable model in the plugin's AI recording settings; screenshots additionally require image support.

Automated validation and real Mac CLI checks are recorded in [TESTING](https://github.com/AnthemZhou/Nebula_Focus/blob/1.5.0/docs/TESTING.md). Phone checks cover the entry, settings and image-source menu, not full software-keyboard or real-model image recognition acceptance. No real API credentials were supplied and no notes/images were transmitted to an AI service during validation.

AI/CLI writes are outside Bases UI undo. Cancellation retains completed writes. Only supported external Base filters are writable; arbitrary formulas and inline Bases are not supported. See [AI recording and CLI](https://github.com/AnthemZhou/Nebula_Focus/blob/1.5.0/docs/ai-recording.md). Public archives exclude private vaults, credentials, plugin settings and local screenshots.
