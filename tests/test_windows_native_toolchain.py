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
        self.assertIn('[string]$RustFilter = "shortcut"', task_runner)
        self.assertIn('if (![string]::IsNullOrWhiteSpace($FrontendTestName))', task_runner)
        self.assertIn(
            '$vitestArguments += @(\"-t\", $FrontendTestName, \"--reporter=json\")',
            task_runner,
        )
        self.assertIn("$summary.numPassedTests -ne 1", task_runner)
        self.assertIn("$summary.numFailedTests -ne 0", task_runner)
        self.assertIn('"-FrontendTest", $frontendTest', source)
        self.assertIn('"-FrontendTestName", $frontendTestName', source)
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
        frontend_test = (ROOT / "src/App.fr-b07.test.tsx").read_text(
            encoding="utf-8"
        )
        self.assertEqual(frontend_test.count('it("FT-B07-001 '), 1)
        self.assertEqual(frontend_test.count('it("FT-B07-002 '), 1)
        self.assertEqual(frontend_test.count('it("FT-B07-003 '), 1)
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
        self.assertIn("if (!$RatingOnly)", source)
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
