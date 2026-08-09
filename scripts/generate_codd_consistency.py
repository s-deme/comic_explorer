#!/usr/bin/env python3
"""Generate the checked, deterministic Phase 6 consistency snapshot.

The producer deliberately knows about one documented ``depends_on`` edge.  It
does not scan arbitrary numbers from either document: each parser is scoped to
the named historical section or aggregation table and rejects ambiguity.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import tempfile
from pathlib import Path
from typing import Any, Iterable, Mapping


FEATURE_STATUS_PATH = "docs/product/feature-status.md"
PHASE6_RESULTS_PATH = "docs/testing/phase6-case-results.md"
FROM_NODE = FEATURE_STATUS_PATH
TO_NODE = PHASE6_RESULTS_PATH
EDGE_KIND = "depends_on"
VALUE_TYPE = "phase6_snapshot_count"
OUTPUT_PATH = ".codd/propagation_results.json"
PRODUCER_PATH = "scripts/generate_codd_consistency.py"
SCHEMA_VERSION = 1

FEATURE_SECTION = "Phase 6の歴史スナップショット"
PHASE6_SECTION = "集計"
LABELS = ("PASS", "FAIL", "BLOCKED", "NOT RUN", "total")


class ProducerError(ValueError):
    """Raised when an input, path, edge, or output fails closed validation."""


def resolve_under_root(project_root: Path | str, candidate: Path | str) -> Path:
    """Resolve *candidate* and reject paths outside the project root.

    ``Path.resolve`` also follows symlinks, so a source or output symlink that
    escapes the root is rejected before it can be read or replaced.
    """

    root = Path(project_root).expanduser().resolve()
    if not root.is_dir():
        raise ProducerError(f"project root is not a directory: {root}")

    path = Path(candidate).expanduser()
    resolved = (path if path.is_absolute() else root / path).resolve()
    try:
        resolved.relative_to(root)
    except ValueError as exc:
        raise ProducerError(f"path escapes project root: {candidate}") from exc
    return resolved


def _read_source(project_root: Path, relative_path: str) -> tuple[Path, bytes, str]:
    path = resolve_under_root(project_root, relative_path)
    if path.is_symlink():
        raise ProducerError(f"source path must not be a symlink: {relative_path}")
    try:
        raw = path.read_bytes()
    except OSError as exc:
        raise ProducerError(f"cannot read source {relative_path}: {exc}") from exc
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ProducerError(f"source is not UTF-8: {relative_path}") from exc
    return path, raw, text


def _section_body(text: str, heading: str, source_name: str) -> str:
    # Windows-native reads preserve CRLF line endings. Normalize them before
    # applying line-anchored section matching so the producer has identical
    # semantics on Windows, WSL, and Linux.
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    heading_pattern = re.compile(rf"(?m)^##[ \t]+{re.escape(heading)}[ \t]*$")
    matches = list(heading_pattern.finditer(text))
    if len(matches) != 1:
        raise ProducerError(
            f"{source_name}: expected exactly one section {heading!r}, found {len(matches)}"
        )

    start = matches[0].end()
    next_heading = re.search(r"(?m)^##[ \t]+", text[start:])
    end = start + next_heading.start() if next_heading else len(text)
    return text[start:end]


def _parse_nonnegative_integer(raw: str, label: str, source_name: str) -> int:
    value = raw.strip()
    if value.startswith("**") and value.endswith("**"):
        value = value[2:-2].strip()
    if not re.fullmatch(r"[0-9]+", value):
        raise ProducerError(
            f"{source_name}: {label!r} must be a non-negative base-10 integer"
        )
    return int(value)


def _validate_counts(
    counts: Mapping[str, int], source_name: str
) -> dict[str, str]:
    missing = [label for label in LABELS if label not in counts]
    extra = [label for label in counts if label not in LABELS]
    if missing or extra:
        detail = []
        if missing:
            detail.append(f"missing labels: {', '.join(missing)}")
        if extra:
            detail.append(f"unexpected labels: {', '.join(extra)}")
        raise ProducerError(f"{source_name}: {'; '.join(detail)}")

    subtotal = sum(counts[label] for label in LABELS if label != "total")
    if subtotal != counts["total"]:
        raise ProducerError(
            f"{source_name}: component sum does not equal total"
        )
    return {label: str(counts[label]) for label in LABELS}


def _extract_inline_counts(section: str, source_name: str) -> dict[str, str]:
    """Extract exactly one backtick-wrapped ``label: integer`` per label."""

    counts: dict[str, int] = {}
    for match in re.finditer(r"`([^`\n]*)`", section):
        token = match.group(1)
        label_match = re.fullmatch(
            r"(PASS|FAIL|BLOCKED|NOT RUN|total)[ \t]*:[ \t]*(.*)", token
        )
        if label_match is None:
            continue
        label, raw_value = label_match.groups()
        if label in counts:
            raise ProducerError(f"{source_name}: duplicate label {label!r}")
        counts[label] = _parse_nonnegative_integer(raw_value, label, source_name)

    return _validate_counts(counts, source_name)


def extract_feature_status_counts(text: str) -> dict[str, str]:
    """Extract the five values from the feature-status history section."""

    section = _section_body(text, FEATURE_SECTION, FEATURE_STATUS_PATH)
    return _extract_inline_counts(section, FEATURE_STATUS_PATH)


def _table_cells(line: str) -> list[str] | None:
    stripped = line.strip()
    if not stripped.startswith("|"):
        return None
    stripped = stripped[1:]
    if stripped.endswith("|"):
        stripped = stripped[:-1]
    return [cell.strip() for cell in stripped.split("|")]


def _is_separator(cells: Iterable[str]) -> bool:
    return all(bool(re.fullmatch(r":?-{3,}:?", cell.replace(" ", ""))) for cell in cells)


def _normalize_table_label(label: str, source_name: str) -> str:
    normalized = label.strip()
    if normalized.startswith("**") and normalized.endswith("**"):
        normalized = normalized[2:-2].strip()
    if normalized in {"PASS", "FAIL", "BLOCKED", "NOT RUN"}:
        return normalized
    if normalized == "合計":
        return "total"
    raise ProducerError(f"{source_name}: unexpected summary-table label {label!r}")


def extract_phase6_counts(text: str) -> dict[str, str]:
    """Extract the five values from the table directly under ``## 集計``."""

    section = _section_body(text, PHASE6_SECTION, PHASE6_RESULTS_PATH)
    lines = section.splitlines()
    header_indexes = [
        index
        for index, line in enumerate(lines)
        if _table_cells(line) == ["結果", "件数"]
    ]
    if len(header_indexes) != 1:
        raise ProducerError(
            f"{PHASE6_RESULTS_PATH}: expected exactly one summary table header, "
            f"found {len(header_indexes)}"
        )

    header_index = header_indexes[0]
    if any(line.strip() for line in lines[:header_index]):
        raise ProducerError(
            f"{PHASE6_RESULTS_PATH}: summary table is not directly under the section"
        )
    if header_index + 1 >= len(lines):
        raise ProducerError(f"{PHASE6_RESULTS_PATH}: summary table separator is missing")

    separator = _table_cells(lines[header_index + 1])
    if separator != ["---", "---:"] and not (
        separator is not None and len(separator) == 2 and _is_separator(separator)
    ):
        raise ProducerError(f"{PHASE6_RESULTS_PATH}: invalid summary table separator")

    rows: list[list[str]] = []
    index = header_index + 2
    while index < len(lines):
        if not lines[index].strip():
            break
        cells = _table_cells(lines[index])
        if cells is None:
            break
        if len(cells) != 2:
            raise ProducerError(f"{PHASE6_RESULTS_PATH}: summary row must have two cells")
        rows.append(cells)
        index += 1

    if not rows:
        raise ProducerError(f"{PHASE6_RESULTS_PATH}: summary table has no data rows")
    if any(_table_cells(line) is not None for line in lines[index:] if line.strip()):
        raise ProducerError(
            f"{PHASE6_RESULTS_PATH}: more than one table appears in the summary section"
        )

    counts: dict[str, int] = {}
    for label_cell, value_cell in rows:
        label = _normalize_table_label(label_cell, PHASE6_RESULTS_PATH)
        if label in counts:
            raise ProducerError(f"{PHASE6_RESULTS_PATH}: duplicate label {label!r}")
        counts[label] = _parse_nonnegative_integer(
            value_cell, label, PHASE6_RESULTS_PATH
        )
    return _validate_counts(counts, PHASE6_RESULTS_PATH)


