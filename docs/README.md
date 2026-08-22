# Comic Explorer documentation

最初に機能の全体像を確認し、必要に応じて正本や検証証跡へ進む。

## 機能一覧

| 文書 | 内容 |
|---|---|
| [実装済み機能](implemented-features.md) | 現在利用できる機能を分野別に整理した一覧 |
| [未実装・非採用機能](unimplemented-features.md) | 未実装、部分実装、代替仕様、非採用、検証待ちの区別 |

機能一覧は人が全体像を把握するための索引であり、状態を変更する正本ではない。Leeyes互換機能の
行単位の状態は `current/leeyes-feature-tracker.csv`、現行要件の状態は `current/status.md` を参照する。

## 保守用の正本

実装完了後の保守で参照するCoDD正本は `current/` の次の4文書である。

| 文書 | 内容 |
|---|---|
| [requirements.md](current/requirements.md) | 現行の機能・非機能要件と採用境界 |
| [architecture.md](current/architecture.md) | 実装済みシステムの構成と安全境界 |
| [status.md](current/status.md) | 機能状態、未完了gate、候補・非採用 |
| [verification.md](current/verification.md) | 最新検証結果、実行コマンド、未実測項目 |

`current/leeyes-feature-tracker.md` はLeeyes互換台帳の運用規則、CSV 2ファイルは行単位の状態と
実装順序を管理する。統合前の要件、設計、計画、個別結果はGit履歴で参照・復元する。

CoDDは `docs/current/` を走査する。文書変更時はWindows-native runnerで`scan`、`impact`、
`check`を実行し、実行可能コードまたはテストへ影響する場合に`verify`を実行する。未実行、
未測定、`BLOCKED`を`PASS`へ読み替えない。
