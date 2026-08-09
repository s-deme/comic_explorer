---
codd:
  node_id: "req:fr-b04"
  type: requirement
  status: approved
  confidence: 0.92
  depends_on:
    - id: "req:mvp-requirements"
      relation: "extends"
      semantic: "viewer-contract"
    - id: "req:viewer-scale"
      relation: "extends"
      semantic: "scale-boundary"
    - id: "req:product-questionnaire"
      relation: "derives_from"
      semantic: "Q5-1-adoption"
---

# FR-B04 閲覧画面 mode 要件

## 採用記録

Q5-1由来の候補をC0で採用し、`FUT-C-015`〜`FUT-C-017`を一つのviewer layout契約へ
統合する。採用IDは次の3件で固定する。

`FUT-C-015`, `FUT-C-016`, `FUT-C-017`

既存の単ページ／見開き表示（`viewMode`）とB01のscale/fit状態は保全する。FR-B04の
`layoutMode`はそれらと別の直交状態であり、既定値は`paged`とする。

## C0/C1 boundary

### REQ-FR-B04-001: layout enum and default

UI、App/API境界、SQLiteは次の3値だけを受け付ける。

| `layoutMode` | 採用ID | 表示契約 |
|---|---|---|
| `paged` | 既存paged viewerの保全 | 現行の単ページ／見開き、左右読み、ページゾーン、B01 scale/fitを維持する |
| `vertical_scroll` | `FUT-C-015` | ページを上から下へ連続配置し、同じ画像・読み方向・page anchorを保つ |
| `horizontal_scroll` | `FUT-C-016` | ページを左右へ連続配置し、同じ画像・読み方向・page anchorを保つ |

欠損値、未知値、旧DBには`paged`を適用する。`layoutMode`は既存の`viewMode`（single /
spread）を置換せず、scale mode、倍率、ルーペ、読み方向、読書位置と別々に復元する。

### REQ-FR-B04-002: page anchor, direction and focus

layout切替と再描画では現在の自然順page indexをpage anchorとして保持する。縦／横layout
ではanchor pageへスクロール位置を寄せ、anchor項目をkeyboard focus可能にする。既存の
right-to-left / left-to-right読み方向、単ページ／見開きの進行、Esc・矢印・PageUp/
PageDown・wheel入力はlayout切替で失われてはならない。横layoutのページ列は
left-to-rightでは自然順、right-to-leftでは逆順に配置し、現在のpage indexとfocus対象は
どちらの方向でも変えない。横layoutで通常wheelを受けた場合は横スクロールへ変換し、
ctrl+wheelの倍率操作は従来どおり維持する。

### REQ-FR-B04-003: scale/fit boundary

`fit`、`width`、`height`、`original`、`custom`のB01 scale model、25%〜400%の境界、
0.1刻み、ルーペの画像境界clampをlayoutModeと独立して維持する。layout切替やpage anchor
の変更によってscale mode、倍率、ルーペ状態を初期化してはならない。

### REQ-FR-B04-004: orthogonal OS fullscreen

`FUT-C-017`のfullscreenはlayout enumへ追加せず、Tauriの現在windowへ接続するOS window
stateとして扱う。Viewerはfullscreen adapterの`enter`、`exit`、`isFullscreen`を通じて
状態を要求し、成功時だけUI状態を更新する。adapterエラーはViewerを閉じず、再試行可能な
statusとして表示する。fullscreen中のEscはまずOS fullscreenを終了し、通常状態のEscだけ
Viewerを閉じる。

fullscreen stateは`layoutMode`、`viewMode`、scale/fit、読み方向、page anchor、読書位置の
設定へ保存しない。Viewerを一覧へ戻すとき、fullscreenなら先にexitしてwindow stateを復元
する。OS差はconnected component adapter testとWindows WebView2実機testを別gateとして
扱い、実Windows実測がない場合は`BLOCKED`と記録し、PASSへ読み替えない。

Windows WebView2 product gateでは、release executableを実際に起動し、Viewerの全画面操作で
OS window boundsが対象monitorの全画面boundsへ変化することを直接観測する。全画面中のEscは
OS windowを通常boundsへ戻しつつViewerと現在pageを維持し、通常状態のEscだけがViewerを閉じる
ことを確認する。これは`FT-B04-006`としてproduct harnessで測定し、bounds・DOM state・Viewer
復帰を同一実行で記録する。

### REQ-FR-B04-005: persistence

`layoutMode`は既存app-local SQLite `settings` tableの`layoutMode`へ保存し、再起動時に
復元する。`fullscreen`はOS window stateなのでSQLiteへ保存しない。library root配下へ
DB、cache、temp、log、sidecarを作成せず、原本・ZIP/CBZへ書き込まず、外部通信を追加しない。

## C0/C1 ownership checkpoint

FR-B04は一名のintegration ownerで実装する。C0でenum/defaultとfullscreen直交境界を固定し、
C1で次のpath ownershipとconnected evidence matrixを凍結する。

| boundary | owned paths | contract |
|---|---|---|
| layout/view model | `src/features/viewer/model.ts`, `src/features/viewer/model.test.ts` | enum、label、未知値→`paged`、page anchor契約 |
| Viewer/UI | `src/features/viewer/Viewer.tsx`, `src/features/viewer/fullscreen.ts`, `src/styles.css` | 3 layout、focus、fullscreen enter/exit/Esc/error、B01回帰 |
| App integration | `src/App.tsx`, `src/App.test.tsx` | layout selector、Viewer接続、設定復元・保存、window adapter接続 |
| persistence/API | `src/features/library/client.ts`, `src-tauri/src/application/mod.rs`, `src-tauri/src/state/repository.rs`, `src-tauri/capabilities/default.json` | validation、default、SQLite save/load、Tauri window permission |
| direct evidence | `docs/requirements/viewer-layout-requirements.md`, `docs/testing/fr-b04-results.md`, `docs/product/feature-status.md`, `docs/product/feature-roadmap.md` | adopted IDs、matrix、gate結果、BLOCKED分離を同期 |

### Connected evidence matrix

| checkpoint | observable contract | required evidence |
|---|---|---|
| C0 | 3値、既定`paged`、不正値fallback、single/spreadとscale/fitを保全 | `FT-B04-001` connected App/Viewer layout selector |
| C1 layout | vertical/horizontalがApp→Viewer→DOMへ接続され、page anchorを維持 | `FT-B04-002` connected App/Viewer observation |
| C1 interaction | 読み方向、page anchor、keyboard focus、wheel/Escを維持 | `FT-B04-003` connected Viewer interaction observation |
| C1 window | adapter enter/exit/Esc/errorをViewerへ接続し、fullscreenをlayoutと分離 | `FT-B04-004` connected App/Viewer + adapter observation |
| C1 persistence | layout selector save、SQLite reopen、再起動復元。fullscreenは非永続 | `FT-B04-005` connected App restore + Rust reopen |

pure unit testだけで完了扱いにせず、少なくとも`App`から`Viewer`へ接続したDOM、API保存、
adapter呼出しを直接観測する。FT-B04が1件でもSKIPまたは未接続ならFR-B04をPASSへ更新しない。
Windows WebView2 fullscreen product gateは別に記録し、非Windows環境で未実測のままPASSにしない。

## Non-destructive and batch boundary

layout設定はlibrary root外の既存app-local stateだけへ保存し、fullscreenはOS adapterだけへ
委譲する。原本、ZIP/CBZ、library管理file、thumbnail sourceへ書込みを行わず、network/install
を実行しない。FR-B05〜FR-B12はFR-B04のfocused QCとbatch末尾gateがACCEPTされるまで開始しない。
