# Comic Explorer documentation

実装完了後の保守で参照する正本は `current/` の4文書だけである。

| 文書 | 内容 |
|---|---|
| [requirements.md](current/requirements.md) | 現行の機能・非機能要件と採用境界 |
| [architecture.md](current/architecture.md) | 実装済みシステムの構成と安全境界 |
| [status.md](current/status.md) | 機能状態、未完了gate、候補・非採用 |
| [verification.md](current/verification.md) | 最新検証結果、実行コマンド、未実測項目 |

`archive/` は統合前の要件、設計、計画、テスト仕様、個別結果、完了プロンプトを
元の分類を保って格納した履歴である。現在状態の判定には使わず、調査や過去の詳細証跡が
必要な場合だけ参照する。

CoDDは `docs/current/` だけを走査する。文書変更時はWindows-native runnerで
`scan`、`impact`、`check`を実行し、実行可能コードまたはテストへ影響する場合に
`verify`を実行する。未実行、未測定、`BLOCKED`を`PASS`へ読み替えない。
