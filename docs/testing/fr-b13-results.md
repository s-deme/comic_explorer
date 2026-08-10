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
dialog、現在位置statusを既存AppとCatalogGridへ接続した。再監査では、F5後の複数selection復元、
filter後のvisible row限定selection、通常file/画像のkind選択、固定anchorによる連続Shift+方向keyも
確認した。library root、原本、sidecar、外部通信は変更しない。

| Test ID | 結果 | 直接観測 |
|---|---|---|
| FT-B13-001 | PASS | `App.test.tsx`でF5後に存続する複数selectionだけを復元し、消えた行を除外 |
| FT-B13-002 | PASS | `App.test.tsx`で連続Shift+方向keyが元anchorから範囲を拡張し、`CatalogGrid.test.tsx`と`commands.test.ts`でkeyboard・kind・range境界を回帰 |
| FT-B13-003 | PASS | selected relative pathをclipboardへ渡すApp command |
| FT-B13-004 | PASS | 単一選択のproperty dialogにname/kind/path/size/modified |
| FT-B13-005 | PASS | sort後のselection index、total、selection countをstatusへ表示 |

2026-08-10にWindows-native Nodeで `App.test.tsx` 52、`CatalogGrid.test.tsx` 8、
`commands.test.ts` 3を含むP1〜P3共有回帰6 filesを実行し、PASS 85 / FAIL 0 / SKIP 0を実測した。
`scripts/run-typecheck-windows.ps1`もexit 0。これはVitest/jsdomのcomponent evidenceであり、
native Tauri/WebView2の製品UIハーネスは今回未実行のため、製品実機PASSへは読み替えない。
最終Windows-native CoDD scan/check/verifyはexit 0（red 0、advisoryのみ）。未実測gateをPASSへ
加算しない。
