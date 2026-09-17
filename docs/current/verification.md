---
codd:
  node_id: "test:project-verification"
  type: test
  status: approved
  confidence: 0.95
  depends_on:
    - id: "req:project-requirements"
      relation: "verifies"
      semantic: "behavioral-contract"
    - id: "design:project-architecture"
      relation: "verifies"
      semantic: "system-boundary"
---

# Comic Explorer 現行検証

## 現在の自動gate

Windows filesystemでは次を正規の入口とする。

| 対象 | 入口 |
|---|---|
| CoDD scan/check/verify | `scripts/run-codd-windows.ps1` |
| aggregate test | `scripts/run-tests-windows.ps1` |
| TypeScript typecheck | `scripts/run-typecheck-windows.ps1` |
| production build | `scripts/run-build-windows.ps1` |
| feature canonical | `scripts/verify-feature-windows.ps1 -Feature <ID> -RustMode Canonical` |

2026-08-29に記録された当時のコード変更に対して、Windows build、CoDD scan/check/verify、aggregate testは成功している。対象commit SHAとCI run URLは当時の文書に記録されていないため、この記録だけを現在のHEADに対するPASSとは扱わない。
aggregate testは2 workerを既定とし、最終CoDD verifyが同じaggregate testを実行するため、直前に重複実行しない。

## MVP release case summary

| 結果 | 件数 |
| --- | ---: |
| PASS | 60 |
| FAIL | 0 |
| BLOCKED | 12 |
| NOT RUN | 1 |
| **合計** | **73** |

## 記録規則

- 変更中は影響箇所のfocused testとtypecheckを使い、最終変更後にbuildとCoDD scan/check/verifyを1回実行する。
- gate再実行は、修正または診断済みのintermittent failureが理由の場合だけ記録する。
- advisory、SKIP、VACUOUS、未測定はPASSへ合算しない。
- feature単位の実装・テスト・gate参照はCSV台帳へ記録する。過去の実行ログはGit履歴を参照する。

## 未測定

2026-09-17のWindows版変更（閉じる権限、ページプレビュー、アニメーションWebP）では、CoDD scan/check/verify、TypeScript typecheck、Rust canonical test、release EXE buildとfreshness確認が成功した。feature canonical（IMP-015）はproduct-webp段階で失敗しており、全体PASSではない。UI harnessの再試行でもViewerのCDP接続を確認できず、閉じる操作・プレビュー・アニメーションの実画面検証は未完了。AVIFの実サンプル表示も未検証。

release WebView2での目視操作、実機性能、assistive technology、clean VM配布確認は、自動gateのPASSと別の未測定項目である。

## 文書整合性の既知事項

2026-08-31の文書監査では、`leeyes-feature-tracker.csv` の `acceptance_ref` 97行と `verification_refs` 106行が、簡略化前の `requirements.md`／`verification.md` の見出しを参照していた。参照先アンカーが現行文書に存在しないため、CSVの値が空でないことだけでは追跡可能とは判定しない。旧見出しを安定した履歴文書へ復元するか、各行を現存する要件ID・検証記録へ対応付けてから参照整合性をPASSとする。

同梱ヘルプの旧スクロール表示説明はページプレビュー追加時にpaged Viewer契約へ合わせた。連続縦読みは対応機能に含めない。
