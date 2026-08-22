import { useMemo, useState } from "react";
import {
  SHORTCUT_COMMANDS,
  SHORTCUT_DESCRIPTIONS,
  SHORTCUT_GROUP_LABELS,
  SHORTCUT_GROUPS,
  SHORTCUT_LABELS,
  type ShortcutBindings,
  type ShortcutCommand,
  type ShortcutGroup,
} from "../input/shortcuts";

type HelpTopic = {
  id: string;
  icon: string;
  title: string;
  summary: string;
  sections: readonly {
    title: string;
    body?: string;
    steps?: readonly string[];
    note?: string;
  }[];
};

const HELP_TOPICS: readonly HelpTopic[] = [
  {
    id: "start",
    icon: "⌂",
    title: "はじめに",
    summary: "作品を開いて読み始めるまでの基本的な流れです。",
    sections: [
      {
        title: "3ステップで読み始める",
        steps: [
          "左側のフォルダーツリーから、作品が保存されている場所を選びます。",
          "一覧でフォルダー、漫画、単独画像、またはPDFを選びます。",
          "Enterキーを押すか、項目をダブルクリックして開きます。",
        ],
      },
      {
        title: "ファイルメニューから開く",
        body: "ファイルメニューからフォルダーやファイルを直接選ぶこともできます。最近開いた作品は、同じメニューからもう一度開けます。",
        note: "ヘルプはアプリに同梱されているため、インターネット接続は不要です。",
      },
    ],
  },
  {
    id: "open",
    icon: "▣",
    title: "作品を開く",
    summary: "フォルダー、漫画、画像、PDFを一覧やメニューから開きます。",
    sections: [
      {
        title: "一覧から開く",
        body: "一覧で項目を選び、Enterキーを押します。フォルダーを開くとその場所へ移動し、漫画・単独画像・PDFを開くとビューワへ切り替わります。",
      },
      {
        title: "最近使った項目",
        body: "ファイルメニューには、正常に開けた最近の作品が新しい順に表示されます。不要になった履歴は履歴画面から消去できます。",
      },
    ],
  },
  {
    id: "catalog",
    icon: "☷",
    title: "フォルダーと作品一覧",
    summary: "場所の移動、表示形式、並べ替え、複数選択を使います。",
    sections: [
      {
        title: "場所を移動する",
        body: "フォルダーツリーまたはアドレス欄を使って移動します。戻る・進む・上へ移動する操作も利用できます。アドレスの編集中にEscキーを押すと、編集前の表示へ戻ります。",
      },
      {
        title: "一覧を見やすくする",
        body: "詳細リストやサムネイルなどの表示形式を選び、名前・種類・サイズ・更新日時で並べ替えられます。複数の項目を選択してファイル操作を行うこともできます。",
      },
    ],
  },
  {
    id: "viewer",
    icon: "◫",
    title: "漫画を読む",
    summary: "ページ移動、見開き、倍率、ルーペなどを操作します。",
    sections: [
      {
        title: "ページを移動する",
        body: "PageDownキーで次へ、PageUpキーで前へ移動します。作品を閉じて一覧へ戻るにはEscキーを押します。",
      },
      {
        title: "表示を切り替える",
        body: "単ページ・見開き・スクロール、読み方向、表示倍率を切り替えられます。細部を確認するときはルーペやグリッド、読書位置を残すときはしおりを利用できます。",
        note: "ここに表示されるキーは初期値です。現在の割り当ては「キー操作」で確認してください。",
      },
    ],
  },
  {
    id: "search",
    icon: "⌕",
    title: "作品を検索する",
    summary: "名前、種類、サイズ、日付、場所を組み合わせて絞り込みます。",
    sections: [
      {
        title: "検索ペインを開く",
        body: "Ctrl+Fキーでフォルダーツリーと検索ペインを切り替えます。名前の一部やファイル名の条件に加え、種類・サイズ・更新日・検索場所を指定できます。",
      },
      {
        title: "検索結果から戻る",
        body: "検索結果の項目から保存されている親フォルダーへ移動できます。条件を変更すれば、そのまま検索をやり直せます。",
      },
    ],
  },
  {
    id: "files",
    icon: "▤",
    title: "ファイルを整理する",
    summary: "名前の変更、フォルダー作成、コピー、移動、ごみ箱を使います。",
    sections: [
      {
        title: "基本的なファイル操作",
        body: "一覧で対象を選び、編集メニューまたは右クリックメニューから操作します。名前の変更、フォルダー作成、コピー、切り取り、貼り付け、ごみ箱への移動を利用できます。",
      },
      {
        title: "実行前の確認",
        body: "移動や削除などの操作では対象を確認してください。同じ名前の項目があるなど、安全に実行できない場合は処理を中止して理由を表示します。",
        note: "ごみ箱への移動を除き、Comic Explorerが作品の原本を自動的に書き換えることはありません。",
      },
    ],
  },
  {
    id: "settings",
    icon: "⚙",
    title: "表示と操作を設定する",
    summary: "一覧、ビューワ、画面、入力、設定プロファイルを調整します。",
    sections: [
      {
        title: "統合設定を開く",
        body: "オプションメニューから統合設定を開きます。設定名や説明を検索し、一覧表示・ビューワ・画面・入力などを使い方に合わせて変更できます。",
      },
      {
        title: "変更を保存する",
        body: "変更内容は「適用」を選ぶまで保存されません。設定プロファイルとして書き出すと、用途別の設定を保存したり、別の環境へ移したりできます。",
      },
    ],
  },
  {
    id: "safety",
    icon: "◇",
    title: "データとプライバシー",
    summary: "原本、履歴、外部通信に関する安全上の方針です。",
    sections: [
      {
        title: "作品データの扱い",
        body: "表示の回転・反転・倍率変更などは画面上だけに適用され、作品の原本を書き換えません。ファイル操作は、利用者が対象と操作を明示した場合だけ実行されます。",
      },
      {
        title: "履歴と通信",
        body: "最近使った項目などの履歴は、このPC上のアプリ専用領域に保存され、アプリから消去できます。このヘルプの閲覧に外部通信は必要なく、外部サイトも開きません。",
      },
    ],
  },
];