def _edge_in_json(payload: Any, from_node: str, to_node: str) -> bool:
    if not isinstance(payload, dict) or not isinstance(payload.get("edges"), list):
        return False
    for edge in payload["edges"]:
        if not isinstance(edge, dict):
            continue
        if (
            edge.get("from_id") == from_node
            and edge.get("to_id") == to_node
            and edge.get("kind") == EDGE_KIND
        ):
            return True
    return False


def _edge_in_dag(dag: Any, from_node: str, to_node: str) -> bool:
    for edge in getattr(dag, "edges", ()):
        if (
            str(getattr(edge, "from_id", "")) == from_node
            and str(getattr(edge, "to_id", "")) == to_node
            and str(getattr(edge, "kind", "")) == EDGE_KIND
        ):
            return True
    return False


def _fresh_edge_exists(project_root: Path) -> bool:
    try:
        from codd.dag.builder import build_dag
    except ImportError:
        return False
    try:
        dag = build_dag(project_root)
    except Exception:
        return False
    return _edge_in_dag(dag, FROM_NODE, TO_NODE)


def ensure_depends_on_edge(project_root: Path) -> None:
    """Require the documented edge in cached or freshly built DAG data."""

    dag_path = resolve_under_root(project_root, ".codd/dag.json")
    if dag_path.is_file() and not dag_path.is_symlink():
        try:
            cached = json.loads(dag_path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError):
            cached = None
        if _edge_in_json(cached, FROM_NODE, TO_NODE):
            return

    if _fresh_edge_exists(project_root):
        return
    raise ProducerError(
        f"missing real {EDGE_KIND} edge: {FROM_NODE} -> {TO_NODE}"
    )


