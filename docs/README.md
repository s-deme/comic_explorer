# Comic Explorer documentation

利用者向けの機能概要、対応形式、制限はリポジトリの [README](../README.md) を参照する。
ここには保守・検証に必要な正本だけを置く。機能名、状態、採否理由をMarkdownへ重複記載しない。

## 保守・検証の正本

| 文書 | 内容 |
|---|---|
| [requirements.md](current/requirements.md) | 現行の機能・非機能要件と採用境界 |
| [architecture.md](current/architecture.md) | 実装済みシステムの構成と安全境界 |
| [status.md](current/status.md) | 機能状態、未完了gate、候補・非採用 |
| [verification.md](current/verification.md) | 最新検証結果、実行コマンド、未実測項目 |
| [leeyes-feature-tracker.csv](current/leeyes-feature-tracker.csv) | Leeyes互換機能ごとの状態、要件、実装・テスト・検証証跡 |
| [leeyes-implementation-manifest.csv](current/leeyes-implementation-manifest.csv) | 選択済み機能の実装順序 |

`current/leeyes-feature-tracker.md` はCSV台帳の更新規則である。統合前の要件、設計、計画、個別結果はGit履歴で参照・復元する。

CoDDは `docs/current/` を走査する。文書変更時はWindows-native runnerで`scan`、`impact`、
`check`を実行し、実行可能コードまたはテストへ影響する場合に`verify`を実行する。未実行、
未測定、`BLOCKED`を`PASS`へ読み替えない。
