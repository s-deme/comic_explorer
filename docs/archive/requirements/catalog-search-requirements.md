---
codd:
  node_id: "req:fr-b05"
  type: requirement
  status: approved
  confidence: 0.92
  depends_on:
    - id: "req:mvp-requirements"
      relation: "extends"
      semantic: "catalog-path-contract"
    - id: "req:product-questionnaire"
      relation: "derives_from"
      semantic: "Q4-1-Q4-4-adoption"
---

# FR-B05 名前検索要件

## 採用記録

Q4-1/Q4-4由来の候補について、LordのOption B受理（2026-08-02）により
`FUT-C-010`をFR-B05の機能契約として採用する。対象はlibrary内の可視なfile/folder
name検索であり、外部書誌情報、tag、favorite、破壊的file operationは含めない。

検索機能の正しさは本要件で扱い、10,000項目・1秒以内の性能受入は別の性能トラックへ
分離する。性能未実測をFR-B05の機能PASSへ混ぜない。

## REQ-FR-B05-001: query and matching boundary

検索対象は、登録済みlibrary root配下の可視なfileとfolderのbasenameである。既存の
catalog列挙と同じく隠し名、root外のsymlink、読めない項目の無断追跡は行わない。
queryとbasenameは次の順で検索用に正規化する。

1. Unicode空白を前後からtrimする。
2. 全角ASCII（`U+FF01`〜`U+FF5E`）を半角へ、全角空白（`U+3000`）をASCII空白へ折りたたむ。
3. Unicode lowercaseへ変換する。

正規化後のqueryがbasenameに含まれる場合を一致とするため、exactとpartialを同じ
substring契約で扱う。大小文字、全角／半角、Unicode文字をlocaleへ依存せず処理する。
空queryは検索を実行せず、検索結果を空に戻す。

## REQ-FR-B05-002: mixed results and navigation

結果は相対path、basename、catalog種別、取得できたsize/modified/archive kindを保持し、
file、folder、comicFolder、archive、page、unsupportedを混在して表示できる。結果の
`元階層へ移動`操作は、結果の親relative pathを現在folderとして読み込み、対象結果を
選択状態へ戻す。表示中のaddress、folder tree、catalog、status barはその現在folderと
整合する。

## REQ-FR-B05-003: empty, error, and clear

一致0件は「検索結果はありません。」として通知し、一覧を破壊せずに再検索できる。
backendの分類付きerrorは対象queryを含む再試行可能なerror panelへ表示し、検索結果の
`クリア`操作で通常の現在folder一覧へ復帰できる。`クリア`はin-flightの検索generationを
無効化するため、clear後に到着した古い成功・empty・error結果は画面へ反映しない。内部例外や
stack traceを表示しない。

## REQ-FR-B05-004: rescan freshness

検索要求ごとにlibrary rootを再走査して検索結果を構築する。永続化した古いindexを
正本にしないため、検索中に追加・改名・削除された可視file/folderは、次の検索要求で
結果へ反映される。各要求はgenerationで識別し、古い走査結果を現在画面へ反映しない。

このfreshness契約は検索の正しさと更新可視性だけを定め、検索時間・memory・p95の
empirical evidenceを提供しない。これらはWindows基準環境gateで別途測定する。

## REQ-FR-B05-005: local-only and non-destructive boundary

検索はTauriのlocal filesystem列挙だけで完結し、network、外部サービス、書誌APIを呼ばない。
library root、file、folder、archive、library管理fileへ書込み、rename、delete、cache、
sidecar、temporary file作成を行わない。設定SQLiteへ検索queryやindexを保存しない。

## C0/C1 ownership checkpoint

FR-B05はserial1の一名integration ownerで実装する。C0でquery normalization、basename
substring、mixed kind、fresh rescan、性能分離を固定し、C1で次のpath ownershipと
connected evidence matrixを凍結する。

