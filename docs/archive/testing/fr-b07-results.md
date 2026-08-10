---
codd:
  node_id: "test:fr-b07-results"
  type: test
  status: active
  confidence: 0.95
  depends_on:
    - id: "req:fr-b07"
      relation: "verifies"
      semantic: "reading-metadata-contract"
    - id: "design:screen-flow"
      relation: "verifies"
      semantic: "connected-app-boundary"
---

# FR-B07 読書情報 最終結果

## 判定

`FUT-C-023`（memo）は `Implemented / PASS` とする。IMP-006でWindows release WebView2製品から
実SQLiteへ接続し、save、viewer再open、edit、製品restart復元、clear、再open、library source tree
差分0を直接観測した。保存中はmemo入力と操作buttonを無効化し、遅延応答後の復帰もfocused testで確認した。

`FUT-R-004`（history）と`FUT-R-005`（rating）は `Implemented / PASS` とする。IMP-008でWindows release
WebView2製品からrating 1保存、5更新、製品restart後の5復元、unset、viewer再openとlibrary source tree
差分0を直接観測した。memo/history/ratingの3 atomic product gateが揃ったためFR-B07全体は `Done`である。
旧cmd_400の機能rawとCoDD rawは履歴として保持し、現行runで上書きしない。

## IMP-006 Windows製品・canonical結果

正本コマンドは`./scripts/run-feature-verification-wsl.sh IMP-006 -RustMode Canonical`である。
accepted runは`imp-006-20260809T102924682Z`、UTC 2026-08-09 10:29:24から10:31:38、全12 stage、
合計133.969秒、accepted run自体のretry 0である。log rootは
`src-tauri/target/verification/imp-006-20260809T102924682Z/`、最終JSONは
`src-tauri/target/verification/wsl-20260809T102924Z-2.json`、JSON SHA-256は
`ef4b9d81b47b012516d87c312ee6ec35fe740e4b2234251518ecb8dca51d1239`である。

release input hashは`7696e6a49e524af5f7a11c809f74c645b3f5b681b3478b7d07ab7b0e8debc4ce`、
exe SHA-256は`b25db3b2c4fd3b1b060e4c9339ea2bd6bba8fa113be46bad6cbb4a26651fcfb7`である。
source bindingは`src/App.tsx`=`97928d8ece225d967db2789d571e36721cab0ab5268a3aa6523d71e3221df9a6`、
`src/App.fr-b07.test.tsx`=`01a82244932c510a48b305d94f6007eb5d49b39a1d29e224be144c8998cfda77`、
`src/features/viewer/Viewer.tsx`=`6a194dd09f31521255b742c46e9f83e876f064f9dbe134576d7ba678e3da1cf7`、
product harness=`61196d35982b1e4657359a9059b60533b7807bcc016c3820d1e5ebebbec37bb6`、
feature runner=`b8a076cd236b755cabb54be7e1016e286420496d67ff2fe8405ad7397492ba16`へ束縛する。

