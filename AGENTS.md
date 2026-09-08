# Comic Explorer

- ユーザー向け挙動・受入条件の正本は docs/current/requirements.md とし、挙動変更時だけ更新する。
- Windowsファイルシステム上では scripts/*-windows.ps1 と scripts/verify-feature-windows.ps1 を使い、WSL版の同一ゲートを先に試行しない。
- 追跡対象の変更後は CoDD の scan/check を実行し、ソース・テスト変更の最終確認には canonical verify を使う。codd/scan/、node_modules/、dist/、target/、生成fixtureはコミットしない。
