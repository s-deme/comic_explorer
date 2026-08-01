---
codd:
  node_id: "product:feature-status"
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
| FUT-C-001 | RAR・CBR書庫閲覧 | RAR・CBR対応 | Candidate | NOT TESTED | 将来 | 将来 | Q3-1 [questionnaire](../requirements/product-questionnaire.md); [MVP対象外](../requirements/mvp-requirements.md) | — | 未実装・未実測 | library/license確認が必要 |
| FUT-C-002 | 7z書庫閲覧 | 7z対応 | Candidate | NOT TESTED | 将来 | 将来 | Q3-1 [questionnaire](../requirements/product-questionnaire.md); [MVP対象外](../requirements/mvp-requirements.md) | — | 未実装・未実測 | library/license確認が必要 |
| FUT-C-003 | PDF閲覧 | PDF対応 | Candidate | NOT TESTED | 将来 | 将来 | Q3-1 [questionnaire](../requirements/product-questionnaire.md); [MVP対象外](../requirements/mvp-requirements.md) | — | 未実装・未実測 | MVP後に再検討 |
| FUT-C-004 | EPUB閲覧 | EPUB対応 | Candidate | NOT TESTED | 将来 | 将来 | Q3-1 [questionnaire](../requirements/product-questionnaire.md); [MVP対象外](../requirements/mvp-requirements.md) | — | 未実装・未実測 | MVP後に再検討 |
| FUT-C-005 | WebPページ表示 | WebP対応 | Candidate | NOT TESTED | 希望 | 将来 | Q3-2 [questionnaire](../requirements/product-questionnaire.md) | — | 未実装・未実測 | — |
| FUT-C-006 | 静止GIF表示 | 静止GIF対応 | Candidate | NOT TESTED | 希望 | 将来 | Q3-2 [questionnaire](../requirements/product-questionnaire.md) | — | 未実装・未実測 | MVP本文はアニメGIFのみ対象外とするため、静止GIFは推論由来候補 |
| FUT-C-007 | アニメーションGIF表示 | アニメGIF対応 | Candidate | NOT TESTED | 希望 | 将来 | Q3-2 [questionnaire](../requirements/product-questionnaire.md); [MVP対象外](../requirements/mvp-requirements.md) | — | 未実装・未実測 | — |
| FUT-C-008 | AVIFページ表示 | AVIF対応 | Candidate | NOT TESTED | 将来 | 将来 | Q3-2 [questionnaire](../requirements/product-questionnaire.md); [MVP対象外](../requirements/mvp-requirements.md) | — | 未実装・未実測 | — |
| FUT-C-009 | 動画対応 | 動画ファイル閲覧 | Candidate | NOT TESTED | 将来 | 将来 | Q3-2 [questionnaire](../requirements/product-questionnaire.md); [MVP対象外](../requirements/mvp-requirements.md) | — | 未実装・未実測 | — |
| FUT-C-010 | 名前検索 | ファイル名・フォルダ名検索 | Candidate | NOT TESTED | 希望 | 将来 | Q4-1/Q4-4 [questionnaire](../requirements/product-questionnaire.md); [MVP対象外](../requirements/mvp-requirements.md) | — | 未実装・未実測 | UIはMVP対象外。NFR-MVP-002-AC4の性能受入はFUT-D-001で分離。推論由来・未決定 |
| FUT-C-011 | お気に入り・クイックアクセス | 任意項目への短縮アクセス | Candidate | NOT TESTED | 希望 | 将来 | Q4-1 [questionnaire](../requirements/product-questionnaire.md) | — | 未実装・未実測 | — |
| FUT-C-012 | 小サムネイル | 表示形式切替 | Candidate | NOT TESTED | MVP後 | 将来 | Q4-2 [questionnaire](../requirements/product-questionnaire.md); [MVP対象外](../requirements/mvp-requirements.md) | — | 未実装・未実測 | — |
| FUT-C-013 | 詳細リスト | 表示形式切替 | Candidate | NOT TESTED | MVP後 | 将来 | Q4-2 [questionnaire](../requirements/product-questionnaire.md); [MVP対象外](../requirements/mvp-requirements.md) | — | 未実装・未実測 | — |
| FUT-C-014 | 表紙付きリスト | 表示形式切替 | Candidate | NOT TESTED | MVP後 | 将来 | Q4-2 [questionnaire](../requirements/product-questionnaire.md); [MVP対象外](../requirements/mvp-requirements.md) | — | 未実装・未実測 | — |
| FUT-C-015 | 縦スクロール | 閲覧方式切替 | Candidate | NOT TESTED | 希望 | 将来 | Q5-1 [questionnaire](../requirements/product-questionnaire.md); [MVP対象外](../requirements/mvp-requirements.md) | — | 未実装・未実測 | — |
| FUT-C-016 | 横スクロール | 閲覧方式切替 | Candidate | NOT TESTED | 希望 | 将来 | Q5-1 [questionnaire](../requirements/product-questionnaire.md); [MVP対象外](../requirements/mvp-requirements.md) | — | 未実装・未実測 | — |
| FUT-C-017 | フルスクリーン | 全画面閲覧 | Candidate | NOT TESTED | 希望 | 将来 | Q5-1 [questionnaire](../requirements/product-questionnaire.md); [MVP対象外](../requirements/mvp-requirements.md) | — | 未実装・未実測 | — |
| FUT-C-018 | 任意倍率ズーム | 任意倍率で拡大・縮小 | Implemented | PASS | 希望 | FR-B01 | [FR-B01要件](../requirements/viewer-scale-requirements.md#req-fr-b01-002-任意倍率の境界); Q5-4 [questionnaire](../requirements/product-questionnaire.md) | `src/features/viewer/model.ts`; `src/features/viewer/Viewer.tsx` | [FT-B01-001](../testing/fr-b01-results.md#ft-b01-001) | FR-B01採用、25%〜400%を0.1倍刻みで実測 |
| FUT-C-019 | ユーザー定義ショートカット | 操作割当変更 | Candidate | NOT TESTED | 希望 | 将来 | Q5-5 [questionnaire](../requirements/product-questionnaire.md); [MVP対象外](../requirements/mvp-requirements.md) | — | 未実装・未実測 | — |
| FUT-C-020 | 巻末動作設定・自動遷移 | 自動的に次の巻を開く設定 | Implemented | PASS | 希望 | FR-B02 | [FR-B02要件](../requirements/end-of-volume-requirements.md#req-fr-b02-001-policy-interface); Q5-6 [questionnaire](../requirements/product-questionnaire.md) | `src/App.tsx`; `src/features/catalog/end-of-volume.ts`; `src-tauri/src/application/mod.rs` | [FT-B02-001](../testing/fr-b02-results.md#ft-b02-001) | C0採用、既定値auto_nextでREQ-MVP-016互換 |
| FUT-C-021 | お気に入り保存 | お気に入り永続化 | Candidate | NOT TESTED | 希望 | 将来 | Q6-1 [questionnaire](../requirements/product-questionnaire.md); [MVP対象外](../requirements/mvp-requirements.md) | — | 未実装・未実測 | — |
| FUT-C-022 | タグ付与・検索 | タグ管理 | Candidate | NOT TESTED | 将来 | 将来 | Q6-1 [questionnaire](../requirements/product-questionnaire.md); [MVP対象外](../requirements/mvp-requirements.md) | — | 未実装・未実測 | — |
| FUT-C-023 | メモ保存 | メモ管理 | Candidate | NOT TESTED | 将来 | 将来 | Q6-1 [questionnaire](../requirements/product-questionnaire.md); [MVP対象外](../requirements/mvp-requirements.md) | — | 未実装・未実測 | — |
| FUT-C-024 | 名前変更 | ファイル名変更 | Candidate | NOT TESTED | 将来 | 将来 | Q7-2 [questionnaire](../requirements/product-questionnaire.md) | — | 未実装・未実測 | ユーザー明示操作が前提 |
| FUT-C-025 | 移動 | ファイル移動 | Candidate | NOT TESTED | 将来 | 将来 | Q7-2 [questionnaire](../requirements/product-questionnaire.md) | — | 未実装・未実測 | ユーザー明示操作が前提 |
| FUT-C-026 | コピー | ファイルコピー | Candidate | NOT TESTED | 将来 | 将来 | Q7-2 [questionnaire](../requirements/product-questionnaire.md) | — | 未実装・未実測 | ユーザー明示操作が前提 |
| FUT-C-027 | 新規フォルダ | フォルダ作成 | Candidate | NOT TESTED | 将来 | 将来 | Q7-2 [questionnaire](../requirements/product-questionnaire.md) | — | 未実装・未実測 | ユーザー明示操作が前提 |
| FUT-C-028 | ごみ箱移動 | 確認付き削除 | Candidate | NOT TESTED | 将来 | 将来 | Q7-2 [questionnaire](../requirements/product-questionnaire.md) | — | 未実装・未実測 | 確認必須。ユーザー明示操作が前提 |
| FUT-C-029 | 完全削除 | 二段階確認付き削除 | Candidate | NOT TESTED | 将来 | 将来 | Q7-2/TBD-007 [questionnaire](../requirements/product-questionnaire.md) | — | 未実装・未実測 | TBD-007はMVP対象外。安全設計を再評価 |
| FUT-C-030 | ファイル変更検出 | 自動監視 | Candidate | NOT TESTED | MVP後 | 将来 | Q7-1 [questionnaire](../requirements/product-questionnaire.md); [MVP対象外](../requirements/mvp-requirements.md) | — | 未実装・未実測 | — |
| FUT-C-031 | 重複作品検出 | 重複判定 | Candidate | NOT TESTED | MVP後 | 将来 | Q7-1 [questionnaire](../requirements/product-questionnaire.md); [MVP対象外](../requirements/mvp-requirements.md) | — | 未実装・未実測 | — |
| FUT-C-032 | 壊れた書庫検出 | 事前検出 | Candidate | NOT TESTED | MVP後 | 将来 | Q7-1 [questionnaire](../requirements/product-questionnaire.md); [MVP対象外](../requirements/mvp-requirements.md) | — | 未実装・未実測 | — |
| FUT-C-033 | 横幅フィット | 表示領域の横幅に合わせる | Implemented | PASS | 希望 | FR-B01 | [FR-B01要件](../requirements/viewer-scale-requirements.md#req-fr-b01-001-共通scale-model); Q5-4 [questionnaire](../requirements/product-questionnaire.md) | `src/features/viewer/Viewer.tsx`; `src/styles.css` | [FT-B01-002](../testing/fr-b01-results.md#ft-b01-002) | FR-B01採用、接続済みViewerのmode切替を実測 |
| FUT-C-034 | 高さフィット | 表示領域の高さに合わせる | Implemented | PASS | 希望 | FR-B01 | [FR-B01要件](../requirements/viewer-scale-requirements.md#req-fr-b01-001-共通scale-model); Q5-4 [questionnaire](../requirements/product-questionnaire.md) | `src/features/viewer/Viewer.tsx`; `src/styles.css` | [FT-B01-002](../testing/fr-b01-results.md#ft-b01-002) | FR-B01採用、接続済みViewerのmode切替を実測 |
| FUT-C-035 | 原寸表示 | 画像を原寸で表示する | Implemented | PASS | 希望 | FR-B01 | [FR-B01要件](../requirements/viewer-scale-requirements.md#req-fr-b01-001-共通scale-model); Q5-4 [questionnaire](../requirements/product-questionnaire.md) | `src/features/viewer/Viewer.tsx`; `src/styles.css` | [FT-B01-003](../testing/fr-b01-results.md#ft-b01-003) | FR-B01採用、page遷移時の原寸mode維持を実測 |
| FUT-C-036 | ズーム状態維持 | 作品・ページ移動後も倍率を維持する | Implemented | PASS | 希望 | FR-B01 | [FR-B01要件](../requirements/viewer-scale-requirements.md#req-fr-b01-003-状態維持); Q5-4 [questionnaire](../requirements/product-questionnaire.md) | `src/features/viewer/model.ts`; `src/features/viewer/Viewer.tsx`; `src/App.tsx` | [FT-B01-003](../testing/fr-b01-results.md#ft-b01-003) | FR-B01採用、page遷移と作品遷移へ接続 |
| FUT-C-037 | ルーペ | ポインタ周辺を拡大する | Implemented | PASS | 希望 | FR-B01 | [FR-B01要件](../requirements/viewer-scale-requirements.md#req-fr-b01-004-pointer周辺ルーペ); Q5-4補足 [questionnaire](../requirements/product-questionnaire.md) | `src/features/viewer/Viewer.tsx`; `src/features/viewer/model.ts`; `src/styles.css` | [FT-B01-004](../testing/fr-b01-results.md#ft-b01-004) | FR-B01採用、補足記述由来候補を採用要件化し境界を実測 |
| FUT-C-038 | 巻末動作設定・確認 | 確認後に次の巻を開く設定 | Implemented | PASS | 希望 | FR-B02 | [FR-B02要件](../requirements/end-of-volume-requirements.md#req-fr-b02-001-policy-interface); Q5-6 [questionnaire](../requirements/product-questionnaire.md) | `src/App.tsx`; `src/features/catalog/end-of-volume.ts` | [FT-B02-002](../testing/fr-b02-results.md#ft-b02-002) | C0採用、confirm_nextのdialog承認後だけ遷移 |
| FUT-C-039 | 巻末動作設定・一覧復帰 | 巻末でライブラリ画面へ戻る設定 | Implemented | PASS | 希望 | FR-B02 | [FR-B02要件](../requirements/end-of-volume-requirements.md#req-fr-b02-001-policy-interface); Q5-6 [questionnaire](../requirements/product-questionnaire.md) | `src/App.tsx`; `src/features/catalog/end-of-volume.ts`; `src-tauri/src/state/repository.rs` | [FT-B02-003](../testing/fr-b02-results.md#ft-b02-003) | C0採用、return_libraryで確定位置後に復帰 |
| FUT-C-040 | 巻末動作設定・停止 | 巻末で何もしない設定 | Implemented | PASS | 希望 | FR-B02 | [FR-B02要件](../requirements/end-of-volume-requirements.md#req-fr-b02-002-no-next-safety); Q5-6 [questionnaire](../requirements/product-questionnaire.md) | `src/App.tsx`; `src/features/catalog/end-of-volume.ts` | [FT-B02-004](../testing/fr-b02-results.md#ft-b02-004) | C0採用、stopとno-nextは現在巻末に安全停止 |
| FUT-C-041 | 巻末動作設定・ループ | 末尾から先頭へループする設定 | Implemented | PASS | 希望 | FR-B02 | [FR-B02要件](../requirements/end-of-volume-requirements.md#req-fr-b02-002-no-next-safety); Q5-6 [questionnaire](../requirements/product-questionnaire.md) | `src/App.tsx`; `src/features/catalog/end-of-volume.ts`; `src/features/catalog/sort.ts` | [FT-B02-005](../testing/fr-b02-results.md#ft-b02-005) | C0採用、次項目なし時だけsort済み先頭へloop |
| FUT-D-001 | 名前検索性能 | 10,000項目を1秒以内に検索 | Deferred | NOT TESTED | Should | 将来 | [NFR](../requirements/mvp-requirements.md#nfr-mvp-002-性能目標); Q4-1/Q4-4 [questionnaire](../requirements/product-questionnaire.md) | — | 未実装・未実測 | 検索UIがMVP対象外のため保留。機能候補FUT-C-010と分離 |
| FUT-D-002 | 最大ファイルサイズ | 1冊あたりの上限条件 | Deferred | NOT TESTED | 未定 | TBD | Q8-1/TBD [questionnaire](../requirements/product-questionnaire.md) | — | 未実装・未実測 | 未定記入のため未決定性を保持 |
| FUT-D-003 | 性能計測条件の適用 | 基準条件での性能測定を確定・実行 | Deferred | NOT TESTED | 未定 | TBD | Q8-2/TBD-006 [questionnaire](../requirements/product-questionnaire.md); [性能計画](../testing/performance-benchmark-plan.md) | — | 未実装・未実測 | TBD-006で計画は承認済み。Windows実測が未完了で、初期回答の未決定性も注記 |
| FUT-D-004 | 作品別表示設定 | 作品単位の設定保存 | Deferred | NOT TESTED | 未定 | TBD | Q6-1/TBD [questionnaire](../requirements/product-questionnaire.md) | — | 未実装・未実測 | Q6-1未選択から導いた推論由来候補。優先度未決定 |
| FUT-D-005 | 読書状態ラベル | 未読・読書中・読了の管理 | Deferred | NOT TESTED | 未定 | TBD | Q6-1 [questionnaire](../requirements/product-questionnaire.md) | — | 未実装・未実測 | Q6-1未選択で優先度未決定。読書位置REQ-MVP-015とは別機能 |
| FUT-R-001 | クラウド同期 | 外部同期 | Rejected | NOT TESTED | 非採用 | — | [MVP対象外](../requirements/mvp-requirements.md); Q8-3 [questionnaire](../requirements/product-questionnaire.md) | — | 未実装・未実測 | 外部送信禁止の恒久方針。方針変更時のみ再評価 |
| FUT-R-002 | 外部書誌情報 | 外部サービスからの情報取得 | Rejected | NOT TESTED | 非採用 | — | [MVP対象外](../requirements/mvp-requirements.md); Q6-3 [questionnaire](../requirements/product-questionnaire.md) | — | 未実装・未実測 | ファイル名・フォルダ名のみを使う方針 |
| FUT-R-003 | 外部データ送信 | 利用状況等の送信 | Rejected | NOT TESTED | 非採用 | — | [MVP対象外](../requirements/mvp-requirements.md); Q8-3 [questionnaire](../requirements/product-questionnaire.md) | — | 未実装・未実測 | いかなるデータも外部送信しない方針 |
| FUT-R-004 | 閲覧履歴 | 閲覧履歴の管理 | Candidate | NOT TESTED | 未定 | 将来 | Q6-1 [questionnaire](../requirements/product-questionnaire.md); [MVP対象外](../requirements/mvp-requirements.md) | — | 未実装・未実測 | 未選択だがMVP対象外。恒久拒否とはせず候補として保持 |
| FUT-R-005 | 評価 | 評価情報の管理 | Candidate | NOT TESTED | 未定 | 将来 | Q6-1 [questionnaire](../requirements/product-questionnaire.md); [MVP対象外](../requirements/mvp-requirements.md) | — | 未実装・未実測 | 未選択だがMVP対象外。恒久拒否とはせず候補として保持 |
| FUT-R-006 | タッチ操作 | タッチ入力 | Candidate | NOT TESTED | 未定 | 将来 | Q5-5 [questionnaire](../requirements/product-questionnaire.md); [MVP対象外](../requirements/mvp-requirements.md) | — | 未実装・未実測 | 未選択だがMVP対象外。恒久拒否とはせず候補として保持 |
| FUT-R-007 | ゲームパッド操作 | ゲームパッド入力 | Candidate | NOT TESTED | 未定 | 将来 | Q5-5 [questionnaire](../requirements/product-questionnaire.md); [MVP対象外](../requirements/mvp-requirements.md) | — | 未実装・未実測 | 未選択だがMVP対象外。恒久拒否とはせず候補として保持 |
| FUT-R-008 | 閲覧時の原本自動変更 | 原本への自動書込み | Rejected | NOT TESTED | 非採用 | — | Q7-2/Q8-4 [questionnaire](../requirements/product-questionnaire.md); [MVP対象外](../requirements/mvp-requirements.md) | — | 未実装・未実測 | 読取専用・原本非破壊の恒久方針。方針変更時のみ再評価 |

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
