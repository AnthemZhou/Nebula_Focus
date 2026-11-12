# 财务表格 / Finance tables

1.2.0 的财务工作台使用原生 Bases **表格**布局。Nebula Focus 增强标题编辑、彩色标签和内容行高；筛选、排序、分组、视图管理及数据类型继续由 Bases 提供。无需切换到单独的「财务关联」布局。

The finance workspace in 1.2.0 uses the native Bases **Table** layout. Nebula Focus adds editable titles, colored tags and content-driven row heights. Bases continues to provide filtering, sorting, grouping, view management and property types. There is no separate Linked finance layout to select.

## 日常操作 / Working with records

- 点击标题文字直接修改标题属性，点击前面的笔记图标打开原始记录；文件名不随标题修改。
- 点击标签打开选项面板，选择或取消选项。文字字段保持单选，列表字段保留多选数据。
- 布局的「内容显示」可选「自动换行 · 完整显示」或「单行折叠」。前者随内容调整行高；列宽保存在原生 `columnSize` 配置中。
- 删除视图：视图菜单 → 该视图右侧 `>` → 配置窗口右上角 `…` →「删除视图」。
- 同一个 Base 可以保留收支流水、项目、待报销、已报销、发票、待确认等视图，每个视图独立配置筛选和列顺序。
- 启用 `showSummaries: true` 的流水视图，在表格上方按币种分别显示当前筛选记录的收入、支出和净额；未计入记录可展开查看原因。
- 标准 `[[记录|名称]]` 链接保留出向和反向关联。打开笔记后，可运行「查看记录属性与关联」命令检查项目指标、关联明细和来源。

Click title text to edit its property; use the note icon to open the original record without renaming its file. Tags open a selection panel, retaining scalar and list property values. Rows follow wrapped text and tag content, while widths use native `columnSize` settings. One Base can contain focused ledger, project, reimbursement and invoice views with independent filters and columns. Ledger views with `showSummaries: true` display income, expense and net for the current filter, separately by currency, with expandable exclusion reasons. Standard wiki links retain outgoing links and backlinks; the record inspector command shows configured project metrics, related tables and provenance.

The view's Content display control switches between full wrapping with automatic height and a folded single line. To delete a view, open its view menu, click `>` beside its name, then `…` in the configuration panel and Delete view.

## 配置 / Configuration

增强配置放在 `.base` 文件中，不添加到笔记正文。以下为单个原生视图的最小示例：

Presentation settings live in the `.base` file, not the note body. A minimal native-table example:

```yaml
formulas:
  Nebula标题_流水摘要: 'link(file.path, if(note["流水摘要"], note["流水摘要"], file.name))'
properties:
  formula.Nebula标题_流水摘要:
    displayName: 流水摘要
views:
  - type: table
    name: 收支流水
    showSummaries: true
    order:
      - formula.Nebula标题_流水摘要
      - note.方向
      - note.金额
      - note.关联项目
    columnSize:
      formula.Nebula标题_流水摘要: 360
      note.方向: 120
    nebulaTable:
      titleProperty: 流水摘要
      titleColumn: formula.Nebula标题_流水摘要
      tags:
        方向: single
      wrap: true
      attachments: []
      scopeNote: 仅包含已导入记录；缺失计算值不代表零。
```

| 配置 / Option | 含义 / Meaning |
| --- | --- |
| `titleProperty` | 可编辑标题的笔记属性名，不含 `note.` / Editable note property name, without `note.` |
| `titleColumn` | 显示标题链接的完整公式列 ID / Full formula column ID displaying the title link |
| `tags` | 属性名到 `single` 或 `multi` 的映射 / Property names mapped to single- or multi-select editing |
| `wrap` | 按内容换行并调整高度 / Wrap content and size rows to fit |
| `attachments` | 附件属性名列表，不含 `note.` / Attachment property names without `note.` |
| `scopeNote` | 样例、筛选或快照范围的说明 / Scope of the sample, filter or snapshot |

原生 `order`、`sort`、`filters`、`groupBy`、`columnSize` 仍按 Bases 的格式保存。日期、数值、复选框、文本和列表保留其原有数据类型。公式标题只是显示入口；标题编辑更新 `titleProperty`，不会把链接文字写入正文。

Native `order`, `sort`, `filters`, `groupBy` and `columnSize` keep their Bases format. Dates, numbers, booleans, text and lists retain their types. The title formula is a display entry point; editing updates `titleProperty`, never inserting link markup into the note body.

