#!/usr/bin/env python3
"""Validate generated fixture content without decoding or extracting archives."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
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
            else:
                assert data.startswith(b"\xff\xd8") and data.endswith(b"\xff\xd9"), relative

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

    image_root = root / "FIX-IMAGE-ERROR-001"
    assert {"invalid-crc.png", "dimension-bomb.png"} <= {
        path.name for path in image_root.iterdir()
    }

    for forbidden in ("escape.png", "absolute.png"):
        assert not (root / forbidden).exists()
        assert not (root.parent / forbidden).exists()

    fixture_ids = {
        "FIX-ORDER-001", "FIX-ORDER-002", "FIX-ORDER-003", "FIX-ORDER-004",
        "FIX-NESTED-001", "FIX-IMAGE-001", "FIX-IMAGE-ERROR-001",
        "FIX-ZIP-001", "FIX-ZIP-ERROR-001", "FIX-LIBRARY-001", "FIX-READING-001",
    }
    assert fixture_ids <= set(manifest["fixtures"])
    for fixture in manifest["fixtures"].values():
        assert "expectedPageCount" in fixture
        assert "expectedResult" in fixture
    assert all("fileType" in entry for entry in manifest["files"])
    print(f"valid: {len(expected_paths)} files, {len(manifest['fixtures'])} fixtures")


if __name__ == "__main__":
    main()
