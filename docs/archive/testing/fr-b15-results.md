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
保存し、本棚はfavoriteとは分離したpath collectionとしてlocalStorageへ保存した。再監査ではpage key
基準のdedup・再解決・wrap、Viewer内一覧、破損JSONの安全な復元、書込失敗の明示、library root別の
名前空間とlegacy dataの単一root移行も確認した。library原本への書込みはない。

| Test ID | 結果 | 直接観測 |
|---|---|---|
| FT-B15-001 | PASS | `collections.test.ts`と`Viewer.test.tsx`でpageKey dedup・再解決を確認し、Viewer内一覧から同じpageをopen |
| FT-B15-002 | PASS | 現在pageより後のresolved bookmarkへ移動し、末尾で先頭へwrap、欠損page keyは安全に除外 |
| FT-B15-003 | PASS | bookshelfのunique/add/remove、書込失敗result、legacy migrationとroot別分離を確認し、App menu/dialogへ接続 |

2026-08-10にWindows-native Nodeで `collections.test.ts` 5、`Viewer.test.tsx` 12を含むP1〜P3共有回帰
6 filesを実行し、PASS 85 / FAIL 0 / SKIP 0を実測した。`scripts/run-typecheck-windows.ps1`もexit 0。
localStorage unavailable、null、wrong-shape、混在した破損rowは安全なcollectionへfallbackする。
native Tauri/WebView2の製品UIハーネスは今回未実行であり、component evidenceを製品実機PASSへは
読み替えない。
最終Windows-native CoDD scan/check/verifyはexit 0（red 0、advisoryのみ）。未実測gateをPASSへ
加算しない。
