#!/usr/bin/env python3
"""Generate deterministic, copyright-safe Comic Explorer fixtures.

Only Python's standard library is used. JPEG encoding is delegated to the
System.Drawing encoder included with supported Windows installations.
"""

from __future__ import annotations

import argparse
import binascii
import hashlib
import json
import os
import random
import shutil
import struct
import subprocess
import sys
import unicodedata
import zlib
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZIP_STORED, ZipFile, ZipInfo

SEED = 20260728
VERSION = "1.1.0"
FIXED_EPOCH = 1_700_000_000
ZIP_TIME = (2023, 11, 14, 22, 13, 20)
SUPPORTED_IMAGES = {".jpg", ".jpeg", ".png"}

# The fixture labels only need this deliberately small, platform-independent font.
FONT = {
    " ": ("00000",) * 7,
    "-": ("00000", "00000", "00000", "11111", "00000", "00000", "00000"),
    "0": ("01110", "10001", "10011", "10101", "11001", "10001", "01110"),
    "1": ("00100", "01100", "00100", "00100", "00100", "00100", "01110"),
    "2": ("01110", "10001", "00001", "00010", "00100", "01000", "11111"),
    "3": ("11110", "00001", "00001", "01110", "00001", "00001", "11110"),
    "4": ("00010", "00110", "01010", "10010", "11111", "00010", "00010"),
    "5": ("11111", "10000", "10000", "11110", "00001", "00001", "11110"),
    "6": ("01110", "10000", "10000", "11110", "10001", "10001", "01110"),
    "7": ("11111", "00001", "00010", "00100", "01000", "01000", "01000"),
    "8": ("01110", "10001", "10001", "01110", "10001", "10001", "01110"),
    "9": ("01110", "10001", "10001", "01111", "00001", "00001", "01110"),
    "A": ("01110", "10001", "10001", "11111", "10001", "10001", "10001"),
    "D": ("11110", "10001", "10001", "10001", "10001", "10001", "11110"),
    "E": ("11111", "10000", "10000", "11110", "10000", "10000", "11111"),
    "F": ("11111", "10000", "10000", "11110", "10000", "10000", "10000"),
    "G": ("01110", "10001", "10000", "10111", "10001", "10001", "01110"),
    "H": ("10001", "10001", "10001", "11111", "10001", "10001", "10001"),
    "I": ("01110", "00100", "00100", "00100", "00100", "00100", "01110"),
    "L": ("10000", "10000", "10000", "10000", "10000", "10000", "11111"),
    "M": ("10001", "11011", "10101", "10101", "10001", "10001", "10001"),
    "N": ("10001", "11001", "10101", "10011", "10001", "10001", "10001"),
    "O": ("01110", "10001", "10001", "10001", "10001", "10001", "01110"),
    "P": ("11110", "10001", "10001", "11110", "10000", "10000", "10000"),
    "R": ("11110", "10001", "10001", "11110", "10100", "10010", "10001"),
    "S": ("01111", "10000", "10000", "01110", "00001", "00001", "11110"),
    "T": ("11111", "00100", "00100", "00100", "00100", "00100", "00100"),
    "X": ("10001", "10001", "01010", "00100", "01010", "10001", "10001"),
}


def chunk(kind: bytes, payload: bytes) -> bytes:
    return (
        struct.pack(">I", len(payload))
        + kind
        + payload
        + struct.pack(">I", binascii.crc32(kind + payload) & 0xFFFFFFFF)
    )


