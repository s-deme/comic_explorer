---
codd:
  node_id: "test:fr-b05-results"
  type: test
  status: approved
  confidence: 0.95
  depends_on:
    - id: "req:fr-b05"
      relation: "verifies"
      semantic: "windows-product-and-canonical-evidence"
---

# FR-B05 名前検索結果

`FUT-C-010`はIMP-012で`Implemented / PASS`、FR-B05は単一featureのため`Done`である。
10,000項目・1秒性能は別の性能gateであり、未実測のまま本結果へ加算しない。

## IMP-012 Windows製品・canonical結果

正本コマンドは`./scripts/run-feature-verification-wsl.sh IMP-012 -RustMode Canonical`である。accepted runは
`imp-012-20260809T115152523Z`、UTC 2026-08-09 11:51:52から11:53:57、全12 stage exit 0、合計125.254秒である。
log rootは`src-tauri/target/verification/imp-012-20260809T115152523Z/`、最終JSONは
`src-tauri/target/verification/wsl-20260809T115151Z-2.json`、JSON SHA-256は
`86d376316f8fc55f640c740ed0b8848166433758ad5432f27353ec52fe407f7b`である。

release freshnessはinput hash
`42c25b52ced13789bbd9323395b012fe72bbc8d9503aa84bd59d1fca23e93391`、input 112 files、
exe `src-tauri/target/release/comic-explorer.exe` SHA-256
`2e5049fcc21559890cd6cac8ba8b199138173204a89bb9c297750eb7bdde4df6`へ束縛する。
source bindingは`src/App.tsx`=`b9b13b142453d28dbbf0a3009cedca61d155eebba91624ba7fb40672e070b05a`、
`src/App.test.tsx`=`98e0ef7f6017d4c40b6a850e130196158350eb526487ba0ee031228e2f9bbc74`、
product harness=`86640d00b8a7350cef09752c916d7e1c540512165c61014acee8f42d616f39b4`、
feature runner=`48f5fe1f8b7bd44cce0028fff30e558986c861be143a0705583bc9176bd91277`、
toolchain runner=`5d3c1adece012fdc6915869559f64fa5601dd51ca5b5bd74d745335464a3a883`、
Python guard=`61b027c5437075c0c5d198bbd94afd4f67eb01a95aea9a0f42a96f38d695abcc`、
FR-B05要件=`a1b4d5604936894fd4da5c316018ef2ff1c363fb6fcf1be9d3622c9a129d5de1`、
Windows toolchain要件=`df1561cf78b268048eaeb2df3490ff1a24744716b3acda1ba2131ff9f69f635f`、
implementation plan=`7b8d50b1b870ab1dc9d6c27c5aa335960fc36088cc9f850b3ef4ba1e00290eb6`である。

| Gate | 結果 | 秒 | stdout SHA-256 | stderr SHA-256 | 直接観測 |
|---|---|---:|---|---|---|
| toolchain bootstrap | PASS | 4.142 | `c3e14a481e2da7cf8718e9ec533ae8471c939280295e41772b6e7540bebb706a` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | Windows native toolchainを解決 |
| frontend focused | selected FT-B05-001〜005: 5 PASS / 0 FAIL、34 excluded-by-pattern | 5.658 | `4311863fc102bf45d63027c95d95d39670928b0bc5e2bac056c31d7c3421d2ef` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | normalize、mixed kind、navigation、empty/error/clear/stale、explicit rescan |
| typecheck | PASS | 4.231 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | TypeScript error 0 |
| frontend SBOM/build | PASS | 3.987 | `b20a8adc3b8096cf953c37a82437db9421b9b5a57835c7cf21699078252ffa9e` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | 665 components、unknown/prohibited license 0 |
| Windows Rust canonical | 79 unit + 1 process PASS | 37.251 | `8513e9e2923166c017f749c237012bbc8306a13c33c6341bf4fa9dda2da038e7` | `bd112759f0d3aedf5e8d9ed990675df53228311047351e648e461dcb705ce700` | fmt、check、locked full test、`search_port_`契約 |
| release executable | PASS | 1.281 | `5f02f65740ff4ccb452ba0cb3dff780eceb6b7735a6dd2420b9f14efb50a27f9` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | input manifestへ束縛したexe |
| release freshness | PASS | 1.028 | `5f02f65740ff4ccb452ba0cb3dff780eceb6b7735a6dd2420b9f14efb50a27f9` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | stale executable 0 |
| FT-B05-006 product | PASS | 10.517 | `e4c5ea168201b5927dfa20f21c76c41a1ad7244532011680824221254f333fa8` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | normalized mixed-kind exact2、navigation、empty/clear、explicit rescan、file/directory source difference 0 |
| product cleanup audit | PASS | 0.927 | `b81f2b3b0194b087912b75a46012f276e1d5fa3249db6cd5d0d0a5b11413c467` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | product/WebView2 process、port、SQLite lock、evidence残留0 |
| CoDD scan | PASS | 1.622 | `ded830e4052a681dfd443bf3c2036714a8c7ee3811fa31054e2a61ec44190fcc` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | 72 nodes / 148 edges |
| CoDD check | exit 0 / red 0 | 25.416 | `be71b0b84e0b9eff95d499bca8dc2c69976296af83dd72b26d887163ad6dcae5` | `99315b41ae1bfa05c0f442da8956280b695ed3f9575c56ac3b72f0292ecd8e28` | `depends_on_consistency` PASS、advisory 4 |
| CoDD verify | exit 0 / red 0 | 29.109 | `03b9eaf036d46e49d8acb9529e186f50303b553165f1338ab9246705713ede1f` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` | full canonical frontend 104/104 PASS、typecheck、source integrity 13 files |

product rawは`{"emptyAndClear":true,"normalizedQuery":true,"status":"ok","freshRescan":true,"test":"FT-B05-006","sourceDifferenceCount":0,"navigated":true,"mixedKind":true}`である。
CoDD verifyの任意profile rawは`3 PASS / 0 red FAIL / 1 amber WARN / 3 SKIP / 1 VACUOUS`、verification tests 0であり、
生値として開示して機能PASSへ加算しない。直接判定はFT-B05-001〜005、Rust `search_port_`、
FT-B05-006、source-tree非破壊を正本とする。

## 不採用formal runのRCA

先行run `imp-012-20260809T114720274Z`（最終JSON
`wsl-20260809T114719Z-2.json`、SHA-256
`a3eb98c39766c338af2d8d67f132cdafad24239973e0a3dce5b325d4b08d2ef5`）は、codd-verify内の既存
`opens the sorted first comic when loop is selected at the final comic`が一過性に失敗し、103 passed / 1 failed
（104）となったためexit 1で不採用とした。codd-verify raw SHA-256は
`92c943c89431c2b6b4221b0755113a4c429199ca0d66ac9d3265f4efd36061d0`、canonical test raw SHA-256は
`b4d727d4060078ef885e61970a92c8a5f0b972e441c2e5e19125340a1eb54d5e`である。後続accepted runのfull canonicalは
104/104 PASSであり、単独diagnosticのrawは受理証跡へ束縛しない。この不採用runはIMP-012の機能FAILとして
扱わず、RCA履歴としてのみ保持する。

IMP-012の最終tracked差分は、search clear generation source 1件、frontend test 1件、Windows検証script
3件、Python guard 1件、要件・設計文書3件、台帳・roadmap・結果文書4件のexact 13 pathである。
生成された`dist/`、`target/`、CoDD scan出力はcommit対象にしない。