type HelpSelection = HelpTopic["id"] | "shortcuts";

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("ja").trim();
}

function topicSearchText(topic: HelpTopic): string {
  return [
    topic.title,
    topic.summary,
    ...topic.sections.flatMap((section) => [
      section.title,
      section.body ?? "",
      ...(section.steps ?? []),
      section.note ?? "",
    ]),
  ].join(" ");
}

function ShortcutList({ commands, shortcuts }: {
  commands: readonly ShortcutCommand[];
  shortcuts: ShortcutBindings;
}) {
  return (
    <dl className="help-shortcut-list">
      {commands.map((command) => (
        <div key={command}>
          <dt>
            <strong>{SHORTCUT_LABELS[command]}</strong>
            <span>{SHORTCUT_DESCRIPTIONS[command]}</span>
          </dt>
          <dd>{shortcuts[command].map((binding) => <kbd key={binding}>{binding}</kbd>)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function OfflineHelp({ shortcuts, onClose }: {
  shortcuts: ShortcutBindings;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<HelpSelection>("start");
  const needle = normalize(query);
  const isSearching = needle !== "";
  const matchedTopics = useMemo(() => isSearching
    ? HELP_TOPICS.filter((topic) => normalize(topicSearchText(topic)).includes(needle))
    : [], [isSearching, needle]);
  const matchedShortcuts = useMemo(() => isSearching
    ? SHORTCUT_COMMANDS.filter((command) => normalize([
      SHORTCUT_LABELS[command],
      SHORTCUT_DESCRIPTIONS[command],
      ...shortcuts[command],
    ].join(" ")).includes(needle))
    : [], [isSearching, needle, shortcuts]);
  const selectedTopic = HELP_TOPICS.find((topic) => topic.id === selection);
  const resultCount = matchedTopics.length + matchedShortcuts.length;

  const select = (next: HelpSelection) => {
    setSelection(next);
    setQuery("");
  };

  return (
    <div className="dialog-backdrop">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        className="help-dialog offline-help"
        onKeyDown={(event) => { if (event.key === "Escape") onClose(); }}
      >
        <header className="help-dialog-header">
          <div>
            <p className="dialog-kicker">オフラインガイド</p>
            <h2 id="help-title">Comic Explorer ヘルプ</h2>
            <p className="dialog-description">使い方と現在のキー操作を確認できます。</p>
          </div>
          <label className="help-search">
            <span aria-hidden="true">⌕</span>
            <input
              autoFocus
              type="search"
              aria-label="ヘルプを検索"
              placeholder="使い方やキー操作を検索"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query !== "" && (
              <button type="button" aria-label="ヘルプ検索をクリア" onClick={() => setQuery("")}>×</button>
            )}
          </label>
          <button className="help-close-icon" type="button" aria-label="ヘルプを閉じる" onClick={onClose}>×</button>
        </header>

        <div className="help-dialog-body">
          <nav className="help-navigation" aria-label="ヘルプの章">
            {HELP_TOPICS.map((topic) => (
              <button
                key={topic.id}
                type="button"
                aria-current={!isSearching && selection === topic.id ? "page" : undefined}
                onClick={() => select(topic.id)}
              >
                <span className="help-navigation-icon" aria-hidden="true">{topic.icon}</span>
                <span><strong>{topic.title}</strong><small>{topic.summary}</small></span>
                {isSearching && matchedTopics.includes(topic) && <span className="help-match-dot" aria-label="一致あり" />}
              </button>
            ))}
            <button
              type="button"
              aria-current={!isSearching && selection === "shortcuts" ? "page" : undefined}
              onClick={() => select("shortcuts")}
            >
              <span className="help-navigation-icon" aria-hidden="true">⌨</span>
              <span><strong>キー操作</strong><small>現在のショートカットを確認</small></span>
              {isSearching && matchedShortcuts.length > 0 && <span className="help-match-count">{matchedShortcuts.length}</span>}
            </button>
          </nav>

          <main className="help-content">
            {isSearching ? (
              <section className="help-search-results" aria-label="ヘルプの検索結果">
                <header className="help-content-header">
                  <p>検索結果</p>
                  <h3>「{query.trim()}」</h3>
                  <span>{resultCount} 件</span>
                </header>
                {resultCount === 0 && (
                  <div className="help-empty" role="status">
                    <strong>一致する説明はありません</strong>
                    <span>別の言葉で検索するか、検索をクリアしてください。</span>
                    <button type="button" onClick={() => setQuery("")}>検索をクリア</button>
                  </div>
                )}
                {matchedTopics.length > 0 && (
                  <section className="help-result-group" aria-label="一致した章">
                    <h4>使い方</h4>
                    {matchedTopics.map((topic) => (
                      <button className="help-topic-result" type="button" key={topic.id} onClick={() => select(topic.id)}>
                        <span aria-hidden="true">{topic.icon}</span>
                        <span><strong>{topic.title}</strong><small>{topic.summary}</small></span>
                        <span aria-hidden="true">›</span>
                      </button>
                    ))}
                  </section>
                )}
                {matchedShortcuts.length > 0 && (
                  <section className="help-result-group" aria-label="一致したキー操作">
                    <h4>キー操作</h4>
                    <ShortcutList commands={matchedShortcuts} shortcuts={shortcuts} />
                  </section>
                )}
              </section>
            ) : selection === "shortcuts" ? (
              <article aria-label="現在のショートカット">
                <header className="help-content-header">
                  <p>操作リファレンス</p>
                  <h3>現在のキー操作</h3>
                </header>
                <p className="help-lead">統合設定で保存されている現在の割り当てです。この画面から変更はできません。</p>
                {(["catalog", "viewer"] as const).map((group: ShortcutGroup) => (
                  <section className="help-article-section" key={group} aria-label={SHORTCUT_GROUP_LABELS[group]}>
                    <h4>{SHORTCUT_GROUP_LABELS[group]}</h4>
                    <ShortcutList
                      commands={SHORTCUT_COMMANDS.filter((command) => SHORTCUT_GROUPS[command] === group)}
                      shortcuts={shortcuts}
                    />
                  </section>
                ))}
              </article>
            ) : selectedTopic !== undefined ? (
              <article aria-label={selectedTopic.title}>
                <header className="help-content-header">
                  <p>使い方</p>
                  <h3>{selectedTopic.title}</h3>
                </header>
                <p className="help-lead">{selectedTopic.summary}</p>
                {selectedTopic.sections.map((section) => (
                  <section className="help-article-section" key={section.title}>
                    <h4>{section.title}</h4>
                    {section.body !== undefined && <p>{section.body}</p>}
                    {section.steps !== undefined && (
                      <ol>{section.steps.map((step) => <li key={step}>{step}</li>)}</ol>
                    )}
                    {section.note !== undefined && <aside className="help-note"><strong>ヒント</strong><span>{section.note}</span></aside>}
                  </section>
                ))}
              </article>
            ) : null}
          </main>
        </div>

        <footer className="help-dialog-footer">
          <span>すべての説明はアプリに同梱されています。</span>
          <button type="button" data-product-id="shortcut-dialog-close" onClick={onClose}>閉じる</button>
        </footer>
      </section>
    </div>
  );
}
