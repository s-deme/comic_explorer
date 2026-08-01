---
codd:
  node_id: "test:fr-b03-results"
  type: test
  status: active
  confidence: 0.92
  depends_on:
    - id: "req:fr-b03"
      relation: "verifies"
      semantic: "behavioral"
    - id: "design:screen-flow"
      relation: "verifies"
      semantic: "catalog-boundary"
---

# FR-B03 一覧表示形式 直接観測結果

## 実測範囲

- 対象: `FUT-C-012`, `FUT-C-013`, `FUT-C-014`
- C0 enum: `small_thumbnail`, `detail_list`, `cover_list`
- default: `cover_list`（既存の表紙付き一覧を維持）
- C1 integration owner: ashigaru6。mode model → CatalogGrid → App → API/SQLite → gateを一名で直列統合
- path ownership: [FR-B03要件](../requirements/catalog-view-requirements.md#c0c1-ownership-checkpoint)
- 実測環境: WSL2、Linux Node.js v24.18.0、npm 11.16.0、Vitest 3.2.7、Windows cargo 1.97.1
- 原本snapshot差分: 0（library root配下への書込みなし）
- library管理file: 0（設定はapp-local SQLiteのみ）
- 外部通信: 0。依存treeは既存cacheを使用し、install/ci/network取得なし

## C0/C1 connected evidence matrix

pure unitだけでは完了扱いにせず、`App`から実際に`CatalogGrid`へ渡るmodeとDOM結果を
直接観測した。

| Test ID | C0/C1 checkpoint | 接続して観測した結果 | 結果 | 根拠 |
|---|---|---|---|---|
| FT-B03-001 | C0 enum/default/mode切替 | `App`の`一覧表示形式` selectorを操作し、3値と`data-catalog-view-mode`を順に確認。各選択をAPI保存呼出しへ接続 | PASS | `src/App.test.tsx` |
| FT-B03-002 | C1 metadata | 3 modeそれぞれで長名・種別・`data-entry-count=3`・status barの`3項目`を確認。detail listのサイズ/更新日時欠損は`—`、実値は`1.2 KB` | PASS | `src/App.test.tsx` |
| FT-B03-003 | C1 interaction/sort | detail listへ切替後、ArrowDownで選択とkeyboard focusを次項目へ移動。仮想化一覧で件数を維持し、size sort後も選択表示とmodeを維持 | PASS | `src/App.test.tsx`; `src/features/catalog/CatalogGrid.test.tsx` |
| FT-B03-004 | C1 persistence/restart | settings responseの`detail_list`を接続Appがselector/gridへ復元し、変更を保存。Rust StateStoreのSQLite reopenで`detail_list`を復元 | PASS | `src/App.test.tsx`; `src-tauri/src/state/repository.rs` |

focused command:

```text
npm test -- --run src/features/catalog/view-mode.test.ts src/features/catalog/CatalogGrid.test.tsx src/App.test.tsx --pool=threads --poolOptions.threads.singleThread=true --reporter=dot
```

結果: `Test Files 3 passed (3)`, `Tests 35 passed (35)`, `failed 0`, `SKIP 0`, exit 0。

## batch末尾 gate

| Gate | 結果 | 備考 |
|---|---|---|
| FT-B03-001〜004 focused | PASS | 35/35、SKIP 0、失敗0。4本すべて接続済みApp evidence |
| frontend regression | PASS | 11 files / 66 tests、SKIP 0、失敗0、exit 0 |
| TypeScript typecheck | PASS | `npm run typecheck` exit 0 |
| production build | PASS | Vite 7.3.6、47 modules transformed、exit 0 |
| Rust fmt/check/test | PASS | canonical `scripts/run-rust-check.cmd`、55 lib + 1 shutdown integration、ignored 0、SKIP 0、exit 0 |
| CoDD scan/check/verify | PASS | scan/check/verify exit 0、red gate 0、depends_on/product-test SKIP 0 |
| Windows WebView2 product harness | BLOCKED disclosed | WSL/Linux sessionでは実行しない。未実行をPASS化しない |

## 実装・保存境界

`catalogViewMode`はViewerの`viewMode`と分離し、既存app-local SQLite `settings` tableの
`catalogViewMode`へ保存する。旧DBのキー欠落・未知値は`cover_list`へ戻る。detail listの
欠損size/modifiedは推測せず`—`で表示し、sortのsnapshotと一覧件数を共有する。原本、
ZIP/CBZ、thumbnail source、library root配下の管理fileへ新規書込みを行わない。

## FR-B02 baselineとのwall-clock/redo/quality比較

FR-B02 baselineはactive total `PT1H31M03S`、redo `PT30M23S`（33.37%）で、overhead >20%
によりserial 1 ownerを維持した。FR-B03はその決定に従い一名で実装し、追加redo 0、
focused 35/35、frontend 66/66、Rust 55+1、CoDD red gate 0、全必須gate SKIP 0を確認した。

FR-B03の実測timelineはtask/reportのISO-8601値と、queue/dependency wait・executionを分離して
記録する。両batchはscopeと計測母集団が異なるため、品質gateは双方PASSと記録するが、
速度向上（speedup）や品質差の断定は行わない。B04〜B12はFR-B03のQC評価まで開始していない。

## 非破壊・通信境界

原本snapshot差分0、library管理file 0、network 0、push 0。`dist/`、`target/`、CoDD生成物は
追跡対象へ含めない。Windows WebView2製品実機だけは環境外のためBLOCKED disclosureとして
保持し、local connected evidence、Rust、CoDDのPASSとは混同しない。
