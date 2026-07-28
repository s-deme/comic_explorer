from __future__ import annotations

import importlib.util
import sqlite3
import struct
import tempfile
import unittest
import zlib
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    # CoDD resolves this declared test target through codd.yaml. Runtime loading
    # remains explicit because the architecture-spike directory contains a dash.
    import architecture_spike_runner


ROOT = Path(__file__).resolve().parents[1]
SPIKE = ROOT / "benchmarks" / "architecture-spike"


def load_module(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, SPIKE / filename)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {filename}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


generator = load_module("spike_generator", "generate_dataset.py")
runner = load_module("spike_runner", "run_foundation_benchmark.py")


class ArchitectureSpikeTests(unittest.TestCase):
    def test_generated_png_has_expected_dimensions_and_pixels(self) -> None:
        data = generator.png_bytes(7, 11, 3)
        self.assertEqual(data[:8], b"\x89PNG\r\n\x1a\n")
        ihdr_length = struct.unpack(">I", data[8:12])[0]
        self.assertEqual(ihdr_length, 13)
        self.assertEqual(struct.unpack(">II", data[16:24]), (7, 11))
        idat_at = data.index(b"IDAT")
        idat_length = struct.unpack(">I", data[idat_at - 4 : idat_at])[0]
        raw = zlib.decompress(data[idat_at + 4 : idat_at + 4 + idat_length])
        self.assertEqual(len(raw), (1 + 7 * 3) * 11)

    def test_item_names_and_archive_variants_are_deterministic(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            generator.write_items(root / "items", 12)
            self.assertEqual(len(list((root / "items").iterdir())), 12)
            self.assertTrue((root / "items" / "作品_00000.cbz").exists())
            pages = []
            for index in range(3):
                page = root / f"page_{index:03}.png"
                page.write_bytes(generator.png_bytes(8, 9, index))
                pages.append(page)
            generator.write_archives(root, pages)
            runner.read_zip_pages(root / "pages-deflate.cbz", [0, 2])
            runner.read_zip_pages(root / "pages-stored.zip", [1])
            self.assertLess(
                (root / "corrupt.cbz").stat().st_size,
                (root / "pages-deflate.cbz").stat().st_size,
            )

    def test_measurement_summary_and_percentile(self) -> None:
        result = runner.measure(lambda: sum(range(100)), 3)
        self.assertEqual(len(result["samplesMs"]), 3)
        self.assertLessEqual(result["medianMs"], result["p95Ms"])
        self.assertEqual(runner.percentile([1.0, 2.0, 3.0, 4.0], 0.95), 4.0)

    def test_sqlite_roundtrip_uses_wal_and_expected_rows(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            database = Path(temporary) / "state.sqlite3"
            runner.sqlite_roundtrip(database, 50)
            connection = sqlite3.connect(database)
            try:
                count = connection.execute("SELECT count(*) FROM state").fetchone()[0]
                mode = connection.execute("PRAGMA journal_mode").fetchone()[0]
            finally:
                connection.close()
            self.assertEqual(count, 50)
            self.assertEqual(mode.lower(), "wal")


if __name__ == "__main__":
    unittest.main()
