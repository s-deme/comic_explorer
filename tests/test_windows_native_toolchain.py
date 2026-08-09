from __future__ import annotations

import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class WindowsNativeToolchainTests(unittest.TestCase):
    def test_power_shell_runners_default_to_the_windows_venv(self) -> None:
        runner_paths = (
            ROOT / "scripts/run-codd-windows.ps1",
            ROOT / "scripts/run-codd-consistency-windows.ps1",
            ROOT / "scripts/run-tests-windows.ps1",
        )

        for runner in runner_paths:
            with self.subTest(runner=runner.name):
                source = runner.read_text(encoding="utf-8")
                self.assertIn('$VenvPath = ".venv-windows"', source)
                self.assertNotIn('$VenvPath = ".venv",', source)

    def test_release_and_rust_wrappers_share_the_toolchain_entry(self) -> None:
        for name in ("build-release-exe.cmd", "run-rust-check.cmd"):
            with self.subTest(runner=name):
                source = (ROOT / "scripts" / name).read_text(encoding="utf-8")
                self.assertIn("invoke-windows-toolchain.ps1", source)
                self.assertIn("exit /b %RESULT%", source)
                self.assertNotIn("%USERPROFILE%", source)
                self.assertNotIn("Python312", source)
                self.assertNotIn("Visual Studio\\2022", source)

        bootstrap = (ROOT / "scripts/windows-toolchain.ps1").read_text(
            encoding="utf-8"
        )
        for extension in (".COM", ".EXE", ".BAT", ".CMD"):
            self.assertIn(extension, bootstrap)

    def test_feature_runner_has_feature_aliases_and_failure_json(self) -> None:
        source = (ROOT / "scripts/verify-feature-windows.ps1").read_text(
            encoding="utf-8"
        )
        for feature in (
            "imp-004",
            "fut-c-019",
            "shortcutonly",
            "imp-005",
            "fut-c-022",
            "tagsonly",
            "imp-006",
            "fut-c-023",
            "memoonly",
            "imp-007",
            "fut-r-004",
            "historyonly",
            "imp-008",
            "fut-r-005",
            "ratingonly",
            "imp-012",
            "fut-c-010",
            "searchonly",
            "imp-013",
            "fut-c-011",
            "quickaccessonly",
            "imp-014",
            "fut-c-021",
            "favoritepersistenceonly",
            "imp-015",
            "fut-c-005",
            "webponly",
        ):
            self.assertIn(f'"{feature}"', source)
        for field in (
            "failedStage",
            "exitCode",
            "startedAt",
            "finishedAt",
            "durationSeconds",
            "totalSeconds",
        ):
            self.assertIn(field, source)

        task_runner = (ROOT / "scripts/invoke-windows-toolchain.ps1").read_text(
            encoding="utf-8"
        )
        self.assertIn('$exception.Data["ExitCode"] = $ExitCode', task_runner)
        self.assertIn('$exitCode = [int]$_.Exception.Data["ExitCode"]', task_runner)
        self.assertIn('[string]$FrontendTest = "src\\App.fr-b11.test.tsx"', task_runner)
        self.assertIn('[string]$FrontendTestName = ""', task_runner)
        self.assertIn('[int]$ExpectedFrontendPasses = 1', task_runner)
        self.assertIn('[string]$RustFilter = "shortcut"', task_runner)
        self.assertIn('if (![string]::IsNullOrWhiteSpace($FrontendTestName))', task_runner)
        self.assertIn(
            '$vitestArguments += @(\"-t\", $FrontendTestName, \"--reporter=json\")',
            task_runner,
        )
        self.assertIn("$summary.numPassedTests -ne $ExpectedFrontendPasses", task_runner)
        self.assertIn("$summary.numFailedTests -ne 0", task_runner)
        self.assertIn('"-FrontendTest", $frontendTest', source)
        self.assertIn('"-FrontendTestName", $frontendTestName', source)
        self.assertIn('"-ExpectedFrontendPasses", $expectedFrontendPasses', source)
        self.assertIn('"-RustFilter", $rustFilter', source)
        self.assertIn('"src\\App.fr-b10.test.tsx"', source)
        self.assertIn('RustFilter = "fr_b10"', source)
        self.assertIn('ProductSwitch = "-TagsOnly"', source)
        self.assertIn('"src\\App.fr-b07.test.tsx"', source)
        self.assertIn('FrontendTestName = "FT-B07-001"', source)
        self.assertIn('RustFilter = "fr_b07_memo"', source)
        self.assertIn('ProductSwitch = "-MemoOnly"', source)
        self.assertIn('FrontendTestName = "FT-B07-002"', source)
        self.assertIn(
            'RustFilter = "fr_b07_history_deterministic_order_and_dedup"',
            source,
        )
        self.assertIn('ProductSwitch = "-HistoryOnly"', source)
        self.assertIn('FrontendTestName = "FT-B07-003"', source)
        self.assertIn(
            'RustFilter = "fr_b07_rating_boundaries_and_invalid_rejection"',
            source,
        )
        self.assertIn('ProductSwitch = "-RatingOnly"', source)
        self.assertIn('"src\\App.test.tsx"', source)
        self.assertIn('FrontendTestName = "FT-B05-"', source)
        self.assertIn('ExpectedFrontendPasses = 5', source)
        self.assertIn('RustFilter = "search_port_"', source)
        self.assertIn('ProductSwitch = "-SearchOnly"', source)
        self.assertIn('FrontendTestName = "FT-B06-00[12]"', source)
        self.assertIn('ExpectedFrontendPasses = 2', source)
        self.assertIn(
            'RustFilter = "favorite_target_enforces_relative_path_and_eligible_kind_boundaries"',
            source,
        )
        self.assertIn('ProductSwitch = "-QuickAccessOnly"', source)
        self.assertIn('FrontendTestName = "FT-B06-00[345]"', source)
        self.assertIn('ExpectedFrontendPasses = 3', source)
        self.assertIn('RustFilter = "fr_b06_favorite_"', source)
        self.assertIn('ProductSwitch = "-FavoritePersistenceOnly"', source)
        self.assertIn('FrontendTestName = "FT-B08-001"', source)
        self.assertIn('ExpectedFrontendPasses = 1', source)
        self.assertIn('RustFilter = "fr_b08_webp_"', source)
        self.assertIn('ProductSwitch = "-WebpOnly"', source)
        frontend_test = (ROOT / "src/App.fr-b07.test.tsx").read_text(
            encoding="utf-8"
        )
        self.assertEqual(frontend_test.count('it("FT-B07-001 '), 1)
        self.assertEqual(frontend_test.count('it("FT-B07-002 '), 1)
        self.assertEqual(frontend_test.count('it("FT-B07-003 '), 1)
        catalog_search_test = (ROOT / "src/App.test.tsx").read_text(encoding="utf-8")
        self.assertEqual(catalog_search_test.count('it("FT-B05-'), 5)
        self.assertEqual(catalog_search_test.count('it("FT-B06-001 '), 1)
        self.assertEqual(catalog_search_test.count('it("FT-B06-002 '), 1)
        self.assertEqual(catalog_search_test.count('it("FT-B06-003 '), 1)
        self.assertEqual(catalog_search_test.count('it("FT-B06-004 '), 1)
        self.assertEqual(catalog_search_test.count('it("FT-B06-005 '), 1)
        self.assertEqual(catalog_search_test.count('it("FT-B08-001 '), 1)
        self.assertIn('if ($RustMode -eq "Canonical")', source)
        self.assertLess(
            source.index('Name = "frontend-sbom"'),
            source.index('Name = "rust-$($RustMode.ToLowerInvariant())"'),
        )

    def test_portable_windows_gates_delegate_to_native_runners(self) -> None:
        routes = {
            "run-tests.py": "run-tests-windows.ps1",
            "run-typecheck.py": "run-typecheck-windows.ps1",
        }
        for source_name, runner_name in routes.items():
            with self.subTest(source=source_name):
                source = (ROOT / "scripts" / source_name).read_text(encoding="utf-8")
                self.assertIn('if os.name == "nt":', source)
                self.assertIn(runner_name, source)
                self.assertNotIn('shutil.which("npm.cmd")', source)

        tests_source = (ROOT / "scripts/run-tests.py").read_text(encoding="utf-8")
        self.assertIn("COMIC_EXPLORER_VERIFICATION_LOG_ROOT", tests_source)
        self.assertIn("canonical-tests.stdout.log", tests_source)

    def test_shortcut_product_gate_requires_freshness_without_fixed_save_sleep(self) -> None:
        source = (ROOT / "scripts/run-product-ui-harness.ps1").read_text(
            encoding="utf-8"
        )
        self.assertIn("Test-ReleaseFreshness", source)
        self.assertIn("data-shortcut-save-status=saved", source)
        self.assertIn("Product start failed after 2 bounded attempts", source)
        self.assertIn("Connect-Cdp -TimeoutSeconds $timeout", source)
        self.assertNotIn("setTimeout(() => resolve(true), 1000)", source)
        self.assertNotIn("Start-Sleep -Milliseconds 1000", source)

        freshness_source = (ROOT / "scripts/release-freshness.ps1").read_text(
            encoding="utf-8"
        )
        self.assertIn(r'\.test\.(ts|tsx)$', freshness_source)

    def test_tag_product_gate_exercises_release_ui_persistence_and_nonmutation(self) -> None:
        source = (ROOT / "scripts/run-product-ui-harness.ps1").read_text(
            encoding="utf-8"
        )
        self.assertIn("[switch]$TagsOnly", source)
        self.assertIn('if ($TagsOnly)', source)
        for stage in (
            '"tag item selection"',
            '"tag library menu"',
            '"tag assignment"',
            '"nonmatching tag seed"',
            '"normalized tag query"',
            '"tag rename"',
            '"tag restart item selection"',
            '"tag restart library menu"',
            '"tag restart persistence"',
            '"tag removal"',
        ):
            self.assertIn(stage, source)
        self.assertIn("document.querySelectorAll('[data-tag-id]').length === 2", source)
        self.assertIn(
            "document.querySelector('#tag-query').value === '\\uFF26\\uFF21\\uFF36'",
            source,
        )
        self.assertIn("[aria-controls=library-menu]", source)
        self.assertIn("[data-product-id=tag-manager-menu-item]", source)
        app_source = (ROOT / "src/App.tsx").read_text(encoding="utf-8")
        self.assertIn('data-product-id="tag-manager-menu-item"', app_source)
        self.assertIn('test = "FT-B10-005"', source)
        self.assertIn('throw "Tag product harness changed source archives."', source)
        self.assertIn(
            'throw "Tag product harness changed the source tree or created adjacent files."',
            source,
        )

    def test_memo_product_gate_waits_for_persistence_and_keeps_sources_unchanged(self) -> None:
        source = (ROOT / "scripts/run-product-ui-harness.ps1").read_text(
            encoding="utf-8"
        )
        self.assertIn("[switch]$MemoOnly", source)
        self.assertIn("if ($MemoOnly)", source)
        for stage in (
            '"memo viewer setup"',
            '"memo first save"',
            '"memo reopen persistence"',
            '"memo second save"',
            '"memo restart persistence"',
            '"memo clear"',
            '"memo clear reopen persistence"',
        ):
            self.assertIn(stage, source)
        self.assertIn("dataset.memoSaveState === 'saved'", source)
        self.assertIn("dataset.memoSaveState === 'idle'", source)
        self.assertGreaterEqual(source.count("?.disabled === false"), 6)
        self.assertIn('test = "FT-B07-006"', source)
        self.assertIn('throw "Memo product harness changed source archives."', source)
        self.assertIn(
            'throw "Memo product harness changed the source tree or created adjacent files."',
            source,
        )
        app_source = (ROOT / "src/App.tsx").read_text(encoding="utf-8")
        viewer_source = (ROOT / "src/features/viewer/Viewer.tsx").read_text(
            encoding="utf-8"
        )
        for selector in (
            'data-product-id="item-metadata-panel"',
            'data-product-id="item-memo-input"',
            'data-product-id="item-memo-save"',
            'data-product-id="item-memo-clear"',
            'data-memo-save-state={memoSaveState}',
            'disabled={metadataLoading}',
        ):
            self.assertIn(selector, app_source)
        self.assertIn('data-product-id="viewer-close"', viewer_source)

    def test_history_product_gate_observes_success_only_dedup_and_restart_persistence(self) -> None:
        source = (ROOT / "scripts/run-product-ui-harness.ps1").read_text(
            encoding="utf-8"
        )
        self.assertIn("[switch]$HistoryOnly", source)
        self.assertIn("if ($HistoryOnly)", source)
        for stage in (
            '"history successful open $itemPath"',
            '"history successful close $itemPath"',
            '"history failed open"',
            '"history failed open recovery"',
            '"history success-only dedup and deterministic order"',
            '"history restart persistence"',
        ):
            self.assertIn(stage, source)
        self.assertIn("identities === 'comic-folder|1-valid.cbz'", source)
        self.assertIn("rows.length === 2", source)
        self.assertIn('test = "FT-B07-007"', source)
        self.assertIn('throw "History product harness changed source archives."', source)
        self.assertIn(
            'throw "History product harness changed the source tree or created adjacent files."',
            source,
        )
        app_source = (ROOT / "src/App.tsx").read_text(encoding="utf-8")
        for selector in (
            'data-product-id="catalog-error-return"',
            'data-product-id="history-menu-item"',
            'data-product-id="history-dialog"',
            'data-product-id="history-row"',
            'data-product-id="history-refresh"',
            'data-product-id="history-close"',
        ):
            self.assertIn(selector, app_source)

    def test_rating_product_gate_waits_for_save_and_keeps_sources_unchanged(self) -> None:
        source = (ROOT / "scripts/run-product-ui-harness.ps1").read_text(
            encoding="utf-8"
        )
        self.assertIn("[switch]$RatingOnly", source)
        self.assertIn("if ($RatingOnly)", source)
        self.assertIn(
            "if (!$RatingOnly -and !$SearchOnly -and !$QuickAccessOnly -and !$FavoritePersistenceOnly -and !$WebpOnly)",
            source,
        )
        for stage in (
            '"rating viewer setup"',
            '"rating $rating saved"',
            '"rating restart persistence"',
            '"rating clear saved"',
            '"rating clear reopen persistence"',
        ):
            self.assertIn(stage, source)
        self.assertIn("dataset.ratingSaveState === 'saved'", source)
        self.assertIn("dataset.ratingPersistedValue === $ratingJson", source)
        self.assertIn('test = "FT-B07-008"', source)
        self.assertIn('throw "Rating product harness changed source archives."', source)
        self.assertIn(
            'throw "Rating product harness changed the source tree or created adjacent files."',
            source,
        )
        app_source = (ROOT / "src/App.tsx").read_text(encoding="utf-8")
        for selector in (
            'data-rating-save-state={ratingSaveState}',
            'data-rating-persisted-value={',
            'data-product-id="item-rating-select"',
            "const ratingSaveGeneration = useRef(0);",
            "const ratingSaveInFlight = useRef(false);",
            'setRatingSaveState("saving")',
            "disabled={metadataLoading}",
        ):
            self.assertIn(selector, app_source)

    def test_search_product_gate_observes_normalization_navigation_and_fresh_rescan(self) -> None:
        source = (ROOT / "scripts/run-product-ui-harness.ps1").read_text(
            encoding="utf-8"
        )
        self.assertIn("[switch]$SearchOnly", source)
        self.assertIn("if ($SearchOnly)", source)
        self.assertIn(
            "if (!$RatingOnly -and !$SearchOnly -and !$QuickAccessOnly -and !$FavoritePersistenceOnly -and !$WebpOnly)",
            source,
        )
        for stage in (
            '"search normalized mixed-kind result"',
            '"search result navigation and selection"',
            '"search empty result"',
            '"search clear result"',
            '"search rescan baseline"',
            '"search fresh rescan"',
        ):
            self.assertIn(stage, source)
        for selector in (
            "#catalog-search",
            ".search-results",
            "data-search-result-path",
            "dataset.searchResultKind",
            "data-relative-path",
            "dataset.selected",
        ):
            self.assertIn(selector, source)
        self.assertIn("folder-a\\search-pair.cbz", source)
        self.assertIn("folder-a/search-pair:folder", source)
        self.assertIn("folder-a/search-pair.cbz:archive", source)
        self.assertIn("rescan-needle.cbz", source)
        self.assertIn("Remove-Item -LiteralPath $searchFreshPath", source)
        self.assertIn('test = "FT-B05-006"', source)
        self.assertIn('throw "Search product harness changed source archives."', source)
        self.assertIn(
            'throw "Search product harness changed the source tree or created adjacent files."',
            source,
        )
        self.assertIn(
            'throw "Search product harness changed the source directory tree."',
            source,
        )

    def test_quick_access_product_gate_opens_available_targets_and_removes_them(self) -> None:
        source = (ROOT / "scripts/run-product-ui-harness.ps1").read_text(
            encoding="utf-8"
        )
        self.assertIn("[switch]$QuickAccessOnly", source)
        self.assertIn("if ($QuickAccessOnly)", source)
        self.assertIn(
            "if (!$RatingOnly -and !$SearchOnly -and !$QuickAccessOnly -and !$FavoritePersistenceOnly -and !$WebpOnly)",
            source,
        )
        for stage in (
            '"quick access add $favoritePath"',
            '"quick access exact favorite state"',
            '"quick access available rows"',
            '"quick access folder navigation"',
            '"quick access comic viewer"',
            '"quick access archive viewer"',
            '"quick access archive remove"',
            '"quick access comic remove"',
            '"quick access folder remove and empty"',
        ):
            self.assertIn(stage, source)
        for selector in (
            "favorites-menu-item",
            "favorite-toggle",
            "quick-access-dialog",
            "favorite-row",
            "data-favorite-relative-path",
            "favorite-open",
            "favorite-remove",
        ):
            self.assertIn(selector, source)
        self.assertIn('test = "FT-B06-006"', source)
        self.assertIn(
            'throw "Quick access product harness changed source archives."', source
        )
        self.assertIn(
            'throw "Quick access product harness changed the source tree or created adjacent files."',
            source,
        )
        self.assertIn(
            'throw "Quick access product harness changed the source directory tree."',
            source,
        )
        app_source = (ROOT / "src/App.tsx").read_text(encoding="utf-8")
        catalog_source = (ROOT / "src/features/catalog/CatalogGrid.tsx").read_text(
            encoding="utf-8"
        )
        quick_access_source = (
            ROOT / "src/features/catalog/QuickAccess.tsx"
        ).read_text(encoding="utf-8")
        self.assertIn('data-product-id="favorites-menu-item"', app_source)
        self.assertIn('data-product-id="favorite-toggle"', catalog_source)
        for selector in (
            'data-product-id="quick-access-dialog"',
            'data-product-id="favorite-row"',
            "data-favorite-relative-path={favorite.relativePath}",
            'data-product-id="favorite-open"',
            'data-product-id="favorite-remove"',
        ):
            self.assertIn(selector, quick_access_source)

    def test_favorite_persistence_product_gate_restarts_resolves_and_restores_fixtures(self) -> None:
        source = (ROOT / "scripts/run-product-ui-harness.ps1").read_text(
            encoding="utf-8"
        )
        self.assertIn("[switch]$FavoritePersistenceOnly", source)
        self.assertIn("if ($FavoritePersistenceOnly)", source)
        self.assertIn(
            "if (!$RatingOnly -and !$SearchOnly -and !$QuickAccessOnly -and !$FavoritePersistenceOnly -and !$WebpOnly)",
            source,
        )
        for stage in (
            '"favorite persistence add $favoritePath"',
            '"favorite persistence restart rows"',
            '"favorite persistence moved and missing"',
            '"favorite persistence missing rescan"',
            '"favorite persistence re-resolve"',
            '"favorite persistence missing remove"',
            '"favorite persistence resolved restart"',
            '"favorite persistence resolved remove"',
        ):
            self.assertIn(stage, source)
        for selector in (
            "favorite-resolve",
            "dataset.favoriteResolvedPath",
            "dataset.favoriteRefreshRevision",
            "favorite-row-refresh",
            "favorite-remove",
        ):
            self.assertIn(selector, source)
        self.assertIn('test = "FT-B06-007"', source)
        self.assertIn("stableFavoriteIds = $true", source)
        self.assertIn("missingRescanned = $true", source)
        self.assertIn("$archiveBeforeMoveLastWriteTimeUtc", source)
        self.assertIn(
            "$archiveAfterMove.LastWriteTimeUtc = $archiveBeforeMoveLastWriteTimeUtc",
            source,
        )
        self.assertIn(
            "Favorite persistence product gate could not start the missing-row rescan.",
            source,
        )
        self.assertIn("Move-Item -LiteralPath $favoriteMovedArchive", source)
        self.assertIn("Move-Item -LiteralPath $favoriteMissingComic", source)
        self.assertIn(
            'throw "Favorite persistence product harness changed the externally mutated source tree."',
            source,
        )
        self.assertIn(
            'throw "Favorite persistence product harness changed the source tree or created adjacent files."',
            source,
        )
        quick_access_source = (
            ROOT / "src/features/catalog/QuickAccess.tsx"
        ).read_text(encoding="utf-8")
        for selector in (
            'data-product-id="favorite-refresh"',
            'data-product-id="favorite-resolve"',
            'data-product-id="favorite-row-refresh"',
            "data-favorite-refresh-revision={refreshRevision}",
            'data-favorite-resolved-path={favorite.resolvedPath ?? ""}',
        ):
            self.assertIn(selector, quick_access_source)
        app_source = (ROOT / "src/App.tsx").read_text(encoding="utf-8")
        self.assertIn("favoriteRefreshRevision", app_source)

    def test_webp_product_gate_uses_fixed_isolated_fixtures_and_observes_recovery(self) -> None:
        source = (ROOT / "scripts/run-product-ui-harness.ps1").read_text(
            encoding="utf-8"
        )
        self.assertIn("[switch]$WebpOnly", source)
        self.assertIn("if ($WebpOnly)", source)
        self.assertIn("Add-Type -AssemblyName System.IO.Compression\n", source)
        self.assertIn("Add-Type -AssemblyName System.IO.Compression.FileSystem", source)
        self.assertIn(
            "if (!$RatingOnly -and !$SearchOnly -and !$QuickAccessOnly -and !$FavoritePersistenceOnly -and !$WebpOnly)",
            source,
        )
        for fixture in (
            "0-webp-folder",
            "0-webp-static.zip",
            "0-webp-static.cbz",
            "1-lossy.webp",
            "2-lossless.webp",
            "3-alpha.webp",
            "4-corrupt.webp",
            "5-animated.webp",
            "6-recovery.webp",
        ):
            self.assertIn(fixture, source)
        for stage in (
            '"webp folder ZIP and CBZ enumeration"',
            '"webp thumbnail decode and cache generation"',
            '"webp corrupt local error"',
            '"webp animated local error"',
            '"webp local error next recovery"',
            '"webp thumbnail cache hit"',
        ):
            self.assertIn(stage, source)
        for observable in (
            "naturalWidth > 0",
            "naturalHeight > 0",
            "data-cache-hit=true",
            "page-error[role=alert]",
            "data-product-id=viewer-error-next",
            "sourceDifferenceCount = 0",
            'test = "FT-B08-006"',
            "networkOrCodecInstall = $false",
            "viewerStaticLossyLosslessAlphaDecoded = $true",
            "comicCoverThumbnailCacheVerified = $true",
        ):
            self.assertIn(observable, source)
        webp_start = source.index("    if ($WebpOnly) {")
        webp_end = source.index("    if ($SearchOnly) {", webp_start)
        self.assertNotIn(
            ".page-error button:nth-of-type(2)", source[webp_start:webp_end]
        )
        self.assertIn(
            'throw "WebP product harness changed the source tree or created adjacent files."',
            source,
        )
        self.assertIn(
            'throw "WebP product harness changed the source directory tree."', source
        )

    def test_wsl_bridge_follows_final_json_exit_code(self) -> None:
        source = (ROOT / "scripts/run-feature-verification-wsl.sh").read_text(
            encoding="utf-8"
        )
        self.assertIn("while [[ ! -f", source)
        self.assertIn("head -1", source)
        self.assertIn('exit "$exit_code"', source)
        self.assertIn("exit 124", source)


if __name__ == "__main__":
    unittest.main()
