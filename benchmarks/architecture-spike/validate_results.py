#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("usage: validate_results.py RESULT.json")
    payload = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
    assert payload["schemaVersion"] == 1
    assert payload["classification"] == "measured-foundation-only"
    assert payload["notMeasured"]
    assert payload["results"]
    for result in payload["results"].values():
        assert len(result["samplesMs"]) >= 3
        assert 0 <= result["medianMs"] <= result["p95Ms"]
        assert result["peakPythonAllocationBytes"] >= 0
    print("valid")


if __name__ == "__main__":
    main()
