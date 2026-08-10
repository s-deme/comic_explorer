---
codd:
  node_id: "test:fr-b20-results"
  type: test
  status: active
  confidence: 0.9
  depends_on:
    - id: "req:roadmap-priorities"
      relation: "verifies"
      semantic: "p10-thumbnail-maintenance-contract"
    - id: "test:fr-b19-results"
      relation: "derives_from"
      semantic: "app-local-settings-and-ui-boundary"
---

# FR-B20 thumbnail保守結果

P10（FR-B20）の実装は接続済みだが、この証跡で確認できたのはfocused utility、TypeScript接続、
入力・保存helperの境界までである。製品WebView2で利用者が保存先を選び、実JPEGがdiskへ書かれる
product save gateは未実測のため、受入全体は`Implemented / PARTIAL (product gate NOT TESTED)`とする。
既存の自動生成thumbnail cacheを利用者データへ昇格させず、利用者が明示的に読み込んだJPEGだけを
app-localの管理対象として追加した。

| Test ID | 結果 | 直接観測と未測定境界 |
|---|---|---|
| FT-B20-001 | PARTIAL | 件数・実bytes、prototype-safe map、library-root名前空間、削除用stateとApp接続はutility test/typecheckでPASS。製品dialog操作と再起動後の保持はNOT TESTED |
| FT-B20-002 | PARTIAL / NOT TESTED | native picker mockのwrite/close完了、取消伝播、anchor fallback開始のhelper境界はPASS。fresh generated grantから製品WebView2の実保存先へJPEGを書き、disk bytesと成功通知を確認するproduct gateはNOT TESTED |
| FT-B20-003 | PARTIAL | JPEGのSOI/segment/SOF/SOS/EOI、browser decode、宣言bytes、対象kind・一意性・重複・3 MiB上限のutility境界はPASS。製品file pickerからの一括読込操作はNOT TESTED |

2026-08-10のWindows focused実測では`thumbnail-maintenance.test.ts`が11/11 PASSし、Windows
TypeScript typecheckもPASSした。これはutilityとcompile-time接続の証跡であり、製品UIや実disk
保存の直接観測へ読み替えない。app-local管理層の容量上限は3 MiBで、library-rootごとに分離する。
network・library原本・ZIP/CBZ書庫への書込みは実装せず、自動生成cacheの内部evictionは既存pipelineへ
委譲して利用者管理操作と混同しない。旧root非依存storeは安全に帰属できないため自動移行せず、存在検出と
再読込案内を実装した。案内を含む製品dialog操作は未実測である。
