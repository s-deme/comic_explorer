#!/usr/bin/env python3
"""Measure portable foundation operations; this is not an application/UI benchmark."""

from __future__ import annotations

import argparse
import json
import os
import platform
import random
import sqlite3
import statistics
import time
import tracemalloc
from pathlib import Path
from zipfile import ZipFile


def percentile(values: list[float], percentile_value: float) -> float:
    ordered = sorted(values)
    rank = max(0, min(len(ordered) - 1, int((len(ordered) - 1) * percentile_value + 0.999999)))
    return ordered[rank]


def measure(operation, runs: int) -> dict[str, object]:
    samples: list[float] = []
    peaks: list[int] = []
    for run in range(runs + 1):
        tracemalloc.start()
        started = time.perf_counter_ns()
        operation()
        elapsed_ms = (time.perf_counter_ns() - started) / 1_000_000
        _, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()
        if run:
            samples.append(elapsed_ms)
            peaks.append(peak)
    return {
        "samplesMs": [round(value, 3) for value in samples],
        "medianMs": round(statistics.median(samples), 3),
        "p95Ms": round(percentile(samples, 0.95), 3),
        "peakPythonAllocationBytes": max(peaks),
    }


def enumerate_sorted(path: Path) -> None:
    sorted((entry.name, entry.stat(follow_symlinks=False).st_mtime_ns) for entry in os.scandir(path))


def read_zip_pages(path: Path, indices: list[int]) -> None:
    with ZipFile(path) as archive:
        files = [entry for entry in archive.infolist() if not entry.is_dir()]
        for index in indices:
            archive.read(files[index])


def sqlite_roundtrip(path: Path, rows: int) -> None:
    if path.exists():
        path.unlink()
    connection = sqlite3.connect(path)
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute(
        "CREATE TABLE state(path TEXT PRIMARY KEY, page TEXT NOT NULL, updated_ns INTEGER NOT NULL)"
    )
    with connection:
        connection.executemany(
            "INSERT INTO state VALUES (?, ?, ?)",
            ((f"C:/Comics/{index}", f"{index:03}.jpg", index) for index in range(rows)),
        )
    list(connection.execute("SELECT path, page FROM state ORDER BY updated_ns DESC LIMIT 100"))
    connection.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--runs", type=int, default=7)
    args = parser.parse_args()
    dataset = args.dataset.resolve()
    random_indices = random.Random(20260728).sample(range(300), 30)
    operations = {
        "enumerateSort1000": lambda: enumerate_sorted(dataset / "items-1000"),
        "enumerateSort10000": lambda: enumerate_sorted(dataset / "items-10000"),
        "zipDeflateRead30Random": lambda: read_zip_pages(
            dataset / "pages-deflate.cbz", random_indices
        ),
        "zipStoredRead30Random": lambda: read_zip_pages(
            dataset / "pages-stored.zip", random_indices
        ),
        "sqliteInsert10000AndRead100": lambda: sqlite_roundtrip(
            dataset / "benchmark-state.sqlite3", 10_000
        ),
    }
    results = {name: measure(operation, args.runs) for name, operation in operations.items()}
    payload = {
        "schemaVersion": 1,
        "classification": "measured-foundation-only",
        "notMeasured": [
            "Tauri/Electron/WinUI startup",
            "time-to-interactive",
            "JPEG/PNG platform decode",
            "thumbnail generation",
            "WebView2 rendering",
            "scroll FPS",
            "input latency",
            "UI long tasks",
            "GPU",
            "installer size",
        ],
        "environment": {
            "platform": platform.platform(),
            "python": platform.python_version(),
            "processor": platform.processor(),
            "runs": args.runs,
            "clock": "perf_counter_ns",
        },
        "results": results,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(args.output)


if __name__ == "__main__":
    main()

