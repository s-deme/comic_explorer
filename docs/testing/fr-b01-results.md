---
codd:
  node_id: "test:fr-b01-results"
  type: test
  status: active
  confidence: 0.92
  depends_on:
    - id: "req:viewer-scale"
      relation: "verifies"
      semantic: "behavioral"
    - id: "design:screen-flow"
      relation: "verifies"
      semantic: "viewer-layout"
---

# FR-B01 表示倍率 直接観測結果

## 実測範囲

- 対象: `FUT-C-018`, `FUT-C-033`, `FUT-C-034`, `FUT-C-035`, `FUT-C-036`, `FUT-C-037`
- 接続対象: `src/features/viewer/Viewer.tsx` と `src/features/viewer/model.ts`
- 実測日: 2026-08-01 JST
- テスト実行環境: Linux WSL2、Node.js v24.18.0、npm 11.16.0
- 原本snapshot差分: 0（fixture/library rootへの書込みなし）
- 外部通信: 0（npm依存は既存ローカルcacheのoffline補修のみ）

## focused test

コマンド:

```text
npm test -- --run src/features/viewer/model.test.ts src/features/viewer/Viewer.test.tsx --maxWorkers=1
```

結果: `Test Files 2 passed (2)`, `Tests 12 passed (12)`, `SKIP 0`。

| Test ID | 観測内容 | 結果 | 根拠 |
|---|---|---|---|
| FT-B01-001 | 任意倍率の非有限値、上下限、0.1刻み丸め | PASS | `src/features/viewer/model.test.ts` |
| FT-B01-002 | 全体・横幅・高さ・原寸fit mode切替 | PASS | `src/features/viewer/model.test.ts`, `Viewer.test.tsx` |
| FT-B01-003 | custom/original stateとpage遷移後の維持 | PASS | `src/features/viewer/model.test.ts`, `Viewer.test.tsx` |
| FT-B01-004 | ルーペpointerの左上・右下・画像外clamp | PASS | `src/features/viewer/model.test.ts` |
| FT-B01-005 | Viewer初期設定とSQLite再open後のmode/倍率/ルーペ復元 | PASS | `Viewer.test.tsx`, `src-tauri/src/state/repository.rs` |

## batch末尾検証

| Gate | 結果 | 備考 |
|---|---|---|
| focused test | PASS | SKIP 0、失敗0 |
| TypeScript typecheck | PASS | `npm run typecheck` |
| diff check | PASS | `git diff --check` |
| Rust check | PASS | Windows cargo 1.97.1をWSLから実行、`cargo check --locked`成功 |
| Rust unit/integration regression | PASS | `cargo test --locked`: 54 lib tests + 1 shutdown integration test、失敗0、skip0 |
| Rust persistence focused test | PASS | `settings_and_reading_position_survive_reopen`: 1 passed、0 failed |
| Windows product UI harness | BLOCKED | Windows WebView2実機が無く未実行。component観測結果とは分離 |
| CoDD scan/check/verify | PASS | scan/check/verify成功、関連red gate 0。verify summaryはDAG 3 PASS / 0 FAIL / 1 advisory、configured verification test 0件（既存設定） |

## 回帰・build

- Frontend回帰: `npm test -- --maxWorkers=1`、9 files / 43 tests、失敗0、SKIP 0。
- Production build: `npm run build`、45 modules transformed、成功。
- `npm run typecheck`: 成功。
- `cargo fmt --all -- --check`: 成功。
- CoDD verify execution evidence: `scripts/run-tests.sh` 32.44s、typecheck executed、source integrity 11 files checked、exit 0。

## 非破壊・通信境界

scale設定は既存SQLiteのapp-local `settings` tableへ保存し、漫画原本・書庫・library rootへ
管理fileを作成しない。UI clientはTauri command以外の通信を追加していない。
