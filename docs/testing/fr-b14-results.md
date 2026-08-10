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
既存back/forward stackの履歴dropdown、明示終了をAppへ接続した。再監査では単独画像の1 page
Viewer、任意history jump、root切替時のrecent破棄、古いopen generationの無効化も確認した。

| Test ID | 結果 | 直接観測 |
|---|---|---|
| FT-B14-001 | PASS | `App.test.tsx`とRust focused testでcatalog画像を1 page Viewerへ接続し、folder/comic/archiveの既存open回帰も維持 |
| FT-B14-002 | PASS | successful viewer openだけをrecentへ追加し、`App.test.tsx`でroot変更後の旧open応答がViewer/recentを再生成しないことを確認 |
| FT-B14-003 | PASS | `navigation.test.ts` 5 testsで任意back/forward jump、stack保存、重複path・不正indexを確認し、Appの履歴導線回帰もPASS |
| FT-B14-004 | PASS | Appのfile menuからnative quitを明示要求し、tray収納とは別commandであることをcomponent testで確認 |

2026-08-10にWindows-native Nodeで `App.test.tsx` 52、`navigation.test.ts` 5を含むP1〜P3共有回帰
6 filesを実行し、PASS 85 / FAIL 0 / SKIP 0を実測した。Windows-native Cargoの
`fr_b14_single_image_is_a_valid_one_page_viewer_item`もPASS 1 / FAIL 0、
`scripts/run-typecheck-windows.ps1`もexit 0。native Tauri/WebView2の製品UIハーネスは今回未実行であり、
component/Rust unit evidenceを製品実機PASSへは読み替えない。
最終Windows-native CoDD scan/check/verifyはexit 0（red 0、advisoryのみ）。未実測gateをPASSへ
加算しない。
