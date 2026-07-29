# Comic Explorer MVP 完了プロンプト

`/mnt/e/script/comic_explorer` のComic Explorer MVPを完成させてください。

現在の基準コミットは`9b7123f`です。最初に`git status`、直近コミット、
`AGENTS.md`を確認し、既存のユーザー変更を上書きしないでください。

## 最初に読む資料

以下をすべて確認してください。

- `docs/requirements/mvp-requirements.md`
- `docs/design/implementation-plan.md`
- `docs/design/architecture.md`
- `docs/design/screen-flow.md`
- `docs/testing/test-strategy.md`
- `docs/testing/test-cases.md`
- `docs/testing/phase6-verification-results.md`
- `docs/testing/phase6-case-results.md`
- `docs/testing/phase6-manual-procedures.md`
- `docs/testing/performance-benchmark-plan.md`

`phase6-case-results.md`のNOT RUN 37件とBLOCKED 11件、および
`phase6-verification-results.md`の「既知の未完了実装」を残作業の正としてください。
すでにPASSの24ケースを再実装しないでください。ただし後続変更によるregressionは
毎回確認してください。

## 目的

この環境で実装・自動化可能な項目をすべて完了し、NOT RUNを可能な限りPASSへ移す
ことが目的です。外部Windows実機・clean VM・隔離監視環境が本当に必要な項目だけを
BLOCKEDとして残してください。1項目で止まらず、安全に実装できる次項目へ継続して
ください。

## 優先順位1: WICサムネイルpipeline

最優先で以下を完成させてください。

- Windows Imaging ComponentでJPEG/JPG/PNGをdecodeする
- EXIF orientationを適用する
- アスペクト比を維持して長辺384pxへ縮小する。小さい画像を不要に拡大しない
- JPEG quality 82でencodeする
- folderとZIP/CBZの自然順先頭pageを表紙にする
- archive entryを原本の隣へ展開せず、memoryまたはapp-local tempだけで処理する
- source fingerprintとcache indexを接続し、hit/staleを判定する
- atomic cache書込みを実処理へ接続する
- 失敗理由と期限を持つnegative cacheを実装する
- app-local cache/temp以外へ一切書き込まない
- visible / near / background priorityをbounded queueへ投入する
- worker数、queue容量、decode byte/pixel上限を固定し、cancel可能にする
- 10GiB hard capのLRU回収を実処理へ接続し、表示中entryをpinする
- Explorer一覧へ実thumbnailを表示する
- cold生成中、cache hit、失敗placeholderをレイアウト変更なしで表示する
- navigation generationが古いthumbnail commitを拒否する

最低限、WIC decode、orientation、resize、quality、folder/ZIP表紙一致、cache hit、
stale、negative cache、atomic write、LRU、pin、priority、cancel、原本非破壊の
unit/contract/integration/component testsを追加してください。

## 優先順位2: 非同期処理とshutdown完成

- thumbnail/page prefetchへ実workerを接続する
- navigation generationとviewer session generationを分離する
- A読込中にBへ100回移動し、Aの結果が一度もcommitされない試験を追加する
- cancel後の未開始queue itemを破棄する
- shutdown開始後は全command/queueが新規受付を拒否する
- 起動したtaskを追跡し、cancel後にjoinする
- archive/file/DB/WAL/SHM handleを閉じる
- media tokenを失効する
- 最新の確定済み読書位置をflushしてから終了する
- 製品processの終了を対象にしたintegration/E2E harnessを追加する

単なるflagのunit testだけで完了扱いにせず、実task・queue・handleを使って観測して
ください。

## 優先順位3: ViewerとExplorerの未実行ケース

`TC-UI-001`〜`014`、`TC-ERR-001`〜`005`をcomponent/integration testで可能な限り
自動化してください。

- picker登録、保存、再起動復元、root消失、アクセス拒否、retry/reselect
- tree/address/list/current folderの同期
- back/forward/up/直接path、root越境拒否
- sort後のselection、scroll、keyboard focus維持
- 長名、tooltip、status、ARIA name/role/state
- folder/ZIP/CBZの同一page順
- 単ページfit、100%上限、見開き、横長単独、末尾1page
- 見開き履歴の可逆性
- mode/direction切替時の先頭page維持と再起動復元
- click、wheel、PageUp/PageDown、Space、矢印、Esc
- 破損画像の局所errorと前後移動
- 破損・暗号化・未対応archive、0page
- 次漫画選択、次漫画保存位置、末尾動作
- 元folder、selection、scroll、sort、focusの復帰
- viewer終了、次漫画、app終了時の読書位置flush

WebdriverIO Tauriを導入できる場合は製品E2Eへ進めてください。導入不能でも、
mockだけの無条件成功ではなくRust command/application adapterとReactを接続した
integration harnessを優先してください。

## 優先順位4: custom protocol security corpus

既存のpure handler testsを拡張してください。

- malformed header、複数Origin、invalid UTF-8相当、missing/invalid Referer
- traversal、encoded traversal、absolute path、UNC、drive path
- 任意ZIP entry名、危険archive entry
- tokenのpage/source scope、期限、全失効、別session token
- exact MIME、byte上限、Content-Length、CORS、`nosniff`
- 成功・全error responseの安全header
- method、authority、path segment、query、fragment相当の拒否
- fuzz/propertyまたはtable-driven security corpus