def _canonical_json_bytes(payload: Mapping[str, Any]) -> bytes:
    rendered = json.dumps(
        payload,
        ensure_ascii=False,
        indent=2,
        sort_keys=True,
    )
    return (rendered + "\n").encode("utf-8")


def build_payload(project_root: Path | str) -> dict[str, Any]:
    root = Path(project_root).expanduser().resolve()
    feature_raw, feature_text = _read_source(root, FEATURE_STATUS_PATH)[1:]
    phase_raw, phase_text = _read_source(root, PHASE6_RESULTS_PATH)[1:]
    feature_counts = extract_feature_status_counts(feature_text)
    phase_counts = extract_phase6_counts(phase_text)
    ensure_depends_on_edge(root)

    records = [
        {
            "from_node": FROM_NODE,
            "to_node": TO_NODE,
            "edge_kind": EDGE_KIND,
            "value_type": VALUE_TYPE,
            "name": output_name,
            "from_value": feature_counts[source_label],
            "to_value": phase_counts[source_label],
        }
        for source_label, output_name in (
            ("PASS", "PASS"),
            ("FAIL", "FAIL"),
            ("BLOCKED", "BLOCKED"),
            ("NOT RUN", "NOT_RUN"),
            ("total", "total"),
        )
    ]

    metadata = {
        "producer": PRODUCER_PATH,
        "sources": [
            {"path": FEATURE_STATUS_PATH, "sha256": hashlib.sha256(feature_raw).hexdigest()},
            {"path": PHASE6_RESULTS_PATH, "sha256": hashlib.sha256(phase_raw).hexdigest()},
        ],
    }

    # ``records`` is the public producer schema.  The installed CoDD checker
    # consumes comparison records from its legacy ``comparisons`` key; keeping
    # this exact generated list there makes the raw checker result non-vacuous
    # without hard-coding project values or adding a second source of truth.
    return {
        "comparisons": records,
        "metadata": metadata,
        "records": records,
        "schema_version": SCHEMA_VERSION,
    }


