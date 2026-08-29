import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  API_VERSION,
  type ApiResponse,
  type RequestContext,
} from "../../../types/api";
import type {
  CatalogEntry,
  Generation,
  ItemKind,
  PageId,
  RelativePath,
  RequestId,
} from "../../../types/domain";
import type {
  ScaleMode,
  ViewerBackground,
  ViewerGridColor,
  ViewMode,
  SpreadPairing,
  FitBasis,
  PageScanMode,
  ZoomRetention,
} from "../../viewer/model";
import type { EndOfVolumePolicy } from "../../catalog/end-of-volume";
import type { CatalogThumbnailSizes, CatalogViewMode } from "../../catalog/view-mode";
import type { SearchRequestOptions } from "../../catalog/search-options";
import type { ShortcutBindings } from "../../input/shortcuts";
import type { CatalogMouseBindings } from "../../input/catalog-mouse";
import type { ViewerQuadrantBindings } from "../../input/viewer-quadrants";
import {
  SETTINGS_PROFILE_VERSION,
  type MouseGestureBindings,
  CatalogPanePosition,
  FileOpenRule,
  FolderOpenRule,
  DetailGridLineMode,
  DetailRowDensity,
  NavigationSelectionPolicy,
  SettingsProfile,
  StartupLocation,
  ThumbnailGenerationScope,
} from "../../settings/profile";
import type {
  CustomThemeSnapshot,
  ThemeDefinitionV1,
  ThemeSelection,
} from "../../settings/theme";

export interface CliLaunchPlan {
  libraryRoot: string;
  itemRelativePath: string | null;
  itemKind: ItemKind | null;
  mode: "normal" | "fullscreen" | "slideshow";
}

export interface CliLaunchRequest {
  plan: CliLaunchPlan | null;
  error: string | null;
}

export type ShelfIcon = "books" | "folder" | "star" | "archive" | "image";

export interface NamedShelf {
  id: number;
  name: string;
  icon: ShelfIcon;
  sortOrder: number;
}

export interface ShelfNode {
  id: number;
  shelfId: number;
  parentId: number | null;
  nodeType: "folder" | "item";
  name: string;
  targetPath: string | null;
  targetKind: "folder" | "page" | "archive" | "pdf" | null;
  icon: ShelfIcon;
  sortOrder: number;
}

export interface ShelfSnapshot {
  shelves: NamedShelf[];
  nodes: ShelfNode[];
  startupShelfId: number | null;
}

export interface ShelfCleanupPreview {
  missingNodeIds: number[];
  unavailableNodeIds: number[];
}

export interface ShelfNodeDeletePreview {
  rootNodeId: number;
  totalNodeCount: number;
  previewKey: string;
}

export interface ShelfTextExport {
  fileName: string;
  bytes: number[];
  shelfCount: number;
  nodeCount: number;
}

export interface ShelfImportPreview {
  shelfCount: number;
  nodeCount: number;
  conflictingNames: string[];
  previewKey: string;
}

export type OfflineMediaIcon = "disc" | "removable" | "archive" | "star";

export interface OfflineMediaStatus {
  id: number;
  identity: string;
  name: string;
  sourceSubpath: string;
  volumeLabel: string;
  icon: OfflineMediaIcon;
  filesystem: string;
  volumeSerial: number;
  scannedAtMs: number;
  entryCount: number;
  thumbnailCount: number;
  available: boolean;
  connectedRoot: string | null;
}

export interface OfflineMediaEntry {
  relativePath: string;
  parentPath: string;
  name: string;
  kind: "folder" | "image" | "archive" | "pdf" | "other";
  sizeBytes: number;
  modifiedMs: number;
  sortOrder: number;
}

export interface OfflineMediaCatalog { media: OfflineMediaStatus[]; }

export interface OfflineMediaDetail { media: OfflineMediaStatus; entries: OfflineMediaEntry[]; }

export interface OfflineMediaThumbnailPayload { jpeg: number[]; width: number; height: number; }

export interface TonePoint { input: number; output: number; }

export type ViewerFilter =
  | { kind: "grayscale" }
  | { kind: "levels"; black: number; white: number; gamma: number }
  | { kind: "gamma"; value: number }
  | { kind: "contrast"; value: number }
  | { kind: "brightness"; value: number }
  | { kind: "histogramEqualize" }
  | { kind: "posterize"; levels: number }
  | { kind: "invert" }
  | { kind: "toneCurve"; points: TonePoint[] }
  | { kind: "sharpen"; amount: number }
  | { kind: "unsharpMask"; radius: number; amount: number; threshold: number }
  | { kind: "blur"; radius: number }
  | { kind: "crop"; top: number; right: number; bottom: number; left: number }
  | { kind: "margin"; top: number; right: number; bottom: number; left: number; color: string };

