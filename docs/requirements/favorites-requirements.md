---
codd:
  node_id: "req:fr-b06"
  type: requirement
  status: approved
  confidence: 0.92
  depends_on:
    - id: "req:mvp-requirements"
      relation: "extends"
      semantic: "path-and-local-only-contract"
    - id: "req:product-questionnaire"
      relation: "derives_from"
      semantic: "Q4-1-Q6-1-adoption"
---

# FR-B06 お気に入り要件

## 採用記録

Lord決裁（2026-08-02）とFR-B05最終QC ACCEPTを受け、`FUT-C-011`（お気に入り・
quick access）と`FUT-C-021`（お気に入り保存）を一つの縦切りとして採用する。対象は
登録済みlibrary root配下のfolder、comic folder、ZIP/CBZであり、file操作、原本変更、
library root内の管理file、外部同期、外部通信は含めない。

お気に入りの正本はlibrary root外の既存app-local SQLiteである。pathは現在位置を示す
可変属性、`favoriteId`と登録時の`itemIdentity`はレコードを識別する安定属性とし、移動後の
再解決でもレコードを新規作成しない。

## REQ-FR-B06-001: stable identity and eligible targets

登録時にrelative pathを`RelativePath`として正規化し、absolute path、parent traversal、
root外symlink、存在しない項目、page、unsupported itemを拒否する。folder、comicFolder、
archiveだけを登録対象とする。`itemIdentity`は登録時の正規化pathから決定的に生成し、同じ
項目のaddを繰り返しても同じfavoriteレコードを再利用する。

お気に入りレコードは、favoriteId、itemIdentity、登録時relative path、kind、取得可能な
size/modified fingerprintを保持する。これらはlibrary root配下へ書き込まず、SQLiteの
local metadata schemaだけへ保存する。

## REQ-FR-B06-002: idempotent add/remove and deduplication

同じitemIdentityへのaddは一件のupsertとして扱い、重複行を作らない。removeは存在しない
favoriteIdに対しても成功するidempotent操作とし、他のレコードへ影響を与えない。保存・解除後
の一覧は同じAPI境界から再取得できる。

## REQ-FR-B06-003: quick access and navigation

UIは現在folderの対象項目へfavorite add/removeを接続し、quick accessにお気に入りを一覧表示
する。availableなfolderはそのfolderへ、availableなcomicFolder/archiveは既存のviewer境界
へ、安全に遷移できる。お気に入り一覧からの遷移後もaddress、folder tree、catalog、selection
またはviewerが同じresolved pathを示す。

## REQ-FR-B06-004: missing, moved, re-resolve, and removal

保存pathが消失・アクセス不能・kind不一致になった場合、quick accessは`missing`として表示し、
開く操作を発行しない。登録fingerprintとkindから別locationに一意に再解決できる場合は`moved`
と表示し、利用者が明示した`再解決`操作で同じfavorite recordの現在pathだけを更新できる。
再解決不能な対象は誤って推測せず、再走査と解除を選べる。再解決・解除はlibrary root内の
rename、move、deleteを発行しない。

## REQ-FR-B06-005: restart persistence, migration, and safety

既存schema version 1からfavorites tableへ決定的にmigrationし、旧settings、reading position、
thumbnail indexを壊さない。アプリ再起動相当のSQLite reopen後もfavoriteId、identity、path、
kind、fingerprintを復元する。migrationとfavorite CRUDの書込み先はapp-local SQLiteだけで、
原本、ZIP/CBZ、library管理file、temporary sidecarへ差分を作らず、network/install/external
syncを発行しない。

## C0/C1 ownership checkpoint

FR-B06はserial1の一名integration ownerで実装する。C0でeligible target、stable identity、
schema migration、idempotent add/removeを固定し、C1でquick access、移動再解決、missing安全停止、
restart persistenceを接続境界で観測する。

| boundary | owned paths | contract |
|---|---|---|
| local metadata | `src-tauri/src/state/repository.rs` | favorites schema v2、migration、upsert/remove/list/re-resolve、SQLite reopen |
| application/API | `src-tauri/src/application/mod.rs`, `src-tauri/src/lib.rs` | path safety、kind/fingerprint、moved/missing resolution、Tauri commands |
| API client | `src/features/library/client.ts` | list/add/remove/re-resolve commandsをAppへ接続 |
| UI integration | `src/App.tsx`, `src/features/catalog/CatalogGrid.tsx`, `src/features/catalog/QuickAccess.tsx`, `src/App.test.tsx` | star操作、quick access、navigation、missing/moved state |
| direct evidence | `docs/requirements/favorites-requirements.md`, `docs/testing/fr-b06-results.md`, `docs/product/feature-status.md`, `docs/product/feature-roadmap.md` | adopted IDs、FT-B06 matrix、gate、非PASS境界 |

### Connected evidence matrix

| Test ID | checkpoint | observable contract | required evidence |
|---|---|---|---|
| FT-B06-001 | C0 | add/remove、同一pathの二重add、二重remove、重複0 | connected App/CatalogGrid + Rust repository |
| FT-B06-002 | C1 | quick accessからfolder/comicをresolved pathへ遷移 | connected App + API client + existing navigation/viewer |
| FT-B06-003 | C1 | SQLite reopen後のfavorites復元とApp表示 | Rust repository migration/reopen + App restore |
| FT-B06-004 | C1 | missing/moved表示、safe stop、明示再解決/解除 | connected App state + Rust resolver |
| FT-B06-005 | C1 | original/library-admin snapshot差分0、外部通信0、path safety | focused boundary assertions + Rust invalid-path tests |

pure repository or pure UI unit testsだけでは完了扱いにせず、FT-B06-001〜004はAppから
API clientへ接続した結果を直接観測する。いずれかがFAILまたはSKIPならFUT-C-011/
FUT-C-021をPASSへ更新しない。

## Batch and evidence boundary

focused機能テストはSKIP 0で一回だけ実測する。focusedがPASSした場合のみcanonical Rust
entrypointとcanonical aggregateを各一回実行する。CoDD structural checkが同条件で非PASSなら、
生値・check名・approved exceptionをledgerと結果文書へ残し、機能証跡PASSと混同して「全gate
PASS」と称しない。Windows WebView2 product harnessは別環境gateとして未実測をPASSへ昇格しない。
