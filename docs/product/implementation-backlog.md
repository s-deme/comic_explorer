---
codd:
  node_id: "doc:implementation-backlog"
  type: design
  status: active
  depends_on:
    - id: "doc:feature-status"
      relation: "derives_from"
      semantic: "inventory"
    - id: "doc:feature-roadmap"
      relation: "refines"
      semantic: "execution-order"
---

# Comic Explorer 実装バックログ

## 目的と正本

本書は、未実装または実装未完了の機能を、1件ずつ着手・検証・完了できる作業単位へ
落とし込むための実行台帳である。機能の採否、実装状態、検証状態、根拠の正本は
[機能ステータス台帳](./feature-status.md)に置き、本書はその原子 feature ID を複製して
作業順と着手条件だけを管理する。

ロードマップの `FR-Bxx` は複数機能をまとめる計画単位であり、本書の1行は1つの
`FUT-*` またはリリース確認用の1つの `REQ-*` に対応する。バッチを完了扱いにする前に、
対象行をすべて個別に完了させる。

## 現在の集計

| 区分 | 件数 | 扱い |
|---|---:|---|
| 実装・受入完了 | 5 | 実装、直接観測、正本同期、CoDD gateを完了済み |
| 実装が一部完了・受入待ち | 6 | 既存実装を修正または不足分を実装し、blocked gateを解消する |
| 未実装候補 | 18 | 採用判断、要件化、実装、直接観測を順に行う |
| 保留・未決定 | 5 | 優先度と仕様を決めるまで実装しない |
| 実機・外部環境待ち | 2 | 実装着手ではなく、測定環境を確保して判定する |
| **実装バックログ合計** | **36** | `FUT-R-001`〜`003`、`FUT-R-008` の恒久Rejectedは含めない |

