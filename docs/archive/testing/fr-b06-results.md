---
codd:
  node_id: "test:fr-b06-results"
  type: test
  status: approved
  confidence: 0.95
  depends_on:
    - id: "req:fr-b06"
      relation: "verifies"
      semantic: "favorites-windows-product-and-canonical-evidence"
---

# FR-B06 お気に入り結果

IMP-013は`FUT-C-011`のcurrent-session quick accessを、IMP-014は`FUT-C-021`のpersistenceを
それぞれ`Implemented / PASS`へ更新した。二つの独立したaccepted ledgerが揃ったため、FR-B06 aggregateは
`Done`である。以下のIMP-013記録は履歴として不変に保持する。

## IMP-013 Windows製品・canonical結果

正本コマンドは`./scripts/run-feature-verification-wsl.sh IMP-013 -RustMode Canonical`である。accepted runは
`imp-013-20260809T122858424Z`、UTC 2026-08-09 12:28:58から12:33:07、全12 stage exit 0、合計249.152秒である。
log rootは`src-tauri/target/verification/imp-013-20260809T122858424Z/`、最終JSONは
`src-tauri/target/verification/wsl-20260809T122857Z-2.json`、JSON SHA-256は
`373c3b57abfbcea32e2580b63ffb7708a46bc8a84760938e25f1737bb102e21c`である。

release input hashは`cba092995b87a22cf69a8804c74109334633ea3b8133d977b0012db246df1da5`、input 112 files、
exe `src-tauri/target/release/comic-explorer.exe` SHA-256は
`e84c0afcb984e673d4778ac49818de490241f30171621418b1977ebde1d59f80`である。
source bindingは`src/App.tsx`=`ec91b21fab1017dac1fc438149289fbc74d2aaeab300b2696668b29c19e2dd31`、
`src/App.test.tsx`=`7c9c735459edc8edba0ccc3d343d5aaa5a9066058bfdf0d582b856ad3e6dc000`、
product harness=`4856dbc1303cab87e13391c17d33f8ebb8c5f66b34ab7778cf89f42e1d395fe9`、
feature runner=`04b1125dd15a9a1cf00923c32f3cc48b19e41688a75f8073725a471becb43631`、
toolchain runner=`5d3c1adece012fdc6915869559f64fa5601dd51ca5b5bd74d745335464a3a883`、
Python guard=`1deabd4a136bcc8e0848aa42cbc56e600d23bf01888622d42d2a0182ac5657b2`、
FR-B06要件=`1d3a7bce3ce2af46986186721e98d86c1710f4908802cb6f7ce273d578d523e4`、
Windows toolchain要件=`89ede134fad5296d4f434a4a2527bf325ff483950496a6060bb5d062c2854479`、
implementation plan=`05c66c8b863bdd8d8a23709ae5ec3c53e29123a91bc369c0be5749971f837a8c`へ束縛する。

| Gate | 結果 | 秒 | stdout SHA-256 | stderr SHA-256 | 直接観測 |
|---|---|---:|---|---|---|
| toolchain bootstrap | PASS | 4.718 | `c3e14a481e2da7cf8718e9ec533ae8471c939280295e41772b6e7540bebb706a` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | Windows native toolchainを解決 |
| frontend focused | selected FT-B06-001/002: 2 PASS / 0 FAIL、37 excluded-by-pattern | 5.825 | `6fadc56dae16bd9e6b5ac4a605ac32bd93db9a27ad8393b3e2ba5c1c18efc960` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | current-session add/remove/dedup、quick access navigation |
| typecheck | PASS | 4.750 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | TypeScript error 0 |
| frontend SBOM/build | PASS | 4.537 | `8617aa189dcc9f6c8838b8087d081517459952553a5ff0ec78a33ae29a5f6eec` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | 665 components、unknown/prohibited license 0 |
| Windows Rust canonical | 79 unit + 1 process PASS | 40.708 | `f12877e966e22c0d532f9acdb9824bf004a8fcc7454c02972bada07627c84a39` | `1ff8edc9c59da048a4e5a57db6a5b06866693553aa564aa96f82c0d94a52c0f6` | fmt、check、locked full test、favorite target境界 |
| release executable | PASS | 103.569 | `bba2d98f285a1ccb8718304111e41d64b6bcdb936121dc142040a4f25cc70348` | `bebd803e33bde16a5f26ceb4e1ae5f343b79adb8fccb916f7a449e06e72846e5` | input manifestへ束縛したexe |
| release freshness | PASS | 1.337 | `63377de59932819a5482d6fbc08f45bf5eda6ab985abb67e18dd3e95b362d176` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | stale executable 0 |
| FT-B06-006 product | PASS | 12.394 | `ec7da6de0dd4d185728bbb930e65596ea2a5a5f27b0a64c16483a702f3fff777` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | available rows、folder/comicFolder/archive open、remove、source difference 0 |
| product cleanup audit | PASS | 1.071 | `b81f2b3b0194b087912b75a46012f276e1d5fa3249db6cd5d0d0a5b11413c467` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | product/WebView2 process、port、SQLite lock、evidence残留0 |
| CoDD scan | PASS | 1.730 | `023eaa73b74a8462901bad84697d5242227d82c07b7083cf3431b8447d754418` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | 72 nodes / 148 edges |
| CoDD check | exit 0 / red 0 | 35.017 | `be71b0b84e0b9eff95d499bca8dc2c69976296af83dd72b26d887163ad6dcae5` | `99315b41ae1bfa05c0f442da8956280b695ed3f9575c56ac3b72f0292ecd8e28` | `depends_on_consistency` PASS、advisory 4 |
| CoDD verify | exit 0 / red 0 | 33.404 | `997840b0d9fa9352c38367781ca59a1bb686f54c479b1e98ea319aa9fc014d93` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | full canonical frontend、typecheck、source integrity 13 files |

