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
quick access）と`FUT-C-021`（お気に入り保存）を一つのshared implementationとして採用する。対象は
登録済みlibrary root配下のfolder、comic folder、ZIP/CBZであり、file操作、原本変更、
library root内の管理file、外部同期、外部通信は含めない。

shared implementationの受入は原子的に分割する。IMP-013は`FUT-C-011`だけについて、current-sessionの
add/remove/dedup、availableなquick access row、folder navigationとcomic viewerへの遷移を完了する。
restart persistence、migration、missing/moved、再解決はIMP-014の`FUT-C-021`に予約し、IMP-013のPASSを
それらへ波及させない。

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

quick accessの再走査中にadd/removeが開始された場合は、後から開始した操作generationを正本とし、
旧再走査responseでrowを復活させない。最新操作の完了後はloading表示を必ず解除し、結果rowまたは
empty stateへ収束する。

## REQ-FR-B06-004: missing, moved, re-resolve, and removal

保存pathが消失・アクセス不能・kind不一致になった場合、quick accessは`missing`として表示し、
開く操作を発行しない。`moved`にできるのは、登録時のsizeとmodifiedが両方存在するfull fingerprintを
持ち、同じkindかつ同じnameの候補が、そのsizeとmodifiedの両方に一致してexactly oneだけ見つかる場合
だけとする。size-only、name-only、fingerprint absent、候補0件または候補複数は`missing`であり、
誤って推測しない。`moved`候補も利用者が明示した`再解決`時にresolverが再探索・再検証し、同じ
favoriteIdの現在pathだけを更新できる。callerが任意に指定したsame-kind pathは、候補一致を再検証
できなければ拒否する。再解決不能な対象は再走査と解除を選べる。再解決・解除はlibrary root内の
rename、move、deleteを発行しない。

## REQ-FR-B06-005: restart persistence, migration, and safety

既存schema version 1から現行favorites schemaへ決定的にmigrationし、旧settings、reading position、
thumbnail indexを壊さない。アプリ再起動相当のSQLite reopen後もfavoriteId、identity、path、
kind、full fingerprintを復元する。migrationとfavorite CRUDの書込み先はapp-local SQLiteだけで、
原本、ZIP/CBZ、library管理file、temporary sidecarへ差分を作らず、network/install/external
syncを発行しない。

## C0/C1 ownership checkpoint

FR-B06はserial1の一名integration ownerでshared implementationを実装する。IMP-013のC0ではeligible
target、stable identity、current-sessionのidempotent add/removeとquick access navigationを固定する。
IMP-014のC1でschema migration、restart persistence、移動再解決、missing安全停止を接続境界で観測する。

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
| FT-B06-002 | C0 | quick accessからfolder/comicをresolved pathへ遷移 | connected App + API client + existing navigation/viewer |
| FT-B06-003 | C1 | v1→current migration、SQLite reopen後のsame favoriteId/available row復元 | Rust repository migration/reopen + App restore |
| FT-B06-004 | C1 | strict full fingerprintのmissing/moved、safe stop、明示再解決でID保持 | connected App state + Rust resolver |
| FT-B06-005 | C1 | original/library-admin file/directory/bytes/SHA差分0、外部通信0、path safety | focused boundary assertions + Rust invalid-path tests |
| FT-B06-006 | IMP-013 product | release UIでavailable row、folder navigation、comic viewer、add/remove、source差分0 | QuickAccessOnly release WebView2 gate |
| FT-B06-007 | IMP-014 product | restart persistence、strict moved/missing/re-resolve、source差分0 | FavoritePersistenceOnly release WebView2 gate |

pure repository or pure UI unit testsだけでは完了扱いにせず、IMP-013はFT-B06-001/002をAppから
API clientへ接続して直接観測し、FT-B06-006のrelease製品gateとともに`FUT-C-011`だけを判定する。
FT-B06-003〜005はIMP-014の`FUT-C-021`判定まで保留し、IMP-013のPASSへ含めない。

### IMP-013 QuickAccessOnly 完了ゲート