WebView2が実際に送るOrigin/Refererとの統合だけは実機手順に従い、未実施ならPASSに
しないでください。

## 優先順位5: Phase 6自動化とrelease証跡

- malformed ZIP/image/security corpusをfixture generatorへ追加する
- generatorは既存出力を無断上書きしない
- 実装済み全read経路をbefore/after snapshotで囲む
- path、種別、size、mtime、内容hash、ZIP entry一覧の差分0を要求する
- DB/cache/temp/logがlibrary配下に0件であることを検証する
- TC-INT-010を期待結果全体が観測できた場合だけPASSへ変更する
- direct/transitive dependency licenseを監査する
- `THIRD-PARTY-NOTICES.md`とSBOMをlockfileに同期する
- unknown/禁止license 0件を自動検証する
- portable performance measurementを再実行する
- 10,000項目のmounted DOM上限を維持する
- 72ケースすべてのstatus、command、環境、日時、test名、証跡を更新する

## 外部環境として残してよい項目

次だけは、この開発環境から本当に実行できないことを確認した場合にBLOCKEDで
残せます。

- Windows 10 22H2 clean VM
- 別のサポート中Windows 11 clean VM
- VM外部からのDNS/TCP/UDP監視
- WebView2未導入VMでのoffline install
- installerのuser-data保持/明示削除
- 製品UI cold TTI、scroll/FPS/input delay/working set
- Windows UIA、Narrator/NVDA、high contrast、100/150/200% DPI
- WebView2 custom protocol実header統合

BLOCKED項目は`docs/testing/phase6-manual-procedures.md`を更新し、OS/build/VM状態、
fixture/app-data配置、詳細手順、監視方法、期待結果、失敗条件、保存するlog/trace/
screenshot/hash、後処理、具体的なBLOCKED理由を必ず残してください。

## CoDDと作業ルール

各実装単位で必ず次を守ってください。

1. behavior変更前に要件を`docs/requirements/`へ記録または確認する
2. `.venv/bin/codd scan`
3. 引数なしで`.venv/bin/codd impact`
4. 小さな実装単位でcodeと実testを変更する
5. `.venv/bin/codd scan`
6. `.venv/bin/codd check`
7. `.venv/bin/codd verify`
8. relevant red gate 0を確認する
9. `docs/testing/phase6-verification-results.md`と個別ケース結果を実測だけで更新する
10. 明示した対象fileだけをcommitする

amberは内容を確認し、解消可能なら解消してください。skip、空test、mockだけ、
無条件成功をPASSへ数えないでください。

## 各コミット前の最低検証

- 対象unit/contract/component/integration tests
- `PATH="$PWD/.tools/node/bin:$PATH" npm run typecheck`
- `TMPDIR=/tmp TEMP=/tmp TMP=/tmp PATH="$PWD/.tools/node/bin:$PATH" npm test`
- `TMPDIR=/tmp TEMP=/tmp TMP=/tmp PATH="$PWD/.tools/node/bin:$PATH" npm run build`
- 必要なら`.venv/bin/python scripts/generate-sbom.py`
- `cmd.exe /c 'E:\script\comic_explorer\scripts\run-rust-check.cmd'`
- `.venv/bin/python tests/fixtures/validate_fixtures.py tests/fixtures/generated`
- `git diff --check`
- CoDD scan/check/verify
- `git status --short`

sandboxまたはWSL制約でWindows commandが失敗した場合は、必要な承認を要求して
同じ検証を再実行してください。

## 厳守事項

- 漫画原本へwrite、rename、delete、sidecar作成、隣接展開をしない
- cache/DB/temp/recovery/logはlibrary root外だけに置く
- archive entry名をhost pathへ直接結合しない
- `git reset --hard`、`git checkout --`等の破壊操作をしない
- ユーザー変更を上書きしない
- 実行不能項目を推測でPASSにしない
- 一つの障害で止まらず、安全な代替経路と既存local cache/toolchainを確認する
- 小さな実装単位ごとに検証してcommitし、実装可能な残作業へ継続する

## 完了条件

- 既知の未完了実装が解消されている
- NOT RUNが、この環境で自動化不能な理由のある項目だけになっている
- P0の既知FAILが0
- 原本差分0
- CoDD relevant red gate 0
- Rust、React、typecheck、build、fixture validatorがすべてPASS
- SBOM、notice、license auditが同期している
- BLOCKEDは外部環境項目だけで、再現手順が完全である
- worktreeに意図しない差分がない

## 最終報告

次を簡潔に報告してください。

- 完了した実装
- commit一覧
- Rust/React/Pythonの実測件数
- CoDD red/amber状態
- 72ケースのPASS/FAIL/BLOCKED/NOT RUN集計
- 原本非破壊結果
- license/SBOM結果
- 残作業と具体的理由
- 外部環境手順の文書位置
- worktree状態

すべての作業と記録が完了したら、このプロンプト
`prompts/complete-mvp.md`を削除し、削除後のworktreeも確認してください。
