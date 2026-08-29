---
codd:
  node_id: "doc:leeyes-feature-tracker"
  type: documentation
  status: approved
  confidence: 0.95
---

# Leeyes 互換機能トラッカー

`leeyes-feature-tracker.csv` が1機能1行の正本、`leeyes-implementation-manifest.csv` が選択済み実装順の正本である。
調査の根拠と過去の判断はGit履歴に残す。

## 更新規則

- 利用者が指定したIDだけを `Selected` にする。近接機能を自動選択しない。
- 要件を先に定義し、実装・テスト・検証・publishの順に同じ行へ参照を記録する。
- `Published` は必要な検証に通り、upstreamへpush済みの場合だけにする。未測定は完了扱いにしない。
- CSVの列定義、enum、件数、tier順、依存順は自動テストで検証する。複数値はセミコロン区切りにする。

## 日常ビュー

- `decision_status=Undecided`: 次に選ぶ候補
- `decision_status=Selected` かつ `delivery_status!=Published`: 現在の作業
- `delivery_status=Published`: 完了済み

台帳全体は監査、重複防止、依存確認のために保持する。進捗集計や機能説明を他のMarkdownへ複写しない。
