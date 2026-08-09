---
codd:
  node_id: "test:fr-b06-results"
  type: test
  status: approved
  confidence: 0.95
  depends_on:
    - id: "req:fr-b06"
      relation: "verifies"
      semantic: "quick-access-windows-product-and-canonical-evidence"
---

# FR-B06 お気に入り結果

IMP-013は`FUT-C-011`だけを`Implemented / PASS`へ更新した。shared FR-B06 implementationの
`FUT-C-021`（restart/migration/missing/moved/re-resolve）はIMP-014 Nextで`Candidate / NOT TESTED`のまま、
FR-B06 aggregateは`Partial`である。

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
