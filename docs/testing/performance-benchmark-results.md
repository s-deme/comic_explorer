---
codd:
  node_id: "evidence:performance-benchmark-results"
  type: test_result
  status: draft
  confidence: 0.70
  depends_on:
    - id: "test:performance-benchmark-plan"
      relation: "verifies"
      semantic: "verification"
    - id: "research:technology-evaluation"
      relation: "supports"
      semantic: "evidence"
---

# Comic Explorer 性能ベンチマーク結果

本書の現時点の証拠記録はユーザーが2026-07-29に承認した。ただし未測定値を
測定済みまたは合格へ変更する承認ではなく、製造開始も別途指示があるまで行わない。

## 1. 判定

**Windows製品性能は未測定。確定済みADR-001の品質gate判定はまだできない。**

2026-07-28時点で、生成fixtureとportable foundation harnessを作成し、WSL2で
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
| 1,000 item enumerate/stat/sort | 21.506, 31.578, 26.476, 21.651, 22.968, 21.257, 26.267 | 22.968 | 31.578 | 129,321 B |
| 10,000 item enumerate/stat/sort | 238.402, 284.960, 253.150, 251.846, 241.400, 279.184, 269.527 | 253.150 | 284.960 | 1,733,666 B |
| Deflate CBZ random 30 entries | 23.311, 26.526, 20.307, 21.593, 26.937, 33.769, 19.576 | 23.311 | 33.769 | 249,108 B |
| Stored ZIP random 30 entries | 21.443, 20.801, 21.151, 23.164, 20.267, 20.947, 29.965 | 21.151 | 29.965 | 181,366 B |
| SQLite WAL 10k insert + 100 read | 124.730, 119.332, 150.789, 117.494, 131.439, 131.786, 126.245 | 126.245 | 150.789 | 13,264 B |

Python allocationはnative SQLite/zlibおよびOS cacheを完全には含まない。process
memoryではない。

## 4. 解釈

- 10,000件の基礎列挙/metadata sortはこのfixture/環境でp95 285msだった。最初の
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
