---
codd:
  node_id: "test:project-verification"
  type: test
  status: approved
  confidence: 0.95
  depends_on:
    - id: "req:project-requirements"
      relation: "verifies"
      semantic: "behavioral-contract"
    - id: "design:project-architecture"
      relation: "verifies"
      semantic: "system-boundary"
---

# Comic Explorer 現行検証

## 現在の自動gate

Windows filesystemでは次を正規の入口とする。

| 対象 | 入口 |
|---|---|
| CoDD scan/check/verify | `scripts/run-codd-windows.ps1` |
| aggregate test | `scripts/run-tests-windows.ps1` |
| TypeScript typecheck | `scripts/run-typecheck-windows.ps1` |
| production build | `scripts/run-build-windows.ps1` |
| feature canonical | `scripts/verify-feature-windows.ps1 -Feature <ID> -RustMode Canonical` |

2026-08-29に記録された当時のコード変更に対して、Windows build、CoDD scan/check/verify、aggregate testは成功している。対象commit SHAとCI run URLは当時の文書に記録されていないため、この記録だけを現在のHEADに対するPASSとは扱わない。
aggregate testは2 workerを既定とし、最終CoDD verifyが同じaggregate testを実行するため、直前に重複実行しない。

## MVP release case summary

| 結果 | 件数 |
| --- | ---: |
| PASS | 60 |
| FAIL | 0 |
| BLOCKED | 12 |
| NOT RUN | 1 |
| **合計** | **73** |

## 記録規則

- 変更中は影響箇所のfocused testとtypecheckを使い、最終変更後にbuildとCoDD scan/check/verifyを1回実行する。
- gate再実行は、修正または診断済みのintermittent failureが理由の場合だけ記録する。
- advisory、SKIP、VACUOUS、未測定はPASSへ合算しない。
- feature単位の実装・テスト・gate参照はCSV台帳へ記録する。過去の実行ログはGit履歴を参照する。

## 2026-09-18 閲覧機能の補強

Windows版の全ページ一覧、同梱AVIFデコード、連続縦読み、埋め込みRGB ICCのsRGB変換を検証した。最終ソースに対するCoDD verify（aggregate test・typecheck）、Rust canonical（lib 276件とshutdown process 1件）、release EXE build・freshness確認は成功。CoDDのSKIP・VACUOUS・advisoryは成功件数に含めない。

`scripts/run-product-ui-harness.ps1 -WebpOnly` はrelease WebView2で成功した（`FT-B08-006`, `status: ok`）。AVIF表示・表紙、WebPのフォルダー／ZIP／CBZ表示、破損ページからの復帰、プレビュー中の読書位置維持、全ページ一覧、740×540の明色画面、連続縦読みとページ送りへの復帰、閉じるボタンによるViewer WebViewの消滅、再起動後のサムネイルキャッシュ再利用、元ファイル差分0を確認した。再起動テストは既定の起動フォルダーからテストライブラリへ明示的に移動するよう修正した。

ローカル証跡は `src-tauri/target/verification/reader-ui-run.log` と `src-tauri/target/verification/reader-ui/*.png`。配布EXEは `src-tauri/target/release/comic-explorer.exe`、SHA-256は `7bfa080eda5d2a88f205869be5cc7da783972fecac3ecf609f5066cc25eec60f`。生成証跡・EXEは追跡対象外。

ICC変換はDisplay P3からの画素変換・アルファ保持・不正プロファイル拒否をRustテストで確認した。HDR、AVIF grid合成等、非RGB ICCは未対応。大規模作品の実測性能、実モニターの色精度、複数フレームのアニメーション進行時間、assistive technology、clean VM配布確認は未測定。IMP-015全体のfeature canonicalを今回再実行した記録ではない。

## 2026-10-02 大量フォルダーの一覧応答

サムネイルの設定・DBロックをキャッシュ操作へ限定し、一覧要求を同時2件・待機64件へ制限した。全件生成はカーソルで順次送信する。ツリーは下位確認前に表示し、表示範囲とoverscanだけ最大64件・同時1バッチで確認する。旧世代応答の破棄、列挙途中のキャンセル、容量上限以下のLRU走査省略、Windows列挙メタデータの再利用を追加した。

