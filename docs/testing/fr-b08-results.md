---
codd:
  node_id: "test:fr-b08-results"
  type: test
  status: approved
  confidence: 0.95
  depends_on:
    - id: "req:fr-b08-webp"
      relation: "verifies"
      semantic: "static-webp-windows-product-and-canonical-evidence"
---

# FR-B08 追加画像形式結果

## 判定

IMP-015で`FUT-C-005`（static WebP）を`Implemented / PASS`とする。`FT-B08-001`、Rust
`fr_b08_webp_`、release WebView2 `FT-B08-006`、library source tree非破壊を同じaccepted runで
直接観測した。animated WebPは`UnsupportedFormat`として局所errorから復帰し、animation機能のPASSへ
読み替えない。

FR-B08 aggregateは`Partial`である。`FUT-C-006`（static GIF）、`FUT-C-007`（animation GIF）、
`FUT-C-008`（AVIF）はCandidate / NOT TESTEDのまま残り、IMP-015のPASSをそれらへ波及させない。

## IMP-015 Windows製品・canonical結果

正本コマンドは`./scripts/run-feature-verification-wsl.sh IMP-015 -RustMode Canonical`である。accepted runは
`imp-015-20260809T141831106Z`、UTC 2026-08-09 14:18:31.1259789から14:20:38.2615172、全12 stage exit 0、
合計127.132秒（product 11.476秒）である。log rootは
`src-tauri/target/verification/imp-015-20260809T141831106Z/`、最終WSL JSONは
`src-tauri/target/verification/wsl-20260809T141830Z-2.json`、JSON SHA-256は
`99ac0eac526ea6fb2a622787fd3146164b8cbfeb43e14ae77b305ed9c22a00b3`である。

release input manifestは`src-tauri/target/release/comic-explorer.inputs.json`、SHA-256
`36423f84d7650c11090561ac306796a6610bb3d9f60a3a64e0456b969cb0b22e`、input hash
`841d4bdc4782e962b6f5e72954a555c98228475b12b49f4f1cdd822e55b3a720`（112 files）である。exe
`src-tauri/target/release/comic-explorer.exe` SHA-256は
`622175e0e2f0697715f5457663aa092dfc38cc837d6682c5a8a6bfd7db3c8a98`である。

accepted source bindingは`src/App.tsx`=`eef14930e98f7be12bc1b942e592135b32ba7eb1c056eae482ea5fb0d2643258`、
`src/App.test.tsx`=`78e6535b49d8cf022238416bf0609e53ae6c252cdef2d5331207209ae157e41d`、
`src/features/viewer/Viewer.tsx`=`6f941c60a84123f3ae0c164452f2fa17be91278eb44f22e0b1af5576d5e66f8c`、
`src/features/catalog/CatalogGrid.tsx`=`716fe7749e9b5cd9c3e6ff3a68c18d8816e4518433242617aea6985b360ee11d`、
`src-tauri/src/catalog/thumbnail.rs`=`376eb9a3ac4b3fabb63b3b7e79e1edcd270a18f393f7492fd14f103045a84e56`、
`src-tauri/src/catalog/image_metadata.rs`=`4d7cfcc397df69181500d958ff2d995632e21c60882d08f80cebebb46dfc6759`、
`src-tauri/src/catalog/mod.rs`=`b38f77c5b679ff8e4a117d5475b5c96cef30d957749b917cfd0f8010b08bd896`、
`src-tauri/src/domain/file_kind.rs`=`bfcdfa7329442399f71a8d4d59c0584296b288983c466fcfa670eea4dc76eeba`、
`src-tauri/src/media/mod.rs`=`ab315ac3789c010bd168193b5ec1cbd373a0fe4a762dfcc406cac9e03f487844`、
`src-tauri/src/application/mod.rs`=`e3b4cdc37d8f465fe329339194db3a5f4c66936e880da7080df2d9bdbc9aa531`、
feature runner=`19354c46db4a0fc97e87e6f8e3855aaaab74ca61ee719663e69cea2c402211c1`、
product harness=`c10c3f6d6ff9d84c9621b00394bbcaf42bfdc7c48fb60080c3618d55d969f8a6`、
Python guard=`07c7d32b83c820dc150f1b498aa3d4e0d22aba24720bd0fb04db78f3adb1cf64`、
WebP要件=`5f08326899788376fcff57caf9d6b7027f5fe50976724de4708331059858caf6`、
Windows toolchain要件=`c8f693d05d7dfd41858e212118f41c313d895544a22ba877c8bfdbbdb22a7d9c`、
implementation plan=`acf6912b46f4c06dc12c64f73497c611290bf6540db8e2ab8e208234bdaa70e3`、
test strategy=`d52882e5f4cf718ab3103fe58a8d512828c26282eee1a4d042842e90f88077b6`、
technology evaluation=`59e8d06807638df5cb70f0aaef7d3e4e5808fec33df9f7cedf51db293305cdfe`へ束縛する。