product rawは`{"archiveOpened":true,"comicFolderOpened":true,"addedTargets":true,"availableRows":true,"test":"FT-B06-006","folderOpened":true,"sourceDifferenceCount":0,"status":"ok","removed":true}`である。
CoDD verifyの任意profile rawは`3 PASS / 0 red FAIL / 1 amber WARN / 3 SKIP / 1 VACUOUS`、verification tests 0であり、
生値として開示して機能PASSへ加算しない。直接判定はFT-B06-001/002、Rust favorite target境界、
FT-B06-006、source-tree非破壊を正本とする。

## 不採用formal runのRCA

先行run `imp-013-20260809T121756613Z`（最終JSON
`wsl-20260809T121755Z-2.json`、SHA-256
`74cac4622ee50a42d78046a42847a1fbb88b5bdeeaf00e9576360cdb9f264a60`）はproduct final remove時に
stale refreshがloading状態をstrandedさせ、`quick access folder remove and empty`がtimeoutしたため
`product-quick-access` exit 1で不採用とした。product stderr SHA-256は
`942158c6a610037531c5740f6a861bf8a72d684c9d606e071cffbea09e0cd94b`である。FT-B06-001のcurrent-session
add/remove境界を修正してaccepted runで再測定し、先行runのrawを受理証跡へ再利用しない。

IMP-013の最終tracked差分は、Quick Access UI/application source 3件、frontend test 1件、共有Windows検証script
2件、Python guard 1件、要件・設計文書3件、台帳・roadmap・結果文書4件のexact 14 pathである。
生成された`dist/`、`target/`、CoDD scan出力はcommit対象にしない。

## IMP-014 Windows製品・canonical結果

正本コマンドは`./scripts/run-feature-verification-wsl.sh IMP-014 -RustMode Canonical`である。accepted runは
`imp-014-20260809T131233721Z`、UTC 2026-08-09 13:12:33.7440575から13:15:58.8554753、全12 stage exit 0、
合計205.108秒（product 48.433秒）である。log rootは
`src-tauri/target/verification/imp-014-20260809T131233721Z/`、最終WSL JSONは
`src-tauri/target/verification/wsl-20260809T131233Z-2.json`、JSON SHA-256は
`a38472a35fb6c0623d4c3e621c39abe3555ef9a03d44ed7c0c815bc4448809cc`である。

release input manifest=`src-tauri/target/release/comic-explorer.inputs.json` SHA-256
`50073eac4415658cd235156737f907b87ba857ec6f84093de53244c09f4e2c69`、input hash
`183fedf0f1d2548893b0904934694dd7037e1d86e28a3a9caecb1301ae329d73`（112 files）、exe
`src-tauri/target/release/comic-explorer.exe` SHA-256
`c9a6b38765377de03a35019dec9d8573ebed52b4c9fdd1f18851d72e682993d6`へ束縛する。accepted source bindingは
`src/App.tsx`=`eef14930e98f7be12bc1b942e592135b32ba7eb1c056eae482ea5fb0d2643258`、
`src/App.test.tsx`=`7c9c735459edc8edba0ccc3d343d5aaa5a9066058bfdf0d582b856ad3e6dc000`、
`src/features/catalog/QuickAccess.tsx`=`839ba16e483ca7c8eaaf5f781ffa283e030354285c4d84e905f1fb5894b11326`、
`src/features/library/client.ts`=`1bcb2cf89158be86ffdc3cddd27b46fe553b865131819a3278a06d797b6b3c76`、
`src-tauri/src/application/mod.rs`=`aceb51f20a3e190b9a63a5423c7650da9c5884665bf6c6f76c13a09eb10ab7f9`、
`src-tauri/src/state/repository.rs`=`6a394bc30c8011089c3ec1b6164275c468a487b1e69cffe95879974ff890f5b9`、
product harness=`0423deaf670da04174aff92270450236f9b5f380e8ed391c383152884a3c7ef2`、
feature runner=`b0b14a3451e4431199aced39f61b1e8366c583690c2362c251acdd0465498baa`、
Python guard=`c4b7d46c4a10d6a2d4509fd7dcb79d15e2d3f1e880867e73e9a2100690d0853d`、
FR-B06要件=`c46323fcc9aec6b219dffc6a7bcff1991561668e566a2fe31548950787def23f`、
Windows toolchain要件=`7963e3bbec05c545a6be97231ccca213d0138ae79a4ce77a1392347f82810ef2`、
implementation plan=`4a4bbead68b911b0e5284e8733b10d02d49a27a390407fc06de9348beceed9f6`である。

