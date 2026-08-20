import { useMemo, useState } from "react";
import {
  SHORTCUT_COMMANDS,
  SHORTCUT_LABELS,
  type ShortcutBindings,
} from "../input/shortcuts";

const HELP_TOPICS = [
  { id: "start", title: "はじめに", body: "PC配下のドライブまたはファイルメニューからフォルダ・漫画・単独画像・PDFを開きます。" },
  { id: "folders", title: "フォルダと一覧", body: "フォルダツリー、アドレス、並べ替え、一覧形式、複数選択を使ってlibrary内を移動します。Esc: アドレス編集を戻す。" },
  { id: "viewer", title: "ビューワ", body: "単ページ・見開き・スクロール、倍率、ルーペ、グリッド、しおり、巻末動作を切り替えます。" },
  { id: "search", title: "検索", body: "名前、mask、種類、サイズ、日付、場所を組み合わせます。検索結果から親folderへ戻れます。" },
  { id: "files", title: "ファイル操作", body: "rename、folder作成、copy、move、paste、ごみ箱を実行前の対象確認と衝突拒否の境界で扱います。" },
  { id: "settings", title: "設定", body: "CtrlまたはCommandとコンマで統合設定を開きます。変更は適用するまでdraftで、profileへ書き出せます。" },
  { id: "safety", title: "プライバシーと安全", body: "外部通信を行わず、原本を書き換えません。任意code pluginを読み込まず、履歴はapp-localで消去できます。" },
] as const;

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ja").trim();
}

export function OfflineHelp({ shortcuts, onClose }: {
  shortcuts: ShortcutBindings;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const matched = useMemo(() => {
    const needle = normalize(query);
    return needle === "" ? HELP_TOPICS : HELP_TOPICS.filter((topic) =>
      normalize(`${topic.title} ${topic.body}`).includes(needle),
    );
  }, [query]);
  return (
    <div className="dialog-backdrop">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        className="help-dialog offline-help"
        onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}
      >
        <h2 id="help-title">キー操作とショートカット</h2>
        <p>Comic Explorer オフラインヘルプ</p>
        <section aria-label="一般ヘルプ">
          <h3>一般ヘルプ</h3>
          <p>フォルダ・漫画・単独画像をEnterで開きます。すべての説明はアプリへ同梱され、networkを使いません。</p>
        </section>
        <label>
          topicを検索
          <input
            autoFocus
            type="search"
            aria-label="ヘルプを検索"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <nav aria-label="ヘルプtopic">
          {matched.map((topic) => <a key={topic.id} href={`#help-${topic.id}`}>{topic.title}</a>)}
        </nav>
        {matched.length === 0 && <p role="status">該当するtopicはありません。</p>}
        <div className="offline-help-topics">
          {matched.map((topic) => (
            <section id={`help-${topic.id}`} key={topic.id} aria-label={topic.title}>
              <h3>{topic.title}</h3><p>{topic.body}</p>
            </section>
          ))}
        </div>
        <section aria-label="現在のショートカット">
          <h3>現在のショートカット</h3>
          <dl>{SHORTCUT_COMMANDS.map((command) => (
            <div key={command}><dt>{SHORTCUT_LABELS[command]}</dt><dd>{shortcuts[command]}</dd></div>
          ))}</dl>
        </section>
        <button type="button" data-product-id="shortcut-dialog-close" onClick={onClose}>閉じる</button>
      </section>
    </div>
  );
}