| Gate | 結果 | 秒 | stdout SHA-256 | stderr SHA-256 | 直接観測 |
|---|---|---:|---|---|---|
| toolchain bootstrap | PASS | 3.881 | `c3e14a481e2da7cf8718e9ec533ae8471c939280295e41772b6e7540bebb706a` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | Windows native toolchainを解決 |
| frontend focused | FT-B08-001: 1 PASS / 0 FAIL、39 excluded-by-pattern | 4.675 | `1e585c4eb09e6074139025c48f543aaab1b1647f276d5d798df0782c4496dd1d` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | static WebP UI接続 |
| typecheck | PASS | 3.928 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | TypeScript error 0 |
| frontend SBOM/build | PASS | 4.023 | `18a4edd2726b2fafd232e3fa3ee8cf8c06b24c09333aea24f4b040cc24dac5d2` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | 668 components、unknown/prohibited license 0 |
| Windows Rust canonical | 96 tests + 1 process PASS | 39.302 | `44fd1f5adc2d1ec6640eb343c0fd0450bae446c1212f24e6f7fb8b010c7d3675` | `3447db6dd00063d78b4f9532559409097e2b4e90843ee1eedd1de5af5e452eee` | `fr_b08_webp_`、JPEG/PNG回帰、limit/error/alpha contract |
| release executable | PASS | 1.005 | `a5ffb3c36d3e05659b1586a91006f88fb42dd28e2663edcc4852745766cb33a7` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | input manifestに束縛したexe |
| release freshness | PASS | 1.020 | `a5ffb3c36d3e05659b1586a91006f88fb42dd28e2663edcc4852745766cb33a7` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | stale executable 0 |
| FT-B08-006 product | PASS | 11.476 | `dba64745e33094f45a0f5615fdc8921b1cd8908023037792b646b495bf64e364` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | folder/ZIP/CBZ、thumbnail/viewer、local recovery、source difference 0 |
| product cleanup audit | PASS | 0.917 | `b81f2b3b0194b087912b75a46012f276e1d5fa3249db6cd5d0d0a5b11413c467` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | product/WebView2 process、evidence、SQLite lock残留0 |
| CoDD scan | PASS | 1.549 | `93c6edc3108b0e4fc6904b4da8ecfa18539be2ca56f40ef336bfde739a8a995a` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | requirements/design/test nodesを走査 |
| CoDD check | exit 0 / red 0 | 26.118 | `be71b0b84e0b9eff95d499bca8dc2c69976296af83dd72b26d887163ad6dcae5` | `99315b41ae1bfa05c0f442da8956280b695ed3f9575c56ac3b72f0292ecd8e28` | 4 advisory |
| CoDD verify | exit 0 / red 0 | 29.184 | `9ab8617602def0c0dd62510d66f87146e3cd82931f6cf18b3a8562e026ee9a85` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | canonical frontend、typecheck、source integrity 13 files |