| boundary | owned paths | contract |
|---|---|---|
| backend search | `src-tauri/src/application/mod.rs`, `src-tauri/src/lib.rs` | local recursive rescan、normalization、kind/path保持、generation/cancel |
| API client | `src/features/library/client.ts` | `search_library` request/responseをlocal Appへ接続 |
| UI integration | `src/App.tsx`, `src/App.test.tsx` | query、results、empty/error/clear、parent navigation、selection |
| direct evidence | `docs/requirements/catalog-search-requirements.md`, `docs/testing/fr-b05-results.md`, `docs/product/feature-status.md`, `docs/product/feature-roadmap.md` | adopted ID、FT-B05 matrix、gate、非PASS性能境界 |

### Connected evidence matrix

| checkpoint | observable contract | required evidence |
|---|---|---|
| C0 query | exact/partial、大小文字、全角／半角・Unicode、empty query | `FT-B05-001` connected App query + Rust normalization |
| C1 mixed catalog | file/folder混在、kind、relative path | `FT-B05-002` connected App/catalog + Rust search result |
| C1 navigation | resultの元階層、種別、現在位置、selection | `FT-B05-003` connected App result navigation |
| C1 recovery | empty/error/clear/retry可能な状態 | `FT-B05-004` connected App states |
| C1 freshness | 再走査後の追加・更新結果、再起動相当の新request | `FT-B05-005` connected App/backend rescan |
| release product | 実UI query、result navigation、empty/clear、明示rescan、原本不変 | `FT-B05-006` SearchOnly release WebView2 gate |

pure unitだけでは完了扱いにせず、AppからAPI client、catalog/backendへ接続した結果を
直接観測する。frontend focusedは`FT-B05-` prefixのexact 5（`FT-B05-001`〜005）を選択し、
選択対象を5 PASS・0 FAILで強制する。同じfileの非対象testはpattern除外であり、選択対象の
SKIPへ算入しない。Rustは`search_port_` filterでnormalizationと明示rescanを正本として検証する。
FT-B05-001〜006のいずれかがFAILまたは選択対象内でSKIPなら、FUT-C-010をPASSへ更新しない。

### IMP-012 SearchOnly 完了ゲート

`scripts/run-feature-verification-wsl.sh IMP-012 -RustMode Canonical`をWindows-native toolchainへ
橋渡しする正本コマンドとする。`FT-B05-` prefixのfrontend exact 5、`search_port_` Rust filter、
typecheck、SBOM/build、canonical Rust、release freshness、`FT-B05-006`、製品process cleanup、
CoDD scan/check/verifyを同じsourceへ束縛する。

`FT-B05-006`はisolated fixtureを使うrelease WebView2製品UIから、全角・大小文字を含むqueryで
folder/archiveの期待rowとkindを確認し、resultから親addressとselectionへ復帰する。0件noticeと
clearによる通常catalog復帰を確認する。harnessだけが一時probeを追加した後、watcherや永続indexを
使わない次の明示検索で新しい結果へ置換されなければならない。harnessはprobeを除去してfixtureを
復元する。空白trimとclear後の旧generation抑止は`FT-B05-001`/`FT-B05-004`、再走査の置換と
generationは`FT-B05-005`/Rust filterを正本とする。検索はlibrary source treeへwrite、rename、
delete、cache、sidecar、temporary fileを作らず、前後のpath、bytes、SHA-256は一致しなければならない。
`FT-B05-006`のPASSは`FUT-C-010`だけを完了させる。10,000項目・1秒の性能測定は別の
性能gateであり、本featureのPASSへ加算せず、また本gateを妨げない。

## Batch and evidence boundary

選択対象のfocused機能テストはSKIP 0で実測する。canonical aggregateはfocused成功後に一回だけ実行し、
CoDDの構造検査が同条件で非PASSとなる場合は、生値・check名・影響をledgerとreportへ残す。
その場合も機能証跡PASSとCoDD structural certificationを分離し、「全gate PASS」と称しない。
Windows WebView2製品実機は`FT-B05-006`を現在のPASS根拠とする。10,000項目性能測定は
本batchのPASS根拠ではなく、未実測でもFR-B05の機能PASSを妨げない。
