import { useMemo, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from "react";
import {
  END_OF_VOLUME_POLICY_LABELS,
  normalizeEndOfVolumePolicy,
} from "../catalog/end-of-volume";
import { type SortField } from "../catalog/sort";
import {
  CATALOG_VIEW_MODE_LABELS,
  CATALOG_VIEW_MODES,
  MAX_CATALOG_THUMBNAIL_SIZE,
  MIN_CATALOG_THUMBNAIL_SIZE,
  normalizeCatalogThumbnailSize,
  normalizeCatalogViewMode,
} from "../catalog/view-mode";
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_COMMANDS,
  SHORTCUT_DESCRIPTIONS,
  SHORTCUT_FALLBACKS,
  SHORTCUT_GROUP_LABELS,
  SHORTCUT_GROUPS,
  SHORTCUT_LABELS,
  type ShortcutCommand,
} from "../input/shortcuts";
import {
  MAX_VIEWER_SPACING,
  MAX_AUTO_VIEWPORT_ASPECT_PERCENT,
  MAX_PORTRAIT_ASPECT_PERCENT,
  MAX_PAN_FACTOR,
  MAX_VIEWER_GRID_SIZE,
  MAX_WHEEL_DEAD_ZONE,
  MAX_SCROLL_STEP_PERCENT,
  MAX_WHEEL_SCROLL_FACTOR,
  MAX_LOUPE_SIZE,
  MAX_LOUPE_ZOOM,
  MIN_PAN_FACTOR,
  MIN_VIEWER_GRID_SIZE,
  MIN_WHEEL_DEAD_ZONE,
  MIN_SCROLL_STEP_PERCENT,
  MIN_WHEEL_SCROLL_FACTOR,
  MIN_LOUPE_SIZE,
  MIN_LOUPE_ZOOM,
  MIN_VIEWER_SPACING,
  MIN_AUTO_VIEWPORT_ASPECT_PERCENT,
  MIN_PORTRAIT_ASPECT_PERCENT,
  normalizeViewerLayoutMode,
  VIEWER_BACKGROUNDS,
  VIEWER_CURSOR_AUTO_HIDE_DELAYS,
  VIEWER_GRID_COLORS,
  VIEWER_LAYOUT_MODE_LABELS,
  VIEWER_LAYOUT_MODES,
  VIEW_MODE_LABELS,
  SPREAD_PAIRING_LABELS,
  SPREAD_PAIRINGS,
  FIT_BASES,
  FIT_BASIS_LABELS,
  PAGE_SCAN_MODES,
  PAGE_SCAN_MODE_LABELS,
  type ScaleMode,
  type ViewerBackground,
  type ViewerGridColor,
  type ZoomRetention,
} from "../viewer/model";
import {
  CONFIGURABLE_MOUSE_GESTURE_NAMES,
  CATALOG_PALETTES,
  NAVIGATION_SELECTION_POLICIES,
  STARTUP_LOCATIONS,
  THUMBNAIL_GENERATION_SCOPES,
  MOUSE_GESTURE_ACTIONS,
  type MouseGestureAction,
  type MouseGestureName,
  type SettingsProfile,
} from "./profile";

const CATALOG_PALETTE_LABELS: Record<SettingsProfile["catalogPalette"], string> = {
  system: "システム", paper: "紙面", midnight: "夜間", highContrast: "高コントラスト",
};

const NAVIGATION_SELECTION_LABELS: Record<SettingsProfile["navigationSelectionPolicy"], string> = {
  none: "選択なし", first: "先頭", last: "末尾", restore: "前回選択を復元",
};
const THUMBNAIL_GENERATION_LABELS: Record<SettingsProfile["thumbnailGenerationScope"], string> = {
  visible: "表示中のみ", near: "表示中と近傍", all: "全項目",
};
const STARTUP_LOCATION_LABELS: Record<SettingsProfile["startupLocation"], string> = {
  last: "前回のフォルダ", driveRoot: "前回ドライブのルート",
};

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

const VIEWER_BACKGROUND_LABELS: Record<ViewerBackground, string> = {
  checker: "市松模様",
  dark: "濃灰",
  black: "黒",
  light: "明色",
};

const CURSOR_AUTO_HIDE_LABELS: Record<number, string> = {
  0: "無効",
  1000: "1秒",
  2000: "2秒",
  3000: "3秒",
  5000: "5秒",
};

const ZOOM_RETENTION_LABELS: Record<ZoomRetention, string> = {
  global: "すべての作品で保持",
  book: "現在の作品だけ",
  page: "現在のページだけ",
};

const VIEWER_GRID_COLOR_LABELS: Record<ViewerGridColor, string> = {
  light: "明色",
  dark: "暗色",
};

const GESTURE_LABELS: Record<MouseGestureName, string> = {
  swipeLeft: "左スワイプ",
  swipeRight: "右スワイプ",
  wheelUp: "ホイール上",
  wheelDown: "ホイール下",
  rightWheelUp: "右ボタン＋ホイール上",
  rightWheelDown: "右ボタン＋ホイール下",
  middleClick: "中ボタン",
  backButton: "戻るサイドボタン",
  forwardButton: "進むサイドボタン",
  doubleClick: "ダブルクリック",
};

