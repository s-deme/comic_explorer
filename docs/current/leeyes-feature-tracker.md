---
codd:
  node_id: "doc:leeyes-feature-tracker"
  type: documentation
  status: approved
  confidence: 0.95
---

# Leeyes 互換機能トラッカー運用ガイド

## 目的

192件の機能を、人間の記憶や会話履歴ではなく、1機能1行の台帳で継続管理する。

役割を次の2ファイルへ分離する。

- .tools/leeyes-2.6.1-feature-audit.md: Leeyesの挙動、証拠、Comic Explorerとの差分を説明する調査記録
- docs/current/leeyes-feature-tracker.csv: 採否、優先順位、実装進捗、要件、実装、テスト、検証、成果参照を更新する運用上の正本
- docs/current/leeyes-implementation-manifest.csv: 2026-08-21に一括承認された103件のP1〜P5順序を固定する実装マニフェスト

2026-08-20に最初の実装対象としてLEY-VIEWER-004、LEY-VIEWER-025、LEY-VIEWER-028が選択されたため、トラッカーと本ガイドをdocs/currentへ昇格した。以後、選択機能の要件・実装・テストと同じ変更単位で必ず台帳も更新する。

## 状態を分ける理由

baseline_status と delivery_status は別の意味を持つ。

- baseline_status: 2026-08-20の比較調査時点で、Comic ExplorerがLeeyesの目的をどの程度満たしていたか。再調査しない限り書き換えない。
- decision_status: この移行計画でその機能を実装対象にするか。
- delivery_status: 選択後の作業がどこまで進んだか。

この分離により「当初はPartialだったが、選択・実装・検証を経て完了した」という履歴を失わない。

## 列定義

| 列 | 内容 | 更新時期 |
|---|---|---|
| leeyes_id | 安定ID。変更・再利用しない | 固定 |
| category | 分類 | 原則固定 |
| feature_name | 人間向け短縮名 | 意味を変えない範囲で修正可 |
| baseline_status | Equivalent / Partial / Missing / Alternative / Rejected / Unknown | 再監査時のみ |
| decision_status | 採否 | ID選択・延期・却下時 |
| delivery_status | 実装ライフサイクル | 各工程終了時 |
| size | S / M / L / XL / NA | 分割後に再見積り可 |
| priority_tier | P1 / P2 / P3 / P4 / P5。今回の対象外は空欄 | 選択時 |
| priority_rank | tier内の1始まり連番 | 選択時 |
| priority_reason | 依存、既存Partial、利用頻度、規模を踏まえた順序理由 | 選択時 |
| requirement_ids | docs/current/requirements.md の正確な要件ID。複数はセミコロン区切り | 着手前 |
| acceptance_ref | 受入条件の節または要件ID | 着手前 |
| implementation_refs | 実装ファイル・symbol。複数はセミコロン区切り | 実装時 |
| test_refs | 自動テストのファイル・test名 | テスト追加時 |
| verification_refs | verificationの記録・実行したgate | 検証時 |
| dependencies | 先に必要な機能ID・基盤 | 選択・計画時 |
| risk_notes | security・性能・UI上の注意 | 常時 |
| updated_at | 最終更新日 YYYY-MM-DD | 状態更新時 |
| delivery_ref | 実装を含むcommit等。SELFは同じcommitを意味する | 公開時 |

CSV内で複数値を持つ場合はカンマではなくセミコロンで区切る。

## decision_status

| 値 | 意味 |
|---|---|
| Undecided | Missing / Partialで、まだ利用者が採否を決めていない |
| Selected | 利用者が明示的に実装対象へ選んだ |
| Deferred | 実装候補だが今回は延期 |
| Declined | 利用者判断で実装しない |
| NoAction | Equivalentで追加実装が不要 |
| ReviewAlternative | 安全な代替方式を維持するか、厳密互換を求めるか判断待ち |
| DeclinedSafety | 安全上の理由から互換実装を非推奨として除外 |

Selected への変更は、利用者が指定したIDだけに行う。2026-08-21の一括実装指示は
`leeyes-implementation-manifest.csv`の103件すべてを指定した承認として記録する。近接機能や依存機能を
自動選択しない。依存機能が必要なら dependencies に記録し、対象外IDの互換方式を変更せず既存の安全な
境界または内部共通基盤を利用する。

## delivery_status

| 値 | 意味 | 必須証拠 |
|---|---|---|
| Existing | 比較開始時点ですでに同等機能が存在 | 調査記録 |
| PartialExisting | 比較開始時点で一部だけ存在 | 調査記録と具体的不足 |
| AlternativeExisting | 別方式で目的を満たす | 代替理由と安全境界 |
| Rejected | 互換実装を非推奨 | risk_notes |
| Unknown | 証拠不足 | 未確認理由 |
| NotStarted | 未実装・未着手 | baseline_status=Missing |
| Planned | 選択済みで要件・受入条件・依存が確定 | requirement_ids と acceptance_ref |
| InProgress | 要件更新後にCoDD scan/impactを行い実装中 | 影響範囲 |
| Implemented | コードと自動テストが追加済みだが最終gate未完了 | implementation_refs と test_refs |
| Verified | 必要なWindows-native検証とCoDD gateが成功 | verification_refs |
| Published | 検証済み変更をcommit・upstreamへpush済み | delivery_ref |
| Blocked | 外部条件により完了不能 | blockerをrisk_notesへ記録 |

