---
codd:
  node_id: "doc:documentation-index"
  type: documentation
  status: active
---

# Comic Explorer ドキュメント案内

このディレクトリには、要件、設計、実装計画、検証結果を CoDD の依存関係に沿って
整理している。迷ったときは、まずこの文書で目的に対応する正本を確認する。

## 文書の構成

```text
docs/
├── requirements/  要件の正本と、要件の入力資料
├── product/       機能の採否・状態・実装順
├── decisions/     採用済みの技術・設計判断
├── research/      判断に使った調査・比較・実測
├── design/        アーキテクチャ、画面、実装計画
├── testing/       テスト契約、実行結果、リリースゲート
└── archive/       現行判断に使わない履歴資料
```

## 正本と使い分け

| 知りたいこと | 参照する文書 | 正本の範囲 |
|---|---|---|
| プロダクトの目的と初期スコープ | [MVP要件](requirements/mvp-requirements.md) | MVPの要件・受入条件 |
| ヒアリングの回答と将来候補 | [要件ヒアリングシート](requirements/product-questionnaire.md) | 入力資料。採用決定ではない |
| 機能の採否・実装状態・検証状態 | [機能ステータス台帳](product/feature-status.md) | 機能単位の現在状態 |
| 未実装機能の実装順 | [機能ロードマップ](product/feature-roadmap.md) | 優先順位とバッチ運用。状態の正本ではない |
| 個別 Feature Lane の契約 | `requirements/*-requirements.md` | 採用済み機能の要件 |
| 技術採用の理由 | [ADR-001](decisions/adr-001-technology-stack.md) | 採用済み技術スタックの決定 |
| 技術比較や未確定の調査 | [技術構成評価](research/technology-evaluation.md) | ADRを補足する調査記録 |
| システム境界と責務 | [アーキテクチャ](design/architecture.md) | 実装が従う技術設計 |
| 画面と操作の振る舞い | [画面構成・操作フロー](design/screen-flow.md) | UI状態・操作・画面遷移 |
| 実装フェーズと追跡 | [製造実装計画](design/implementation-plan.md) | 実装順・フェーズ・MVP判定 |
| テストの考え方と契約 | [テスト戦略](testing/test-strategy.md)、[テストケース](testing/test-cases.md) | テストの目的・ケース定義 |
| 最新の総合検証結果 | [Phase 6検証結果](testing/phase6-verification-results.md) | 自動検証・配布・未完了ゲートの集計 |
| 個別ケースの判定 | [Phase 6ケース結果](testing/phase6-case-results.md) | ケースごとの実行結果 |
| 外部環境での再検証手順 | [手動テスト手順](testing/phase6-manual-procedures.md) | BLOCKED項目の実施方法 |
| MVPの実装・リリース概要 | [MVP実装状況](testing/mvp-implementation-status.md) | 概要レベルのリリース判定 |

Feature Lane の結果 (`testing/fr-bXX-results.md`) は、対応する要件と機能ステータスを
補足する受入証跡である。機能の現在状態を結果ファイルだけで判断しない。

## 推奨する読み方

- 初めて読む場合: [MVP要件](requirements/mvp-requirements.md) → [画面構成・操作フロー](design/screen-flow.md) → [アーキテクチャ](design/architecture.md) → [テスト戦略](testing/test-strategy.md)
- 機能を変更する場合: [機能ステータス台帳](product/feature-status.md) → 対応する要件 → [画面またはアーキテクチャ設計](design/) → 対応するテストケース・結果
- リリース可否を確認する場合: [MVP実装状況](testing/mvp-implementation-status.md) → [Phase 6検証結果](testing/phase6-verification-results.md) → [個別ケース結果](testing/phase6-case-results.md)

## 状態の扱い

`feature-status.md` の実装状態 (`Implemented`、`Partial`、`Planned`、`Candidate`、
`Deferred`、`Rejected`) と検証状態 (`PASS`、`FAIL`、`BLOCKED`、`NOT TESTED`) は別の
軸である。ロードマップの `Planned`、`In Progress`、`Blocked`、`Done` も運用状態であり、
台帳の状態を上書きしない。未実行・外部環境待ちを `PASS` とみなさない。

## 更新ルール

1. 要件を変更する場合は、対応する要件文書を先に更新し、設計・実装・テストへの影響を確認する。
2. 現在状態は正本だけを更新し、別文書には同じ表を複製せずリンクする。
3. テストケースの定義と実行結果を混在させない。定義は `test-cases.md`、結果は対応する結果文書に記録する。
4. リリース判定を変更した場合は、`phase6-case-results.md` と `mvp-implementation-status.md` の整合を確認する。
5. 現行の判断に使わない計画・完了証跡は削除せず `archive/` に移し、現行文書から参照しない。
6. 文書を変更したら `.venv/bin/codd scan`、`.venv/bin/codd check` を実行する。実装やテストに影響する場合は `.venv/bin/codd verify` も実行する。

`archive/` の資料は履歴確認専用であり、現在の要件、状態、リリース判定の根拠に使わない。
