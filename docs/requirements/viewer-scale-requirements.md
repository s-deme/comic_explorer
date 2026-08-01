---
codd:
  node_id: "req:viewer-scale"
  type: requirement
  status: approved
  confidence: 0.92
  depends_on:
    - id: "req:product-questionnaire"
      relation: "derives_from"
      semantic: "priority"
    - id: "req:mvp-requirements"
      relation: "extends"
      semantic: "viewer-contract"
---

# FR-B01 表示倍率要件

## 採用記録

Q5-4で選択された全体フィット、横幅フィット、高さフィット、原寸表示、任意倍率、
ズーム状態維持、および補足のルーペを、FR-B01の採用要件として実装する。対象は
`FUT-C-018`、`FUT-C-033`〜`FUT-C-037`である。実装は既存Viewerの単頁・見開き・
読み方向・page/作品遷移・読書位置保存と共存し、漫画原本と書庫へ書き込まず、外部通信を行わない。

## 要件

### REQ-FR-B01-001: 共通scale model

Viewerは、`fit`（表示領域全体）、`width`（横幅）、`height`（高さ）、`original`（原寸）、
`custom`（任意倍率）の5 modeを同じscale modelで扱わなければならない。全体フィットは
アスペクト比を維持し、画像を表示領域より大きく拡大してはならない。横幅・高さフィットは
選択した辺を表示領域へ合わせ、原寸は画像の100%で表示する。

### REQ-FR-B01-002: 任意倍率の境界

任意倍率は25%〜400%の範囲を0.1倍刻みで丸める。範囲外の入力は最近傍の境界へ丸め、
非有限値は100%へ戻す。倍率の変更は画像のアスペクト比を変えず、ページを欠落させない。

### REQ-FR-B01-003: 状態維持

scale mode、任意倍率、ルーペ有効状態は、単頁・見開き切替、page遷移、作品遷移、一覧へ戻る
操作で意図せず初期化してはならない。既存の読み方向、page位置、見開き先頭page契約を維持する。

### REQ-FR-B01-004: pointer周辺ルーペ

ルーペを有効にしたとき、pointerが表示中画像内にある間はその位置を中心に拡大表示する。
画像の左上・右下を含む境界外の座標は画像内へclampし、画像外やloading/error領域では
ルーペを表示しない。ルーペは入力操作と画像表示を遮らない。

### REQ-FR-B01-005: 設定復元

scale mode、任意倍率、ルーペ有効状態はアプリ専用ローカル設定へ保存し、再起動時に復元する。
設定の保存先はlibrary root外とし、既存設定や読書位置と同じlocal-only境界で扱う。

## 直接観測テスト

`FT-B01-001`〜`FT-B01-005`は、接続済み`Viewer`のmodel/componentテストとして実測する。
SKIPは完了条件に含めず、1件でもSKIPがある場合はFR-B01を完了扱いにしない。
