---
codd:
  node_id: "test:fr-b16-results"
  type: test
  status: active
  confidence: 0.9
  depends_on:
    - id: "req:roadmap-priorities"
      relation: "verifies"
      semantic: "p4-filter-export-contract"
    - id: "test:fr-b13-results"
      relation: "derives_from"
      semantic: "catalog-selection-and-status-boundary"
---

# FR-B16 filter・export — 受入結果

P4（FR-B16）は `Implemented / PASS` とする。current-sessionのbasename maskをcatalog/statusへ接続し、
filtered rowsをrelative pathだけのCSVへ出力した。library原本、sidecar、外部通信は変更しない。

| Test ID | 結果 | 直接観測 |
|---|---|---|
| FT-B16-001 | PASS | `*`/`?`/`;`、case-insensitive、空mask、filtered status |
| FT-B16-002 | PASS | CSV header/escaping、kind/size/modified、absolute path除外 |

`commands.test.ts` 3 tests、CatalogGrid回帰6 tests、typecheckはPASS。Windows-native CoDD
scan/check/verifyはexit 0、red 0。CSV生成不能時のbrowser errorは通知境界へ留め、元データを変更しない。