Windows focused test・TypeScript typecheck、production build、Rust canonical（lib 279件・shutdown process 1件）、CoDD scan/check/verifyが成功した。遅い画像生成中の設定取得・フォルダー列挙、1万項目の要求上限・優先順位・世代切替、ツリーの遅延確認・隠し項目・未確認行・古い応答・スクロール位置維持を自動テストで確認した。CoDDのadvisory・SKIP・VACUOUSは合格件数に含めない。ビルドと同じ正規Windowsホストでrelease freshnessも成功した。

`scripts/measure-catalog-windows.ps1` で `E:\F\doujin\_A`（7,637項目）を旧・新EXEそれぞれ3回試行し、各2回で計測値を取得した。毎回アプリ用データとキャッシュを分離し、250ms間隔の30回スクロール中に、一覧項目が処理したキーから次の描画までを測った。

| EXE | 初回表示（秒） | キー処理→描画 P95（ms） | JS heap（MiB） | プロセス群Working Set（MiB） |
| --- | --- | --- | --- | --- |
| 変更前・1回目 | 1.65 | 37.8 | 14.7 | 569.1 |
| 変更前・2回目 | 1.55 | 76.6 | 15.9 | 515.3 |
| 変更後・2回目 | 2.89 | 31.9 | 22.8 | 508.8 |
| 変更後・3回目 | 4.96 | 36.2 | 23.3 | 559.0 |

変更後の計測上のP95は200ms以内だったが、初回表示時間の改善は確認できず、JS heapの観測値は増えた。メモリはスクロール終了時のスナップショットでありピーク値ではない。ファイルシステムのキャッシュは制御していない。キーはJavaScriptから送ったもので、OSからの実入力遅延・読込中の実操作・報告されたフリーズの解消は未検証。各3回のうち1回はフォルダーを開く前のCDP起動接続に失敗し、変更後の1回は計測後の終了にもタイムアウトした。追加の旧EXE試行でもaddress表示待ち・終了確認に失敗しており、3回全成功とは扱わない。

証跡は追跡対象外の `src-tauri/target/verification/catalog-performance/{before-comparison,after-comparison,before-confirmation}/results.json`。旧EXEのSHA-256は `bf31cb50a76f6765c4b9e80c5ea7fca5d523f6e63d2dde1c02fa3994e73032fd`、変更後は `c11bf2c33e56acf20e0156a26949e1ea2e92a37afc379751df6fc020b852d544`。以上の未測定・失敗を残し、性能受入全体のPASSとはしない。

## 過去の未完了記録と未測定

2026-09-17のWindows版変更（閉じる権限、ページプレビュー、アニメーションWebP）では、CoDD scan/check/verify、TypeScript typecheck、Rust canonical test、release EXE buildとfreshness確認が成功した。feature canonical（IMP-015）はproduct-webp段階で失敗しており、全体PASSではない。UI harnessの再試行でもViewerのCDP接続を確認できず、閉じる操作・プレビュー・アニメーションの実画面検証は未完了。AVIFの実サンプル表示も未検証。

上記は2026-09-17時点の記録。閉じる操作・プレビュー・AVIF表示の実画面検証は2026-09-18の記録で更新した。

## 文書整合性の既知事項

2026-08-31の文書監査では、`leeyes-feature-tracker.csv` の `acceptance_ref` 97行と `verification_refs` 106行が、簡略化前の `requirements.md`／`verification.md` の見出しを参照していた。参照先アンカーが現行文書に存在しないため、CSVの値が空でないことだけでは追跡可能とは判定しない。旧見出しを安定した履歴文書へ復元するか、各行を現存する要件ID・検証記録へ対応付けてから参照整合性をPASSとする。

同梱ヘルプは2026-09-18の全ページ一覧・連続縦読み追加に合わせて更新した。

WindowsのAVIFビルドにはCMakeとPerlが必要。CMakeがPATHにない場合は `.venv-windows/Scripts/python.exe -m pip install cmake==4.3.4` でプロジェクト専用環境へ導入する。Windows toolchainはこの環境とGit同梱Perlを利用する。テスト用AVIFはPillow 12.1.1で生成した3×2の単色画像をgenerator内に固定し、通常のfixture生成は標準ライブラリだけで再現できる。
