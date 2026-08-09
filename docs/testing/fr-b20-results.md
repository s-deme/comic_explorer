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

P10（FR-B20）は`Implemented / PASS`とする。既存の自動生成thumbnail cacheを利用者データへ
昇格させず、利用者が明示的に読み込んだJPEGだけをapp-localの管理対象として追加した。

| Test ID | 結果 | 直接観測 |
|---|---|---|
| FT-B20-001 | PASS | 管理dialogで件数・bytesを表示し、読み込んだthumbnailだけを削除。原本は変更しない |
| FT-B20-002 | PASS | 選択中のgenerated/imported thumbnailを利用者のdownload先へJPEG保存 |
| FT-B20-003 | PASS | 複数JPEGを現在一覧のarchive/comicFolderへ一意に対応付け、形式・重複・容量超過を拒否 |

focused utility 3 tests、frontend全体21 files / 120 tests、typecheckはPASS。Windows-native CoDD
scan/check/verifyはexit 0、red 0。app-local管理層の容量上限は3 MiB、network・library原本・
ZIP/CBZ書庫への書き込みは行わない。自動生成cacheの内部evictionは既存pipelineに委譲し、
利用者管理操作と混同しない。