| Gate | 結果 | 秒 | stdout SHA-256 | stderr SHA-256 | 直接観測 |
|---|---|---:|---|---|---|
| toolchain bootstrap | PASS | 4.447 | `c3e14a481e2da7cf8718e9ec533ae8471c939280295e41772b6e7540bebb706a` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | Windows native toolchainを解決 |
| frontend focused | selected FT-B06-003〜005: 3 PASS / 0 FAIL、36 excluded-by-pattern | 5.774 | `bf39fd375eab27a3a4dd83eedc6648e996b3c5d2f285c381c6ecfe7877267da9` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | quick access再open、safe moved/missing/re-resolve、eligible target UI |
| typecheck | PASS | 4.312 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | TypeScript error 0 |
| frontend SBOM/build | PASS | 4.274 | `4d0d7cab65ddac9dc73ba009b63add14b46e433218b0afb6539d86bfbb377c56` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | release frontend/SBOM生成 |
| Windows Rust canonical | 81 unit + 1 process PASS | 63.674 | `6869769431378d0e4c7fa6e2ee37abb4ba82479f4374a989db6910fc8588bd6e` | `2ea9b94d702d8981ed3856246342ad31ba28f1d8c6869e6b74b8d85c2599e4f1` | `fr_b06_favorite_`: v1 migration/reopen/source separation、strict fingerprint/re-resolve |
| release executable | PASS | 1.323 | `c68eb4be4810aefaf84ffceece0f7e3efe91952b95491c1809e8d72648e022cd` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | input manifestへ束縛したexe |
| release freshness | PASS | 1.282 | `c68eb4be4810aefaf84ffceece0f7e3efe91952b95491c1809e8d72648e022cd` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | stale executable 0 |
| FT-B06-007 product | PASS | 48.433 | `0c0e9702f63d31d6df05ea60aabc7096cbfbda7f1b453dde7af17524cc2483d4` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | restart、stable ID、moved/missing safe stop、rescan/re-resolve/remove、source difference 0 |
| product cleanup audit | PASS | 1.233 | `b81f2b3b0194b087912b75a46012f276e1d5fa3249db6cd5d0d0a5b11413c467` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | product/WebView2 process、port、SQLite lock、evidence残留0 |
| CoDD scan | PASS | 2.621 | `3609a6e0a702b0c150679ba81039e6b98b82702ab8c6640acb4f88756d17aef6` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | 74 nodes / 150 edges |
| CoDD check | exit 0 / red 0 | 33.352 | `be71b0b84e0b9eff95d499bca8dc2c69976296af83dd72b26d887163ad6dcae5` | `99315b41ae1bfa05c0f442da8956280b695ed3f9575c56ac3b72f0292ecd8e28` | `depends_on_consistency` PASS、advisory 2 |
| CoDD verify | exit 0 / red 0 | 34.311 | `9bf6d9ceeacd1a5263ff64ad26f874779bd2da5faf4ad952f4b06e5703b83242` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | full canonical frontend、typecheck、source integrity 13 files |

product rawは`{"removed":true,"restartPersisted":true,"missingRescanned":true,"reResolved":true,"movedDetected":true,"stableFavoriteIds":true,"missingStopped":true,"test":"FT-B06-007","sourceDifferenceCount":0,"status":"ok"}`である。
CoDD verifyの任意profile rawは`3 PASS / 0 red FAIL / 1 amber WARN / 3 SKIP / 1 VACUOUS`、verification tests
`0 PASS / 0 FAIL / 0 SKIP / 0 total`である。これはadvisory生値として開示し、機能PASSへ加算しない。直接判定は
FT-B06-003〜005、Rust `fr_b06_favorite_`、FT-B06-007、source-tree非破壊を正本とする。

## IMP-014 不採用formal runのRCA

先行run `imp-014-20260809T130417605Z`（最終WSL JSON
`src-tauri/target/verification/wsl-20260809T130416Z-2.json`、SHA-256
`8d6eccdf9c3b4f28910763ed509474e776bbe4034bed25ed222bb4894c490418`）は全体329.984秒、
`product-favorite-persistence`だけexit 1で不採用とした。product stdout SHA-256は
`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`、stderr SHA-256は
`df8ae90ee0490505424f087cdc24677728bba889c11bfbce87617414fc43307d`である。原因は外因move前の
`FileInfo`をmove後に再参照してmtime oracleを比較していたことであり、archive size/mtimeをscalarでcaptureし、
mtime復元を明示した。修正後のdirect product PASSを確認してからaccepted formalを全12 stage exit 0で再実行し、
不採用runのrawをaccepted証跡へ再利用していない。

IMP-014後の最終tracked差分は、frontend source 2件、Rust source 2件、共有Windows検証script 2件、
Python guard 1件、要件・設計文書3件、product/status/roadmap/結果文書4件のexact 14 pathである。生成された`dist/`、`target/`、
CoDD scan出力はcommit対象にしない。
