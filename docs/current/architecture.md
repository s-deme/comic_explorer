---
codd:
  node_id: "design:project-architecture"
  type: design
  status: approved
  confidence: 0.95
  depends_on:
    - id: "req:project-requirements"
      relation: "implements"
      semantic: "current-system-contract"
---

# Comic Explorer 現行アーキテクチャ

## 構成と責務

| 境界 | 正本 | 責務 |
|---|---|---|
| UI | `src/` React | state表示、keyboard/pointer入力、accessibility、typed client呼出し。path検証・SQL・画像処理は持たない。 |
| Native | `src-tauri/src/` Rust / Tauri | filesystem・archive・PDF・画像・SQLite・設定・native window・安全上限の正本。 |
| 通信 | `src/features/library/client.ts` | UIとRustのtyped IPC境界。未検証payloadをUI状態へ直接混ぜない。 |
| Catalog | `src/features/catalog/`, `src/features/navigation/` | drive境界内の一覧、tree、search、selection、virtualize。 |
| Viewer | `src/features/viewer/` | 別native windowのpage表示、入力、prefetch、非破壊filter/transformの反映。 |
| Settings | `src/features/settings/`, app-local SQLite | strict profile、migration、named profile、themeを保存・正規化する。 |

## 恒久的な設計境界

- Rustだけがcanonical path、root containment、archive entry、resource上限、SQLite書込みを判断する。
- Viewerはmain catalog windowをunmountしない再利用windowである。閉じてもcatalogの一覧・選択・scrollを保持する。
- 画像変換、filter、thumbnail、clipboardは表示用の派生データだけを扱い、library原本を書き換えない。
- filesystem変更は利用者が明示したfile manager操作だけに限定し、確認・再検証・結果の再列挙を行う。
- すべての外部入力は境界で失敗を分類し、現在の画面を不必要に初期化しない。
- Catalogの名前比較はカタカナをひらがなへ正規化した比較keyを使い、かな種別をまたいだ自然順を保つ。同じ比較keyの順序は元の名前で決定する。

## 保守性を保つ実装境界

- `App` はwindow shellとfeatureの組み立てだけを担い、catalog、file operation、reading、settings、Viewerの状態遷移と非同期処理はfeatureごとのcontrollerへ閉じ込める。
- UIのIPC clientは共通のrequest context生成・Tauri invoke基盤と、catalog、file、reading、settings、Viewerなどのfeature facadeに分離する。DTOのwire nameとresponse shapeはfeature横断で一貫させる。
- RustのTauri commandはfeatureごとのadapter moduleに置き、path検証、resource上限、SQLite書込みの正本をRust境界の外へ出さない。commandの登録だけはbootstrapに集約する。設定の command と設定 profile の検証・変換は同じfeature moduleに置く。
- SQLiteのconnection lifecycleとmigration適用はstate層に残し、settings、reading、catalog、integrationなどのrepository操作とmigration定義は責務ごとのmoduleに分ける。`reading_repository` と `catalog_repository` は `StateStore` の接続を共有しつつ領域ごとのqueryを所有する。
- frontend・backendでそれぞれ必要な設定の既定値とvalidationは、backendが返すcanonical settings responseを比較する契約テストでドリフトを検出する。言語間で実装詳細を共有しない。
- feature controllerは狭いadapter interfaceを受け取り、unit testではそのfeatureが使うcommandだけをmockする。`App` のテストはfeatureをまたぐ利用者フローに限定する。

## 代表フロー

1. UIがdrive/folderまたは作品を選ぶ。
2. Rustが安全境界と対応形式を検証し、catalog DTOまたはViewer sessionを返す。
3. UIはgeneration付きの結果だけを表示し、古い非同期結果を破棄する。
4. 設定変更はdialog draftから明示Apply時だけprofile/SQLiteへ保存し、失敗時は実効状態を変えない。

詳細なAPI、schema、migration、性能値、過去の設計判断はコード・テスト・Git履歴を正本とする。
