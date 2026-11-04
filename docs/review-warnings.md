# 检查说明与更新机制 / Review findings and updates

[中文](#中文) · [English](#english)

## 中文

### 1.1.2 本地检查结果

2026-11-04，使用与官方检查相同的 `eslint-plugin-obsidianmd@0.4.2` 比较修改前后源码：**1,570 项诊断 → 38 项警告、0 项错误**。不安全的赋值、调用、成员访问等类型诊断已清除；原生 Bases 边界改用明确结构与运行时校验，无法识别时保留原生处理。严格构建与 **308/308** 自动测试通过。

这是可复现的本地结果，不是 1.1.2 官方扫描结论。1.1.2 已发布，GitHub 工作流通过，官方复检已排队。1.1.1 的官方扫描已 Completed、无 Error；1.1.0 邮件中的 Error 是简介重复使用宿主产品名，该问题已在 1.1.1 修复。

```sh
npm ci
npm run lint
npm run build
npm test
```

`eslint.config.mjs` 保留官方推荐规则；下表中的 API 偏好、兼容性和文案规则明确设为 warning 并继续显示。类型安全与正确性规则仍为阻断错误。源码没有 `eslint-disable`，也没有通过关闭规则消除诊断数量。

发布证据：[1.1.2 Release](https://github.com/AnthemZhou/Nebula_Focus/releases/tag/1.1.2) · [成功的 CI](https://github.com/AnthemZhou/Nebula_Focus/actions/runs/41794125012)。下载的三个运行文件与本地 SHA-256 一致；`gh attestation verify` 均通过，来源提交为 `2c22372`。官方部分结果已将 `main.js` 和 `styles.css` 的构建证明标为 Pass，完整扫描仍 Pending。

### 保留的 38 项警告

| 数量 | 规则 | 保留原因 |
| --- | --- | --- |
| 27 | `obsidianmd/prefer-create-el` | 这些控件通过当前元素的 `ownerDocument.createElement` 创建，包括未挂载的测量节点与弹窗。保留明确的文档归属，避免跨窗口或测试文档混用；这不代表官方一定豁免该建议。 |
| 6 | `@typescript-eslint/no-deprecated` | 5 处 `keyCode === 229` 与 `isComposing` 共同保护输入法组合输入；1 处 `caretRangeFromPoint` 是 Safari 光标定位回退。直接删除可能改变中文输入或点击定位行为。 |
| 3 | `obsidianmd/ui/sentence-case` | 提示文本中的 `Alt` 是键名，其大写符合键盘标记。 |
| 1 | `obsidianmd/commands/no-default-hotkeys` | 保留明确要求的外观对照快捷键；用户可在快捷键设置中修改。 |
| 1 | `obsidianmd/prefer-file-manager-trash-file` | 新建撤销使用 `vault.trash(file, false)`，明确移入库内 `.trash`，配合恢复保护实现可恢复的撤销。 |

这些是有意保留的实现取舍，并不等于官方已逐项批准。后续若官方提出具体要求，再按实际反馈调整。

### 样式与依赖

去掉 CSS 注释后，`!important` 从 **24 → 15**，`:has()` 从 **13 → 11**。删除了废弃的表头编辑规则，部分强制覆盖改成限定作用域的选择器；保留项用于原生控件和交互状态。目录的兼容提示以 **Obsidian 1.11.4** 为扫描基线，而本插件最低版本为 **1.14.5**，因此提示需要结合目标版本核对，不能仅按数量判断故障。

标记为“multicolumn”的 `column-gap` 在这里用于 flex 布局，并未实现多栏排版；`clip-path` 用于视觉隐藏但保留辅助技术可读的状态提示。移动端兼容性仍以实际设备证据为准。

发布工作流已配置 ESLint 和 `actions/attest@v4`，为 `main.js`、`manifest.json`、`styles.css` 提供构建证明；实际 CI 已成功生成证明。附加 ZIP 是手动安装、公开源码和示例资料，三个标准运行文件仍单独上传。

`npm audit --omit=dev` 当前为 **0 项漏洞**。开发依赖链中的 `minimatch` 仍有审计提示，上游使用的 v3 / v10 与 v11 API 不兼容，未以跨主版本强制覆盖处理。开发依赖审计与插件运行包要分别判断；它们也不是同一组 ESLint 警告。

### 发布后多久能更新

首次提交与日常更新不是同一个步骤。官方说明自动审核通常只需几分钟，通过后可在 **24 小时内**出现在应用搜索与下载中；这是目录流程说明，并不是每次更新的固定用时保证。[官方发布机制说明](https://obsidian.md/blog/future-of-plugins/)

后续版本不需要重复填写首次提交表单。发布版本号一致的 GitHub Release 并提供安装文件后，官方会周期性检查新版本、执行自动审核；开发者页面也提供 **Check for new releases**。仅推送源代码不会生成可安装更新。扫描通过、目录同步和用户端检查更新是不同阶段，官方 FAQ 未给每次更新承诺固定延迟。[官方 FAQ](https://docs.obsidian.md/community-directory/faq)

插件由 Obsidian 的社区插件更新功能安装新版，不自行下载、替换执行代码。手机同步库仍可原处更新，继续复用同一个测试库。

## English

### Local 1.1.2 results

On 2026-11-04, comparing source before and after the changes with the same official `eslint-plugin-obsidianmd@0.4.2` rules reduced **1,570 findings to 38 warnings and zero errors**. Unsafe assignment, call and member-access findings are cleared. Native Bases boundaries now use explicit structures and runtime guards, retaining native handling when unrecognized. The strict build and **308/308** automated tests pass.

These are reproducible local results, not the official 1.1.2 scan. Version 1.1.2 is published, its GitHub workflow passed, and the official review is queued. The official 1.1.1 scan completed without Errors. The Error in the 1.1.0 email concerned the redundant host-product name in the description, corrected in 1.1.1.

Run `npm ci`, `npm run lint`, `npm run build` and `npm test`. The configuration retains the official recommended rules. API preferences, compatibility and wording rules below explicitly remain visible as warnings; unsafe-type and correctness rules remain blocking errors. No `eslint-disable` directives or disabled rules hide findings.

Release evidence: [1.1.2 Release](https://github.com/AnthemZhou/Nebula_Focus/releases/tag/1.1.2) · [successful CI](https://github.com/AnthemZhou/Nebula_Focus/actions/runs/41794125012). The downloaded runtime files match local SHA-256 hashes, and all three pass `gh attestation verify` for source commit `2c22372`. Partial official results mark the `main.js` and `styles.css` attestations as Pass; the full scan remains Pending.

### Why 38 warnings remain

| Count | Rule | Reason |
| --- | --- | --- |
| 27 | `obsidianmd/prefer-create-el` | `ownerDocument.createElement` preserves the document ownership of controls, detached measurement nodes and popups across windows and test documents. This is not a claim of an official exemption. |
| 6 | `@typescript-eslint/no-deprecated` | Five `keyCode === 229` checks supplement `isComposing` for IME handling; one `caretRangeFromPoint` call is a Safari caret-placement fallback. Removing them blindly could change composition or click behavior. |
| 3 | `obsidianmd/ui/sentence-case` | `Alt` is the literal keyboard key name in help text. |
| 1 | `obsidianmd/commands/no-default-hotkeys` | The explicitly requested appearance-comparison shortcut remains; users can change it in shortcut settings. |
| 1 | `obsidianmd/prefer-file-manager-trash-file` | Creation undo deliberately uses `vault.trash(file, false)` to move the note into the vault's `.trash`, with restoration guards for recoverable undo. |

These are documented implementation choices, not findings individually approved by the directory. Specific official feedback may require further changes.

### Styles and dependencies

Excluding CSS comments, `!important` occurrences fall from **24 to 15**, and `:has()` from **13 to 11**. Obsolete header-editing rules are removed and scoped selectors replace some forced overrides. Remaining overrides serve native controls and interaction states. The directory compatibility scan uses an **Obsidian 1.11.4** baseline, while the plugin requires **1.14.5**; findings need to be checked against the target version rather than treated as failures by count alone.

The `column-gap` flagged as “multicolumn” is used in flex layouts, not multicolumn layout. `clip-path` visually hides live status text while retaining assistive-technology access. Actual-device evidence still defines the verified mobile scope.

The workflow configures ESLint and `actions/attest@v4` for `main.js`, `manifest.json` and `styles.css`. The actual CI run succeeded and generated the attestations. Additional ZIPs contain manual-install files, public source and examples; the three standard runtime files remain separate assets.

`npm audit --omit=dev` currently reports **zero vulnerabilities**. The development dependency chain still reports `minimatch`; its upstream v3 / v10 requirements are not API-compatible with v11, so no forced cross-major override is applied. Development-tool audit findings and runtime-package findings have different scope and are separate from ESLint warnings.

### When updates become available

Initial submission and routine updates are different steps. Obsidian says automatic reviews typically take a few minutes and passing plugins become searchable and downloadable in the app **within 24 hours**. This describes the directory process, not a fixed latency guarantee for every update. [Official release-process announcement](https://obsidian.md/blog/future-of-plugins/)

Later versions do not require another initial submission. Publish a GitHub Release with matching version metadata and installation files; the service periodically checks releases and automatically reviews them. The developer page also offers **Check for new releases**. A source push alone is not an installable update. Review, directory synchronization and the user's update check are separate stages; the FAQ does not promise a fixed delay for every version. [Official FAQ](https://docs.obsidian.md/community-directory/faq)

Users install updates through Obsidian's community-plugin updater. The plugin does not download or replace its own executable code. Synced phone vaults can still be updated in place, reusing the single persistent test vault.
