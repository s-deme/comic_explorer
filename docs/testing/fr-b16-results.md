---
codd:
  node_id: "test:fr-b16-results"
  type: test
  status: active
  confidence: 0.9
  depends_on:
    - id: "req:roadmap-priorities"
      relation: "verifies"
      semantic: "p4-filter-export-contract"
    - id: "test:fr-b13-results"
      relation: "derives_from"
      semantic: "catalog-selection-and-status-boundary"
---

# FR-B16 filter・export — 受入結果

P4（FR-B16）の実装状態は `Implemented / PASS`、roadmap状態は`Done`とする。current-sessionの
basename maskをcatalog/statusへ接続し、filtered rowsからrelative pathだけのCSVを生成する。
library原本、sidecar、外部通信は変更しない。browser downloadの契約は保存完了の保証ではなく開始通知とし、
開始処理が失敗した場合は失敗を通知して成功件数や保存完了を表示しない。

| Test ID | 結果 | 直接観測 |
|---|---|---|
| FT-B16-001 | PASS | basenameの`*`/`?`/`;`、case-insensitive、空mask、semicolon/空segmentだけの全件扱い |
| FT-B16-002 | PASS | CSV header/escaping、kind/size/modified、absolute path除外、formula-leading cellの無害化、URL作成失敗時に成功件数・保存完了を表示しない境界 |

2026-08-10のWindows-native再実測では、正式な`FT-B16-001`/`FT-B16-002`を含む
`commands.test.ts` 3 tests、`CatalogGrid.test.tsx` 8 tests、`App.test.tsx` 52 tests、typecheckが
PASSした。`=`, `+`, `-`, `@`, tab、CRで始まるcellは先頭へapostropheを付け、CSV構文escapingの前に
spreadsheet formulaとしての解釈を無害化する。成功時は「downloadを開始した」に限定し、実保存の完了や
保存先選択結果をアプリが観測したとは扱わない。
