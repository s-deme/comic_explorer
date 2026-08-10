---
codd:
  node_id: "design:project-architecture"
  type: design
  status: approved
  confidence: 0.95
  depends_on:
    - id: "req:project-requirements"
      relation: "implements"
      semantic: "current-system-contract"
---

# Comic Explorer 現行アーキテクチャ

## 採用構成

| 層 | 現行構成 |
|---|---|
| desktop shell | Tauri 2、Windows WebView2、NSIS |
| frontend | React 19、TypeScript、Vite、TanStack Virtual、HTML/CSS |
| backend | Rust 2024 edition、Tokio、typed Tauri commands |
| catalog/archive | read-only filesystem adapter、`zip`（Deflate、default features off）、自然順 |
| image/thumbnail | WebView2 page decode、WIC thumbnail pipeline、静止WebPは`image-webp`によるpure-Rust decode |
| persistence | app-local SQLite WAL（`rusqlite` bundled）、local settings/collections、file cache |
| verification | Vitest/Testing Library、Python unittest、Cargo test、Windows release product harness、CoDD |

native entry pointは`src-tauri/src/main.rs`、Tauri composition rootは`src-tauri/src/lib.rs`、
UI entry pointは`src/main.tsx`、root componentは`src/App.tsx`である。

## frontend/backend境界

```text
React shell/tree/catalog/viewer/settings
        │ typed command + request ID + generation
        ▼
Rust api/application coordinator
        ├─ catalog: folder/archive/image metadata/natural sort
        ├─ media: opaque grant/token and bounded page delivery
        ├─ state: SQLite, reading data, settings, fingerprints
        ├─ thumbnail: queue, decode, cache, LRU
        └─ tray/diagnostics/error presentation boundary
```

frontendは表示、focus、selection、dialog、virtual range、即時feedbackを担当する。backendは
root/path認可、列挙、archive、MIME/metadata、generation、queue、cache、SQLiteを担当する。
frontendへ任意のhost path、SQL、archive entry accessを渡さない。成功、分類済みerror、cancel、
stale responseを構造的に区別する。

## catalogとnavigation

登録rootはbackendでcanonicalizeし、すべての相対pathがroot内に留まることを検証する。folder、
comic folder、画像、ZIP/CBZ、unsupported archiveをtyped kindとして列挙し、自然順と選択中sortを
適用する。tree、address、catalogは同じcurrent folderを指し、back/forward/up/history jumpと
明示refreshは同じnavigation stateを更新する。

catalogはvirtualizeし、表示範囲外のthumbnail処理を遅延する。検索、mask、複数選択、property、
CSV、recent、bookmark、bookshelf、favorite、tag、memo/history/ratingは既存catalog identityと
root namespaceを再利用する。OS全体のfile managerには拡張しない。

## viewerとmedia

folder pageはread-only file stream、ZIP/CBZ pageは必要entryだけをinflateし、libraryへ展開しない。
catalogの画像を直接開く経路も親folderをviewer itemとして同じfolder page群を列挙し、選択pageから開始する。
pageは相対page keyの自然順で管理する。単page、見開き、読み方向、fit/scale、ルーペ、巻末policy、
bookmark、読書位置はviewer modelを介して整合させる。

media URLにはhost pathを含めず、server-sideのsession/pageへ結び付いたopaque tokenを使う。
Windowsは`http://comic.localhost/<token>`へplatform-mapし、query/fragment、traversal、absolute/drive/UNC、
不正Origin/Referer、期限切れ・別session tokenを拒否する。応答は正しいMIME/length、`nosniff`、
限定CORSを持ち、内部errorや原本pathを開示しない。

navigationとviewerは別の単調増加generationを持つ。新要求は旧taskをcancelし、cancel不能区間の
完了結果もgeneration不一致ならcommitしない。page workerとthumbnail workerはbounded queueを使い、
shutdownは新規受付拒否、task cancel/join、読書位置flush、media grant失効、handle closeの順で進む。

