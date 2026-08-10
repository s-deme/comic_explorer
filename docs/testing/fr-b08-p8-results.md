---
codd:
  node_id: "test:fr-b08-p8-results"
  type: test
  status: active
  confidence: 0.9
  depends_on:
    - id: "req:roadmap-priorities"
      relation: "verifies"
      semantic: "p8-image-format-contract"
    - id: "test:fr-b19-results"
      relation: "derives_from"
      semantic: "viewer-and-settings-boundary"
---

# FR-B08 P8 追加画像形式 — 受入結果

## 判定

P8（FR-B08）は `Partial / BLOCKED_UNMEASURED` とする。GIF/AVIFのclassification、MIME、metadata
処理を既存page pipelineへ接続するsourceは存在し、container parserのfocused Rust testはPASSした。
ただし、static GIF decode、animation GIF再生、AVIF decode、各形式のcorrupt fallbackをrelease
WebView2製品で直接観測していない。parser testやMIME文字列の確認をcodec pixel/animation gateへ
読み替えず、`Done / PASS`にはしない。

## 2026-08-10 Windows focused実測

実行した現行コマンドはRust `cargo test --locked --lib fr_b08_`で、結果は22 PASS / 0 FAIL /
0 ignored、95 filtered outだった。この22件には既存static WebP回帰13件が含まれ、P8のGIF/AVIFを
直接扱う追加testは次の9件である。

| 対象 | 結果 | 直接観測した範囲 |
|---|---|---|
| GIF metadata 3件 | PASS | global/local block境界、image descriptor、LZW data sub-block、trailer、frame count、transparency flag、canvas外frameとtruncationの拒否 |
| AVIF metadata 5件 | PASS | BMFF box size、compatible brand、`ipco`内にscopedした`ispe`、primary item linkとbounded extent、全`ispe`へのdimension/pixel limit、不正brand・偶然の`ispe`拒否 |
| animated GIF thumbnail gate 1件 | PASS | 2 frame GIFを`animated`と判定し、app-local disk thumbnail生成入口で`UnsupportedFormat`として拒否 |

`fr_b08_webp_uses_the_exact_viewer_media_type`はGIF=`image/gif`、AVIF=`image/avif`も確認するが、
WebView2によるdecode結果を観測するtestではない。使用したGIF/AVIF dataはparser境界用fixtureであり、
release製品上の表示pixel、animation timing、placeholder、操作継続、library source snapshotを測定していない。

## 要件上のfocused IDとblocker

| Test ID | 判定 | 未観測事項 |
|---|---|---|
| `FT-B08-002` | BLOCKED / MISSING TEST | このIDの実行caseは存在しない。static GIFのrelease WebView2 decode未測定 |
| `FT-B08-003` | BLOCKED / MISSING TEST | このIDの実行caseは存在しない。animation GIFの複数frame再生と非永続化の製品境界未測定 |
| `FT-B08-004` | BLOCKED / MISSING TEST | このIDの実行caseは存在しない。AVIFのrelease WebView2 decode未測定 |
| `FT-B08-005` | BLOCKED / MISSING TEST | このIDの実行caseは存在しない。GIF/AVIF corrupt・unsupported fallback、操作継続、cacheと原本snapshot未測定 |

旧結果に記載されていた`FT-B08-007`〜`FT-B08-009`は要件のP8 focused IDではなく、現行sourceにも
同名の実行caseがないため削除した。P8を受け入れるには、`FT-B08-002`〜`FT-B08-005`を実装し、
fresh release executableをWindows WebView2で直接測定する必要がある。