正常系の遷移:

    NotStarted または PartialExisting
      -> Planned
      -> InProgress
      -> Implemented
      -> Verified
      -> Published

途中の工程を推測で飛ばさない。未測定項目がある場合は Verified にしない。

## ID選択後の更新手順

1. 利用者が指定したIDだけ decision_status を Selected にし、priority_tier、priority_rank、priority_reasonを記録する。
2. 大きなIDは受入可能な小単位へ分解する。ただし元のLeeyes IDは親キーとして保持する。
3. requirements.md を先に更新し、requirement_ids と acceptance_ref を埋める。
4. Windows-native CoDD scan と impact を実行する。
5. delivery_status を Planned、着手時に InProgress へ進める。
6. 実装後に implementation_refs と test_refs を埋める。
7. Windows-native test・typecheck・Rust test・buildおよび最終CoDD scan/check/verifyを実行する。
8. 成功した検証だけ verification_refs へ記録し、Verified にする。
9. scoped diffをcommit・pushし、Published と delivery_ref を記録する。
10. 無関係なIDのdecision_statusやdelivery_statusを一緒に変更しない。

今回の103件はP1 21件、P2 16件、P3 31件、P4 12件、P5 23件である。各tierのrankは
連番とし、マニフェスト内依存は必ず同じtierの小さいrankまたは前tierを指す。

同じcommitに実装と台帳更新を含める場合、delivery_ref は SELF と記録できる。後から実ハッシュが必要な場合は git blame または当該行を追加したcommitから解決する。別の台帳同期commitを作る場合は git:<short-hash> を記録する。

## 完了判定

機能を「実装済み」と数えるのは delivery_status が Verified または Published の場合だけとする。

- Existing は「比較前から存在」であり、今回の移行作業で実装済みになった件数には含めない。
- PartialExisting は未完了。
- Implemented は検証前なので未完了。
- AlternativeExisting は代替採用が確定するまで ReviewAlternative。
- Rejected は未実装ではなく、意図的な非採用として別集計する。

## 標準ビュー

PowerShellで台帳を絞り込める。

未決定の実装候補:

    Import-Csv docs\current\leeyes-feature-tracker.csv |
      Where-Object decision_status -eq Undecided |
      Sort-Object category leeyes_id

選択済みの作業キュー:

    Import-Csv docs\current\leeyes-feature-tracker.csv |
      Where-Object decision_status -eq Selected |
      Sort-Object delivery_status leeyes_id

今回の実装完了:

    Import-Csv docs\current\leeyes-feature-tracker.csv |
      Where-Object delivery_status -in Verified,Published |
      Sort-Object leeyes_id

安全上の非採用:

    Import-Csv docs\current\leeyes-feature-tracker.csv |
      Where-Object decision_status -eq DeclinedSafety

分類・baseline別集計:

    Import-Csv docs\current\leeyes-feature-tracker.csv |
      Group-Object category baseline_status |
      Sort-Object Name |
      Select-Object Name Count

## 機械検証ルール

trackedトラッカーには次の整合性検査を適用する。

1. leeyes_id は192件かつ一意。
2. IDの分類prefixとcategoryが一致。
3. enum外のbaseline_status・decision_status・delivery_statusを拒否。
4. SelectedかつPlanned以降なら requirement_ids と acceptance_ref が必須。
5. Implemented以降なら implementation_refs と test_refs が必須。
6. Verified以降なら verification_refs が必須。
7. Publishedなら delivery_ref が必須。
8. DeclinedSafetyなら risk_notes が必須。
9. baseline_status=Equivalent の初期delivery_statusは Existing。
10. baseline_status=Missing の初期delivery_statusは NotStarted。
11. 実装マニフェストは103件かつ一意で、Missing 67件 / Partial 36件と一致する。
12. P1〜P5の件数とrank連番、trackerとのpriority一致、依存順序を検証する。
13. 既存Published 3件以外のMissing / Partialはすべてマニフェストに含み、対象外statusを混入させない。

これをCIまたはCoDD verificationから実行し、台帳更新漏れを赤gateにする。実装コードだけが進んで台帳が古い状態になることを防ぐ。

## 人間が見るべき最小情報

日常的に見るのは全192行ではなく、次の3集合だけでよい。

- decision_status=Undecided: 次に選ぶ候補
- decision_status=Selected かつ delivery_statusがPublished以外: 現在の作業キュー
- delivery_status=Published: 完了済み

全台帳は監査・重複防止・依存確認のために残す。
