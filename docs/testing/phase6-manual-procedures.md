---
codd:
  node_id: "test:phase6-manual-procedures"
  type: test
  status: active
  confidence: 0.9
  depends_on:
    - id: "test:phase6-case-results"
      relation: "executes"
      semantic: "behavioral"
    - id: "design:test-strategy"
      relation: "refines"
      semantic: "governance"
---

# Phase 6 外部環境テスト手順

## 共通準備

対象は署名対象と同じrelease executable/NSIS installerとする。試験ごとに次を記録する。

- OS edition、`winver`のversion/build、VM/実機、CPU、RAM、GPU、storage、DPI、
  WebView2 runtime version
- app version、installer/executableのSHA-256、試験開始/終了時刻
- `tests/fixtures/generated`を試験専用`C:\ComicExplorerTest\library`へ複製し、
  `manifest.json`と全fileのpath/size/mtime/SHA-256 before snapshotを保存する
- app-dataは試験専用Windows userの
  `%LOCALAPPDATA%\ComicExplorer`を使用し、開始前の有無と配置を記録する
- screenshot、screen recording、application log、Event Viewer export、ETW/WPR trace、
  network trace、working-set CSVを`C:\ComicExplorerTest\evidence\<case-id>`へ保存する
- PASS条件にはlibrary before/after snapshot差分0を含む。試験終了後はappを終了し、
  試験専用user/VM snapshotを戻す。利用者データや共有libraryは使わない

現状態がBLOCKEDなのは、現在利用できる単一Windows 11開発hostでは、clean OS差分、
別OS、外部から独立した通信監視、screen reader/UIA/DPI matrix、および製品性能の
再現可能な基準環境を同時に満たせないためである。

## TC-SEC-002: 外向き通信0件

必要環境はclean Windows 11 VMと、その外側でpacketを観測できるHyper-V hostまたは
隔離gatewayである。VMのDNS serverを監視gatewayへ固定し、Windows Defender
Firewall logging、pktmon/Wireshark、DNS server query logを開始する。

1. network接続状態と時刻同期後、監視を開始する。
2. installer起動、app起動、root登録、folder/ZIP/CBZ閲覧、全error fixture、
   再起動、uninstallを実行する。
3. process PIDと子processを記録し、DNS/TCP/UDPをPID・VM IP・時間帯で照合する。
4. OS自身の通信と試験process由来を区別できないpacketはPASSにせず再試験する。

期待結果はComic Explorer由来の外向きDNS/TCP/UDP 0件で、1件でも宛先・payloadに
かかわらずFAIL。pcapng、pktmon ETL、firewall/DNS log、操作時刻表を保存する。

## WebView2 custom protocol統合security

必要環境はWindows 10 22H2とWindows 11の各WebView2実機、DevTools Protocol trace、
Fiddler/Process Monitorである。正常なfolder/ZIP/CBZを開き、WebView2が`comic:`
requestへ実際に付けるmethod、Origin、Refererをtraceへ保存する。次にDevTools
consoleまたは専用security harnessからPOST、query付きURI、短い/非hex/期限切れtoken、
別origin、traversal、絶対path、drive path、任意archive entry名を要求する。

製品WebView2で正常なthumbnailの実decodeとWindows側
`http://comic.localhost/<token>` mappingは自動harnessで観測済みである。ここでは
DevToolsからの攻撃requestと実header traceを追加確認する。正常pageだけ200と正確な
MIME/lengthを返し、それ以外は画像byte、絶対path、entry名、
内部errorを返さず、全応答に`nosniff`、安全なContent-Type/Length/CORSが付けばPASS。
WebView2の実headerがallowlistと一致しない場合は製品画像が表示不能となるためFAILで、
推測によるallowlist拡張は行わない。HAR/DevTools trace、response headers/body hash、
screenshotを保存し、試験用app-dataを削除してVM snapshotを戻す。

## TC-PERF-001〜006: 製品UI性能

必要環境は`docs/testing/performance-benchmark-plan.md`指定のWindows 11基準PC
または同一構成の専有VMである。AC電源、高性能電源plan、更新停止、固定DPI 100%、
release build、screen recorder停止状態とする。WPRのCPU、Disk I/O、Working Set、
UI Delays profileと製品内performance markを使う。

1. 1,000/10,000項目、folder/CBZ各300page fixtureを配置する。
2. cold試験は再起動後、warm試験は1回完走後に独立して7回測る。
3. cold TTI、一覧ready、scroll input delay/FPS、page switch 100回、idle/peak
   working setを個々のraw sampleとして保存する。
4. median、p95、maxを算出し、生成中thumbnail数・mounted DOM数・cache容量も記録する。

合格値はcold TTI 3秒以内、warm一覧ready 1秒以内、prefetch済みpage switch p95
100ms以内、UI long task 50ms超の件数記録、idle working set 250MiB以下、
cache 10GiB以下かつpin中entryを回収しないこと。ETL、CSV、計算script出力、
screenshotを保存する。fixtureとapp-dataだけを削除してVM snapshotを戻す。

## TC-A11Y-002/003: UIA、screen reader、high contrast、DPI

必要環境はWindows 11実機、NarratorとNVDAの各最新版、Accessibility Insights for
Windows、100/150/200% DPI、Windows high contrast themeである。

1. mouseを使わずroot登録、tree移動、sort、viewer、error復帰、help開閉、終了を行う。
2. Accessibility Insightsでtree/grid/dialog/splitter/viewerのname、role、state、
   focus順、selection/expanded/valueを記録する。
3. NarratorとNVDAで同じ操作を実行し、読み上げ文、focus位置、操作不能箇所を記録する。
4. 各DPIとhigh contrastで1024×720最小window、tree初期240/最小180、
   grid item、focus ring、長名tooltip、error actionを確認する。

focus trap、名前なしcontrol、色だけの状態、clipping、画面外必須操作、help close後の
focus喪失はFAIL。Accessibility Insights report、各設定screenshot、screen recording、
screen reader/version logを保存する。

## TC-DIST-002: Windows 10/11 clean install

必要環境はWindows 10 22H2 x64 clean VM、別のサポート中Windows 11 x64 clean VM、
およびWebView2未導入snapshotである。各VMは試験前snapshotから開始する。

1. installer SHA-256を確認し、networkを切断する。
2. WebView2未導入状態をregistryとinstalled appsで証跡化する。
3. NSIS installerを通常userで実行し、offline WebView2導入、app起動、root登録、
   folder/ZIP/CBZ閲覧、読書位置保存、再起動復元を行う。
4. appを終了してuninstallし、library snapshotとinstalled files/process handlesを確認する。

install/start/read/restart/uninstallが両OSで成功し、network要求、原本差分、原本隣接物、
残留processが0ならPASS。installer log、WebView2 version、Process Monitor PML、
before/after file list、screenshotを保存する。

## TC-DIST-003: uninstall時のuser data

TC-DIST-002の各clean VMで2つの独立snapshotを使う。

1. root、sort、view mode、読書位置、thumbnail cacheを作る。
2. 既定uninstallを行い、`%LOCALAPPDATA%\ComicExplorer`が保持され、再install後に
   設定/位置が復元されることを確認する。
3. snapshotを戻し、明示的なuser-data削除optionを選んでuninstallする。
4. app専用領域だけが削除され、libraryと他user dataが不変であることを確認する。

既定でapp-dataが消える、明示選択なしで削除される、削除選択後にapp専用dataが残る、
libraryに差分が出る場合はFAIL。NSIS log、directory listing、registry export、
library/app-data before/after hashを保存する。
