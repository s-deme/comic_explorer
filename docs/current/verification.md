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

2026-08-29時点で、最新のコード変更に対するWindows build、CoDD scan/check/verify、aggregate testは成功している。
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

release WebView2での目視操作、実機性能、assistive technology、clean VM配布確認は、自動gateのPASSと別の未測定項目である。
