# Linked Notion samples / Notion 关联数据样例

`scripts/import-notion-backup.py` turns an explicitly collected Notion sample into native Markdown properties, linked records and Bases tables. It runs offline with Python 3 and does not fetch credentials or change Notion. Keep real financial bundles and generated vaults outside the public repository, or in the ignored `dist/` directory.

此脚本将已采集的 Notion 样例转为原生 Markdown 属性、记录之间的双向可追踪链接和 Bases 表格。它不会联网、修改 Notion 或猜算财务规则。真实财务数据只存放在私人库或被 Git 忽略的 `dist/` 中。

```sh
python3 scripts/import-notion-backup.py \
  --bundle /absolute/private/sample.json \
  --vault /absolute/path/to/existing-vault \
  --folder "Notion 关联数据备份"
```

## Using a Notion Markdown & CSV export / 直接打开导出笔记

将 Notion「Markdown & CSV」导出的文件解压到库内独立文件夹。保留目录名和文件名，方便 Obsidian 解析正文中的相对链接。右键该文件夹，选择「识别此文件夹的 Notion 导出笔记」，可递归识别带来源 UUID 的笔记。单页可用命令「识别当前 Notion 导出笔记」。已有 YAML 的页面会跳过。

插件从首行标题建立别名，并把页面 ID 和来源链接写到文件开头的 YAML。数据库文件夹与同级导出 CSV 对应时，会保存导出的数据库 ID。只有页面标题唯一命中 CSV 首列，且开头的整段属性文字与该行字段和值一致时，才把 CSV 列移入 YAML 并移除重复属性段落。字段以原始文本保存，可保留前导零和币种格式。页面正文、附件及 Markdown 链接继续按原路径读取。若要保留有类型的金额、计算结果及关联身份，请使用下方带来源 schema 的输入格式。

Extract Notion's Markdown & CSV export into its own vault folder. Use the folder context menu or the command for the active exported page to promote verified CSV fields to frontmatter. Existing frontmatter and files without export UUIDs are skipped. Unmatched property paragraphs remain in the body. CSV strings retain their original spelling. The schema-backed bundle below supports typed records, computed snapshots and resolved relations.

## Bundle contract / 输入格式

The caller collects schemas and rows before importing. IDs may be UUIDs, Notion page URLs or `collection://` source URLs. A complete export is not required; unresolved related records remain their original Notion URLs and appear in the report.

调用方先采集字段定义与记录。可以只导入一条业务链所需的样例；未采集的关联记录保留原 Notion 链接，并在报告中说明。

```json
{
  "snapshotAt": "2026-01-01T00:00:00Z",
  "sources": [{
    "id": "11111111-1111-4111-8111-111111111111",
    "name": "Sample ledger",
    "schema": {
      "Title": {"type": "title"},
      "Amount": {"type": "number", "number_format": "yuan"}
    },
    "displayProperties": ["Title", "Amount"],
    "rows": [{
      "url": "https://www.notion.so/22222222222242228222222222222222",
      "Title": "Fictional sample",
      "Amount": 12.34
    }]
  }],
  "pages": [{
    "id": "22222222-2222-4222-8222-222222222222",
    "title": "Fictional sample",
    "content": "Original note body."
  }],
  "computed": {},
  "assets": {}
}
```

- `schema`: the connector's `data-source-state.schema`, keyed by property name. Do not guess schema from the visible table.
- `rows`: query results with `url`; relation values may be arrays or JSON-encoded arrays. Expanded `date:<name>:start` fields are supported. Raw date ranges and rich source details remain in the original snapshot.
- `pages`: fetch results with `<content>…</content>` inside `text`, or a plain `content` string. Missing, truncated and unsupported body content is reported. Supported Notion mentions become local links; original markup is retained in the raw snapshot.
- `computed`: a formula/rollup reference maps to `{ "value": … }` only when the collector has actually resolved its result. Opaque fetch text or unresolved URIs are not interpreted as numbers. Resolved values are historical snapshots, never live accounting calculations.
- `assets`: source reference → `{ "path": "/absolute/downloaded/file.pdf", "sha256": "optional expected hash", "name": "optional readable filename.pdf" }`. Downloaded files are copied with content-addressed names. An explicit nonempty `name` adds a readable wiki-link alias in attachment properties, such as `[[Backup/Attachments/<hash>.pdf|凭证.pdf]]`; the filename on disk stays hash-based. Without `name`, existing unaliased links are unchanged. Brackets, pipes and line breaks in names are replaced with spaces, repeated whitespace is collapsed, and Unicode is retained. Notion's encoded `file://` descriptors are never treated as local disk paths.
- Optional `rootPageId`: links the entrypoint to an included original root page.

`computed` 必须传入实际取得的结果，未取得时保持空映射。脚本不会将未取得的金额视为零。附件只能使用已经下载的本地文件；未下载的 Notion 附件明确显示为缺失。

附件的可选 `name` 只改变属性中的链接显示名称，不改变哈希文件路径或正文。中文名称会保留，`[]|` 与换行会替换为空格；清理后名称为空时使用原先不带别名的链接。重复导入仍遵守哈希检查，本地手工修改不会因附件改名而被覆盖。

