---
codd:
  node_id: "test:phase6-verification-results"
  type: test
  status: active
  confidence: 0.9
  depends_on:
    - id: "design:implementation-plan"
      relation: "verifies"
      semantic: "behavioral"
    - id: "design:test-strategy"
      relation: "executes"
      semantic: "behavioral"
    - id: "test:test-cases"
      relation: "executes"
      semantic: "behavioral"
---

# Phase 6 検証結果

## 実行情報

- 実行日: 2026-07-29
- 実行環境: Windows 11 host + WSL2
- 対象version: 0.1.0
- fixture: 固定seed 20260728、通常64ファイル/11 fixture、性能版11,365ファイル/12 fixture

## 自動検証結果

| 検証 | 結果 | 証跡 |
| --- | --- | --- |
| Rust fmt/check/test | PASS | Windows MSVC、31 tests |
| TypeScript typecheck | PASS | `tsc --noEmit` |
| React unit/component | PASS | 15 tests |
| Python fixture/benchmark tests | PASS | 4 tests、fixture validator |
| Production frontend build | PASS | Vite production build |
| CoDD scan/check/verify | PASS | red gate 0、amber advisory 1 |
| Windows release executable | PASS | `comic-explorer.exe`生成 |
| Windows process smoke launch | PASS | 5秒間起動継続後、試験processを終了 |
| NSIS x64 installer | PASS | offline WebView2 modeで生成 |
| SBOM | PASS | lock-backed CycloneDX 1.6 inventory |

## 基礎性能測定

この値はWSL2上のportable foundation harnessであり、Windows製品UIの合否値ではない。
7回測定のp95は次のとおり。

| 操作 | p95 |
| --- | ---: |
| 1,000項目列挙・metadata sort | 22.293 ms |
| 10,000項目列挙・metadata sort | 247.454 ms |
| Deflate ZIPから30ページrandom read | 24.792 ms |
| Stored ZIPから30ページrandom read | 22.751 ms |
| SQLite 10,000件insert + 100件read | 126.903 ms |

## 配布物

release executableおよびNSIS installerをWindows MSVCで生成した。installerは
WebView2 `offlineInstaller` を使用し、ネットワーク不要の導入を構成上要求する。
署名証明書は設定されていないため、現成果物は未署名である。

| 成果物 | bytes | SHA-256 |
| --- | ---: | --- |
| `comic-explorer.exe` | 10,814,976 | `5afc419eb9328d058e57c774377323e65a3552a6c3a181ed68d1257905fc30d5` |
| `Comic Explorer_0.1.0_x64-setup.exe` | 209,274,596 | `c9a1756765f0d5bca968eca35cdc28816be65204850328baeb0fab427e3e5ef5` |

## 実機・隔離環境待ち

次の項目は現在の単一開発ホストでは合否を確定しない。

- Windows 10 22H2 clean VMでのinstall/start/read/uninstall
- 別のWindows 11 clean VMでのinstall/start/read/uninstall
- OSレベルDNS/TCP/UDP監視による外向き通信0件
- WebView2未導入VMでのoffline runtime導入
- 製品UIのcold TTI、page switch、scroll FPS、input delay、working set
- screen readerを含むWindows実機アクセシビリティ
- installerのuser-data保持と明示削除動作

これらは未実施をPASSとして扱わず、release判定前のblocked manual verificationとする。

## 既知の未完了実装

現時点の成果物は製造ベースラインであり、MVP完了判定は行わない。次は未完了である。

- WICによる長辺384px/JPEG quality 82のサムネイル生成と一覧への実画像表示
- 任意の未選択branchを展開できる完全な仮想folder tree
- thumbnail priority worker、negative cache、実処理に接続した10GiB回収
- custom protocolのorigin/refererを含むWindows WebView2実機security試験
- shutdown時の全task停止、全handle close、最終位置flushを対象とするE2E

これらを解消し、72テストケースの実行記録を揃えるまでPhase 6のMVP完了条件は未達とする。

## 今回完了した実装

- 2026-07-29: 一覧項目へ更新日時、ファイルサイズ、ZIP/CBZ種別metadataを追加し、
  名前・更新日時・サイズ・種類の昇順／降順、欠損値末尾、自然順と決定的tie-break、
  選択中sortのSQLite保存・再起動復元を実装した。Windows MSVC 29 tests、
  React 14 tests、typecheck、production buildで検証した。
- 2026-07-29: Windows標準のfolder pickerを追加し、選択pathをbackendでcanonical化、
  directory判定、directory列挙による読取可否確認を行ってからSQLiteへ保存するように
  した。登録済みrootが消失・アクセス拒否になった場合もpathを維持して再試行・
  再選択できる。Windows MSVC 31 tests、React 15 tests、typecheck、production
  build、fixture validatorで検証した。picker自体のWindows UI操作は実機試験に残す。
