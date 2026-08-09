---
codd:
  node_id: "test:fr-b15-results"
  type: test
  status: active
  confidence: 0.9
  depends_on:
    - id: "req:roadmap-priorities"
      relation: "verifies"
      semantic: "p3-bookmark-bookshelf-contract"
    - id: "test:fr-b14-results"
      relation: "derives_from"
      semantic: "open-navigation-boundary"
---

# FR-B15 しおり・本棚 — 受入結果

P3（FR-B15）は `Implemented / PASS` とする。しおりはviewerのpage keyとitem keyをlocal app dataへ
保存し、本棚はfavoriteとは分離したpath collectionとしてlocalStorageへ保存した。library原本への
書込みはない。

| Test ID | 結果 | 直接観測 |
|---|---|---|
| FT-B15-001 | PASS | page bookmarkの保存、同一page冪等更新、item単位一覧 |
| FT-B15-002 | PASS | 現在pageより後のbookmark移動と末尾wrap |
| FT-B15-003 | PASS | bookshelfのunique/add/removeとApp menu/dialog接続 |

`collections.test.ts` 2 tests、viewer model回帰9 tests、typecheckはPASS。Windows-native CoDD
scan/check/verifyもexit 0、red 0。localStorage unavailable時は読み取りを止めず安全な空collectionへ
fallbackする。