| Gate | 結果 | 秒 | stdout SHA-256 | 直接観測 |
|---|---|---:|---|---|
| frontend focused | selected 1 PASS / 0 FAIL、3 excluded-by-pattern | 5.315 | `0ded73ed01c2779a32fec1b1a83b9d8ef92b97e8a243d9049a2be50f308da529` | FT-B07-001、遅延save中disabledと応答後復帰。Vitest rawの`numPendingTests=3`は非対象history/rating/migration |
| typecheck | PASS | 4.570 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | TypeScript error 0 |
| frontend SBOM/build | PASS | 4.291 | `f2e6cdcd743b2a0974afd2e67cc5104d40e3adea937885b89c0791e4a933bd31` | 665 components、unknown/prohibited license 0 |
| Windows Rust canonical | 79 unit + 1 process PASS | 41.824 | `848c6789de856112cdf5ad83530ea31a8e5b6b6bd1e21bcac85f58874ce53c24` | fmt、check、locked full test、failed/ignored 0 |
| release executable / freshness | PASS | 1.173 / 1.205 | `d17a4b4be45d2920486052566f6e2482b6020f419beb62c9b9e8328e00bd435e` | 現行input hashに束縛したexeを再利用 |
| FT-B07-006 product | PASS | 13.244 | `914ac67eecaba066de3664d2d9cc57c0ab16689e9ce4dc435aa82ee698c7f62e` | save、reopen、edit、restart、clear、再open、source difference 0 |
| product cleanup audit | PASS | 0.947 | `b81f2b3b0194b087912b75a46012f276e1d5fa3249db6cd5d0d0a5b11413c467` | 製品/WebView2 process、port、SQLite lock残留0 |
| CoDD scan | PASS | 1.622 | `ded830e4052a681dfd443bf3c2036714a8c7ee3811fa31054e2a61ec44190fcc` | 72 nodes / 148 edges |
| CoDD check | exit 0 / red 0 | 25.697 | `be71b0b84e0b9eff95d499bca8dc2c69976296af83dd72b26d887163ad6dcae5` | `depends_on_consistency` PASS |
| CoDD verify | exit 0 / red 0 | 29.493 | `cc6001b1cbae6b4211138591baa96925963d5a525e70658bf5f9d01c6037d590` | canonical tests・typecheck・source integrity 13 files |

CoDD verifyの任意profile advisoryは`3 PASS / 0 red FAIL / 1 amber WARN / 3 SKIP / 1 VACUOUS`、
verification tests 0の生値を維持し、memoの機能PASSへ加算しない。IMP-006の直接判定は
FT-B07-001、Rust memo/reopen契約、FT-B07-006、source-tree非破壊を正本とする。

IMP-006のtracked差分は、memo/UI source 2件、focused frontend/Python test 2件、共有Windows検証script
3件、要件・設計・台帳・結果文書7件のexact 14 pathである。生成された`dist/`、`target/`、CoDD scan
出力はcommit対象にしない。

## IMP-007 Windows製品・canonical結果

正本コマンドは`./scripts/run-feature-verification-wsl.sh IMP-007 -RustMode Canonical`である。
accepted runは`imp-007-20260809T105021071Z`、UTC 2026-08-09 10:50:21から10:52:30、全12 stage、
合計129.093秒、accepted run自体のretry 0である。log rootは
`src-tauri/target/verification/imp-007-20260809T105021071Z/`、最終JSONは
`src-tauri/target/verification/wsl-20260809T105020Z-2.json`、JSON SHA-256は
`4027bce6b8d4426e26d684d9b666ec3210d5b42f789040bc856131c375970af5`である。

release input hashは`81c35769ec2574e09b9823a3f962792d14ceaac7d22ca70fd1b81bf0e1af5c77`、
exe SHA-256は`afb302c2807a9381960383c24148dee3a3e493ad8e8e2362da993c517a798cce`である。
source bindingは`src/App.tsx`=`bec4c7be9cf40bc2a165bb6c499c3cf407faf1dc69947d33b03f8546499f1b21`、
`src/App.fr-b07.test.tsx`=`01a82244932c510a48b305d94f6007eb5d49b39a1d29e224be144c8998cfda77`、
product harness=`cc27f37958ca8f6adb5c83f67344e8706e98c96165d0bd4a70fe1c0e8587bfe2`、
feature runner=`a2ae26d39420b405e99142a8064eef0863d8b56a2a6982df6b4eb7196c04ac7f`へ束縛する。

