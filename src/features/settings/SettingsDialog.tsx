import { useMemo, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from "react";
import {
  END_OF_VOLUME_POLICY_LABELS,
  normalizeEndOfVolumePolicy,
} from "../catalog/end-of-volume";
import { type SortField } from "../catalog/sort";
import {
  CATALOG_VIEW_MODE_LABELS,
  CATALOG_VIEW_MODES,
  normalizeCatalogViewMode,
} from "../catalog/view-mode";
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_COMMANDS,
  SHORTCUT_FALLBACKS,
  SHORTCUT_LABELS,
  type ShortcutCommand,
} from "../input/shortcuts";
import {
  normalizeViewerLayoutMode,
  VIEWER_LAYOUT_MODE_LABELS,
  VIEWER_LAYOUT_MODES,
  type ScaleMode,
} from "../viewer/model";
import {
  CONFIGURABLE_MOUSE_GESTURE_NAMES,
  MOUSE_GESTURE_ACTIONS,
  type MouseGestureAction,
  type MouseGestureName,
  type SettingsProfile,
} from "./profile";

type SettingsCategory = "catalog" | "viewer" | "interface" | "commands" | "profile";

interface SettingsCategoryDefinition {
  id: SettingsCategory;
  label: string;
  description: string;
  icon: string;
}

const SETTINGS_CATEGORIES: readonly SettingsCategoryDefinition[] = [
  { id: "catalog", label: "一覧表示", description: "並べ替えと表示形式", icon: "▦" },
  { id: "viewer", label: "ビューワ", description: "ページ表示と読み進め方", icon: "▣" },
  { id: "interface", label: "画面", description: "ペインと操作バー", icon: "◫" },
  { id: "commands", label: "操作", description: "キーとジェスチャー", icon: "⌨" },
  { id: "profile", label: "プロファイル", description: "設定の移行と復元", icon: "⇄" },
] as const;

const SORT_FIELD_LABELS: Record<SortField, string> = {
  name: "名前",
  modified: "更新日時",
  size: "サイズ",
  kind: "種類",
};

const VIEW_MODE_LABELS: Record<SettingsProfile["viewMode"], string> = {
  single: "単ページ",
  spread: "見開き",
};

const READING_DIRECTION_LABELS: Record<SettingsProfile["readingDirection"], string> = {
  rightToLeft: "右開き",
  leftToRight: "左開き",
};

const SCALE_MODE_LABELS: Record<ScaleMode, string> = {
  fit: "全体フィット",
  width: "横幅フィット",
  height: "高さフィット",
  original: "原寸",
  custom: "任意倍率",
};

const GESTURE_LABELS: Record<MouseGestureName, string> = {
  swipeLeft: "左スワイプ",
  swipeRight: "右スワイプ",
  doubleClick: "ダブルクリック",
};

const GESTURE_ACTION_LABELS: Record<MouseGestureAction, string> = {
  none: "割り当てなし",
  nextPage: "次ページ",
  previousPage: "前ページ",
  closeViewer: "ビューワを閉じる",
};

interface SearchEntry {
  id: string;
  category: SettingsCategory;
  text: string;
}

export interface SettingsDialogProps {
  draft: SettingsProfile;
  saving: boolean;
  notice: string | null;
  onDraftChange: (draft: SettingsProfile) => void;
  onApply: () => void;
  onCancel: () => void;
  onExport: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onShortcutKeyDown: (command: ShortcutCommand, event: KeyboardEvent<HTMLInputElement>) => void;
  onResetShortcut: (command: ShortcutCommand) => void;
  onResetAllShortcuts: () => void;
  onMouseGestureChange: (name: MouseGestureName, action: MouseGestureAction) => void;
  onResetAllSettings: () => void;
}

function normalizedSearchText(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ja");
}

function SettingRow({
  id,
  title,
  description,
  hidden,
  children,
}: {
  id: string;
  title: string;
  description: string;
  hidden: boolean;
  children: ReactNode;
}) {
  return (
    <div className="settings-row" data-setting-id={id} hidden={hidden}>
      <div className="settings-row-copy">
        <h4>{title}</h4>
        <p>{description}</p>
      </div>
      <div className="settings-row-control">{children}</div>
    </div>
  );
}

