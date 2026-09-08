# Comic Explorer development guide

この文書は、Windows上でComic Explorerを開発・検証するための入口をまとめる。利用者向け機能と配布物はリポジトリ直下の [`README.md`](../README.md)、現行要件と検証状態は [`docs/README.md`](README.md) を正本とする。

## 前提環境

- Windows 10または11
- Node.js 24系とnpm（CIはNode.js 24.18.0を使用）
- Rust 1.85以降とWindows向けMSVC toolchain
- Python 3（release metadata、CoDD、集約テスト用）
- Microsoft Edge WebView2 Runtime

CoDDを実行する場合は、プロジェクトローカルの `.venv-windows` が利用可能であることも確認する。依存バージョンの正本は `package-lock.json` と `src-tauri/Cargo.lock` であり、生成済みの `node_modules/` や `target/` はコミットしない。

## 初回セットアップと起動

プロジェクトルートのPowerShellでフロントエンド依存物を固定バージョンどおりに導入する。

```powershell
npm ci
npm run tauri -- dev
```

ブラウザーだけでフロントエンドを確認する場合は `npm run dev` を使えるが、filesystem、archive、PDF、SQLite、native windowなどのTauri機能を含む製品確認にはならない。

## 標準検証入口

Windows filesystem上では、個別ツールを組み合わせず次のラッパーを正規の入口として使う。

```powershell
.\scripts\run-typecheck-windows.ps1
.\scripts\run-tests-windows.ps1
.\scripts\run-build-windows.ps1
```

文書、設計、設定、コード、テストなどCoDDの追跡対象を変更した後は、少なくともscanとcheckを実行する。

```powershell
.\scripts\run-codd-windows.ps1 scan
.\scripts\run-codd-windows.ps1 check
```

実行可能コードまたはテストを変更した最終確認では、build後にCoDD verifyを1回実行する。verifyは集約テストも呼ぶため、その直前に同じfull testを重複実行する必要はない。

```powershell
.\scripts\run-build-windows.ps1
.\scripts\run-codd-windows.ps1 scan
.\scripts\run-codd-windows.ps1 check
.\scripts\run-codd-windows.ps1 verify
```

feature ID単位の正式確認が必要な場合は次を使う。

```powershell
.\scripts\verify-feature-windows.ps1 -Feature <ID> -RustMode Canonical
```

失敗、未実行、未測定、`BLOCKED` はPASSとして記録しない。最新の記録規則と未測定項目は [`current/verification.md`](current/verification.md) を参照する。

## 配布物

通常のproduction buildとGitHub Release作成は別である。`v<version>` タグのpush時に `.github/workflows/windows-build.yml` がアプリのバージョンとタグを照合し、installer、portable ZIP、checksumを作成する。release前には `package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json` のバージョンを一致させる。

`dist/`、`src-tauri/target/`、`node_modules/`、CoDDのscan生成物、テストfixture生成物はソース文書ではない。必要な配布メタデータはreleaseスクリプトから再生成する。