product rawは`{"viewerStaticLossyLosslessAlphaDecoded":true,"folderZipCbzEnumerated":true,"networkOrCodecInstall":false,"comicCoverThumbnailCacheVerified":true,"animatedLocalErrorRecovered":true,"otherComicRecovered":true,"test":"FT-B08-006","corruptLocalErrorRecovered":true,"sourceDifferenceCount":0,"status":"ok"}`である。
cleanup rawは`{"status":"ok","productProcessCount":0,"harnessWebViewProcessCount":0,"evidenceExists":false,"sqliteLockExists":false}`である。
CoDD check rawはred gate failures 0、advisory 4、CoDD verify rawは`3 PASS / 0 red FAIL / 1 amber WARN / 3 SKIP / 1 VACUOUS`、
verification tests `0 PASS / 0 FAIL / 0 SKIP / 0 total`である。これらはadvisory生値として開示し、機能PASSへ加算しない。

## SBOM・配布依存の閉包

`src-tauri/Cargo.toml` SHA-256は`105bffcb0f7af24085b6c6f5176c7dd8261704fbb4a4e315dec87f971419205f`、
`src-tauri/Cargo.lock` SHA-256は`785a189d187e288c439051fab23e71ad512479b9aefa5987874fb5d62eab17aa`、
`THIRD-PARTY-NOTICES.md` SHA-256は`daf68517dd2e41c571e1aba7e26add88c2c3d3743964c7d533cfe2c2ea7d1d16`である。
lock-backed closureのraw SPDX expression、lock checksum、選択した互換grantは次のとおりである。

| crate | version | raw SPDX expression | Cargo.lock checksum | selected compatible grant |
|---|---:|---|---|---|
| image-webp | 0.2.4 | `MIT OR Apache-2.0` | `525e9ff3e1a4be2fbea1fdf0e98686a6d98b4d8f937e1bf7402245af1909e8c3` | MIT |
| byteorder-lite | 0.1.0 | `Unlicense OR MIT` | `8f1fe948ff07f4bd06c30984e69f5b4899c516a3ef74f34df92a2df2ab535495` | MIT |
| quick-error | 2.0.1 | `MIT/Apache-2.0` | `a993555f31e5a609f617c12db6250dedcac1b0a85076912c436e6fc9b2c8e6a3` | MIT |

SBOM stageは668 components、unknown/prohibited license 0を記録し、noticeと同じlock inventoryへ束縛する。

## 不採用formal runのRCA

先行run 1 `imp-015-20260809T141225248Z`（最終WSL JSON
`src-tauri/target/verification/wsl-20260809T141224Z-2.json`、SHA-256
`f3c4aa78819fa2e707f3988cf5ef0484e6360a62d50134503ca2affe6ffe325d`）は合計17.343秒、typecheckがexit 2で停止した。
`src/App.test.tsx`のplain `number` generationをbranded `Generation`へ渡した`TS2345`を修正して再実行したものであり、typecheck stdout SHA-256は
`2e297463d68458a2400b1079f35816f6df320ebc60f41d3e49061d538c942912`、stderr SHA-256は
`4ca171163006b7d9ea01a4f92831cf358709c7a048c25fd5de3df97a37c2bed8`である。

先行run 2 `imp-015-20260809T141323712Z`（最終WSL JSON
`src-tauri/target/verification/wsl-20260809T141323Z-2.json`、SHA-256
`f8137dd2fd30dcbe688479f708717dc4b547ad36a687328334bf435fa5df3f1d`）は合計216.531秒、product-webpがexit 1で不採用とした。
`System.IO.Compression.ZipArchiveMode` assembly解決失敗によりfixture ZIP/CBZ組立が開始できなかったためであり、
product stdout SHA-256は`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`、stderr SHA-256は
`9b11efe5411d6c0b89bc3b7d7d1054468a63ea5cd546e330ccef8f792cc78815`である。いずれもaccepted rawへ再利用せず、
修正後のaccepted formalで全12 stage exit 0を再確認した。

IMP-015のtracked source/test/tooling/requirements-design/research-license実装差分と、本結果を含むproduct ledger
4文書をcommit対象とし、生成された`dist/`、`target/`、CoDD scan出力はcommit対象にしない。ユーザー指定により
IMP-015完了後は停止し、IMP-016はCandidateのまま`Next`へ昇格させない。
