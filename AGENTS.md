# Comic Explorer

- ユーザー向け挙動・受入条件の正本は docs/current/requirements.md とし、挙動変更時だけ更新する。
- Windowsファイルシステム上では scripts/*-windows.ps1 と scripts/verify-feature-windows.ps1 を使い、WSL版の同一ゲートを先に試行しない。
- 追跡対象の変更後は CoDD の scan/check を実行し、ソース・テスト変更の最終確認には canonical verify を使う。codd/scan/、node_modules/、dist/、target/、生成fixtureはコミットしない。
- アプリの修正・機能追加後は、ユーザーの追加依頼を待たず、必要な検証に続けて `scripts/run-build-windows.ps1` で release EXE を作成する。ビルドは他の重い検証と同時に実行せず、`CARGO_BUILD_JOBS=1` を指定する。
- 完了報告前に `scripts/invoke-windows-toolchain.ps1 -Task Freshness` で EXE が最終ソースと一致することを確認し、`src-tauri/target/release/comic-explorer.exe` のリンクを報告する。確認には `scripts/windows-toolchain.ps1` の `Resolve-PowerShellHost` が選ぶビルドと同じホストを使う（PowerShell 5/7 を混在させると照合値が異なる）。ビルド・一致確認に失敗した場合は未完了として原因を修正し、古い EXE を最新版として案内しない。文書のみの変更は再ビルド不要。ユーザーが明示的にビルド不要と指示した場合はその指示を優先する。