| Gate | 結果 | 秒 | stdout SHA-256 | stderr SHA-256 | 直接観測 |
|---|---|---:|---|---|---|
| toolchain bootstrap | PASS | 4.143 | `c3e14a481e2da7cf8718e9ec533ae8471c939280295e41772b6e7540bebb706a` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | Windows native toolchainを解決 |
| frontend focused | selected 1 PASS / 0 FAIL、3 excluded-by-pattern | 5.002 | `375d6c180f8a2fb47a098012a2f03fb1e136fafd3f1ec79e1530d137c7445f68` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | FT-B07-002。非対象はmemo/rating/migration |
| typecheck | PASS | 5.345 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | TypeScript error 0 |
| frontend SBOM/build | PASS | 4.439 | `965c4bd8713116fe1644fce9a0148119acdca8971750a9aa9fb85e167b641462` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | 665 components、unknown/prohibited license 0 |
| Windows Rust canonical | 79 unit + 1 process PASS | 38.748 | `ff5383d591bd9217654841089709f8ba565b1b1ed173a0d32f60c60b64103bec` | `7d2091e3181fb30df7ad3d2d1f900a293bdc14d83b38cb38d2e89f0f0088fd1c` | fmt、check、locked full test、failed/ignored 0 |
| release executable / freshness | PASS | 1.186 / 1.043 | `7891f74f48aab995a12993863af39602a14155e01b2c76c5ead5c6c8885ba4ac` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | 現行input hashに束縛したexeを再利用 |
| FT-B07-007 product | PASS | 11.368 | `7e884a955d474a1ecc8dd4537d0daf11ccc00df92b16467a10a56fdb31dbed10` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | success-only、dedup、order、corrupt非記録、restart、source difference 0 |
| product cleanup audit | PASS | 0.964 | `b81f2b3b0194b087912b75a46012f276e1d5fa3249db6cd5d0d0a5b11413c467` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | 製品/WebView2 process、port、SQLite lock残留0 |
| CoDD scan | PASS | 1.605 | `ded830e4052a681dfd443bf3c2036714a8c7ee3811fa31054e2a61ec44190fcc` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | 72 nodes / 148 edges |
| CoDD check | exit 0 / red 0 | 25.631 | `be71b0b84e0b9eff95d499bca8dc2c69976296af83dd72b26d887163ad6dcae5` | `99315b41ae1bfa05c0f442da8956280b695ed3f9575c56ac3b72f0292ecd8e28` | `depends_on_consistency` PASS |
| CoDD verify | exit 0 / red 0 | 29.541 | `4c64527d59a512a320ba7dd50181fd56cb217143bcced1679fd501ec4fddbf69` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | canonical tests・typecheck・source integrity 13 files |

CoDD verifyの任意profile advisoryは`3 PASS / 0 red FAIL / 1 amber WARN / 3 SKIP / 1 VACUOUS`、
verification tests 0の生値を維持し、historyの機能PASSへ加算しない。IMP-007の直接判定は
FT-B07-002、Rust history契約、FT-B07-007、source-tree非破壊を正本とする。

IMP-007の最終tracked差分は、history product/UI source 1件、Python test 1件、共有Windows検証script
2件、要件・設計文書3件、台帳・roadmap・結果文書4件のexact 11 pathである。生成された`dist/`、
`target/`、CoDD scan出力はcommit対象にしない。

## IMP-008 Windows製品・canonical結果

正本コマンドは`./scripts/run-feature-verification-wsl.sh IMP-008 -RustMode Canonical`である。
accepted runは`imp-008-20260809T112129896Z`、UTC 2026-08-09 11:21:29から11:23:40、全12 stage、
合計130.870秒である。log rootは`src-tauri/target/verification/imp-008-20260809T112129896Z/`、最終JSONは
`src-tauri/target/verification/wsl-20260809T112129Z-2.json`、JSON SHA-256は
`b09fa8b04a42799c644acdb14eef2c87faa8d3da3c952b7f812b4687ae9b1175`である。

release input hashは`7b720af8ba7199ea7dcd08c945682857524b9caa3445f338da60cd1f93254cae`、
exe SHA-256は`eabcbe09e82eba0705a39f741f1deee4058360e9072665017efceaf4d6dc60ef`である。
source bindingは`src/App.tsx`=`07c4948b4ea368bec69a12026e7dc5b18abc5b0ec4bf26a13a69e965876fd998`、
`src/App.fr-b07.test.tsx`=`9380a1ed158d89cc854671d596a29407da2d625791b284421b9b76e779efbac4`、
product harness=`03e5cd33d7d03698f360147c6b73084af7a156d19b9c3bd98ac4f9e9afdb7a4e`、
feature runner=`bb5214bd0869d973f6f7a1509c979b5ba482ce3e4e34acc9bf3f852132684899`へ束縛する。

