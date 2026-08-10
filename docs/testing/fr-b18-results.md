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

P6（FR-B18）の実装状態は `Implemented / BLOCKED` とする。folder tree、menu bar、toolbarの
current-session可逆切替、viewer分離、native tray commandは実装されている。component testとWindows
Rust testでは安全境界を確認したが、release WebView2のnotification areaでtray icon、native
hide/show/focus、tray menuの終了を直接観測していないため、P6全体をPASSへ昇格しない。

| Test ID | 結果 | 直接観測 |
|---|---|---|
| FT-B18-001 | PARTIAL | tree表示時/非表示時のcolumn計算と復帰state。App上のpane切替を専用focused testでは未測定 |
| FT-B18-002 | PARTIAL | 7 surfaceのrow順、menu/toolbar非表示時のtrack除去、復帰state。App DOM上の可逆切替を専用focused testでは未測定 |
| FT-B18-003 | PASS | viewer分離表示と、分離buttonにfocusが残る実操作条件でのEsc復帰 |
| FT-B18-004 | BLOCKED | Appからnative収納commandと終了commandを分離し、Rust mockでhide/show/unminimize/focus、初期化・操作失敗を観測。実notification areaは未測定 |

2026-08-10のWindows-native再実測では、workspace helper 5 tests、Viewer 12 tests、App 52 tests、
native tray Rust mock 8 tests、typecheckがPASSした。Rust testはWindows cfgのTauri tray callbackと
native window controller実装をcompileし、mock controllerへの操作順と失敗stateを検証する。

残るproduct gateは、release WebView2上でtray iconがnotification areaへ現れること、収納でmain
windowが実際にhideされること、tray click/menuでshow・unminimize・focusされること、収納と終了が
process lifecycle上でも分離されることの直接観測である。このgateが利用できない間は`BLOCKED`を保つ。
source test labelは`FT-B18-001`=tree、`FT-B18-002`=menu/toolbar、`FT-B18-003`=detached Esc、
`FT-B18-004`=native tray command分離へ同期済みである。
