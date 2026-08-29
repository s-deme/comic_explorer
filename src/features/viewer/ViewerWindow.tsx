import { useCallback, useEffect, useRef, useState } from "react";
import { emitTo } from "@tauri-apps/api/event";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  deletePageBookmark,
  getCatalogSettings,
  listFolder,
  listPageBookmarks,
  openComic,
  saveEndOfVolumePolicy,
  savePageBookmark,
  saveViewerSettings,
  type CatalogSettings,
  type ViewerSession,
} from "../library/client";
import { previousComicEntry, sortCatalogEntries } from "../catalog/sort";
import {
  resolveEndOfVolume,
  type EndOfVolumePolicy,
} from "../catalog/end-of-volume";
import { parentPath } from "../navigation/navigation";
import { nextBookmark, type PageBookmark } from "../reading/collections";
import { presentError, presentUnexpectedError } from "../errors/presentation";
import {
  applyThemeSelection,
  resolveTheme,
  type ThemeBaseScheme,
} from "../settings/theme";
import { Viewer } from "./Viewer";
import {
  parseViewerWindowHash,
  VIEWER_OPEN_EVENT,
  type ViewerWindowLaunch,
} from "./viewer-window";

const MAIN_WINDOW_LABEL = "main";
const VIEWER_CLOSED_EVENT = "viewer:closed";
const VIEWER_PAGE_CHANGED_EVENT = "viewer:page-changed";

