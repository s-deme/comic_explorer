#!/usr/bin/env python3
"""Generate a deterministic, lock-backed CycloneDX component inventory."""

from __future__ import annotations

import argparse
import json
import tomllib
from pathlib import Path


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
        if license_name := package.get("license"):
            component["licenses"] = [{"license": {"id": license_name}}]
        if integrity := package.get("integrity"):
            component["hashes"] = [{"alg": "SHA-512", "content": integrity.removeprefix("sha512-")}]
        components.append(component)
    return components


def cargo_components(lock_path: Path) -> list[dict[str, object]]:
    lock = tomllib.loads(lock_path.read_text(encoding="utf-8"))
    components = []
    for package in lock["package"]:
        if package["name"] == "comic-explorer":
            continue
        component: dict[str, object] = {
            "type": "library",
            "name": package["name"],
            "version": package["version"],
            "purl": f"pkg:cargo/{package['name']}@{package['version']}",
        }
        if checksum := package.get("checksum"):
            component["hashes"] = [{"alg": "SHA-256", "content": checksum}]
        components.append(component)
    return components


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("dist/SBOM.json"))
    args = parser.parse_args()
    components = npm_components(Path("package-lock.json"))
    components.extend(cargo_components(Path("src-tauri/Cargo.lock")))
    components.sort(key=lambda item: (str(item["name"]), str(item["version"])))
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
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"{args.output}: {len(components)} components")


if __name__ == "__main__":
    main()
