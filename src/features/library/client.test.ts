import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import * as libraryClientFacade from "./client";
import * as libraryClientCommands from "./client/commands";
import { createDefaultSettingsProfile } from "../settings/profile";
import {
  deleteCatalogMask,
  evaluateCatalogMask,
  listCatalogMasks,
  pickSearchSource,
  listenCatalogFolderChanges,
  saveCatalogMask,
  searchLibrary,
  stopLibraryFolderWatch,
  watchLibraryFolder,
  saveSettingsProfile,
  resolveCatalogActivation,
  resolveViewerRectangleZoom,
  cancelRecursiveThumbnailGeneration,
  generateRecursiveThumbnails,
  listenRecursiveThumbnailProgress,
  copyFileItemsToDestination,
  previewNativeFileDrop,
  copyNativeFileDrop,
  startNativeFileDrag,
  registerExternalApp,
  previewExternalAppLaunch,
  launchExternalApp,
  listExternalAppHistory,
  saveRenamePreferences,
  previewBatchRename,
  executeBatchRename,
  listNamedSettingsProfiles,
  saveNamedSettingsProfile,
  previewNamedSettingsProfileSwitch,
  executeNamedSettingsProfileSwitch,
  deleteNamedSettingsProfile,
  listCustomThemes,
  saveCustomTheme,
  deleteCustomTheme,
  exportCustomTheme,
  previewCustomThemeImport,
  executeCustomThemeImport,
  listCsvExportPresets,
  saveCsvExportPreset,
  deleteCsvExportPreset,
  exportCatalogCsv,
  takeCliLaunchRequest,
  listenCliLaunchPending,
  addShelfItems,
  createShelf,
  executeShelvesImport,
  previewShelvesImport,
  migrateLegacyShelf,
  listArchiveVirtualTree,
  getArchiveThumbnail,
  copyArchivePageToClipboard,
  getFileUndoStatus,
  undoLastFileOperation,
  cancelOfflineMediaRegistration,
  deleteOfflineMedia,
  getOfflineMedia,
  getOfflineMediaThumbnail,
  listOfflineMedia,
  openOfflineMediaEntry,
  registerOfflineMedia,
  setOfflineMediaIcon,
  activateViewerFilterSet,
  deleteViewerFilterSet,
  listViewerFilterSets,
  saveViewerFilterSet,
} from "./client";
import { BUILTIN_THEMES } from "../settings/theme";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));

const invokeMock = vi.mocked(invoke);
const listenMock = vi.mocked(listen);

