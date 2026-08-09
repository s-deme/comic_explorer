# Comic Explorer architecture spike

製品コードから独立した、著作権上の問題がない合成データ用の性能スパイクです。
Linux/CIで実行できる基礎 I/O ハーネスと、Windows 実機でアプリ/UIを測る
ハーネスを分けています。Linuxの値を Windows デスクトップアプリの値として
扱ってはいけません。

## 基礎 I/O スパイク

```bash
python3 benchmarks/architecture-spike/generate_dataset.py \
  --output /tmp/comic-explorer-spike-data
python3 benchmarks/architecture-spike/run_foundation_benchmark.py \
  --dataset /tmp/comic-explorer-spike-data \
  --output benchmarks/architecture-spike/results/foundation-linux.json \
  --runs 7
python3 benchmarks/architecture-spike/validate_results.py \
  benchmarks/architecture-spike/results/foundation-linux.json
```

生成物は、1,000/10,000項目、300ページのPNG、同内容のZIP/CBZ、高解像度・
横長・破損PNG、破損ZIP、空/生成済みサムネイルキャッシュを含みます。
JPEGを含む完全なWindows基準データは `windows/Generate-Dataset.ps1` で作ります。

## Windows 実機スパイク

PowerShell 7 で次を実行します。

```powershell
pwsh benchmarks/architecture-spike/windows/Generate-Dataset.ps1 `
  -OutputDirectory C:\ComicExplorerBenchData
pwsh benchmarks/architecture-spike/windows/Run-DesktopBenchmark.ps1 `
  -DatasetDirectory C:\ComicExplorerBenchData `
  -ApplicationPath C:\path\to\comic-explorer.exe `
  -OutputFile .\desktop-results.json `
  -Runs 7
```

アプリがまだ存在しない段階では、UIマイクロベンチを Edge で開けます。

```powershell
pwsh benchmarks/architecture-spike/windows/Open-UiBenchmark.ps1
```

画面の「JSONを保存」で得た結果を性能結果文書へ転記します。すべて同じPC、
電源モード、表示倍率、ウィンドウ寸法、データ、キャッシュ条件で測ります。