export interface ViewerFilterStep { enabled: boolean; filter: ViewerFilter; }

export interface ViewerFilterSet { id: number; name: string; chain: ViewerFilterStep[]; active: boolean; updatedAtMs: number; }

export interface ViewerFilterCatalog { sets: ViewerFilterSet[]; maximumSets: number; maximumSteps: number; }

export interface WindowsDrive {
  absolutePath: string;
  name: string;
}

export interface WindowsKnownFolder {
  id: "desktop" | "downloads" | "documents" | "pictures";
  name: string;
  absolutePath: string;
}

export interface CatalogSettings {
  sortField: "name" | "modified" | "size" | "kind";
  sortDescending: boolean;
  endOfVolumePolicy: EndOfVolumePolicy;
  catalogViewMode: CatalogViewMode;
  catalogThumbnailSizes: CatalogThumbnailSizes;
  viewMode: ViewMode;
  spreadPortraitMaxAspectPercent: number;
  autoSpreadMinViewportAspectPercent: number;
  spreadFirstPageSingle: boolean;
  spreadPairing: SpreadPairing;
  fitAllowUpscale: boolean;
  fitBasis: FitBasis;
  fitIncludePageMargin: boolean;
  readingDirection: "rightToLeft" | "leftToRight";
  scaleMode: ScaleMode;
  scale: number;
  loupeEnabled: boolean;
  loupeSize: number;
  loupeZoom: number;
  prefetchAhead: number;
  prefetchBehind: number;
  prefetchMemoryMiB: number;
  fullscreenEscapeBehavior: SettingsProfile["fullscreenEscapeBehavior"];
  preventDisplaySleepFullscreen: boolean;
  trayStoreOnMinimize: boolean;
  trayCloseBehavior: SettingsProfile["trayCloseBehavior"];
  trayRestoreGesture: SettingsProfile["trayRestoreGesture"];
  slideshowIntervalMs: number;
  slideshowOrder: SettingsProfile["slideshowOrder"];
  slideshowRepeatCurrentItem: boolean;
  viewerCatalogSelectionSync: boolean;
  viewerBackground: ViewerBackground;
  viewerPageMargin: number;
  viewerSpreadGap: number;
  cursorAutoHideMs: number;
  zoomRetention: ZoomRetention;
  viewerGridEnabled: boolean;
  viewerGridSize: number;
  viewerGridColor: ViewerGridColor;
  panFactor: number;
  wheelDeadZone: number;
  scrollStepPercent: number;
  keyScrollAccelerationPercent: number;
  keyScrollContinuous: boolean;
  smoothScroll: boolean;
  pageScanMode: PageScanMode;
  treeVisible: boolean;
  treeAutoCollapse: boolean;
  treeConfirmChildren: boolean;
  treeWidth: number;
  treeHeight: number;
  catalogPanePosition: CatalogPanePosition;
  menuBarVisible: boolean;
  toolbarVisible: boolean;
  addressBarVisible: boolean;
  statusBarVisible: boolean;
  alwaysOnTop: boolean;
  themeSelection: ThemeSelection;
  customThemeSnapshot: CustomThemeSnapshot | null;
  themeFallbackReason: string | null;
  navigationSelectionPolicy: NavigationSelectionPolicy;
  thumbnailGenerationScope: ThumbnailGenerationScope;
  startupLocation: StartupLocation;
  showHiddenFiles: boolean;
  restoreLastViewer: boolean;
  autoRefreshCurrentFolder: boolean;
  folderOpenRule: FolderOpenRule;
  imageOpenRule: FileOpenRule;
  archiveOpenRule: FileOpenRule;
  detailGridLines: DetailGridLineMode;
  detailRowDensity: DetailRowDensity;
  detailShowKind: boolean;
  detailShowSize: boolean;
  detailShowModified: boolean;
  shortcuts: ShortcutBindings;
  catalogMouseBindings: CatalogMouseBindings;
  viewerQuadrantBindings: ViewerQuadrantBindings;
  viewerRightClickAction: SettingsProfile["viewerRightClickAction"];
  mouseGestures: MouseGestureBindings;
}

export interface NamedSettingsProfileSummary {
  name: string;
  updatedAtMs: number;
  active: boolean;
}