Undownloaded HTTPS attachments are marked unavailable when they have an `X-Amz-Signature` query value and a known Notion file host: the `prod-files-secure` / `prod-files-public` S3 buckets, `file.notion.so` / `files.notion.so`, or the legacy Notion bucket paths on S3. Their expiring URLs stay in the immutable source snapshot and import report, not in attachment properties. Ordinary external URLs—including signed URLs on other hosts—remain ordinary external links. This matching performs no network requests and does not claim that an external file was downloaded.

对于已知 Notion 文件域名且包含 `X-Amz-Signature` 的临时 HTTPS 地址，尚未下载时会在属性中显示“未下载的 Notion 附件”，原始地址保留在快照与导入报告中。普通外部链接、其他域名的签名链接仍保留为外部链接。此识别不联网，也不代表附件已经完成备份。

## Output and integrity / 输出与完整性

| Output | Purpose / 用途 |
| --- | --- |
| `Records/<source UUID>/<page UUID>.md` | Stable data records with native values and wiki links / 稳定 ID 的记录、原生属性和本地关联 |
| `Pages/<page UUID>.md` | Included standalone documents / 独立文档 |
| `Bases/<source UUID>.base` | Native table per data source / 每个数据源的原生表格 |
| `index.json` | AI lookup: source ID → path, title, URL, related IDs / AI 查找与关系索引 |
| `schema.json` | Original property types, options and formats / 原始字段定义 |
| `_source/<hash>.json` | Immutable raw bundle / 原始采集快照 |
| `import-report.json` | Current incomplete fields and conflicts / 本次缺失项与冲突 |
| `_reports/` | Earlier reports / 历史报告 |
| `manifest.json` | Generated-file hashes / 生成文件哈希 |
| `_conflicts/` | Incoming versions when local edits exist / 本地有修改时保留待比较的新版本 |

Each note includes `nf_source_id`, `nf_source_url`, `nf_source_collection` (for database records), and `nf_imported_at`. `nf_snapshot_fields` identifies computed snapshots; `nf_unavailable_fields` identifies unresolved computed results. These metadata fields do not alter the original note body. Source properties colliding with reserved metadata names are rejected instead of silently overwritten.

每条记录都包含来源 ID、来源 URL、所属数据源与采集时间。公式快照与缺失值单独标识，正文中不写入样式信息。AI 可以顺着原生 `[[链接]]` 阅读关联记录，也可以根据 `index.json` 精确定位 ID。

Reimport updates only files that still match their last generated hashes. Local edits survive, conflicting incoming versions go to `_conflicts`, and the process exits with code `2`. Records absent from a later partial sample are retained and marked `retained-from-earlier-import` in the index. The importer never deletes notes or implements two-way synchronization. An interrupted import can be retried after reviewing a leftover `.nebula-import.lock`.

重新导入只更新未被手工修改的生成文件。已有本地修改时保留它们，输出冲突副本并以退出码 `2` 提醒；后续样例未包含的旧记录不会删除。该脚本提供可追踪的导入基础，不承诺实时双向同步或完整复刻 Notion 公式引擎。

Validation: `node --test tests/notion-backup.test.cjs`. All fixtures are fictional.

## 数据库视图与 AI 记录字段

带 schema 的导入会给各数据源的原生表生成 `nebulaRecords`，其中包含创建记录的文件夹、所属数据源、字段类型与选项。公式、汇总及未支持写入的属性标为只读。关系与附件字段接受库内链接。颜色从已采集的选项定义中读取。

如已取得 Notion 连接器的数据库视图列表及对应的原生视图配置，可在同一输入 JSON 中加入 `workspaceViews`。离线导入命令会为每个数据库生成一个 `Views/<数据库 UUID>.base`，保留视图顺序，并在入口页面添加链接。下面两个 UUID 分别代表一组视图及其中一个表格视图。数据源 UUID 与前文示例相同。

```json
{
  "workspaceViews": {
    "databases": [{
      "id": "33333333-3333-4333-8333-333333333333",
      "name": "Sample views",
      "views": [{
        "id": "44444444-4444-4444-8444-444444444444",
        "type": "table",
        "name": "Amounts",
        "dataSourceUrl": "collection://11111111-1111-4111-8111-111111111111",
        "displayProperties": ["Title", "Amount"],
        "columnWidths": {"Title": 200},
        "sorts": [{"property": "Amount", "direction": "descending"}],
        "summaries": {"Amount": "Sum"}
      }]
    }],
    "nativeViews": {
      "44444444-4444-4444-8444-444444444444": {
        "configuration": {"wrap_cells": true, "frozen_column_index": 0}
      }
    }
  }
}
```

`nativeViews` 的键与每个视图的 `id` 一致。转换器识别已支持的表格筛选、排序、精确分组、可见列顺序及列宽。关系筛选引用的页面须在本次导入范围内。缺少关联目标或遇到未实现的活动筛选会终止导入。表格视图来源未提供列合计时，采集方可将已核对的合计规则写入该视图的 `summaries`。例如 `{"Amount":"Sum"}` 会在 Obsidian 表格显示当前视图或分组的金额和。固定列索引以 `nebulaNotionFrozenColumnIndex` 保存在视图配置中，0 表示第一列，-1 表示无固定列。

启用 Nebula Focus 后，横向滚动表格时，固定列会随表头、记录与合计一起停在起始侧。分栏或手机窗口过窄时，插件会减少本次可见的固定列数，为横向浏览其余属性留出至少一个最小列宽。再次展宽后会恢复原有数量。关闭插件后，Obsidian 可继续打开同一张原生表格，固定列设置仍保存在文件内。