| Gate | 結果 | 秒 | stdout SHA-256 | stderr SHA-256 | 直接観測 |
|---|---|---:|---|---|---|
| toolchain bootstrap | PASS | 4.002 | `c3e14a481e2da7cf8718e9ec533ae8471c939280295e41772b6e7540bebb706a` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | Windows native toolchainを解決 |
| frontend focused | selected 1 PASS / 0 FAIL、3 excluded-by-pattern | 4.816 | `33a743f89a7c5b96478d6efd8c8681bc95847f1bbb1a0551db4aba8426d28aaf` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | FT-B07-003。非対象はmemo/history/migration |
| typecheck | PASS | 4.690 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | TypeScript error 0 |
| frontend SBOM/build | PASS | 4.220 | `95e4d630bea29070aef177b1234740aca2176b90039d430307b11bcc97aa6566` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | 665 components、unknown/prohibited license 0 |
| Windows Rust canonical | 79 unit + 1 process PASS | 38.501 | `5ee2d1cc8eed6b193178209d27e3a25e32ab1f9495a51c91582df5a0025df2af` | `1224079c427889cff858febd62a78e42ce041254216a9a7d0a9806be6e1a3aa4` | fmt、check、locked full test、failed/ignored 0 |
| release executable / freshness | PASS | 1.035 / 1.078 | `d2698e2d0ce303c91ab501cbe83c641d30cfe78f6f531853e1077d0c426900a1` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | 現行input hashに束縛したexeを再利用 |
| FT-B07-008 product | PASS | 13.702 | `4c76f20422276307d8a904d26d2a2c0a86c9627e88869572dc4ffe08d7825cc8` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | 1保存、5更新、restart復元、unset、source difference 0 |
| product cleanup audit | PASS | 0.946 | `b81f2b3b0194b087912b75a46012f276e1d5fa3249db6cd5d0d0a5b11413c467` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | 製品/WebView2 process、port、SQLite lock残留0 |
| CoDD scan | PASS | 1.490 | `ded830e4052a681dfd443bf3c2036714a8c7ee3811fa31054e2a61ec44190fcc` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | 72 nodes / 148 edges |
| CoDD check | exit 0 / red 0 | 25.791 | `be71b0b84e0b9eff95d499bca8dc2c69976296af83dd72b26d887163ad6dcae5` | `99315b41ae1bfa05c0f442da8956280b695ed3f9575c56ac3b72f0292ecd8e28` | `depends_on_consistency` PASS |
| CoDD verify | exit 0 / red 0 | 30.496 | `32faa4d001584dd675af2e6a77a54e8ba77739eb36ebb7fd027986066846663e` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | canonical tests・typecheck・source integrity 13 files |

accepted runの前にformal retryを2回行った。`imp-008-20260809T111354743Z`
（JSON `wsl-20260809T111354Z-2.json`、SHA-256
`127a61cd901990f6d89c954c206a4777dba2501634a7cd36db7c7313fca6c067`）はcodd-verifyで既存
`confirm_next`の一過性full-suite failureとなり、後続accepted runのfull canonicalでPASSを再確認した。
`imp-008-20260809T111737999Z`（JSON `wsl-20260809T111737Z-2.json`、SHA-256
`9523d3189d6abda05c9b2df72ffc5e9df0aec28480801d6430ed06f4f5755074`）はRating要件外のshared
cold-thumbnail wait timeoutでproduct-ratingが停止したため、rating laneから当該waitを除外した。両runは
accepted evidenceへ再利用しない。

CoDD verifyの任意profile advisoryは`3 PASS / 0 red FAIL / 1 amber WARN / 3 SKIP / 1 VACUOUS`、
verification tests 0の生値を維持し、ratingの機能PASSへ加算しない。IMP-008の直接判定は
FT-B07-003、Rust rating契約、FT-B07-008、source-tree非破壊を正本とする。

