#!/usr/bin/env python3
"""Generate deterministic, freely reproducible Comic Explorer spike data."""

from __future__ import annotations

import argparse
import binascii
import json
import shutil
import struct
import zlib
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZIP_STORED, ZipFile


def png_bytes(width: int, height: int, seed: int) -> bytes:
    def chunk(kind: bytes, payload: bytes) -> bytes:
        return (
            struct.pack(">I", len(payload))
            + kind
            + payload
            + struct.pack(">I", binascii.crc32(kind + payload) & 0xFFFFFFFF)
        )

    # A deterministic RGB pattern compresses well enough to keep the fixture practical.
    pixel = bytes(((seed * 17) % 256, (seed * 37) % 256, (seed * 67) % 256))
    row = b"\x00" + pixel * width
    raw = row * height
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, level=6))
        + chunk(b"IEND", b"")
    )


def write_items(root: Path, count: int) -> None:
    root.mkdir(parents=True)
    for index in range(count):
        suffix = ".cbz" if index % 4 == 0 else ""
        (root / f"作品_{index:05d}{suffix}").write_bytes(b"")


def write_images(root: Path) -> list[Path]:
    root.mkdir(parents=True)
    pages: list[Path] = []
    for index in range(300):
        page = root / f"page_{index + 1:03d}.png"
        page.write_bytes(png_bytes(600, 900, index))
        pages.append(page)
    (root / "wide_301.png").write_bytes(png_bytes(1800, 900, 301))
    (root / "high_resolution_302.png").write_bytes(png_bytes(8000, 12000, 302))
    (root / "corrupt_303.png").write_bytes(b"\x89PNG\r\n\x1a\ncorrupt")
    return pages


def write_archives(root: Path, pages: list[Path]) -> None:
    with ZipFile(root / "pages-deflate.cbz", "w", ZIP_DEFLATED, allowZip64=True) as archive:
        for page in pages:
            archive.write(page, f"日本語/章1/{page.name}")
    with ZipFile(root / "pages-stored.zip", "w", ZIP_STORED, allowZip64=True) as archive:
        for page in pages:
            archive.write(page, f"pages/{page.name}")
    valid = (root / "pages-deflate.cbz").read_bytes()
    (root / "corrupt.cbz").write_bytes(valid[: max(32, len(valid) // 3)])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    output = args.output.resolve()
    if output.exists():
        if not args.force:
            raise SystemExit(f"{output} already exists; pass --force to replace it")
        shutil.rmtree(output)
    output.mkdir(parents=True)
    write_items(output / "items-1000", 1_000)
    write_items(output / "items-10000", 10_000)
    pages = write_images(output / "images-300")
    write_archives(output, pages)
    (output / "cache-empty").mkdir()
    cache = output / "cache-warm"
    cache.mkdir()
    for index, page in enumerate(pages):
        # The fixture models an already populated file cache without prescribing an encoder.
        shutil.copyfile(page, cache / f"{index:064x}.png")
    manifest = {
        "schemaVersion": 1,
        "generator": "generate_dataset.py",
        "items": [1_000, 10_000],
        "pages": 300,
        "inputFormats": ["PNG"],
        "windowsGeneratorAdds": ["JPEG"],
        "specialCases": ["wide", "high-resolution", "corrupt-image", "corrupt-zip"],
    }
    (output / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(output)


if __name__ == "__main__":
    main()

