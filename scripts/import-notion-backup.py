#!/usr/bin/env python3
"""Import a bounded, explicitly collected Notion bundle into an existing vault.

No network, credentials, accounting rules, or edits to existing note bodies.
The raw input remains available beside the generated Markdown for audit/AI use.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
from pathlib import Path, PurePosixPath
import re
import sys
import tempfile
from urllib.parse import parse_qsl, unquote, urlparse
from uuid import UUID


FORMAT_VERSION = 1
RESERVED = {"aliases", "nf_source_id", "nf_source_url", "nf_source_collection",
            "nf_imported_at", "nf_snapshot_fields", "nf_unavailable_fields"}
COMPUTED_URI = re.compile(r"^(?:formulaResult|rollupResult)://")
UUID_END = re.compile(r"([a-fA-F0-9]{32}|[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12})$")


def identifier(value):
    if not isinstance(value, str):
        raise ValueError("Every source/page requires a UUID or Notion URL")
    candidate = value.split("?", 1)[0].split("#", 1)[0].rstrip("/")
    found = UUID_END.search(candidate)
    if not found:
        raise ValueError("Invalid source/page UUID: " + value[:100])
    # Bare IDs, recognized collection URIs, and real Notion page URLs only.
    if "://" in value:
        parsed = urlparse(value)
        if parsed.scheme != "collection" and not (
                parsed.scheme == "https" and
                (parsed.hostname in ("notion.so", "www.notion.so", "app.notion.com") or
                 (parsed.hostname or "").endswith(".notion.site"))):
            raise ValueError("Expected a Notion source/page URL")
    elif found.start() != 0:
        raise ValueError("Expected a bare UUID")
    return str(UUID(found[1]))


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2, allow_nan=False) + "\n"


def scalar(value):
    # JSON strings, booleans, lists and finite numbers are valid YAML scalars.
    return json.dumps(value, ensure_ascii=False, allow_nan=False)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def split_list(value):
    if value in (None, ""):
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return parsed
        except json.JSONDecodeError:
            pass
    return [value]


def text(value):
    """Preserve flattened connector text; handle native rich-text arrays too."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return "".join(item.get("plain_text", item.get("text", {}).get("content", ""))
                       if isinstance(item, dict) else str(item) for item in value)
    return str(value)


def attachment_label(value):
    """A readable wiki-link label, never a filename or link destination."""
    if not isinstance(value, str):
        return ""
    return re.sub(r"\s+", " ", re.sub(r"[\[\]|\r\n]", " ", value)).strip()


def notion_signed_attachment(value):
    """Recognize known Notion attachment hosts, not arbitrary signed URLs."""
    if not isinstance(value, str):
        return False
    try:
        parsed = urlparse(value)
        if parsed.scheme.lower() != "https":
            return False
        if not any(key.lower() == "x-amz-signature" and signature
                   for key, signature in parse_qsl(parsed.query)):
            return False
        host = (parsed.hostname or "").lower()
        if host in ("file.notion.so", "files.notion.so"):
            return True
        if re.fullmatch(r"prod-files-(?:secure|public)\.s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com", host):
            return True
        # Older exports used the path-style URL for Notion's S3 bucket.
        return bool(re.fullmatch(r"s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com", host) and
                    parsed.path.startswith(("/secure.notion-static.com/", "/prod-files-secure/", "/prod-files-public/")))
    except ValueError:
        return False


def title_key(schema):
    return next((key for key, prop in schema.items() if prop.get("type") == "title"), None)


def safe_target(root, relative):
    path = PurePosixPath(relative)
    if path.is_absolute() or not path.parts or any(part in ("", ".", "..") for part in path.parts):
        raise ValueError("Unsafe output path")
    result = root.joinpath(*path.parts)
    cursor = root
    for part in path.parts:
        cursor = cursor / part
        if cursor.is_symlink():
            raise ValueError("Refusing a symlinked output path: " + str(cursor))
    if result.exists() and not result.is_file():
        raise ValueError("Expected a regular output file: " + str(result))
    return result


def atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".nebula-import-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