收支汇总在视图层配置：`showSummaries: true` 开启；`amountProperty`、`currencyProperty`、`directionProperty` 默认分别为 `note.金额`、`note.币种`、`note.方向`，也可以指定公式属性；`incomeValue`、`expenseValue` 默认为 `收入`、`支出`。仅汇总当前筛选结果，不按屏幕可见行计算，不额外提供分组汇总。金额使用整数最小单位，缺失金额、负金额、无效币种、未知方向及不支持的精度会被排除。

Summary options belong to the view: enable `showSummaries: true`; `amountProperty`, `currencyProperty` and `directionProperty` default to `note.金额`, `note.币种` and `note.方向`, and can also reference formulas. `incomeValue` and `expenseValue` default to `收入` and `支出`. Totals cover the entire current filter, not just visible rows, with no separate group totals. Integer minor-unit arithmetic avoids cumulative rounding errors; missing amounts, negative magnitudes, unsupported currencies, unknown directions and unsupported precision are excluded.

## 旧布局迁移 / Legacy migration

旧 `.base` 中的 `type: nebula-finance` 转为 `type: table`，原标题列转为可显示记录链接的公式列。原有筛选、排序、分组、列顺序、其他自建视图和未知配置都保留；旧 `columnWidths` 补入原生 `columnSize`，已有原生列宽优先。再次运行转换不会重复添加公式或视图。

Legacy `type: nebula-finance` views convert to `type: table`, with a linked formula for the title column. Filters, sorting, grouping, column order, user-created views and unknown configuration remain intact. Legacy `columnWidths` fill missing native `columnSize` entries without replacing existing native widths. Repeated conversion does not duplicate formulas or views.

迁移只修改视图配置，不修改记录内容，也不补算资金池或将缺失金额写成零。原有 `showSummaries: true` 视图继续保留总体收支汇总，以原生表格上方的轻量说明展示。

Migration changes view configuration only. It does not modify records, infer fund balances or replace missing amounts with zero. Views with `showSummaries: true` retain overall cash-flow totals as a compact summary above the native table.

## 示例与关联 / Example and relationships

打开[虚构示例](../examples/vault/Finance/README.md)查看资金总览、日常账本和月度收支。报销视图保留费用内容、项目归属、报销金额、时间、支付记录、报销人员六列；记录图标位于标题单元格中。

The [fictional example](../examples/vault/Finance/README.md) includes a funds overview, daily book and monthly cash flow. Reimbursement views keep six columns, with the note icon inside the title cell.

记录详情的指标和关联表格由 `nebula-record-layouts.json` 配置，放在记录文件夹或祖先文件夹。匹配依据是源表标识和真实笔记链接，不根据相似标题猜测关系。详情配置见[记录布局](record-layout.md)。

Place `nebula-record-layouts.json` beside the records or in an ancestor folder to configure inspector metrics and related tables. Relations use source identities and resolved note links, not similar titles. See the [record layout contract](record-layout.md).

## 数据与边界 / Data and limits

每条记录仍是 Markdown。AI 可以直接读取 YAML 金额、日期和 `[[链接]]`，追到对应记录；导入器还可以生成按 Notion ID 查找路径、标题和关联的 `index.json`。仅浏览或调整展示不写正文；用户主动编辑属性时会更新对应 YAML 数据。参见[导入契约](notion-backup.md)。

Each record remains Markdown. An AI can read YAML amounts, dates and wiki links without running the plugin. The optional importer creates an `index.json` mapping Notion IDs to paths and relationships. Viewing or changing presentation does not write note bodies; an explicit property edit updates that YAML value. See the [import contract](notion-backup.md).

导入的 Notion 公式结果是历史快照，不是本地实时公式。未取得的计算结果保持缺失，不能视作零。少量样例不代表银行余额、项目利润或最终可分配金额；本插件不猜测税费、资金分配、结算和换汇规则。1.2.0 的财务表格改动尚需单独进行 iPhone 真机验证。

Imported Notion formula results are historical snapshots, not live local formulas. Missing results remain unavailable rather than zero. A bounded sample does not establish bank balances, project profit or final distributions. Tax, allocation, settlement and currency-conversion rules are never inferred. The finance-table changes in 1.2.0 still require separate physical-iPhone validation.