export interface CustomThemeRecord {
  themeId: number;
  revision: number;
  definition: ThemeDefinitionV1;
  createdAtMs: number;
  updatedAtMs: number;
  active: boolean;
}

export interface InvalidCustomThemeRecord {
  themeId: number;
  name: string;
  reason: string;
  active: boolean;
}

export interface CustomThemeCatalog {
  themes: CustomThemeRecord[];
  invalidThemes: InvalidCustomThemeRecord[];
  maximumThemes: number;
}

export interface CustomThemeImportConflict {
  themeId: number;
  revision: number;
  name: string;
}

export interface CustomThemeImportPreview {
  definition: ThemeDefinitionV1;
  conflict: CustomThemeImportConflict | null;
  confirmationKey: string;
  byteLength: number;
}

export interface CustomThemeExport {
  fileName: string;
  bytes: number[];
}

export interface SettingsProfileSwitchPreview {
  name: string;
  changedFieldCount: number;
  profile: SettingsProfile;
  confirmationKey: string;
}

export type NativeSettingsProfile = Omit<SettingsProfile, "profileVersion">;

export interface TrayStatus {
  available: boolean;
  stored: boolean;
  reason: string | null;
}

export type CatalogActivationTrigger = "doubleClick" | "enter" | "ctrlEnter";

export type CatalogActivationAction = "navigate" | "read" | "none";

export interface ViewerRectangleZoomInput {
  viewportWidth: number;
  viewportHeight: number;
  selectionLeft: number;
  selectionTop: number;
  selectionWidth: number;
  selectionHeight: number;
  scrollLeft: number;
  scrollTop: number;
  currentScale: number;
}

export interface ViewerRectangleZoomPlan {
  scale: number;
  scrollLeft: number;
  scrollTop: number;
}

export type FavoriteStatus = "available" | "moved" | "missing";

export interface FavoriteEntry {
  favoriteId: string;
  itemIdentity: string;
  relativePath: RelativePath;
  resolvedPath: RelativePath | null;
  kind: ItemKind | null;
  status: FavoriteStatus;
}

export interface CatalogFolderChange {
  generation: number;
  libraryRoot: string;
  relativePath: string;
  status: "changed" | "error";
  message?: string | null;
}

export type FileOperationKind =
  | "rename"
  | "createFolder"
  | "copy"
  | "move"
  | "recycle"
  | "delete"
  | "cut"
  | "clipboardCopy"
  | "pasteCopy"
  | "pasteMove"
  | "dragCopy"
  | "reveal"
  | "openDefault"
  | "openWith"
  | "undo";

export interface FileOperationResult {
  operation: FileOperationKind;
  affected: number;
}

export interface FileClipboardStatus {
  available: boolean;
  cut: boolean;
  items: number;
}

export interface FileUndoStatus {
  available: boolean;
  operation: FileOperationKind | null;
  affected: number;
}

export interface NativeFileDropItem {
  name: string;
  kind: "file" | "folder";
}

export interface NativeFileDropPreview {
  destinationRelativePath: string;
  items: NativeFileDropItem[];
  fileCount: number;
  folderCount: number;
}

export interface RenamePreferences {
  selectExtension: boolean;
  sequenceStart: number;
  sequenceDigits: number;
  separator: "" | " " | "-" | "_";
  preserveExtension: boolean;
}

export interface BatchRenamePreviewItem {
  sourceRelativePath: string;
  targetRelativePath: string;
}

export interface BatchRenamePreview {
  items: BatchRenamePreviewItem[];
  unchanged: number;
  previewKey: string;
}

export type ExternalAppTargetMode = "firstItem" | "allSelected" | "parentFolder";

export interface ExternalAppEntry {
  id: number;
  displayName: string;
  executableName: string;
  fixedArgs: string[];
  targetMode: ExternalAppTargetMode;
}

export interface ExternalAppHistoryEntry {
  appId: number;
  displayName: string;
  targetMode: ExternalAppTargetMode;
  targetCount: number;
  launchedAtMs: number;
}

export interface ExternalAppLaunchPreview {
  appId: number;
  displayName: string;
  executableName: string;
  targetMode: ExternalAppTargetMode;
  targetCount: number;
  fixedArgCount: number;
  previewKey: string;
}

export type SearchResultEntry = CatalogEntry & { sourceRoot?: string };

export interface CatalogMaskCandidate {
  basename: string;
  kind: ItemKind;
  byteSize?: number;
  modifiedMs?: number;
}