別枠で、実装済み機能のリリース確認待ちを [リリースゲート](#リリース確認バックログ) に記録する。

## 作業状態

| 状態 | 意味 |
|---|---|
| `Next` | 次に着手する1件。常に最大1件だけ置く。まだ実装中ではない |
| `Candidate` | 候補として登録済み。採用判断または要件化が必要 |
| `Deferred` | 優先度・仕様・前提が未決定で保留 |
| `Blocked` | 採用済みまたは測定対象だが、依存・環境・品質ゲートで停止 |
| `In Progress` | 現在実装・検証中。常に最大1件だけ置く |
| `Done` | 実装、直接観測、正本更新、CoDDゲートを完了 |
| `Rejected` | 恒久方針により対象外。台帳の履歴としてのみ保持 |

`Next` と `In Progress` を同時に複数登録しない。作業を開始するときは `Next` を
`In Progress` に変更し、完了または停止したあとに次の1件だけを `Next` にする。

## 着手・完了の共通条件

### Candidate / Deferred の着手

1. 採用範囲、対象外、安全境界を決める。
2. 対応する `docs/requirements/` の要件文書を作成または更新し、CoDD の `scan` と `impact` を実行する。
3. focused test のID、実装境界、必要な環境を決める。
4. この表を `Next` → `In Progress` に更新してから実装する。

### Blocked の再開

1. blocked 理由を解消する作業または環境を明記する。
2. 既存の実装・要件・テストを再確認し、未実装部分だけを変更する。
3. focused test と回帰テストを実行し、未測定を `PASS` に読み替えない。

### Done の条件

実装根拠、直接観測テスト、受入結果が揃い、対応する [機能ステータス台帳](./feature-status.md)、
要件文書、結果文書を同じ変更で更新する。その後 `.venv/bin/codd scan`、`.venv/bin/codd check`、
実装・テストに影響する場合は `.venv/bin/codd verify` を実行する。

## 実装バックログ

作業順は、まず既存の `Partial / BLOCKED` を1件ずつ解消し、その後に未実装候補を
[機能ロードマップ](./feature-roadmap.md)の順で採用判断する。現在の `Next` は `IMP-006` である。

| 順 | 管理ID | Feature ID | 機能 | 現在の台帳状態 | 作業状態 | 次の作業 |
|---:|---|---|---|---|---|---|
| 1 | `IMP-001` | `FUT-C-015` | 縦スクロール | Implemented / PASS | **Done** | focused test、canonical aggregate、CoDD consistencyを記録済み |
| 2 | `IMP-002` | `FUT-C-016` | 横スクロール | Implemented / PASS | **Done** | RTL/LTRのページ順、wheel横移動、focused test、canonical aggregateを記録済み |
| 3 | `IMP-003` | `FUT-C-017` | フルスクリーン | Implemented / PASS | **Done** | `FT-B04-006`でWindows WebView2製品ゲート、原本差分0、focused回帰を完了 |
| 4 | `IMP-004` | `FUT-C-019` | ユーザー定義ショートカット | Implemented / PASS | **Done** | `FT-B11-006`でremap・restart・reset・原本差分0、Rust 79+1を完了 |
| 5 | `IMP-005` | `FUT-C-022` | タグ付与・検索 | Implemented / PASS | **Done** | `FT-B10-005`で付与・検索・rename・restart・remove・原本差分0、canonical aggregateを完了 |
| 6 | `IMP-006` | `FUT-C-023` | メモ保存 | Partial / BLOCKED | **Next** | FR-B07のCoDD・Windows product gateを解消 |
| 7 | `IMP-007` | `FUT-R-004` | 閲覧履歴 | Partial / BLOCKED | Blocked | FR-B07のCoDD・Windows product gateを解消 |
| 8 | `IMP-008` | `FUT-R-005` | 評価 | Partial / BLOCKED | Blocked | FR-B07のCoDD・Windows product gateを解消 |
| 9 | `IMP-009` | `FUT-C-030` | ファイル変更検出 | Partial / BLOCKED | Blocked | FR-B09のCoDD・Windows product gateを解消 |
| 10 | `IMP-010` | `FUT-C-031` | 重複作品検出 | Partial / BLOCKED | Blocked | FR-B09のCoDD・Windows product gateを解消 |
| 11 | `IMP-011` | `FUT-C-032` | 壊れた書庫検出 | Partial / BLOCKED | Blocked | FR-B09のCoDD・Windows product gateを解消 |
| 12 | `IMP-012` | `FUT-C-010` | 名前検索 | Candidate / NOT TESTED | Candidate | 採用範囲を決定しFR-B05要件を作成 |
| 13 | `IMP-013` | `FUT-C-011` | お気に入り・クイックアクセス | Candidate / NOT TESTED | Candidate | 採用範囲を決定しFR-B06要件を作成 |
| 14 | `IMP-014` | `FUT-C-021` | お気に入り保存 | Candidate / NOT TESTED | Candidate | `IMP-013`との境界を決定し要件化 |
| 15 | `IMP-015` | `FUT-C-005` | WebPページ表示 | Candidate / NOT TESTED | Candidate | decoder、ライセンス、対応範囲を確認 |
| 16 | `IMP-016` | `FUT-C-006` | 静止GIF表示 | Candidate / NOT TESTED | Candidate | GIFの対応範囲とdecoderを決定 |
| 17 | `IMP-017` | `FUT-C-007` | アニメーションGIF表示 | Candidate / NOT TESTED | Candidate | 再生・停止・メモリ境界を要件化 |
| 18 | `IMP-018` | `FUT-C-008` | AVIFページ表示 | Candidate / NOT TESTED | Candidate | decoder、ライセンス、対応範囲を確認 |
| 19 | `IMP-019` | `FUT-C-001` | RAR・CBR書庫閲覧 | Candidate / NOT TESTED | Candidate | library、ライセンス、セキュリティ境界を確認 |
| 20 | `IMP-020` | `FUT-C-002` | 7z書庫閲覧 | Candidate / NOT TESTED | Candidate | library、ライセンス、セキュリティ境界を確認 |
| 21 | `IMP-021` | `FUT-C-003` | PDF閲覧 | Candidate / NOT TESTED | Candidate | MVP後の採否とreader境界を決定 |
| 22 | `IMP-022` | `FUT-C-004` | EPUB閲覧 | Candidate / NOT TESTED | Candidate | MVP後の採否とreader境界を決定 |
| 23 | `IMP-023` | `FUT-C-009` | 動画対応 | Candidate / NOT TESTED | Candidate | 対応codec、再生、配布条件を決定 |
| 24 | `IMP-024` | `FUT-C-024` | 名前変更 | Candidate / NOT TESTED | Candidate | 非破壊・確認・undo境界を要件化 |
| 25 | `IMP-025` | `FUT-C-025` | 移動 | Candidate / NOT TESTED | Candidate | 非破壊・確認・失敗回復境界を要件化 |
| 26 | `IMP-026` | `FUT-C-026` | コピー | Candidate / NOT TESTED | Candidate | 非破壊・上書き確認・失敗回復境界を要件化 |
| 27 | `IMP-027` | `FUT-C-027` | 新規フォルダ | Candidate / NOT TESTED | Candidate | 非破壊・権限・失敗回復境界を要件化 |
| 28 | `IMP-028` | `FUT-C-028` | ごみ箱移動 | Candidate / NOT TESTED | Candidate | OS連携、確認、復元境界を要件化 |
| 29 | `IMP-029` | `FUT-C-029` | 完全削除 | Candidate / NOT TESTED | Candidate | TBD-007を再評価し安全条件を承認 |
| 30 | `IMP-030` | `FUT-D-001` | 名前検索性能 | Deferred / NOT TESTED | Deferred | 検索UI採用後に性能受入を確定 |
| 31 | `IMP-031` | `FUT-D-002` | 最大ファイルサイズ | Deferred / NOT TESTED | Deferred | 対象datasetと上限を決定 |
| 32 | `IMP-032` | `FUT-D-003` | 性能計測条件の適用 | Deferred / NOT TESTED | Deferred | Windows基準環境で測定条件を確定 |
| 33 | `IMP-033` | `FUT-D-004` | 作品別表示設定 | Deferred / NOT TESTED | Deferred | 採否と保存スコープを決定 |
| 34 | `IMP-034` | `FUT-D-005` | 読書状態ラベル | Deferred / NOT TESTED | Deferred | 読書位置との状態モデル境界を決定 |
| 35 | `IMP-035` | `FUT-R-006` | タッチ操作 | Candidate / NOT TESTED | Blocked | タッチ実機を確保してFR-B11を測定 |
| 36 | `IMP-036` | `FUT-R-007` | ゲームパッド操作 | Candidate / NOT TESTED | Blocked | ゲームパッド実機を確保してFR-B11を測定 |

## リリース確認バックログ

以下は新機能の実装ではなく、既存実装のリリース判定に必要な確認である。実装バックログの
件数や `Done` 判定に混ぜず、確認結果を対応する台帳行へ反映する。

| 順 | 管理ID | 要件ID | 確認項目 | 現在の状態 | 完了条件 |
|---:|---|---|---|---|---|
| 1 | `GATE-001` | `REQ-MVP-018` | 外向き通信0件・offline動作 | Partial / BLOCKED | OSレベル監視とoffline E2Eの直接証跡 |
| 2 | `GATE-002` | `NFR-MVP-001` | 10,000項目のWindows製品UI性能 | Partial / BLOCKED | 基準Windows環境の性能値と判定 |
| 3 | `GATE-003` | `NFR-MVP-002` | 起動・一覧・切替・検索性能 | Partial / BLOCKED | 基準Windows環境の全項目測定 |
| 4 | `GATE-004` | `NFR-MVP-003` | UIA・screen reader・high contrast・DPI | Partial / BLOCKED | Windows実機でのアクセシビリティ証跡 |
| 5 | `GATE-005` | `NFR-MVP-005` | Windows clean VM導入・起動・削除 | Partial / BLOCKED | Windows 10/11 clean VMの導入・削除証跡 |
| 6 | `GATE-006` | `NFR-MVP-006` | UX技術構成のWindows実測 | Partial / BLOCKED | 未測定ACを含む全受入条件の判定 |

## 更新手順

1. 作業開始前に `feature-status.md` とこの表の Feature ID・状態を突合する。
2. `Next` の1件だけを `In Progress` に変更する。
3. 要件、設計、実装、focused testをその1件の範囲で更新する。
4. テストとCoDDゲートの結果を記録し、完了できなければ理由を `Blocked` または `Deferred` に残す。
5. `feature-status.md`、対応する要件・結果文書、このバックログを同じ変更で更新する。
6. 次の1件を選ぶ前に、前の1件が `Done` または明示的な停止状態であることを確認する。

候補の採用判断が変わった場合も、行を削除せず `Deferred` または `Rejected` として理由を残す。
