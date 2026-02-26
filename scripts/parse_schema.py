#!/usr/bin/env python3
"""
Parse Supabase schema JSON export and generate CREATE TABLE statements.
Reads the MCP tool result file, extracts the column definitions JSON,
groups by table, and outputs proper PostgreSQL DDL.
"""

import json
import re
import sys
from collections import OrderedDict

INPUT_FILE = r"C:\Users\Not John Or Justin\.claude-jarvis\projects\C--Users-Not-John-Or-Justin\c8d9a3e2-6507-4f82-8cf5-8351418d4e10\tool-results\mcp-supabase-execute_sql-1771741590450.txt"


def extract_columns_json(filepath: str) -> list[dict]:
    """Extract the column definitions array from the MCP tool result wrapper."""
    with open(filepath, "r", encoding="utf-8") as f:
        raw = f.read()

    # Parse outer JSON array
    outer = json.loads(raw)
    # Get the text field from the first element
    text_field = outer[0]["text"]

    # The text field is itself a JSON-encoded string (double-quoted with escaped content)
    # We need to json.loads it again to unescape the inner \" and \\n
    text_unescaped = json.loads(text_field)

    # Find the JSON array - it starts with [{ and ends with }]
    start = text_unescaped.find('[{"table_name"')
    if start == -1:
        print("ERROR: Could not find JSON array start in text", file=sys.stderr)
        sys.exit(1)

    end = text_unescaped.rfind("}]")
    if end == -1:
        print("ERROR: Could not find JSON array end in text", file=sys.stderr)
        sys.exit(1)

    json_str = text_unescaped[start : end + 2]
    columns = json.loads(json_str)
    return columns


def map_data_type(col: dict) -> str:
    """Map a column's data_type/udt_name to a proper PostgreSQL type string."""
    dt = col["data_type"]
    udt = col["udt_name"]
    max_len = col["character_maximum_length"]
    default = col["column_default"] or ""

    # ARRAY types: udt_name starts with '_', e.g. _text -> text[], _int4 -> integer[]
    if dt == "ARRAY":
        base = udt.lstrip("_")
        type_map = {
            "text": "text[]",
            "varchar": "varchar[]",
            "int4": "integer[]",
            "int8": "bigint[]",
            "float8": "double precision[]",
            "float4": "real[]",
            "bool": "boolean[]",
            "uuid": "uuid[]",
            "jsonb": "jsonb[]",
            "json": "json[]",
            "numeric": "numeric[]",
        }
        return type_map.get(base, f"{base}[]")

    # USER-DEFINED types: enums, vectors, etc.
    if dt == "USER-DEFINED":
        return udt  # e.g. app_role, vector, tsvector, etc.

    # Serial detection via nextval default
    if default.startswith("nextval("):
        if dt == "integer" or udt == "int4":
            return "serial"
        if dt == "bigint" or udt == "int8":
            return "bigserial"
        if dt == "smallint" or udt == "int2":
            return "smallserial"

    # Character types
    if dt == "character varying":
        if max_len:
            return f"varchar({max_len})"
        return "text"

    if dt == "character":
        if max_len:
            return f"char({max_len})"
        return "char(1)"

    # Timestamp types
    if dt == "timestamp with time zone":
        return "timestamptz"
    if dt == "timestamp without time zone":
        return "timestamp"

    # Other common mappings
    simple_map = {
        "text": "text",
        "integer": "integer",
        "bigint": "bigint",
        "smallint": "smallint",
        "boolean": "boolean",
        "uuid": "uuid",
        "jsonb": "jsonb",
        "json": "json",
        "numeric": "numeric",
        "real": "real",
        "double precision": "double precision",
        "date": "date",
        "time with time zone": "timetz",
        "time without time zone": "time",
        "bytea": "bytea",
        "inet": "inet",
        "cidr": "cidr",
        "macaddr": "macaddr",
        "interval": "interval",
        "money": "money",
        "xml": "xml",
        "point": "point",
        "line": "line",
        "polygon": "polygon",
        "circle": "circle",
        "box": "box",
        "path": "path",
        "bit": "bit",
        "bit varying": "varbit",
        "oid": "oid",
        "regclass": "regclass",
        "regtype": "regtype",
    }

    if dt in simple_map:
        return simple_map[dt]

    # Fallback: use data_type as-is
    return dt


def format_default(col: dict, sql_type: str) -> str:
    """Format the DEFAULT clause for a column."""
    default = col["column_default"]
    if not default:
        return ""

    # Skip nextval defaults for serial types (already encoded in the type)
    if default.startswith("nextval(") and sql_type in ("serial", "bigserial", "smallserial"):
        return ""

    # Clean up some common patterns
    # Remove type casts like ::text, ::integer etc. for cleanliness (optional)
    # But keep them for correctness
    return f" DEFAULT {default}"


def generate_create_tables(columns: list[dict]) -> str:
    """Group columns by table and generate CREATE TABLE statements."""
    # Group columns by table_name, preserving order
    tables: OrderedDict[str, list[dict]] = OrderedDict()
    for col in columns:
        tname = col["table_name"]
        if tname not in tables:
            tables[tname] = []
        tables[tname].append(col)

    output_parts = []
    output_parts.append("-- =============================================================")
    output_parts.append("-- Peptide Inventory App - Complete Schema")
    output_parts.append(f"-- Tables: {len(tables)}")
    output_parts.append(f"-- Total columns: {len(columns)}")
    output_parts.append("-- Generated by parse_schema.py")
    output_parts.append("-- =============================================================")
    output_parts.append("")

    for table_name, cols in tables.items():
        output_parts.append(f"-- Table: {table_name} ({len(cols)} columns)")
        output_parts.append(f"CREATE TABLE IF NOT EXISTS {table_name} (")

        col_lines = []
        for col in cols:
            sql_type = map_data_type(col)
            nullable = "" if col["is_nullable"] == "YES" else " NOT NULL"
            default = format_default(col, sql_type)
            col_line = f"    {col['column_name']} {sql_type}{default}{nullable}"
            col_lines.append(col_line)

        output_parts.append(",\n".join(col_lines))
        output_parts.append(");")
        output_parts.append("")

    return "\n".join(output_parts)


def main():
    columns = extract_columns_json(INPUT_FILE)
    print(f"-- Parsed {len(columns)} column definitions", file=sys.stderr)

    # Count unique tables
    table_names = sorted(set(c["table_name"] for c in columns))
    print(f"-- Found {len(table_names)} tables", file=sys.stderr)

    sql = generate_create_tables(columns)
    print(sql)


if __name__ == "__main__":
    main()
