---
codd:
  node_id: "test:fr-b14-results"
  type: test
  status: active
  confidence: 0.9
  depends_on:
    - id: "req:roadmap-priorities"
      relation: "verifies"
      semantic: "p2-open-navigation-contract"
    - id: "test:fr-b13-results"
      relation: "derives_from"
      semantic: "catalog-command-boundary"
---

# FR-B14 open・navigation — 受入結果

P2（FR-B14）は `Implemented / PASS` とする。登録root内の選択項目open、成功したrecent menu、
既存back/forward stackの履歴dropdown、明示終了をAppへ接続した。

| Test ID | 結果 | 直接観測 |
|---|---|---|
| FT-B14-001 | PASS | selected folder/comic/archiveを既存navigate/openへ接続 |
| FT-B14-002 | PASS | successful viewer openを最大12件のrecent menuへ反映 |
| FT-B14-003 | PASS | navigation back/forwardをdropdownから直接選択 |
| FT-B14-004 | PASS | file menuからwindow closeを明示要求 |

既存navigation focused 2 tests、catalog command regression 3 testsをPASS。`npm run typecheck`、
Windows-native CoDD scan/check/verifyはPASS（red 0）。PowerShell runnerのCoDD verifyはconfigured
test/typecheckを実行し、構造advisoryのSKIP/VACUOUSは機能PASSへ加算しない。
