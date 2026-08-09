---
codd:
  node_id: "test:fr-b18-results"
  type: test
  status: active
  confidence: 0.9
  depends_on:
    - id: "req:roadmap-priorities"
      relation: "verifies"
      semantic: "p6-workspace-window-contract"
    - id: "test:fr-b17-results"
      relation: "derives_from"
      semantic: "reference-shell-command-boundary"
---

# FR-B18 workspace・window — 受入結果

P6（FR-B18）は `Implemented / PASS` とする。folder tree、menu bar、toolbarをcurrent-sessionで可逆切替し、
viewerを分離表示できるようにした。Escは分離表示からcatalogへ戻る導線として扱い、終了とは分離した。

| Test ID | 結果 | 直接観測 |
|---|---|---|
| FT-B18-001 | PASS | tree表示状態とfull-width catalog列の境界 |
| FT-B18-002 | PASS | menu/toolbarのgrid row切替とUI復帰 |
| FT-B18-003 | PASS | viewer分離表示、ボタン復帰、Esc復帰 |
| FT-B18-004 | PASS | tray APIなし環境で収納操作をdisabledにする安全境界 |

workspace focused 3 tests、Viewer回帰9 tests、App回帰40 tests、typecheckはPASS。Windows-native CoDD
scan/check/verifyはexit 0、red 0。実機notification areaのnative tray表示は、現行WebView2テスト環境に
tray APIがないため未測定であり、disabledをPASSへ読み替えない。
