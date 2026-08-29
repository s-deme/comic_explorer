import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHORTCUTS,
  LEGACY_SHORTCUT_COMMANDS,
  SHORTCUT_COMMANDS,
} from "../input/shortcuts";
import { DEFAULT_VIEWER_QUADRANT_BINDINGS } from "../input/viewer-quadrants";
import packageMetadata from "../../../package.json";
import { BUILTIN_THEMES } from "./theme";
import {
  APP_VERSION,
  createDefaultSettingsProfile,
  DEFAULT_MOUSE_GESTURES,
  normalizeSettingsProfile,
  remapMouseGesture,
  SETTINGS_PROFILE_VERSION,
  type SettingsProfile,
} from "./profile";

function validProfile(): SettingsProfile {
  return {
    profileVersion: SETTINGS_PROFILE_VERSION,
    sortField: "name",
    sortDescending: false,
    endOfVolumePolicy: "auto_next",
    catalogViewMode: "cover_list",
    catalogThumbnailSizes: { smallThumbnail: 104, coverList: 144, cardGrid: 216, referenceTile: 128 },
    viewMode: "single",
    spreadPortraitMaxAspectPercent: 100,
    autoSpreadMinViewportAspectPercent: 125,
    spreadFirstPageSingle: false,
    spreadPairing: "continuous",
    fitAllowUpscale: false,
    fitBasis: "spread",
    fitIncludePageMargin: true,
    readingDirection: "rightToLeft",
    scaleMode: "fit",
    scale: 1,
    loupeEnabled: false,
    loupeSize: 180,
    loupeZoom: 2,
    prefetchAhead: 4,
    prefetchBehind: 0,
    prefetchMemoryMiB: 256,
    fullscreenEscapeBehavior: "exitFullscreen",
    preventDisplaySleepFullscreen: false,
    trayStoreOnMinimize: false,
    trayCloseBehavior: "quit",
    trayRestoreGesture: "singleClick",
    slideshowIntervalMs: 3_000,
    slideshowOrder: "forward",
    slideshowRepeatCurrentItem: false,
    viewerCatalogSelectionSync: true,
    viewerBackground: "checker",
    viewerPageMargin: 0,
    viewerSpreadGap: 8,
    cursorAutoHideMs: 0,
    zoomRetention: "global",
    viewerGridEnabled: false,
    viewerGridSize: 32,
    viewerGridColor: "light",
    panFactor: 1,
    wheelDeadZone: 0,
    scrollStepPercent: 90,
    keyScrollAccelerationPercent: 150,
    keyScrollContinuous: true,
    smoothScroll: true,
    pageScanMode: "vertical",
    treeVisible: true,
    treeAutoCollapse: false,
    treeConfirmChildren: true,
    treeWidth: 240,
    treeHeight: 240,
    catalogPanePosition: "right",
    menuBarVisible: true,
    toolbarVisible: true,
    addressBarVisible: true,
    statusBarVisible: true,
    alwaysOnTop: false,
    themeSelection: { kind: "builtin", themeId: "light" },
    customThemeSnapshot: null,
    navigationSelectionPolicy: "restore",
    thumbnailGenerationScope: "near",
    startupLocation: "last",
    showHiddenFiles: false,
    restoreLastViewer: false,
    autoRefreshCurrentFolder: true,
    folderOpenRule: "navigate",
    imageOpenRule: "read",
    archiveOpenRule: "read",
    detailGridLines: "none",
    detailRowDensity: "standard",
    detailShowKind: true,
    detailShowSize: true,
    detailShowModified: true,
    shortcuts: { ...DEFAULT_SHORTCUTS },
    catalogMouseBindings: {
      primaryClick: "selectOnly",
      doubleClick: "openSelected",
      middleClick: "none",
      backButton: "navigateBack",
      forwardButton: "navigateForward",
    },
    viewerQuadrantBindings: { ...DEFAULT_VIEWER_QUADRANT_BINDINGS },
    viewerRightClickAction: "none",
    mouseGestures: { ...DEFAULT_MOUSE_GESTURES },
  };
}

function withField(field: string, value: unknown): Record<string, unknown> {
  const profile = validProfile() as unknown as Record<string, unknown>;
  profile[field] = value;
  return profile;
}

describe("retired settings migration", () => {
  it("discards retired layout, wheel factor, and catalog palette keys", () => {
    const profile = {
      ...validProfile(),
      layoutMode: "vertical_scroll",
      wheelScrollFactor: 1.4,
      catalogPalette: "midnight",
    };
    expect(normalizeSettingsProfile(profile)).toEqual(validProfile());
  });
});

