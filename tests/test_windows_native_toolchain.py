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

    def test_windows_runners_resolve_powershell_5_or_7_host(self) -> None:
        bootstrap = (ROOT / "scripts/windows-toolchain.ps1").read_text(
            encoding="utf-8"
        )
        self.assertIn("function Resolve-PowerShellHost", bootstrap)
        self.assertIn('"pwsh.exe", "powershell.exe", "pwsh", "powershell"', bootstrap)
        for name in ("run-tests-windows.ps1", "verify-feature-windows.ps1"):
            with self.subTest(runner=name):
                source = (ROOT / "scripts" / name).read_text(encoding="utf-8")
                self.assertIn("Resolve-PowerShellHost", source)
                self.assertNotIn('Join-Path $PSHOME "powershell.exe"', source)

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