const GESTURE_DESCRIPTIONS: Record<MouseGestureName, string> = {
  swipeLeft: "画像を左へ48px以上ドラッグしたときに実行します。",
  swipeRight: "画像を右へ48px以上ドラッグしたときに実行します。",
  wheelUp: "ページレイアウトでホイールを上へ回したときに実行します。",
  wheelDown: "ページレイアウトでホイールを下へ回したときに実行します。",
  rightWheelUp: "右ボタンを押しながらホイールを上へ回したときに実行します。",
  rightWheelDown: "右ボタンを押しながらホイールを下へ回したときに実行します。",
  middleClick: "画像表示領域でマウスの中ボタンを押したときに実行します。",
  backButton: "マウスの戻るサイドボタンを押したときに実行します。",
  forwardButton: "マウスの進むサイドボタンを押したときに実行します。",
  doubleClick: "画像表示領域をダブルクリックしたときに全画面を切り替えます。",
};

function gestureActionLabel(action: MouseGestureAction): string {
  return action === "none" ? "割り当てなし" : SHORTCUT_LABELS[action];
}

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
      text: `一覧形式 表示 表紙 サムネイル 詳細 カード グリッド 大判 ファイル名なし 横長 情報 属性 種別 サイズ 更新日時 ${CATALOG_VIEW_MODE_LABELS[draft.catalogViewMode]} レイアウトやファイル情報の詳しさを切り替えます`,
    },
    {
      id: "small-thumbnail-size",
      category: "catalog",
      text: `小サムネイル サイズ 幅 ${draft.catalogThumbnailSizes.smallThumbnail}px`,
    },
    {
      id: "cover-list-thumbnail-size",
      category: "catalog",
      text: `表紙グリッド サムネイル サイズ 幅 ${draft.catalogThumbnailSizes.coverList}px`,
    },
    {
      id: "card-grid-thumbnail-size",
      category: "catalog",
      text: `カードグリッド 大判 表紙のみ ファイル名なし サムネイル サイズ 幅 ${draft.catalogThumbnailSizes.cardGrid}px`,
    },
    {
      id: "reference-tile-thumbnail-size",
      category: "catalog",
      text: `情報カード 横長 属性 表紙 サムネイル サイズ 幅 ${draft.catalogThumbnailSizes.referenceTile}px`,
    },
    {
      id: "navigation-selection-policy",
      category: "catalog",
      text: `移動後 初期選択 先頭 末尾 復元 選択なし ${NAVIGATION_SELECTION_LABELS[draft.navigationSelectionPolicy]}`,
    },
    {
      id: "thumbnail-generation-scope",
      category: "catalog",
      text: `サムネイル 生成 範囲 表示 近傍 全項目 ${THUMBNAIL_GENERATION_LABELS[draft.thumbnailGenerationScope]}`,
    },
    {
      id: "show-hidden-files",
      category: "catalog",
      text: `隠し 項目 ファイル folder 表示 ${draft.showHiddenFiles ? "有効" : "無効"}`,
    },
    {
      id: "catalog-palette",
      category: "catalog",
      text: `一覧 配色 背景 文字 選択 contrast ${CATALOG_PALETTE_LABELS[draft.catalogPalette]}`,
    },
    {
      id: "viewer-view-mode",
      category: "viewer",
      text: `閲覧モード 自動 単ページ 見開き ${VIEW_MODE_LABELS[draft.viewMode]} 表示領域と画像寸法から自動判定、または表示枚数を固定します`,
    },
    {
      id: "spread-portrait-ratio",
      category: "viewer",
      text: `見開き 縦長 判定 幅 高さ 比率 ${draft.spreadPortraitMaxAspectPercent}%`,
    },
    {
      id: "auto-spread-viewport-ratio",
      category: "viewer",
      text: `自動 見開き viewer 領域 幅 高さ 比率 ${draft.autoSpreadMinViewportAspectPercent}%`,
    },
    {
      id: "spread-first-page-single",
      category: "viewer",
      text: `見開き 先頭 表紙 単独 ${draft.spreadFirstPageSingle ? "有効" : "無効"}`,
    },
    {
      id: "spread-pairing",
      category: "viewer",
      text: `見開き 組合せ 偶奇 奇数 偶数 ${SPREAD_PAIRING_LABELS[draft.spreadPairing]}`,
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
      text: `ルーペ 拡大鏡 ${draft.loupeEnabled ? "有効" : "無効"} サイズ ${draft.loupeSize}px 倍率 ${Math.round(draft.loupeZoom * 100)}% ポインター位置を正方形の拡大鏡で確認します`,
    },
    {
      id: "viewer-background",
      category: "viewer",
      text: "背景 市松模様 濃灰 黒 明色 "
        + VIEWER_BACKGROUND_LABELS[draft.viewerBackground]
        + " 画像表示領域の背景を選びます",
    },
    {
      id: "viewer-page-margin",
      category: "viewer",
      text: "ページ 周囲 余白 " + draft.viewerPageMargin
        + "px 0から64pxの範囲で指定します",
    },
    {
      id: "viewer-spread-gap",
      category: "viewer",
      text: "見開き 間隔 " + draft.viewerSpreadGap
        + "px 0から64pxの範囲で指定します",
    },
    {
      id: "cursor-auto-hide",
      category: "viewer",
      text: "カーソル 自動 非表示 "
        + CURSOR_AUTO_HIDE_LABELS[draft.cursorAutoHideMs]
        + " 画像領域内で操作がないときだけ隠します",
    },
    {
      id: "scale-mode",
      category: "viewer",
      text: `倍率モード 拡大 縮小 フィット 原寸 任意 ${SCALE_MODE_LABELS[draft.scaleMode]} 画像を画面へ収める方法を選びます`,
    },
    {
      id: "fit-upscale",
      category: "viewer",
      text: `全体フィット 小画像 拡大 縮小のみ ${draft.fitAllowUpscale ? "拡大許可" : "縮小のみ"}`,
    },
    {
      id: "fit-basis",
      category: "viewer",
      text: `全体フィット 見開き 基準 各ページ ${FIT_BASIS_LABELS[draft.fitBasis]}`,
    },
    {
      id: "fit-margin",
      category: "viewer",
      text: `全体フィット 余白 計算 ${draft.fitIncludePageMargin ? "含む" : "含めない"}`,
    },
    {
      id: "custom-scale",
      category: "viewer",
      text: `任意倍率 パーセント ${Math.round(draft.scale * 100)}% 1%から800%の範囲で指定します`,
    },
    {
      id: "zoom-retention",
      category: "viewer",
      text: `倍率 保持 作品 ページ 全体 ${ZOOM_RETENTION_LABELS[draft.zoomRetention]}`,
    },
    {
      id: "viewer-grid",
      category: "viewer",
      text: `グリッド 格子 間隔 ${draft.viewerGridSize}px ${VIEWER_GRID_COLOR_LABELS[draft.viewerGridColor]}`,
    },
    ...([
      ["tree-visible", "フォルダツリー", draft.treeVisible, "ライブラリの階層を左側へ表示します"],
      ["menu-visible", "メニューバー", draft.menuBarVisible, "すべてのアプリメニューを画面上部へ表示します"],
      ["toolbar-visible", "ツールバー", draft.toolbarVisible, "移動や検索などよく使う操作を表示します"],
      ["address-visible", "アドレスバー", draft.addressBarVisible, "現在位置と直接移動欄を表示します"],
      ["status-visible", "ステータスバー", draft.statusBarVisible, "選択件数と処理状態を表示します"],
      ["always-on-top", "常に手前", draft.alwaysOnTop, "main windowを他のwindowより手前に保ちます"],
    ] as const).map(([id, label, visible, description]) => ({
      id,
      category: "interface" as const,
      text: `${label} 画面 表示 非表示 ${visible ? "表示" : "非表示"} ${description}`,
    })),
    ...SHORTCUT_COMMANDS.map((command) => ({
      id: `shortcut-${command}`,
      category: "commands" as const,
      text: `${SHORTCUT_GROUP_LABELS[SHORTCUT_GROUPS[command]]} ${SHORTCUT_LABELS[command]} ショートカット キー コマンド ${draft.shortcuts[command]} ${DEFAULT_SHORTCUTS[command]} ${SHORTCUT_FALLBACKS[command]} ${SHORTCUT_DESCRIPTIONS[command]} ${CONFIGURABLE_MOUSE_GESTURE_NAMES.filter((name) => draft.mouseGestures[name] === command).map((name) => GESTURE_LABELS[name]).join(" ")}`,
    })),
    ...CONFIGURABLE_MOUSE_GESTURE_NAMES.map((name) => ({
      id: `gesture-${name}`,
      category: "commands" as const,
      text: `${GESTURE_LABELS[name]} マウス ジェスチャー ${gestureActionLabel(draft.mouseGestures[name])} ${GESTURE_DESCRIPTIONS[name]}`,
    })),
    {
      id: "pan-factor",
      category: "commands",
      text: `ドラッグ パン 感度 係数 ${Math.round(draft.panFactor * 100)}%`,
    },
    {
      id: "wheel-dead-zone",
      category: "commands",
      text: `ホイール 不感帯 閾値 ${draft.wheelDeadZone}`,
    },
    {
      id: "scroll-step",
      category: "commands",
      text: `スクロール ページ内 移動量 ${draft.scrollStepPercent}%`,
    },
    {
      id: "wheel-scroll-factor",
      category: "commands",
      text: `連続スクロール ホイール 速度 ${Math.round(draft.wheelScrollFactor * 100)}%`,
    },
    {
      id: "smooth-scroll",
      category: "commands",
      text: `スクロール アニメーション 滑らか ${draft.smoothScroll ? "有効" : "無効"}`,
    },
    {
      id: "page-scan-mode",
      category: "commands",
      text: `ページ 走査 N字 Z字 読書順 ${PAGE_SCAN_MODE_LABELS[draft.pageScanMode]}`,
    },
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
      id: "startup-location",
      category: "profile",
      text: `起動 場所 前回 フォルダ ドライブ ルート ${STARTUP_LOCATION_LABELS[draft.startupLocation]}`,
    },
    {
      id: "restore-last-viewer",
      category: "profile",
      text: `前回 画像 page 再表示 起動 ${draft.restoreLastViewer ? "有効" : "無効"}`,
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
                description="詳細、コンパクトな表紙、名前付き表紙、大判表紙のみ、属性付き横長カードを切り替えます。"
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
              {([
                ["small-thumbnail-size", "smallThumbnail", "小サムネイルのサイズ", "コンパクトな一覧のサムネイル幅です。"],
                ["cover-list-thumbnail-size", "coverList", "表紙グリッドのサイズ", "表紙を中心に並べる一覧のサムネイル幅です。"],
                ["card-grid-thumbnail-size", "cardGrid", "カードグリッドのサイズ", "ファイル名を表示しない大判表紙の幅です。"],
                ["reference-tile-thumbnail-size", "referenceTile", "情報カードのサイズ", "横長の情報カードで左側に表示する表紙の幅です。"],
              ] as const).map(([id, field, title, description]) => (
                <SettingRow key={id} id={id} title={title} description={description} hidden={rowHidden(id)}>
                  <div className="settings-number-control">
                    <input
                      type="number"
                      aria-label={`profile${title}（px）`}
                      min={MIN_CATALOG_THUMBNAIL_SIZE}
                      max={MAX_CATALOG_THUMBNAIL_SIZE}
                      step="8"
                      value={draft.catalogThumbnailSizes[field]}
                      onChange={(event) => update({
                        catalogThumbnailSizes: {
                          ...draft.catalogThumbnailSizes,
                          [field]: normalizeCatalogThumbnailSize(
                            Number(event.target.value),
                            draft.catalogThumbnailSizes[field],
                          ),
                        },
                      })}
                    />
                    <span>px</span>
                  </div>
                </SettingRow>
              ))}
              <SettingRow id="navigation-selection-policy" title="移動後の初期選択" description="フォルダへ移動した直後に選ぶ項目を指定します。" hidden={rowHidden("navigation-selection-policy")}>
                <select aria-label="profile移動後の初期選択" value={draft.navigationSelectionPolicy} onChange={(event) => update({ navigationSelectionPolicy: event.target.value as SettingsProfile["navigationSelectionPolicy"] })}>
                  {NAVIGATION_SELECTION_POLICIES.map((policy) => <option key={policy} value={policy}>{NAVIGATION_SELECTION_LABELS[policy]}</option>)}
                </select>
              </SettingRow>
              <SettingRow id="thumbnail-generation-scope" title="サムネイル生成範囲" description="worker上限を保ったまま、先読みする範囲を選びます。" hidden={rowHidden("thumbnail-generation-scope")}>
                <select aria-label="profileサムネイル生成範囲" value={draft.thumbnailGenerationScope} onChange={(event) => update({ thumbnailGenerationScope: event.target.value as SettingsProfile["thumbnailGenerationScope"] })}>
                  {THUMBNAIL_GENERATION_SCOPES.map((scope) => <option key={scope} value={scope}>{THUMBNAIL_GENERATION_LABELS[scope]}</option>)}
                </select>
              </SettingRow>
              <SettingRow id="show-hidden-files" title="隠し項目を表示" description="Windows hidden属性と先頭dotの項目を一覧へ含めます。" hidden={rowHidden("show-hidden-files")}>
                <label className="settings-switch">
                  <input type="checkbox" aria-label="profile隠し項目を表示" checked={draft.showHiddenFiles} onChange={(event) => update({ showHiddenFiles: event.target.checked })} />
                  <span>{draft.showHiddenFiles ? "表示" : "非表示"}</span>
                </label>
              </SettingRow>
              <SettingRow id="catalog-palette" title="一覧配色" description="判読性を確認した背景・文字・選択色の組を選びます。" hidden={rowHidden("catalog-palette")}>
                <select aria-label="profile一覧配色" value={draft.catalogPalette} onChange={(event) => update({ catalogPalette: event.target.value as SettingsProfile["catalogPalette"] })}>
                  {CATALOG_PALETTES.map((palette) => <option key={palette} value={palette}>{CATALOG_PALETTE_LABELS[palette]}</option>)}
                </select>
              </SettingRow>
            </section>

            <section className="settings-panel" aria-label="ビューワ設定" hidden={panelHidden("viewer")}>
              <h3>ビューワ</h3>
              <SettingRow id="viewer-view-mode" title="閲覧モード" description="自動判定、単ページ固定、見開き固定から選びます。" hidden={rowHidden("viewer-view-mode")}>
                <select aria-label="profile閲覧モード" value={draft.viewMode} onChange={(event) => update({ viewMode: event.target.value as SettingsProfile["viewMode"] })}>
                  {Object.entries(VIEW_MODE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </SettingRow>
              <SettingRow id="spread-portrait-ratio" title="縦長ページ判定" description="幅÷高さがこの値以下のページだけを見開き候補にします。" hidden={rowHidden("spread-portrait-ratio")}>
                <div className="settings-number-control">
                  <input
                    type="number"
                    aria-label="profile見開き縦長判定（%）"
                    min={MIN_PORTRAIT_ASPECT_PERCENT}
                    max={MAX_PORTRAIT_ASPECT_PERCENT}
                    step="1"
                    value={draft.spreadPortraitMaxAspectPercent}
                    onChange={(event) => update({
                      spreadPortraitMaxAspectPercent: Math.min(
                        MAX_PORTRAIT_ASPECT_PERCENT,
                        Math.max(MIN_PORTRAIT_ASPECT_PERCENT, Math.round(Number(event.target.value))),
                      ),
                    })}
                  />
                  <span>%</span>
                </div>
              </SettingRow>
              <SettingRow id="auto-spread-viewport-ratio" title="自動見開きの画面幅" description="viewer領域の幅÷高さがこの値以上の場合だけ自動見開きを許可します。" hidden={rowHidden("auto-spread-viewport-ratio")}>
                <div className="settings-number-control">
                  <input
                    type="number"
                    aria-label="profile自動見開き画面幅判定（%）"
                    min={MIN_AUTO_VIEWPORT_ASPECT_PERCENT}
                    max={MAX_AUTO_VIEWPORT_ASPECT_PERCENT}
                    step="5"
                    value={draft.autoSpreadMinViewportAspectPercent}
                    onChange={(event) => update({
                      autoSpreadMinViewportAspectPercent: Math.min(
                        MAX_AUTO_VIEWPORT_ASPECT_PERCENT,
                        Math.max(MIN_AUTO_VIEWPORT_ASPECT_PERCENT, Math.round(Number(event.target.value))),
                      ),
                    })}
                  />
                  <span>%</span>
                </div>
              </SettingRow>
              <SettingRow id="spread-first-page-single" title="先頭ページを単独表示" description="表紙を次ページと組み合わせず単独で表示します。" hidden={rowHidden("spread-first-page-single")}>
                <label className="settings-switch">
                  <input type="checkbox" aria-label="profile先頭ページを単独表示" checked={draft.spreadFirstPageSingle} onChange={(event) => update({ spreadFirstPageSingle: event.target.checked })} />
                  <span>{draft.spreadFirstPageSingle ? "有効" : "無効"}</span>
                </label>
              </SettingRow>
              <SettingRow id="spread-pairing" title="見開きの組合せ開始" description="組合せを開始できるページ番号の偶奇を固定します。" hidden={rowHidden("spread-pairing")}>
                <select aria-label="profile見開き組合せ開始" value={draft.spreadPairing} onChange={(event) => update({ spreadPairing: event.target.value as SettingsProfile["spreadPairing"] })}>
                  {SPREAD_PAIRINGS.map((pairing) => <option key={pairing} value={pairing}>{SPREAD_PAIRING_LABELS[pairing]}</option>)}
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
                <div className="settings-inline-actions">
                  <label className="settings-switch">
                    <input type="checkbox" aria-label="profileルーペ" checked={draft.loupeEnabled} onChange={(event) => update({ loupeEnabled: event.target.checked })} />
                    <span>{draft.loupeEnabled ? "有効" : "無効"}</span>
                  </label>
                  <label className="settings-number-control">
                    サイズ
                    <input type="number" aria-label="profileルーペサイズ（px）" min={MIN_LOUPE_SIZE} max={MAX_LOUPE_SIZE} step="10" value={draft.loupeSize} onChange={(event) => update({ loupeSize: Math.min(MAX_LOUPE_SIZE, Math.max(MIN_LOUPE_SIZE, Math.round(Number(event.target.value)))) })} />
                    <span>px</span>
                  </label>
                  <label className="settings-number-control">
                    倍率
                    <input type="number" aria-label="profileルーペ倍率（%）" min={MIN_LOUPE_ZOOM * 100} max={MAX_LOUPE_ZOOM * 100} step="25" value={Math.round(draft.loupeZoom * 100)} onChange={(event) => update({ loupeZoom: Math.min(MAX_LOUPE_ZOOM, Math.max(MIN_LOUPE_ZOOM, Number(event.target.value) / 100)) })} />
                    <span>%</span>
                  </label>
                </div>
              </SettingRow>
              <SettingRow id="viewer-background" title="背景" description="画像表示領域の背景を選びます。" hidden={rowHidden("viewer-background")}>
                <select
                  aria-label="profileビューワ背景"
                  value={draft.viewerBackground}
                  onChange={(event) => update({
                    viewerBackground: event.target.value as ViewerBackground,
                  })}
                >
                  {VIEWER_BACKGROUNDS.map((background) => (
                    <option key={background} value={background}>
                      {VIEWER_BACKGROUND_LABELS[background]}
                    </option>
                  ))}
                </select>
              </SettingRow>
              <SettingRow id="viewer-page-margin" title="ページ周囲の余白" description="画像表示領域の端からページまでの余白を0〜64pxで指定します。" hidden={rowHidden("viewer-page-margin")}>
                <div className="settings-number-control">
                  <input
                    type="number"
                    aria-label="profileページ周囲の余白（px）"
                    min={MIN_VIEWER_SPACING}
                    max={MAX_VIEWER_SPACING}
                    step="1"
                    value={draft.viewerPageMargin}
                    onChange={(event) => update({
                      viewerPageMargin: Math.min(
                        MAX_VIEWER_SPACING,
                        Math.max(MIN_VIEWER_SPACING, Math.round(Number(event.target.value))),
                      ),
                    })}
                  />
                  <span>px</span>
                </div>
              </SettingRow>
              <SettingRow id="viewer-spread-gap" title="見開き間隔" description="見開きで隣り合うページの間隔を0〜64pxで指定します。" hidden={rowHidden("viewer-spread-gap")}>
                <div className="settings-number-control">
                  <input
                    type="number"
                    aria-label="profile見開き間隔（px）"
                    min={MIN_VIEWER_SPACING}
                    max={MAX_VIEWER_SPACING}
                    step="1"
                    value={draft.viewerSpreadGap}
                    onChange={(event) => update({
                      viewerSpreadGap: Math.min(
                        MAX_VIEWER_SPACING,
                        Math.max(MIN_VIEWER_SPACING, Math.round(Number(event.target.value))),
                      ),
                    })}
                  />
                  <span>px</span>
                </div>
              </SettingRow>
              <SettingRow id="cursor-auto-hide" title="カーソル自動非表示" description="画像領域内で操作がないときにカーソルを隠すまでの時間です。" hidden={rowHidden("cursor-auto-hide")}>
                <select
                  aria-label="profileカーソル自動非表示"
                  value={draft.cursorAutoHideMs}
                  onChange={(event) => update({
                    cursorAutoHideMs: Number(event.target.value),
                  })}
                >
                  {VIEWER_CURSOR_AUTO_HIDE_DELAYS.map((delay) => (
                    <option key={delay} value={delay}>
                      {CURSOR_AUTO_HIDE_LABELS[delay]}
                    </option>
                  ))}
                </select>
              </SettingRow>
              <SettingRow id="scale-mode" title="倍率モード" description="画像を画面へ収める方法、または原寸・任意倍率を選びます。" hidden={rowHidden("scale-mode")}>
                <select aria-label="profile倍率モード" value={draft.scaleMode} onChange={(event) => update({ scaleMode: event.target.value as ScaleMode })}>
                  {Object.entries(SCALE_MODE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </SettingRow>
              <SettingRow id="fit-upscale" title="小画像のフィット拡大" description="全体フィット時に100%未満の小画像を表示領域まで拡大します。" hidden={rowHidden("fit-upscale")}>
                <label className="settings-switch">
                  <input type="checkbox" aria-label="profile小画像のフィット拡大" checked={draft.fitAllowUpscale} onChange={(event) => update({ fitAllowUpscale: event.target.checked })} />
                  <span>{draft.fitAllowUpscale ? "拡大を許可" : "縮小のみ"}</span>
                </label>
              </SettingRow>
              <SettingRow id="fit-basis" title="見開きフィット基準" description="見開き全体を収めるか、各ページを単独領域基準で合わせるかを選びます。" hidden={rowHidden("fit-basis")}>
                <select aria-label="profile見開きフィット基準" value={draft.fitBasis} onChange={(event) => update({ fitBasis: event.target.value as SettingsProfile["fitBasis"] })}>
                  {FIT_BASES.map((basis) => <option key={basis} value={basis}>{FIT_BASIS_LABELS[basis]}</option>)}
                </select>
              </SettingRow>
              <SettingRow id="fit-margin" title="余白をフィット計算に含める" description="ページ周囲の余白を差し引いて画像倍率を計算します。" hidden={rowHidden("fit-margin")}>
                <label className="settings-switch">
                  <input type="checkbox" aria-label="profile余白をフィット計算に含める" checked={draft.fitIncludePageMargin} onChange={(event) => update({ fitIncludePageMargin: event.target.checked })} />
                  <span>{draft.fitIncludePageMargin ? "含める" : "含めない"}</span>
                </label>
              </SettingRow>
              <SettingRow id="custom-scale" title="任意倍率" description="任意倍率を1%から800%の範囲で指定します。" hidden={rowHidden("custom-scale")}>
                <div className="settings-number-control">
                  <input
                    type="number"
                    aria-label="profile任意倍率（%）"
                    min="1"
                    max="800"
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
              <SettingRow id="zoom-retention" title="倍率の保持" description="倍率を全作品、現在の作品、現在のページのどこまで保持するか選びます。" hidden={rowHidden("zoom-retention")}>
                <select
                  aria-label="profile倍率の保持"
                  value={draft.zoomRetention}
                  onChange={(event) => update({ zoomRetention: event.target.value as ZoomRetention })}
                >
                  {Object.entries(ZOOM_RETENTION_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </SettingRow>
              <SettingRow id="viewer-grid" title="グリッド" description="画像の上へ非破壊の格子を重ねます。" hidden={rowHidden("viewer-grid")}>
                <div className="settings-inline-actions">
                  <label className="settings-switch">
                    <input
                      type="checkbox"
                      aria-label="profileグリッド"
                      checked={draft.viewerGridEnabled}
                      onChange={(event) => update({ viewerGridEnabled: event.target.checked })}
                    />
                    <span>{draft.viewerGridEnabled ? "有効" : "無効"}</span>
                  </label>
                  <label className="settings-number-control">
                    間隔
                    <input
                      type="number"
                      aria-label="profileグリッド間隔（px）"
                      min={MIN_VIEWER_GRID_SIZE}
                      max={MAX_VIEWER_GRID_SIZE}
                      step="1"
                      value={draft.viewerGridSize}
                      onChange={(event) => update({
                        viewerGridSize: Math.min(
                          MAX_VIEWER_GRID_SIZE,
                          Math.max(MIN_VIEWER_GRID_SIZE, Math.round(Number(event.target.value))),
                        ),
                      })}
                    />
                    <span>px</span>
                  </label>
                  <select
                    aria-label="profileグリッド色"
                    value={draft.viewerGridColor}
                    onChange={(event) => update({ viewerGridColor: event.target.value as ViewerGridColor })}
                  >
                    {VIEWER_GRID_COLORS.map((color) => (
                      <option key={color} value={color}>{VIEWER_GRID_COLOR_LABELS[color]}</option>
                    ))}
                  </select>
                </div>
              </SettingRow>
            </section>

            <section className="settings-panel" aria-label="画面設定" hidden={panelHidden("interface")}>
              <h3>画面</h3>
              {([
                ["tree-visible", "treeVisible", "フォルダツリー", "ライブラリの階層を左側へ表示します。"],
                ["menu-visible", "menuBarVisible", "メニューバー", "すべてのアプリメニューを画面上部へ表示します。"],
                ["toolbar-visible", "toolbarVisible", "ツールバー", "移動や検索など、よく使う操作を表示します。"],
                ["address-visible", "addressBarVisible", "アドレスバー", "現在位置と直接移動欄を表示します。"],
                ["status-visible", "statusBarVisible", "ステータスバー", "選択件数と処理状態を表示します。"],
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
              <SettingRow id="always-on-top" title="常に手前" description="main windowを他のwindowより手前に保ちます。" hidden={rowHidden("always-on-top")}>
                <label className="settings-switch">
                  <input
                    type="checkbox"
                    aria-label="profile常に手前"
                    checked={draft.alwaysOnTop}
                    onChange={(event) => update({ alwaysOnTop: event.target.checked })}
                  />
                  <span>{draft.alwaysOnTop ? "有効" : "無効"}</span>
                </label>
              </SettingRow>
            </section>

            <section className="settings-panel settings-panel--commands" aria-label="ショートカット設定" hidden={panelHidden("commands")}>
              <div className="settings-panel-heading">
                <div>
                  <h3>コマンド設定</h3>
                  <p>入力欄でキーを押して割り当てます。重複キーとアプリの予約操作は設定できません。</p>
                </div>
                <button type="button" onClick={onResetAllShortcuts}>キーをすべて既定に戻す</button>
              </div>
              <div className="settings-command-header" aria-hidden="true">
                <span>グループ</span><span>コマンド</span><span>キー</span><span>マウス</span><span>説明</span><span />
              </div>
              {SHORTCUT_COMMANDS.map((command) => (
                <div
                  key={command}
                  className="settings-command-row"
                  data-shortcut-command={command}
                  data-setting-id={`shortcut-${command}`}
                  hidden={rowHidden(`shortcut-${command}`)}
                >
                  <span className="settings-command-group">{SHORTCUT_GROUP_LABELS[SHORTCUT_GROUPS[command]]}</span>
                  <label htmlFor={`shortcut-${command}`}>{SHORTCUT_LABELS[command]}</label>
                  <input
                    id={`shortcut-${command}`}
                    aria-label={`${SHORTCUT_LABELS[command]}ショートカット`}
                    value={draft.shortcuts[command]}
                    readOnly
                    onKeyDown={(event) => onShortcutKeyDown(command, event)}
                  />
                  <span className="settings-command-mouse">
                    {CONFIGURABLE_MOUSE_GESTURE_NAMES
                      .filter((name) => draft.mouseGestures[name] === command)
                      .map((name) => GESTURE_LABELS[name])
                      .join(" / ") || "—"}
                  </span>
                  <span className="settings-command-description">
                    {SHORTCUT_DESCRIPTIONS[command]}
                    <small>既定: {DEFAULT_SHORTCUTS[command]} / 代替: {SHORTCUT_FALLBACKS[command]}</small>
                  </span>
                  <button type="button" aria-label={`${SHORTCUT_LABELS[command]}を既定に戻す`} onClick={() => onResetShortcut(command)}>戻す</button>
                </div>
              ))}
              <h3 className="settings-subheading">マウスジェスチャー</h3>
              <SettingRow id="pan-factor" title="ドラッグ移動係数" description="画像をpointerでpanするときの移動量だけを50%〜200%で調整します。" hidden={rowHidden("pan-factor")}>
                <div className="settings-number-control">
                  <input
                    type="number"
                    aria-label="profileドラッグ移動係数（%）"
                    min={MIN_PAN_FACTOR * 100}
                    max={MAX_PAN_FACTOR * 100}
                    step="10"
                    value={Math.round(draft.panFactor * 100)}
                    onChange={(event) => update({
                      panFactor: Math.min(
                        MAX_PAN_FACTOR,
                        Math.max(MIN_PAN_FACTOR, Number(event.target.value) / 100),
                      ),
                    })}
                  />
                  <span>%</span>
                </div>
              </SettingRow>
              <SettingRow id="wheel-dead-zone" title="ホイール不感帯" description="ページ送りに変換しない小さなwheel deltaを0〜200で指定します。" hidden={rowHidden("wheel-dead-zone")}>
                <input
                  type="number"
                  aria-label="profileホイール不感帯"
                  min={MIN_WHEEL_DEAD_ZONE}
                  max={MAX_WHEEL_DEAD_ZONE}
                  step="1"
                  value={draft.wheelDeadZone}
                  onChange={(event) => update({
                    wheelDeadZone: Math.min(
                      MAX_WHEEL_DEAD_ZONE,
                      Math.max(MIN_WHEEL_DEAD_ZONE, Math.round(Number(event.target.value))),
                    ),
                  })}
                />
              </SettingRow>
              <SettingRow id="scroll-step" title="ページ内スクロール量" description="大きな画像で次・前コマンドが送る量を表示領域の10%〜100%で指定します。" hidden={rowHidden("scroll-step")}>
                <div className="settings-number-control">
                  <input
                    type="number"
                    aria-label="profileページ内スクロール量（%）"
                    min={MIN_SCROLL_STEP_PERCENT}
                    max={MAX_SCROLL_STEP_PERCENT}
                    step="5"
                    value={draft.scrollStepPercent}
                    onChange={(event) => update({
                      scrollStepPercent: Math.min(
                        MAX_SCROLL_STEP_PERCENT,
                        Math.max(MIN_SCROLL_STEP_PERCENT, Math.round(Number(event.target.value))),
                      ),
                    })}
                  />
                  <span>%</span>
                </div>
              </SettingRow>
              <SettingRow id="wheel-scroll-factor" title="連続スクロールのホイール速度" description="縦・横の連続レイアウトでwheel移動量を50%〜200%に調整します。" hidden={rowHidden("wheel-scroll-factor")}>
                <div className="settings-number-control">
                  <input
                    type="number"
                    aria-label="profile連続スクロールのホイール速度（%）"
                    min={MIN_WHEEL_SCROLL_FACTOR * 100}
                    max={MAX_WHEEL_SCROLL_FACTOR * 100}
                    step="10"
                    value={Math.round(draft.wheelScrollFactor * 100)}
                    onChange={(event) => update({
                      wheelScrollFactor: Math.min(
                        MAX_WHEEL_SCROLL_FACTOR,
                        Math.max(MIN_WHEEL_SCROLL_FACTOR, Number(event.target.value) / 100),
                      ),
                    })}
                  />
                  <span>%</span>
                </div>
              </SettingRow>
              <SettingRow id="smooth-scroll" title="ページ内スクロールアニメーション" description="次・前コマンドによるページ内移動を滑らかにします。OSの視覚効果軽減設定を常に優先します。" hidden={rowHidden("smooth-scroll")}>
                <label className="settings-switch">
                  <input type="checkbox" aria-label="profileページ内スクロールアニメーション" checked={draft.smoothScroll} onChange={(event) => update({ smoothScroll: event.target.checked })} />
                  <span>{draft.smoothScroll ? "有効" : "無効"}</span>
                </label>
              </SettingRow>
              <SettingRow id="page-scan-mode" title="ページ内の走査順" description="大きな画像を標準縦送り、N字（列優先）、Z字（行優先）で読書方向に走査します。" hidden={rowHidden("page-scan-mode")}>
                <select aria-label="profileページ内の走査順" value={draft.pageScanMode} onChange={(event) => update({ pageScanMode: event.target.value as SettingsProfile["pageScanMode"] })}>
                  {PAGE_SCAN_MODES.map((mode) => <option key={mode} value={mode}>{PAGE_SCAN_MODE_LABELS[mode]}</option>)}
                </select>
              </SettingRow>
              {CONFIGURABLE_MOUSE_GESTURE_NAMES.map((name) => (
                <SettingRow
                  key={name}
                  id={`gesture-${name}`}
                  title={GESTURE_LABELS[name]}
                  description={GESTURE_DESCRIPTIONS[name]}
                  hidden={rowHidden(`gesture-${name}`)}
                >
                  <select aria-label={`${name}ジェスチャー`} value={draft.mouseGestures[name]} onChange={(event) => onMouseGestureChange(name, event.target.value as MouseGestureAction)}>
                    {MOUSE_GESTURE_ACTIONS.map((action) => <option key={action} value={action}>{gestureActionLabel(action)}</option>)}
                  </select>
                </SettingRow>
              ))}
              <SettingRow id="gesture-double-click" title="ダブルクリック" description={`${GESTURE_DESCRIPTIONS.doubleClick} 誤操作を避けるため変更できません。`} hidden={rowHidden("gesture-double-click")}>
                <span className="settings-fixed-value">doubleClick: 全画面表示／解除（固定）</span>
              </SettingRow>
            </section>

            <section className="settings-panel" aria-label="プロファイル設定" hidden={panelHidden("profile")}>
              <h3>プロファイル</h3>
              <SettingRow id="startup-location" title="起動場所" description="前回のフォルダ、または前回ドライブのルートから開始します。" hidden={rowHidden("startup-location")}>
                <select aria-label="profile起動場所" value={draft.startupLocation} onChange={(event) => update({ startupLocation: event.target.value as SettingsProfile["startupLocation"] })}>
                  {STARTUP_LOCATIONS.map((location) => <option key={location} value={location}>{STARTUP_LOCATION_LABELS[location]}</option>)}
                </select>
              </SettingRow>
              <SettingRow id="restore-last-viewer" title="前回の画像を再表示" description="有効時だけ、最新の成功した閲覧作品を起動後に再度開きます。" hidden={rowHidden("restore-last-viewer")}>
                <label className="settings-switch">
                  <input type="checkbox" aria-label="profile前回の画像を再表示" checked={draft.restoreLastViewer} onChange={(event) => update({ restoreLastViewer: event.target.checked })} />
                  <span>{draft.restoreLastViewer ? "有効" : "無効"}</span>
                </label>
              </SettingRow>
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