describe("settings profile", () => {
  it("uses package metadata as the application version source of truth", () => {
    expect(APP_VERSION).toBe(packageMetadata.version);
  });

  it("creates a complete independent default draft for the settings reset action", () => {
    const first = createDefaultSettingsProfile();
    const second = createDefaultSettingsProfile();
    const expected = {
      ...validProfile(),
      themeSelection: { kind: "system" },
      customThemeSnapshot: null,
    };
    expect(first).toEqual(expected);
    first.catalogThumbnailSizes.smallThumbnail = 200;
    first.shortcuts.nextPage = ["N"];
    first.mouseGestures.swipeLeft = "none";
    expect(second).toEqual(expected);
  });

  it("imports a strict known-version profile and excludes unknown fields", () => {
    const candidate = {
      ...validProfile(),
      catalogViewMode: "card_grid",
      scale: 4,
      secretToken: "must-not-be-retained",
    };
    const profile = normalizeSettingsProfile(candidate);
    expect(profile).toEqual({
      ...validProfile(),
      catalogViewMode: "card_grid",
      scale: 4,
    });
    expect(profile).not.toHaveProperty("secretToken");
  });

  it("REQ-LEY-P2-004 accepts and preserves automatic viewer mode", () => {
    const profile = normalizeSettingsProfile({ ...validProfile(), viewMode: "auto" });
    expect(profile?.viewMode).toBe("auto");
  });

  it.each([0, 30, 99, "21", undefined])(
    "rejects an unknown or malformed profile version (%s)",
    (profileVersion) => {
      expect(normalizeSettingsProfile(withField("profileVersion", profileVersion))).toBeNull();
    },
  );

  it("REQ-FR-B24-005 validates system, built-in, and self-contained custom theme selections", () => {
    expect(normalizeSettingsProfile({
      ...validProfile(),
      themeSelection: { kind: "system" },
      customThemeSnapshot: null,
    })).toMatchObject({
      themeSelection: { kind: "system" },
      customThemeSnapshot: null,
    });
    expect(normalizeSettingsProfile({
      ...validProfile(),
      themeSelection: { kind: "builtin", themeId: "forest" },
      customThemeSnapshot: null,
    })).toMatchObject({
      themeSelection: { kind: "builtin", themeId: "forest" },
      customThemeSnapshot: null,
    });
    const customThemeSnapshot = {
      themeId: 7,
      revision: 4,
      definition: {
        schemaVersion: 1 as const,
        name: "My Midnight",
        baseScheme: "dark" as const,
        colors: { ...BUILTIN_THEMES.midnight.colors },
      },
    };
    const normalized = normalizeSettingsProfile({
      ...validProfile(),
      themeSelection: { kind: "custom", themeId: 7, revision: 4 },
      customThemeSnapshot,
    });
    expect(normalized).toMatchObject({
      themeSelection: { kind: "custom", themeId: 7, revision: 4 },
      customThemeSnapshot,
    });
    expect(normalized?.customThemeSnapshot).not.toBe(customThemeSnapshot);
    expect(normalized?.customThemeSnapshot?.definition.colors)
      .not.toBe(customThemeSnapshot.definition.colors);
  });

  it.each([
    { themeSelection: { kind: "system" }, customThemeSnapshot: undefined },
    { themeSelection: { kind: "builtin", themeId: "system" }, customThemeSnapshot: null },
    { themeSelection: { kind: "builtin", themeId: "dark" }, customThemeSnapshot: {
      themeId: 7,
      revision: 4,
      definition: BUILTIN_THEMES.dark,
    } },
    { themeSelection: { kind: "custom", themeId: 7, revision: 4 }, customThemeSnapshot: null },
    { themeSelection: { kind: "custom", themeId: 7, revision: 4 }, customThemeSnapshot: {
      themeId: 7,
      revision: 5,
      definition: BUILTIN_THEMES.dark,
    } },
    { themeSelection: { kind: "custom", themeId: 7, revision: 4 }, customThemeSnapshot: {
      themeId: 7,
      revision: 4,
      definition: {
        ...BUILTIN_THEMES.dark,
        colors: { ...BUILTIN_THEMES.dark.colors, text: "#181C22" },
      },
    } },
  ])("REQ-FR-B24-005 rejects incomplete, stale, or invalid theme profile data", (themeData) => {
    expect(normalizeSettingsProfile({ ...validProfile(), ...themeData })).toBeNull();
  });

  it.each(Array.from({ length: 27 }, (_, index) => index + 1))(
    "REQ-FR-B24-005 migrates profile v%s to the legacy-compatible light theme",
    (profileVersion) => {
      const legacy = validProfile() as unknown as Record<string, unknown>;
      legacy.profileVersion = profileVersion;
      delete legacy.themeSelection;
      delete legacy.customThemeSnapshot;
      expect(normalizeSettingsProfile(legacy)).toMatchObject({
        profileVersion: SETTINGS_PROFILE_VERSION,
        themeSelection: { kind: "builtin", themeId: "light" },
        customThemeSnapshot: null,
      });
    },
  );

  it("REQ-FR-B24-005 preserves the exact v27 pane and Viewer interaction values", () => {
    const legacy = validProfile() as unknown as Record<string, unknown>;
    legacy.profileVersion = 27;
    legacy.treeHeight = 420;
    legacy.catalogPanePosition = "bottom";
    legacy.viewerQuadrantBindings = {
      topLeft: "zoomIn",
      topRight: "nextPage",
      bottomLeft: "closeViewer",
      bottomRight: "toggleFullscreen",
    };
    legacy.viewerRightClickAction = "zoomOut";
    delete legacy.themeSelection;
    delete legacy.customThemeSnapshot;
    expect(normalizeSettingsProfile(legacy)).toMatchObject({
      profileVersion: SETTINGS_PROFILE_VERSION,
      treeHeight: 420,
      catalogPanePosition: "bottom",
      viewerQuadrantBindings: legacy.viewerQuadrantBindings,
      viewerRightClickAction: "zoomOut",
      themeSelection: { kind: "builtin", themeId: "light" },
      customThemeSnapshot: null,
    });
  });

  const legacyDefaultMigrations: Array<[
    label: string,
    profileVersion: number,
    omittedFields: string[],
  ]> = [
    ["v1 profile with the default thumbnail sizes", 1, [
      "catalogThumbnailSizes", "viewerBackground", "viewerPageMargin", "viewerSpreadGap", "cursorAutoHideMs",
    ]],
    ["v2 profile with the new card-grid thumbnail size", 2, [
      "viewerBackground", "viewerPageMargin", "viewerSpreadGap", "cursorAutoHideMs",
    ]],
    ["v3 profile with the default viewer appearance settings", 3, [
      "viewerBackground", "viewerPageMargin", "viewerSpreadGap", "cursorAutoHideMs",
    ]],
    ["v4 profile with the P1-A viewer and shell defaults", 4, [
      "zoomRetention", "viewerGridEnabled", "viewerGridSize", "viewerGridColor",
      "panFactor", "wheelDeadZone", "addressBarVisible", "statusBarVisible", "alwaysOnTop",
    ]],
    ["v5 profile with the P1-B navigation defaults", 5, [
      "navigationSelectionPolicy", "thumbnailGenerationScope", "startupLocation",
    ]],
    ["v6 profile with the P1-C catalog and restore defaults", 6, [
      "showHiddenFiles", "restoreLastViewer",
    ]],
  ];

  it.each(legacyDefaultMigrations)("migrates a %s", (_label, profileVersion, omittedFields) => {
    const legacy = validProfile() as unknown as Record<string, unknown>;
    legacy.profileVersion = profileVersion;
    if (profileVersion === 2) {
      legacy.catalogThumbnailSizes = {
        smallThumbnail: 104,
        coverList: 144,
        referenceTile: 128,
      };
    }
    for (const field of omittedFields) delete legacy[field];
    expect(normalizeSettingsProfile(legacy)).toEqual(validProfile());
  });

  it("REQ-LEY-P3-005 migrates a v17 profile with automatic refresh enabled", () => {
    const legacy = validProfile() as unknown as Record<string, unknown>;
    legacy.profileVersion = 17;
    delete legacy.autoRefreshCurrentFolder;
    expect(normalizeSettingsProfile(legacy)).toEqual(validProfile());
  });

  it("REQ-LEY-P3-006 migrates v18 tree details and validates their bounds", () => {
    const legacy = validProfile() as unknown as Record<string, unknown>;
    legacy.profileVersion = 18;
    delete legacy.treeAutoCollapse;
    delete legacy.treeConfirmChildren;
    delete legacy.treeWidth;
    expect(normalizeSettingsProfile(legacy)).toEqual(validProfile());

    expect(normalizeSettingsProfile({
      ...validProfile(),
      treeAutoCollapse: true,
      treeConfirmChildren: false,
      treeWidth: 360,
    })).toEqual(expect.objectContaining({
      treeAutoCollapse: true,
      treeConfirmChildren: false,
      treeWidth: 360,
    }));
    expect(normalizeSettingsProfile(withField("treeAutoCollapse", "true"))).toBeNull();
    expect(normalizeSettingsProfile(withField("treeConfirmChildren", 1))).toBeNull();
    for (const width of [179, 481, 240.5, Number.NaN]) {
      expect(normalizeSettingsProfile(withField("treeWidth", width))).toBeNull();
    }
  });

  it("REQ-LEY-P4-004 migrates v26 layout defaults and validates the four persisted positions", () => {
    const legacy = validProfile() as unknown as Record<string, unknown>;
    legacy.profileVersion = 26;
    delete legacy.treeHeight;
    delete legacy.catalogPanePosition;
    expect(normalizeSettingsProfile(legacy)).toEqual(validProfile());

    for (const catalogPanePosition of ["right", "left", "top", "bottom"] as const) {
      expect(normalizeSettingsProfile({
        ...validProfile(),
        catalogPanePosition,
        treeHeight: 360,
      })).toEqual(expect.objectContaining({ catalogPanePosition, treeHeight: 360 }));
    }
    expect(normalizeSettingsProfile(withField("catalogPanePosition", "floating"))).toBeNull();
    for (const height of [119, 481, 240.5, Number.NaN]) {
      expect(normalizeSettingsProfile(withField("treeHeight", height))).toBeNull();
    }
  });

  it("REQ-LEY-P3-007 migrates v19 open rules and validates current enums", () => {
    const legacy = validProfile() as unknown as Record<string, unknown>;
    legacy.profileVersion = 19;
    delete legacy.folderOpenRule;
    delete legacy.imageOpenRule;
    delete legacy.archiveOpenRule;
    expect(normalizeSettingsProfile(legacy)).toEqual(validProfile());

    expect(normalizeSettingsProfile({
      ...validProfile(),
      folderOpenRule: "read",
      imageOpenRule: "none",
      archiveOpenRule: "none",
    })).toEqual(expect.objectContaining({
      folderOpenRule: "read",
      imageOpenRule: "none",
      archiveOpenRule: "none",
    }));
    expect(normalizeSettingsProfile(withField("folderOpenRule", "open"))).toBeNull();
    expect(normalizeSettingsProfile(withField("imageOpenRule", "navigate"))).toBeNull();
    expect(normalizeSettingsProfile(withField("archiveOpenRule", false))).toBeNull();
  });

  it("REQ-LEY-P3-008 migrates v20 detail formatting and rejects malformed values", () => {
    const legacy = validProfile() as unknown as Record<string, unknown>;
    legacy.profileVersion = 20;
    for (const field of [
      "detailGridLines", "detailRowDensity", "detailShowKind",
      "detailShowSize", "detailShowModified",
    ]) delete legacy[field];
    expect(normalizeSettingsProfile(legacy)).toEqual(validProfile());

    expect(normalizeSettingsProfile({
      ...validProfile(),
      detailGridLines: "both",
      detailRowDensity: "compact",
      detailShowKind: false,
      detailShowSize: false,
      detailShowModified: false,
    })).toEqual(expect.objectContaining({
      detailGridLines: "both",
      detailRowDensity: "compact",
      detailShowKind: false,
      detailShowSize: false,
      detailShowModified: false,
    }));
    expect(normalizeSettingsProfile(withField("detailGridLines", "vertical"))).toBeNull();
    expect(normalizeSettingsProfile(withField("detailRowDensity", "tiny"))).toBeNull();
    for (const field of ["detailShowKind", "detailShowSize", "detailShowModified"]) {
      expect(normalizeSettingsProfile(withField(field, "true"))).toBeNull();
    }
  });

  it("REQ-LEY-P3-012 migrates v22 key scrolling and validates acceleration and continuity", () => {
    const legacy = validProfile() as unknown as Record<string, unknown>;
    legacy.profileVersion = 22;
    delete legacy.keyScrollAccelerationPercent;
    delete legacy.keyScrollContinuous;
    expect(normalizeSettingsProfile(legacy)).toMatchObject({
      profileVersion: SETTINGS_PROFILE_VERSION,
      scrollStepPercent: 90,
      keyScrollAccelerationPercent: 150,
      keyScrollContinuous: true,
    });

    expect(normalizeSettingsProfile({
      ...validProfile(),
      keyScrollAccelerationPercent: 99,
    })).toBeNull();
    expect(normalizeSettingsProfile({
      ...validProfile(),
      keyScrollAccelerationPercent: 301,
    })).toBeNull();
    expect(normalizeSettingsProfile({
      ...validProfile(),
      keyScrollContinuous: "yes",
    })).toBeNull();
  });

  it("REQ-LEY-P3-013 migrates v23 catalog mouse defaults and rejects unknown bindings", () => {
    const legacy = validProfile() as unknown as Record<string, unknown>;
    legacy.profileVersion = 23;
    delete legacy.catalogMouseBindings;
    expect(normalizeSettingsProfile(legacy)).toMatchObject({
      profileVersion: SETTINGS_PROFILE_VERSION,
      catalogMouseBindings: {
        primaryClick: "selectOnly",
        doubleClick: "openSelected",
        middleClick: "none",
        backButton: "navigateBack",
        forwardButton: "navigateForward",
      },
    });

    expect(normalizeSettingsProfile({
      ...validProfile(),
      catalogMouseBindings: {
        ...validProfile().catalogMouseBindings,
        sideButton: "navigateBack",
      },
    })).toBeNull();
    expect(normalizeSettingsProfile({
      ...validProfile(),
      catalogMouseBindings: {
        ...validProfile().catalogMouseBindings,
        primaryClick: "delete",
      },
    })).toBeNull();
  });

  it("REQ-LEY-P3-014 migrates v24 quadrant defaults and rejects unknown bindings", () => {
    const legacy = validProfile() as unknown as Record<string, unknown>;
    legacy.profileVersion = 24;
    delete legacy.viewerQuadrantBindings;
    expect(normalizeSettingsProfile(legacy)).toMatchObject({
      profileVersion: SETTINGS_PROFILE_VERSION,
      viewerQuadrantBindings: DEFAULT_VIEWER_QUADRANT_BINDINGS,
    });
    expect(normalizeSettingsProfile({
      ...validProfile(),
      viewerQuadrantBindings: {
        ...DEFAULT_VIEWER_QUADRANT_BINDINGS,
        topLeft: "zoomIn",
      },
    })).toMatchObject({ viewerQuadrantBindings: { topLeft: "zoomIn" } });

    expect(normalizeSettingsProfile({
      ...validProfile(),
      viewerQuadrantBindings: {
        ...DEFAULT_VIEWER_QUADRANT_BINDINGS,
        center: "nextPage",
      },
    })).toBeNull();
    expect(normalizeSettingsProfile({
      ...validProfile(),
      viewerQuadrantBindings: {
        ...DEFAULT_VIEWER_QUADRANT_BINDINGS,
        topLeft: "delete",
      },
    })).toBeNull();
  });

  it("REQ-LEY-P3-015 migrates v25 right-click default and rejects unknown actions", () => {
    const legacy = validProfile() as unknown as Record<string, unknown>;
    legacy.profileVersion = 25;
    delete legacy.viewerRightClickAction;
    expect(normalizeSettingsProfile(legacy)).toMatchObject({
      profileVersion: SETTINGS_PROFILE_VERSION,
      viewerQuadrantBindings: DEFAULT_VIEWER_QUADRANT_BINDINGS,
      viewerRightClickAction: "none",
    });
    expect(normalizeSettingsProfile({
      ...validProfile(),
      viewerRightClickAction: "zoomIn",
    })).toMatchObject({ viewerRightClickAction: "zoomIn" });
    expect(normalizeSettingsProfile({
      ...validProfile(),
      viewerRightClickAction: "delete",
    })).toBeNull();
  });

  it("REQ-LEY-P2-005 migrates a v7 profile with the fixed P2-D spread rules", () => {
    const legacy = validProfile() as unknown as Record<string, unknown>;
    legacy.profileVersion = 7;
    delete legacy.spreadPortraitMaxAspectPercent;
    delete legacy.autoSpreadMinViewportAspectPercent;
    delete legacy.spreadFirstPageSingle;
    delete legacy.spreadPairing;
    expect(normalizeSettingsProfile(legacy)).toEqual(validProfile());
  });

  it("REQ-LEY-P2-005 accepts strict configurable spread rules", () => {
    const profile = normalizeSettingsProfile({
      ...validProfile(),
      spreadPortraitMaxAspectPercent: 80,
      autoSpreadMinViewportAspectPercent: 160,
      spreadFirstPageSingle: true,
      spreadPairing: "even",
    });
    expect(profile).toEqual(expect.objectContaining({
      spreadPortraitMaxAspectPercent: 80,
      autoSpreadMinViewportAspectPercent: 160,
      spreadFirstPageSingle: true,
      spreadPairing: "even",
    }));
  });

  it("REQ-LEY-P2-006 migrates a v8 profile with safe fit defaults", () => {
    const legacy = validProfile() as unknown as Record<string, unknown>;
    legacy.profileVersion = 8;
    delete legacy.fitAllowUpscale;
    delete legacy.fitBasis;
    delete legacy.fitIncludePageMargin;
    expect(normalizeSettingsProfile(legacy)).toEqual(validProfile());
  });

  it("REQ-LEY-P2-006 accepts fit detail settings and rejects malformed values", () => {
    expect(normalizeSettingsProfile({
      ...validProfile(),
      fitAllowUpscale: true,
      fitBasis: "page",
      fitIncludePageMargin: false,
    })).toEqual(expect.objectContaining({
      fitAllowUpscale: true,
      fitBasis: "page",
      fitIncludePageMargin: false,
    }));
    expect(normalizeSettingsProfile(withField("fitAllowUpscale", "true"))).toBeNull();
    expect(normalizeSettingsProfile(withField("fitBasis", "width"))).toBeNull();
    expect(normalizeSettingsProfile(withField("fitIncludePageMargin", 1))).toBeNull();
  });

  it("REQ-LEY-P2-007 migrates a v9 profile with safe scroll defaults", () => {
    const legacy = validProfile() as unknown as Record<string, unknown>;
    legacy.profileVersion = 9;
    delete legacy.scrollStepPercent;
    delete legacy.smoothScroll;
    expect(normalizeSettingsProfile(legacy)).toEqual(validProfile());
  });

  it("REQ-LEY-P2-007 accepts scroll detail settings and rejects malformed values", () => {
    expect(normalizeSettingsProfile({
      ...validProfile(),
      scrollStepPercent: 75,
      smoothScroll: false,
    })).toEqual(expect.objectContaining({
      scrollStepPercent: 75,
      smoothScroll: false,
    }));
    for (const [field, value] of [
      ["scrollStepPercent", 9], ["scrollStepPercent", 101],
      ["scrollStepPercent", 50.5], ["smoothScroll", "true"],
    ] as const) {
      expect(normalizeSettingsProfile(withField(field, value))).toBeNull();
    }
  });

  it("REQ-LEY-P2-008 migrates v10 and validates the page scan mode", () => {
    const legacy = validProfile() as unknown as Record<string, unknown>;
    legacy.profileVersion = 10;
    delete legacy.pageScanMode;
    expect(normalizeSettingsProfile(legacy)).toEqual(validProfile());
    expect(normalizeSettingsProfile({ ...validProfile(), pageScanMode: "n" }))
      .toEqual(expect.objectContaining({ pageScanMode: "n" }));
    expect(normalizeSettingsProfile({ ...validProfile(), pageScanMode: "z" }))
      .toEqual(expect.objectContaining({ pageScanMode: "z" }));
    expect(normalizeSettingsProfile(withField("pageScanMode", "spiral"))).toBeNull();
  });

  it("REQ-LEY-P2-009 migrates v11 and validates loupe size and zoom", () => {
    const legacy = validProfile() as unknown as Record<string, unknown>;
    legacy.profileVersion = 11;
    delete legacy.loupeSize;
    delete legacy.loupeZoom;
    expect(normalizeSettingsProfile(legacy)).toEqual(validProfile());
    expect(normalizeSettingsProfile({ ...validProfile(), loupeSize: 240, loupeZoom: 3.5 }))
      .toEqual(expect.objectContaining({ loupeSize: 240, loupeZoom: 3.5 }));
    for (const [field, value] of [
      ["loupeSize", 79], ["loupeSize", 401], ["loupeSize", 180.5],
      ["loupeZoom", 1.24], ["loupeZoom", 8.01], ["loupeZoom", Number.NaN],
    ] as const) {
      expect(normalizeSettingsProfile(withField(field, value))).toBeNull();
    }
  });

  it("REQ-LEY-P2-010 migrates v12 and validates bounded prefetch settings", () => {
    const legacy = validProfile() as unknown as Record<string, unknown>;
    legacy.profileVersion = 12;
    delete legacy.prefetchAhead;
    delete legacy.prefetchBehind;
    delete legacy.prefetchMemoryMiB;
    expect(normalizeSettingsProfile(legacy)).toEqual(validProfile());
    expect(normalizeSettingsProfile({
      ...validProfile(),
      prefetchAhead: 3,
      prefetchBehind: 2,
      prefetchMemoryMiB: 192,
    })).toEqual(expect.objectContaining({
      prefetchAhead: 3,
      prefetchBehind: 2,
      prefetchMemoryMiB: 192,
    }));
    for (const [field, value] of [
      ["prefetchAhead", -1], ["prefetchAhead", 5], ["prefetchBehind", 1.5],
      ["prefetchMemoryMiB", 15], ["prefetchMemoryMiB", 513],
      ["prefetchMemoryMiB", Number.NaN],
    ] as const) {
      expect(normalizeSettingsProfile(withField(field, value))).toBeNull();
    }
  });

  it("REQ-LEY-P2-011 migrates v13 and validates fullscreen lifecycle settings", () => {
    const legacy = validProfile() as unknown as Record<string, unknown>;
    legacy.profileVersion = 13;
    delete legacy.fullscreenEscapeBehavior;
    delete legacy.preventDisplaySleepFullscreen;
    expect(normalizeSettingsProfile(legacy)).toEqual(validProfile());
    expect(normalizeSettingsProfile({
      ...validProfile(),
      fullscreenEscapeBehavior: "closeViewer",
      preventDisplaySleepFullscreen: true,
    })).toEqual(expect.objectContaining({
      fullscreenEscapeBehavior: "closeViewer",
      preventDisplaySleepFullscreen: true,
    }));
    expect(normalizeSettingsProfile(withField("fullscreenEscapeBehavior", "ignore"))).toBeNull();
    expect(normalizeSettingsProfile(withField("preventDisplaySleepFullscreen", 1))).toBeNull();
  });

  it("REQ-LEY-P2-012 migrates v14 and validates tray lifecycle settings", () => {
    const legacy = validProfile() as unknown as Record<string, unknown>;
    legacy.profileVersion = 14;
    delete legacy.trayStoreOnMinimize;
    delete legacy.trayCloseBehavior;
    delete legacy.trayRestoreGesture;
    expect(normalizeSettingsProfile(legacy)).toEqual(validProfile());
    expect(normalizeSettingsProfile({
      ...validProfile(),
      trayStoreOnMinimize: true,
      trayCloseBehavior: "store",
      trayRestoreGesture: "doubleClick",
    })).toEqual(expect.objectContaining({
      trayStoreOnMinimize: true,
      trayCloseBehavior: "store",
      trayRestoreGesture: "doubleClick",
    }));
    expect(normalizeSettingsProfile(withField("trayStoreOnMinimize", "true"))).toBeNull();
    expect(normalizeSettingsProfile(withField("trayCloseBehavior", "ask"))).toBeNull();
    expect(normalizeSettingsProfile(withField("trayRestoreGesture", "middleClick"))).toBeNull();
  });

  it("REQ-LEY-P2-013 migrates v15 and validates slideshow detail settings", () => {
    const legacy = validProfile() as unknown as Record<string, unknown>;
    legacy.profileVersion = 15;
    delete legacy.slideshowIntervalMs;
    delete legacy.slideshowOrder;
    delete legacy.slideshowRepeatCurrentItem;
    expect(normalizeSettingsProfile(legacy)).toEqual(validProfile());
    expect(normalizeSettingsProfile({
      ...validProfile(),
      slideshowIntervalMs: 7_500,
      slideshowOrder: "random",
      slideshowRepeatCurrentItem: true,
    })).toEqual(expect.objectContaining({
      slideshowIntervalMs: 7_500,
      slideshowOrder: "random",
      slideshowRepeatCurrentItem: true,
    }));
    expect(normalizeSettingsProfile(withField("slideshowIntervalMs", 499))).toBeNull();
    expect(normalizeSettingsProfile(withField("slideshowIntervalMs", 60_001))).toBeNull();
    expect(normalizeSettingsProfile(withField("slideshowOrder", "shuffleForever"))).toBeNull();
    expect(normalizeSettingsProfile(withField("slideshowRepeatCurrentItem", "true"))).toBeNull();
  });

  it("REQ-LEY-P2-015 migrates v16 and validates Viewer catalog selection sync", () => {
    const legacy = validProfile() as unknown as Record<string, unknown>;
    legacy.profileVersion = 16;
    delete legacy.viewerCatalogSelectionSync;
    expect(normalizeSettingsProfile(legacy)).toEqual(validProfile());
    expect(normalizeSettingsProfile({
      ...validProfile(),
      viewerCatalogSelectionSync: false,
    })).toEqual(expect.objectContaining({ viewerCatalogSelectionSync: false }));
    expect(normalizeSettingsProfile(withField("viewerCatalogSelectionSync", "true"))).toBeNull();
  });

  it.each([
    ["spreadPortraitMaxAspectPercent", 49],
    ["spreadPortraitMaxAspectPercent", 101],
    ["spreadPortraitMaxAspectPercent", 80.5],
    ["autoSpreadMinViewportAspectPercent", 99],
    ["autoSpreadMinViewportAspectPercent", 301],
    ["spreadFirstPageSingle", "true"],
    ["spreadPairing", "alternating"],
  ])("REQ-LEY-P2-005 rejects invalid %s", (field, value) => {
    expect(normalizeSettingsProfile(withField(field, value))).toBeNull();
  });

  it.each([
    { smallThumbnail: 63, coverList: 144, cardGrid: 216, referenceTile: 128 },
    { smallThumbnail: 104, coverList: 321, cardGrid: 216, referenceTile: 128 },
    { smallThumbnail: 104, coverList: 144, cardGrid: 321, referenceTile: 128 },
    { smallThumbnail: 104, coverList: 144, cardGrid: 216, referenceTile: 100.5 },
    { smallThumbnail: "104", coverList: 144, cardGrid: 216, referenceTile: 128 },
    undefined,
  ])("rejects invalid v4 catalog thumbnail sizes (%s)", (catalogThumbnailSizes) => {
    expect(normalizeSettingsProfile(withField("catalogThumbnailSizes", catalogThumbnailSizes)))
      .toBeNull();
  });

  it.each([
    ["sortField", "created"],
    ["endOfVolumePolicy", "next"],
    ["catalogViewMode", "tiles"],
    ["viewMode", "continuous"],
    ["readingDirection", "topToBottom"],
    ["scaleMode", "automatic"],
    ["viewerBackground", "transparent"],
  ])("rejects an invalid %s enum", (field, value) => {
    expect(normalizeSettingsProfile(withField(field, value))).toBeNull();
  });

  it.each([
    ["zoomRetention", "forever"],
    ["viewerGridColor", "red"],
    ["viewerGridSize", 7],
    ["viewerGridSize", 257],
    ["panFactor", 0.49],
    ["panFactor", 2.01],
    ["wheelDeadZone", -1],
    ["wheelDeadZone", 201],
  ])("rejects an invalid P1-A profile field %s=%s", (field, value) => {
    expect(normalizeSettingsProfile(withField(field, value))).toBeNull();
  });

  it.each([
    ["navigationSelectionPolicy", "middle"],
    ["thumbnailGenerationScope", "unlimited"],
    ["startupLocation", "desktop"],
  ])("rejects an invalid P1-B profile field %s=%s", (field, value) => {
    expect(normalizeSettingsProfile(withField(field, value))).toBeNull();
  });

  it.each([
    "sortDescending",
    "loupeEnabled",
    "treeVisible",
    "treeAutoCollapse",
    "treeConfirmChildren",
    "menuBarVisible",
    "toolbarVisible",
    "viewerGridEnabled",
    "addressBarVisible",
    "statusBarVisible",
    "alwaysOnTop",
    "showHiddenFiles",
    "restoreLastViewer",
  ])("requires %s to be a boolean", (field) => {
    expect(normalizeSettingsProfile(withField(field, "false"))).toBeNull();
    expect(normalizeSettingsProfile(withField(field, undefined))).toBeNull();
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0, 8.01, "1"])(
    "rejects a non-finite, non-numeric, or out-of-range scale (%s)",
    (scale) => {
      expect(normalizeSettingsProfile(withField("scale", scale))).toBeNull();
    },
  );

  it.each([
    ["viewerPageMargin", -1],
    ["viewerPageMargin", 65],
    ["viewerPageMargin", 1.5],
    ["viewerSpreadGap", -1],
    ["viewerSpreadGap", 65],
    ["cursorAutoHideMs", 4_000],
    ["cursorAutoHideMs", "2000"],
  ])("rejects an invalid viewer appearance field %s=%s", (field, value) => {
    expect(normalizeSettingsProfile(withField(field, value))).toBeNull();
  });

  it("requires every profile field instead of silently defaulting it", () => {
    const candidate = validProfile() as unknown as Record<string, unknown>;
    delete candidate.readingDirection;
    expect(normalizeSettingsProfile(candidate)).toBeNull();
  });

  it("normalizes valid shortcuts but rejects missing, invalid, and conflicting bindings", () => {
    const alias = validProfile();
    alias.shortcuts.nextPage = ["ctrl+pgdn", "N"];
    expect(normalizeSettingsProfile(alias)?.shortcuts.nextPage).toEqual(["Ctrl+PageDown", "N"]);

    const missing = validProfile();
    delete (missing.shortcuts as Partial<typeof missing.shortcuts>).zoomOut;
    expect(normalizeSettingsProfile(missing)).toBeNull();

    const invalid = validProfile();
    invalid.shortcuts.zoomOut = ["Ctrl+"];
    expect(normalizeSettingsProfile(invalid)).toBeNull();

    const conflict = validProfile();
    conflict.shortcuts.nextPage = conflict.shortcuts.previousPage;
    expect(normalizeSettingsProfile(conflict)).toBeNull();
  });

  it("rejects missing and invalid gesture fields while fixing legacy double click", () => {
    const missing = validProfile();
    delete (missing.mouseGestures as Partial<typeof missing.mouseGestures>).doubleClick;
    expect(normalizeSettingsProfile(missing)).toBeNull();

    const invalid = validProfile();
    (invalid.mouseGestures as Record<string, string>).doubleClick = "openMenu";
    expect(normalizeSettingsProfile(invalid)).toBeNull();

    const fixed = validProfile();
    fixed.mouseGestures.doubleClick = "nextPage";
    fixed.mouseGestures.middleClick = "nextPage";
    expect(normalizeSettingsProfile(fixed)?.mouseGestures).toEqual({
      ...DEFAULT_MOUSE_GESTURES,
      middleClick: "nextPage",
    });
  });

  it("migrates the exact legacy shortcut and swipe maps without accepting arbitrary partial maps", () => {
    const legacy = validProfile() as unknown as Record<string, unknown>;
    legacy.profileVersion = 21;
    legacy.shortcuts = Object.fromEntries(
      LEGACY_SHORTCUT_COMMANDS.map((command) => [
        command,
        command === "nextPage" ? "N" : DEFAULT_SHORTCUTS[command][0],
      ]),
    );
    legacy.mouseGestures = {
      swipeLeft: "previousPage",
      swipeRight: "nextPage",
      doubleClick: "none",
    };
    const migrated = normalizeSettingsProfile(legacy);
    expect(migrated?.shortcuts.nextPage).toEqual(["N"]);
    expect(migrated?.shortcuts.toggleSearch).toEqual(["Ctrl+F"]);
    expect(migrated?.mouseGestures.wheelDown).toBe("nextPage");
    expect(migrated?.mouseGestures.doubleClick).toBe("toggleFullscreen");

    const v22WithSingles = validProfile() as unknown as Record<string, unknown>;
    v22WithSingles.shortcuts = Object.fromEntries(
      SHORTCUT_COMMANDS.map((command) => [command, DEFAULT_SHORTCUTS[command][0]]),
    );
    expect(normalizeSettingsProfile(v22WithSingles)).toBeNull();

    const partial = validProfile();
    delete (partial.mouseGestures as Partial<typeof partial.mouseGestures>).middleClick;
    expect(normalizeSettingsProfile(partial)).toBeNull();
  });

  it("rejects attempts to remap the fixed double click gesture", () => {
    expect(remapMouseGesture(DEFAULT_MOUSE_GESTURES, "doubleClick", "nextPage")).toEqual({
      ok: false,
      reason: "fixed",
    });
  });

  it("accepts a safe gesture update", () => {
    expect(remapMouseGesture(DEFAULT_MOUSE_GESTURES, "swipeLeft", "closeViewer")).toEqual({
      ok: true,
      bindings: { ...DEFAULT_MOUSE_GESTURES, swipeLeft: "closeViewer" },
    });
  });
});