function preferredSystemTheme(): ThemeBaseScheme {
  return typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function sessionWithRequestedStart(
  session: ViewerSession,
  launch: ViewerWindowLaunch,
): ViewerSession | null {
  const requestedIndex = launch.requestedPageKey === null
    ? null
    : session.pages.findIndex((page) => page.relativePath === launch.requestedPageKey);
  if (requestedIndex === -1) return null;
  return {
    ...session,
    startIndex: requestedIndex !== null
      ? requestedIndex
      : launch.startAt === "first"
        ? 0
        : launch.startAt === "last"
          ? Math.max(0, session.pages.length - 1)
          : session.startIndex,
  };
}

function viewerSettingsPayload(settings: CatalogSettings) {
  return {
    viewMode: settings.viewMode,
    spreadPortraitMaxAspectPercent: settings.spreadPortraitMaxAspectPercent,
    autoSpreadMinViewportAspectPercent: settings.autoSpreadMinViewportAspectPercent,
    spreadFirstPageSingle: settings.spreadFirstPageSingle,
    spreadPairing: settings.spreadPairing,
    fitAllowUpscale: settings.fitAllowUpscale,
    fitBasis: settings.fitBasis,
    fitIncludePageMargin: settings.fitIncludePageMargin,
    readingDirection: settings.readingDirection,
    scaleMode: settings.scaleMode,
    scale: settings.scale,
    loupeEnabled: settings.loupeEnabled,
    viewerBackground: settings.viewerBackground,
    viewerPageMargin: settings.viewerPageMargin,
    viewerSpreadGap: settings.viewerSpreadGap,
    cursorAutoHideMs: settings.cursorAutoHideMs,
  };
}

export function ViewerWindow() {
  const initialLaunch = parseViewerWindowHash(window.location.hash);
  const [launch, setLaunch] = useState<ViewerWindowLaunch | null>(initialLaunch);
  const [settings, setSettings] = useState<CatalogSettings | null>(null);
  const [session, setSession] = useState<ViewerSession | null>(null);
  const [loading, setLoading] = useState(initialLaunch !== null);
  const [notice, setNotice] = useState<string | null>(null);
  const [bookmarks, setBookmarks] = useState<PageBookmark[]>([]);
  const [bookmarkNotice, setBookmarkNotice] = useState<string | null>(null);
  const [pendingNext, setPendingNext] = useState<ViewerSession | null>(null);
  const [systemTheme, setSystemTheme] = useState<ThemeBaseScheme>(preferredSystemTheme);
  const viewerGeneration = useRef(0);
  const settingsGeneration = useRef(0);
  const sessionRef = useRef<ViewerSession | null>(null);

  const refreshBookmarks = useCallback(async (nextSession: ViewerSession, generation: number) => {
    setBookmarkNotice(null);
    try {
      const response = await listPageBookmarks(nextSession.itemKey, generation);
      if (generation !== viewerGeneration.current) return;
      if (response.status === "ok") setBookmarks(response.data);
      else {
        setBookmarks([]);
        setBookmarkNotice(response.status === "error"
          ? presentError(response.error)
          : "しおりの読み込みをキャンセルしました。");
      }
    } catch {
      if (generation === viewerGeneration.current) {
        setBookmarks([]);
        setBookmarkNotice("しおりを読み込めませんでした。");
      }
    }
  }, []);

  const openLaunch = useCallback(async (nextLaunch: ViewerWindowLaunch) => {
    const generation = ++viewerGeneration.current;
    setLoading(true);
    setNotice(null);
    setPendingNext(null);
    setBookmarks([]);
    setBookmarkNotice(null);
    const [settingsResponse, comicResponse] = await Promise.all([
      getCatalogSettings(generation),
      openComic(nextLaunch.itemRelativePath, generation),
    ]);
    if (generation !== viewerGeneration.current) return;
    if (settingsResponse.status !== "ok") {
      setSettings(null);
      setSession(null);
      sessionRef.current = null;
      setLoading(false);
      setNotice(settingsResponse.status === "error"
        ? presentError(settingsResponse.error)
        : "Viewer設定の読み込みをキャンセルしました。");
      return;
    }
    if (comicResponse.status !== "ok") {
      setSession(null);
      sessionRef.current = null;
      setLoading(false);
      setNotice(comicResponse.status === "error"
        ? presentError(comicResponse.error)
        : "作品を開く操作をキャンセルしました。");
      return;
    }
    const nextSession = sessionWithRequestedStart(comicResponse.data, nextLaunch);
    if (nextSession === null) {
      setSession(null);
      sessionRef.current = null;
      setLoading(false);
      setNotice("書庫の内容が変更されたため、選択ページを開けませんでした。");
      return;
    }
    setSettings(settingsResponse.data);
    setSession(nextSession);
    sessionRef.current = nextSession;
    setLoading(false);
    void refreshBookmarks(nextSession, generation);
  }, [refreshBookmarks]);

  useEffect(() => {
    if (launch !== null) void openLaunch(launch).catch(() => {
      setLoading(false);
      setNotice(presentUnexpectedError());
    });
  }, [launch, openLaunch]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWebviewWindow().listen<ViewerWindowLaunch>(VIEWER_OPEN_EVENT, (event) => {
      setLaunch(event.payload);
    }).then((dispose) => {
      if (disposed) dispose();
      else unlisten = dispose;
    }).catch(() => undefined);
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemTheme(media.matches ? "dark" : "light");
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (settings === null) return;
    applyThemeSelection(
      document.documentElement,
      settings.themeSelection,
      settings.customThemeSnapshot,
      systemTheme,
    );
    const nativeTheme = settings.themeSelection.kind === "system"
      ? null
      : resolveTheme(
        settings.themeSelection,
        settings.customThemeSnapshot,
        systemTheme,
      ).baseScheme;
    void getCurrentWindow().setTheme(nativeTheme).catch(() => undefined);
  }, [settings, systemTheme]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow().onCloseRequested(() => {
      void emitTo(MAIN_WINDOW_LABEL, VIEWER_CLOSED_EVENT).catch(() => undefined);
    }).then((dispose) => {
      if (disposed) dispose();
      else unlisten = dispose;
    }).catch(() => undefined);
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  async function closeViewerWindow() {
    await emitTo(MAIN_WINDOW_LABEL, VIEWER_CLOSED_EVENT).catch(() => undefined);
    await getCurrentWindow().close().catch(() => undefined);
  }

  function persistSettings(next: Partial<CatalogSettings>) {
    if (settings === null) return;
    const nextSettings = { ...settings, ...next };
    setSettings(nextSettings);
    const generation = ++settingsGeneration.current;
    void saveViewerSettings(viewerSettingsPayload(nextSettings), generation)
      .then((response) => {
        if (generation !== settingsGeneration.current || response.status !== "ok") return;
        setSettings(response.data);
      })
      .catch(() => undefined);
  }

  function changeEndOfVolumePolicy(policy: EndOfVolumePolicy) {
    if (settings === null) return;
    setSettings({ ...settings, endOfVolumePolicy: policy });
    const generation = ++settingsGeneration.current;
    void saveEndOfVolumePolicy(policy, generation)
      .then((response) => {
        if (generation !== settingsGeneration.current || response.status !== "ok") return;
        setSettings(response.data);
      })
      .catch(() => undefined);
  }

  async function saveCurrentBookmark(index: number) {
    const current = sessionRef.current;
    const page = current?.pages[index];
    if (current === null || page === undefined) return;
    const generation = viewerGeneration.current;
    try {
      const response = await savePageBookmark({
        itemKey: current.itemKey,
        pageIndex: index,
        pageKey: page.relativePath,
        createdAt: Date.now(),
      }, generation);
      if (generation !== viewerGeneration.current) return;
      if (response.status === "ok") setBookmarks(response.data);
      else setBookmarkNotice(response.status === "error"
        ? presentError(response.error)
        : "しおりの保存をキャンセルしました。");
    } catch {
      if (generation === viewerGeneration.current) setBookmarkNotice("しおりを保存できませんでした。");
    }
  }

  async function deleteCurrentBookmark(pageKey: string) {
    const current = sessionRef.current;
    if (current === null) return;
    const generation = viewerGeneration.current;
    try {
      const response = await deletePageBookmark(current.itemKey, pageKey, generation);
      if (generation !== viewerGeneration.current) return;
      if (response.status === "ok") setBookmarks(response.data);
      else setBookmarkNotice(response.status === "error"
        ? presentError(response.error)
        : "しおりの削除をキャンセルしました。");
    } catch {
      if (generation === viewerGeneration.current) setBookmarkNotice("しおりを削除できませんでした。");
    }
  }

  async function volumeCatalog(itemKey: string) {
    const parent = itemKey === "" ? "" : parentPath(itemKey);
    if (parent === null || settings === null) return null;
    const response = await listFolder(parent, viewerGeneration.current);
    if (response.status !== "ok") return null;
    return sortCatalogEntries(
      response.data,
      settings.sortField,
      settings.sortDescending ? "descending" : "ascending",
    );
  }

  async function handleEndOfVolume() {
    const current = sessionRef.current;
    if (current === null || settings === null || pendingNext !== null) return;
    const catalog = await volumeCatalog(current.itemKey);
    if (current !== sessionRef.current) return;
    if (catalog === null) {
      setNotice("次の漫画を確認できませんでした。");
      return;
    }
    const decision = resolveEndOfVolume(catalog, current.itemKey, settings.endOfVolumePolicy);
    if (decision.kind === "open") {
      setLaunch({
        itemRelativePath: decision.entry.relativePath,
        launchMode: "normal",
        startAt: "first",
        requestedPageKey: null,
      });
    } else if (decision.kind === "confirm") {
      setPendingNext({
        itemKey: decision.entry.relativePath,
        displayName: decision.entry.relativePath,
        pages: [],
        startIndex: 0,
      });
    } else if (decision.kind === "return_library") {
      await closeViewerWindow();
    } else {
      setNotice(decision.reason === "policy"
        ? "巻末動作が停止に設定されています。"
        : "巻末です。次の漫画はありません。");
    }
  }

  async function handleStartOfVolume() {
    const current = sessionRef.current;
    if (current === null) return;
    const catalog = await volumeCatalog(current.itemKey);
    if (current !== sessionRef.current) return;
    if (catalog === null) {
      setNotice("前の漫画を確認できませんでした。");
      return;
    }
    const previous = previousComicEntry(catalog, current.itemKey);
    if (previous === undefined) {
      setNotice("巻頭です。前の漫画はありません。");
      return;
    }
    setLaunch({
      itemRelativePath: previous.relativePath,
      launchMode: "normal",
      startAt: "last",
      requestedPageKey: null,
    });
  }

  if (launch === null) {
    return <main className="viewer-window-state" role="alert">Viewerの起動情報が正しくありません。</main>;
  }
  if (loading || settings === null || session === null) {
    return (
      <main className="viewer-window-state" role={notice === null ? "status" : "alert"}>
        {notice ?? "Viewerを開いています…"}
        {notice !== null && <button type="button" onClick={() => void closeViewerWindow()}>閉じる</button>}
      </main>
    );
  }

  return (
    <div className="viewer-shell" data-viewer-window="true">
      <Viewer
        key={`${session.itemKey}:${viewerGeneration.current}`}
        session={session}
        generation={viewerGeneration.current}
        onClose={() => void closeViewerWindow()}
        onNextItem={() => void handleEndOfVolume()}
        onPreviousItem={() => void handleStartOfVolume()}
        endOfVolumePolicy={settings.endOfVolumePolicy}
        onEndOfVolumePolicyChange={changeEndOfVolumePolicy}
        initialMode={settings.viewMode}
        spreadRules={{
          portraitMaxAspectPercent: settings.spreadPortraitMaxAspectPercent,
          autoViewportMinAspectPercent: settings.autoSpreadMinViewportAspectPercent,
          firstPageSingle: settings.spreadFirstPageSingle,
          pairing: settings.spreadPairing,
        }}
        fitRules={{
          allowUpscale: settings.fitAllowUpscale,
          basis: settings.fitBasis,
          includePageMargin: settings.fitIncludePageMargin,
        }}
        initialDirection={settings.readingDirection}
        initialScaleMode={settings.scaleMode}
        initialScale={settings.scale}
        initialLoupeEnabled={settings.loupeEnabled}
        loupeSize={settings.loupeSize}
        loupeZoom={settings.loupeZoom}
        prefetchAhead={settings.prefetchAhead}
        prefetchBehind={settings.prefetchBehind}
        initialBackground={settings.viewerBackground}
        initialPageMargin={settings.viewerPageMargin}
        initialSpreadGap={settings.viewerSpreadGap}
        initialCursorAutoHideMs={settings.cursorAutoHideMs}
        zoomRetention={settings.zoomRetention}
        viewerGridEnabled={settings.viewerGridEnabled}
        viewerGridSize={settings.viewerGridSize}
        viewerGridColor={settings.viewerGridColor}
        panFactor={settings.panFactor}
        wheelDeadZone={settings.wheelDeadZone}
        scrollStepPercent={settings.scrollStepPercent}
        keyScrollAccelerationPercent={settings.keyScrollAccelerationPercent}
        keyScrollContinuous={settings.keyScrollContinuous}
        smoothScroll={settings.smoothScroll}
        pageScanMode={settings.pageScanMode}
        shortcuts={settings.shortcuts}
        initialFullscreen={launch.launchMode === "fullscreen"}
        fullscreenEscapeBehavior={settings.fullscreenEscapeBehavior}
        preventDisplaySleepFullscreen={settings.preventDisplaySleepFullscreen}
        initialSlideshow={launch.launchMode === "slideshow"}
        slideshowIntervalMs={settings.slideshowIntervalMs}
        slideshowOrder={settings.slideshowOrder}
        slideshowRepeatCurrentItem={settings.slideshowRepeatCurrentItem}
        bookmarks={bookmarks}
        onPageChange={(index) => {
          const pageKey = session.pages[index]?.relativePath;
          if (pageKey === undefined) return;
          void emitTo(MAIN_WINDOW_LABEL, VIEWER_PAGE_CHANGED_EVENT, {
            itemKey: session.itemKey,
            pageKey,
          }).catch(() => undefined);
        }}
        mouseGestures={settings.mouseGestures}
        quadrantBindings={settings.viewerQuadrantBindings}
        rightClickAction={settings.viewerRightClickAction}
        onSettingsChange={(viewMode, readingDirection) => {
          persistSettings({ viewMode, readingDirection });
        }}
        onScaleChange={(scale) => {
          if (settings.zoomRetention !== "global") return;
          persistSettings({
            scaleMode: scale.mode,
            scale: scale.scale,
            loupeEnabled: scale.loupeEnabled,
          });
        }}
        onSaveBookmark={saveCurrentBookmark}
        onDeleteBookmark={deleteCurrentBookmark}
        onNextBookmark={(index) => nextBookmark(
          bookmarks,
          session.pages.map((page) => page.relativePath),
          index,
        )?.pageIndex ?? null}
      />
      {bookmarkNotice !== null && <p className="bookmark-notice" role="status">{bookmarkNotice}</p>}
      {notice !== null && <p className="end-of-volume-notice" role="status">{notice}</p>}
      {pendingNext !== null && (
        <div className="dialog-backdrop">
          <div className="end-of-volume-dialog" role="dialog" aria-modal="true" aria-labelledby="end-of-volume-title">
            <h2 id="end-of-volume-title">次の漫画を開きますか？</h2>
            <p>{pendingNext.itemKey}</p>
            <button
              type="button"
              onClick={() => setLaunch({
                itemRelativePath: pendingNext.itemKey,
                launchMode: "normal",
                startAt: "first",
                requestedPageKey: null,
              })}
            >次の漫画を開く</button>
            <button type="button" onClick={() => setPendingNext(null)}>キャンセル</button>
          </div>
        </div>
      )}
    </div>
  );
}
