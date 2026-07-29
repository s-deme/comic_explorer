---
codd:
  node_id: "test:phase6-case-results"
  type: test
  status: active
  confidence: 0.92
  depends_on:
    - id: "test:test-cases"
      relation: "executes"
      semantic: "behavioral"
    - id: "test:phase6-verification-results"
      relation: "refines"
      semantic: "governance"
---

# Phase 6 個別テストケース実行結果

## 実行条件

- 実行日時: 2026-07-30 JST
- 環境: Windows 11 hostのMSVC Rust toolchain、WSL2上のNode/Python
- Rust: `cmd.exe /c 'E:\script\comic_explorer\scripts\run-rust-check.cmd'`
  （52 unit + 1 product-process integration PASS。実binary shutdown、位置復元、
  cancel/token失効/queue拒否、app-data renameによるhandle closeを含む）
- React: `TMPDIR=/tmp TEMP=/tmp TMP=/tmp npm test`（26件PASS。
  10,000項目でmounted gridcell 100以下を含む）
- Python: `.venv/bin/python -m unittest discover -s tests -p 'test_*.py'`
  （7件PASS）
- build: `npm run build`（PASS）
- fixture: `.venv/bin/python tests/fixtures/validate_fixtures.py
  tests/fixtures/generated`（68 files / 11 fixtures、PASS）
- 判定規則: ケースの期待結果全体を直接観測した場合だけPASSとする。部分的なunit
  testしかないケースはNOT RUN、指定された外部Windows/隔離環境がないケースは
  BLOCKEDとする。自動test suiteがPASSでも対応ケースを推測でPASSへ繰り上げない。

## Unit

| ID | 結果 | 自動テスト／理由 |
| --- | --- | --- |
| TC-UT-001 | PASS | `natural_sort::compares_digit_runs_by_numeric_value` |
| TC-UT-002 | PASS | `file_kind::supported_extensions_are_ascii_case_insensitive` |
| TC-UT-003 | PASS | `path::normalizes_separators_without_making_an_absolute_path`、`rejects_root_escape_and_absolute_forms` |
| TC-UT-004 | PASS | `folder::catalog_metadata_distinguishes_zip_and_cbz_and_omits_folder_size`、ReactのEnter/Ctrl+Enter分岐 |
| TC-UT-005 | PASS | `fixture_tests::generated_folder_and_archives_have_the_manifest_page_order` |
| TC-UT-006 | PASS | `viewer page model > shows landscape and final odd pages alone` |
| TC-UT-007 | PASS | reading position 2 tests |
| TC-UT-008 | PASS | `viewer page model > keeps the leading page when mode or direction changes` |
| TC-UT-009 | PASS | `catalog sorting > keeps missing...`、`orders folder...` |
| TC-UT-010 | PASS | `catalog sorting > selects only the next readable item in the established list order` |
| TC-UT-011 | PASS | `domain::id::tests::folder_and_archive_item_and_page_identities_do_not_collide`。製品page ID生成にもscoped identityを接続 |
| TC-UT-012 | PASS | `folder::refuses_a_directory_outside_the_canonical_root`、path unit |
| TC-UT-013 | PASS | `archive::rejects_unsafe_entry_names` |
| TC-UT-014 | PASS | `fingerprint::size_mtime_and_archive_detail_participate_in_staleness` |
| TC-UT-015 | PASS | `natural_sort::numeric_ties_use_original_utf16_ordinal_order` |
| TC-UT-016 | PASS | `natural_sort::does_not_normalize_unicode` |

## Contract

