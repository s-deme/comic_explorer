import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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
} from "./client";

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
});
