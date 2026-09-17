import { invoke } from "@tauri-apps/api/core";
import type { ApiResponse } from "../../../types/api";
import type { ShortcutBindings } from "../../input/shortcuts";
import { SETTINGS_PROFILE_VERSION, type SettingsProfile } from "../../settings/profile";
import type { ThemeDefinitionV1 } from "../../settings/theme";
import type {
  ViewerFilterStep,
  ViewerFilterCatalog,
  CatalogSettings,
  NamedSettingsProfileSummary,
  CustomThemeCatalog,
  CustomThemeImportPreview,
  CustomThemeExport,
  SettingsProfileSwitchPreview,
  NativeSettingsProfile,
} from "./contracts";
import { context } from "./context";

export async function activateViewerFilterSet(filterSetId: number | null, generation: number): Promise<ApiResponse<ViewerFilterCatalog>> {
  return invoke("activate_viewer_filter_set", { context: context(generation), filterSetId });
}

export async function deleteCustomTheme(
  themeId: number,
  confirmed: boolean,
  generation: number,
): Promise<ApiResponse<CustomThemeCatalog>> {
  return invoke("delete_custom_theme", {
    context: context(generation),
    themeId,
    confirmed,
  });
}

export async function deleteNamedSettingsProfile(
  name: string,
  confirmed: boolean,
  generation: number,
): Promise<ApiResponse<boolean>> {
  return invoke("delete_named_settings_profile", {
    context: context(generation),
    name,
    confirmed,
  });
}

export async function deleteViewerFilterSet(filterSetId: number, generation: number): Promise<ApiResponse<ViewerFilterCatalog>> {
  return invoke("delete_viewer_filter_set", { context: context(generation), filterSetId, confirmed: true });
}

export async function executeCustomThemeImport(
  bytes: number[],
  confirmationKey: string,
  replaceExisting: boolean,
  generation: number,
): Promise<ApiResponse<CustomThemeCatalog>> {
  return invoke("execute_custom_theme_import", {
    context: context(generation),
    bytes,
    confirmationKey,
    replaceExisting,
  });
}

function nativeSettingsProfile(profile: SettingsProfile): NativeSettingsProfile {
  const { profileVersion: _profileVersion, ...native } = profile;
  return native;
}

export async function executeNamedSettingsProfileSwitch(
  name: string,
  confirmationKey: string,
  confirmed: boolean,
  generation: number,
): Promise<ApiResponse<CatalogSettings>> {
  return invoke("execute_named_settings_profile_switch", {
    context: context(generation),
    name,
    confirmationKey,
    confirmed,
  });
}

export async function exportCustomTheme(
  themeId: number,
  generation: number,
): Promise<ApiResponse<CustomThemeExport>> {
  return invoke("export_custom_theme", {
    context: context(generation),
    themeId,
  });
}

export async function listCustomThemes(
  generation: number,
): Promise<ApiResponse<CustomThemeCatalog>> {
  return invoke("list_custom_themes", { context: context(generation) });
}

export async function listNamedSettingsProfiles(
  generation: number,
): Promise<ApiResponse<NamedSettingsProfileSummary[]>> {
  return invoke("list_named_settings_profiles", { context: context(generation) });
}

export async function listViewerFilterSets(generation: number): Promise<ApiResponse<ViewerFilterCatalog>> {
  return invoke("list_viewer_filter_sets", { context: context(generation) });
}

export async function previewCustomThemeImport(
  bytes: number[],
  generation: number,
): Promise<ApiResponse<CustomThemeImportPreview>> {
  return invoke("preview_custom_theme_import", {
    context: context(generation),
    bytes,
  });
}

export async function previewNamedSettingsProfileSwitch(
  name: string,
  generation: number,
): Promise<ApiResponse<SettingsProfileSwitchPreview>> {
  const response = await invoke<ApiResponse<{
    name: string;
    changedFieldCount: number;
    profile: NativeSettingsProfile;
    confirmationKey: string;
  }>>("preview_named_settings_profile_switch", {
    context: context(generation),
    name,
  });
  if (response.status !== "ok") return response;
  return {
    ...response,
    data: {
      ...response.data,
      profile: {
        profileVersion: SETTINGS_PROFILE_VERSION,
        ...response.data.profile,
      },
    },
  };
}

export async function saveCustomTheme(
  request: {
    themeId: number | null;
    expectedRevision: number | null;
    definition: ThemeDefinitionV1;
  },
  generation: number,
): Promise<ApiResponse<CustomThemeCatalog>> {
  return invoke("save_custom_theme", {
    context: context(generation),
    request,
  });
}

export async function saveNamedSettingsProfile(
  name: string,
  profile: SettingsProfile,
  overwrite: boolean,
  generation: number,
): Promise<ApiResponse<NamedSettingsProfileSummary>> {
  return invoke("save_named_settings_profile", {
    context: context(generation),
    name,
    profile: nativeSettingsProfile(profile),
    overwrite,
  });
}

