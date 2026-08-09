---
codd:
  node_id: "test:fr-b13-results"
  type: test
  status: active
  confidence: 0.9
  depends_on:
    - id: "req:roadmap-priorities"
      relation: "verifies"
      semantic: "p1-catalog-command-contract"
    - id: "design:screen-flow"
      relation: "verifies"
      semantic: "connected-catalog-shell"
---

# FR-B13 catalog command基盤 — 受入結果

P1（FR-B13）は `Implemented / PASS` とする。F5/menu更新、複数選択、相対path copy、property
dialog、現在位置statusを既存AppとCatalogGridへ接続した。library root、原本、sidecar、外部通信は
変更しない。

| Test ID | 結果 | 直接観測 |
|---|---|---|
| FT-B13-001 | PASS | `App`のF5/menu更新が現在folderのlist commandへ接続される実装 |
| FT-B13-002 | PASS | `CatalogGrid`修飾キー選択とcommandsのkind/all/invert/clear |
| FT-B13-003 | PASS | selected relative pathをclipboardへ渡すApp command |
| FT-B13-004 | PASS | 単一選択のproperty dialogにname/kind/path/size/modified |
| FT-B13-005 | PASS | sort後のselection index、total、selection countをstatusへ表示 |

Focused実行は `commands.test.ts` 3 tests、既存 `CatalogGrid.test.tsx` 6 testsの合計9 testsで、
PASS 9 / FAIL 0 / SKIP 0。`npm run typecheck`もPASS。Windows-native product gateはこのWSL環境に
PowerShellがないため未実行であり、component evidenceを製品実機PASSへ読み替えない。