IMP-008の最終tracked差分は、rating product/UI source 1件、focused frontend test 1件、Python test 1件、
共有Windows検証script 2件、要件・設計文書3件、台帳・roadmap・結果文書4件のexact 12 pathである。
生成された`dist/`、`target/`、CoDD scan出力はcommit対象にしない。

## 現行suiteの所有境界（2026-08-09監査）

本書のaccepted rawは2026-08-03時点の不変な履歴証跡であり、現在のtest件数を表さない。
現行frontend suiteはApp/client接続を観測する`FT-B07-001`〜`FT-B07-004`の4件とし、
全clientをmockした旧`FT-B07-005`は削除した。原本、library file、`library.index`のbyte不変は
Rustの`fr_b07_reading_position_separation_survives_metadata_crud`を正本とする。IMP-006はmemoについて
mtimeを含む完全なdirectory treeと製品WebView2境界を追加観測した。IMP-007はhistoryについて
success-only、dedup、order、restartと同じ製品境界を追加観測した。IMP-008はratingについて1/5、
restart、unset、viewer再openと同じ製品境界を追加観測した。過去rawのSHA記録を現在のproduct PASSへ
読み替えない。

## cmd_400 実測範囲と接続境界（履歴）

- 採用対象は `FUT-C-023`（memo）、`FUT-R-004`（閲覧履歴）、`FUT-R-005`（評価）。
- 未読・読書中・読了の読書状態ラベルは未決定の別トラックであり、本結果に含めない。
- metadataはlibrary root外のapp-local SQLiteだけへ保存し、原本、書庫、画像、sidecar、管理fileへ
  書き込まない。cloud sync、外部書誌、telemetry、network送信は機能の前提にしない。
- accepted frontend exact5/typecheck/build evidence root:
  `queue/reports/evidence/cmd_400/fr_b07_node_fs_type_final_resume`。
- accepted App regression evidence root:
  `queue/reports/evidence/cmd_400/fr_b07_production_open_seam_semantic_redo`。
- accepted Rust exact5/full evidence root:
  `queue/reports/evidence/cmd_400/fr_b07_rustfmt_final_resume`。
- restored CoDD evidence root:
  `queue/reports/evidence/cmd_400/fr_b07_reject_codd_draft_restore_gate`。

## cmd_400 connected evidence matrix（履歴）

| Test ID | 契約 | 実測状態 |
|---|---|---|
| FT-B07-001 | memo保存、編集、clear、再表示 | PASS |
| FT-B07-002 | production open成功境界からhistory APIへ接続し、failed/empty/cancelledを記録せず、決定順序と作品row重複0 | PASS |
| FT-B07-003 | rating 1/5、未設定、invalid拒否 | PASS |
| FT-B07-004 | v2→v3 migrationと再起動後の全値 | PASS |
| FT-B07-005 | reading position分離、実original/library snapshot・hash差分0、`library.index`不変 | PASS |

frontend focusedは変更後source SHA
`f7031d69365005301961896db87da20ace8b9c5086531c6ad7501e9b68aa9c83`の上記exact5を一回選択し、
5 PASS、0 FAIL、0 SKIP、duplicate 0、exit 0である。App回帰は1 file・39 PASS、0 FAIL、0 SKIP、
direct web adapter calls 0、exit 0である。FT-B07-002はproduction `open_comic`へ接続した
open-history seamで、成功したcurrent-generation・非空openだけを一行記録し、failed/empty/cancelledは
0行となることを履歴表示まで観測した。FT-B07-005は実一時original/library fixtureを用い、metadata、
history、rating、reading-position操作の前後でbyte/SHA snapshotを比較し、original、library、
`library.index`の差分0を観測した。

## cmd_400 accepted raw ledger（履歴）

受理済みrawのSHAは測定時点の不変参照である。各行の `run_count` は1、retryは0であり、accepted
frontend rawは再実行していない。