export async function saveSettingsProfile(
  profile: SettingsProfile,
  generation: number,
): Promise<ApiResponse<CatalogSettings>> {
  return invoke("set_settings_profile", {
    context: context(generation),
    profile: {
      sortField: profile.sortField,
      sortDescending: profile.sortDescending,
      endOfVolumePolicy: profile.endOfVolumePolicy,
      catalogViewMode: profile.catalogViewMode,
      catalogThumbnailSizes: profile.catalogThumbnailSizes,
      viewMode: profile.viewMode,
      spreadPortraitMaxAspectPercent: profile.spreadPortraitMaxAspectPercent,
      autoSpreadMinViewportAspectPercent: profile.autoSpreadMinViewportAspectPercent,
      spreadFirstPageSingle: profile.spreadFirstPageSingle,
      spreadPairing: profile.spreadPairing,
      fitAllowUpscale: profile.fitAllowUpscale,
      fitBasis: profile.fitBasis,
      fitIncludePageMargin: profile.fitIncludePageMargin,
      readingDirection: profile.readingDirection,
      scaleMode: profile.scaleMode,
      scale: profile.scale,
      loupeEnabled: profile.loupeEnabled,
      loupeSize: profile.loupeSize,
      loupeZoom: profile.loupeZoom,
      prefetchAhead: profile.prefetchAhead,
      prefetchBehind: profile.prefetchBehind,
      prefetchMemoryMiB: profile.prefetchMemoryMiB,
      fullscreenEscapeBehavior: profile.fullscreenEscapeBehavior,
      preventDisplaySleepFullscreen: profile.preventDisplaySleepFullscreen,
      trayStoreOnMinimize: profile.trayStoreOnMinimize,
      trayCloseBehavior: profile.trayCloseBehavior,
      trayRestoreGesture: profile.trayRestoreGesture,
      slideshowIntervalMs: profile.slideshowIntervalMs,
      slideshowOrder: profile.slideshowOrder,
      slideshowRepeatCurrentItem: profile.slideshowRepeatCurrentItem,
      viewerCatalogSelectionSync: profile.viewerCatalogSelectionSync,
      viewerBackground: profile.viewerBackground,
      viewerPageMargin: profile.viewerPageMargin,
      viewerSpreadGap: profile.viewerSpreadGap,
      cursorAutoHideMs: profile.cursorAutoHideMs,
      zoomRetention: profile.zoomRetention,
      viewerGridEnabled: profile.viewerGridEnabled,
      viewerGridSize: profile.viewerGridSize,
      viewerGridColor: profile.viewerGridColor,
      panFactor: profile.panFactor,
      wheelDeadZone: profile.wheelDeadZone,
      scrollStepPercent: profile.scrollStepPercent,
      keyScrollAccelerationPercent: profile.keyScrollAccelerationPercent,
      keyScrollContinuous: profile.keyScrollContinuous,
      smoothScroll: profile.smoothScroll,
      pageScanMode: profile.pageScanMode,
      treeVisible: profile.treeVisible,
      treeAutoCollapse: profile.treeAutoCollapse,
      treeConfirmChildren: profile.treeConfirmChildren,
      treeWidth: profile.treeWidth,
      treeHeight: profile.treeHeight,
      catalogPanePosition: profile.catalogPanePosition,
      menuBarVisible: profile.menuBarVisible,
      toolbarVisible: profile.toolbarVisible,
      addressBarVisible: profile.addressBarVisible,
      statusBarVisible: profile.statusBarVisible,
      alwaysOnTop: profile.alwaysOnTop,
      themeSelection: profile.themeSelection,
      customThemeSnapshot: profile.customThemeSnapshot,
      navigationSelectionPolicy: profile.navigationSelectionPolicy,
      thumbnailGenerationScope: profile.thumbnailGenerationScope,
      startupLocation: profile.startupLocation,
      showHiddenFiles: profile.showHiddenFiles,
      restoreLastViewer: profile.restoreLastViewer,
      autoRefreshCurrentFolder: profile.autoRefreshCurrentFolder,
      folderOpenRule: profile.folderOpenRule,
      imageOpenRule: profile.imageOpenRule,
      archiveOpenRule: profile.archiveOpenRule,
      detailGridLines: profile.detailGridLines,
      detailRowDensity: profile.detailRowDensity,
      detailShowKind: profile.detailShowKind,
      detailShowSize: profile.detailShowSize,
      detailShowModified: profile.detailShowModified,
      shortcuts: profile.shortcuts,
      catalogMouseBindings: profile.catalogMouseBindings,
      viewerQuadrantBindings: profile.viewerQuadrantBindings,
      viewerRightClickAction: profile.viewerRightClickAction,
      mouseGestures: profile.mouseGestures,
    },
  });
}

export async function saveShortcutBindings(
  shortcuts: ShortcutBindings,
  generation: number,
): Promise<ApiResponse<ShortcutBindings>> {
  return invoke("set_shortcut_bindings", {
    context: context(generation),
    shortcuts,
  });
}

export async function saveViewerFilterSet(name: string, chain: ViewerFilterStep[], overwrite: boolean, generation: number): Promise<ApiResponse<ViewerFilterCatalog>> {
  return invoke("save_viewer_filter_set", { context: context(generation), request: { name, chain, overwrite } });
}

export async function saveViewerSettings(
  settings: Pick<
    CatalogSettings,
    | "viewMode"
    | "spreadPortraitMaxAspectPercent"
    | "autoSpreadMinViewportAspectPercent"
    | "spreadFirstPageSingle"
    | "spreadPairing"
    | "fitAllowUpscale"
    | "fitBasis"
    | "fitIncludePageMargin"
    | "readingDirection"
    | "scaleMode"
    | "scale"
    | "loupeEnabled"
    | "viewerBackground"
    | "viewerPageMargin"
    | "viewerSpreadGap"
    | "cursorAutoHideMs"
  >,
  generation: number,
): Promise<ApiResponse<CatalogSettings>> {
  return invoke("set_viewer_settings", {
    context: context(generation),
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
  });
}
