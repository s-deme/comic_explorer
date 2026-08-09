---
codd:
  node_id: "req:fr-b11"
  type: requirement
  status: approved
  confidence: 0.9
  depends_on:
    - id: "req:mvp-requirements"
      relation: "extends"
      semantic: "keyboard-click-wheel-escape-and-local-only-contract"
    - id: "req:product-questionnaire"
      relation: "derives_from"
      semantic: "Q5-5-input-customization"
---

# FR-B11 入力拡張要件

## 採用範囲と境界

FR-B11は、利用者がviewer/navigationの操作割当を自分の環境へ合わせるためのkeyboard
shortcut customizationを、touchとgamepadの将来入力経路と同じinput command契約の下で扱う。
今回のsemantic受入範囲はkeyboardのremap/conflict/reset、keyboard fallbackとfocus境界、
restart/accessibilityの三契約である。touchとgamepadは実機観測が必要な外部環境項目であり、
現環境では `BLOCKED_UNMEASURED` とする。

設定は既存のapp-local metadata/settings境界へ保存する。漫画folder、画像、ZIP/CBZ、sidecar、
library管理fileへ書き込まず、外部通信、外部同期、外部サービス、原本自動変更を行わない。
Windows WebView2 native product UI、UIA/screen-reader/DPI、OS syscall、およびtouch/gamepad
hardwareの未観測結果をcomponentまたはlocal evidenceで代替しない。

## REQ-FR-B11-001: command mapping, remap, conflict, and reset

production Appは、既存のviewer/navigation command（次ページ、前ページ、viewer終了、表示mode、
読み方向、倍率変更など）を入力割当へ変換し、利用者がkeyを再割当できるようにする。入力keyは
正規化した一意表現で保持し、未知形式、空値、修飾キーだけの値、同一keyの重複割当は拒否する。
conflict拒否時は既存設定を変更せず、対象commandと衝突先を利用者へ示す。command単位および
全体resetは安全な既定割当へ戻し、reset後も他のviewer設定を壊さない。

## REQ-FR-B11-002: keyboard fallback, focus, and viewer boundary

custom shortcutが未設定、旧形式、または不正な保存値の場合は安全な既定keyboard fallbackへ復元する。
focused input、textarea、select、button、contenteditableではviewer commandを発火させず、入力欄の
編集を優先する。viewerが表示されていないnavigation境界ではviewer専用commandを誤発火させず、
page navigationと読み方向に応じた左右キーの意味を保つ。click、wheel、Escの既存契約を壊さない。

## REQ-FR-B11-003: restart persistence and accessible help

有効なshortcut設定はapp-local settingsへ保存し、再起動・再open後に同じcommand mappingを復元する。
欠損、壊れたJSON、未知command、重複keyの設定を読み込んだ場合は全体を安全な既定値へ戻し、
起動を停止させない。help UIは各commandのlabelと現在のshortcutをaccessible nameで提示し、
変更・conflict・resetの結果を利用者が確認できる。

## REQ-FR-B11-004: touch and gamepad capability boundary

touch gestureとgamepad mappingはkeyboard commandと同じcommand境界へ接続し、disconnect、未対応、
入力欠損時には安全にviewer状態を保つ。実機または同等の製品入力経路を観測できない環境では、
FT-B11-002/003を `BLOCKED_UNMEASURED` と記録する。未測定をPASSへ読み替えず、SKIPをPASS数へ
加算しない。実機が用意された後に、gesture boundary、gamepad mapping、disconnect recoveryを再測定する。

## 直接観測テスト契約

| Test ID | 接続境界 | 観測契約 | 今回の判定 |
|---|---|---|---|
| FT-B11-001 | production App → shortcut mapping → settings command | remap、conflict拒否、reset、local-only | semantic ACCEPT |
| FT-B11-002 | product touch input → viewer command | gesture、boundary、未対応時の安全な復帰 | `BLOCKED_UNMEASURED` |
| FT-B11-003 | product gamepad input → viewer command | mapping、disconnect、未対応時の安全な復帰 | `BLOCKED_UNMEASURED` |
| FT-B11-004 | App/viewer keydown → focus guard → navigation/viewer | fallback、focused input suppression、Viewer境界 | semantic ACCEPT |
| FT-B11-005 | settings persistence → restart → accessible help | restart復元、safe default、accessible label/name | semantic ACCEPT |

focused testはproduction Appと既存client/Tauri commandの接続境界を観測する。mockだけ、flagだけ、
pure unitだけ、またはSKIPだけを完了根拠にしない。SKIPが1件でもある機能経路は完了扱いにしない。

## C0/C1および検証境界

C0では全contract matrixをexact 5 ID（FT-B11-001〜005）として固定する。一方、accepted executable
C0の選択対象はFT-B11-001/004/005のexact3で、selected_count=3とする。FT-B11-002/003は別の
BLOCKED_UNMEASURED ledgerに記録し、accepted executableおよびPASS/SKIP countの外に置く。keyboard
部分のaccepted source SHA、canonical command、toolchain選択、owned path、raw destinationも固定する。
今回のaccepted keyboard sliceではFT-B11-001/004/005のfocused exact3、App回帰、Windows offline Rust、
typecheck、buildを各一回の不変rawとして受理した。
文書同期ではこれらのcommandを再実行しない。初回FAIL、同一根因redo、source typing修正の履歴は
accepted evidenceから分離する。CoDDのstructural exception、native UI、hardware未測定をPASSへ昇格しない。

詳細な最終manifest、source SHA、stdout/stderr SHA、rejected history、exact-12差分境界は
[FR-B11結果](../testing/fr-b11-results.md)に記録する。
