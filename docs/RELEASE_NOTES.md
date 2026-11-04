# Nebula Focus 1.1.2 — Notion-like Bases, safer native integration

[中文](#中文) · [English](#english)

## 中文

1.1.2 改进原生 Bases 的结构校验与发布检查，保留现有 Notion-like 表格、标签、看板和页面侧栏。最低要求 Obsidian **1.14.5**，并启用「数据库 / Bases」核心插件。

- **减少类型风险。** 用明确的结构类型和运行时校验替换宽泛的 `any`。遇到不识别的原生布局、属性或编辑器时，保留原生处理；增加不完整结构的回归测试。
- **收敛样式。** 删除废弃表头编辑规则，用限定作用域的选择器替换部分强制覆盖。去掉注释后，`!important` 从 24 处减至 15 处，`:has()` 从 13 处减至 11 处。
- **把检查纳入发布。** 发布工作流增加官方 ESLint 规则检查，并配置三个运行文件的 GitHub 构建证明。保留的警告及原因见[检查说明](https://github.com/AnthemZhou/Nebula_Focus/blob/main/docs/review-warnings.md)。

本地使用同一版本 `eslint-plugin-obsidianmd@0.4.2` 比较，诊断从 **1,570 项降为 38 项警告、0 项错误**；不安全类型系列已清除，没有用 `eslint-disable` 隐藏警告。严格构建与 **308/308 自动测试通过**。桌面实测看板新建、撤销、重做及明暗主题通过；14 份原有测试笔记逐字节未变。官方扫描与客户端可用性以目录状态为准。

本次不改变 Markdown 的存储方式：外观不写入正文或末尾格式标记；主动编辑仍使用原生属性事务，视图配置保存在 `.base`，偏好保存在插件设置。既有 iPhone 直接触摸记录属于 1.1.0 / 1.1.1；本次没有新增手机全流程通过结论。详细范围见 [TESTING.md](https://github.com/AnthemZhou/Nebula_Focus/blob/main/docs/TESTING.md) 与 [iPhone 记录](https://github.com/AnthemZhou/Nebula_Focus/blob/main/docs/mobile-testing.md)。

运行包可从 [GitHub Releases](https://github.com/AnthemZhou/Nebula_Focus/releases) 获取。后续版本不重复提交首次申请，但仍会自动扫描；客户端可用时间还受扫描和目录同步影响。见[官方 FAQ](https://docs.obsidian.md/community-directory/faq)。

## English

Version 1.1.2 strengthens native Bases validation and release checks while preserving the existing Notion-like tables, tags, boards and page sidebar. It requires Obsidian **1.14.5** with the **Bases** core plugin enabled.

- **Safer native integration.** Explicit structural types and runtime guards replace broad `any` usage. Unrecognized native layouts, properties and editors retain native handling; regression tests cover incomplete structures.
- **More focused styles.** Obsolete header-editing rules are removed, and scoped selectors replace some forced overrides. Excluding comments, `!important` occurrences fall from 24 to 15 and `:has()` selectors from 13 to 11.
- **Checks in the release workflow.** Publishing now includes official ESLint rules and configured GitHub attestations for the three runtime files. Retained findings and their reasons are listed in the [review guide](https://github.com/AnthemZhou/Nebula_Focus/blob/main/docs/review-warnings.md).

A local comparison using the same `eslint-plugin-obsidianmd@0.4.2` rules reduces **1,570 findings to 38 warnings and zero errors**. Unsafe-type findings are cleared, with no `eslint-disable` suppression. The strict build and **308/308 automated tests pass**. Desktop board creation, undo/redo and light/dark checks pass; all 14 pre-existing test notes remain byte-identical. Official review and client availability are separate directory stages.

Markdown storage is unchanged: presentation does not modify bodies or append formatting markers. Explicit edits still use native property transactions; views live in `.base` files and preferences in plugin settings. Existing direct-touch iPhone evidence belongs to 1.1.0 / 1.1.1; this version has no new full phone-test pass. See [TESTING.md](https://github.com/AnthemZhou/Nebula_Focus/blob/main/docs/TESTING.md) and the [iPhone record](https://github.com/AnthemZhou/Nebula_Focus/blob/main/docs/mobile-testing.md) for scope.

The runtime package is available from [GitHub Releases](https://github.com/AnthemZhou/Nebula_Focus/releases). Later versions do not require another initial submission, but remain subject to automatic scans; availability also depends on directory synchronization. See the [official FAQ](https://docs.obsidian.md/community-directory/faq).