export interface CatalogMaskOptions {
  includeFolders: boolean;
  includeFiles: boolean;
  minSizeBytes?: number;
  maxSizeBytes?: number;
  modifiedAfterMs?: number;
  modifiedBeforeMs?: number;
}

export interface SavedCatalogMask {
  name: string;
  expression: string;
  options: CatalogMaskOptions;
  updatedAtMs: number;
}

export type CsvColumn =
  | "name"
  | "stem"
  | "extension"
  | "kind"
  | "relativePath"
  | "size"
  | "modifiedMs"
  | "namePart1"
  | "namePart2"
  | "namePart3"
  | "namePart4";

export type CsvSizeUnit = "bytes" | "kib" | "mib";

export type CsvExportScope = "selected" | "current" | "recursive";

export interface CsvExportConfig {
  columns: CsvColumn[];
  includeHeader: boolean;
  sizeUnit: CsvSizeUnit;
  splitDelimiter?: string;
}

export interface CsvExportPreset {
  name: string;
  config: CsvExportConfig;
  updatedAtMs: number;
}

export interface CsvExportResult {
  fileName: string;
  bytes: number[];
  rowCount: number;
}

export type DiagnosticStatus =
  | "added"
  | "changed"
  | "missing"
  | "duplicate"
  | "corrupt";

export type DiagnosticSeverity = "info" | "warning" | "error";

export interface DiagnosticSnapshotEntry {
  itemIdentity: string;
  relativePath: RelativePath;
  kind: ItemKind;
  byteSize: number | null;
  modifiedMs: number | null;
  contentHash: string;
}

export interface DiagnosticFinding {
  status: DiagnosticStatus;
  severity: DiagnosticSeverity;
  itemIdentity: string;
  relativePath: RelativePath | null;
  kind: ItemKind | null;
  contentHash: string | null;
  message: string;
  retryable: boolean;
}

export interface DiagnosticSummary {
  scanned: number;
  findings: number;
  added: number;
  changed: number;
  missing: number;
  duplicates: number;
  corrupt: number;
  errors: number;
}

export interface DiagnosticReport {
  schema: "fr-b09/v1";
  snapshot: DiagnosticSnapshotEntry[];
  findings: DiagnosticFinding[];
  summary: DiagnosticSummary;
  retryRequested: boolean;
}

export interface ThumbnailData {
  itemRelativePath: RelativePath;
  contentHash: string;
  mediaUri: string;
  cacheHit: boolean;
}

export interface RecursiveThumbnailProgress {
  generation: number;
  phase: "enumerating" | "generating" | "completed" | "cancelled";
  relativePath: string;
  processed: number;
  total: number;
  generated: number;
  cacheHits: number;
  failed: number;
}

export interface RecursiveThumbnailReport {
  total: number;
  generated: number;
  cacheHits: number;
  failed: number;
}

export interface TreeEntry {
  relativePath: RelativePath;
  hasChildren?: boolean | null;
  entryKind?: "folder" | "archive";
}

export type ArchiveVirtualEntryKind = "folder" | "image" | "archive";

export interface ArchiveVirtualEntry {
  id: string;
  parentId: string | null;
  name: string;
  kind: ArchiveVirtualEntryKind;
  hasChildren: boolean;
  pageKey: RelativePath | null;
  sortOrder: number;
}

export interface ArchiveVirtualTreeSnapshot {
  archiveRelativePath: RelativePath;
  entries: ArchiveVirtualEntry[];
}

export interface ArchiveThumbnailData {
  archiveRelativePath: RelativePath;
  pageKey: RelativePath;
  contentHash: string;
  mediaUri: string;
  cacheHit: boolean;
}

export interface ViewerPage {
  id: PageId;
  relativePath: RelativePath;
  mediaUri: string;
}

export interface ViewerSession {
  itemKey: string;
  displayName: string;
  pages: ViewerPage[];
  startIndex: number;
}

export interface ItemMetadata {
  itemIdentity: RelativePath;
  memo: string | null;
  rating: number | null;
}

export interface TagEntry {
  tagId: string;
  name: string;
  itemCount: number;
}

export interface ItemTags {
  itemIdentity: RelativePath;
  tags: TagEntry[];
}

export interface ReadingHistoryEntry {
  itemIdentity: RelativePath;
  lastViewedAtMs: number;
}

export interface PageBookmarkEntry {
  itemKey: string;
  pageIndex: number;
  pageKey: string;
  createdAt: number;
}

export interface ClipboardImageResult {
  pageRelativePath: string;
  width: number;
  height: number;
  payloadBytes: number;
}
