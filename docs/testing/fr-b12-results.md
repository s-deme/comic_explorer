---
codd:
  node_id: "test:fr-b12-results"
  type: test
  status: active
  confidence: 0.9
  depends_on:
    - id: "req:roadmap-priorities"
      relation: "verifies"
      semantic: "p9-archive-format-contract"
    - id: "test:fr-b08-p8-results"
      relation: "derives_from"
      semantic: "existing-archive-and-media-boundary"
---

# FR-B12 追加書庫形式結果

P9では、RAR/CBRと7zを既存catalogでarchiveとして分類し、完全readerが利用可能になるまで
展開処理へ進めない安全なadapter境界を実装した。未承認の依存・license・fixtureを成功扱いに
しないため、FR-B12の最終状態は`Partial / BLOCKED`である。

| test ID | 結果 | 観測内容 |
|---|---|---|
| FT-B12-001 | BLOCKED | RAR/CBRの完全なentry列挙はreader依存・license・fixture承認待ち |
| FT-B12-002 | BLOCKED | 7zの完全なentry列挙はreader依存・license・fixture承認待ち |
| FT-B12-003 | PASS | RAR/CBR/7zを分類し、`UnsupportedFormat`とadapter unavailableメッセージを返す |
| FT-B12-004 | BLOCKED | 完全readerが未承認のため、展開物なしの実fixture検証は未実施 |
| FT-B12-005 | BLOCKED | catalog/viewer/diagnosticsの完全reader統合は未実施 |

実装根拠は`src-tauri/src/domain/file_kind.rs`、`src-tauri/src/catalog/folder.rs`、
`src-tauri/src/catalog/archive.rs`、`src-tauri/src/media/mod.rs`である。ZIP/CBZの既存列挙・
media grant経路は維持した。P9のfocused Rust test、canonical Rust、typecheck、Windows-native
CoDD scan/check/verifyはPASSだが、これは未承認のreader依存を補うものではない。
