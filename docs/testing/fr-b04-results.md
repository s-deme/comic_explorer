---
codd:
  node_id: "test:fr-b04-results"
  type: test
  status: active
  confidence: 0.92
  depends_on:
    - id: "req:fr-b04"
      relation: "verifies"
      semantic: "behavioral"
    - id: "design:screen-flow"
      relation: "verifies"
      semantic: "viewer-boundary"
---

# FR-B04 閲覧画面 mode 直接観測結果

**batch判定:** `BLOCKED`。縦・横スクロールのfocused scopeとcanonical aggregateはPASSした。
フルスクリーンのWindows WebView2 product gateだけが未測定のため、FR-B04 batch全体は
BLOCKEDを維持する。

## 実測範囲

- 対象: `FUT-C-015`, `FUT-C-016`, `FUT-C-017`
- C0 enum: `paged`, `vertical_scroll`, `horizontal_scroll`
- default: `paged`。既存`viewMode`（single/spread）とB01 scale/fit・loupe・reading positionは独立保持
- C1 integration owner: ashigaru6。model → Viewer → App → API/SQLite → window adapterを一名で直列統合
- path ownership: [FR-B04要件](../requirements/viewer-layout-requirements.md#c0c1-ownership-checkpoint)
- focused実測環境: WSL2、Linux Node.js v24.18.0、npm 11.16.0、Vitest 3.2.7、Windows cargo 1.97.1
- 原本snapshot差分: 0（library root配下への書込みなし）
- library管理file: 0（設定は既存app-local SQLiteのみ）
- 外部通信: 0。install/CI/network取得なし

## C0/C1 connected evidence matrix

pure unitだけでは完了扱いにせず、`App`から`Viewer`へ接続したDOM、保存呼出し、SQLite reopen、
fullscreen adapter呼出しを直接観測した。

| Test ID | C0/C1 checkpoint | 接続して観測した結果 | 結果 | 根拠 |
|---|---|---|---|---|
| FT-B04-001 | C0 enum/default/persistence boundary | modelの3値・未知値fallbackと、接続Appの既定`paged`→layout selector→保存呼出しを確認 | PASS | `src/features/viewer/model.test.ts`; `src/App.test.tsx` |
| FT-B04-002 | C1 layout/anchor/focus | App→Viewer→DOMで縦・横layoutを切替。startIndexのpage anchor、全page article、anchor focusを確認 | PASS | `src/features/viewer/Viewer.test.tsx`; `src/App.test.tsx` |
| FT-B04-003 | C1 interaction | 読み方向の`r`切替、directionに従うArrowLeft navigation、anchor focus、scroll layoutでnative wheelを奪わないこと、通常Escでcloseを確認 | PASS | `src/features/viewer/Viewer.test.tsx` |
| FT-B04-004 | C1 window state | App→Viewer→adapterのenter/exit、fullscreen中Esc、adapter error status、Tauri window delegateを確認。fullscreenはlayout selectorと別状態 | PASS（connected） | `src/App.test.tsx`; `src/features/viewer/Viewer.test.tsx`; `src/features/viewer/fullscreen.test.ts` |
| FT-B04-005 | C1 persistence/non-persistence | App settingsからlayout・B01 scale/loupeを復元し、fullscreenを復元しないこと、Rust SQLite reopenでlayoutを復元 | PASS | `src/App.test.tsx`; `src-tauri/src/state/repository.rs` |

focused command:

```text
npm test -- --run src/features/catalog/view-mode.test.ts src/features/catalog/CatalogGrid.test.tsx src/features/catalog/end-of-volume.test.ts src/features/catalog/sort.test.ts src/features/viewer/model.test.ts src/features/viewer/fullscreen.test.ts src/features/viewer/Viewer.test.tsx src/App.test.tsx --pool=threads --poolOptions.threads.singleThread=true --reporter=dot
```

結果: `Test Files 8 passed (8)`, `Tests 67 passed (67)`, `failed 0`、`SKIP 0`、exit 0。

## batch末尾 gate

### aggregate redo RCA / resolution

`src/features/viewer/`と接続済み`App`のfocused testは失敗しない一方、
`tests/test_codd_consistency_producer.py`の実CoDD呼出しと
`scripts/run-codd-consistency.sh`の`codd dag verify --path /mnt/e/...`は
`p9_client_rpc`で停止していた。`scripts/run-codd-dag-verify.sh`を追加し、WSL時だけ
`.codd`入力をext4一時ミラーへ置き、CoDD本体を`/tmp`キャッシュから起動するようにした。
その結果、`depends_on_consistency`は`pass / skipped=false / violations=0 /
records_compared=5 / checked_count=5`となった。

| Gate | 結果 | 備考 |
|---|---|---|
| FT-B04-001〜005 focused | PASS | 67/67、SKIP 0、失敗0。5本すべてconnected evidence。FT-B04-004はconnected判定のみPASS |
| viewer/catalog回帰 | PASS | focused commandに既存catalog 4 suiteとViewer回帰を含め、SKIP 0 |
| TypeScript typecheck | PASS | `npm run typecheck` exit 0 |
| production build | PASS | Vite 7.3.6、52 modules transformed、exit 0 |
| Rust fmt/check/test | PASS | canonical `scripts/run-rust-check.cmd`、56 lib + 1 shutdown integration、ignored 0、SKIP 0、exit 0 |
| CoDD scan/check | BLOCKED (v9fs root) | `/mnt/e`直実行は9p I/O待ち。ext4ミラーでの`codd check`はred gate 0、advisory 3件 |
| CoDD verify / canonical aggregate | PASS | WSL ext4ミラー経路で実CoDDを実行。`scripts/run-tests.sh`全体もexit 0 |
| Windows WebView2 product fullscreen | BLOCKED disclosed | WSL/Linux sessionでは実行しない。未実行をPASS化しない |

## 実装・保存境界

`layoutMode`はViewerの`viewMode`と分離し、既存app-local SQLite `settings` tableの`layoutMode`へ
保存する。旧DBの欠損値・未知値は`paged`へ戻す。fullscreenはTauri OS window adapterへ委譲し、
SQLiteへ保存しない。layout切替時もB01のscale mode、倍率、loupe、読み方向、読書位置を初期化
しない。原本、ZIP/CBZ、thumbnail source、library root配下の管理fileへ新規書込みを行わない。

## 非破壊・通信境界

原本snapshot差分0、library管理file 0、network 0、push 0。`dist/`、`target/`、CoDD生成物は
追跡対象へ含めない。connected adapter/component evidenceとcanonical aggregate failure、Windows
WebView2製品gateを混同せず、FUT-C-015〜017は台帳上`Partial / BLOCKED`を維持する。
