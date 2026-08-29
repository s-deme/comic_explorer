---
codd:
  node_id: "req:project-requirements"
  type: requirement
  status: approved
  confidence: 0.95
---

# Comic Explorer 現行要件

この文書は現行の利用者契約だけを記す。実装経緯と過去の測定値はGit履歴、Leeyes機能ごとの進捗・参照先は
`leeyes-feature-tracker.csv` を正本とする。

## 製品境界

- WindowsのローカルdriveをExplorer風に閲覧し、画像folder、対応archive、PDFを安全に読む。
- 原本、archive、thumbnail cacheを閲覧・読書位置保存によって変更しない。明示的なfile manager操作だけが例外である。
- path、archive entry、SQLはbackendで検証する。設定、DB、cache、temp、logはapp-local領域だけに置く。
- 通常利用はofflineで完結し、telemetry、cloud同期、外部書誌取得、外部データ送信を行わない。

## MVP契約

| ID | 現行契約 |
|---|---|
| REQ-MVP-001 | Windows logical driveを開始地点として安全に復元・閲覧する。 |
| REQ-MVP-002 | 任意のfolder階層を固定metadataなしで扱う。 |
| REQ-MVP-003 | folder tree、現在位置、選択、展開を同期する。 |
| REQ-MVP-004 | drive境界を検証したaddress入力と履歴移動を提供する。 |
| REQ-MVP-005 | catalogに対応種別と判別可能な表示を出す。 |
| REQ-MVP-006 | 範囲を制限した非同期thumbnailとcacheを使う。 |
| REQ-MVP-007 | sort、一覧形式、形式別thumbnail寸法を保存・復元する。名前順ではひらがなとカタカナを同じ読みとして比較し、混在して五十音順に並べる。 |
| REQ-MVP-008 | 対応画像folderを安全に1冊として読む。 |
| REQ-MVP-009 | 対応archiveを上限・危険path検証付きで非展開閲覧する。UTF-8 flagのないShift_JIS名を持つZIPも、安全な内部pathとして読み取る。 |
| REQ-MVP-010 | folderは移動、archive・PDF・画像はViewerで開き、文脈を復元する。 |
| REQ-MVP-011 | Viewerはページ送りだけを使い、旧scroll layout値をページ送りへ正規化する。 |
| REQ-MVP-012 | 見開きは最大2pageで、横長・末尾pageは単独表示する。 |
| REQ-MVP-013 | 読み方向を配置、移動、保存へ一貫して適用する。 |
| REQ-MVP-014 | Viewerの入力、page bar、fullscreen、bounded prefetchを提供する。 |
| REQ-MVP-014A | 再利用可能な別native Viewer window、常時使える閉じる操作、native title、用途別toolbarを提供する。 |
| REQ-MVP-015 | page単位の読書位置をapp-local SQLiteへ安全に保存・復元する。 |
| REQ-MVP-016 | catalog順に前後の作品へ安全に移動する。 |
| REQ-MVP-017 | 閲覧、thumbnail、読書位置保存で原本を変更しない。 |
| REQ-MVP-018 | 外部通信とtelemetryを行わない。 |
| REQ-MVP-019 | access、missing、corrupt、unsupported errorから復帰可能にする。 |
| REQ-MVP-020 | 上限検証したPDFを既存Viewer機能へ接続する。 |
| REQ-MVP-021 | 明示的なfile manager操作だけをroot境界・確認・再列挙付きで許可する。 |
| REQ-MVP-022 | 統合設定を用途順に整理し、重複・無効な旧設定を公開schemaから除去する。 |

## 非機能契約

| ID | 現行契約 |
|---|---|
| NFR-MVP-001 | 大規模catalogでも遅延処理、virtualize、bounded thumbnail cacheを使う。 |
| NFR-MVP-002 | 起動、一覧、page、検索、memoryの性能目標を維持し、未測定は未測定と記録する。 |
| NFR-MVP-003 | keyboard操作、focus可視化、判読可能なテーマ、responsiveな一覧・dialogを維持する。 |
| NFR-MVP-004 | 再配布可能license、SBOM、THIRD-PARTY-NOTICESを同期する。 |
| NFR-MVP-005 | Windows installerとportable artifactは既存WebView2を利用する。 |
| NFR-MVP-006 | 実測、推定、未測定を混同しない。 |
| NFR-MAINT-001 | Windows filesystemではWindows-native CoDD、test、typecheck、buildを使う。 |

## Feature要件のID台帳

個別の実装箇所・テスト・delivery statusはCSV台帳にあり、ここでは現行の契約領域と安定IDだけを保持する。

