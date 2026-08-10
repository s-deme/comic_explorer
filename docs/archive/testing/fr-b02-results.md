---
codd:
  node_id: "test:fr-b02-results"
  type: test
  status: active
  confidence: 0.92
  depends_on:
    - id: "req:fr-b02"
      relation: "verifies"
      semantic: "behavioral"
    - id: "design:screen-flow"
      relation: "verifies"
      semantic: "viewer-boundary"
---

# FR-B02 巻末動作 直接観測結果

## 実測範囲

- 対象: `FUT-C-020`, `FUT-C-038`, `FUT-C-039`, `FUT-C-040`, `FUT-C-041`
- C0 policy: `auto_next`, `confirm_next`, `return_library`, `stop`, `loop`
- default: `auto_next`（REQ-MVP-016の確認なし自動遷移を維持）
- C1 integration owner: ashigaru6。resolver → UI/dialog → SQLite/API → gateを一名で直列統合
- path ownership: [FR-B02要件](../requirements/end-of-volume-requirements.md#c0c1-ownership-checkpoint)
- 実測環境: Windows native Node.js/npm、Vitest 3.2.7、Windows cargo 1.97.1
- 原本snapshot差分: 0（library root配下への書込みなし）
- library管理file: 0（SQLiteはapp-local settingsのみ）
- 外部通信: 0。frontendは既存native package treeを使用し、install/ci/network取得なし

## focused test

resolverコマンド:

```text
npm test -- --run src/features/catalog/end-of-volume.test.ts --pool=threads --poolOptions.threads.singleThread=true --reporter=verbose
```

結果: `Test Files 1 passed (1)`, `Tests 6 passed (6)`, `SKIP 0`, exit 0。

| Test ID | 観測内容 | 結果 | 根拠 |
|---|---|---|---|
| FT-B02-001 | `auto_next`がsort済み直後の漫画項目を開く | PASS | `src/features/catalog/end-of-volume.test.ts` |
| FT-B02-002 | `confirm_next`が確認decisionを返し、UI承認後だけ開く | PASS | resolver test、`src/App.test.tsx` |
| FT-B02-003 | `return_library`が次項目ありでlibrary復帰を選ぶ | PASS | `src/features/catalog/end-of-volume.test.ts` |
| FT-B02-004 | `stop`とno-nextが現在巻末に留まり表示する | PASS | `src/features/catalog/end-of-volume.test.ts` |
| FT-B02-005 | 次項目なしの`loop`がsort済み先頭へ戻る | PASS | `src/features/catalog/end-of-volume.test.ts` |
| FT-B02-006 | sort順、未知値のdefault、設定復元契約 | PASS | resolver test、`src-tauri/src/state/repository.rs` |

UI/persistence focused補助:

- `src/App.test.tsx`: 15 tests passed、SKIP 0、confirm dialogの表示・承認後遷移とpolicy保存を含む。
- `src-tauri/src/state/repository.rs`: `settings_and_reading_position_survive_reopen`で
  `endOfVolumePolicy=loop`のSQLite再open復元を確認。

## batch末尾 gate

| Gate | 結果 | 備考 |
|---|---|---|
| focused resolver | PASS | 6/6、SKIP 0、失敗0 |
| UI/persistence focused | PASS | App 15/15、Rust settings reopenを含む |
| TypeScript typecheck | PASS | `node_modules/.bin/tsc --noEmit` exit 0 |
| Rust fmt/check/test | PASS | offline cargo、54 lib + 1 shutdown integration、ignored 0 |
| frontend regression | PASS | 10 files / 51 tests、SKIP 0、失敗0、exit 0。single-thread実行 |
| production build | PASS | Vite 7.3.6、46 modules transformed、exit 0 |
| CoDD scan/check/verify | PASS | scan/check/verify exit 0、check red gate 0 / advisory 4。verifyはDAG 3 PASS / 0 FAIL / 1 advisory、`deployment_completeness`・`user_journey_coherence`・`environment_coverage`の構造的SKIP 3件（cmd_400で対象外承認）、`task_completion` 1 vacuous。depends_onと製品テストのSKIPは0 |
| Windows WebView2 product harness | BLOCKED | product実機環境では未実行。未実行をPASS化しない |

## 非破壊・通信境界

policyは既存のapp-local SQLite `settings` tableへ保存する。`endOfVolumePolicy`以外の
library root、画像、ZIP/CBZ、書庫entryへ新規管理fileを書き込まない。未知値・旧設定欠落は
`auto_next`へ戻し、外部サービスやネットワークAPIを追加しない。

## FR-B01 baselineとのquality-gated比較

FR-B01 baselineの直接観測はfocused 12/12、frontend regression 43/43、Rust 54+1、CoDD
red gate 0でSKIP 0であり、比較対象の品質gateはPASSである。FR-B02もfocused 6/6、
frontend regression 51/51、Rust 54+1、CoDD red gate 0、製品テストSKIP 0で品質gateを
満たした。FR-B01のprimary recordはcommand-to-final-QC `PT3H24M14S`、active final
task `PT15M40S`を記録している。FR-B02は`created_at`/`eligible_at`/`assigned_at`/
`first_draft_at`/`completed_at`とqueue wait、dependency wait、executionをtask/report
へ分離記録し、待機をactive workへ算入しない。両batchのquality gateはPASSだが、FR-B01
はredo・blockedを含むcommand全体、FR-B02はpilot ownerのexecutionを測るため、同一母集団
ではない。したがって速度向上の断定はせず、比較は「品質gate確認済み、scope差のため
speedup claimなし」と報告する。

## 範囲境界

FR-B02だけをpilot評価した。FR-B03〜FR-B12は実装・focused test・配備を開始していない。
