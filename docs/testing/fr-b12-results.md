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

P9では、RAR/CBRと7zの拡張子から`archiveKind`を保持しつつ、catalog kindは`Unsupported`とし、
完全readerが利用可能になるまで読取・展開処理へ進めない安全なadapter境界を実装した。未承認の
依存・license・fixtureを成功扱いにしないため、FR-B12の最終状態は`Partial / BLOCKED`である。

| test ID | 結果 | 観測内容 |
|---|---|---|
| FT-B12-001 | BLOCKED | RAR/CBRの完全なentry列挙はreader依存・license・fixture承認待ち |
| FT-B12-002 | BLOCKED | 7zの完全なentry列挙はreader依存・license・fixture承認待ち |
| FT-B12-003 | PASS | RAR/CBR/7zを`Unsupported`として分類しながら`archiveKind`を保持し、絶対pathを含まないadapter unavailable errorを返す |
| FT-B12-004 | BLOCKED | 完全readerが未承認のため、展開物なしの実fixture検証は未実施 |
| FT-B12-005 | BLOCKED | unsupported形式をcorrupt ZIP/CBZと誤診しない境界はPASS。catalog/viewer/diagnosticsの完全reader統合は未実施 |

実装根拠は`src-tauri/src/catalog/folder.rs`、`src-tauri/src/catalog/archive.rs`、
`src-tauri/src/catalog/mod.rs`、`src-tauri/src/diagnostics/mod.rs`である。Windows focused Rustの
`fr_b12_` 3件とmixed-library分類fixture 1件は全件PASSした。P9修正時のWindows Rust canonicalも
lib 115件とshutdown-process 1件が失敗0で、`cargo fmt --check`と`cargo check --locked --lib`も
PASSした。これらは安全なunsupported境界の証跡であり、未承認のreader依存、license、実RAR/CBR/7z
fixtureを補うものではない。
