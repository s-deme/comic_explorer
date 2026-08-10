---
codd:
  node_id: "req:fr-b02"
  type: requirement
  status: approved
  confidence: 0.92
  depends_on:
    - id: "req:mvp-requirements"
      relation: "extends"
      semantic: "end-of-volume-contract"
    - id: "req:product-questionnaire"
      relation: "derives_from"
      semantic: "Q5-6-adoption"
---

# FR-B02 巻末動作要件

## 採用記録

Q5-6由来の候補をC0で採用し、`FUT-C-020`をumbrella、`FUT-C-038`〜`FUT-C-041`を
原子optionとして一つのpolicy契約へ統合する。採用IDは次の5件で固定する。

`FUT-C-020`, `FUT-C-038`, `FUT-C-039`, `FUT-C-040`, `FUT-C-041`

既存`REQ-MVP-016`の確認なし自動遷移は、既定値`auto_next`として維持する。

## REQ-FR-B02-001: policy interface

巻末動作は次のenumだけを受け付け、設定値をUI、UI-backend境界、SQLiteへ同じ文字列で
渡す。

| policy | 採用ID | 次項目がある場合 |
|---|---|---|
| `auto_next` | FUT-C-020 | 確認なしでsort済み直後の漫画項目を開く |
| `confirm_next` | FUT-C-038 | 確認dialogを表示し、承認後だけ直後の漫画項目を開く |
| `return_library` | FUT-C-039 | 現在の読書位置を確定してlibraryへ戻る |
| `stop` | FUT-C-040 | 現在の巻末に留まり停止状態を表示する |
| `loop` | FUT-C-041 | 直後があれば開き、なければsort済み最初の漫画項目を開く |

不正値、旧DBに値がない場合、または応答値が不正な場合は`auto_next`へ戻す。
policy resolverの入力は、現在の一覧で選択されているsort条件を適用済みの配列、現在の
漫画項目relative path、policyの3値とし、出力は`open`、`confirm`、`return_library`、
`stop`のいずれかに限定する。resolverは一覧を再取得・再sortしない。

## REQ-FR-B02-002: no-next safety

次の漫画項目が存在しない場合、`loop`だけはsort済み先頭の漫画項目へ戻る。それ以外の
policyは現在の巻末に留まり、「次の漫画がない」ことを表示する。空一覧、現在項目消失、
読込み失敗でも原本・library管理領域へ書込みを行わず、安全停止として扱う。

## REQ-FR-B02-003: sort and persistence

次項目とloop先頭は`REQ-MVP-007`の確定sort済みsnapshotから解決し、folder項目を飛ばして
`comicFolder`または`archive`だけを対象とする。policyは既存app-local SQLite `settings`
tableの`endOfVolumePolicy`へ保存し、再起動後に復元する。library root配下へDB、cache、
temp、log、sidecarを作成せず、外部通信を追加しない。

## C0/C1 ownership checkpoint

FR-B02は一名のintegration ownerで実装する。C0で5 enum、default、no-next/loop意味論を
固定し、C1で次のpath ownershipと順序を凍結する。

| boundary | owned paths | contract |
|---|---|---|
| resolver | `src/features/catalog/end-of-volume.ts`, `src/features/catalog/end-of-volume.test.ts` | sorted snapshot + current path + policy → decision |
| UI integration | `src/App.tsx`, `src/styles.css` | select、confirm dialog、安全停止表示、既定挙動維持 |
| persistence/API | `src/features/library/client.ts`, `src-tauri/src/application/mod.rs`, `src-tauri/src/state/repository.rs`, `src-tauri/src/lib.rs` | enum validation、default、SQLite save/load、local-only |
| direct evidence | `docs/requirements/end-of-volume-requirements.md`, `docs/testing/fr-b02-results.md`, `docs/product/feature-status.md`, `docs/product/feature-roadmap.md` | adopted IDs、実装path、FT-B02、gate結果を同期 |

FR-B03〜FR-B12はこのpilotの評価・最終QCまで開始せず、別taskで再評価する。

## 直接観測テスト

`FT-B02-001`〜`FT-B02-006`をresolver/UI/persistenceの接続済みテストとして実測する。
SKIPは完了扱いにせず、1件でもSKIPがあればFR-B02をPASSへ更新しない。
