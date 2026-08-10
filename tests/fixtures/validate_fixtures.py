#!/usr/bin/env python3
"""Validate generated fixture content without decoding or extracting archives."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
import zlib
from pathlib import Path, PurePosixPath
from zipfile import BadZipFile, ZipFile


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def unsafe_archive_name(name: str) -> bool:
    normalized = name.replace("\\", "/")
    path = PurePosixPath(normalized)
    return (
        normalized.startswith("/")
        or bool(re.match(r"^[A-Za-z]:/", normalized))
        or ".." in path.parts
    )


def webp_chunks(data: bytes) -> list[bytes]:
    assert len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    assert struct.unpack("<I", data[4:8])[0] == len(data) - 8
    chunks: list[bytes] = []
    position = 12
    while position < len(data):
        assert position + 8 <= len(data)
        fourcc = data[position : position + 4]
        length = struct.unpack("<I", data[position + 4 : position + 8])[0]
        position += 8 + length
        assert position <= len(data)
        if length & 1:
            position += 1
        assert position <= len(data)
        chunks.append(fourcc)
    assert position == len(data)
    return chunks


def rar4_entries(path: Path) -> list[dict[str, object]]:
    data = path.read_bytes()
    assert data.startswith(b"Rar!\x1a\x07\x00")
    position = 7
    entries: list[dict[str, object]] = []
    while position < len(data):
        assert position + 7 <= len(data)
        expected_crc, kind, flags, header_size = struct.unpack_from("<HBHH", data, position)
        assert header_size >= 7 and position + header_size <= len(data)
        header_payload = data[position + 2 : position + header_size]
        assert zlib.crc32(header_payload) & 0xFFFF == expected_crc
        if kind == 0x7B:
            assert position + header_size == len(data)
            break
        if kind != 0x74:
            position += header_size
            continue
        packed_size, unpacked_size = struct.unpack_from("<II", data, position + 7)
        method = data[position + 25]
        name_size = struct.unpack_from("<H", data, position + 26)[0]
        name = data[position + 32 : position + 32 + name_size].decode("ascii")
        start = position + header_size
        end = start + packed_size
        assert end <= len(data)
        entries.append({
            "name": name,
            "flags": flags,
            "method": method,
            "unpackedSize": unpacked_size,
            "data": data[start:end],
        })
        position = end
    return entries


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("root", type=Path)
    args = parser.parse_args()
    root = args.root.resolve()
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    assert manifest["schemaVersion"] == 1
    assert manifest["fixtureSeed"] == 20260728

    expected_paths = {entry["path"] for entry in manifest["files"]}
    actual_paths = {
        path.relative_to(root).as_posix()
        for path in root.rglob("*")
        if path.is_file() and path.name != "manifest.json"
    }
    assert actual_paths == expected_paths, (actual_paths ^ expected_paths)

    by_path = {entry["path"]: entry for entry in manifest["files"]}
    for relative in sorted(expected_paths):
        path = root / relative
        expected = by_path[relative]
        assert path.stat().st_size == expected["size"], relative
        assert path.stat().st_mtime_ns == expected["mtimeNs"], relative
        assert sha256(path) == expected["sha256"], relative
        if "image" in expected:
            data = path.read_bytes()
            image = expected["image"]
            if image["format"] == "PNG":
                assert data.startswith(b"\x89PNG\r\n\x1a\n"), relative
                assert struct.unpack(">II", data[16:24]) == (image["width"], image["height"])
            elif image["format"] == "JPEG":
                assert data.startswith(b"\xff\xd8") and data.endswith(b"\xff\xd9"), relative
            elif image["format"] == "WEBP":
                chunks = webp_chunks(data)
                assert any(chunk in {b"VP8 ", b"VP8L", b"VP8X"} for chunk in chunks), relative
            else:
                raise AssertionError(f"unexpected image format: {image['format']}")

    zip_root = root / "FIX-ZIP-ERROR-001"
    with ZipFile(zip_root / "dangerous-entries.zip") as archive:
        names = [item.filename for item in archive.infolist()]
        assert any(unsafe_archive_name(name) for name in names)
        assert "safe/1.png" in names
    with ZipFile(zip_root / "encrypted-flag.zip") as archive:
        assert archive.infolist() and all(item.flag_bits & 1 for item in archive.infolist())
    try:
        with ZipFile(zip_root / "corrupt.zip") as archive:
            archive.infolist()
    except BadZipFile:
        pass
    else:
        raise AssertionError("corrupt.zip unexpectedly parsed")
    with ZipFile(zip_root / "unsupported-compression.zip") as archive:
        assert archive.infolist()[0].compress_type == 99
    assert (zip_root / "malformed-local-header.zip").read_bytes().startswith(b"BAD!")

    rar_root = root / "FIX-RAR-001"
    rar_entries = rar4_entries(rar_root / "standard.rar")
    assert [entry["name"] for entry in rar_entries] == [
        "chapter/10.png", "notes.txt", "1.png", "chapter/2.png"
    ]
    assert all(entry["method"] == 0x30 for entry in rar_entries)
    rar_error_root = root / "FIX-RAR-ERROR-001"
    assert rar4_entries(rar_error_root / "encrypted-flag.rar")[0]["flags"] & 0x0004
    assert rar4_entries(rar_error_root / "split-flag.rar")[0]["flags"] & 0x0002
    assert unsafe_archive_name(
        str(rar4_entries(rar_error_root / "dangerous-entry.rar")[0]["name"])
    )

    image_root = root / "FIX-IMAGE-ERROR-001"
    assert {"invalid-crc.png", "dimension-bomb.png"} <= {
        path.name for path in image_root.iterdir()
    }

    webp_root = root / "FIX-WEBP-001"
    static_names = ["1-lossy.webp", "2-lossless.webp", "3-alpha.webp"]
    expected_webp = {
        "1-lossy.webp": ("lossy", False, [b"VP8 "]),
        "2-lossless.webp": ("lossless", True, [b"VP8L"]),
        "3-alpha.webp": ("lossy", True, [b"VP8X", b"ALPH", b"VP8 "]),
    }
    assert manifest["fixtures"]["FIX-WEBP-001"]["expectedPageOrder"] == static_names
    assert manifest["fixtures"]["FIX-WEBP-001"]["expectedPageCount"] == 3
    for name in static_names:
        variant, has_alpha, chunks = expected_webp[name]
        image = by_path[f"FIX-WEBP-001/folder/{name}"]["image"]
        assert image["format"] == "WEBP"
        assert image["variant"] == variant
        assert image["hasAlpha"] is has_alpha
        assert image["animated"] is False
        assert webp_chunks((webp_root / "folder" / name).read_bytes()) == chunks
    assert by_path["FIX-WEBP-001/errors/5-animated.webp"]["image"]["animated"] is True
    assert by_path["FIX-WEBP-001/errors/4-corrupt.webp"]["fileType"] == "invalid-image"
    for archive_name in ("static-webp.zip", "static-webp.cbz", "static-webp.epub"):
        with ZipFile(webp_root / archive_name) as archive:
            names = [item.filename for item in archive.infolist() if item.filename != "mimetype"]
            assert sorted(names) == static_names
            for name in names:
                assert webp_chunks(archive.read(name)) == expected_webp[name][2]
    rar_webp = rar4_entries(webp_root / "static-webp.rar")
    assert sorted(entry["name"] for entry in rar_webp) == static_names
    for entry in rar_webp:
        assert webp_chunks(entry["data"]) == expected_webp[str(entry["name"])][2]

    for forbidden in ("escape.png", "absolute.png"):
        assert not (root / forbidden).exists()
        assert not (root.parent / forbidden).exists()

    fixture_ids = {
        "FIX-ORDER-001", "FIX-ORDER-002", "FIX-ORDER-003", "FIX-ORDER-004",
        "FIX-NESTED-001", "FIX-IMAGE-001", "FIX-IMAGE-ERROR-001",
        "FIX-ZIP-001", "FIX-ZIP-ERROR-001", "FIX-RAR-001", "FIX-RAR-ERROR-001",
        "FIX-LIBRARY-001", "FIX-READING-001",
        "FIX-WEBP-001",
    }
    assert fixture_ids <= set(manifest["fixtures"])
    for fixture in manifest["fixtures"].values():
        assert "expectedPageCount" in fixture
        assert "expectedResult" in fixture
    assert all("fileType" in entry for entry in manifest["files"])
    print(f"valid: {len(expected_paths)} files, {len(manifest['fixtures'])} fixtures")


if __name__ == "__main__":
    main()