| command | status | exit | 件数 / SKIP | manifest SHA-256 | stdout SHA-256 | stderr SHA-256 |
|---|---|---:|---|---|---|---|
| frontend_ft_b07_focused_json | ACCEPTED_IMMUTABLE_REFERENCE | 0 | FT-B07-001〜005 exact5; 5 passed; 0 failed; 0 skipped; duplicate 0; source SHA `f7031d69365005301961896db87da20ace8b9c5086531c6ad7501e9b68aa9c83` | `e8b2f80dc8a888d6b1d30d77a92de91a37924666d70ae6b0ab1ce41acb5f96e5` | `fa650fbaf4ff41c316ece825d4eb854c158ac34186792fb7b108e082bc50c82c` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| frontend_app_regression_console | ACCEPTED_IMMUTABLE_REFERENCE | 0 | 1 file; 39 passed; 0 failed; 0 skipped; direct web adapter calls 0 | `61e315c69353832f1c5bd0d3654946ef00f9e3282c50b0ca34ea44589ec9ef22` | `08a87b125f0e0a53a0bd2e2c716e6f758e344ff6b1906c2bbc244c725354c840` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| rust_fr_b07_exact5 | PASS | 0 | FR-B07 exact5; 5 passed; 0 failed; 0 ignored; 0 skipped | `cfda35406b78a9f54b9802e778742662bd8e52cb84db23949891f1e6a1b89233` | `183e3903947eb258abe21709870766315345cf246b5b78479fed95e509303a10` | `ae905bcf7333addf0b0de89c426235ed167ef5e4292bd2cf66e3430236751265` |
| canonical_windows_offline_rust_wrapper | PASS | 0 | 66 unit + 1 process; 67 passed; 0 failed; 0 ignored; 0 skipped | `8570b03c8b8906d4f7a4abc80ddb0f62e2169aacbcdc42aa1ef2b9ce35813a36` | `d61c8d92af8474b90aa2d4aa39adbc8f0f1b383e025a4d7b2306be3128c2312c` | `ada375b0eba1d9560e9bfaf926b522177d4d257295c7aeea8c15d4f8ce3f4734` |
| typecheck | PASS | 0 | executed; 0 skipped | `f9e29543ebc74c92a00c457eec8d972600407e264670331143f4a09153b0948d` | `d2297a8e6a87dc32114bcda90f5c007ec0f1b287e38f677de0314e929ea78294` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| build | PASS | 0 | executed; 0 skipped | `54fccdea2a0a31370659e48ad9d605bcf45c7a560e8c8a35c1cbe9b8edd97954` | `5145cd83897a30cbd37916d882fffa259f125353c0115cf3d3a3b774d733eedc` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

Rust exact5のテスト名は次のとおりである。

- `fr_b07_memo_crud_clear_and_reopen`
- `fr_b07_history_deterministic_order_and_dedup`
- `fr_b07_rating_boundaries_and_invalid_rejection`
- `fr_b07_v2_migration_preserves_old_values_and_is_idempotent`
- `fr_b07_reading_position_separation_survives_metadata_crud`

canonical Rust wrapperは `CARGO_NET_OFFLINE=true` で実行され、cargo fmt check、cargo check locked、
cargo test lockedをPASSとした。これはWindows Rust toolchainの証跡であり、Windows WebView2 native
product UIの実機gateを満たすものではない。

## cmd_400 CoDD raw ledger（履歴）

CoDD 3.37.0の復元後rawを参照した。scan/check/verifyは各 `attempt=1`、`run_count=1`、retryなし、
overwriteなしである。exit 0とred 0はプロセス・red gateの事実であり、構造的SKIP/VACUOUSをPASSへ
昇格する根拠ではない。