def png_bytes(width: int, height: int, label: str, seed: int) -> bytes:
    """Create RGB PNG pixels with a visible label and deterministic pattern."""
    background = ((seed * 17) % 160, (seed * 37) % 160, (seed * 67) % 160)
    pixels = bytearray(background * (width * height))

    def rect(x: int, y: int, w: int, h: int, color: tuple[int, int, int]) -> None:
        for yy in range(max(0, y), min(height, y + h)):
            start = (yy * width + max(0, x)) * 3
            end = (yy * width + min(width, x + w)) * 3
            pixels[start:end] = bytes(color) * ((end - start) // 3)

    # Border and asymmetric registration marks make orientation visually obvious.
    border = max(1, min(width, height) // 80)
    rect(0, 0, width, border, (255, 255, 255))
    rect(0, height - border, width, border, (255, 255, 255))
    rect(0, 0, border, height, (255, 255, 255))
    rect(width - border, 0, border, height, (255, 255, 255))
    rect(border * 3, border * 3, max(1, width // 10), max(1, height // 30), (255, 210, 0))

    scale = max(1, min(6, min(width // max(1, len(label) * 6 + 4), height // 18)))
    x0, y0 = border * 4 + 2, max(border * 5, height // 8)
    for char in label.upper():
        glyph = FONT.get(char, FONT[" "])
        for gy, row in enumerate(glyph):
            for gx, bit in enumerate(row):
                if bit == "1":
                    rect(x0 + gx * scale, y0 + gy * scale, scale, scale, (255, 255, 255))
        x0 += 6 * scale

    raw = b"".join(b"\x00" + pixels[y * width * 3 : (y + 1) * width * 3] for y in range(height))
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


def windows_path(path: Path) -> str:
    return str(path.resolve())


def png_to_jpeg(source: Path, target: Path) -> None:
    powershell = shutil.which("powershell.exe") or shutil.which("powershell")
    if not powershell:
        raise RuntimeError(
            "JPEG fixtures require Windows PowerShell/System.Drawing; run on supported Windows."
        )
    helper = Path(__file__).with_name("convert_png_to_jpeg.ps1")
    completed = subprocess.run(
        [
            powershell,
            "-NoProfile",
            "-NonInteractive",
            "-File",
            windows_path(helper),
            "-Source",
            windows_path(source),
            "-Target",
            windows_path(target),
        ],
        capture_output=True,
    )
    if completed.returncode:
        detail = completed.stderr.decode("utf-8", errors="replace").strip()
        raise RuntimeError(f"JPEG conversion failed: {detail}")
    if not target.is_file():
        raise RuntimeError("JPEG conversion returned success without creating the target")


class Builder:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.fixtures: dict[str, dict[str, object]] = {}
        self.counter = 0

    def fixture(
        self,
        fixture_id: str,
        purpose: str,
        expected_order: list[str] | str,
        cover: str | None,
        result: str,
        expected_page_count: int | None = None,
    ) -> Path:
        path = self.root / fixture_id
        path.mkdir(parents=True)
        self.fixtures[fixture_id] = {
            "purpose": purpose,
            "expectedPageOrder": expected_order,
            "expectedCover": cover,
            "expectedPageCount": (
                len(expected_order)
                if isinstance(expected_order, list)
                else expected_page_count
            ),
            "expectedResult": result,
        }
        return path

    def image(self, path: Path, width: int, height: int, fixture_id: str, page: int) -> None:
        self.counter += 1
        label = f"FIX {fixture_id.removeprefix('FIX-')} PAGE {page} {width}X{height}"
        data = png_bytes(width, height, label, SEED + self.counter)
        path.parent.mkdir(parents=True, exist_ok=True)
        if path.suffix.lower() in {".jpg", ".jpeg"}:
            temporary = path.with_name(path.name + ".source.png")
            temporary.write_bytes(data)
            png_to_jpeg(temporary, path)
            temporary.unlink()
        else:
            path.write_bytes(data)

    def archive(self, path: Path, entries: list[tuple[str, bytes, int]]) -> None:
        with ZipFile(path, "w") as archive:
            for name, data, compression in entries:
                info = ZipInfo(name, ZIP_TIME)
                info.compress_type = compression
                info.external_attr = 0o100644 << 16
                archive.writestr(info, data)


def mark_encrypted(path: Path) -> None:
    """Set ZIP encryption flags for a deterministic negative fixture.

    Payload encryption is intentionally unnecessary: readers must reject it from
    the flag before decoding. Both local and central headers are patched.
    """
    data = bytearray(path.read_bytes())
    for signature, offset in ((b"PK\x03\x04", 6), (b"PK\x01\x02", 8)):
        position = 0
        while True:
            position = data.find(signature, position)
            if position < 0:
                break
            flags = struct.unpack_from("<H", data, position + offset)[0] | 1
            struct.pack_into("<H", data, position + offset, flags)
            position += 4
    path.write_bytes(data)


def patch_zip_compression(path: Path, method: int) -> None:
    """Patch local and central headers to an unsupported compression method."""
    data = bytearray(path.read_bytes())
    for signature, offset in ((b"PK\x03\x04", 8), (b"PK\x01\x02", 10)):
        position = 0
        while True:
            position = data.find(signature, position)
            if position < 0:
                break
            struct.pack_into("<H", data, position + offset, method)
            position += 4
    path.write_bytes(data)


def build_core(builder: Builder) -> None:
    p = builder.fixture("FIX-ORDER-001", "basic natural order", ["1.jpg", "2.jpg", "10.jpg"], "1.jpg", "success")
    for page in (1, 2, 10):
        builder.image(p / f"{page}.jpg", 320, 480, "FIX-ORDER-001", page)

    p = builder.fixture(
        "FIX-ORDER-002",
        "leading zero tie",
        ["001.png", "01.png", "1.png", "2.png"],
        "001.png",
        "success",
        4,
    )
    for index, name in enumerate(("1.png", "01.png", "001.png", "2.png"), 1):
        builder.image(p / name, 320, 480, "FIX-ORDER-002", index)

    order3 = ["2.PNG", "PAGE3.JPEG", "PAGE10.JPG"]
    p = builder.fixture("FIX-ORDER-003", "case and unsupported formats", order3, "2.PNG", "success")
    for index, name in enumerate(order3, 1):
        builder.image(p / name, 320, 480, "FIX-ORDER-003", index)
    (p / "notes.txt").write_text("unsupported synthetic file\n", encoding="utf-8")
    (p / "page.webp").write_bytes(b"not-webp")

    p = builder.fixture(
        "FIX-ORDER-004",
        "Unicode and Japanese ordering",
        ["ASCII2.png", unicodedata.normalize("NFD", "é") + ".png", "é.png", "全角２.png", "日本語10.png"],
        "ASCII2.png",
        "success",
        5,
    )
    names = ["ASCII2.png", "日本語10.png", "全角２.png", "é.png", unicodedata.normalize("NFD", "é") + ".png"]
    for index, name in enumerate(names, 1):
        builder.image(p / name, 320, 480, "FIX-ORDER-004", index)

    nested_order = ["1.png", "chapter/2.png", "chapter/10.png", "chapter/deep/11.png"]
    p = builder.fixture("FIX-NESTED-001", "recursive relative paths and hidden entries", nested_order, "1.png", "success")
    for index, name in enumerate(nested_order, 1):
        builder.image(p / name, 320, 480, "FIX-NESTED-001", index)
    builder.image(p / ".hidden.png", 320, 480, "FIX-NESTED-001", 90)
    builder.image(p / ".hidden-folder/3.png", 320, 480, "FIX-NESTED-001", 91)

    p = builder.fixture("FIX-IMAGE-001", "shape, dimensions and formats", ["portrait.jpg", "portrait.png", "wide.jpg", "wide.png", "square.png", "high-resolution.png", "minimum.png"], "portrait.jpg", "success")
    specs = [
        ("portrait.jpg", 320, 480), ("portrait.png", 400, 600),
        ("wide.jpg", 640, 320), ("wide.png", 600, 300),
        ("square.png", 400, 400), ("high-resolution.png", 2400, 3600),
        ("minimum.png", 1, 1),
    ]
    for index, (name, width, height) in enumerate(specs, 1):
        builder.image(p / name, width, height, "FIX-IMAGE-001", index)

    p = builder.fixture("FIX-IMAGE-ERROR-001", "corrupt and mismatched images", [], None, "per-file-error")
    (p / "corrupt.jpg").write_bytes(b"\xff\xd8\xff\xe0truncated")
    (p / "corrupt.png").write_bytes(b"\x89PNG\r\n\x1a\ntruncated")
    (p / "zero.png").write_bytes(b"")
    (p / "mismatch.jpg").write_bytes(png_bytes(32, 48, "MISMATCH", SEED))
    invalid_crc = bytearray(png_bytes(32, 48, "CRC", SEED + 2))
    invalid_crc[-8] ^= 0xFF
    (p / "invalid-crc.png").write_bytes(invalid_crc)
    dimension_bomb = bytearray(png_bytes(1, 1, "BOMB", SEED + 3))
    struct.pack_into(">II", dimension_bomb, 16, 0x7FFF_FFFF, 0x7FFF_FFFF)
    (p / "dimension-bomb.png").write_bytes(dimension_bomb)
    (p / "unreadable.png").write_bytes(png_bytes(32, 48, "UNREADABLE", SEED + 1))
    (p / "WINDOWS-ACL-README.txt").write_text(
        "On Windows deny Read to unreadable.png for the test identity; restore ACL during cleanup.\n",
        encoding="utf-8",
    )

    p = builder.fixture("FIX-ZIP-001", "stored/deflated ZIP and CBZ pages", ["1.JPG", "章/2.PNG", "章/10.JPEG"], "1.JPG", "success")
    sources = []
    for index, (name, suffix) in enumerate((("1", ".JPG"), ("2", ".PNG"), ("10", ".JPEG")), 1):
        temporary = p / f"_source_{name}{suffix}"
        builder.image(temporary, 320, 480, "FIX-ZIP-001", index)
        sources.append((name + suffix, temporary.read_bytes()))
        temporary.unlink()
    entries = [
        ("章/", b"", ZIP_STORED),
        ("章/10.JPEG", sources[2][1], ZIP_DEFLATED),
        ("notes.txt", b"unsupported", ZIP_DEFLATED),
        ("1.JPG", sources[0][1], ZIP_STORED),
        ("章/2.PNG", sources[1][1], ZIP_DEFLATED),
    ]
    builder.archive(p / "standard.zip", entries)
    builder.archive(p / "standard.cbz", list(reversed(entries)))

    p = builder.fixture("FIX-ZIP-ERROR-001", "archive errors and Zip Slip names", [], None, "classified-error")
    builder.archive(p / "empty.zip", [])
    builder.archive(p / "no-images.cbz", [("notes.txt", b"no images", ZIP_DEFLATED)])
    builder.archive(p / "encrypted-flag.zip", [("1.png", png_bytes(16, 16, "1", SEED), ZIP_DEFLATED)])
    mark_encrypted(p / "encrypted-flag.zip")
    builder.archive(
        p / "dangerous-entries.zip",
        [(name, png_bytes(8, 8, "X", SEED + i), ZIP_STORED) for i, name in enumerate(
            ("../escape.png", "/absolute.png", "C:/absolute.png", "dir\\..\\escape.png", "safe/1.png")
        )],
    )
    valid = (p / "no-images.cbz").read_bytes()
    (p / "corrupt.zip").write_bytes(valid[: max(20, len(valid) // 2)])
    builder.archive(p / "unsupported-compression.zip", [("1.png", png_bytes(8, 8, "X", SEED), ZIP_STORED)])
    patch_zip_compression(p / "unsupported-compression.zip", 99)
    malformed = bytearray((p / "no-images.cbz").read_bytes())
    malformed[0:4] = b"BAD!"
    (p / "malformed-local-header.zip").write_bytes(malformed)

    p = builder.fixture("FIX-READING-001", "reading position for folder/ZIP/CBZ", [f"page{i}.png" for i in range(1, 13)], "page1.png", "success")
    folder = p / "folder"
    folder.mkdir()
    reading_entries = []
    for page in range(1, 13):
        target = folder / f"page{page}.png"
        builder.image(target, 320, 480, "FIX-READING-001", page)
        reading_entries.append((target.name, target.read_bytes(), ZIP_DEFLATED))
    builder.archive(p / "same-content.zip", list(reversed(reading_entries)))
    builder.archive(p / "same-content.cbz", reading_entries)
    (p / "reading-oracle.json").write_text(
        json.dumps(
            {
                "savedPage": "page7.png",
                "unchangedRestore": "page7.png",
                "afterInsertBefore": "page7.png",
                "afterDelete": "nearest-index; prefer successor when equidistant",
                "itemRenameOrMove": "DEFERRED:MVP-out-of-scope",
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    p = builder.fixture("FIX-LIBRARY-001", "mixed library types and hierarchy", [], None, "success")
    (p / "normal-folder/deep/level-3").mkdir(parents=True)
    comic = p / "comic-folder"
    comic.mkdir()
    builder.image(comic / "1.png", 320, 480, "FIX-LIBRARY-001", 1)
    shutil.copyfile(builder.root / "FIX-ZIP-001/standard.zip", p / "volume.zip")
    shutil.copyfile(builder.root / "FIX-ZIP-001/standard.cbz", p / "volume.cbz")
    (p / "future.rar").write_bytes(b"unsupported")
    (p / "empty-folder").mkdir()
    (p / ("long-" + "x" * 180)).mkdir()
    for name in ("same-a.cbz", "same-b.cbz"):
        shutil.copyfile(builder.root / "FIX-ZIP-001/standard.cbz", p / name)


def build_performance(builder: Builder) -> None:
    p = builder.fixture("FIX-PERFORMANCE-001", "1k/10k items and 300 pages", [], None, "performance-data")
    for count in (1_000, 10_000):
        directory = p / f"items-{count}"
        directory.mkdir()
        for index in range(count):
            (directory / f"item-{index:05d}.cbz").write_bytes(b"")
    pages = p / "pages-300"
    pages.mkdir()
    entries = []
    for page in range(1, 301):
        target = pages / f"page-{page:03d}.png"
        builder.image(target, 600, 900, "FIX-PERFORMANCE-001", page)
        entries.append((target.name, target.read_bytes(), ZIP_DEFLATED))
    builder.archive(p / "pages-300.cbz", entries)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def image_info(path: Path) -> dict[str, object] | None:
    data = path.read_bytes()
    if data.startswith(b"\x89PNG\r\n\x1a\n") and len(data) >= 24:
        width, height = struct.unpack(">II", data[16:24])
        return {"format": "PNG", "width": width, "height": height}
    if data.startswith(b"\xff\xd8"):
        position = 2
        while position + 9 < len(data):
            if data[position] != 0xFF:
                position += 1
                continue
            marker = data[position + 1]
            if marker in range(0xC0, 0xC4):
                height, width = struct.unpack(">HH", data[position + 5 : position + 9])
                return {"format": "JPEG", "width": width, "height": height}
            if marker in (0xD8, 0xD9):
                position += 2
            else:
                if position + 4 > len(data):
                    break
                position += 2 + struct.unpack(">H", data[position + 2 : position + 4])[0]
    return None


def finalize(builder: Builder, include_performance: bool) -> None:
    for path in sorted(builder.root.rglob("*")):
        if path.is_file():
            os.utime(path, (FIXED_EPOCH, FIXED_EPOCH))
    for path in sorted(builder.root.rglob("*"), reverse=True):
        if path.is_dir():
            os.utime(path, (FIXED_EPOCH, FIXED_EPOCH))

    files = []
    for path in sorted(p for p in builder.root.rglob("*") if p.is_file()):
        relative = path.relative_to(builder.root).as_posix()
        entry: dict[str, object] = {
            "path": relative,
            "kind": "file",
            "size": path.stat().st_size,
            "mtimeNs": path.stat().st_mtime_ns,
            "sha256": sha256(path),
        }
        info = image_info(path)
        if info:
            entry["image"] = info
            entry["fileType"] = "image"
        elif path.suffix.lower() in SUPPORTED_IMAGES:
            entry["fileType"] = "invalid-image"
        elif path.suffix.lower() in {".zip", ".cbz"}:
            entry["fileType"] = "archive"
        else:
            entry["fileType"] = "other"
        # Zero-byte performance items model list entries, not readable archives.
        # Avoid opening all 11,000 placeholders during manifest generation.
        if path.suffix.lower() in {".zip", ".cbz"} and path.stat().st_size:
            try:
                with ZipFile(path) as archive:
                    entry["archiveEntries"] = [
                        {
                            "path": item.filename,
                            "size": item.file_size,
                            "crc32": f"{item.CRC:08x}",
                            "compression": item.compress_type,
                            "encrypted": bool(item.flag_bits & 1),
                        }
                        for item in archive.infolist()
                    ]
            except Exception as error:
                entry["archiveInspectionError"] = type(error).__name__
        files.append(entry)

    directories = [
        path.relative_to(builder.root).as_posix()
        for path in sorted(p for p in builder.root.rglob("*") if p.is_dir())
    ]
    manifest = {
        "schemaVersion": 1,
        "fixtureSeed": SEED,
        "generator": {"name": Path(__file__).name, "version": VERSION, "python": sys.version.split()[0]},
        "fixedMtimeEpoch": FIXED_EPOCH,
        "includesPerformance": include_performance,
        "fixtures": builder.fixtures,
        "files": files,
        "directoryEntries": directories,
    }
    (builder.root / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    os.utime(builder.root / "manifest.json", (FIXED_EPOCH, FIXED_EPOCH))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path(__file__).parent / "generated")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--include-performance", action="store_true")
    args = parser.parse_args()
    output = args.output.resolve()
    if output.exists():
        if not args.force:
            raise SystemExit(f"{output} exists; use --force to replace this exact fixture directory")
        safe_default = (Path(__file__).parent / "generated").resolve()
        safe_temporary = output.name.startswith("comic-explorer-fixtures")
        if output != safe_default and not safe_temporary:
            raise SystemExit(
                "--force only replaces tests/fixtures/generated or a directory "
                "named comic-explorer-fixtures*"
            )
        shutil.rmtree(output)
    output.mkdir(parents=True)
    builder = Builder(output)
    build_core(builder)
    if args.include_performance:
        build_performance(builder)
    finalize(builder, args.include_performance)
    print(output)


if __name__ == "__main__":
    main()
