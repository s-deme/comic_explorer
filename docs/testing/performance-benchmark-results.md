---
codd:
  node_id: "test:performance-benchmark-results"
  type: test_result
  status: draft
  confidence: 0.70
  depends_on:
    - id: "test:performance-benchmark-plan"
      relation: "verifies"
      semantic: "verification"
    - id: "doc:technology-evaluation"
      relation: "supports"
      semantic: "evidence"
---

# Comic Explorer 性能ベンチマーク結果

本書の現時点の証拠記録はユーザーが2026-07-29に承認した。ただし未測定値を
測定済みまたは合格へ変更する承認ではなく、製造開始も別途指示があるまで行わない。

## 1. 判定

**Windows製品性能は未測定。確定済みADR-001の品質gate判定はまだできない。**

2026-07-29に生成fixtureとportable foundation harnessを再実行し、WSL2で
filesystem、ZIP、SQLiteの基礎処理を7回測定した。Tauri、Electron、WinUI、
WebView2、WICを含むWindows desktop値ではない。

## 2. 実行情報

| 項目 | 値 |
| --- | --- |
| 区分 | measured-foundation-only |
| OS | Linux 6.6.87.2 microsoft-standard-WSL2 x86_64 |
| Python | 3.12.3 |
| filesystem | WSL2 `/tmp` |
| runs | warm-up 1（除外）+ 7 |
| clock | `perf_counter_ns` |
| fixture | script生成PNG/ZIP、1,000/10,000 items |
| raw result | `benchmarks/architecture-spike/results/foundation-wsl.json` |

PCのWindows側CPU、storage型番、GPU、電源modeはsandboxから信頼できる形で取得
できなかったため未記録。よって別環境との比較値にしない。

## 3. 結果

| 操作 | samples ms | median ms | p95 ms | peak Python allocation |
| --- | --- | ---: | ---: | ---: |
| 1,000 item enumerate/stat/sort | 21.297, 21.163, 21.370, 21.588, 21.006, 21.092, 21.296 | 21.296 | 21.588 | 129,320 B |
| 10,000 item enumerate/stat/sort | 237.181, 231.559, 238.665, 217.249, 227.414, 215.591, 219.121 | 227.414 | 238.665 | 1,733,665 B |
| Deflate CBZ random 30 entries | 20.386, 20.138, 20.259, 20.089, 20.463, 21.153, 19.846 | 20.259 | 21.153 | 249,107 B |
| Stored ZIP random 30 entries | 20.172, 20.275, 20.042, 20.144, 20.798, 20.361, 19.734 | 20.172 | 20.798 | 181,365 B |
| SQLite WAL 10k insert + 100 read | 112.288, 108.788, 111.719, 110.738, 116.516, 110.922, 111.721 | 111.719 | 116.516 | 13,263 B |

Python allocationはnative SQLite/zlibおよびOS cacheを完全には含まない。process
memoryではない。

## 4. 解釈

- 10,000件の基礎列挙/metadata sortはこのfixture/環境でp95 238.665msだった。最初の
  操作可能表示を全件処理に依存させる理由はなく、chunkとbackground sortを維持する。
- synthetic PNGは非常に圧縮しやすい。DeflateとStoredの差は実漫画へ一般化しない。
- SQLite 10,000 row transactionは起動critical pathへ置くべきでないが、WALを使う
  repository spikeを進める妥当性はある。
- これらからTauri、React、WIC、page prefetchの性能優位は証明されない。

## 5. 未測定一覧

| 指標 | 状態 | 必要な次作業 |
| --- | --- | --- |
| cold/warm launch | 未測定 | 3 candidate release binaries |
| TTI | 未測定 | `ui_ready` event + Windows clock |
| initial/peak memory | 未測定 | Process counters/WPR |
| first thumbnail/300 generation | 未測定 | WIC/image-rs spike |
| warm cache list | 未測定 | product-equivalent cache |
| JPEG/PNG decode | 未測定 | photo-like Windows dataset |
| ZIP page read in Rust | 未測定 | `zip` release harness |
| normal/prefetched page | 未測定 | custom URI + WebView2 |
| scroll FPS/input delay/long task | 未測定 | Edge microbench + candidate UI |
| CPU/GPU | 未測定 | WPR/GPU Engine counters |
| distribution size | 未測定 | signed NSIS/MSI artifacts |
| ZIP64/CP932/encrypted/corrupt | 未測定 | generated corpus matrix |
| Windows 10/11 install | 未測定 | clean VMs |

## 6. 再現

```bash
spike_data="$(mktemp -d /tmp/comic-explorer-spike.XXXXXX)"
python3 benchmarks/architecture-spike/generate_dataset.py \
  --output "$spike_data/data"
python3 benchmarks/architecture-spike/run_foundation_benchmark.py \
  --dataset "$spike_data/data" \
  --output benchmarks/architecture-spike/results/foundation-wsl.json \
  --runs 7
python3 benchmarks/architecture-spike/validate_results.py \
  benchmarks/architecture-spike/results/foundation-wsl.json
```

Windows手順は `benchmarks/architecture-spike/README.md` と
`performance-benchmark-plan.md` に従う。Windows結果を取得したらraw sampleを残し、
この文書の判定、ADR状態、architecture状態を同時に更新する。
