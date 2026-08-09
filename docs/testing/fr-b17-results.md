---
codd:
  node_id: "test:fr-b17-results"
  type: test
  status: active
  confidence: 0.9
  depends_on:
    - id: "req:roadmap-priorities"
      relation: "verifies"
      semantic: "p5-reference-shell-contract"
    - id: "test:fr-b16-results"
      relation: "derives_from"
      semantic: "filtered-catalog-command-boundary"
---

# FR-B17 参照shell UI — 受入結果

P5（FR-B17）は `Implemented / PASS` とする。先行commandを呼ぶaccessible icon toolbarと、既存の
virtualized catalogへ`reference_tile` view modeを追加した。処理の二重実装、外部通信、原本書込みはない。

| Test ID | 結果 | 直接観測 |
|---|---|---|
| FT-B17-001 | PASS | menu/toolbarが既存refresh/copy/properties/bookshelf commandへ接続 |
| FT-B17-002 | PASS | toolbar icon buttonのaccessible labelとdisabled境界 |
| FT-B17-003 | PASS | reference_tile enum、density、thumbnail、keyboard grid回帰 |

view-mode focused 5 tests、CatalogGrid回帰6 tests、typecheckはPASS。Windows-native CoDD
scan/check/verifyはexit 0、red 0。DPI/実機visual pixel測定は未実施のため、component evidenceを
製品DPI gateへ読み替えない。