| 領域 | 契約 | 安定ID |
|---|---|---|
| P1 | shell、catalog、Viewer、input、settingsの基礎操作と保存境界 | REQ-LEY-P1-001, REQ-LEY-P1-002, REQ-LEY-P1-003, REQ-LEY-P1-004, REQ-LEY-P1-005, REQ-LEY-P1-006, REQ-LEY-P1-007, REQ-LEY-P1-008, REQ-LEY-P1-009, REQ-LEY-P1-010, REQ-LEY-P1-011, REQ-LEY-P1-012, REQ-LEY-P1-013, REQ-LEY-P1-014, REQ-LEY-P1-015, REQ-LEY-P1-016, REQ-LEY-P1-017, REQ-LEY-P1-018, REQ-LEY-P1-019, REQ-LEY-P1-020, REQ-LEY-P1-021 |
| P2 | Viewerのslide show、見開き、fit、scroll、loupe、prefetch、bookmark、画像操作 | REQ-LEY-P2-001, REQ-LEY-P2-002, REQ-LEY-P2-003, REQ-LEY-P2-004, REQ-LEY-P2-005, REQ-LEY-P2-006, REQ-LEY-P2-007, REQ-LEY-P2-008, REQ-LEY-P2-009, REQ-LEY-P2-010, REQ-LEY-P2-011, REQ-LEY-P2-012, REQ-LEY-P2-013, REQ-LEY-P2-014, REQ-LEY-P2-015, REQ-LEY-P2-016 |
| P3 | search、shortcut、mouse/gesture、file操作、profile、CSV、CLI | REQ-LEY-P3-001, REQ-LEY-P3-002, REQ-LEY-P3-003, REQ-LEY-P3-004, REQ-LEY-P3-005, REQ-LEY-P3-006, REQ-LEY-P3-007, REQ-LEY-P3-008, REQ-LEY-P3-009, REQ-LEY-P3-010, REQ-LEY-P3-011, REQ-LEY-P3-012, REQ-LEY-P3-013, REQ-LEY-P3-014, REQ-LEY-P3-015, REQ-LEY-P3-016, REQ-LEY-P3-017, REQ-LEY-P3-018, REQ-LEY-P3-019, REQ-LEY-P3-020, REQ-LEY-P3-021 |
| P4 | virtual shelf、archive tree、file undo、catalog pane | REQ-LEY-P4-001, REQ-LEY-P4-002, REQ-LEY-P4-003, REQ-LEY-P4-004 |
| P5 | offline media ledger、非破壊画像filter | REQ-LEY-P5-001, REQ-LEY-P5-002 |
| FR-B01〜B11 | 採用済みのcatalog、Viewer、file、settings、help、input feature lane | REQ-FR-B01-001, REQ-FR-B01-002, REQ-FR-B01-003, REQ-FR-B01-004, REQ-FR-B01-005, REQ-FR-B02-001, REQ-FR-B02-002, REQ-FR-B02-003, REQ-FR-B03-001, REQ-FR-B03-002, REQ-FR-B05-001, REQ-FR-B05-002, REQ-FR-B05-003, REQ-FR-B05-004, REQ-FR-B05-005, REQ-FR-B06-001, REQ-FR-B06-002, REQ-FR-B06-003, REQ-FR-B06-004, REQ-FR-B06-005, REQ-FR-B07-001, REQ-FR-B07-002, REQ-FR-B07-003, REQ-FR-B07-004, REQ-FR-B07-005, REQ-FR-B08-001, REQ-FR-B08-002, REQ-FR-B08-003, REQ-FR-B08-004, REQ-FR-B08-005, REQ-FR-B09-001, REQ-FR-B09-002, REQ-FR-B09-003, REQ-FR-B10-001, REQ-FR-B10-002, REQ-FR-B10-003, REQ-FR-B10-004, REQ-FR-B11-001, REQ-FR-B11-002, REQ-FR-B11-003, REQ-FR-B11-004 |
| FR-B21〜B24 | archive、file操作、Viewer外観、theme feature lane | REQ-FR-B21-001, REQ-FR-B21-002, REQ-FR-B21-003, REQ-FR-B22-001, REQ-FR-B22-002, REQ-FR-B22-003, REQ-FR-B22-004, REQ-FR-B23-001, REQ-FR-B23-002, REQ-FR-B23-003, REQ-FR-B23-004, REQ-FR-B24-001, REQ-FR-B24-002, REQ-FR-B24-003, REQ-FR-B24-004, REQ-FR-B24-005, REQ-FR-B24-006 |

新しい利用者挙動を変更するときだけ、この表の契約を更新する。IDを増やす場合は、実装前に要件・受入条件・対応テストを同時に定義する。