export function SettingsDialog({
  draft,
  saving,
  notice,
  onDraftChange,
  onApply,
  onCancel,
  onExport,
  onImport,
  onShortcutKeyDown,
  onResetShortcut,
  onResetAllShortcuts,
  onMouseGestureChange,
  onResetAllSettings,
}: SettingsDialogProps) {
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>("catalog");
  const [query, setQuery] = useState("");
  const normalizedQuery = normalizedSearchText(query);

  const searchEntries = useMemo<SearchEntry[]>(() => [
    {
      id: "sort-field",
      category: "catalog",
      text: `並べ替え 順番 名前 更新日時 サイズ 種類 ${SORT_FIELD_LABELS[draft.sortField]} ライブラリに並ぶ項目の基準を選びます`,
    },
    {
      id: "sort-direction",
      category: "catalog",
      text: `並べ替え方向 昇順 降順 ${draft.sortDescending ? "降順" : "昇順"} 大きい値や新しい項目から表示します`,
    },
    {
      id: "catalog-view-mode",
      category: "catalog",
      text: `一覧形式 表示 表紙 サムネイル 詳細 参照型 ${CATALOG_VIEW_MODE_LABELS[draft.catalogViewMode]} 表紙の大きさやファイル情報の詳しさを切り替えます`,
    },
    {
      id: "viewer-view-mode",
      category: "viewer",
      text: `閲覧モード 単ページ 見開き ${VIEW_MODE_LABELS[draft.viewMode]} 1ページずつまたは見開きで表示します`,
    },
    {
      id: "viewer-layout-mode",
      category: "viewer",
      text: `閲覧レイアウト ページ 縦スクロール 横スクロール ${VIEWER_LAYOUT_MODE_LABELS[draft.layoutMode]} ページ送りから選びます`,
    },
    {
      id: "end-of-volume",
      category: "viewer",
      text: `巻末動作 次の巻 確認 ライブラリ 停止 ループ ${END_OF_VOLUME_POLICY_LABELS[draft.endOfVolumePolicy]} 最後のページから先へ進んだときの動作です`,
    },
    {
      id: "reading-direction",
      category: "viewer",
      text: `読み方向 右開き 左開き ${READING_DIRECTION_LABELS[draft.readingDirection]} 見開きの配置と左右キーの進行方向を揃えます`,
    },
    {
      id: "loupe",
      category: "viewer",
      text: `ルーペ 拡大鏡 ${draft.loupeEnabled ? "有効" : "無効"} ポインター位置を正方形の拡大鏡で確認します`,
    },
    {
      id: "scale-mode",
      category: "viewer",
      text: `倍率モード 拡大 縮小 フィット 原寸 任意 ${SCALE_MODE_LABELS[draft.scaleMode]} 画像を画面へ収める方法を選びます`,
    },
    {
      id: "custom-scale",
      category: "viewer",
      text: `任意倍率 パーセント ${Math.round(draft.scale * 100)}% 25%から400%の範囲で指定します`,
    },
    ...([
      ["tree-visible", "フォルダツリー", draft.treeVisible, "ライブラリの階層を左側へ表示します"],
      ["menu-visible", "メニューバー", draft.menuBarVisible, "すべてのアプリメニューを画面上部へ表示します"],
      ["toolbar-visible", "ツールバー", draft.toolbarVisible, "移動や検索などよく使う操作を表示します"],
    ] as const).map(([id, label, visible, description]) => ({
      id,
      category: "interface" as const,
      text: `${label} 画面 表示 非表示 ${visible ? "表示" : "非表示"} ${description}`,
    })),
    ...SHORTCUT_COMMANDS.map((command) => ({
      id: `shortcut-${command}`,
      category: "commands" as const,
      text: `${SHORTCUT_LABELS[command]} ショートカット キー コマンド ${draft.shortcuts[command]} ${DEFAULT_SHORTCUTS[command]} ${SHORTCUT_FALLBACKS[command]}`,
    })),
    ...CONFIGURABLE_MOUSE_GESTURE_NAMES.map((name) => ({
      id: `gesture-${name}`,
      category: "commands" as const,
      text: `${GESTURE_LABELS[name]} マウス ジェスチャー ${GESTURE_ACTION_LABELS[draft.mouseGestures[name]]}`,
    })),
    {
      id: "gesture-double-click",
      category: "commands",
      text: "ダブルクリック doubleClick 全画面 表示 解除 固定",
    },
    {
      id: "profile-transfer",
      category: "profile",
      text: "設定 profile プロファイル 書き出し 読み込み 移行 バックアップ json",
    },
    {
      id: "profile-safety",
      category: "profile",
      text: "安全 ライブラリ 場所 端末 固有 情報 含まない ローカル",
    },
  ], [draft]);

  const matchedIds = useMemo(() => new Set(
    searchEntries
      .filter((entry) => normalizedQuery === "" || normalizedSearchText(entry.text).includes(normalizedQuery))
      .map((entry) => entry.id),
  ), [normalizedQuery, searchEntries]);

  const categoryMatchCount = (category: SettingsCategory) => searchEntries.filter(
    (entry) => entry.category === category && matchedIds.has(entry.id),
  ).length;
  const isSearching = normalizedQuery !== "";
  const rowHidden = (id: string) => isSearching && !matchedIds.has(id);
  const panelHidden = (category: SettingsCategory) => isSearching
    ? categoryMatchCount(category) === 0
    : activeCategory !== category;
  const activeDefinition = SETTINGS_CATEGORIES.find((category) => category.id === activeCategory)
    ?? SETTINGS_CATEGORIES[0];

  const update = (change: Partial<SettingsProfile>) => {
    onDraftChange({ ...draft, ...change });
  };

  return (
    <div className="dialog-backdrop">
      <section
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="統合設定"
        data-product-id="shortcut-dialog"
      >
        <header className="settings-dialog-header">
          <div>
            <p className="dialog-kicker">環境設定</p>
            <h2>統合設定</h2>
            <p className="dialog-description">表示と操作を、使い方に合わせて調整します。</p>
          </div>
          <label className="settings-search">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              aria-label="設定を検索"
              placeholder="設定を検索"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query !== "" && (
              <button type="button" aria-label="設定検索をクリア" onClick={() => setQuery("")}>×</button>
            )}
          </label>
        </header>

        <div className="settings-dialog-body">
          <nav className="settings-navigation" aria-label="設定カテゴリ">
            {SETTINGS_CATEGORIES.map((category) => (
              <button
                key={category.id}
                type="button"
                aria-current={!isSearching && activeCategory === category.id ? "page" : undefined}
                onClick={() => {
                  setActiveCategory(category.id);
                  setQuery("");
                }}
              >
                <span className="settings-navigation-icon" aria-hidden="true">{category.icon}</span>
                <span>
                  <strong>{category.label}</strong>
                  <small>{category.description}</small>
                </span>
                {isSearching && <span className="settings-match-count">{categoryMatchCount(category.id)}</span>}
              </button>
            ))}
          </nav>

          <div className="settings-content">
            <header className="settings-content-header">
              <p>{isSearching ? "検索結果" : activeDefinition.label}</p>
              <h3>
                {isSearching
                  ? query
                  : activeDefinition.description}
              </h3>
              {isSearching && <span>{matchedIds.size} 件の設定</span>}
            </header>

            {isSearching && matchedIds.size === 0 && (
              <div className="settings-empty" role="status">
                <strong>該当する設定はありません</strong>
                <span>別の言葉で検索するか、検索をクリアしてください。</span>
              </div>
            )}

            <section className="settings-panel" aria-label="基本設定" hidden={panelHidden("catalog")}>
              <h3>一覧表示</h3>
              <SettingRow
                id="sort-field"
                title="並べ替え"
                description="ライブラリに並ぶ項目の基準を選びます。"
                hidden={rowHidden("sort-field")}
              >
                <select
                  aria-label="profile並べ替え"
                  value={draft.sortField}
                  onChange={(event) => update({ sortField: event.target.value as SortField })}
                >
                  {Object.entries(SORT_FIELD_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </SettingRow>
              <SettingRow
                id="sort-direction"
                title="並べ替え方向"
                description="有効にすると、大きい値や新しい項目から表示します。"
                hidden={rowHidden("sort-direction")}
              >
                <label className="settings-switch">
                  <input
                    type="checkbox"
                    aria-label="profile降順"
                    checked={draft.sortDescending}
                    onChange={(event) => update({ sortDescending: event.target.checked })}
                  />
                  <span>{draft.sortDescending ? "降順" : "昇順"}</span>
                </label>
              </SettingRow>
              <SettingRow
                id="catalog-view-mode"
                title="一覧形式"
                description="表紙の大きさや、ファイル情報の詳しさを切り替えます。"
                hidden={rowHidden("catalog-view-mode")}
              >
                <select
                  aria-label="profile一覧形式"
                  value={draft.catalogViewMode}
                  onChange={(event) => update({ catalogViewMode: normalizeCatalogViewMode(event.target.value) })}
                >
                  {CATALOG_VIEW_MODES.map((mode) => (
                    <option key={mode} value={mode}>{CATALOG_VIEW_MODE_LABELS[mode]}</option>
                  ))}
                </select>
              </SettingRow>
            </section>

            <section className="settings-panel" aria-label="ビューワ設定" hidden={panelHidden("viewer")}>
              <h3>ビューワ</h3>
              <SettingRow id="viewer-view-mode" title="閲覧モード" description="1ページずつ、または見開きで表示します。" hidden={rowHidden("viewer-view-mode")}>
                <select aria-label="profile閲覧モード" value={draft.viewMode} onChange={(event) => update({ viewMode: event.target.value as SettingsProfile["viewMode"] })}>
                  {Object.entries(VIEW_MODE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </SettingRow>
              <SettingRow id="viewer-layout-mode" title="閲覧レイアウト" description="ページ送り、縦スクロール、横スクロールから選びます。" hidden={rowHidden("viewer-layout-mode")}>
                <select aria-label="profile閲覧レイアウト" value={draft.layoutMode} onChange={(event) => update({ layoutMode: normalizeViewerLayoutMode(event.target.value) })}>
                  {VIEWER_LAYOUT_MODES.map((mode) => <option key={mode} value={mode}>{VIEWER_LAYOUT_MODE_LABELS[mode]}</option>)}
                </select>
              </SettingRow>
              <SettingRow id="end-of-volume" title="巻末動作" description="最後のページから先へ進んだときの動作です。" hidden={rowHidden("end-of-volume")}>
                <select aria-label="profile巻末動作" value={draft.endOfVolumePolicy} onChange={(event) => update({ endOfVolumePolicy: normalizeEndOfVolumePolicy(event.target.value) })}>
                  {Object.entries(END_OF_VOLUME_POLICY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </SettingRow>
              <SettingRow id="reading-direction" title="読み方向" description="見開きの配置と左右キーの進行方向を揃えます。" hidden={rowHidden("reading-direction")}>
                <select aria-label="profile読み方向" value={draft.readingDirection} onChange={(event) => update({ readingDirection: event.target.value as SettingsProfile["readingDirection"] })}>
                  {Object.entries(READING_DIRECTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </SettingRow>
              <SettingRow id="loupe" title="ルーペ" description="ポインター位置を正方形の拡大鏡で確認します。" hidden={rowHidden("loupe")}>
                <label className="settings-switch">
                  <input type="checkbox" aria-label="profileルーペ" checked={draft.loupeEnabled} onChange={(event) => update({ loupeEnabled: event.target.checked })} />
                  <span>{draft.loupeEnabled ? "有効" : "無効"}</span>
                </label>
              </SettingRow>
              <SettingRow id="scale-mode" title="倍率モード" description="画像を画面へ収める方法、または原寸・任意倍率を選びます。" hidden={rowHidden("scale-mode")}>
                <select aria-label="profile倍率モード" value={draft.scaleMode} onChange={(event) => update({ scaleMode: event.target.value as ScaleMode })}>
                  {Object.entries(SCALE_MODE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </SettingRow>
              <SettingRow id="custom-scale" title="任意倍率" description="任意倍率を25%から400%の範囲で指定します。" hidden={rowHidden("custom-scale")}>
                <div className="settings-number-control">
                  <input
                    type="number"
                    aria-label="profile任意倍率（%）"
                    min="25"
                    max="400"
                    step="1"
                    value={Math.round(draft.scale * 100)}
                    onChange={(event) => {
                      const scale = Number(event.target.value) / 100;
                      if (Number.isFinite(scale)) update({ scale });
                    }}
                  />
                  <span>%</span>
                </div>
              </SettingRow>
            </section>

            <section className="settings-panel" aria-label="画面設定" hidden={panelHidden("interface")}>
              <h3>画面</h3>
              {([
                ["tree-visible", "treeVisible", "フォルダツリー", "ライブラリの階層を左側へ表示します。"],
                ["menu-visible", "menuBarVisible", "メニューバー", "すべてのアプリメニューを画面上部へ表示します。"],
                ["toolbar-visible", "toolbarVisible", "ツールバー", "移動や検索など、よく使う操作を表示します。"],
              ] as const).map(([id, field, label, description]) => (
                <SettingRow key={id} id={id} title={label} description={description} hidden={rowHidden(id)}>
                  <label className="settings-switch">
                    <input
                      type="checkbox"
                      aria-label={`profile${label}`}
                      checked={draft[field]}
                      onChange={(event) => update({ [field]: event.target.checked })}
                    />
                    <span>{draft[field] ? "表示" : "非表示"}</span>
                  </label>
                </SettingRow>
              ))}
            </section>

            <section className="settings-panel settings-panel--commands" aria-label="ショートカット設定" hidden={panelHidden("commands")}>
              <div className="settings-panel-heading">
                <div>
                  <h3>コマンド設定</h3>
                  <p>入力欄でキーを押して割り当てます。重複するキーは設定できません。</p>
                </div>
                <button type="button" onClick={onResetAllShortcuts}>キーをすべて既定に戻す</button>
              </div>
              <div className="settings-command-header" aria-hidden="true">
                <span>コマンド</span><span>割り当て</span><span>説明</span><span />
              </div>
              {SHORTCUT_COMMANDS.map((command) => (
                <div
                  key={command}
                  className="settings-command-row"
                  data-shortcut-command={command}
                  data-setting-id={`shortcut-${command}`}
                  hidden={rowHidden(`shortcut-${command}`)}
                >
                  <label htmlFor={`shortcut-${command}`}>{SHORTCUT_LABELS[command]}</label>
                  <input
                    id={`shortcut-${command}`}
                    aria-label={`${SHORTCUT_LABELS[command]}ショートカット`}
                    value={draft.shortcuts[command]}
                    readOnly
                    onKeyDown={(event) => onShortcutKeyDown(command, event)}
                  />
                  <span>既定: {DEFAULT_SHORTCUTS[command]}<br />代替操作: {SHORTCUT_FALLBACKS[command]}</span>
                  <button type="button" aria-label={`${SHORTCUT_LABELS[command]}を既定に戻す`} onClick={() => onResetShortcut(command)}>戻す</button>
                </div>
              ))}
              <h3 className="settings-subheading">マウスジェスチャー</h3>
              {CONFIGURABLE_MOUSE_GESTURE_NAMES.map((name) => (
                <SettingRow
                  key={name}
                  id={`gesture-${name}`}
                  title={GESTURE_LABELS[name]}
                  description="ビューワ上でのスワイプへ動作を割り当てます。"
                  hidden={rowHidden(`gesture-${name}`)}
                >
                  <select aria-label={`${name}ジェスチャー`} value={draft.mouseGestures[name]} onChange={(event) => onMouseGestureChange(name, event.target.value as MouseGestureAction)}>
                    {MOUSE_GESTURE_ACTIONS.map((action) => <option key={action} value={action}>{GESTURE_ACTION_LABELS[action]}</option>)}
                  </select>
                </SettingRow>
              ))}
              <SettingRow id="gesture-double-click" title="ダブルクリック" description="画像表示領域の全画面表示と解除に使用します。誤操作を避けるため変更できません。" hidden={rowHidden("gesture-double-click")}>
                <span className="settings-fixed-value">doubleClick: 全画面表示／解除（固定）</span>
              </SettingRow>
            </section>

            <section className="settings-panel" aria-label="プロファイル設定" hidden={panelHidden("profile")}>
              <h3>プロファイル</h3>
              <SettingRow id="profile-transfer" title="設定を移行する" description="現在の設定をJSONへ書き出すか、別の端末で書き出した設定を下書きへ読み込みます。" hidden={rowHidden("profile-transfer")}>
                <div className="settings-inline-actions">
                  <button type="button" onClick={onExport}>profileを書き出す</button>
                  <label className="file-button">
                    profileを読み込む
                    <input type="file" aria-label="profileを読み込む" accept="application/json,.json" onChange={onImport} />
                  </label>
                </div>
              </SettingRow>
              <SettingRow id="profile-safety" title="保存される内容" description="ライブラリの場所、読書履歴、端末固有の情報はプロファイルに含みません。" hidden={rowHidden("profile-safety")}>
                <span className="settings-local-badge">ローカル設定のみ</span>
              </SettingRow>
            </section>
          </div>
        </div>

        <footer className="settings-actions">
          <button type="button" className="settings-reset-all" disabled={saving} onClick={onResetAllSettings}>すべて既定に戻す</button>
          {notice !== null && <p role="status">{notice}</p>}
          <button type="button" data-product-id="shortcut-dialog-close" disabled={saving} onClick={onCancel}>キャンセル</button>
          <button type="button" data-product-id="shortcut-apply" disabled={saving} onClick={onApply}>{saving ? "保存中…" : "適用"}</button>
        </footer>
      </section>
    </div>
  );
}
