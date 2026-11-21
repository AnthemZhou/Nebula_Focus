"""Translate captured Notion table views and schemas into native Obsidian Bases."""
import json


def quote(value):
    return json.dumps(value, ensure_ascii=False)


FIELD_TYPES = {
    "title": "text", "rich_text": "text", "text": "text", "url": "text",
    "email": "text", "phone_number": "text", "number": "number", "checkbox": "checkbox",
    "date": "date", "select": "select", "status": "select", "multi_select": "multi-select",
    "relation": "relation", "file": "attachment", "files": "attachment",
}
DIRECTIONS = {"ascending": "ASC", "descending": "DESC"}


def record_metadata(schema, folder, source_id):
    """Build nebulaRecords for a source's property map and normalized source UUID."""
    fields = {}
    for name, definition in schema.items():
        kind = definition.get("type", "").replace("-", "_")
        if kind not in FIELD_TYPES:
            # Includes formula/rollup results and system-managed values.
            # Leave the presentation type open for inference from their snapshots.
            fields[name] = {"readOnly": True}
            continue
        field = {"type": FIELD_TYPES[kind]}
        if field["type"] in ("select", "multi-select"):
            options = definition.get(kind, {}).get("options", definition.get("options", []))
            field["options"] = [option["name"] if isinstance(option, dict) else option for option in options]
            colors = {option["name"]: option["color"] for option in options
                      if isinstance(option, dict) and isinstance(option.get("color"), str) and option["color"]}
            if colors:
                field["optionColors"] = colors
        fields[name] = field
    return {"folder": folder + "/Records/" + source_id, "defaults": {"nf_source_collection": source_id},
            "fields": fields}


def active_quick_filter(rule):
    if rule.get("type") == "group":
        return any(active_quick_filter(child) for child in rule["filters"])
    if "resultFilter" in rule:
        return active_quick_filter(rule["resultFilter"])
    return (rule["operator"] in ("is_empty", "is_not_empty") or
            rule.get("value", {}).get("value") is not None)


def table_filter(rule, local_id, record_path):
    if rule.get("type") == "group":
        operator = rule["operator"]
        if operator not in ("and", "or"):
            raise ValueError(f"Unsupported Notion filter group {operator}")
        return {operator: [table_filter(child, local_id, record_path) for child in rule["filters"]]}
    field = "note[" + quote(rule["property"]) + "]"
    op = rule["operator"]
    if op == "every" and rule.get("propertyType") == "formula":
        return table_filter(rule["resultFilter"], local_id, record_path)
    if op in ("is_empty", "is_not_empty"):
        return ("!" if op == "is_not_empty" else "") + field + ".isEmpty()"
    value = rule.get("value", {}).get("value")
    if value is None:
        raise ValueError(f"Missing active filter value for {op}")
    if op in ("enum_is", "string_is", "enum_is_not"):
        return field + (" != " if op == "enum_is_not" else " == ") + quote(value)
    if op == "string_contains":
        return field + " && " + field + ".contains(" + quote(value) + ")"
    if op == "relation_contains":
        path = record_path[local_id(value)].removesuffix(".md")
        return "list(" + field + ").contains(link(" + quote(path) + "))"
    raise ValueError(f"Unsupported Notion filter {op}")


def make_base(views, schemas, folder, local_id, record_path, native_views):
    """Compile one database's ordered view list. record_path values are vault-relative."""
    base = {"filters": {"and": ['file.ext == "md"', "file.inFolder(" + quote(folder + "/Records") + ")"]},
            "formulas": {}, "properties": {}, "views": []}
    for view in views:
        if view["type"] != "table":
            raise ValueError(f"Unsupported Notion view type {view['type']}")
        sid = local_id(view["dataSourceUrl"].strip("{}"))
        schema = schemas[sid]["properties"]
        titles = [key for key, definition in schema.items() if definition["type"] == "title"]
        if len(titles) != 1:
            raise ValueError("Table source requires one title property")
        title = titles[0]
        formula = "Nebula标题_" + title
        col = "formula." + formula
        base["formulas"][formula] = "file.asLink(note[" + quote(title) + "])"
        base["properties"][col] = {"displayName": title}
        fields = view.get("displayProperties") or list(schema)

        def prop(name):
            if name not in schema:
                raise ValueError("Unknown Notion view property: " + name)
            return col if name == title else "note." + name

        filters = ["note.nf_source_collection == " + quote(sid)]
        active = [view["advancedFilter"]] if view.get("advancedFilter") else []
        active.extend(q["filter"] for q in view.get("simpleFilters", []) if active_quick_filter(q["filter"]))
        filters.extend(table_filter(rule, local_id, record_path) for rule in active)
        records = record_metadata(schema, folder, sid)
        tags = {name: ("multi" if field["type"] == "multi-select" else "single")
                for name, field in records["fields"].items() if field.get("type") in ("multi-select", "select")}
        config = native_views[view["id"]]["configuration"]
        local = {"type": "table", "name": view["name"], "filters": {"and": filters},
                 "order": [prop(n) for n in fields], "titleProperty": "note." + title,
                 "columnSize": {prop(n): w for n, w in view.get("columnWidths", {}).items()},
                 "nebulaTable": {"titleProperty": title, "titleColumn": col, "tags": tags,
                                 "wrap": config.get("wrap_cells", True),
                                 "attachments": [n for n, f in records["fields"].items()
                                                 if f.get("type") == "attachment"]},
                 "nebulaRecords": records}
        if view.get("sorts"):
            local["sort"] = [{"property": prop(s["property"]), "direction": DIRECTIONS[s["direction"]]}
                             for s in view["sorts"]]
        group = config.get("group_by")
        if group:
            mode = group["group_by"]
            if mode.get("group_by", "exact") != "exact":
                raise ValueError("Unsupported Notion grouping mode: " + str(mode.get("group_by")))
            local["groupBy"] = {"property": prop(group["property_name"]), "direction": DIRECTIONS[mode["sort"]["type"]]}
        if "frozen_column_index" in config:
            # The native table has no frozen-column setting; retain the source index exactly.
            local["nebulaNotionFrozenColumnIndex"] = config["frozen_column_index"]
        if view.get("summaries"):
            local["summaries"] = {prop(n): fn for n, fn in view["summaries"].items()}
        base["views"].append(local)
    return base
