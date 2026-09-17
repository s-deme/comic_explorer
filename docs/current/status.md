---
codd:
  node_id: "doc:project-status"
  type: documentation
  status: active
  confidence: 0.95
  depends_on:
    - id: "req:project-requirements"
      relation: "derives_from"
      semantic: "current-status"
    - id: "test:project-verification"
      relation: "refines"
      semantic: "verification-summary"
---

# Comic Explorer 現在状態

## 正本

- 利用者契約: `requirements.md`
- 実装境界: `architecture.md`
- 最新の自動検証と未測定事項: `verification.md`
- Leeyes機能単位の採否・進捗・参照先: `leeyes-feature-tracker.csv`

## 判定

PublishedまたはVerifiedは、台帳に対応する実装・テスト・verification referenceがあり、必要なgateを通過した機能だけを指す。
未測定、外部環境待ち、推定結果をPASSや完了へ読み替えない。次の作業は利用者が選んだID・挙動だけを対象にする。

## MVP release case summary

`source: docs/current/verification.md`、`scope: MVP release cases`、`PASS: 60`、`FAIL: 0`、`BLOCKED: 12`、`NOT RUN: 1`、`total: 73`

## 閲覧機能の補強（2026-09-18）

| 不足・差分 | 今回の対応 | 残る範囲 |
|---|---|---|
| ページ移動前に画像を確認できない | 単ページプレビューと仮想化した全ページ一覧、確定時だけ移動、失敗時の再試行 | 大規模作品の実測性能は未測定 |
| アニメーションWebPを拒否していた | フレーム検証付き表示と先頭フレームの派生画像生成へ接続 | 1024フレームとキャンバスメモリ上限、フィルター適用時は静止画 |
| AVIFがOSコーデックに依存 | libaom同梱デコードを表示・派生画像へ接続 | HDR、grid合成等は未対応 |
| 連続縦読み | 横幅フィットの仮想スクロールと現在ページ保存 | モードはウィンドウ内で切り替え、倍率・回転操作はページ送りへ戻る |
| 色管理 | 埋め込みRGB ICCをsRGBへ正規化、旧サムネイルキャッシュを更新 | 非RGB ICCとHDRは未対応、実モニターの色精度は未測定 |

## 未測定の代表例

- release WebView2での実操作、DPI、screen reader、high contrast
- 基準PCでの大規模catalog・実archive・memoryの性能値
- clean VMでのinstaller/portable/WebView2有無の配布確認

履歴的な件数・tier進捗・過去gate結果はCSV台帳とGit履歴に残し、この文書へ重複記録しない。