`scripts/run-feature-verification-wsl.sh IMP-013 -RustMode Canonical`をWindows-native toolchainへ橋渡しする
正本コマンドとする。現行App suiteから`FT-B06-001`と`FT-B06-002`だけを選択し、selected exact 2 PASS・
0 FAIL・0 SKIPを強制する。`favorite_target_enforces_relative_path_and_eligible_kind_boundaries` Rust filter、
typecheck、SBOM/build、canonical Rust、release freshness、`FT-B06-006`、製品process cleanup、CoDD
scan/check/verifyを同じsourceへ束縛する。

`FT-B06-006`はrelease WebView2製品UIからavailableなfolder、comicFolder、archiveをそれぞれfavoriteへaddし、
対象ごとのexact rowとremove後のrow消失を確認する。同一identity addのdedupは`FT-B06-001`を正本とする。
folder rowはそのfolderのaddress、
選択済みtree node、catalogへ遷移し、comicFolder rowとarchive rowは既存viewer境界へ遷移しなければならない。
解除は最新操作完了後のempty stateまで収束し、旧再走査responseでrowまたはloadingを復活させてはならない。
前後のlibrary file/directory集合、bytes、SHA-256は一致し、favorite操作はlibrary sourceへwrite、rename、
delete、cache、sidecar、temporary fileを作らない。restart/migration/missing/moved/re-resolveは本gateで
発生させず、IMP-014の`FUT-C-021`だけを判定する。

### IMP-014 FavoritePersistenceOnly 完了ゲート

`scripts/run-feature-verification-wsl.sh IMP-014 -RustMode Canonical`をWindows-native toolchainへ橋渡しする
正本コマンドとする。現行App suiteから`FT-B06-003`〜`FT-B06-005`だけを選択し、selected exact 3 PASS・
0 FAIL・0 SKIPを強制する。`fr_b06_favorite_` Rust filterはv1→current migration、SQLite reopen、
source分離、strict full fingerprintによるmoved/missing/re-resolveとpath safetyを正本として観測する。
typecheck、SBOM/build、canonical Rust、release freshness、`FT-B06-007`、製品process cleanup、CoDD
scan/check/verifyを同じsourceへ束縛する。

`FT-B06-007`はrelease WebView2製品UIからarchiveとcomicFolderをfavoriteへaddし、通常restart後に
同じfavoriteIdとavailable rowが復元されることを確認する。harnessだけがarchiveをsame-nameの別locationへ
移動すると、rowは`moved`かつopen disabledになり、明示的なstrict re-resolve後もfavoriteIdを保持する。
comicFolderを消失させた場合は`missing`かつopen disabledで、明示再走査の成功revision後もMissingを維持し、
removeできる。解決済みpathもさらにrestartして
永続復元する。`moved`はstored sizeとmodifiedの両方を持つfull fingerprintがsame kind/name候補exactly oneと
一致する場合だけであり、size-only/name-only/absent/ambiguousは`missing`のままにする。resolve commandは
候補一致を再検証し、任意のsame-kind pathを受け入れない。harnessはfixtureを復元し、前後のlibrary
file/directory集合、bytes、SHA-256を一致させる。`FT-B06-003`〜`FT-B06-005`と`FT-B06-007`がPASSして初めて
`FUT-C-021`を完了候補とし、既にPASSのIMP-013/`FUT-C-011`を再判定しない。

## Batch and evidence boundary

各atomic laneの選択対象focused機能テストはSKIP 0で一回だけ実測する。focusedがPASSした場合のみcanonical Rust
entrypointとcanonical aggregateを各一回実行する。CoDD structural checkが同条件で非PASSなら、
生値・check名・approved exceptionをledgerと結果文書へ残し、機能証跡PASSと混同して「全gate
PASS」と称しない。IMP-013は`FT-B06-006`をWindows WebView2 product gateとして直接測定する。
IMP-014の未測定boundaryは`FUT-C-011`をPASSへ戻さず、`FUT-C-021`へだけ残す。
