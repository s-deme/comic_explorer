---
codd:
  node_id: "doc:feature-status"
  type: design
  status: active
  depends_on:
    - id: "req:product-questionnaire"
      relation: "derives_from"
      semantic: "governance"
    - id: "req:mvp-requirements"
      relation: "derives_from"
      semantic: "governance"
    - id: "test:mvp-implementation-status"
      relation: "refines"
      semantic: "governance"
    - id: "test:phase6-case-results"
      relation: "refines"
      semantic: "verification"
---

# Comic Explorer 機能ステータス台帳

本台帳は、MVP要件25件、アンケート由来の将来候補、MVP対象外候補、未決定事項を
原子機能単位で管理する正本である。実装状態と検証状態は別々に記録し、コードの存在や
テストスイートの一部成功だけで `Implemented` や `PASS` へ繰り上げない。

## 状態語彙と固定スキーマ

機能表は常に次の11列を使う。実装状態は次の6値だけを許可する。

- `Implemented`: 実装根拠のpathが存在し、対象機能の直接観測ケースがすべてPASSである。
- `Partial`: 実装根拠はあるが、受入範囲の一部がBLOCKEDまたは未測定である。
- `Planned`: 実装方針または計画が確定しているが、機能の実装根拠がまだない。
- `Candidate`: アンケートまたはMVP対象外資料から得た将来候補で、採用未確定である。
- `Deferred`: 未決定、保留、または前提ゲート待ちで、着手を確定していない。
- `Rejected`: ローカル完結・外部送信禁止・原本非破壊という恒久方針により採用しない。方針変更時のみ再評価する。

検証状態は `PASS`、`FAIL`、`BLOCKED`、`NOT TESTED` の4値だけを許可する。`PASS` は
直接観測されたケースの根拠がある場合だけ付与し、`BLOCKED`、`FAIL`、`NOT TESTED` は
PASSへ読み替えない。候補・保留・Rejectedの機能検証は `NOT TESTED` とする。

