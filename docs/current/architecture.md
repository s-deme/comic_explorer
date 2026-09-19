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
| Delivery | `.github/workflows/windows-build.yml` | `v<version>` tagをapplication versionと照合し、Windows installer、portable ZIP、SHA-256 checksumを同じGitHub Releaseへ公開する。 |

## 恒久的な設計境界

- Rustだけがcanonical path、root containment、archive entry、resource上限、SQLite書込みを判断する。
- ZIP entry名はUTF-8 flagを正本とし、flagのない日本語名はShift_JISとして復元する。表示・安全性検証・entry再読込には同じ復元名を使う。
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

## 2026-09-20 保守性の整理

重複量と変更漏れの影響から、軽微な改名・整形を除く次の候補を実施した。

| 課題 | 実施内容 |
|---|---|
| Appの設定が多数の個別stateと手書きprofile変換に分散 | `SettingsProfile`を実効設定の正本とし、保存成功後に一括反映する。ダイアログには独立した複製を渡し、失敗時のnative設定の復旧を維持する。 |
| テーマ入出力・保存・削除がAppに混在 | `useCustomThemes`に集約し、正常記録と破損記録の削除処理を共通化する。検証、世代管理、適用中テーマの保護を維持する。 |
| Viewerの表示処理にnative全画面・スリープ抑止の非同期管理が混在 | `useViewerFullscreen`に集約する。巻をまたぐwindow寿命とページcomponent寿命を区別し、古い状態取得結果を無視する。 |
| Rustの読書記録commandがapplication本体に混在 | `application::reading`に読書位置・しおり・履歴を移し、bootstrapから直接登録する。path検証とrepository書込みの境界は維持する。 |
| Appテストの準備処理と設定fixtureが重複 | `src/test/app-harness.tsx`と`catalog-fixtures.ts`へ集約する。APIの復元処理をモックし、一覧の読込完了を待って操作する。 |

テストは入力境界、保存・復旧、非同期競合、利用者フロー、既知不具合の回帰を残す。装飾値や静的な文言・配置だけの検査、別の境界で保証済みの検査、単純な委譲の検査を削除した。フロントエンド8件とPythonのCSS検査17件を削減し、失敗を隠すためのskipや期待値の緩和は行わない。テーマtoken、OS強制色、全画面overlay、横幅フィットのCSS契約は維持する。

### 追加のリファクタリング候補と対応

既存の未コミット変更を保持した追加調査では、画面shellから独立して検証できる状態管理と、DB接続管理に混在する永続化責務を対象とした。次の4件を実施した。

| 候補 | 対応 | 維持する契約・確認箇所 |
|---|---|---|
| メモ・評価の非同期状態がAppに混在 | `useItemMetadata`へ読込・保存・リセットを集約し、使用する3つのAPIだけを注入可能にする | 世代管理、評価の二重送信防止、Viewer終了時の無効化。hook競合テストと既存FR-B07画面テスト |
| タグ操作の状態管理と追加・解除処理の重複 | `useItemTags`へ集約し、追加・解除の結果反映・再取得・エラー処理を共通化する | タグ検索の世代管理、入力draftの保持、選択作品への反映。hookテストと既存FR-B10画面テスト |
| 設定の既定値・読込・保存・named profileがDB接続管理と同居 | `settings_repository.rs`へ分離し、既存の`StateStore`と`Settings`の公開経路を維持する | 単一接続、保存transaction、準備処理のatomicity、既存DB・profile互換性。既存Rust repository/themeテスト |
| 外部アプリ・起動履歴・rename設定が汎用repositoryに混在 | `integration_repository.rs`へ分離する | 登録上限、履歴上限、不正保存データのエラー分類、rename設定の独立保存。既存Rust外部連携テスト |

軽微な改名、import順の統一、ファイル長だけを理由にした分割は実施対象から除外した。新しい依存、共通controller framework、DB schema変更は導入しない。ユーザー向け挙動を変更しないため、要件の追加変更は行わない。

検証時に、製品タグharnessが旧library相対pathと廃止済みのlibrary menuを参照していることを確認した。fixtureのdrive相対pathを一度だけ算出し、現行のoptions menuから操作するよう修正した。追加・検索・改名・再起動後の保持・解除と原本差分0の検査は維持する。
