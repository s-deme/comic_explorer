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
| 実装・受入完了 | 12 | 実装、直接観測、正本同期、CoDD gateを完了済み |
| 実装が一部完了・受入待ち | 3 | 既存実装を修正または不足分を実装し、blocked gateを解消する |
| 未実装候補 | 50 | 採用判断、要件化、実装、直接観測を順に行う |
| 保留・未決定 | 5 | 優先度と仕様を決めるまで実装しない |
| 実機・外部環境待ち | 2 | 実装着手ではなく、測定環境を確保して判定する |
| **実装バックログ合計** | **72** | `FUT-R-001`〜`003`、`FUT-R-008` の恒久Rejectedは含めない |

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

`登録順`と`IMP-*`は履歴を保つ安定IDであり、優先度変更でも改番しない。表の物理行は
[機能ロードマップ](./feature-roadmap.md)の現行優先度で並べ、P番号が小さいもの、同一Pでは枝番が
小さいものから1件ずつ採用判断する。`Hold`は順位末尾ではなく、解除条件を満たすまで通常queueの
対象外である。2026-08-10の再検討は着手指示ではないため、`Next` / `In Progress`は置かず、
未実装行の台帳状態と作業状態は変更しない。`IMP-037`〜`IMP-072`は2026-08-09のLeeyes参照画面差分から
登録した候補であり、commandの実体をshell UIより先に、file mutationを安全設計後に配置した。