| ID | 結果 | 自動テスト／理由 |
| --- | --- | --- |
| TC-CT-001 | PASS | 製品`list_folder`と同じcancellable portで実folder success、missing分類、root越境拒否、事前cancelの`CANCELLED`を実行 |
| TC-CT-002 | PASS | WICの実JPEG/PNG decode、寸法、resizeに加え、製品`load_page`と同じpage adapterで破損PNGの`CORRUPT_IMAGE`、対象relative path、次の正常page成功を観測 |
| TC-CT-003 | PASS | 製品`open_comic`と同じcancellable portで実CBZ entry、corrupt/encrypted/unsupported/unsafe分類、事前cancelの`CANCELLED`、非展開を実行 |
| TC-CT-004 | PASS | 実WIC/cache pipelineの生成画像・content/page identity・miss/hit・原本差分0に加え、接続済みpriority workerでcancel後の未開始job破棄と100世代中最新だけのcommitを実行 |
| TC-CT-005 | PASS | `repository::settings_and_reading_position_survive_reopen` |
| TC-CT-006 | PASS | `application_boundary_preserves_context_and_rejects_stale_real_results`で実混在fixture列挙→分類data、実missing→分類error、完了済み旧generation→cancelを製品response組立てまで接続し、request ID/generationを観測。React側の`isCurrentResponse`でも旧generation拒否を実行 |
| TC-CT-007 | PASS | `cache::atomic_cache_write_lookup_and_lru_respect_pins` |

## Integration / Security

| ID | 結果 | 自動テスト／理由 |
| --- | --- | --- |
| TC-INT-001 | PASS | generated folder fixtureの再帰列挙・順序・表紙をRust fixture testで実行 |
| TC-INT-002 | PASS | Stored/Deflate ZIP/CBZをRust archive/fixture testsで実行 |
| TC-INT-003 | PASS | 同一manifestをfolder/ZIP/CBZに適用するfixture test |
| TC-INT-004 | PASS | cache atomic write後のlookup hitを実行 |
| TC-INT-005 | PASS | `real_folder_cover_generates_then_hits_atomic_cache_and_negative_cache_expires`で実fileの表紙を差し替え、旧content hash/pathをhitせずWIC再生成したcacheを返すことを実行 |
| TC-INT-006 | PASS | 試験専用漫画folderへ破損PNGと正常PNGを複製し、製品列挙順の先頭だけが対象付き局所error、次pageが正常byteを返すことを同一page adapterで実行 |
| TC-INT-007 | PASS | corrupt/encrypted archive分類と他fixture継続をRust fixture testで実行 |
| TC-INT-008 | PASS | SQLite保存・reopenと相対page維持を実行 |
| TC-INT-009 | PASS | `mixed_library_fixture_classifies_every_entry_without_promoting_unsupported_files`とReact Enter/Ctrl+Enter分岐で混在root全分類・操作分離を実行 |
| TC-INT-010 | PASS | 実装済み全read経路を同一fixture treeのbefore/after snapshotで囲み、path/種別/size/mtime/content/ZIP entry一覧の差分0、library配下のDB/cache/temp/log 0件を実測 |
| TC-INT-011 | PASS | `one_hundred_navigation_tasks_commit_only_the_latest_generation`。実Tokio task/cancel token/commit gateで旧99 generationのcommit 0を観測 |
| TC-INT-012 | PASS | `repository::corrupt_database_is_isolated_in_recovery` |
| TC-SEC-001 | PASS | unsafe entry拒否、非展開archive API、fixture差分なしをRust testsで実行 |
| TC-SEC-002 | BLOCKED | 単一開発hostでは独立したOSレベルDNS/TCP/UDP監視環境がない |

## UI / E2E / Error

