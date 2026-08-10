#!/usr/bin/env python3
"""Generate and audit a deterministic lock-backed release dependency inventory."""

from __future__ import annotations

import argparse
import json
import re
import tomllib
from pathlib import Path

ALLOWED_LICENSE_IDS = {
    "0BSD", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "BSL-1.0",
    "BlueOak-1.0.0", "CC-BY-4.0", "CC0-1.0", "ISC", "LGPL-2.1-or-later",
    "LLVM-exception", "MIT",
    "MIT-0", "MPL-2.0", "Unicode-3.0",
    "Unicode-DFS-2016", "Unlicense", "Zlib",
}


def normalized_license(expression: str) -> str:
    """Normalize legacy slash-separated dual-license expressions to SPDX OR."""
    return re.sub(r"\s*/\s*", " OR ", expression.strip())


def validate_license(expression: str, component: str) -> str:
    expression = normalized_license(expression)
    identifiers = re.findall(r"[A-Za-z0-9][A-Za-z0-9.+-]*", expression)
    operators = {"AND", "OR", "WITH"}
    unknown = sorted({item for item in identifiers if item not in operators | ALLOWED_LICENSE_IDS})
    if not identifiers or unknown or "LicenseRef-" in expression:
        raise ValueError(f"{component}: unknown or prohibited license expression {expression!r}")
    return expression


def npm_components(lock_path: Path) -> list[dict[str, object]]:
    lock = json.loads(lock_path.read_text(encoding="utf-8"))
    components = []
    for package_path, package in lock["packages"].items():
        if not package_path or "version" not in package:
            continue
        name = package_path.rsplit("node_modules/", 1)[-1]
        component: dict[str, object] = {
            "type": "library",
            "name": name,
            "version": package["version"],
            "purl": f"pkg:npm/{name.replace('@', '%40')}@{package['version']}",
        }
        license_name = package.get("license")
        if not license_name:
            raise ValueError(f"npm:{name}@{package['version']}: missing license")
        license_name = validate_license(license_name, f"npm:{name}@{package['version']}")
        component["licenses"] = [{"expression": license_name}]
        component["scope"] = "required" if package_path.count("node_modules/") == 1 else "optional"
        if integrity := package.get("integrity"):
            component["hashes"] = [{"alg": "SHA-512", "content": integrity.removeprefix("sha512-")}]
        components.append(component)
    return components


def cargo_components(lock_path: Path, metadata_path: Path) -> list[dict[str, object]]:
    lock = tomllib.loads(lock_path.read_text(encoding="utf-8"))
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    by_key = {
        (package["name"], package["version"]): package
        for package in metadata["packages"]
        if package["name"] != "comic-explorer"
    }
    resolved = {
        (package["name"], package["version"])
        for package in metadata["packages"]
        if package["name"] != "comic-explorer"
    }
    components = []
    for package in lock["package"]:
        if package["name"] == "comic-explorer":
            continue
        key = (package["name"], package["version"])
        if key not in resolved:
            continue
        metadata_package = by_key[key]
        license_name = metadata_package.get("license")
        if not license_name:
            raise ValueError(f"cargo:{package['name']}@{package['version']}: missing license")
        license_name = validate_license(
            license_name, f"cargo:{package['name']}@{package['version']}"
        )
        component: dict[str, object] = {
            "type": "library",
            "name": package["name"],
            "version": package["version"],
            "purl": f"pkg:cargo/{package['name']}@{package['version']}",
            "licenses": [{"expression": license_name}],
            "scope": "required",
        }
        if package["name"] == "unrar_sys":
            component["licenses"].append({  # type: ignore[union-attr]
                "license": {
                    "name": "UnRAR source license",
                    "url": "https://www.rarlab.com/rar/unlicense.html",
                }
            })
        if checksum := package.get("checksum"):
            component["hashes"] = [{"alg": "SHA-256", "content": checksum}]
        components.append(component)
    return components


def notices(components: list[dict[str, object]]) -> str:
    lines = [
        "# Comic Explorer Third-Party Notices",
        "",
        "This file is generated from the npm and Cargo locked dependency inventory.",
        "Exact versions and checksums are recorded in the bundled `SBOM.json`.",
        "",
        "| Ecosystem / component | Version | License |",
        "| --- | --- | --- |",
    ]
    for component in components:
        ecosystem = "npm" if str(component["purl"]).startswith("pkg:npm/") else "cargo"
        license_name = component["licenses"][0]["expression"]  # type: ignore[index]
        lines.append(
            f"| {ecosystem} / {component['name']} | {component['version']} | {license_name} |"
        )
    lines.extend([
        "",
        "Copyright and full license texts remain available from each component's source",
        "distribution. This notice does not alter the terms of those licenses.",
        "",
    ])
    if any(component["name"] == "unrar_sys" for component in components):
        lines.extend([
            "## Bundled UnRAR source notice",
            "",
            "The `unrar_sys` component bundles the UnRAR extraction source. In addition to",
            "the wrapper license shown above, the following upstream terms apply:",
            "",
            "> UnRAR source code may be used in any software to handle",
            "> RAR archives without limitations free of charge, but cannot be",
            "> used to develop RAR (WinRAR) compatible archiver and to",
            "> re-create RAR compression algorithm, which is proprietary.",
            "> Distribution of modified UnRAR source code in separate form",
            "> or as a part of other software is permitted, provided that",
            "> full text of this paragraph, starting from \"UnRAR source code\"",
            "> words, is included in license, or in documentation if license",
            "> is not available, and in source code comments of resulting package.",
            "",
            "The UnRAR utility and source are distributed without warranty. Comic Explorer",
            "uses this component only to list and read existing RAR archives; it does not",
            "create RAR archives.",
            "",
        ])
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("dist/SBOM.json"))
    parser.add_argument(
        "--cargo-metadata",
        type=Path,
        default=Path("dist/cargo-metadata.json"),
        help="Output of cargo metadata --locked --offline --format-version 1",
    )
    parser.add_argument("--notices", type=Path, default=Path("THIRD-PARTY-NOTICES.md"))
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    components = npm_components(Path("package-lock.json"))
    components.extend(cargo_components(Path("src-tauri/Cargo.lock"), args.cargo_metadata))
    components.sort(key=lambda item: (str(item["purl"]), str(item["version"])))
    payload = {
        "bomFormat": "CycloneDX",
        "specVersion": "1.6",
        "version": 1,
        "metadata": {
            "component": {
                "type": "application",
                "name": "Comic Explorer",
                "version": "0.1.0",
            }
        },
        "components": components,
    }
    sbom_text = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    notice_text = notices(components)
    if args.check:
        if args.output.read_text(encoding="utf-8") != sbom_text:
            raise SystemExit(f"{args.output} is not synchronized with lockfiles")
        if args.notices.read_text(encoding="utf-8") != notice_text:
            raise SystemExit(f"{args.notices} is not synchronized with lockfiles")
    else:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(sbom_text, encoding="utf-8", newline="\n")
        args.notices.write_text(notice_text, encoding="utf-8", newline="\n")
    print(f"{len(components)} components; unknown/prohibited licenses: 0")


if __name__ == "__main__":
    main()