| 登録順 | 現行優先度 | 管理ID | Feature ID | 機能 | 現在の台帳状態 | 作業状態 | 次の作業 |
|---:|---|---|---|---|---|---|---|
| 1 | Done | `IMP-001` | `FUT-C-015` | 縦スクロール | Implemented / PASS | **Done** | focused test、canonical aggregate、CoDD consistencyを記録済み |
| 2 | Done | `IMP-002` | `FUT-C-016` | 横スクロール | Implemented / PASS | **Done** | RTL/LTRのページ順、wheel横移動、focused test、canonical aggregateを記録済み |
| 3 | Done | `IMP-003` | `FUT-C-017` | フルスクリーン | Implemented / PASS | **Done** | `FT-B04-006`でWindows WebView2製品ゲート、原本差分0、focused回帰を完了 |
| 4 | Done | `IMP-004` | `FUT-C-019` | ユーザー定義ショートカット | Implemented / PASS | **Done** | `FT-B11-006`でremap・restart・reset・原本差分0、Rust 79+1を完了 |
| 5 | Done | `IMP-005` | `FUT-C-022` | タグ付与・検索 | Implemented / PASS | **Done** | `FT-B10-005`で付与・検索・rename・restart・remove・原本差分0、canonical aggregateを完了 |
| 6 | Done | `IMP-006` | `FUT-C-023` | メモ保存 | Implemented / PASS | **Done** | `FT-B07-006`でsave・再open・restart復元・clear・原本差分0、canonical aggregateを完了 |
| 7 | Done | `IMP-007` | `FUT-R-004` | 閲覧履歴 | Implemented / PASS | **Done** | `FT-B07-007`でsuccess-only・dedup・順序・restart復元・原本差分0、canonical aggregateを完了 |
| 8 | Done | `IMP-008` | `FUT-R-005` | 評価 | Implemented / PASS | **Done** | `FT-B07-008`で1→5・restart復元・unset・再open・原本差分0、canonical aggregateを完了 |
| 12 | Done | `IMP-012` | `FUT-C-010` | 名前検索 | Implemented / PASS | **Done** | `FT-B05-006`でnormalized mixed-kind、navigation、empty/clear、explicit rescan、原本差分0を完了 |
| 13 | Done | `IMP-013` | `FUT-C-011` | お気に入り・クイックアクセス | Implemented / PASS | **Done** | `FT-B06-006`でcurrent-session add/remove、available rows、folder/comic navigation、原本差分0を完了 |
| 14 | Done | `IMP-014` | `FUT-C-021` | お気に入り保存 | Implemented / PASS | **Done** | Rustでv1 migration、`FT-B06-007`でrestart、strict moved/missing/re-resolve、source tree差分0を完了 |
| 15 | Done | `IMP-015` | `FUT-C-005` | WebPページ表示 | Implemented / PASS | **Done** | `FT-B08-006`でfolder/ZIP/CBZ static WebP、local error recovery、原本差分0、canonical aggregateを完了 |
| 52 | P1-1 / FR-B13 | `IMP-052` | `FUT-C-057` | 現在場所の手動更新 | Implemented / PASS | Done | F5/menu再走査、generation、selection維持を実装・実測 |
| 50 | P1-2 / FR-B13 | `IMP-050` | `FUT-C-055` | 複数・種別選択 | Implemented / PASS | Done | 修飾キー範囲、全選択、画像選択、反転、解除を実装・実測 |
| 49 | P1-3 / FR-B13 | `IMP-049` | `FUT-C-054` | パスのコピー | Implemented / PASS | Done | library-root相対pathのclipboard copyを実装・実測 |
| 44 | P1-4 / FR-B13 | `IMP-044` | `FUT-C-049` | 項目プロパティ | Implemented / PASS | Done | 単一項目の参照property dialogを実装・実測 |
| 63 | P1-5 / FR-B13 | `IMP-063` | `FUT-C-068` | 現在位置付きステータス | Implemented / PASS | Done | sort後のindex/total/selection statusを実装・実測 |
| 37 | P2-1 / FR-B14 | `IMP-037` | `FUT-C-042` | ファイル・フォルダを開く | Implemented / PASS | Done | selected item openとroot内境界を実装・実測 |
| 39 | P2-2 / FR-B14 | `IMP-039` | `FUT-C-044` | 最近開いたファイルメニュー | Implemented / PASS | Done | successful openのsession recent menuを実装・実測 |
| 51 | P2-3 / FR-B14 | `IMP-051` | `FUT-C-056` | 履歴ドロップダウン移動 | Implemented / PASS | Done | back/forward履歴dropdownの直接移動を実装・実測 |
| 46 | P2-4 / FR-B14 | `IMP-046` | `FUT-C-051` | 終了メニュー | Implemented / PASS | Done | file menuの明示終了commandを実装・実測 |
| 40 | P3-1 / FR-B15 | `IMP-040` | `FUT-C-045` | ページしおり保存・一覧 | Implemented / PASS | Done | page bookmark local persistence/listを実装・実測 |
| 41 | P3-2 / FR-B15 | `IMP-041` | `FUT-C-046` | 次のしおりへ移動 | Implemented / PASS | Done | next bookmarkと末尾wrapを実装・実測 |
| 42 | P3-3 / FR-B15 | `IMP-042` | `FUT-C-047` | 本棚表示・追加 | Implemented / PASS | Done | favoriteと分離したbookshelfを実装・実測 |
| 53 | P4-1 / FR-B16 | `IMP-053` | `FUT-C-058` | ファイルマスク | Implemented / PASS | Done | basename glob mask、current-session scope、status同期を実装・実測 |
| 45 | P4-2 / FR-B16 | `IMP-045` | `FUT-C-050` | CSV形式で出力 | Implemented / PASS | Done | filtered rowのUTF-8 CSV exportとabsolute path除外を実装・実測 |
| 60 | P5-1 / FR-B17 | `IMP-060` | `FUT-C-065` | 参照メニュー構成 | Implemented / PASS | Done | menuとtoolbarの共通command IAを実装・実測 |
| 61 | P5-2 / FR-B17 | `IMP-061` | `FUT-C-066` | アイコンコマンドツールバー | Implemented / PASS | Done | accessible icon command toolbarを実装・実測 |
| 62 | P5-3 / FR-B17 | `IMP-062` | `FUT-C-067` | 参照型サムネイルタイル | Implemented / PASS | Done | reference_tile view modeを実装・実測 |
| 57 | P6-1 / FR-B18 | `IMP-057` | `FUT-C-062` | ペイン表示切替 | Implemented / PASS | Done | folder treeのcurrent-session表示切替と復帰導線を実装・実測 |
| 58 | P6-2 / FR-B18 | `IMP-058` | `FUT-C-063` | バー・メニュー表示切替 | Implemented / PASS | Done | menu/toolbarの表示切替と復帰導線を実装・実測。永続化はB19へ送る |
| 55 | P6-3 / FR-B18 | `IMP-055` | `FUT-C-060` | 画像表示領域の分離 | Implemented / PASS | Done | viewerのcurrent-session分離表示、Esc復帰を実装・実測 |
| 56 | P6-4 / FR-B18 | `IMP-056` | `FUT-C-061` | タスクトレイ収納 | Implemented / PASS | Done | tray API可否の安全なdisabled境界と収納状態UIを実装・実測 |
| 64 | P7-1 / FR-B19 | `IMP-064` | `FUT-C-069` | 統合設定画面 | Implemented / PASS | Done | catalog/viewer/巻末/gesture/shortcutをapply/cancel付きdialogへ統合 |
| 66 | P7-2 / FR-B19 | `IMP-066` | `FUT-C-071` | 設定プロファイル | Implemented / PASS | Done | versioned JSON export/importと安全な除外項目を実装・実測 |
| 67 | P7-3 / FR-B19 | `IMP-067` | `FUT-C-072` | マウスジェスチャ設定 | Implemented / PASS | Done | swipe/double-clickとcommand conflict拒否を実装・実測 |
| 71 | P7-4 / FR-B19 | `IMP-071` | `FUT-C-076` | 一般ヘルプ | Implemented / PASS | Done | offlineの操作説明を既存helpへ統合・実測 |
| 72 | P7-5 / FR-B19 | `IMP-072` | `FUT-C-077` | バージョン情報 | Implemented / PASS | Done | version/runtime/license noticeを表示・実測 |
| 16 | P8-1 / FR-B08 | `IMP-016` | `FUT-C-006` | 静止GIF表示 | Candidate / NOT TESTED | Candidate | GIFの対応範囲とdecoderを決定 |
| 18 | P8-2 / FR-B08 | `IMP-018` | `FUT-C-008` | AVIFページ表示 | Candidate / NOT TESTED | Candidate | decoder、ライセンス、対応範囲を確認 |
| 17 | P8-3 / FR-B08 | `IMP-017` | `FUT-C-007` | アニメーションGIF表示 | Candidate / NOT TESTED | Candidate | 再生・停止・メモリ境界を要件化 |
| 19 | P9-1 / FR-B12 | `IMP-019` | `FUT-C-001` | RAR・CBR書庫閲覧 | Candidate / NOT TESTED | Candidate | library、ライセンス、セキュリティ境界を確認 |
| 20 | P9-2 / FR-B12 | `IMP-020` | `FUT-C-002` | 7z書庫閲覧 | Candidate / NOT TESTED | Candidate | library、ライセンス、セキュリティ境界を確認 |
| 68 | P10-1 / FR-B20 | `IMP-068` | `FUT-C-073` | サムネイル管理 | Candidate / NOT TESTED | Candidate | 管理対象、操作範囲、実行中状態を参照仕様から確認 |
| 69 | P10-2 / FR-B20 | `IMP-069` | `FUT-C-074` | 表示中サムネイルの保存 | Candidate / NOT TESTED | Candidate | 保存先、format、対象、上書き規則を決定 |
| 70 | P10-3 / FR-B20 | `IMP-070` | `FUT-C-075` | サムネイルの一括読込 | Candidate / NOT TESTED | Candidate | input source、format、対象範囲を参照仕様から確認 |
| 27 | Hold / FR-S02 | `IMP-027` | `FUT-C-027` | 新規フォルダ | Candidate / NOT TESTED | Candidate | file mutationの安全設計と明示承認後に権限・失敗回復を要件化 |
| 26 | Hold / FR-S02 | `IMP-026` | `FUT-C-026` | コピー | Candidate / NOT TESTED | Candidate | root/path、上書き確認、途中失敗・rollbackを要件化 |
| 24 | Hold / FR-S02 | `IMP-024` | `FUT-C-024` | 名前変更 | Candidate / NOT TESTED | Candidate | identity、cache・読書情報移行、undo境界を要件化 |
| 25 | Hold / FR-S02 | `IMP-025` | `FUT-C-025` | 移動 | Candidate / NOT TESTED | Candidate | identity移行、確認、失敗回復境界を要件化 |
| 28 | Hold / FR-S02 | `IMP-028` | `FUT-C-028` | ごみ箱移動 | Candidate / NOT TESTED | Candidate | OS連携、確認、復元境界を要件化 |
| 48 | Hold / FR-S02 | `IMP-048` | `FUT-C-053` | クリップボードのファイル操作 | Candidate / NOT TESTED | Candidate | mutation command後にclipboard format、cut state、権限境界を決定 |
| 47 | Hold / FR-S02 | `IMP-047` | `FUT-C-052` | 編集操作の元に戻す | Candidate / NOT TESTED | Candidate | transaction/journal確立後にundo対象、履歴、失敗回復を要件化 |
| 29 | Hold / FR-S02 | `IMP-029` | `FUT-C-029` | 完全削除 | Candidate / NOT TESTED | Candidate | TBD-007を再評価し、最後に不可逆操作の安全条件を承認 |
| 38 | Hold / FR-S06 | `IMP-038` | `FUT-C-043` | 指定動作で開く | Candidate / NOT TESTED | Candidate | 参照submenuの動作集合を確認して要件化 |
| 54 | Hold / FR-S06 | `IMP-054` | `FUT-C-059` | ファイル表示の切り替え | Candidate / NOT TESTED | Candidate | 参照commandの切替対象と有効条件を確認 |
| 59 | Hold / FR-S06 | `IMP-059` | `FUT-C-064` | OS全体フォルダツリー | Candidate / NOT TESTED | Candidate | shell namespace、権限、network path、安全境界を決定 |
| 43 | Hold / FR-S06 | `IMP-043` | `FUT-C-048` | メディア表示 | Candidate / NOT TESTED | Candidate | 対象media、表示semantics、data sourceを決定 |
| 65 | Hold / FR-S06 | `IMP-065` | `FUT-C-070` | プラグイン設定 | Candidate / NOT TESTED | Candidate | plugin runtime、trust、設定対象、安全・配布境界を評価 |
| 21 | Hold / FR-S01 | `IMP-021` | `FUT-C-003` | PDF閲覧 | Candidate / NOT TESTED | Candidate | 独立readerとして採否、library、license、配布境界を決定 |
| 22 | Hold / FR-S01 | `IMP-022` | `FUT-C-004` | EPUB閲覧 | Candidate / NOT TESTED | Candidate | 独立readerとして採否、rendering、license、配布境界を決定 |
| 23 | Hold / FR-S01 | `IMP-023` | `FUT-C-009` | 動画対応 | Candidate / NOT TESTED | Candidate | codec、再生lifecycle、license、配布条件を決定 |
| 9 | Hold / FR-B09 | `IMP-009` | `FUT-C-030` | ファイル変更検出 | Partial / BLOCKED | Blocked | FR-B09のWindows file-change product gateを解消 |
| 10 | Hold / FR-B09 | `IMP-010` | `FUT-C-031` | 重複作品検出 | Partial / BLOCKED | Blocked | FR-B09のCoDD・Windows product gateを解消 |
| 11 | Hold / FR-B09 | `IMP-011` | `FUT-C-032` | 壊れた書庫検出 | Partial / BLOCKED | Blocked | FR-B09のCoDD・Windows product gateを解消 |
| 35 | Hold / FR-B11 | `IMP-035` | `FUT-R-006` | タッチ操作 | Candidate / NOT TESTED | Blocked | タッチ実機を確保してFR-B11を測定 |
| 36 | Hold / FR-B11 | `IMP-036` | `FUT-R-007` | ゲームパッド操作 | Candidate / NOT TESTED | Blocked | ゲームパッド実機を確保してFR-B11を測定 |
| 30 | Hold / FR-S03 | `IMP-030` | `FUT-D-001` | 名前検索性能 | Deferred / NOT TESTED | Deferred | Windows基準環境で検索性能受入を確定 |
| 32 | Hold / FR-S03 | `IMP-032` | `FUT-D-003` | 性能計測条件の適用 | Deferred / NOT TESTED | Deferred | Windows基準環境で測定条件を確定 |
| 31 | Hold / FR-S04 | `IMP-031` | `FUT-D-002` | 最大ファイルサイズ | Deferred / NOT TESTED | Deferred | 対象datasetと上限を決定 |
| 33 | Hold / FR-S04 | `IMP-033` | `FUT-D-004` | 作品別表示設定 | Deferred / NOT TESTED | Deferred | 採否と保存スコープを決定 |
| 34 | Hold / FR-S04 | `IMP-034` | `FUT-D-005` | 読書状態ラベル | Deferred / NOT TESTED | Deferred | 読書位置との状態モデル境界を決定 |

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