def _atomic_write(path: Path, data: bytes) -> None:
    if path.exists() and path.is_symlink():
        raise ProducerError(f"output path must not be a symlink: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path: Path | None = None
    try:
        descriptor, temporary_name = tempfile.mkstemp(
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".tmp",
        )
        temporary_path = Path(temporary_name)
        with os.fdopen(descriptor, "wb") as temporary:
            temporary.write(data)
            temporary.flush()
            os.fsync(temporary.fileno())
        os.replace(temporary_path, path)
        temporary_path = None
    except OSError as exc:
        raise ProducerError(f"atomic output write failed: {path}: {exc}") from exc
    finally:
        if temporary_path is not None:
            try:
                temporary_path.unlink()
            except FileNotFoundError:
                pass


def generate(project_root: Path | str, output: Path | str = OUTPUT_PATH) -> Path:
    root = Path(project_root).expanduser().resolve()
    output_path = resolve_under_root(root, output)
    payload = build_payload(root)
    _atomic_write(output_path, _canonical_json_bytes(payload))
    return output_path


def _validate_payload_shape(payload: Any) -> None:
    if not isinstance(payload, dict):
        raise ProducerError("output must be a JSON object")
    if payload.get("schema_version") != SCHEMA_VERSION:
        raise ProducerError("output schema_version is invalid")
    if not isinstance(payload.get("records"), list):
        raise ProducerError("output records must be a list")
    if len(payload["records"]) != len(LABELS):
        raise ProducerError("output must contain exactly one record per snapshot label")
    if payload.get("comparisons") != payload["records"]:
        raise ProducerError("output comparison records do not match records")
    expected_names = ["PASS", "FAIL", "BLOCKED", "NOT_RUN", "total"]
    for record, expected_name in zip(payload["records"], expected_names):
        if not isinstance(record, dict):
            raise ProducerError("output record must be an object")
        required = {
            "from_node",
            "to_node",
            "edge_kind",
            "value_type",
            "name",
            "from_value",
            "to_value",
        }
        if set(record) != required:
            raise ProducerError("output record fields are invalid")
        if record["name"] != expected_name:
            raise ProducerError("output records are in the wrong order")
        if any(not isinstance(record[field], str) or not record[field] for field in required):
            raise ProducerError("output record fields must be non-empty strings")
        if record["from_node"] != FROM_NODE or record["to_node"] != TO_NODE:
            raise ProducerError("output record nodes are invalid")
        if record["edge_kind"] != EDGE_KIND or record["value_type"] != VALUE_TYPE:
            raise ProducerError("output record edge metadata is invalid")
        _parse_nonnegative_integer(record["from_value"], record["name"], "output")
        _parse_nonnegative_integer(record["to_value"], record["name"], "output")

    metadata = payload.get("metadata")
    if not isinstance(metadata, dict) or metadata.get("producer") != PRODUCER_PATH:
        raise ProducerError("output metadata is invalid")
    sources = metadata.get("sources")
    if not isinstance(sources, list) or len(sources) != 2:
        raise ProducerError("output metadata sources are invalid")
    expected_paths = [FEATURE_STATUS_PATH, PHASE6_RESULTS_PATH]
    for source, expected_path in zip(sources, expected_paths):
        if not isinstance(source, dict) or source.get("path") != expected_path:
            raise ProducerError("output source metadata path is invalid")
        if not isinstance(source.get("sha256"), str) or not re.fullmatch(
            r"[0-9a-f]{64}", source["sha256"]
        ):
            raise ProducerError("output source metadata hash is invalid")


def validate_output(project_root: Path | str, output: Path | str = OUTPUT_PATH) -> Path:
    """Validate an existing output against current source bytes and semantics."""

    root = Path(project_root).expanduser().resolve()
    output_path = resolve_under_root(root, output)
    if output_path.is_symlink() or not output_path.is_file():
        raise ProducerError(f"output file is missing or unsafe: {output_path}")
    try:
        raw_output = output_path.read_bytes()
        payload = json.loads(raw_output.decode("utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ProducerError(f"cannot read output {output_path}: {exc}") from exc
    _validate_payload_shape(payload)

    expected = build_payload(root)
    if payload != expected:
        raise ProducerError("output is stale or does not match current source data")
    if raw_output != _canonical_json_bytes(payload):
        raise ProducerError("output is not in deterministic canonical form")
    return output_path


def _argument_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", default=".", type=Path)
    parser.add_argument("--output", default=OUTPUT_PATH, type=Path)
    parser.add_argument(
        "--validate",
        action="store_true",
        help="validate an existing output without replacing it",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = _argument_parser().parse_args(argv)
    try:
        path = (
            validate_output(args.project_root, args.output)
            if args.validate
            else generate(args.project_root, args.output)
        )
    except (OSError, ProducerError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