## thumbnailとcache

thumbnailは自然順の先頭表示可能pageから生成し、長辺384px、拡大なし、JPEG quality 82を基本とする。
JPEG/JPG/PNGはWIC、静止WebPはWIC codecに依存しないpure-Rust decoderを使う。animated WebP/GIF、
破損画像、過大dimensionは局所errorまたはplaceholderとし、他項目の操作を止めない。

source fingerprintはfile size/mtimeと必要なarchive metadataを含む。生成物はtemp write後にatomic renameし、
DB transactionでindexを更新する。cache rootは`%LOCALAPPDATA%\ComicExplorer\cache`、自動生成thumbnailは
10GiB LRU、利用者が明示importするJPEG storeは3MiB上限でrootごとに分離する。生成中・表示中のentryを
pinし、negative cacheで破損fileの無限retryを防ぐ。

## SQLiteと利用者状態

SQLite WALはsettings、reading position、fingerprint、thumbnail index、favorite、tag、memo、history、
ratingなどのapp-local状態を保持する。SQLはRust repository境界だけから発行する。schema migrationは
短いtransactionで段階的・冪等に行い、失敗を成功として通知しない。

読書位置はitem identityとrelative page keyを正本とし、page追加・削除後は安全な近傍へ解決する。
DB破損または非対応schemaは元DBをapp-local `recovery`へ隔離して空DBで継続し、再初期化と隔離先を
通知する。原本から再構築できない利用者metadataはcacheと区別する。

## path安全性と原本非破壊

- filesystem adapterはread-only openと列挙だけを公開し、domainにrename/write/delete/create APIを持ち込まない。
- archive entry名をhost pathへ結合せず、暗号化、未対応compression、traversal、size上限超過を読む前に拒否する。
- cache、DB、profile、export、temp、recovery、logはlibrary root外だけに置く。
- CSVやclipboardへはlibrary-root相対pathだけを出し、CSV formula-leading cellを無害化する。
- error回復は原本の修復、削除、上書きを自動実行しない。
- test/product harnessは操作前後のtree、kind、size、mtime、hash、archive entry一覧を比較する。

## 画面状態と主要操作

library shellは5分類menu、toolbar、address、folder/search side pane、catalog、status barから成る。
toolbarの検索buttonはfolder treeと、名前検索・basename maskをまとめたsearch paneを切り替える。catalogは
cover/small/detail/reference tile、sort、search result、selection、loading/empty/errorを区別する。
viewerはsingle/spread、direction、scale、loading/page error/end stateを区別する。settings、quick access、
bookmark/bookshelf、tag、metadata、thumbnail maintenance、help/aboutはdialogまたはmenuから開く。

keyboard focusとselectionは別状態で、menuはroving focusを使う。tree/catalog/viewerの主要操作はkeyboard、
pointerのどちらからも同じcommandへ到達し、catalog cardはダブルクリックまたはEnterで開いて重複する読むbuttonを置かない。
stale responseは現在画面を置換せず、局所error後もretry、
前後移動、別項目open、catalog復帰を可能にする。

## errorと回復

backend errorはcode、target、user message、安全なrecovery、retry可否を持つ。利用者向け分類はaccess、
missing、unsupported、corrupt、encrypted、temporarily unavailable、app-data resetである。thumbnail errorは
item局所、page errorはviewer局所、root/DB起動errorだけをshell-levelにする。stack traceや原本内容を
主メッセージへ出さず、telemetry/crash uploadを行わない。

## 現在の設計判断

Tauri/React/Rust、SQLite bundled、ZIP Deflate、opaque media token、bounded worker、app-local cacheを
採用済みとする。比較検討と実装phaseの完了履歴はGit履歴から参照する。Windows製品性能、
clean VM、UIA/DPI、外部通信監視、GIF/AVIF decode、RAR/7z reader、tray/file pickerの実製品gateは
設計未決ではなく検証未完了であり、[status.md](status.md)と[verification.md](verification.md)で追跡する。