| ID | 結果 | 未実行・阻害理由 |
| --- | --- | --- |
| TC-UI-001 | NOT RUN | picker/backend/componentは個別PASSだがWindows UIで登録→再起動を未実行 |
| TC-UI-002 | PASS | release WebView2 CDP harnessでroot→folder-a→childの深さ違いを実file adapter経由で移動し、treeの遅延展開と一覧を観測 |
| TC-UI-003 | PASS | 製品UIでfolder-a選択後、treeitem `aria-selected`、address絶対path、child一覧が同じcurrent folderへ同期 |
| TC-UI-004 | PASS | 製品UIでback/forward/up/直接絶対pathを順に実行し、root外`C:\outside-library`をerror panelで拒否、rootを越えないことを観測 |
| TC-UI-005 | PASS | 125実項目で長名title、総件数・選択名status、末尾scroll到達、先頭復帰、mounted gridcell 100以下、選択状態をrelease WebView2で観測 |
| TC-UI-006 | PASS | `run-product-ui-harness.ps1`がrelease製品WebView2をCDP自動運転し、同じ2 slotでcold生成画像の実decode、再起動後cache hit、破損ZIPのnegative/error placeholder、操作継続、原本hash差分0を観測 |
| TC-UI-007 | NOT RUN | release製品UIで4条件controlは連続操作済みだが、昇降順ごとの全順序と正常終了後の再起動復元を未観測 |
| TC-UI-008 | NOT RUN | viewerを含む一覧context復帰試験を未実行 |
| TC-UI-009 | NOT RUN | 実画像寸法を用いたfit/100%上限試験を未実行 |
| TC-UI-010 | PASS | release WebView2で初回単page、見開き最大2page、切替時の先頭page維持を観測し、製品再起動後も見開きmodeと保存page 3/3を復元 |
| TC-UI-011 | PASS | release WebView2で横長pageが単独、3page目の奇数末尾が単独となり、PageUpで直前の見開きへ可逆に戻ることを観測 |
| TC-UI-012 | PASS | release WebView2で初回右読み、左読みに切替後のpage領域click/ArrowRight反転を観測し、製品再起動後も左読みを復元 |
| TC-UI-013 | PASS | release WebView2でPageUp/Down、矢印、page領域click、wheelが同じpage列を移動し、Esc後に選択項目へfocusが復元することを観測 |
| TC-UI-014 | NOT RUN | 次漫画遷移の製品UI試験を未実行 |
| TC-E2E-001 | NOT RUN | install済み製品の登録→閲覧→再起動E2E harness未整備 |
| TC-E2E-002 | NOT RUN | 製品閲覧を囲む原本snapshot E2E harness未整備 |
| TC-E2E-003 | NOT RUN | 巻末次漫画E2E harness未整備 |
| TC-E2E-004 | NOT RUN | offline E2E harness未整備。OS通信監視部分はTC-SEC-002でBLOCKED |
| TC-ERR-001 | NOT RUN | root拒否/消失/retry/reselectの製品UI試験を未実行 |
| TC-ERR-002 | NOT RUN | tree局所error componentはPASSだが製品ACL統合を未実行 |
| TC-ERR-003 | NOT RUN | 破損画像viewer回復を未実行 |
| TC-ERR-004 | NOT RUN | 異常書庫backend分類はPASSだが製品UI回復を未実行 |
| TC-ERR-005 | NOT RUN | 7分類を連続注入する製品UI試験を未実行 |

## Performance / Accessibility / Distribution

| ID | 結果 | 未実行・阻害理由 |
| --- | --- | --- |
| TC-PERF-001 | BLOCKED | Windows製品UIの基準PC・cold/warm測定環境が必要 |
| TC-PERF-002 | BLOCKED | Windows製品UIの10,000項目scroll/working set測定が必要。DOM上限unitのみPASS |
| TC-PERF-003 | BLOCKED | Windows製品UIの300page連続閲覧測定が必要 |
| TC-PERF-004 | BLOCKED | clean Windows環境でcold TTI計測が必要 |
| TC-PERF-005 | BLOCKED | Windows製品UIでwarm一覧ready計測が必要 |
| TC-PERF-006 | BLOCKED | Windows製品UIでpage switch 100回計測が必要 |
| TC-A11Y-001 | NOT RUN | help focus componentはPASSだがkeyboard-only全行程を未実行 |
| TC-A11Y-002 | BLOCKED | Windows UIA inspector/screen reader環境が必要 |
| TC-A11Y-003 | BLOCKED | Windows high contrastと100/150/200% DPI環境が必要 |
| TC-DIST-001 | PASS | npm/Cargoのdirect/transitive 665 componentをlockfile/Cargo metadataから監査し、unknown/禁止license 0件。SBOM/notice同期check PASS |
| TC-DIST-002 | BLOCKED | Windows 10 22H2と別Windows 11 clean VMが必要 |
| TC-DIST-003 | BLOCKED | clean VMでuninstall時のuser-data保持/明示削除確認が必要 |

## 集計

| 結果 | 件数 |
| --- | ---: |
| PASS | 42 |
| FAIL | 0 |
| BLOCKED | 11 |
| NOT RUN | 19 |
| **合計** | **72** |

BLOCKED 11件の必要環境、実行手順、監視方法、期待結果、証跡、後処理は
`docs/testing/phase6-manual-procedures.md`に記載した。
