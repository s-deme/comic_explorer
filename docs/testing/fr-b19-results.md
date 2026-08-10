---
codd:
  node_id: "test:fr-b19-results"
  type: test
  status: active
  confidence: 0.9
  depends_on:
    - id: "req:roadmap-priorities"
      relation: "verifies"
      semantic: "p7-settings-help-contract"
    - id: "test:fr-b18-results"
      relation: "derives_from"
      semantic: "current-session-display-boundary"
---

# FR-B19 設定・help — 受入結果

## 判定

P7（FR-B19）は `Implemented / PASS`、roadmap状態は`Done`とする。統合設定のatomic Apply/Cancel、
保存失敗時の非適用、strict profile import/export、shortcut/gesture conflictとViewer接続、offline
help、build version/runtime/license notice導線を`FT-B19-001`〜`005`の実行可能caseで直接観測した。

## 2026-08-10 Windows focused実測

| 実行対象 | 結果 | 直接観測した範囲 |
|---|---|---|
| `src/features/settings/profile.test.ts` | 30 PASS / 0 FAIL | package version参照、既知profile version、全enum/boolean、有限かつ範囲内scale、必須workspace field、shortcut/gestureの欠落・不正・競合拒否、未知field除外 |
| `App.test.tsx` / `Viewer.test.tsx` / `profile.test.ts` の `-t FT-B19-` | exact 5 PASS / 0 FAIL、89 excluded-by-pattern | `FT-B19-001`〜`005`の統合設定、profile、gesture、help、About接続 |
| Rust `cargo test --locked --lib fr_b19_` | 1 PASS / 0 FAIL、116 filtered out | backend profileのatomic binding validationとgesture conflict拒否 |
| `src/App.fr-b11.test.tsx` | 3 PASS / 0 FAIL | 補助証跡。統合dialog内shortcutがApply前に保存されず、Apply後に保存され、resetもApplyを必要とすること |

上表はunit/integration境界の結果であり、release製品harnessやWindows WebView2 product gateの結果ではない。
それらを上記5件のPASS数へ加算しない。全体gateは最終verificationの記録を正本とする。

## 要件上のfocused ID

| Test ID | 判定 | 根拠・不足 |
|---|---|---|
| `FT-B19-001` | PASS | 現行testをWindows-nativeで選択実行し、Applyまでactive stateを変えずCancelで破棄することを観測 |
| `FT-B19-002` | PASS | JSON download開始と失敗境界、strict profile importをdraftだけへ反映し、Apply前にactive stateやbackendを変更しないことを観測 |
| `FT-B19-003` | PASS | 設定済みswipeで前後pageへ移動し、double-clickでViewerを閉じる接続を観測。profile/backendは重複actionを拒否 |
| `FT-B19-004` | PASS | Help menuからoffline一般help本文を開き、主要なopen/Esc操作説明を表示 |
| `FT-B19-005` | PASS | package metadata由来version、実runtime label、bundle済みthird-party noticeを開くoffline導線を表示 |
