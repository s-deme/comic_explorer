---
codd:
  node_id: "req:fr-b08-webp"
  type: requirement
  status: approved
  confidence: 0.93
  depends_on:
    - id: "req:mvp-requirements"
      relation: "extends"
      semantic: "read-only-image-folder-and-archive-contract"
    - id: "req:product-questionnaire"
      relation: "derives_from"
      semantic: "Q3-2-static-webp-adoption"
    - id: "req:windows-native-toolchain"
      relation: "depends_on"
      semantic: "webp-only-release-verification"
---

# FR-B08 静止 WebP 要件

## 採用範囲

`FUT-C-005`をIMP-015で静止WebPページ表示として採用する。対象はlossy/lossless/alphaの
静止WebPであり、folderとZIP/CBZ内のpage、viewer、表紙thumbnailまでを既存の読取専用
image pipelineへ接続する。animated WebPは本機能に含めない。VP8X animation flag、`ANIM`、
`ANMF`を検出したものは`UnsupportedFormat`として局所errorへ分類し、先頭frameの推測表示、
animation再生、frame extractionを発行しない。animated WebPの採否は別の原子candidateで扱い、
IMP-015のPASSまたはFR-B08 aggregateへ加算しない。

## REQ-FR-B08-001: static WebP discovery and metadata

`.webp`拡張子はASCII大小文字を区別せずimage pageとして扱う。folderとZIP/CBZのenumerationは
既存のhidden path、natural sort、relative path、archive compression/entry-count/entry-byte/total-byte
制限を維持する。拡張子だけを信用せずRIFF/WEBP signatureとVP8、VP8L、非animation VP8Xの
containerを検証し、width、height、alpha有無を取得する。extended WebPはexactly oneのVP8またはVP8L
payloadを必須とし、VP8X canvasとpayload寸法を一致させる。chunk length、odd-byte padding、duplicate core
payload、`ALPH`とVP8X alpha flagの不整合をrejectする。truncated、malformed、signatureと拡張子の不一致は
`CorruptImage`、byteまたはpixel上限超過は`ResourceLimit`とし、他page、他comic、一覧操作を停止させない。

## REQ-FR-B08-002: viewer media boundary

静止WebP pageは既存のopaque media tokenだけを通じ、`image/webp`のexact MIMEとsignature検証済み
bytesをWebView2へ渡す。絶対path、archive entry名、token外のsourceをUIへ露出しない。folderとarchiveの
同じrelative pageは同じviewerのcancel/generation境界、ページ順、read-only error/retry表示を使う。
WebView2が静止WebPをdecodeして表示できることをrelease product gateで直接観測する。

## REQ-FR-B08-003: thumbnail, cache, and limits

thumbnailはpinしたpure-Rust `image-webp` 0.2.4で静止WebPをdecodeし、既存WIC resize/raw pixel/
JPEG cache経路へ渡す。WICのWebP Store extensionやOS codec availabilityへ依存してWebPをdecodeしては
ならない。既存の`MAX_IMAGE_BYTES`、`MAX_IMAGE_PIXELS`、thumbnail長辺384px、JPEG quality 82、
cache key/freshness、negative cache、queue/cancellation、LRU hard capを変更しない。alphaは
unpremultiplied sRGBとして白背景へ合成してから既存WIC/JPEG出力へ渡し、alpha fixtureのthumbnailで
同じ合成結果を確認する。pure-Rust decode bufferと24bpp BGR bufferのchecked合計は
`MAX_IMAGE_BYTES`以下に制限し、超過はallocation前に`ResourceLimit`とする。

## REQ-FR-B08-004: local error recovery and non-destructive boundary

corrupt、unsupported animation、limit超過、decoder失敗は対象pageまたはthumbnailの分類済みlocal errorとして
表示し、再試行・別page移動・別comic閲覧を可能にする。network、外部codec download、install、library root、
folder、ZIP/CBZ、library管理fileへのwrite/rename/delete/cache/sidecar/temp作成を行わない。操作前後の
library file集合、directory集合、bytes、SHA-256は一致する。

## REQ-FR-B08-005: license and distribution gate

`image-webp` 0.2.4とそのCargo推移依存がそれぞれMITまたはApache-2.0の互換grantを選択可能であることを、
Cargo metadataと`Cargo.lock`の固定inventoryで確認する。採用時のraw expressionは`image-webp`の
`MIT OR Apache-2.0`、`byteorder-lite`の`Unlicense OR MIT`、`quick-error`の
`MIT/Apache-2.0`であり、結果台帳にはraw expressionと選択した互換grantを残す。SBOMと
`THIRD-PARTY-NOTICES.md`は同じlock-backed inventoryから生成し、unknown/prohibited licenseを0件とする。
pin/version/license/SBOM/noticeのいずれかが不一致ならWebPOnly gateをFAILとし、Windows Store extension、
user-local codec、network installを採用根拠にしない。

## Connected evidence and IMP-015 gate

| ID | observable contract | required evidence |
|---|---|---|
| FT-B08-001 | static WebPのfolder/archive enumerate、viewer MIME/error UI接続 | connected frontend App/viewer + Rust `fr_b08_webp_` |
| FT-B08-006 | release UIでfolder/ZIP/CBZのstatic WebP thumbnail/viewer、animation/corrupt safe recovery、source差分0 | WebpOnly Windows WebView2 product gate |

`scripts/run-feature-verification-wsl.sh IMP-015 -RustMode Canonical`を正本コマンドとする。
frontendは`FT-B08-001` exact 1 PASS・0 FAIL・0 SKIP、Rustは`fr_b08_webp_`、productは
`FT-B08-006` WebpOnlyを選択し、typecheck、SBOM/build/license check、canonical Rust、release freshness、
product cleanup、CoDD scan/check/verifyを同じsourceへ束縛する。これらがすべてPASSした場合だけ
`FUT-C-005`を`Implemented / PASS`へ更新する。静止GIF、animation GIF、AVIFが未測定のため、
FR-B08 aggregateは`Partial`のままとする。