describe("library client settings contract", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({ status: "cancelled" });
    listenMock.mockReset();
    listenMock.mockResolvedValue(vi.fn());
  });

  it("exports every transport command through a feature facade", () => {
    expect(Object.keys(libraryClientFacade).sort()).toEqual(
      Object.keys(libraryClientCommands).sort(),
    );
  });

  it("REQ-LEY-P3-021 uses typed Rust queue IPC and the bounded native event", async () => {
    const handler = vi.fn();
    await takeCliLaunchRequest(29);
    await listenCliLaunchPending(handler);

    expect(invokeMock).toHaveBeenCalledWith(
      "take_cli_launch_request",
      expect.objectContaining({
        context: expect.objectContaining({ generation: 29 }),
      }),
    );
    expect(listenMock).toHaveBeenCalledWith("cli-launch-pending", handler);
  });

  it("REQ-LEY-P4-001 keeps shelf persistence, internal drag paths, and confirmed import in Rust IPC", async () => {
    await createShelf("読む本", "books", 80);
    await addShelfItems(7, 9, ["Series/01.cbz", "Series/02.cbz"], 81);
    await previewShelvesImport([0xef, 0xbb, 0xbf, 123, 125], true, 82);
    await executeShelvesImport([0xef, 0xbb, 0xbf, 123, 125], true, "opaque", 83);
    await migrateLegacyShelf(["legacy.cbz"], 84);

    expect(invokeMock).toHaveBeenNthCalledWith(1, "create_shelf", expect.objectContaining({
      name: "読む本", icon: "books",
      context: expect.objectContaining({ generation: 80 }),
    }));
    expect(invokeMock).toHaveBeenNthCalledWith(2, "add_shelf_items", expect.objectContaining({
      request: { shelfId: 7, parentId: 9, relativePaths: ["Series/01.cbz", "Series/02.cbz"] },
    }));
    expect(invokeMock).toHaveBeenNthCalledWith(3, "preview_shelves_import", expect.objectContaining({
      replaceExisting: true,
    }));
    expect(invokeMock).toHaveBeenNthCalledWith(4, "execute_shelves_import", expect.objectContaining({
      previewKey: "opaque", confirmed: true,
    }));
    expect(invokeMock).toHaveBeenNthCalledWith(5, "migrate_legacy_shelf", expect.objectContaining({
      relativePaths: ["legacy.cbz"],
    }));
  });

  it("REQ-LEY-P4-002 sends only the root-relative archive path to the Rust virtual-tree boundary", async () => {
    await listArchiveVirtualTree("Series/book.cbz", 85);
    expect(invokeMock).toHaveBeenCalledWith("list_archive_virtual_tree", {
      context: expect.objectContaining({ generation: 85 }),
      archiveRelativePath: "Series/book.cbz",
    });
  });

  it("REQ-MVP-006 requests one archive page thumbnail through structured IPC", async () => {
    await getArchiveThumbnail("Series/book.cbz", "chapter/2.png", 86, "visible");
    expect(invokeMock).toHaveBeenCalledWith("get_archive_thumbnail", {
      context: expect.objectContaining({ generation: 86 }),
      archiveRelativePath: "Series/book.cbz",
      pageKey: "chapter/2.png",
      priority: "visible",
    });
  });

  it("REQ-LEY-P4-002 copies one opaque archive page through structured IPC", async () => {
    await copyArchivePageToClipboard("Series/book.cbz", "chapter/2.png", 87);
    expect(invokeMock).toHaveBeenCalledWith("copy_archive_page_to_clipboard", {
      context: expect.objectContaining({ generation: 87 }),
      archiveRelativePath: "Series/book.cbz",
      pageKey: "chapter/2.png",
    });
  });

  it("REQ-LEY-P4-003 keeps undo status and execution in the Rust file-operation boundary", async () => {
    await getFileUndoStatus(86);
    await undoLastFileOperation(87);
    expect(invokeMock).toHaveBeenNthCalledWith(1, "get_file_undo_status", {
      context: expect.objectContaining({ generation: 86 }),
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, "undo_last_file_operation", {
      context: expect.objectContaining({ generation: 87 }),
    });
  });

  it("REQ-LEY-P5-001 keeps media identity, scan, transaction, thumbnails, and open validation in Rust IPC", async () => {
    await listOfflineMedia(90);
    await registerOfflineMedia("資料DVD", "disc", 91);
    await cancelOfflineMediaRegistration(91);
    await getOfflineMedia(7, 92);
    await getOfflineMediaThumbnail(7, "Books/cover.jpg", 93);
    await setOfflineMediaIcon(7, "star", 94);
    await openOfflineMediaEntry(7, "Books/one.cbz", 95);
    await deleteOfflineMedia(7, 96);

    expect(invokeMock).toHaveBeenNthCalledWith(1, "list_offline_media", expect.any(Object));
    expect(invokeMock).toHaveBeenNthCalledWith(2, "register_offline_media", expect.objectContaining({ request: { name: "資料DVD", icon: "disc" } }));
    expect(invokeMock).toHaveBeenNthCalledWith(3, "cancel_offline_media_registration", expect.objectContaining({ context: expect.objectContaining({ generation: 91 }) }));
    expect(invokeMock).toHaveBeenNthCalledWith(4, "get_offline_media", expect.objectContaining({ mediaId: 7 }));
    expect(invokeMock).toHaveBeenNthCalledWith(5, "get_offline_media_thumbnail", expect.objectContaining({ relativePath: "Books/cover.jpg" }));
    expect(invokeMock).toHaveBeenNthCalledWith(6, "set_offline_media_icon", expect.objectContaining({ icon: "star" }));
    expect(invokeMock).toHaveBeenNthCalledWith(7, "open_offline_media_entry", expect.objectContaining({ relativePath: "Books/one.cbz" }));
    expect(invokeMock).toHaveBeenNthCalledWith(8, "delete_offline_media", expect.objectContaining({ confirmed: true }));
  });

  it("REQ-LEY-P5-002 keeps named ordered filter chains and activation in Rust IPC", async () => {
    const chain = [
      { enabled: true, filter: { kind: "grayscale" as const } },
      { enabled: true, filter: { kind: "gamma" as const, value: 1.2 } },
    ];
    await listViewerFilterSets(100);
    await saveViewerFilterSet("Scan", chain, true, 101);
    await activateViewerFilterSet(4, 102);
    await activateViewerFilterSet(null, 103);
    await deleteViewerFilterSet(4, 104);
    expect(invokeMock).toHaveBeenNthCalledWith(1, "list_viewer_filter_sets", expect.any(Object));
    expect(invokeMock).toHaveBeenNthCalledWith(2, "save_viewer_filter_set", expect.objectContaining({ request: { name: "Scan", chain, overwrite: true } }));
    expect(invokeMock).toHaveBeenNthCalledWith(3, "activate_viewer_filter_set", expect.objectContaining({ filterSetId: 4 }));
    expect(invokeMock).toHaveBeenNthCalledWith(4, "activate_viewer_filter_set", expect.objectContaining({ filterSetId: null }));
    expect(invokeMock).toHaveBeenNthCalledWith(5, "delete_viewer_filter_set", expect.objectContaining({ filterSetId: 4, confirmed: true }));
  });

  it("REQ-LEY-P2-015 sends the required Viewer catalog sync field to Rust", async () => {
    const profile = createDefaultSettingsProfile();
    profile.viewerCatalogSelectionSync = false;
    await saveSettingsProfile(profile, 17);

    expect(invokeMock).toHaveBeenCalledWith(
      "set_settings_profile",
      expect.objectContaining({
        profile: expect.objectContaining({ viewerCatalogSelectionSync: false }),
      }),
    );
  });

  it("REQ-FR-B24-004 keeps custom theme CRUD and confirmed import/export in Rust IPC", async () => {
    const definition = {
      ...BUILTIN_THEMES.light,
      name: "Reading",
      colors: { ...BUILTIN_THEMES.light.colors },
    };
    const bytes = [123, 125];
    await listCustomThemes(80);
    await saveCustomTheme({
      themeId: null,
      expectedRevision: null,
      definition,
    }, 81);
    await deleteCustomTheme(7, true, 82);
    await exportCustomTheme(7, 83);
    await previewCustomThemeImport(bytes, 84);
    await executeCustomThemeImport(bytes, "opaque-theme-key", true, 85);

    expect(invokeMock).toHaveBeenNthCalledWith(1, "list_custom_themes", {
      context: expect.objectContaining({ generation: 80 }),
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, "save_custom_theme", expect.objectContaining({
      request: { themeId: null, expectedRevision: null, definition },
    }));
    expect(invokeMock).toHaveBeenNthCalledWith(3, "delete_custom_theme", expect.objectContaining({
      themeId: 7, confirmed: true,
    }));
    expect(invokeMock).toHaveBeenNthCalledWith(4, "export_custom_theme", expect.objectContaining({
      themeId: 7,
    }));
    expect(invokeMock).toHaveBeenNthCalledWith(5, "preview_custom_theme_import", expect.objectContaining({
      bytes,
    }));
    expect(invokeMock).toHaveBeenNthCalledWith(6, "execute_custom_theme_import", expect.objectContaining({
      bytes, confirmationKey: "opaque-theme-key", replaceExisting: true,
    }));
  });

  it("REQ-FR-B24-005 includes theme selection and snapshot in strict settings profile IPC", async () => {
    const profile = createDefaultSettingsProfile();
    profile.themeSelection = { kind: "builtin", themeId: "forest" };
    profile.customThemeSnapshot = null;
    await saveSettingsProfile(profile, 86);

    expect(invokeMock).toHaveBeenCalledWith(
      "set_settings_profile",
      expect.objectContaining({
        profile: expect.objectContaining({
          themeSelection: { kind: "builtin", themeId: "forest" },
          customThemeSnapshot: null,
        }),
      }),
    );
  });

  it("REQ-LEY-P3-006 sends strict tree detail settings to Rust", async () => {
    const profile = createDefaultSettingsProfile();
    profile.treeAutoCollapse = true;
    profile.treeConfirmChildren = false;
    profile.treeWidth = 360;
    await saveSettingsProfile(profile, 19);

    expect(invokeMock).toHaveBeenCalledWith(
      "set_settings_profile",
      expect.objectContaining({
        profile: expect.objectContaining({
          treeAutoCollapse: true,
          treeConfirmChildren: false,
          treeWidth: 360,
        }),
      }),
    );
  });

  it("REQ-LEY-P4-004 sends the four-direction layout only through the Rust profile command", async () => {
    const profile = createDefaultSettingsProfile();
    profile.catalogPanePosition = "bottom";
    profile.treeHeight = 360;
    await saveSettingsProfile(profile, 191);

    expect(invokeMock).toHaveBeenCalledWith(
      "set_settings_profile",
      expect.objectContaining({
        profile: expect.objectContaining({ catalogPanePosition: "bottom", treeHeight: 360 }),
      }),
    );
  });

  it("REQ-LEY-P3-007 sends open rules and activation context to Rust", async () => {
    const profile = createDefaultSettingsProfile();
    profile.folderOpenRule = "read";
    profile.imageOpenRule = "none";
    profile.archiveOpenRule = "none";
    await saveSettingsProfile(profile, 20);
    await resolveCatalogActivation("archive", "ctrlEnter", 21);

    expect(invokeMock).toHaveBeenNthCalledWith(
      1,
      "set_settings_profile",
      expect.objectContaining({
        profile: expect.objectContaining({
          folderOpenRule: "read",
          imageOpenRule: "none",
          archiveOpenRule: "none",
        }),
      }),
    );
    expect(invokeMock).toHaveBeenNthCalledWith(
      2,
      "resolve_catalog_activation",
      expect.objectContaining({
        context: expect.objectContaining({ generation: 21 }),
        kind: "archive",
        trigger: "ctrlEnter",
      }),
    );
  });

  it("REQ-LEY-P3-008 sends strict detail formatting to Rust", async () => {
    const profile = createDefaultSettingsProfile();
    profile.detailGridLines = "both";
    profile.detailRowDensity = "comfortable";
    profile.detailShowKind = false;
    profile.detailShowSize = false;
    profile.detailShowModified = false;
    await saveSettingsProfile(profile, 22);

    expect(invokeMock).toHaveBeenCalledWith(
      "set_settings_profile",
      expect.objectContaining({
        profile: expect.objectContaining({
          detailGridLines: "both",
          detailRowDensity: "comfortable",
          detailShowKind: false,
          detailShowSize: false,
          detailShowModified: false,
        }),
      }),
    );
  });

  it("REQ-LEY-P3-012 sends typed key-scroll preferences to Rust", async () => {
    const profile = createDefaultSettingsProfile();
    profile.keyScrollAccelerationPercent = 220;
    profile.keyScrollContinuous = false;
    await saveSettingsProfile(profile, 23);

    expect(invokeMock).toHaveBeenCalledWith(
      "set_settings_profile",
      expect.objectContaining({
        profile: expect.objectContaining({
          keyScrollAccelerationPercent: 220,
          keyScrollContinuous: false,
        }),
      }),
    );
  });

  it("REQ-LEY-P3-013 sends the complete catalog mouse registry to Rust", async () => {
    const profile = createDefaultSettingsProfile();
    profile.catalogMouseBindings.middleClick = "toggleSearch";
    await saveSettingsProfile(profile, 24);

    expect(invokeMock).toHaveBeenCalledWith(
      "set_settings_profile",
      expect.objectContaining({
        profile: expect.objectContaining({
          catalogMouseBindings: {
            primaryClick: "selectOnly",
            doubleClick: "openSelected",
            middleClick: "toggleSearch",
            backButton: "navigateBack",
            forwardButton: "navigateForward",
          },
        }),
      }),
    );
  });

  it("REQ-LEY-P3-014 sends the complete Viewer quadrant registry to Rust", async () => {
    const profile = createDefaultSettingsProfile();
    profile.viewerQuadrantBindings.topLeft = "zoomIn";
    await saveSettingsProfile(profile, 25);

    expect(invokeMock).toHaveBeenCalledWith(
      "set_settings_profile",
      expect.objectContaining({
        profile: expect.objectContaining({
          viewerQuadrantBindings: {
            topLeft: "zoomIn",
            topRight: "nextPage",
            bottomLeft: "previousPage",
            bottomRight: "nextPage",
          },
          viewerRightClickAction: "none",
        }),
      }),
    );
  });

  it("REQ-LEY-P3-010 sends only typed drag/drop commands to Rust", async () => {
    await copyFileItemsToDestination(["one.cbz", "two.pdf"], "Target", 31);
    await previewNativeFileDrop(["D:\\Incoming\\one.cbz"], "Target", 32);
    await copyNativeFileDrop(["D:\\Incoming\\one.cbz"], "Target", 33);
    await startNativeFileDrag(["one.cbz"], 34);

    expect(invokeMock).toHaveBeenNthCalledWith(1, "copy_file_items_to_destination", {
      context: expect.objectContaining({ generation: 31 }),
      itemRelativePaths: ["one.cbz", "two.pdf"],
      destinationRelativePath: "Target",
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, "preview_native_file_drop", {
      context: expect.objectContaining({ generation: 32 }),
      absolutePaths: ["D:\\Incoming\\one.cbz"],
      destinationRelativePath: "Target",
    });
    expect(invokeMock).toHaveBeenNthCalledWith(3, "copy_native_file_drop", {
      context: expect.objectContaining({ generation: 33 }),
      absolutePaths: ["D:\\Incoming\\one.cbz"],
      destinationRelativePath: "Target",
    });
    expect(invokeMock).toHaveBeenNthCalledWith(4, "start_native_file_drag", {
      context: expect.objectContaining({ generation: 34 }),
      itemRelativePaths: ["one.cbz"],
    });
  });

  it("REQ-LEY-P3-017 sends structured external app data without command-line interpolation", async () => {
    await registerExternalApp("Viewer", ["--read-only", "two words"], "allSelected", 40);
    await previewExternalAppLaunch(7, ["one.cbz", "two.pdf"], 41);
    await launchExternalApp(7, ["one.cbz", "two.pdf"], "preview-key", 42);
    await listExternalAppHistory(43);

    expect(invokeMock).toHaveBeenNthCalledWith(1, "register_external_app", {
      context: expect.objectContaining({ generation: 40 }),
      displayName: "Viewer",
      fixedArgs: ["--read-only", "two words"],
      targetMode: "allSelected",
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, "preview_external_app_launch", {
      context: expect.objectContaining({ generation: 41 }), appId: 7,
      itemRelativePaths: ["one.cbz", "two.pdf"],
    });
    expect(invokeMock).toHaveBeenNthCalledWith(3, "launch_external_app", {
      context: expect.objectContaining({ generation: 42 }), appId: 7,
      itemRelativePaths: ["one.cbz", "two.pdf"], previewKey: "preview-key", confirmed: true,
    });
    expect(invokeMock).toHaveBeenNthCalledWith(4, "list_external_app_history", {
      context: expect.objectContaining({ generation: 43 }),
    });
  });

  it("REQ-LEY-P3-018 sends rename preferences and preview key as structured fields", async () => {
    const preferences = { selectExtension: false, sequenceStart: 7, sequenceDigits: 3,
      separator: "_" as const, preserveExtension: true };
    await saveRenamePreferences(preferences, 50);
    await previewBatchRename(["a.jpg", "b.png"], "Page", preferences, 51);
    await executeBatchRename(["a.jpg", "b.png"], "Page", preferences, "opaque", 52);
    expect(invokeMock).toHaveBeenNthCalledWith(1, "save_rename_preferences", {
      context: expect.objectContaining({ generation: 50 }), preferences,
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, "preview_batch_rename", {
      context: expect.objectContaining({ generation: 51 }), itemRelativePaths: ["a.jpg", "b.png"],
      baseName: "Page", preferences,
    });
    expect(invokeMock).toHaveBeenNthCalledWith(3, "execute_batch_rename", {
      context: expect.objectContaining({ generation: 52 }), itemRelativePaths: ["a.jpg", "b.png"],
      baseName: "Page", preferences, previewKey: "opaque", confirmed: true,
    });
  });

  it("REQ-LEY-P3-009 connects recursive generation, progress, and cancellation", async () => {
    const handler = vi.fn();
    await listenRecursiveThumbnailProgress(handler);
    await generateRecursiveThumbnails("Series", 24);
    await cancelRecursiveThumbnailGeneration(24);

    expect(listenMock).toHaveBeenCalledWith("recursive-thumbnail-progress", expect.any(Function));
    const eventCallback = listenMock.mock.calls[0][1] as (event: { payload: unknown }) => void;
    const payload = {
      generation: 24,
      phase: "generating" as const,
      relativePath: "Series",
      processed: 25,
      total: 100,
      generated: 20,
      cacheHits: 4,
      failed: 1,
    };
    eventCallback({ payload });
    expect(handler).toHaveBeenCalledWith(payload);
    expect(invokeMock).toHaveBeenNthCalledWith(
      1,
      "generate_recursive_thumbnails",
      expect.objectContaining({
        context: expect.objectContaining({ generation: 24 }),
        relativePath: "Series",
      }),
    );
    expect(invokeMock).toHaveBeenNthCalledWith(
      2,
      "cancel_recursive_thumbnail_generation",
      expect.objectContaining({ generation: 24 }),
    );
  });

  it("REQ-LEY-P3-002 sends the mask and basename batch to the Rust matcher", async () => {
    const candidates = [
      { basename: "one.cbz", kind: "archive" as const, byteSize: 10 },
      { basename: "two.jpg", kind: "page" as const, modifiedMs: 20 },
    ];
    const options = { includeFolders: false, includeFiles: true };
    await evaluateCatalogMask("*.cbz;*.pdf", candidates, options, 23);

    expect(invokeMock).toHaveBeenCalledWith(
      "evaluate_catalog_mask",
      expect.objectContaining({
        context: expect.objectContaining({ generation: 23 }),
        mask: "*.cbz;*.pdf",
        candidates,
        options,
      }),
    );
  });

  it("REQ-LEY-P3-003 uses dedicated SQLite-backed saved-mask commands", async () => {
    const options = {
      includeFolders: false,
      includeFiles: true,
      minSizeBytes: 1024,
      modifiedAfterMs: 10,
      modifiedBeforeMs: 20,
    };
    await listCatalogMasks(1);
    await saveCatalogMask("large recent", "*.cbz", options, 2);
    await deleteCatalogMask("large recent", 3);

    expect(invokeMock).toHaveBeenNthCalledWith(
      1,
      "list_catalog_masks",
      expect.objectContaining({ context: expect.objectContaining({ generation: 1 }) }),
    );
    expect(invokeMock).toHaveBeenNthCalledWith(
      2,
      "save_catalog_mask",
      expect.objectContaining({ name: "large recent", expression: "*.cbz", options }),
    );
    expect(invokeMock).toHaveBeenNthCalledWith(
      3,
      "delete_catalog_mask",
      expect.objectContaining({ name: "large recent" }),
    );
  });

  it("REQ-LEY-P3-004 sends picker-approved sources to the Rust search boundary", async () => {
    await pickSearchSource(31);
    await searchLibrary("volume", 32, {
      includeSubfolders: true,
      includeFolders: true,
      includeFiles: true,
      fixedLocation: null,
      sourceRoots: ["C:\\Library", "D:\\Comics"],
    });

    expect(invokeMock).toHaveBeenNthCalledWith(
      1,
      "pick_search_source",
      expect.objectContaining({ context: expect.objectContaining({ generation: 31 }) }),
    );
    expect(invokeMock).toHaveBeenNthCalledWith(
      2,
      "search_library",
      expect.objectContaining({
        query: "volume",
        options: expect.objectContaining({
          sourceRoots: ["C:\\Library", "D:\\Comics"],
        }),
      }),
    );
  });

  it("REQ-LEY-P3-005 connects watch lifecycle and typed Rust events", async () => {
    const handler = vi.fn();
    await listenCatalogFolderChanges(handler);
    await watchLibraryFolder("Series", 41);
    await stopLibraryFolderWatch(42);

    expect(listenMock).toHaveBeenCalledWith("catalog-folder-changed", expect.any(Function));
    const eventCallback = listenMock.mock.calls[0][1] as (event: { payload: unknown }) => void;
    const payload = {
      generation: 41,
      libraryRoot: "C:\\",
      relativePath: "Series",
      status: "changed" as const,
    };
    eventCallback({ payload });
    expect(handler).toHaveBeenCalledWith(payload);
    expect(invokeMock).toHaveBeenNthCalledWith(
      1,
      "watch_library_folder",
      expect.objectContaining({ relativePath: "Series" }),
    );
    expect(invokeMock).toHaveBeenNthCalledWith(
      2,
      "stop_library_folder_watch",
      expect.objectContaining({ context: expect.objectContaining({ generation: 42 }) }),
    );
  });

  it("REQ-LEY-P3-016 sends only typed rectangle geometry to Rust", async () => {
    await resolveViewerRectangleZoom({
      viewportWidth: 1_000,
      viewportHeight: 800,
      selectionLeft: 250,
      selectionTop: 200,
      selectionWidth: 500,
      selectionHeight: 400,
      scrollLeft: 0,
      scrollTop: 0,
      currentScale: 1,
    }, 51);

    expect(invokeMock).toHaveBeenCalledWith(
      "resolve_viewer_rectangle_zoom",
      expect.objectContaining({
        context: expect.objectContaining({ generation: 51 }),
        input: expect.objectContaining({ selectionWidth: 500, currentScale: 1 }),
      }),
    );
  });

  it("REQ-LEY-P3-019 keeps named profile persistence and confirmation in structured IPC", async () => {
    const profile = createDefaultSettingsProfile();
    const { profileVersion: _profileVersion, ...nativeProfile } = profile;
    invokeMock.mockResolvedValueOnce({ status: "ok", data: [] });
    await listNamedSettingsProfiles(60);
    await saveNamedSettingsProfile("Reading", profile, true, 61);
    invokeMock.mockResolvedValueOnce({
      status: "ok",
      requestId: "preview",
      generation: 62,
      data: {
        name: "Reading",
        changedFieldCount: 3,
        profile: nativeProfile,
        confirmationKey: "opaque",
      },
    });
    const preview = await previewNamedSettingsProfileSwitch("Reading", 62);
    await executeNamedSettingsProfileSwitch("Reading", "opaque", true, 63);
    await deleteNamedSettingsProfile("Reading", true, 64);

    expect(invokeMock).toHaveBeenNthCalledWith(1, "list_named_settings_profiles", {
      context: expect.objectContaining({ generation: 60 }),
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, "save_named_settings_profile", expect.objectContaining({
      name: "Reading",
      overwrite: true,
      profile: expect.not.objectContaining({ profileVersion: expect.anything() }),
    }));
    expect(preview.status).toBe("ok");
    if (preview.status === "ok") expect(preview.data.profile.profileVersion).toBe(profile.profileVersion);
    expect(invokeMock).toHaveBeenNthCalledWith(4, "execute_named_settings_profile_switch", expect.objectContaining({
      name: "Reading", confirmationKey: "opaque", confirmed: true,
    }));
    expect(invokeMock).toHaveBeenNthCalledWith(5, "delete_named_settings_profile", expect.objectContaining({
      name: "Reading", confirmed: true,
    }));
  });

  it("REQ-LEY-P3-020 keeps CSV schema and generation in structured Rust IPC", async () => {
    const config = {
      columns: ["namePart2", "relativePath", "size"] as const,
      includeHeader: false,
      sizeUnit: "mib" as const,
      splitDelimiter: "_",
    };
    await listCsvExportPresets(70);
    await saveCsvExportPreset("Detailed", { ...config, columns: [...config.columns] }, true, 71);
    await deleteCsvExportPreset("Detailed", 72);
    await exportCatalogCsv({
      config: { ...config, columns: [...config.columns] },
      scope: "selected",
      currentPath: "Series",
      selectedPaths: ["Series/01.cbz"],
    }, 73);

    expect(invokeMock).toHaveBeenNthCalledWith(1, "list_csv_export_presets", {
      context: expect.objectContaining({ generation: 70 }),
    });
    expect(invokeMock).toHaveBeenNthCalledWith(2, "save_csv_export_preset", expect.objectContaining({
      name: "Detailed", config, overwrite: true,
    }));
    expect(invokeMock).toHaveBeenNthCalledWith(3, "delete_csv_export_preset", expect.objectContaining({
      name: "Detailed", confirmed: true,
    }));
    expect(invokeMock).toHaveBeenNthCalledWith(4, "export_catalog_csv", expect.objectContaining({
      request: {
        config,
        scope: "selected",
        currentPath: "Series",
        selectedPaths: ["Series/01.cbz"],
      },
    }));
  });
});