| ID | 機能名 | 概要 | 実装状態 | 検証状態 | 優先度 | 対象リリース | 要件根拠 | 実装根拠 | 検証根拠 | 備考 |
|---|---|---|---|---|---|---|---|---|---|---|
| REQ-MVP-001 | ライブラリルート登録 | 読取可能なルートを登録・復元 | Implemented | PASS | Must | MVP | [REQ](../requirements/mvp-requirements.md#req-mvp-001-ライブラリルートの登録) | `src/App.tsx`; `src-tauri/src/state/` | TC-CT-001, TC-UI-001, TC-ERR-001 | Phase 6で直接観測PASS |
| REQ-MVP-002 | 任意のフォルダ階層 | 固定メタデータなしで階層移動 | Implemented | PASS | Must | MVP | [REQ](../requirements/mvp-requirements.md#req-mvp-002-任意のフォルダ階層) | `src-tauri/src/catalog/`; `src/features/navigation/` | TC-CT-001, TC-INT-001, TC-UI-002, TC-ERR-002 | Phase 6で直接観測PASS |
| REQ-MVP-003 | フォルダツリー移動 | 展開・折畳み・選択を同期 | Implemented | PASS | Must | MVP | [REQ](../requirements/mvp-requirements.md#req-mvp-003-フォルダツリーによる移動) | `src/features/navigation/FolderTree.tsx` | TC-UI-002, TC-UI-003, TC-ERR-002 | Phase 6で直接観測PASS |
| REQ-MVP-004 | アドレスと履歴 | パス入力と戻る・進む・上へ | Implemented | PASS | Must | MVP | [REQ](../requirements/mvp-requirements.md#req-mvp-004-アドレスと移動履歴) | `src/App.tsx`; `src/features/navigation/` | TC-UI-003, TC-UI-004 | Phase 6で直接観測PASS |
| REQ-MVP-005 | 一覧表示 | フォルダ・漫画・書庫をグリッド表示 | Implemented | PASS | Must | MVP | [REQ](../requirements/mvp-requirements.md#req-mvp-005-フォルダ内容の一覧表示) | `src/features/catalog/CatalogGrid.tsx` | TC-INT-009, TC-UI-005, TC-UI-008 | Phase 6で直接観測PASS |
| REQ-MVP-006 | 表紙サムネイル | 先頭画像と鮮度を管理 | Implemented | PASS | Must | MVP | [REQ](../requirements/mvp-requirements.md#req-mvp-006-表紙サムネイル) | `src-tauri/src/catalog/thumbnail.rs`; `src-tauri/src/state/cache.rs` | TC-CT-004, TC-INT-004, TC-INT-005, TC-UI-006 | Phase 6で直接観測PASS |
| REQ-MVP-007 | 一覧並べ替え | 名前・日時・サイズ・種類の昇降順と保存 | Implemented | PASS | Must | MVP | [REQ](../requirements/mvp-requirements.md#req-mvp-007-一覧の並べ替え) | `src/features/catalog/sort.ts`; `src-tauri/src/state/` | TC-UT-009, TC-UI-007, TC-E2E-003 | Phase 6で直接観測PASS |
| REQ-MVP-008 | 画像フォルダ読込み | JPEG・JPG・PNGを自然順で閲覧 | Implemented | PASS | Must | MVP | [REQ](../requirements/mvp-requirements.md#req-mvp-008-画像フォルダのページ読込み) | `src-tauri/src/catalog/folder.rs`; `src/features/viewer/` | TC-CT-002, TC-INT-006, TC-ERR-003 | Phase 6で直接観測PASS |
| REQ-MVP-009 | ZIP・CBZ読込み | 展開せず画像を自然順で閲覧 | Implemented | PASS | Must | MVP | [REQ](../requirements/mvp-requirements.md#req-mvp-009-zipcbzのページ読込み) | `src-tauri/src/catalog/archive.rs` | TC-CT-003, TC-INT-002, TC-INT-007, TC-SEC-001 | Phase 6で直接観測PASS |
| REQ-MVP-010 | 漫画を開く | 開閉後に一覧文脈を復元 | Implemented | PASS | Must | MVP | [REQ](../requirements/mvp-requirements.md#req-mvp-010-漫画項目を開く) | `src/App.tsx`; `src/features/viewer/` | TC-UI-008, TC-E2E-001 | Phase 6で直接観測PASS |
| REQ-MVP-011 | 単ページ表示 | 比率維持・範囲内移動・全体フィット | Implemented | PASS | Must | MVP | [REQ](../requirements/mvp-requirements.md#req-mvp-011-単ページ表示) | `src/features/viewer/` | TC-UT-006, TC-UI-009 | Q5-4の全体フィットを含め直接観測PASS |
| REQ-MVP-012 | 見開き表示 | 最大2頁、横長・末尾は単独 | Implemented | PASS | Must | MVP | [REQ](../requirements/mvp-requirements.md#req-mvp-012-見開き表示) | `src/features/viewer/` | TC-UI-010, TC-UI-011 | Phase 6で直接観測PASS |
| REQ-MVP-013 | 読み方向 | 右開き・左開きと保存 | Implemented | PASS | Must | MVP | [REQ](../requirements/mvp-requirements.md#req-mvp-013-読み方向) | `src/features/viewer/`; `src/App.tsx` | TC-UT-008, TC-UI-012 | Phase 6で直接観測PASS |
| REQ-MVP-014 | 入力操作 | キー・クリック・ホイール・Esc | Implemented | PASS | Must | MVP | [REQ](../requirements/mvp-requirements.md#req-mvp-014-マウスとキーボードによる閲覧) | `src/features/viewer/`; `src/App.tsx` | TC-UI-013, TC-A11Y-001 | Phase 6で直接観測PASS |
| REQ-MVP-015 | 読書位置 | 保存・復元・DB回復 | Implemented | PASS | Must | MVP | [REQ](../requirements/mvp-requirements.md#req-mvp-015-読書位置の保存と復元) | `src-tauri/src/state/reading_position.rs` | TC-UT-007, TC-CT-005, TC-INT-008, TC-E2E-001 | Phase 6で直接観測PASS |
| REQ-MVP-016 | 巻末動作 | 並べ替え順の次作品へ移動 | Implemented | PASS | Must | MVP | [REQ](../requirements/mvp-requirements.md#req-mvp-016-巻末動作) | `src/App.tsx`; `src/features/catalog/sort.ts` | TC-UT-010, TC-UI-014, TC-E2E-003 | 固定の既定動作は直接観測PASS。5 policy設定はFR-B02の採用要件で管理 |
| REQ-MVP-017 | 原本非破壊 | 原本・書庫を変更しない | Implemented | PASS | Must | MVP | [REQ](../requirements/mvp-requirements.md#req-mvp-017-原本の非破壊) | `src-tauri/src/catalog/`; `src-tauri/src/state/` | TC-INT-010, TC-SEC-001, TC-E2E-002 | Phase 6で直接観測PASS |
| REQ-MVP-018 | ローカル完結 | 外部送信なし・オフライン動作 | Partial | BLOCKED | Must | MVP | [REQ](../requirements/mvp-requirements.md#req-mvp-018-ローカル完結と外部送信禁止) | `src-tauri/src/api/`; `src-tauri/src/application/` | TC-SEC-002, TC-E2E-004 | OS外部監視・隔離VMが必要で未確定。PASS化しない |
| REQ-MVP-019 | エラー継続 | エラー表示と再試行・復帰 | Implemented | PASS | Must | MVP | [REQ](../requirements/mvp-requirements.md#req-mvp-019-エラーからの継続) | `src/features/errors/`; `src-tauri/src/domain/error.rs` | TC-ERR-001〜005, TC-A11Y-001 | Phase 6で直接観測PASS |
| NFR-MVP-001 | 対応規模 | 10,000項目・遅延処理・cache cap | Partial | BLOCKED | Must | MVP | [NFR](../requirements/mvp-requirements.md#nfr-mvp-001-対応規模) | `src-tauri/src/state/`; `src-tauri/src/application/`; `src/features/navigation/` | TC-PERF-002 | mounted gridcellはPASSだが10,000項目のWindows製品UI測定待ち |
| NFR-MVP-002 | 性能目標 | 起動・一覧・切替・検索性能 | Partial | BLOCKED | Should | MVP | [NFR](../requirements/mvp-requirements.md#nfr-mvp-002-性能目標) | `src-tauri/src/application/`; `src/features/navigation/`; `src/features/viewer/` | TC-PERF-001〜006 | 基準Windows環境待ち。AC4検索性能は検索UI実装までDeferred |
| NFR-MVP-003 | キーボードアクセシビリティ | 到達性・フォーカス・一貫性 | Partial | BLOCKED | Must | MVP | [NFR](../requirements/mvp-requirements.md#nfr-mvp-003-キーボードアクセシビリティ) | `src/App.tsx`; `src/features/navigation/`; `src/features/viewer/` | TC-A11Y-001〜003 | key inputはPASS、UIA・screen reader・DPIはBLOCKED |
| NFR-MVP-004 | 再配布可能依存 | ライセンス・lockfile適合 | Implemented | PASS | Must | MVP | [NFR](../requirements/mvp-requirements.md#nfr-mvp-004-無料で再配布可能な依存関係) | `package.json`; `src-tauri/Cargo.toml`; `scripts/` | TC-DIST-001 | 直接観測PASS |
| NFR-MVP-005 | Windows配布 | Win10・Win11導入・起動・削除 | Partial | BLOCKED | Must | MVP | [NFR](../requirements/mvp-requirements.md#nfr-mvp-005-windows配布) | `src-tauri/`; `scripts/`; `.github/workflows/` | TC-E2E-001, TC-DIST-002, TC-DIST-003 | release E2EはPASSだがclean VM・uninstall確認待ち |
| NFR-MVP-006 | UX技術構成検証 | 実測・推定・未測定を区別 | Partial | BLOCKED | Must | MVP | [NFR](../requirements/mvp-requirements.md#nfr-mvp-006-uxを優先した技術構成の検証) | `src/`; `src-tauri/`; `tests/`; `scripts/` | TC-INT-010, TC-INT-011, TC-SEC-001, TC-E2E-002, TC-DIST-001; TC-NFR-006-001 [spec](../testing/test-cases.md) | 列挙範囲はPASSだがWindows未測定ACと、Phase 6結果未収載のAC6仕様caseを含む。未実行をPASS化しない |
| FUT-C-001 | RAR・CBR書庫閲覧 | RAR・CBR対応 | Partial | BLOCKED | 将来 | FR-B12 | [P1〜P10要件](../requirements/roadmap-priorities-requirements.md#p9-追加書庫形式) | `src-tauri/src/catalog/archive.rs`; `src-tauri/src/catalog/folder.rs`; `src-tauri/src/media/` | [FR-B12結果](../testing/fr-b12-results.md)（FT-B12-003） | archive分類と安全なUnsupportedFormat境界はPASS。完全readerは依存/license/fixture確認待ち |
| FUT-C-002 | 7z書庫閲覧 | 7z対応 | Partial | BLOCKED | 将来 | FR-B12 | [P1〜P10要件](../requirements/roadmap-priorities-requirements.md#p9-追加書庫形式) | `src-tauri/src/catalog/archive.rs`; `src-tauri/src/catalog/folder.rs`; `src-tauri/src/media/` | [FR-B12結果](../testing/fr-b12-results.md)（FT-B12-003） | archive分類と安全なUnsupportedFormat境界はPASS。完全readerは依存/license/fixture確認待ち |
| FUT-C-005 | WebPページ表示 | static WebPをfolder/ZIP/CBZのpage・viewer・thumbnailへ接続 | Implemented | PASS | 希望 | FR-B08 | [FR-B08 static WebP要件](../requirements/webp-requirements.md#fr-b08-静止-webp-要件); Q3-2 [questionnaire](../requirements/product-questionnaire.md) | `src-tauri/src/catalog/thumbnail.rs`; `src-tauri/src/catalog/image_metadata.rs`; `src-tauri/src/catalog/`; `src-tauri/src/media/`; `src/App.tsx`; `src/features/viewer/Viewer.tsx`; `scripts/run-product-ui-harness.ps1`; `scripts/verify-feature-windows.ps1` | [FR-B08結果](../testing/fr-b08-results.md)（FT-B08-001 exact1、Rust `fr_b08_webp_`、Windows WebView2 `FT-B08-006`、canonical aggregate PASS） | static lossy/lossless/alpha、WebView2 viewer、pure-Rust thumbnail decode/cache、corrupt/animated local recovery、source tree差分0を直接観測。image-webp 0.2.4 lock/SBOM/noticeのunknown/prohibited licenseは0。CoDD advisoryは生値のみでPASSへ加算しない。 |
| FUT-C-006 | 静止GIF表示 | 静止GIF対応 | Partial | BLOCKED | 希望 | FR-B08 | [P1〜P10要件](../requirements/roadmap-priorities-requirements.md#p8-追加画像形式) | `src-tauri/src/catalog/image_metadata.rs`; `src-tauri/src/domain/file_kind.rs`; `src-tauri/src/application/mod.rs`; `src-tauri/src/media/mod.rs` | [FR-B08 P8結果](../testing/fr-b08-p8-results.md) | GIF block、image data、trailer、frame数、transparencyを構造testで確認。release WebView2のstatic decode/corrupt fallbackは`BLOCKED_UNMEASURED` |
| FUT-C-007 | アニメーションGIF表示 | アニメGIF対応 | Partial | BLOCKED | 希望 | FR-B08 | [P1〜P10要件](../requirements/roadmap-priorities-requirements.md#p8-追加画像形式) | `src-tauri/src/catalog/image_metadata.rs`; `src-tauri/src/catalog/thumbnail.rs`; `src-tauri/src/media/mod.rs`; `src-tauri/src/application/mod.rs` | [FR-B08 P8結果](../testing/fr-b08-p8-results.md) | animated metadataとapp-local disk thumbnail拒否はPASS。release WebView2の複数frame再生・非永続化は`BLOCKED_UNMEASURED` |
| FUT-C-008 | AVIFページ表示 | AVIF対応 | Partial | BLOCKED | 将来 | FR-B08 | [P1〜P10要件](../requirements/roadmap-priorities-requirements.md#p8-追加画像形式) | `src-tauri/src/catalog/image_metadata.rs`; `src-tauri/src/domain/file_kind.rs`; `src-tauri/src/application/mod.rs`; `src-tauri/src/media/mod.rs` | [FR-B08 P8結果](../testing/fr-b08-p8-results.md) | BMFF box size、compatible brand、box-scoped `ispe`、全dimension上限、MIME/media grantを構造testで確認。release WebView2 decodeは`BLOCKED_UNMEASURED` |
| FUT-C-010 | 名前検索 | ファイル名・フォルダ名検索 | Implemented | PASS | 希望 | FR-B05 | [FR-B05要件](../requirements/catalog-search-requirements.md#fr-b05-名前検索要件); Q4-1/Q4-4 [questionnaire](../requirements/product-questionnaire.md) | `src/App.tsx`; `src/App.test.tsx`; `src/features/library/client.ts`; `src-tauri/src/application/mod.rs`; `scripts/run-product-ui-harness.ps1`; `scripts/verify-feature-windows.ps1` | [FR-B05結果](../testing/fr-b05-results.md)（FT-B05-001〜005 exact5、`search_port_` Rust、Windows WebView2 `FT-B05-006`、canonical aggregate PASS） | release製品でnormalized mixed-kind、result navigation、empty/clear、明示rescan、source tree差分0を直接観測。Windows-native CoDD scan/check/verify exit 0・red 0。構造advisoryは生値を開示し、機能PASSへ加算しない。10,000項目/1秒の性能測定は別トラックで未実測のまま。 |
| FUT-C-011 | お気に入り・クイックアクセス | 任意項目への短縮アクセス | Implemented | PASS | 希望 | FR-B06 | [FR-B06要件](../requirements/favorites-requirements.md#fr-b06-お気に入り要件); Q4-1 [questionnaire](../requirements/product-questionnaire.md) | `src/App.tsx`; `src/App.test.tsx`; `src/features/catalog/QuickAccess.tsx`; `src/features/library/client.ts`; `src-tauri/src/application/mod.rs`; `src-tauri/src/state/repository.rs`; `scripts/run-product-ui-harness.ps1`; `scripts/verify-feature-windows.ps1` | [FR-B06結果](../testing/fr-b06-results.md)（FT-B06-001/002 exact2、Rust favorite target境界、Windows WebView2 `FT-B06-006`、canonical aggregate PASS） | release製品でcurrent-session add/remove、available rows、folder navigation、comicFolder/archive viewer、source tree差分0を直接観測。restart/migration/missing/moved/re-resolveはFUT-C-021へ分離。構造advisoryは生値を開示し、機能PASSへ加算しない。 |
| FUT-C-012 | 小サムネイル | 表示形式切替 | Implemented | PASS | MVP後 | FR-B03 | [FR-B03要件](../requirements/catalog-view-requirements.md#req-fr-b03-001-mode-boundary); Q4-2 [questionnaire](../requirements/product-questionnaire.md) | `src/features/catalog/view-mode.ts`; `src/features/catalog/CatalogGrid.tsx`; `src/App.tsx`; `src/styles.css` | [FT-B03-001](../testing/fr-b03-results.md#ft-b03-001), [FT-B03-002](../testing/fr-b03-results.md#ft-b03-002), [FT-B03-003](../testing/fr-b03-results.md#ft-b03-003), [FT-B03-004](../testing/fr-b03-results.md#ft-b03-004) | C0採用、`small_thumbnail`を接続済みAppで直接観測 |
| FUT-C-013 | 詳細リスト | 表示形式切替 | Implemented | PASS | MVP後 | FR-B03 | [FR-B03要件](../requirements/catalog-view-requirements.md#req-fr-b03-001-mode-boundary); Q4-2 [questionnaire](../requirements/product-questionnaire.md) | `src/features/catalog/view-mode.ts`; `src/features/catalog/CatalogGrid.tsx`; `src/App.tsx`; `src/styles.css` | [FT-B03-001](../testing/fr-b03-results.md#ft-b03-001), [FT-B03-002](../testing/fr-b03-results.md#ft-b03-002), [FT-B03-003](../testing/fr-b03-results.md#ft-b03-003), [FT-B03-004](../testing/fr-b03-results.md#ft-b03-004) | C0採用、`detail_list`の列・欠損値・focusを直接観測 |
| FUT-C-014 | 表紙付きリスト | 表示形式切替 | Implemented | PASS | MVP後 | FR-B03 | [FR-B03要件](../requirements/catalog-view-requirements.md#req-fr-b03-001-mode-boundary); Q4-2 [questionnaire](../requirements/product-questionnaire.md) | `src/features/catalog/view-mode.ts`; `src/features/catalog/CatalogGrid.tsx`; `src/App.tsx`; `src/styles.css` | [FT-B03-001](../testing/fr-b03-results.md#ft-b03-001), [FT-B03-002](../testing/fr-b03-results.md#ft-b03-002), [FT-B03-003](../testing/fr-b03-results.md#ft-b03-003), [FT-B03-004](../testing/fr-b03-results.md#ft-b03-004) | C0採用、既存表紙表示を`cover_list`既定で維持 |
| FUT-C-018 | 任意倍率ズーム | 任意倍率で拡大・縮小 | Implemented | PASS | 希望 | FR-B01 | [FR-B01要件](../requirements/viewer-scale-requirements.md#req-fr-b01-002-任意倍率の境界); Q5-4 [questionnaire](../requirements/product-questionnaire.md) | `src/features/viewer/model.ts`; `src/features/viewer/Viewer.tsx` | [FT-B01-001](../testing/fr-b01-results.md#ft-b01-001) | FR-B01採用、25%〜400%を0.1倍刻みで実測 |
| FUT-C-019 | ユーザー定義ショートカット | 操作割当変更 | Implemented | PASS | 希望 | FR-B11 | [FR-B11要件](../requirements/input-customization-requirements.md#fr-b11-入力拡張要件); Q5-5 [questionnaire](../requirements/product-questionnaire.md) | `src/features/input/shortcuts.ts`; `src/App.tsx`; `src/features/viewer/Viewer.tsx`; `src/features/library/client.ts`; `src-tauri/src/application/mod.rs`; `src-tauri/src/state/repository.rs`; `src-tauri/src/lib.rs`; `src/App.fr-b11.test.tsx`; `scripts/run-product-ui-harness.ps1` | [FR-B11結果](../testing/fr-b11-results.md)（FT-B11-001/004/005、FT-B11-006 Windows product PASS） | 既定`+`の保存拒否を修正。remap、conflict、Viewer発火、restart復元、reset、原本差分0を製品実測。touch/gamepadは別feature。 |
| FUT-C-020 | 巻末動作設定・自動遷移 | 自動的に次の巻を開く設定 | Implemented | PASS | 希望 | FR-B02 | [FR-B02要件](../requirements/end-of-volume-requirements.md#req-fr-b02-001-policy-interface); Q5-6 [questionnaire](../requirements/product-questionnaire.md) | `src/App.tsx`; `src/features/catalog/end-of-volume.ts`; `src-tauri/src/application/mod.rs` | [FT-B02-001](../testing/fr-b02-results.md#ft-b02-001) | C0採用、既定値auto_nextでREQ-MVP-016互換 |
| FUT-C-021 | お気に入り保存 | お気に入り永続化 | Implemented | PASS | 希望 | FR-B06 | [FR-B06要件](../requirements/favorites-requirements.md#fr-b06-お気に入り要件); Q6-1 [questionnaire](../requirements/product-questionnaire.md) | `src/App.tsx`; `src/features/catalog/QuickAccess.tsx`; `src-tauri/src/application/mod.rs`; `src-tauri/src/state/repository.rs`; `scripts/run-product-ui-harness.ps1`; `scripts/verify-feature-windows.ps1` | [FR-B06結果](../testing/fr-b06-results.md)（FT-B06-003〜005 exact3、`fr_b06_favorite_` Rust、Windows WebView2 `FT-B06-007`、canonical aggregate PASS） | Rustでv1 migration/reopen/source separationを、release製品でrestart後のsame favoriteId/available row、strict moved/missing/re-resolve、missing再走査、source tree差分0を直接観測。Windows-native CoDD scan/check/verify exit 0・red 0。FUT-C-011と合わせFR-B06 aggregateはDone。構造advisoryは生値を開示し、機能PASSへ加算しない。 |
| FUT-C-022 | タグ付与・検索 | タグ管理 | Implemented | PASS | 将来 | FR-B10 | [FR-B10要件](../requirements/tag-management-requirements.md#fr-b10タグ管理要件); Q6-1 [questionnaire](../requirements/product-questionnaire.md) | `src-tauri/src/state/repository.rs`; `src-tauri/src/application/mod.rs`; `src-tauri/src/lib.rs`; `src/features/library/client.ts`; `src/App.tsx`; `src/App.fr-b10.test.tsx`; `scripts/run-product-ui-harness.ps1` | [FR-B10結果](../testing/fr-b10-results.md)（focused exact4、Rust exact4、Windows WebView2 `FT-B10-005`、canonical aggregate PASS） | release製品で付与・正規化検索・rename・再起動復元・除去を直接観測。library原本差分0、Windows-native CoDD scan/check/verify exit 0・red 0。構造advisoryは生値を開示し、機能PASSへ加算しない。 |
| FUT-C-023 | メモ保存 | メモ管理 | Implemented | PASS | 将来 | FR-B07 | [FR-B07要件](../requirements/reading-metadata-requirements.md#req-fr-b07-001-作品identityとmemo); Q6-1 [questionnaire](../requirements/product-questionnaire.md) | `src/App.tsx`; `src/features/library/client.ts`; `src-tauri/src/application/mod.rs`; `src-tauri/src/state/repository.rs`; `src/App.fr-b07.test.tsx`; `scripts/run-product-ui-harness.ps1` | [FR-B07結果](../testing/fr-b07-results.md)（FT-B07-001、Rust memo契約、Windows WebView2 `FT-B07-006`、canonical aggregate PASS） | release製品でsave・edit・viewer再open・restart復元・clear・再openを実測。library原本差分0、cleanup、Windows-native CoDD exit 0・red 0。後続のhistory/ratingも完了し、FR-B07 aggregateはDone。 |
| FUT-C-024 | 名前変更 | ファイル名変更 | Candidate | NOT TESTED | 将来 | 将来 | Q7-2 [questionnaire](../requirements/product-questionnaire.md) | — | 未実装・未実測 | ユーザー明示操作が前提 |
| FUT-C-025 | 移動 | ファイル移動 | Candidate | NOT TESTED | 将来 | 将来 | Q7-2 [questionnaire](../requirements/product-questionnaire.md) | — | 未実装・未実測 | ユーザー明示操作が前提 |
| FUT-C-026 | コピー | ファイルコピー | Candidate | NOT TESTED | 将来 | 将来 | Q7-2 [questionnaire](../requirements/product-questionnaire.md) | — | 未実装・未実測 | ユーザー明示操作が前提 |
| FUT-C-027 | 新規フォルダ | フォルダ作成 | Candidate | NOT TESTED | 将来 | 将来 | Q7-2 [questionnaire](../requirements/product-questionnaire.md) | — | 未実装・未実測 | ユーザー明示操作が前提 |
| FUT-C-028 | ごみ箱移動 | 確認付き削除 | Candidate | NOT TESTED | 将来 | 将来 | Q7-2 [questionnaire](../requirements/product-questionnaire.md) | — | 未実装・未実測 | 確認必須。ユーザー明示操作が前提 |
| FUT-C-029 | 完全削除 | 二段階確認付き削除 | Candidate | NOT TESTED | 将来 | 将来 | Q7-2/TBD-007 [questionnaire](../requirements/product-questionnaire.md) | — | 未実装・未実測 | TBD-007はMVP対象外。安全設計を再評価 |
| FUT-C-033 | 横幅フィット | 表示領域の横幅に合わせる | Implemented | PASS | 希望 | FR-B01 | [FR-B01要件](../requirements/viewer-scale-requirements.md#req-fr-b01-001-共通scale-model); Q5-4 [questionnaire](../requirements/product-questionnaire.md) | `src/features/viewer/Viewer.tsx`; `src/styles.css` | [FT-B01-002](../testing/fr-b01-results.md#ft-b01-002) | FR-B01採用、接続済みViewerのmode切替を実測 |
| FUT-C-034 | 高さフィット | 表示領域の高さに合わせる | Implemented | PASS | 希望 | FR-B01 | [FR-B01要件](../requirements/viewer-scale-requirements.md#req-fr-b01-001-共通scale-model); Q5-4 [questionnaire](../requirements/product-questionnaire.md) | `src/features/viewer/Viewer.tsx`; `src/styles.css` | [FT-B01-002](../testing/fr-b01-results.md#ft-b01-002) | FR-B01採用、接続済みViewerのmode切替を実測 |
| FUT-C-035 | 原寸表示 | 画像を原寸で表示する | Implemented | PASS | 希望 | FR-B01 | [FR-B01要件](../requirements/viewer-scale-requirements.md#req-fr-b01-001-共通scale-model); Q5-4 [questionnaire](../requirements/product-questionnaire.md) | `src/features/viewer/Viewer.tsx`; `src/styles.css` | [FT-B01-003](../testing/fr-b01-results.md#ft-b01-003) | FR-B01採用、page遷移時の原寸mode維持を実測 |
| FUT-C-036 | ズーム状態維持 | 作品・ページ移動後も倍率を維持する | Implemented | PASS | 希望 | FR-B01 | [FR-B01要件](../requirements/viewer-scale-requirements.md#req-fr-b01-003-状態維持); Q5-4 [questionnaire](../requirements/product-questionnaire.md) | `src/features/viewer/model.ts`; `src/features/viewer/Viewer.tsx`; `src/App.tsx` | [FT-B01-003](../testing/fr-b01-results.md#ft-b01-003) | FR-B01採用、page遷移と作品遷移へ接続 |
| FUT-C-037 | ルーペ | ポインタ周辺を拡大する | Implemented | PASS | 希望 | FR-B01 | [FR-B01要件](../requirements/viewer-scale-requirements.md#req-fr-b01-004-pointer周辺ルーペ); Q5-4補足 [questionnaire](../requirements/product-questionnaire.md) | `src/features/viewer/Viewer.tsx`; `src/features/viewer/model.ts`; `src/styles.css` | [FT-B01-004](../testing/fr-b01-results.md#ft-b01-004) | FR-B01採用、補足記述由来候補を採用要件化し境界を実測 |
| FUT-C-038 | 巻末動作設定・確認 | 確認後に次の巻を開く設定 | Implemented | PASS | 希望 | FR-B02 | [FR-B02要件](../requirements/end-of-volume-requirements.md#req-fr-b02-001-policy-interface); Q5-6 [questionnaire](../requirements/product-questionnaire.md) | `src/App.tsx`; `src/features/catalog/end-of-volume.ts` | [FT-B02-002](../testing/fr-b02-results.md#ft-b02-002) | C0採用、confirm_nextのdialog承認後だけ遷移 |
| FUT-C-039 | 巻末動作設定・一覧復帰 | 巻末でライブラリ画面へ戻る設定 | Implemented | PASS | 希望 | FR-B02 | [FR-B02要件](../requirements/end-of-volume-requirements.md#req-fr-b02-001-policy-interface); Q5-6 [questionnaire](../requirements/product-questionnaire.md) | `src/App.tsx`; `src/features/catalog/end-of-volume.ts`; `src-tauri/src/state/repository.rs` | [FT-B02-003](../testing/fr-b02-results.md#ft-b02-003) | C0採用、return_libraryで確定位置後に復帰 |
| FUT-C-040 | 巻末動作設定・停止 | 巻末で何もしない設定 | Implemented | PASS | 希望 | FR-B02 | [FR-B02要件](../requirements/end-of-volume-requirements.md#req-fr-b02-002-no-next-safety); Q5-6 [questionnaire](../requirements/product-questionnaire.md) | `src/App.tsx`; `src/features/catalog/end-of-volume.ts` | [FT-B02-004](../testing/fr-b02-results.md#ft-b02-004) | C0採用、stopとno-nextは現在巻末に安全停止 |
| FUT-C-041 | 巻末動作設定・ループ | 末尾から先頭へループする設定 | Implemented | PASS | 希望 | FR-B02 | [FR-B02要件](../requirements/end-of-volume-requirements.md#req-fr-b02-002-no-next-safety); Q5-6 [questionnaire](../requirements/product-questionnaire.md) | `src/App.tsx`; `src/features/catalog/end-of-volume.ts`; `src/features/catalog/sort.ts` | [FT-B02-005](../testing/fr-b02-results.md#ft-b02-005) | C0採用、次項目なし時だけsort済み先頭へloop |
| FUT-C-042 | ファイル・フォルダを開く | `Ctrl+O`のopen commandから対象を直接開く | Implemented | PASS | 将来 | FR-B14 | [P1〜P10要件](../requirements/roadmap-priorities-requirements.md#p2-opennavigation) | `src/App.tsx` | [FR-B14結果](../testing/fr-b14-results.md)（FT-B14-001） | 選択した登録root内のfolder/catalogまたはcomic/archive/viewerを開く |
| FUT-C-044 | 最近開いたファイルメニュー | 最近開いた対象をメニューから直接再openする | Implemented | PASS | 将来 | FR-B14 | [P1〜P10要件](../requirements/roadmap-priorities-requirements.md#p2-opennavigation) | `src/App.tsx` | [FR-B14結果](../testing/fr-b14-results.md)（FT-B14-002） | 成功したcomic/archive openを最大12件のapp session recent menuへ表示 |
| FUT-C-045 | ページしおり保存・一覧 | ページしおりを保存し、一覧から開く | Implemented | PASS | 将来 | FR-B15 | [P1〜P10要件](../requirements/roadmap-priorities-requirements.md#p3-しおり本棚) | `src/features/reading/collections.ts`; `src/features/viewer/Viewer.tsx`; `src/App.tsx` | [FR-B15結果](../testing/fr-b15-results.md)（FT-B15-001） | item/page key単位のlocal bookmarkを保存し、Viewerから現在pageへ接続 |
| FUT-C-046 | 次のしおりへ移動 | 現在位置より後の保存済みしおりへ順次移動する | Implemented | PASS | 将来 | FR-B15 | [P1〜P10要件](../requirements/roadmap-priorities-requirements.md#p3-しおり本棚) | `src/features/reading/collections.ts`; `src/features/viewer/Viewer.tsx` | [FR-B15結果](../testing/fr-b15-results.md)（FT-B15-002） | 後続bookmarkへ移動し、末尾では先頭へwrap |
| FUT-C-047 | 本棚表示・追加 | 専用の本棚contextを表示し、選択項目を登録する | Implemented | PASS | 将来 | FR-B15 | [P1〜P10要件](../requirements/roadmap-priorities-requirements.md#p3-しおり本棚) | `src/features/reading/collections.ts`; `src/App.tsx` | [FR-B15結果](../testing/fr-b15-results.md)（FT-B15-003） | favoriteとは別のapp-local bookshelfを表示・追加・除去 |
| FUT-C-049 | 項目プロパティ | 選択ファイル・フォルダのproperty dialogを表示する | Implemented | PASS | 将来 | FR-B13 | [P1〜P10要件](../requirements/roadmap-priorities-requirements.md#p1-catalog-command基盤) | `src/App.tsx`; `src/features/catalog/CatalogGrid.tsx` | [FR-B13結果](../testing/fr-b13-results.md)（FT-B13-004） | 単一選択のname/kind/relative path/size/更新日時を表示。原本へ書き込まない |
| FUT-C-050 | CSV形式で出力 | 現在の一覧または選択項目の情報をCSVへ保存する | Implemented | PASS | 将来 | FR-B16 | [P1〜P10要件](../requirements/roadmap-priorities-requirements.md#p4-filterexport) | `src/App.tsx`; `src/features/catalog/commands.ts` | [FR-B16結果](../testing/fr-b16-results.md)（FT-B16-002） | filtered catalogをname/kind/relativePath/size/modifiedのUTF-8 CSVへ出力。absolute pathを含めず、`=`/`+`/`-`/`@`/tab/CR先頭cellをapostropheで無害化 |
| FUT-C-051 | 終了メニュー | ファイルメニューからアプリを明示終了する | Implemented | PASS | 将来 | FR-B14 | [P1〜P10要件](../requirements/roadmap-priorities-requirements.md#p2-opennavigation) | `src/App.tsx` | [FR-B14結果](../testing/fr-b14-results.md)（FT-B14-004） | ファイルメニューからwindow closeを明示要求し、暗黙のfile mutationはしない |
| FUT-C-052 | 編集操作の元に戻す | 直前のundo可能な操作を`Ctrl+Z`で取り消す | Candidate | NOT TESTED | 将来 | 将来 | ユーザー提供Leeyes参照スクリーンショット（2026-08-09） | — | 未実装・未実測 | 参照画面では無効項目として観測。undo対象、履歴、安全境界は未決定 |
| FUT-C-053 | クリップボードのファイル操作 | 切り取り・コピー・貼り付けをclipboard経由で行う | Candidate | NOT TESTED | 将来 | 将来 | ユーザー提供Leeyes参照スクリーンショット（2026-08-09） | — | 未実装・未実測 | FUT-C-025/FUT-C-026の直接操作とはUI・clipboard境界が異なる。原本非破壊方針の再評価が必要 |
| FUT-C-054 | パスのコピー | 選択項目のpathまたは親フォルダpathをclipboardへコピーする | Implemented | PASS | 将来 | FR-B13 | [P1〜P10要件](../requirements/roadmap-priorities-requirements.md#p1-catalog-command基盤) | `src/App.tsx` | [FR-B13結果](../testing/fr-b13-results.md)（FT-B13-003） | 選択項目のlibrary-root相対pathを改行区切りでclipboardへ渡す |
| FUT-C-055 | 複数・種別選択 | 全選択、ファイルのみ、画像のみ、反転、解除を含む複数選択を行う | Implemented | PASS | 将来 | FR-B13 | [P1〜P10要件](../requirements/roadmap-priorities-requirements.md#p1-catalog-command基盤) | `src/App.tsx`; `src/features/catalog/CatalogGrid.tsx`; `src/features/catalog/commands.ts` | [FR-B13結果](../testing/fr-b13-results.md)（FT-B13-002） | 修飾キー範囲選択、全選択、画像選択、反転、解除を接続。file mutationは実装しない |
| FUT-C-056 | 履歴ドロップダウン移動 | 戻る・進むの履歴を開き、任意の過去位置へ直接移動する | Implemented | PASS | 将来 | FR-B14 | [P1〜P10要件](../requirements/roadmap-priorities-requirements.md#p2-opennavigation) | `src/App.tsx`; `src/features/navigation/navigation.ts` | [FR-B14結果](../testing/fr-b14-results.md)（FT-B14-003） | back/forward stackを履歴dropdownへ表示し選択pathへ移動 |
| FUT-C-057 | 現在場所の手動更新 | `F5`で現在の一覧を手動再読込する | Implemented | PASS | 将来 | FR-B13 | [P1〜P10要件](../requirements/roadmap-priorities-requirements.md#p1-catalog-command基盤) | `src/App.tsx`; `src/features/library/client.ts` | [FR-B13結果](../testing/fr-b13-results.md)（FT-B13-001） | F5とメニューから現在folderを再走査し、generationで古い応答を破棄する |
| FUT-C-058 | ファイルマスク | mask条件で一覧表示対象をfilterする | Implemented | PASS | 将来 | FR-B16 | [P1〜P10要件](../requirements/roadmap-priorities-requirements.md#p4-filterexport) | `src/App.tsx`; `src/features/catalog/commands.ts` | [FR-B16結果](../testing/fr-b16-results.md)（FT-B16-001） | current-sessionのbasename mask `*`/`?`/`;`で一覧とstatusをfilter |
| FUT-C-060 | 画像表示領域の分離 | viewerをcatalog shellから分離して独立表示する | Implemented | PASS | 将来 | FR-B18 | [P1〜P10要件](../requirements/roadmap-priorities-requirements.md#p6-workspacewindow) | `src/App.tsx`; `src/features/viewer/Viewer.tsx`; `src/styles.css` | [FR-B18結果](../testing/fr-b18-results.md)（FT-B18-003） | current-sessionの分離表示、ボタン復帰、Esc復帰を提供 |
| FUT-C-061 | タスクトレイ収納 | windowを閉じずにnotification areaへ収納・復帰する | Implemented | BLOCKED | 将来 | FR-B18 | [P1〜P10要件](../requirements/roadmap-priorities-requirements.md#p6-workspacewindow) | `src/App.tsx`; `src-tauri/src/tray.rs`; `src-tauri/src/lib.rs` | [FR-B18結果](../testing/fr-b18-results.md)（FT-B18-004） | native tray初期化、hide/show/unminimize/focus、明示終了のmock境界はPASS。release製品のnotification areaとprocess lifecycleは未測定 |
| FUT-C-062 | ペイン表示切替 | 対象paneを表示・非表示にする | Implemented | PASS | 将来 | FR-B18 | [P1〜P10要件](../requirements/roadmap-priorities-requirements.md#p6-workspacewindow) | `src/App.tsx`; `src/features/workspace/display.ts` | [FR-B18結果](../testing/fr-b18-results.md)（FT-B18-001） | folder treeをcurrent-sessionで切替し、UI復帰ボタンを提供 |
| FUT-C-063 | バー・メニュー表示切替 | 対象barとmenu barを表示・非表示にする | Implemented | PASS | 将来 | FR-B18 | [P1〜P10要件](../requirements/roadmap-priorities-requirements.md#p6-workspacewindow) | `src/App.tsx`; `src/features/workspace/display.ts`; `src/styles.css` | [FR-B18結果](../testing/fr-b18-results.md)（FT-B18-002） | menu/toolbarのgrid rowをcurrent-sessionで切替し、UI復帰導線を提供 |
| FUT-C-065 | 参照メニュー構成 | `ファイル/編集/表示/オプション/ヘルプ`へcommand、shortcut、separator、有効状態を整理する | Implemented | PASS | 将来 | FR-B17 | [P1〜P10要件](../requirements/roadmap-priorities-requirements.md#p5-参照shell-ui) | `src/App.tsx` | [FR-B17結果](../testing/fr-b17-results.md)（FT-B17-001） | top-level 5分類、Alt mnemonic、roving focusと既存command接続をfocused testで確認 |
| FUT-C-066 | アイコンコマンドツールバー | open、更新、context切替、検索、表示形式等をicon buttonから実行する | Implemented | BLOCKED | 将来 | FR-B17 | [P1〜P10要件](../requirements/roadmap-priorities-requirements.md#p5-参照shell-ui) | `src/App.tsx`; `src/styles.css` | [FR-B17結果](../testing/fr-b17-results.md)（FT-B17-002） | accessible icon toolbarと既存callbackへの接続は確認済み。release製品UIのicon別表示・操作は未測定 |
| FUT-C-067 | 参照型サムネイルタイル | folder iconと表紙を混在させた罫線付きtile、長名省略、密度を再現する | Implemented | BLOCKED | 将来 | FR-B17 | [P1〜P10要件](../requirements/roadmap-priorities-requirements.md#p5-参照shell-ui) | `src/features/catalog/view-mode.ts`; `src/features/catalog/CatalogGrid.tsx`; `src/styles.css` | [FR-B17結果](../testing/fr-b17-results.md)（FT-B17-003） | `reference_tile` mode、long name、thumbnail、keyboard focusを接続。release DPI visualと製品再起動後の同mode復元は未測定 |
| FUT-C-068 | 現在位置付きステータス | 選択情報に加えて現在位置と総file数を`n / total`形式で表示する | Implemented | PASS | 将来 | FR-B13 | [P1〜P10要件](../requirements/roadmap-priorities-requirements.md#p1-catalog-command基盤) | `src/App.tsx` | [FR-B13結果](../testing/fr-b13-results.md)（FT-B13-005） | 現在sort結果の選択index、件数、選択数をstatusへ表示 |
| FUT-C-069 | 統合設定画面 | application設定を一か所で確認・変更する | Implemented | PASS | 将来 | FR-B19 | [P1〜P10要件](../requirements/roadmap-priorities-requirements.md#p7-help) | `src/App.tsx` | [FR-B19結果](../testing/fr-b19-results.md)（FT-B19-001） | exact5の一部として、catalog/viewer/巻末/gesture/shortcutのdraft、Cancel、atomic Applyと保存失敗rollbackを直接観測 |
| FUT-C-071 | 設定プロファイル | 設定一式を保存・読み込み・複数profileから切り替える | Implemented | PASS | 将来 | FR-B19 | [P1〜P10要件](../requirements/roadmap-priorities-requirements.md#p7-help) | `src/features/settings/profile.ts`; `src/App.tsx` | [FR-B19結果](../testing/fr-b19-results.md)（FT-B19-002） | exact5の一部として、`profileVersion === 1`、全enum/boolean/有限scale、必須workspace field、shortcut/gesture conflictをstrict validation |
| FUT-C-072 | マウスジェスチャ設定 | mouse操作またはgestureへcommandを割り当てる | Implemented | PASS | 将来 | FR-B19 | [P1〜P10要件](../requirements/roadmap-priorities-requirements.md#p7-help) | `src/features/settings/profile.ts`; `src/features/viewer/Viewer.tsx`; `src/App.tsx` | [FR-B19結果](../testing/fr-b19-results.md)（FT-B19-003） | exact5の一部として、設定したswipe/double-clickからviewer commandへの接続とcloseを直接観測 |
| FUT-C-073 | サムネイル管理 | user向けのthumbnail管理dialogを提供する | Implemented | BLOCKED | 将来 | FR-B20 | [P1〜P10要件](../requirements/roadmap-priorities-requirements.md#p10-thumbnail保守) | `src/features/catalog/thumbnail-maintenance.ts`; `src/App.tsx`; `src/styles.css` | [FR-B20結果](../testing/fr-b20-results.md)（FT-B20-001） | 件数・bytes・削除とapp-local分離はfocused testで確認。製品dialog操作と再起動後の保持は未測定 |
| FUT-C-074 | 表示中サムネイルの保存 | 現在表示中のthumbnailを明示保存する | Implemented | BLOCKED | 将来 | FR-B20 | [P1〜P10要件](../requirements/roadmap-priorities-requirements.md#p10-thumbnail保守) | `src/features/catalog/thumbnail-maintenance.ts`; `src/App.tsx` | [FR-B20結果](../testing/fr-b20-results.md)（FT-B20-002） | picker helperのwrite/close、取消、fallbackはPASS。製品WebView2から選択先への実JPEG保存は未測定 |
| FUT-C-075 | サムネイルの一括読込 | 複数対象のthumbnailを一括で読み込む | Implemented | BLOCKED | 将来 | FR-B20 | [P1〜P10要件](../requirements/roadmap-priorities-requirements.md#p10-thumbnail保守) | `src/features/catalog/thumbnail-maintenance.ts`; `src/features/catalog/thumbnail-maintenance.test.ts`; `src/App.tsx` | [FR-B20結果](../testing/fr-b20-results.md)（FT-B20-003） | JPEG validation、一意対応、重複・容量境界はPASS。製品file pickerからの一括読込操作は未測定 |
| FUT-C-076 | 一般ヘルプ | 操作体系と主要機能を説明するhelp contentsを表示する | Implemented | PASS | 将来 | FR-B19 | [P1〜P10要件](../requirements/roadmap-priorities-requirements.md#p7-help) | `src/App.tsx` | [FR-B19結果](../testing/fr-b19-results.md)（FT-B19-004） | exact5の一部として、Help menuからoffline一般help本文を表示する導線を直接観測 |
| FUT-C-077 | バージョン情報 | About情報を表示する | Implemented | PASS | 将来 | FR-B19 | [P1〜P10要件](../requirements/roadmap-priorities-requirements.md#p7-help) | `package.json`; `src/App.tsx`; `src/features/settings/profile.ts` | [FR-B19結果](../testing/fr-b19-results.md)（FT-B19-005） | exact5の一部として、package正本のversion、runtime、offline license noticeを直接観測 |
| FUT-R-001 | クラウド同期 | 外部同期 | Rejected | NOT TESTED | 非採用 | — | [MVP対象外](../requirements/mvp-requirements.md); Q8-3 [questionnaire](../requirements/product-questionnaire.md) | — | 未実装・未実測 | 外部送信禁止の恒久方針。方針変更時のみ再評価 |
| FUT-R-002 | 外部書誌情報 | 外部サービスからの情報取得 | Rejected | NOT TESTED | 非採用 | — | [MVP対象外](../requirements/mvp-requirements.md); Q6-3 [questionnaire](../requirements/product-questionnaire.md) | — | 未実装・未実測 | ファイル名・フォルダ名のみを使う方針 |
| FUT-R-003 | 外部データ送信 | 利用状況等の送信 | Rejected | NOT TESTED | 非採用 | — | [MVP対象外](../requirements/mvp-requirements.md); Q8-3 [questionnaire](../requirements/product-questionnaire.md) | — | 未実装・未実測 | いかなるデータも外部送信しない方針 |
| FUT-R-004 | 閲覧履歴 | 閲覧履歴の管理 | Implemented | PASS | 未定 | FR-B07 | [FR-B07要件](../requirements/reading-metadata-requirements.md#req-fr-b07-002-成功した閲覧のhistory); Q6-1 [questionnaire](../requirements/product-questionnaire.md) | `src/App.tsx`; `src/features/library/client.ts`; `src-tauri/src/application/mod.rs`; `src-tauri/src/state/repository.rs`; `src/App.fr-b07.test.tsx`; `scripts/run-product-ui-harness.ps1` | [FR-B07結果](../testing/fr-b07-results.md)（FT-B07-002、Rust history契約、Windows WebView2 `FT-B07-007`、canonical aggregate PASS） | release製品でsuccess-only・identity dedup・決定順序・restart復元を実測。library原本差分0、cleanup、Windows-native CoDD exit 0・red 0。構造advisoryは生値を開示し、機能PASSへ加算しない。後続ratingも完了し、FR-B07 aggregateはDone。 |
| FUT-R-005 | 評価 | 評価情報の管理 | Implemented | PASS | 未定 | FR-B07 | [FR-B07要件](../requirements/reading-metadata-requirements.md#req-fr-b07-003-rating); Q6-1 [questionnaire](../requirements/product-questionnaire.md) | `src/App.tsx`; `src/features/library/client.ts`; `src-tauri/src/application/mod.rs`; `src-tauri/src/state/repository.rs`; `src/App.fr-b07.test.tsx`; `scripts/run-product-ui-harness.ps1` | [FR-B07結果](../testing/fr-b07-results.md)（FT-B07-003、Rust rating契約、Windows WebView2 `FT-B07-008`、canonical aggregate PASS） | release製品で1保存・5更新・restart復元・unset・viewer再openを実測。library原本差分0、cleanup、Windows-native CoDD exit 0・red 0。構造advisoryは生値を開示し、機能PASSへ加算しない。 |
| FUT-R-006 | タッチ操作 | タッチ入力 | Candidate | NOT TESTED | 未定 | FR-B11 | [FR-B11要件](../requirements/input-customization-requirements.md#fr-b11-入力拡張要件); Q5-5 [questionnaire](../requirements/product-questionnaire.md); [MVP対象外](../requirements/mvp-requirements.md) | — | [FR-B11結果](../testing/fr-b11-results.md)（FT-B11-002 `BLOCKED_UNMEASURED`） | touch実機がないため未測定。PASS/SKIPへ加算せず、候補を恒久Rejectedへ昇格しない。 |
| FUT-R-007 | ゲームパッド操作 | ゲームパッド入力 | Candidate | NOT TESTED | 未定 | FR-B11 | [FR-B11要件](../requirements/input-customization-requirements.md#fr-b11-入力拡張要件); Q5-5 [questionnaire](../requirements/product-questionnaire.md); [MVP対象外](../requirements/mvp-requirements.md) | — | [FR-B11結果](../testing/fr-b11-results.md)（FT-B11-003 `BLOCKED_UNMEASURED`） | gamepad実機がないため未測定。PASS/SKIPへ加算せず、候補を恒久Rejectedへ昇格しない。 |
| FUT-R-008 | 閲覧時の原本自動変更 | 原本への自動書込み | Rejected | NOT TESTED | 非採用 | — | Q7-2/Q8-4 [questionnaire](../requirements/product-questionnaire.md); [MVP対象外](../requirements/mvp-requirements.md) | — | 未実装・未実測 | 読取専用・原本非破壊の恒久方針。方針変更時のみ再評価 |

## P1〜P10 集約判定（2026-08-10）

この集約表の受入判定`PARTIAL`と`BLOCKED_UNMEASURED`は、複数の原子機能をまとめた
roadmap判定である。上の11列台帳にある原子機能の検証状態4値とは混在させず、未測定の製品gateを
component testのPASSへ読み替えない。

| 優先順位 | Batch | 対象ID | 実装集約 | 受入集約 | 根拠・未測定境界 |
|---|---|---|---|---|---|
| P1 | FR-B13 | FUT-C-057, 055, 054, 049, 068 | Implemented | PASS | FT-B13-001〜005を直接観測 |
| P2 | FR-B14 | FUT-C-042, 044, 056, 051 | Implemented | PASS | FT-B14-001〜004を直接観測 |
| P3 | FR-B15 | FUT-C-045〜047 | Implemented | PASS | FT-B15-001〜003を直接観測 |
| P4 | FR-B16 | FUT-C-058, 050 | Implemented | PASS | maskとCSVを直接観測。CSV formula-leading cellの無害化を含む |
| P5 | FR-B17 | FUT-C-065〜067 | Implemented | PARTIAL | component/focused testはPASS。release DPI、製品UI、`reference_tile`の製品再起動復元は未測定 |
| P6 | FR-B18 | FUT-C-062, 063, 060, 061 | Implemented | BLOCKED | workspace/viewerとnative tray実装・mockはPASS。release製品のnotification area、hide/show/focus、process lifecycleは未測定 |
| P7 | FR-B19 | FUT-C-069, 071, 072, 076, 077 | Implemented | PASS | 現行のFT-B19-001〜005 exact5は5 PASS / 0 FAIL |
| P8 | FR-B08 | FUT-C-006〜008 | Partial | BLOCKED_UNMEASURED | GIF/AVIF構造testとanimated GIF disk cache拒否はPASS。release WebView2 decode/animation/corrupt fallbackは未測定 |
| P9 | FR-B12 | FUT-C-001, 002 | Partial | BLOCKED | 分類と安全なUnsupportedFormat境界はPASS。reader dependency/license/fixture承認待ち |
| P10 | FR-B20 | FUT-C-073〜075 | Implemented | PARTIAL | utility/helper testはPASS。製品WebView2での実JPEG保存とfile picker一括読込は未測定 |

## Leeyes参照画面差分（2026-08-09）

本節は、ユーザー提供のLeeyes参照スクリーンショット6枚を一次入力として、画面から直接
読み取れる項目とComic Explorerの差を登録した監査記録である。1枚目はmain window、
2〜6枚目は順にfile、edit、view、option、help menuを示す。開かれていないsubmenuの内容や、
無効項目の発動条件は推測で確定しない。現行機能と差異の列はP1〜P10実装後の状態へ同期した。

現行アプリは登録library root配下を非破壊で閲覧する構成であり、OS全体を対象にしたfile
managerではない。参照型5分類menu、複数・種別選択、library内folder treeの可逆表示を実装したが、
OS namespaceを含むtreeと原本変更commandは提供しない（`src/App.tsx`、
`src/features/catalog/CatalogGrid.tsx`、`src/features/navigation/FolderTree.tsx`）。したがって、
原本を変更する候補は採用済み要件REQ-MVP-017を自動的に上書きせず、採用時に安全境界を明示して再評価する。

### 基準UIと現行UIの差

| 参照画面での直接観測 | 現行機能 | 未実装または差異 | 追跡ID |
|---|---|---|---|
| `ファイル/編集/表示/オプション/ヘルプ`のmenu bar | 同じtop-level 5分類へ既存commandを整理 | component/focused PASS。release DPIと製品UIの外観は未測定 | FUT-C-065 |
| icon中心のtoolbar、戻る・進むのdropdown、folder/bookcase/search切替 | accessible icon toolbar、履歴dropdown、folder/bookshelf/search contextを実装 | toolbarのrelease製品UIは未測定 | FUT-C-056, FUT-C-066 |
| label、path入力、右端の実行buttonを持つaddress bar | path入力、`移動`実行button、履歴移動を実装済み | 基本機能はREQ-MVP-004で実装済み。buttonのicon、配置、toolbarとの統合が異なる | REQ-MVP-004, FUT-C-066 |
| folder treeとpane close button | 登録library内tree、splitter、可逆pane表示切替を実装 | release製品UIのpane操作は未測定 | REQ-MVP-003, FUT-C-062 |
| folder iconと表紙を混在表示する罫線付きthumbnail grid | `reference_tile`を既存catalog/thumbnailへ接続 | long name/focusのcomponent testはPASS。release DPI visualは未測定 | REQ-MVP-005, REQ-MVP-006, FUT-C-012〜014, FUT-C-067 |
| 選択情報と`現在位置 / 総file数`を示すstatus bar | sort/filter後の選択index、総件数、選択数を表示 | P1のfocused testでPASS | FUT-C-068 |

### メニュー機能の対応差

| 参照menu | 参照画面での直接観測 | 現行との差 | 追跡ID |
|---|---|---|---|
| ファイル | 開く、指定動作で開く、最近開いたfile | open commandとrecent menuは実装済み。指定動作submenuだけは仕様未決定 | FUT-C-042〜044, FUT-R-004 |
| ファイル | しおりを開く、次のしおり、しおりを保存 | app-local page bookmarkの保存・一覧open・next/wrapを実装 | REQ-MVP-015, FUT-C-045, FUT-C-046 |
| ファイル | 本棚に追加 | favoriteと分離したapp-local bookshelfの表示・追加・除去を実装 | FUT-C-011, FUT-C-021, FUT-C-047 |
| ファイル | 削除、名前変更、folder作成 | 未実装候補として既に登録済み。削除がごみ箱か完全削除かは画面だけでは未確定 | FUT-C-024, FUT-C-027〜029 |
| ファイル | property、CSV出力、終了 | property、相対path限定・formula無害化CSV、明示終了を実装 | FUT-C-049〜051 |
| 編集 | undo、cut、copy、paste | move/copy候補はあるが、undoとOS clipboard操作はない | FUT-C-025, FUT-C-026, FUT-C-052, FUT-C-053 |
| 編集 | folderへcopy、folderへmove | 既存の未実装候補に対応 | FUT-C-025, FUT-C-026 |
| 編集 | pathをcopy、親folder pathをcopy | library-root相対pathのclipboard出力を実装。OS absolute pathは出力しない | FUT-C-054 |
| 編集 | 全選択、fileのみ、imageのみ、選択反転、解除 | 複数・範囲・種別・反転・解除を既存catalogへ接続 | FUT-C-055 |
| 表示 | folder、本棚、検索context | folder、本棚、名前検索は実装済み | REQ-MVP-002, FUT-C-010, FUT-C-047 |
| 表示 | 移動、最新情報へ更新 | 履歴dropdown移動とF5/manual refreshを実装 | REQ-MVP-004, FUT-C-056, FUT-C-057 |
| 表示 | file表示形式、並び順 | 既存3形式に`reference_tile`を追加し、4 field昇降順と5分類menuへ接続 | REQ-MVP-007, FUT-C-012〜014, FUT-C-065, FUT-C-067 |
| 表示 | file mask | basename maskを実装 | FUT-C-010, FUT-C-058 |
| 表示 | image表示分離、task tray収納 | viewer分離とnative tray commandを実装。実notification areaの製品gateは未測定 | FUT-C-060, FUT-C-061 |
| 表示 | pane、bar、menuの表示切替 | tree、menu、toolbarのcurrent-session可逆切替を実装 | FUT-C-062, FUT-C-063 |
| オプション | 設定 | atomic Apply/Cancel付き統合設定を実装 | FUT-C-069 |
| オプション | 設定の保存、読込、切替 | strict schemaのJSON profile export/importと切替を実装 | FUT-C-071 |
| オプション | key customize、mouse gesture | shortcutとmouse gestureを統合設定へ接続し、競合を拒否 | FUT-C-019, FUT-C-065, FUT-C-072 |
| オプション | thumbnail管理、表示中thumbnail保存、一括読込 | user向け管理UIとhelperを実装。製品での実保存・一括読込は未測定 | REQ-MVP-006, FUT-C-073〜075 |
| ヘルプ | 一般help、version情報 | offline一般helpとversion/runtime/license noticeを実装し、FT-B19-004/005でPASS | FUT-C-076, FUT-C-077 |

上表の既存IDは重複登録せず、差分だけを`FUT-C-042`〜`FUT-C-077`へ原子化した。
その後に採用したP1〜P10の対象は実装・実測へ同期し、対象外のCandidateは未決定のまま保持する。
現在の採用・検証判定は11列台帳とP1〜P10集約表を正本とする。

## FR-B07 受入証跡

IMP-006のmemo、IMP-007のhistory、IMP-008のratingをそれぞれWindows release WebView2で原子的に完了した。
`FT-B07-008`はrating 1保存・5更新・製品restart後の5復元・unset・viewer再openとlibrary source tree差分0を
直接観測した。3機能のWindows-native canonical aggregateは全stage exit 0であり、FR-B07は
`Done`である。CoDDの構造advisoryは生値として開示し、機能PASSへ加算しない。詳細なrun IDとSHAは
[FR-B07結果](../testing/fr-b07-results.md)を正本とする。

## FR-B08 受入証跡

IMP-015で`FUT-C-005`を`Implemented / PASS`へ更新した。Windows release WebView2
`FT-B08-006`はfolder、ZIP、CBZのstatic lossy/lossless/alpha WebPをenumerateし、thumbnail cacheと
viewer decode、corrupt/animatedの局所errorから次page・他comicへの復帰、library source tree差分0を直接観測した。
P8の`FUT-C-006`〜`FUT-C-008`はGIF/AVIFのclassification、MIME、構造parserをpage pipelineへ接続済みで、
animated GIFはmetadataで識別してapp-local disk thumbnail cacheを拒否する。focused Rust testはPASSしたが、
release WebView2のstatic GIF/animation GIF/AVIF decodeとcorrupt fallbackは未測定である。このためP8 aggregateは
`Partial / BLOCKED_UNMEASURED`とする。static WebPのrun ID、release/SBOM binding、CoDD advisoryは
[FR-B08結果](../testing/fr-b08-results.md)、P8の測定境界は[FR-B08 P8結果](../testing/fr-b08-p8-results.md)を正本とする。

### cmd_400 履歴

2026-08-09のsuite監査後はfrontendを接続4件、Rustを契約5件の正本とする。以下の
frontend exact5と各SHAは2026-08-03時点のaccepted rawであり、現行test件数へ読み替えない。

当時は実装根拠と機能rawを受理したが、CoDDの構造的未完了とWindows WebView2 product gateの未実測が
残ったため、FR-B07および対象3行を `Partial / BLOCKED` とした。accepted rawは不変SHA参照であり、
frontend、App回帰、Rust、typecheck、build、CoDDの再実行は行っていない。

accepted evidence rootは、frontend exact5・typecheck・buildが
`queue/reports/evidence/cmd_400/fr_b07_node_fs_type_final_resume`、App回帰が
`queue/reports/evidence/cmd_400/fr_b07_production_open_seam_semantic_redo`、Rust exact5/fullが
`queue/reports/evidence/cmd_400/fr_b07_rustfmt_final_resume`である。frontend exact5はsource SHA
`f7031d69365005301961896db87da20ace8b9c5086531c6ad7501e9b68aa9c83`に束縛されている。

| Gate | 実測状態 | exit / 件数 / SKIP | manifest SHA-256 | stdout SHA-256 | stderr SHA-256 |
|---|---|---|---|---|---|
| frontend focused | ACCEPTED immutable reference | 0 / FT-B07-001〜005 exact5、5 PASS、0 FAIL、0 SKIP、duplicate 0 | `e8b2f80dc8a888d6b1d30d77a92de91a37924666d70ae6b0ab1ce41acb5f96e5` | `fa650fbaf4ff41c316ece825d4eb854c158ac34186792fb7b108e082bc50c82c` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| App regression | ACCEPTED immutable reference | 0 / 1 file、39 PASS、0 FAIL、0 SKIP、direct web adapter calls 0 | `61e315c69353832f1c5bd0d3654946ef00f9e3282c50b0ca34ea44589ec9ef22` | `08a87b125f0e0a53a0bd2e2c716e6f758e344ff6b1906c2bbc244c725354c840` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| Windows offline Rust focused | PASS | 0 / FR-B07 exact5、5 PASS、0 failed、0 ignored、0 SKIP | `cfda35406b78a9f54b9802e778742662bd8e52cb84db23949891f1e6a1b89233` | `183e3903947eb258abe21709870766315345cf246b5b78479fed95e509303a10` | `ae905bcf7333addf0b0de89c426235ed167ef5e4292bd2cf66e3430236751265` |
| Windows offline Rust canonical wrapper | PASS | 0 / 66 unit + 1 process、67 PASS、0 failed、0 ignored、0 SKIP | `8570b03c8b8906d4f7a4abc80ddb0f62e2169aacbcdc42aa1ef2b9ce35813a36` | `d61c8d92af8474b90aa2d4aa39adbc8f0f1b383e025a4d7b2306be3128c2312c` | `ada375b0eba1d9560e9bfaf926b522177d4d257295c7aeea8c15d4f8ce3f4734` |
| typecheck | PASS | 0 / executed、SKIP 0 | `f9e29543ebc74c92a00c457eec8d972600407e264670331143f4a09153b0948d` | `d2297a8e6a87dc32114bcda90f5c007ec0f1b287e38f677de0314e929ea78294` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| build | PASS | 0 / executed、SKIP 0 | `54fccdea2a0a31370659e48ad9d605bcf45c7a560e8c8a35c1cbe9b8edd97954` | `5145cd83897a30cbd37916d882fffa259f125353c0115cf3d3a3b774d733eedc` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| CoDD scan | PASS process / raw accepted from restoration gate | 0 / 58 nodes、120 edges、SKIP 0 | `d5b843479ee8a5635bd6aa92678144b67813c6f87c1141177f61d2dec2554384` | `428e31b7481958f2c90a66a3d8ed04b4a681834a9f886951e20db732106f9fc4` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| CoDD check | PASS process / raw accepted from restoration gate | 0 / red gate failures 0、advisory 4、SKIP 0 | `a1cf36608fe80076dce202252b0dbd6387f1b717711afb914a635ed32681de6f` | `0c264281dd7e2b56db04817e83ebe28b851f000b8f4e643f62348967f59715b7` | `ff63d03aa6cd827fa8efdda2b33e28428e263010bce88bd89b3a9b8bae719b37` |
| CoDD verify | INCOMPLETE / NOT APPLICABLE（非PASS） | 0 / 3 DAG SKIP、1 task_completion VACUOUS、verification tests 0 PASS/0 FAIL/0 SKIP/0 total | `93f6aeef90bfacde5a7f1f76eddbbdb1510dc83adb7f97fd3739069acb7685a6` | `a316eb93fd73616896c371b3debd777400e5a77db2ff97366f4b8461f6f4231c` | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

FT-B07-002はproduction `open_comic`に接続したopen-history seamで、成功したcurrent-generation・非空
openだけを一行記録し、failed、empty、cancelledは0行とする境界、historyの決定順序、重複0を受理した。
FT-B07-005は実一時original/library fixtureのmetadata・history・rating・reading-position操作前後を
byte/SHA snapshotし、original、library、`library.index`の差分0を受理した。Rust exact5は
`fr_b07_memo_crud_clear_and_reopen`、`fr_b07_history_deterministic_order_and_dedup`、
`fr_b07_rating_boundaries_and_invalid_rejection`、`fr_b07_v2_migration_preserves_old_values_and_is_idempotent`、
`fr_b07_reading_position_separation_survives_metadata_crud` である。

CoDD verifyの生値は `3 PASS / 0 red FAIL / 1 amber WARN / 3 SKIP / 1 VACUOUS`、verification tests 0で
あり、3 SKIP（`deployment_completeness`、`user_journey_coherence`、`environment_coverage`）と1
VACUOUS（`task_completion`）はPASSへ加算しない。cmd_400当時のWindows WebView2 native product UIと
OS syscallの完全観測は `UNMEASURED / BLOCKED` であり、local evidenceで代替しなかった。memoの
WebView2境界はIMP-006で解消済みだが、history/ratingとOS syscall完全観測へ波及させない。

cmd_400当時の最終worktreeは11-path product diff、draft contamination 0、staged path 0、
`git diff --check PASS`であり、四文書以外の7機能pathはbyte不変として保全した。当時の
commit/pushは行っておらず、この履歴をIMP-006の差分・publish状態へ読み替えない。

受理済み機能rawと復旧後CoDD rawの出典は [FR-B07結果](../testing/fr-b07-results.md) に集約する。

## FR-B10 受入証跡

IMP-005でWindows release WebView2の`FT-B10-005`と現行canonical aggregateを完了したため、
`FUT-C-022`は`Implemented / PASS`である。以下のcmd_400証跡は、focused/Rust契約と当時のblocked理由を
保存する履歴であり、現在のproduct gate状態を表さない。

### cmd_400 履歴

FR-B10の実装とconnected semantic gateは受理済みである。focused exact4は4 PASS / 0 FAIL / 0 SKIP、
App回帰は39 PASS / 0 FAIL / 0 SKIP、Windows offline Rustは78 unit + 1 process PASS / failed 0 /
ignored 0 / SKIP 0、typecheck/buildはPASSである。最終focused source SHAは
`6ee91612e6710ff20d97795110306324a14e584c8c9149ce18ffb90da1bc61ff`、repository source SHAは
`dc56457520e18ed7b1e7a56e9257ee7e1d7a41417eadadf64d93ef5d88386913`である。

accepted evidenceは[FR-B10結果](../testing/fr-b10-results.md)の不変ledgerに集約する。focused exact4・
typecheck・buildは`queue/reports/evidence/cmd_400/fr_b10_byrole_exact_typing_resume/`、App回帰は
`queue/reports/evidence/cmd_400/fr_b10_canonical_downstream_gates/`、Rustは
`queue/reports/evidence/cmd_400/fr_b10_schema_v4_migration_repair/`を参照し、今回これらを再実行していない。
App回帰は変更されていない`src/App.test.tsx`のSHA `1b23b6de8eff500101da99a480d39b604d24538e3ecfd5c9cceeaf71be4197ba`
に束縛されたrawを再利用した。

FT-B10-001はstable identity付きassign/removeと冪等性、FT-B10-002はquery・Unicode・empty queryのlocal-only
挙動、FT-B10-003はrename・duplicate merge・invalid拒否、FT-B10-004はv1→v2→v3→v4 migration・reopen/
restart persistence・原本/sidecar差分0を受理した。migrationは各versionを一段ずつtransactionで進め、v4で
`tags`、`item_tags`、query indexを追加する。

Feature Lane fallback、selector、migration、typingのrejected rootsは受入PASSへ昇格させず履歴として保持する。
CoDDは承認済み`queue/reports/evidence/cmd_400/fr_b07_reject_codd_draft_restore_gate/`のrawを参照する。
verifyの生値は`3 PASS / 0 red FAIL / 1 amber WARN / 3 SKIP / 1 VACUOUS`、verification tests 0であり、
`INCOMPLETE / NOT APPLICABLE`としてPASS数へ加算しない。例外は三つの構造的SKIPだけで、functional testの
SKIPを免除しない。当時のWindows WebView2 native product UIとOS syscallは`UNMEASURED / BLOCKED`だった。
WebView2 product UIはIMP-005で解消済みであり、OS syscall完全観測はFR-B10単体の完了根拠へ加算しない。
初回FAIL、selector、migration、typingのrejected rootsは結果文書で履歴のみとして開示する。

cmd_400当時の最終project diffは機能/test 6 path + 本四文書4 path = exact 10、contamination 0、
staged path 0、`git diff --check PASS`だった。当時はcommit/pushを行っていない。この履歴を現在の
IMP-005差分やpublish状態へ読み替えない。

## FR-B11 最終受入証跡（cmd_400）

FR-B11はkeyboard入力の三契約（FT-B11-001、FT-B11-004、FT-B11-005）をsemantic ACCEPTする。
touch（FT-B11-002）とgamepad（FT-B11-003）は実機観測ができず `BLOCKED_UNMEASURED` とし、PASS/SKIPへ
加算しない。したがってFR-B11全体と台帳上の実装済み部分は `Partial / BLOCKED` である。

accepted evidenceの詳細なmanifest、source SHA、stdout/stderr SHA、却下履歴、CoDD境界は
[FR-B11結果](../testing/fr-b11-results.md)に集約する。今回の文書同期ではfunctional test、App回帰、
Windows Rust、typecheck、build、CoDDを再実行していない。

最終の機能/test 8 pathは、`src-tauri/src/application/mod.rs`、`src-tauri/src/lib.rs`、
`src-tauri/src/state/repository.rs`、`src/App.tsx`、`src/features/library/client.ts`、
`src/features/viewer/Viewer.tsx`、`src/features/input/shortcuts.ts`、
`src/App.fr-b11.test.tsx`である。四文書を加えたexact 12 pathだけを今回の最終差分境界とし、
false C0、rustfmt、E0382、TS2322の旧rootはaccepted PASS証跡へ混入させない。commit/pushは行わず、
Gunshiのcomplete diff QCを待つ。

## 正本運用規則

1. 今後の機能状態を変更するときは、先に本台帳の該当行と根拠文書を更新し、実装pathと
   直接観測case/statusを突合する。本台帳以外のMVP文書は削除せず、完成時点の要件・設計・
   受入証跡として参照する。
2. `Implemented` は実装pathが存在し、対象機能の直接観測証跡がPASSのときだけ付与する。
   一部PASS、未測定、外部環境待ちは `Partial` と `BLOCKED` のまま保持する。
3. 将来候補は一次根拠を記録し、アンケートの未選択や複合記述の原子化から導いた行には
   「推論由来」「未決定性」を備考へ明記する。MVP対象外だからと一律 `Rejected` にしない。
4. `Rejected` は外部送信・外部取得・原本自動変更のように、要件で明示された恒久方針に
   限定する。再評価には方針変更と新しい根拠を必要とする。
5. 更新後は `./.venv/bin/codd scan`、`./.venv/bin/codd check` を実行し、実行可能コードや
   テストに影響する変更時だけ `./.venv/bin/codd verify` も実行する。`codd/scan/` の生成物は追跡しない。
6. 機械検査では、11列、ID重複0、実装・検証enumの許可値、相対リンクの存在、実装pathの
   存在、`Implemented` と直接PASS証跡の対応、`git diff --check`、担当ファイル以外の差分境界を確認する。

## Phase 6の歴史スナップショット

現在の台帳行数やMVP完了判定を、テストケース数から固定値で導出してはならない。参考として、
2026-07-30 JST時点の [Phase 6個別テストケース結果](../testing/phase6-case-results.md) は、
`source: docs/testing/phase6-case-results.md`、`scope: Phase 6`、`PASS: 60`、`FAIL: 0`、
`BLOCKED: 12`、`NOT RUN: 0`、`total: 72` の歴史スナップショットである。これは日付付きの
完成時点証跡である。一方、承認済み [テストケース仕様](../testing/test-cases.md) は73件で、
`TC-NFR-006-001`（NFR-MVP-006-AC6、Blocked）のPhase 6結果行が欠落している。この差分は
正本テスト結果へ推測で追加せず、本台帳のNFR-MVP-006を `Partial/BLOCKED` に保持し、
仕様caseを未実行・未収載として明示することで解決する。現在の各行の状態は必ず個別caseと
実装根拠から判定し、未収載caseをPASSへ繰り上げない。