| command | status | exit | raw summary | manifest SHA-256 | stdout SHA-256 | stderr SHA-256 |
|---|---|---:|---|---|---|---|
| codd_scan | PASS process | 0 | 58 nodes; 120 edges; red 0 | `d5b843479ee8a5635bd6aa92678144b67813c6f87c1141177f61d2dec2554384` | `428e31b7481958f2c90a66a3d8ed04b4a681834a9f886951e20db732106f9fc4` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| codd_check | PASS process | 0 | red gate failures 0; advisory 4; task_completion vacuous | `a1cf36608fe80076dce202252b0dbd6387f1b717711afb914a635ed32681de6f` | `0c264281dd7e2b56db04817e83ebe28b851f000b8f4e643f62348967f59715b7` | `ff63d03aa6cd827fa8efdda2b33e28428e263010bce88bd89b3a9b8bae719b37` |
| codd_verify | INCOMPLETE / NOT APPLICABLE | 0 | 3 PASS / 0 red FAIL / 1 amber WARN / 3 SKIP / 1 VACUOUS; verification tests 0 PASS / 0 FAIL / 0 SKIP / 0 total | `93f6aeef90bfacde5a7f1f76eddbbdb1510dc83adb7f97fd3739069acb7685a6` | `a316eb93fd73616896c371b3debd777400e5a77db2ff97366f4b8461f6f4231c` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

verifyの3 SKIPは `deployment_completeness`、`user_journey_coherence`、`environment_coverage`、
1 VACUOUSは `task_completion` である。verification node totalは0であり、3 SKIPと1 VACUOUSは
`INCOMPLETE / NOT APPLICABLE` の生値として開示する。これは機能focused testのSKIP例外ではない。
CoDD rawは `codd/codd.yaml` 復元後の既存測定であり、最終文書同期後に再実行していない。raw scan時点では
文書同期前のため `docs/testing/fr-b07-results.md` のCoDD frontmatter欠落警告を含むが、今回のfrontmatter
追加は文書同期であり、CoDD再実行や構造値のPASS化を意味しない。

## 不採用CoDD草稿の履歴

過剰CoDD contract草稿は製品出力へ採用せず、project外証跡へ保存したうえで撤回した。

- disposition: `REJECTED_UNCOMMITTED_DRAFT`
- capture manifest SHA-256: `d82880b1c2d9381e3f445b6ba0f45d81341cb046d12b43c72f34597017e0b7f3`
- disposition SHA-256: `1e0f67db1baa14b409b3c035f57e15927c50528c33a9fa738503a3cbbe0febf6`
- `codd/codd.yaml` task-before/after SHA-256: `4221c7a45d6a74e62ee469000262addda4450fea433fe9ed35ed3e2c59348ccd`（一致）
- removed draft paths: 6; never-present `tests/e2e` candidates: 2; post-restore draft paths: 0
- accepted functional path setにはdraft、plugin、contract、deploy、smoke、e2e成果物を含めない。

## cmd_400 scope and safety ledger（履歴）

最終worktreeの機能pathは11件であり、draft contaminationは0、staged pathは0である。

1. `docs/product/feature-roadmap.md`
2. `docs/product/feature-status.md`
3. `src-tauri/src/application/mod.rs`
4. `src-tauri/src/lib.rs`
5. `src-tauri/src/state/repository.rs`
6. `src/App.test.tsx`
7. `src/App.tsx`
8. `src/features/library/client.ts`
9. `docs/requirements/reading-metadata-requirements.md`
10. `docs/testing/fr-b07-results.md`
11. `src/App.fr-b07.test.tsx`

今回の最終同期で編集する文書は1、2、9、10の4 pathだけである。上記以外の7機能pathはbyte不変
保全する。原本/library snapshot差分、library管理file、network、commit、pushは0である。
OS syscall monitorは別gateとして `NOT_RUN_SEPARATE_GATE` と開示し、local-only境界の証跡を過大主張しない。

## cmd_400 最終diff QC handoff（履歴）

同期後の11path exact diff/hash/statusは
`/home/yaman/tools/multi-agent-shogun/queue/reports/evidence/cmd_400/fr_b07_final_docs_sync_diff_qc`
へ保存し、Gunshiの最終diff QCへ提出する。機能raw、Rust、typecheck、build、CoDDの再実行、retry、
commit、pushは行わない。
