---
codd:
  node_id: "test:fr-b17-results"
  type: test
  status: active
  confidence: 0.9
  depends_on:
    - id: "req:roadmap-priorities"
      relation: "verifies"
      semantic: "p5-reference-shell-contract"
    - id: "test:fr-b16-results"
      relation: "derives_from"
      semantic: "filtered-catalog-command-boundary"
---

# FR-B17 参照shell UI — 受入結果

P5（FR-B17）の実装状態は `Implemented / PARTIAL` とする。先行commandを呼ぶaccessible icon
toolbarと、既存のvirtualized catalogへ`reference_tile` view modeを追加した。処理の二重実装、
外部通信、原本書込みはない。正式な`FT-B17-001`〜`FT-B17-003`のApp test、frontend保存失敗時の
rollback、backend validation、SQLiteへ保存した`reference_tile`の再openを観測済みである。

| Test ID | 結果 | 直接観測 |
|---|---|---|
| FT-B17-001 | PASS | top-level 5分類、accessible name、Alt mnemonic、roving focus、既存sort/view commandへの接続 |
| FT-B17-002 | PASS | accessible name付きtoolbar command、menu/toolbarの共有state、既存sort/view callbackへの一回だけの接続 |
| FT-B17-003 | PARTIAL | `reference_tile` enum、frontend保存失敗時rollback、backend allowlist、SQLite save/reopen。製品DPIは未測定 |

2026-08-10のWindows-native再実測では、`view-mode.test.ts` 5 tests、`CatalogGrid.test.tsx`
8 tests、`App.test.tsx` 52 tests、Rustのcatalog view-mode validation 1 test、
`fr_b17_reference_tile_and_settings_survive_reopen` 1 test、typecheckがPASSした。`App.test.tsx`の正式な
`FT-B17-003`は`reference_tile`保存error時にpersist済みmodeへ戻し、Rust repository testは
`reference_tile`値をSQLiteへ保存してstore再open後に復元する。

DPI/実機visual pixel測定は未実施のため、componentとrepositoryの機能証跡を製品DPI gateへ読み替えず、
P5全体は`PARTIAL`を維持する。
