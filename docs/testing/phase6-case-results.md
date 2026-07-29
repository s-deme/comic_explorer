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

- 実行日時: 2026-07-29 20:05 JST
- 環境: Windows 11 hostのMSVC Rust toolchain、WSL2上のNode/Python
- Rust: `cmd.exe /c 'E:\script\comic_explorer\scripts\run-rust-check.cmd'`
  （35件PASS）
- React: `TMPDIR=/tmp TEMP=/tmp TMP=/tmp npm test`（22件PASS。
  10,000項目でmounted gridcell 100以下を含む）
- Python: `.venv/bin/python -m unittest discover -s tests -p 'test_*.py'`
  （7件PASS）
- build: `npm run build`（PASS）
- fixture: `.venv/bin/python tests/fixtures/validate_fixtures.py
  tests/fixtures/generated`（64 files / 11 fixtures、PASS）
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
| TC-CT-001 | NOT RUN | 列挙portのsuccess/refusalは試験済みだが消失/cancel契約全体は未実行 |
| TC-CT-002 | NOT RUN | WIC decoder port未実装 |
| TC-CT-003 | NOT RUN | archive list/openは試験済みだがcancel契約を未実行 |
| TC-CT-004 | NOT RUN | thumbnail生成port未実装 |
| TC-CT-005 | PASS | `repository::settings_and_reading_position_survive_reopen` |
| TC-CT-006 | NOT RUN | API構造とgenerationはunit済みだがUI-backend success/error/cancel一式を未実行 |
| TC-CT-007 | PASS | `cache::atomic_cache_write_lookup_and_lru_respect_pins` |

## Integration / Security

| ID | 結果 | 自動テスト／理由 |
| --- | --- | --- |
| TC-INT-001 | PASS | generated folder fixtureの再帰列挙・順序・表紙をRust fixture testで実行 |
| TC-INT-002 | PASS | Stored/Deflate ZIP/CBZをRust archive/fixture testsで実行 |
| TC-INT-003 | PASS | 同一manifestをfolder/ZIP/CBZに適用するfixture test |
| TC-INT-004 | PASS | cache atomic write後のlookup hitを実行 |
| TC-INT-005 | NOT RUN | stale検出unitのみで再生成cacheとの統合は未実行 |
| TC-INT-006 | NOT RUN | 破損画像後のviewer前後移動integrationを未実行 |
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
| TC-UI-002 | NOT RUN | 仮想tree componentはPASSだが深さ違いを含む製品UI一式を未実行 |
| TC-UI-003 | NOT RUN | tree/address/list同期の製品UI試験を未実行 |
| TC-UI-004 | NOT RUN | 履歴・直接入力・越境拒否の製品UI試験を未実行 |
| TC-UI-005 | NOT RUN | grid unitはPASSだが長名/status/全到達の製品UI試験を未実行 |
| TC-UI-006 | NOT RUN | thumbnail生成未実装 |
| TC-UI-007 | NOT RUN | sort unitはPASSだが製品UI再起動復元を未実行 |
| TC-UI-008 | NOT RUN | viewerを含む一覧context復帰試験を未実行 |
| TC-UI-009 | NOT RUN | 実画像寸法を用いたfit/100%上限試験を未実行 |
| TC-UI-010 | NOT RUN | model unitのみで製品UI再起動復元を未実行 |
| TC-UI-011 | NOT RUN | model unitのみで製品UI画像表示を未実行 |
| TC-UI-012 | NOT RUN | 読み方向の製品UI再起動復元を未実行 |
| TC-UI-013 | NOT RUN | key/click/wheelの同一page統合試験を未実行 |
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
| PASS | 30 |
| FAIL | 0 |
| BLOCKED | 11 |
| NOT RUN | 31 |
| **合計** | **72** |

BLOCKED 11件の必要環境、実行手順、監視方法、期待結果、証跡、後処理は
`docs/testing/phase6-manual-procedures.md`に記載した。
