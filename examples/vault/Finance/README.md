# 财务关联示例 / Linked finance example

这里的 **11 条记录全部为虚构数据**。将整个 `Finance` 文件夹放在现有测试库的根目录，并启用原生 Bases 与 Nebula Focus 开发版。不需要另外建立库。

All **11 records are fictional**. Copy the complete `Finance` folder into an existing test vault's root, with native Bases and the Nebula Focus development build enabled.

## 资金总览 / Funds overview

![[Finance/资金总览.base]]

总览字段故意保留“未取得”，演示缺失结果与零值的区别。少量流水不能代替完整银行余额或资金池计算。

Overview calculations are deliberately unavailable. A bounded sample cannot establish complete bank balances or internal fund balances.

## 日常账本 / Daily book

![[Finance/财务示例.base]]

在同一个 Base 的原生视图选择器中切换 **收支流水／项目／待报销／已报销／发票／待确认**。这些视图都是原生表格：点击标题文字编辑，点击前面的笔记图标打开记录，点击标签选择或取消选项。原有“原生表格编辑”视图也保留。

Use the same Base's native view picker for **ledger, projects, pending reimbursements, reimbursed expenses, invoices and pending confirmation**. Every view is a native table: click title text to edit, the note icon to open the record, or a tag to change its selection. The original plain editing view is also retained.

- 从“项目”点击笔记图标打开 **展示项目 A**，再运行「查看记录属性与关联」命令：顶部关键指标，下方 **费用与报销／收付款／发票**。
- 项目 A 应显示 3 条费用、3 条收付款、1 条发票；项目 B 的 1 条费用不会混入。
- 待报销与已报销各有 1 条；公司直接支付和未支付费用不进入个人报销视图。
- 已报销费用链接到公司付款，再链接回项目；页面正文和属性仍是普通 Markdown。
- 发票的零税额保留数值 **0**，缺失的项目计算值保持缺失，不补成零。

Open **展示项目 A** using its note icon, then run the record-properties-and-relations command to see key figures and three related tables: **expenses/reimbursements, payments and invoices**. It contains 3 expenses, 3 ledger entries and 1 invoice. Project B's expense must stay separate. Pending and completed reimbursement views each contain one record. The completed reimbursement links to its payment and project. Zero tax remains the number **0**; missing calculations are never replaced with zero.

> [!info]- 看月度收支 / Monthly cash flow
> ![[Finance/月度收支.base]]
>
> 只纳入已确认的流水，按月显示现金收支快照。净现金不代表项目利润；不同币种不能直接相加。
>
> Only confirmed ledger entries are grouped by month, showing imported cash-flow snapshots. Net cash is not project profit; different currencies cannot be summed together.

> [!info]- 后台入口与说明 / Back-office access
> - [[Finance/财务示例.base|打开账本与原生编辑视图]]
> - [[Finance/示例项目|项目 A 原始笔记]]
> - [[Finance/示例项目B|项目 B 对照笔记]]
>
> `nebula-record-layouts.json` 只定义详情展示，不写入笔记正文。数据关系使用标准 `[[笔记链接]]`，AI 可直接读取。
>
> The sidecar configures presentation only. Ordinary Markdown properties and wiki links remain readable without the plugin.

> [!quote]- 历史说明 / Historical context
> 此示例没有真实历史账目。快照字段不会随本地编辑重算；真实导入时须回原始来源核对。
>
> There are no real historical accounts here. Imported calculation snapshots do not recompute when local properties change.

这不是会计引擎，不会推算税款、个人分配或缺失的 Notion 公式结果。

This is not an accounting engine. Tax, allocations and unavailable Notion calculations are never inferred.
