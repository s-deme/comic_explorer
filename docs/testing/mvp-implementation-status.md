---
codd:
  node_id: "test:mvp-implementation-status"
  type: test
  status: active
  confidence: 0.92
  depends_on:
    - id: "req:mvp-requirements"
      relation: "verifies"
      semantic: "behavioral"
    - id: "design:implementation-plan"
      relation: "verifies"
      semantic: "behavioral"
    - id: "test:phase6-case-results"
      relation: "refines"
      semantic: "governance"
---

# Comic Explorer MVP 実装状況

## 判定

2026-08-01時点で、MVPの実装は「主要機能実装済み、リリース判定は保留」である。
コード上は、ライブラリルート、Explorer風ナビゲーション、フォルダ/ZIP/CBZの列挙と
閲覧、サムネイルキャッシュ、並べ替え、読書位置・表示設定の永続化、単ページ/見開き、
左右読み、世代管理、エラー表示、正常終了処理まで実装されている。

MVP完了とはまだ扱わない。`docs/testing/phase6-case-results.md` の72ケース中、
PASSは60、FAILは0、BLOCKEDは12であり、BLOCKED項目の解消がリリース判定の前提である。

## 実装済みの範囲

| 領域 | 状況 | 主な証跡 |
| --- | --- | --- |
| 基盤・契約 | 実装済み | `src/types/`, `src-tauri/src/api/`, domain型、fixture |
| ファイル/書庫カタログ | 実装済み | `src-tauri/src/catalog/`, 自然順、root越境/危険entry拒否 |
| 永続化・キャッシュ | 実装済み | `src-tauri/src/state/`, SQLite、fingerprint、atomic cache、LRU |
| 非同期処理・世代管理 | 実装済み | `src-tauri/src/application/`, cancel、priority queue、shutdown |
| Explorerシェル | 実装済み | `src/App.tsx`, `src/features/navigation/`, `catalog/` |
| 漫画ビューワ | 実装済み | `src/features/viewer/`, page model、見開き、左右読み、操作 |
| エラー表示 | 実装済み | `src/features/errors/`, 固定分類と対象情報 |
| 製品・配布検証 | 一部完了 | release executable、NSIS、SBOM/noticeは確認済み |

## 検証済みの範囲

- Rustのunit/contract/integration、Reactのunit/component、Pythonのfixture/release検証は
  すべて成功記録がある。
- Windows 11 host上のrelease WebView2製品で、root登録、ナビゲーション、一覧、sort、
  thumbnail、viewer、読書位置復元、エラー回復、原本非破壊、正常終了/再起動を確認済み。
- 外部通信ゼロ、クリーンVMでの導入/削除、製品UI性能、screen reader/UIA、high contrast/DPIは
  この環境では合否を確定していない。

## 残りのリリースゲート

12件のBLOCKEDは、Windows 10 22H2および別Windows 11 clean VM、WebView2未導入環境、
OSレベルDNS/TCP/UDP監視、基準PCでの製品UI性能、screen reader/UIA、高コントラスト/DPI、
アンインストール時のuser-data挙動に関するもの。手順と証跡条件は
`docs/testing/phase6-manual-procedures.md`にある。

これらは未実行をPASSへ読み替えない。したがって現時点の正式な状態は、
「MVP実装済み・受入/配布ゲート12件待ち」である。

## 更新ルール

実装または検証結果が変わった場合は、`phase6-case-results.md` と本書を同じ変更で更新し、
その後にCoDDの `scan`、`check`、`verify` を実行する。`codd/scan/` の生成データは追跡しない。
