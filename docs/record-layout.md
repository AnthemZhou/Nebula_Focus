# Configured record layouts / 可配置记录详情

English | [中文](#中文)

A record layout adds source metrics and related-record tabs to Nebula Focus's read-only record inspector. It does not rewrite notes, calculate Notion formulas, or replace native Bases. Use native `.base` views for the main ledger and editing; use this inspector to follow a project's connected records.

Place `nebula-record-layouts.json` alongside the record folder or in an ancestor folder inside the vault. The inspector walks from the record's parent toward the vault root and uses the nearest valid profile whose key exactly equals that record's `nf_source_collection`. Collection IDs may be UUIDs or other strings; no `collection://` prefix is added or removed. Refresh reloads the configuration and metadata. Invalid local configuration is reported instead of silently falling through to a parent.

```json
{
  "version": 1,
  "profiles": {
    "example-projects": {
      "metrics": [
        {"property": "Contract", "label": "Contract amount", "format": "number", "currency": "CNY"},
        {"property": "Received", "format": "number"}
      ],
      "tabs": [
        {
          "label": "Expenses and reimbursements",
          "targetCollection": "example-costs",
          "relationProperty": "Project",
          "forwardProperty": "Costs",
          "titleProperty": "Expense",
          "columns": ["Expense", "Amount", "Category", "Date"],
          "labels": {"Amount": "Expense amount"},
          "numberProperties": ["Amount"],
          "tagProperties": ["Category"],
          "filters": [{"property": "Status", "operator": "notEquals", "value": "Void"}],
          "sort": [{"property": "Date", "direction": "desc"}]
        }
      ]
    }
  }
}
```

## Schema

| Field | Meaning |
| --- | --- |
| `version` | Must be `1`. |
| `profiles` | Object keyed by exact source collection identity. Each profile requires `metrics` and `tabs` arrays; either may be empty. |
| `metrics` | Ordered items with required `property`, optional `label`, `format` (`text` or `number`), and optional three-letter uppercase `currency`. |
| `tabs` | Ordered related tables; each tab has a unique `label`. |
| `targetCollection` | Exact `nf_source_collection` of records allowed in the tab. |
| `relationProperty` | Relation on each candidate record pointing back to the inspected record. |
| `forwardProperty` | Optional relation on the inspected record pointing toward candidates; fallback when the candidate's backlink field is absent or explicitly unavailable. |
| `titleProperty` | Required title field, also present in `columns`. Its cell includes the record icon, without an extra column. |
| `columns` | Ordered, unique property names, without `note.` prefixes. |
| `labels` | Optional map from property names to displayed headings. |
| `numberProperties`, `tagProperties` | Optional unique lists controlling presentation, without changing stored types or values. |
| `attachmentProperties` | Optional list of attachment columns. Local image wiki links get a compact thumbnail; clicking opens the native image. Other local files remain links. Remote images are never fetched automatically. External file links display a compact filename and omit query/signature text from labels and tooltips. |
| `filters` | Optional AND list of `{property, operator, value?}`. Operators: `equals`, `notEquals`, `isEmpty`, `notEmpty`. Equality is exact; for arrays it checks membership. Empty means missing, null, empty string, or empty array. Only equality operators take a primitive `value`. Unavailable calculation fields never pass a filter, including `notEquals` or `isEmpty`. |
| `sort` | Optional ordered `{property, direction}` list, direction `asc` or `desc`. Numeric values sort numerically, strings naturally; empty values stay last. File path breaks ties. Use ISO dates for chronological string order. |

Unknown configuration fields are rejected. Configuration does not accept executable formulas, JavaScript, HTML, or custom CSS. It is limited to 256 KiB, 64 profiles, 20 metrics and 20 tabs per profile, 64 columns, 32 filters, and 8 sort keys per tab.

## Relations and source values

- Both the target collection and the resolved local file path must match. Similar titles, body mentions, and records from another database do not establish membership.
- An explicit backlink is authoritative. A stale forward link cannot override a backlink pointing elsewhere or an explicitly empty backlink. Unavailable backlinks can use the forward fallback.
- Unresolved forward wiki links and external HTTP(S) references are counted separately from local rows. A subset is not presented as the complete ledger. Missing records are never created implicitly.
- Metrics marked in `nf_unavailable_fields`, missing configured metrics, and unresolved formula-result references display `未取得` (unavailable). A real zero remains zero. A source null remains empty, not zero. `nf_snapshot_fields` values are marked as source snapshots and are not recalculated.
- Explicit ISO timestamps with a timezone display in the browser's local time, retaining the original ISO string in a tooltip. Date-only values and timezone-free text are unchanged.
- Number formatting preserves source precision: unsupported precision falls back to the original value instead of rounding it silently. There is no currency conversion, inferred balance, project profit, or reimbursement-debt calculation.

The inspector keeps all original properties, outgoing links, backlinks, missing fields, and source provenance in a collapsed section. Following a related row from a configured layout stays in the inspector with a back action. **Open note** opens the native file; modifier-click opens a native tab. Attachment and heading links retain native navigation. The refresh button reloads current data. No notes, frontmatter, Bases, or settings are written by this feature.

## 中文

记录布局为只读详情面板增加「顶部指标＋关联表格标签页」。主账本与编辑仍使用原生 `.base`；此功能不修改 Markdown 正文或属性，不执行 Notion 公式，也不将样本合计当作全库结果。

在记录所在目录或其父目录放置 `nebula-record-layouts.json`。插件向仓库根目录查找，采用最近且与 `nf_source_collection` **完全一致**的配置。数据库标识可以是 UUID 或其他字符串，不自动增删 `collection://`。点击「刷新」重新读取配置和元数据；附近配置有误时会提示，不会悄悄改用上级配置。

上方 JSON 示例中的名称均为虚构。字段约定如下：

- `version` 固定为 `1`；`profiles` 以数据库标识为键。每个布局包含 `metrics` 和 `tabs` 数组，可为空。
- `metrics` 按顺序显示指标：必填 `property`，可选显示名 `label`、格式 `format`（`text`／`number`）和三位大写币种 `currency`。
- 每个关联标签页必填 `label`、`targetCollection`、`relationProperty`、`titleProperty`、`columns`。标题属性必须在列中；页面图标放在标题格内，不新增一列。所有属性名称均不带 `note.`。
- `relationProperty` 是候选记录上指向当前记录的关联属性。`forwardProperty` 可选，是当前记录上指向候选记录的属性，仅在候选记录未提供反向属性或明确标为未取得时补充使用。
- `labels` 修改显示列名；`numberProperties` 和 `tagProperties` 指定数字和标签的呈现方式，不更改数据类型。`attachmentProperties` 指定附件列：本地图片显示小缩略图，点击打开原图；其他本地文件保留链接，不自动请求远程图片。远程附件只显示简短文件名，标签和提示文字不显示查询参数或签名。
- `filters` 全部条件同时生效，支持 `equals`、`notEquals`、`isEmpty`、`notEmpty`。数组的相等判断表示包含完全一致的值。只有前两种运算符填写 `value`；空值指缺失、null、空字符串或空数组。未取得的计算字段不会通过任何筛选条件，包括「不等于」和「为空」。
- `sort` 按顺序填写 `{property, direction}`，方向为 `asc` 或 `desc`；数字按数值排序，字符串自然排序，空值始终排最后。日期宜使用 ISO 格式。

数据库身份与解析后的文件路径必须同时匹配；同名笔记或正文提及不会被误当成关联。候选记录中明确的反向关联优先，旧的正向关联不能覆盖它。未导入的链接与外部记录会显示数量提醒，不会创建空笔记。

含明确时区的 ISO 时间按当前设备本地时间显示，原值保留在提示中；纯日期和不带时区的文字保持原样。

未取得的计算字段显示「未取得」，真实零值保留为零；来源空值不当作零。来源计算快照有标记，不在本地重算。不根据少量导入样本推算公司余额、项目利润或欠款。配置文件仅支持上述声明式字段，不接受脚本、HTML 或 CSS。

完整属性、双向关联和来源信息保留在折叠区。点击关联记录可继续查看并返回，「打开笔记」仍进入原生笔记。查看、切换标签页、刷新和导航均不写入笔记、前置属性或 `.base` 文件。