class Importer:
    def __init__(self, bundle, vault, folder):
        self.bundle = bundle
        self.vault = vault
        self.folder = folder
        self.root = vault / folder
        self.records = {}
        self.sources = {}
        self.files = {}
        self.report = {"formatVersion": FORMAT_VERSION, "snapshotAt": bundle["snapshotAt"],
                       "issues": [], "conflicts": [], "written": 0, "unchanged": 0}
        self.assets = {}
        self.asset_names = {}

    def issue(self, kind, page_id=None, field=None, detail=None):
        item = {"kind": kind}
        for key, value in (("pageId", page_id), ("field", field), ("detail", detail)):
            if value is not None:
                item[key] = value
        self.report["issues"].append(item)

    def add(self, relative, data):
        safe_target(self.root, relative)
        self.files[relative] = data if isinstance(data, bytes) else data.encode("utf-8")

    def note_path(self, page_id, source_id):
        return (f"Records/{source_id}/{page_id}.md" if source_id else f"Pages/{page_id}.md")

    def index_record(self, page_id, title, url, source_id=None):
        prior = self.records.get(page_id)
        if prior and prior["sourceId"] != source_id:
            raise ValueError("Page appears in more than one source: " + page_id)
        self.records[page_id] = {"path": f"{self.folder}/{self.note_path(page_id, source_id)}",
                                 "title": title or page_id, "url": url, "sourceId": source_id,
                                 "relations": {}}

    def link(self, url, page_id=None, field=None):
        try:
            target_id = identifier(url)
        except ValueError:
            self.issue("unsupported-relation", page_id, field, url)
            return url
        target = self.records.get(target_id)
        if not target:
            self.issue("unresolved-relation", page_id, field, url)
            return url
        label = re.sub(r"[\[\]|\r\n]", " ", target["title"])
        return "[[" + target["path"][:-3] + "|" + label + "]]"

    def prepare_assets(self):
        for reference, asset in self.bundle.get("assets", {}).items():
            if not isinstance(asset, dict) or not asset.get("path"):
                self.issue("missing-attachment", detail=reference)
                continue
            path = Path(asset["path"])
            if not path.is_absolute() or path.is_symlink() or not path.is_file():
                raise ValueError("Attachment must be a local regular file: " + str(path))
            content = path.read_bytes()
            sha = digest(content)
            if asset.get("sha256") and asset["sha256"] != sha:
                raise ValueError("Attachment hash mismatch: " + str(path))
            suffix = path.suffix.lower()
            if not re.fullmatch(r"\.[a-z0-9]{1,10}", suffix):
                suffix = ".bin"
            output = f"Attachments/{sha}{suffix}"
            self.add(output, content)
            self.assets[reference] = f"{self.folder}/{output}"
            self.asset_names[reference] = attachment_label(asset.get("name"))

    def asset_value(self, value, page_id, field):
        def replace(item):
            if isinstance(item, dict):
                ref = item.get("url") or item.get("file", {}).get("url") or item.get("external", {}).get("url")
                if ref:
                    return replace(ref)
                self.issue("unsupported-attachment", page_id, field, item)
                return canonical(item).strip()
            if item in self.assets:
                label = self.asset_names.get(item)
                return "[[" + self.assets[item] + ("|" + label if label else "") + "]]"
            self.issue("external-or-missing-attachment", page_id, field, item)
            # The connector may encode a Notion file descriptor as file://
            # followed by JSON. It is not a local path and must not become a
            # misleading clickable filesystem link in the imported note.
            # Known Notion signed URLs also expire; retain them in the source
            # snapshot/report instead of presenting an undownloaded backup.
            if (isinstance(item, str) and item.startswith(("file://", "notion-file-block://"))) or notion_signed_attachment(item):
                return "未下载的 Notion 附件（原始引用保存在快照中）"
            return item
        return [replace(item) for item in split_list(value)]

    def computed_value(self, value):
        if not isinstance(value, str) or not COMPUTED_URI.match(value):
            return True, value
        resolved = self.bundle.get("computed", {}).get(value)
        # A collector must explicitly record value (including null), never an
        # opaque fetch text which might be an error or formula source code.
        if isinstance(resolved, dict) and "value" in resolved and not resolved.get("error"):
            return True, resolved["value"]
        return False, None

    def properties(self, page_id, row, source):
        props = {}
        snapshots, unavailable = [], []
        schema = source["schema"] if source else {}
        if RESERVED.intersection(schema):
            raise ValueError("Source property collides with backup metadata: " +
                             ", ".join(sorted(RESERVED.intersection(schema))))
        for name, spec in schema.items():
            kind = spec.get("type", "text")
            value = row.get(name)
            if kind == "date":
                value = row.get("date:" + name + ":start", value)
                if isinstance(value, dict):
                    value = value.get("start")
            if kind in ("formula", "rollup"):
                if value is None:
                    self.issue("missing-computed-value", page_id, name)
                    unavailable.append(name)
                    continue
                valid, value = self.computed_value(value)
                if not valid:
                    self.issue("missing-computed-value", page_id, name, row.get(name))
                    unavailable.append(name)
                    continue
                snapshots.append(name)
            elif kind == "relation":
                values = split_list(value)
                ids = []
                for item in values:
                    try:
                        ids.append(identifier(item))
                    except ValueError:
                        pass
                self.records[page_id]["relations"][name] = ids
                value = [self.link(item, page_id, name) for item in values]
            elif kind in ("file", "files"):
                value = self.asset_value(value, page_id, name)
            elif kind in ("multi_select", "multi-select"):
                value = [item.get("name", "") if isinstance(item, dict) else item for item in split_list(value)]
            elif kind in ("select", "status") and isinstance(value, dict):
                value = value.get("name")
            elif kind == "checkbox":
                if value in ("__YES__", True, 1):
                    value = True
                elif value in ("__NO__", False, 0, None, ""):
                    value = False
                else:
                    raise ValueError("Invalid checkbox value")
            elif kind == "number" and value is not None:
                if isinstance(value, bool) or not isinstance(value, (int, float)):
                    raise ValueError("A numeric source field is not a number: " + name)
            elif kind in ("title", "text", "rich_text"):
                value = text(value)
            if value is not None:
                props[name] = value
        # Values absent from the supplied schema stay in the raw snapshot. A
        # report entry makes a truncated schema visible instead of guessing.
        known = set(schema) | {"url", "createdTime", "id"}
        unknown = [key for key in row if key not in known and not key.startswith("date:")]
        if unknown:
            self.issue("properties-outside-schema", page_id, detail=unknown)
        record = self.records[page_id]
        props.update({"aliases": [record["title"]], "nf_source_id": page_id,
                      "nf_source_url": record["url"], "nf_imported_at": self.bundle["snapshotAt"]})
        if record["sourceId"]:
            props["nf_source_collection"] = record["sourceId"]
        if snapshots:
            props["nf_snapshot_fields"] = snapshots
        if unavailable:
            props["nf_unavailable_fields"] = unavailable
        return props

    def body(self, page_id, page):
        if not page:
            self.issue("missing-page-body", page_id)
            return ""
        raw = page.get("text", "")
        content = re.search(r"<content>\s*([\s\S]*?)\s*</content>", raw)
        if content:
            body = content[1]
        elif page.get("content") is not None:
            body = page["content"]
        else:
            self.issue("missing-page-body", page_id)
            return ""
        for key in ("truncated", "unknown_block_count", "unknown_block_ids"):
            value = page.get(key, page.get("metadata", {}).get(key))
            if value:
                self.issue("incomplete-page-" + key, page_id, detail=value)

        def mention(match):
            url = html.unescape(match[1])
            return self.link(url, page_id, "body")
        body = re.sub(r'<mention\b[^>]*?url="([^"]+)"[^>]*?(?:/>|>\s*</mention>)', mention, body)
        body = re.sub(r'<date\s+start="([^"]+)"(?:\s+end="([^"]+)")?\s*/>',
                      lambda m: m[1] + (" → " + m[2] if m[2] else ""), body)
        body = re.sub(r"<empty-block\s*/>", "", body)
        for reference, target in self.assets.items():
            body = body.replace(reference, target)
        unresolved_assets = set(re.findall(r"notion-file-block://[^\s\"<>\)]+", body))
        for reference in sorted(unresolved_assets):
            self.issue("missing-body-attachment", page_id, detail=reference)
        tags = sorted(set(re.findall(r"</?([a-z][\w-]*)\b", body)))
        if tags:
            self.issue("source-markup-preserved", page_id, detail=tags)
        return body

    def base(self, source):
        key = title_key(source["schema"])
        formula = "file.asLink(" + ("note[" + scalar(key) + "]" if key else "file.name") + ")"
        fields = ["formula.记录"]
        # Source display order can be passed by the collector. Keep most useful
        # primitive values first, links next, and computed snapshots last.
        order = source.get("displayProperties") or list(source["schema"])
        fields += ["note." + name for name in order if name in source["schema"] and name != key]
        fields += ["note." + name for name in source["schema"] if name != key and "note." + name not in fields]
        return {"filters": {"and": ["file.inFolder(" + scalar(f"{self.folder}/Records/{source['id']}") + ")",
                                      'file.ext == "md"']},
                "formulas": {"记录": formula},
                "properties": {"formula.记录": {"displayName": key or "记录"}},
                "views": [{"type": "table", "name": source["name"], "order": fields,
                           "columnSize": {"formula.记录": 340}}]}

    def prepare(self):
        canonical(self.bundle)  # Reject non-finite numbers before any writes.
        for item in self.bundle.get("sources", []):
            source = dict(item)
            source["id"] = identifier(source.get("id") or source.get("url"))
            if source["id"] in self.sources:
                raise ValueError("Duplicate data source ID")
            if not isinstance(source.get("schema"), dict) or not isinstance(source.get("rows"), list):
                raise ValueError("Each source needs schema and rows")
            source.setdefault("name", source["id"])
            self.sources[source["id"]] = source
            key = title_key(source["schema"])
            for row in source["rows"]:
                page_id = identifier(row.get("url") or row.get("id"))
                if page_id in self.records:
                    raise ValueError("Duplicate record ID")
                self.index_record(page_id, text(row.get(key)), row.get("url") or
                                  "https://www.notion.so/" + page_id.replace("-", ""), source["id"])
        pages = {}
        for page in self.bundle.get("pages", []):
            page_id = identifier(page.get("id") or page.get("url"))
            if page_id in pages:
                raise ValueError("Duplicate page body ID")
            pages[page_id] = page
            if page_id not in self.records:
                self.index_record(page_id, text(page.get("title")), page.get("url") or
                                  "https://www.notion.so/" + page_id.replace("-", ""))
        self.prepare_assets()
        rows = {identifier(row.get("url") or row.get("id")): (row, source)
                for source in self.sources.values() for row in source["rows"]}
        for page_id, record in self.records.items():
            row, source = rows.get(page_id, ({}, None))
            props = self.properties(page_id, row, source)
            body = self.body(page_id, pages.get(page_id))
            note = "---\n" + "\n".join(scalar(key) + ": " + scalar(value) for key, value in props.items()) + "\n---\n\n"
            note += body.rstrip() + ("\n" if body else "")
            self.add(self.note_path(page_id, record["sourceId"]), note)
        for source in self.sources.values():
            # JSON is YAML 1.2, supported by native Bases without extra packages.
            self.add(f"Bases/{source['id']}.base", canonical(self.base(source)))
        self.add("schema.json", canonical({"formatVersion": FORMAT_VERSION, "sources": {
            key: {"name": source["name"], "schema": source["schema"]} for key, source in self.sources.items()}}))
        raw = canonical(self.bundle)
        snapshot_hash = digest(raw.encode("utf-8"))
        self.add(f"_source/{snapshot_hash}.json", raw)
        self.report["sourceSnapshot"] = f"_source/{snapshot_hash}.json"
        self.report["recordCount"] = len(self.records)
        self.report["sourceCount"] = len(self.sources)
        self.add("index.json", canonical({"formatVersion": FORMAT_VERSION, "snapshotAt": self.bundle["snapshotAt"],
                                          "records": self.records}))
        lines = ["# Notion 关联数据备份", "", f"采集时间：{self.bundle['snapshotAt']}", "",
                 "这是本次明确采集的记录快照，并不声明覆盖整个 Notion 工作区。",
                 "金额保留原始数值，关联记录使用本地链接。原文与属性原始结果保留在 `_source`，AI 可通过 `index.json` 的稳定 ID 查找记录。",
                 "公式和汇总只保留采集到的结果；`nf_snapshot_fields` 标记快照字段，`nf_unavailable_fields` 标记未取得结果的字段。不会在本地猜算分配、税费或其他财务规则。",
                 "", "## 数据表", ""]
        for source in self.sources.values():
            lines.append(f"- [[{self.folder}/Bases/{source['id']}.base|{source['name']}]]（{len(source['rows'])} 条）")
        root_id = self.bundle.get("rootPageId")
        if root_id and identifier(root_id) in self.records:
            lines += ["", "原始入口：" + self.link(self.records[identifier(root_id)]["url"])]
        lines += ["", "## 完整性说明", "", f"本次有 {len(self.report['issues'])} 个需要查看的保留或缺失项，详情见 `import-report.json`。",
                  "重新导入时会保留手动修改的文件，并将冲突的新版本放入 `_conflicts`；本工具不会删除旧记录。", ""]
        self.add("Notion 关联数据备份.md", "\n".join(lines))

    def run(self):
        self.prepare()
        self.root.mkdir(parents=True, exist_ok=True)
        lock = self.root / ".nebula-import.lock"
        try:
            fd = os.open(lock, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            raise ValueError("Another import is running (or a stale .nebula-import.lock needs review)")
        os.close(fd)
        try:
            manifest_path = safe_target(self.root, "manifest.json")
            prior = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
            if prior and prior.get("formatVersion") != FORMAT_VERSION:
                raise ValueError("Unsupported previous manifest version")
            hashes = dict(prior.get("files", {}))
            # Keep old records discoverable after importing a smaller sample.
            # A local edit is explicit in the index, never silently described
            # as if the current file matched the incoming source snapshot.
            indexed = {key: dict(value, snapshotStatus="current") for key, value in self.records.items()}
            previous_index = safe_target(self.root, "index.json")
            if previous_index.exists() and digest(previous_index.read_bytes()) == hashes.get("index.json"):
                for key, value in json.loads(previous_index.read_text())["records"].items():
                    if key not in indexed:
                        indexed[key] = dict(value, snapshotStatus="retained-from-earlier-import")
            for page_id, record in indexed.items():
                if page_id not in self.records:
                    continue
                relative = self.note_path(page_id, record["sourceId"])
                target = safe_target(self.root, relative)
                if target.exists() and digest(target.read_bytes()) not in (
                        hashes.get(relative), digest(self.files[relative])):
                    record["snapshotStatus"] = "local-edits-preserved"
            self.files["index.json"] = canonical({"formatVersion": FORMAT_VERSION,
                "snapshotAt": self.bundle["snapshotAt"], "records": indexed}).encode("utf-8")
            for relative, data in self.files.items():
                target = safe_target(self.root, relative)
                incoming_hash = digest(data)
                current = target.read_bytes() if target.exists() else None
                if current is not None and digest(current) == incoming_hash:
                    hashes[relative] = incoming_hash
                    self.report["unchanged"] += 1
                    continue
                if current is not None and digest(current) != hashes.get(relative):
                    conflict = f"_conflicts/{incoming_hash}/{relative}"
                    atomic_write(safe_target(self.root, conflict), data)
                    self.report["conflicts"].append({"path": relative, "incoming": conflict})
                    continue
                atomic_write(target, data)
                hashes[relative] = incoming_hash
                self.report["written"] += 1
            # This append-only machine report is not a user-authored note.
            report_name = "_reports/" + digest(canonical(self.report).encode("utf-8")) + ".json"
            atomic_write(safe_target(self.root, report_name), canonical(self.report).encode("utf-8"))
            atomic_write(safe_target(self.root, "import-report.json"), canonical(self.report).encode("utf-8"))
            atomic_write(manifest_path, canonical({"formatVersion": FORMAT_VERSION,
                         "snapshotAt": self.bundle["snapshotAt"], "files": hashes}).encode("utf-8"))
        finally:
            lock.unlink(missing_ok=True)
        return self.report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bundle", required=True, type=Path)
    parser.add_argument("--vault", required=True, type=Path)
    parser.add_argument("--folder", default="Notion 关联数据备份")
    args = parser.parse_args()
    try:
        if not args.vault.is_dir() or args.vault.is_symlink():
            raise ValueError("--vault must be an existing real directory")
        if not args.folder or any(c in args.folder for c in ("\\", "\x00", "\n", "\r", "|", "[", "]")):
            raise ValueError("Unsafe vault folder name")
        pieces = args.folder.split("/")
        if any(part in ("", ".", "..") for part in pieces) or args.folder.startswith("/"):
            raise ValueError("--folder must be a relative vault path")
        # Validate every ancestor before creating a new directory.
        safe_target(args.vault, args.folder + "/manifest.json")
        bundle = json.loads(args.bundle.read_text(encoding="utf-8"))
        if not isinstance(bundle.get("snapshotAt"), str) or not bundle["snapshotAt"]:
            raise ValueError("Bundle requires snapshotAt")
        report = Importer(bundle, args.vault.resolve(), args.folder).run()
        print(canonical({key: report[key] for key in ("recordCount", "sourceCount", "written", "unchanged")}), end="")
        print(f"Issues: {len(report['issues'])}; conflicts: {len(report['conflicts'])}")
        return 2 if report["conflicts"] else 0
    except (ValueError, OSError, TypeError, KeyError) as error:
        print("Import failed: " + str(error), file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
