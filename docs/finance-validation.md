# Finance development validation / 财务开发版验证

The finance functionality is included in the 1.2.0 source. It has not received a separate physical-iPhone test. The desktop and prototype checkpoints below are historical validation records; the current release checks are recorded in [RELEASE_NOTES.md](RELEASE_NOTES.md).

财务功能纳入 1.2.0 源码，尚未单独进行 iPhone 真机验证。下方分别保留桌面结构与初版验证的历史检查点，当前发布检查见 [RELEASE_NOTES.md](RELEASE_NOTES.md)，不把旧结果视作新版全部通过。

## Current desktop structure / 当前桌面结构验证（2026-11-12）

Verified in the existing preview vault on Obsidian 1.14.5. No additional test vault was created. Private source records and attachments remain outside the public source tree.

Final TypeScript/build and **384/384 automated tests passed**. ESLint remains at 0 errors and 38 pre-existing warnings; the new modules are clean. Regression coverage includes unavailable-value exclusion, source-vs-local formula flags, stale links without note creation, async inspector navigation, strict sidecar validation, compact URLs, local attachments and timezone-consistent date display.

- The dashboard now follows the source hierarchy: funds overview, one daily book with six source-specific views, and collapsed monthly/background/history sections.
- A bounded private sample spans several source tables and projects. Expense, payment and invoice relationships were checked against their source records; exact collection and file identity prevent cross-project leakage. Private record counts and relationship distributions are not published.
- Pending and paid reimbursements match captured Notion saved-view membership. Both views retain their configured columns and exclude personal advances from cash-flow summaries.
- Live checks covered native view switching, the project metric/tab layout, relation-to-project navigation, related-record drill-down and back, confirmed monthly grouping, and the missing-calculation indicators.
- Selected image and PDF attachments were downloaded and linked locally. The receipt thumbnail remains compact, and clicking it opens an image preview that closes correctly. No signed URL text stretches the table row.
- Both built-in light and dark themes were checked. The project title column and dates remain readable, empty select values do not become colored chips, and tables retain horizontal scrolling when necessary.
- Explicit source timestamps display in device-local time, matching the native Bases view. The original timezone-bearing value stays in the file and remains available in the tooltip.
- All checked local property links resolve. SHA-256 comparisons confirm that unrelated Markdown notes and imported record notes remain unchanged by viewing and navigation.

The funds overview and project rollups still lack returned source results. They display **未取得**, never zero or inferred complete balances. The confirmation view's membership is explicitly a captured Notion-view snapshot. Records outside the selected sample and remaining source-body attachment references are reported as incomplete; this is not a complete financial backup.

本次沿用现有预览库，按 Notion 的「总览 → 日常账本 → 项目详情」层级验证。所选样例、项目关联、待报销与已报销成员均已核对；选定凭证已本地保存。私人记录的数量、关联分布、金额与标识不公开。页面、标签页、关联跳转与返回、缩略图预览、月度分组及明暗主题已在桌面实际检查。AI 可继续读取原生 Markdown 属性、Wiki 链接和索引；布局配置位于独立 JSON／Base 文件，不注入原笔记正文。

资金池等源公式仍显示「未取得」，待确认成员属于采集时快照；不把样例合计当作全量余额。未采集的关联与正文附件仍有明确缺失报告。

## Updated structure / 更新后的结构

The public fixture now contains 11 fictional records: two projects, three ledger entries, four costs, one invoice and one deliberately incomplete overview. `tests/finance-examples.test.cjs` verifies:

- All example wiki links resolve and source identities are fictional.
- Daily-book views select the expected source records. Pending and paid reimbursements each have one personal advance; company payments and voided costs are excluded.
- Reimbursement views keep the specified six columns and do not show cash-flow totals.
- Project A has three related costs, three ledger entries and one invoice; Project B's cost remains outside that relationship.
- Missing project/overview calculations stay absent and explicitly marked. A zero invoice tax remains a valid zero.
- The monthly view filters confirmed ledger records, groups by a month formula and labels imported cash-flow fields as snapshots.

These six fixture tests passed. They validate source links, sample coverage and the fixture's filter expressions; native Bases rendering and the new inspector behavior are tested separately.

公开示例仅含虚构数据。六项结构测试已通过，覆盖链接完整性、按源表筛选、待报销与已报销分离、项目关联隔离、缺失值与零值的区别，以及已确认流水的月度分组配置。这些测试不代替 Obsidian 实际界面测试。

## Initial prototype / 初版验证

Verified on macOS with Obsidian 1.14.5, 2026-11-07.

本次在现有预览库中验证，没有新建测试库。真实样例保留在私人库和忽略目录，不纳入公开示例或测试。

- 343 automated tests passed, including exact currency arithmetic, invalid/missing data exclusions, group rendering, source navigation, mixed property values, import idempotency and local-edit conflict protection.
- TypeScript/build passed. ESLint: 0 errors, 38 pre-existing warnings; the new modules add no warnings.
- Desktop live checks: ledger amounts and totals, project group totals, linked-record navigation, reverse references, inspector command from an open note, embedded Base, horizontal keyboard scrolling, light/dark contrast.
- A bounded private sample covers multiple source tables and local property relationships. This is feature validation, not a complete financial backup.
- SHA-256 comparisons confirmed that existing Markdown notes and imported record notes remained unchanged by viewing and navigating the UI.
- Unavailable source calculations, relations outside the sample and undownloaded attachments are reported explicitly. None was treated as zero or represented as a completed local backup.

The exact private values and source identifiers are intentionally absent from this report. Public demonstration data under `examples/vault/Finance` is fictional.
