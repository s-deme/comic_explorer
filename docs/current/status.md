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

## 未測定の代表例

- release WebView2での実操作、DPI、screen reader、high contrast
- 基準PCでの大規模catalog・実archive・memoryの性能値
- clean VMでのinstaller/portable/WebView2有無の配布確認

履歴的な件数・tier進捗・過去gate結果はCSV台帳とGit履歴に残し、この文書へ重複記録しない。
