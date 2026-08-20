import { describe, expect, it } from "vitest";
import { DEFAULT_SHORTCUTS, LEGACY_SHORTCUT_COMMANDS } from "../input/shortcuts";
import packageMetadata from "../../../package.json";
import {
  APP_VERSION,
  createDefaultSettingsProfile,
  DEFAULT_MOUSE_GESTURES,
  normalizeSettingsProfile,
  remapMouseGesture,
  type SettingsProfile,
} from "./profile";

function validProfile(): SettingsProfile {
  return {
    profileVersion: 11,
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
    layoutMode: "paged",
    readingDirection: "rightToLeft",
    scaleMode: "fit",
    scale: 1,
    loupeEnabled: false,
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
    wheelScrollFactor: 1,
    smoothScroll: true,
    pageScanMode: "vertical",
    treeVisible: true,
    menuBarVisible: true,
    toolbarVisible: true,
    addressBarVisible: true,
    statusBarVisible: true,
    alwaysOnTop: false,
    navigationSelectionPolicy: "restore",
    thumbnailGenerationScope: "near",
    startupLocation: "last",
    showHiddenFiles: false,
    catalogPalette: "system",
    restoreLastViewer: false,
    shortcuts: { ...DEFAULT_SHORTCUTS },
    mouseGestures: { ...DEFAULT_MOUSE_GESTURES },
  };
}

function withField(field: string, value: unknown): Record<string, unknown> {
  const profile = validProfile() as unknown as Record<string, unknown>;
  profile[field] = value;
  return profile;
}

describe("settings profile", () => {
  it("uses package metadata as the application version source of truth", () => {
    expect(APP_VERSION).toBe(packageMetadata.version);
  });

  it("creates a complete independent default draft for the settings reset action", () => {
    const first = createDefaultSettingsProfile();
    const second = createDefaultSettingsProfile();
    expect(first).toEqual(validProfile());
    first.catalogThumbnailSizes.smallThumbnail = 200;
    first.shortcuts.nextPage = "N";
    first.mouseGestures.swipeLeft = "none";
    expect(second).toEqual(validProfile());
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

  it.each([0, 12, 99, "11", undefined])(
    "rejects an unknown or malformed profile version (%s)",
    (profileVersion) => {
      expect(normalizeSettingsProfile(withField("profileVersion", profileVersion))).toBeNull();
    },
  );

  it("migrates a v1 profile with the default thumbnail sizes", () => {
    const legacy = validProfile() as unknown as Record<string, unknown>;
    legacy.profileVersion = 1;
    delete legacy.catalogThumbnailSizes;
    delete legacy.viewerBackground;
    delete legacy.viewerPageMargin;
    delete legacy.viewerSpreadGap;
    delete legacy.cursorAutoHideMs;
    expect(normalizeSettingsProfile(legacy)).toEqual(validProfile());
  });

  it("migrates a v2 profile with the new card-grid thumbnail size", () => {
    const legacy = validProfile() as unknown as Record<string, unknown>;
    legacy.profileVersion = 2;
    legacy.catalogThumbnailSizes = {
      smallThumbnail: 104,
      coverList: 144,
      referenceTile: 128,
    };
    delete legacy.viewerBackground;
    delete legacy.viewerPageMargin;
    delete legacy.viewerSpreadGap;
    delete legacy.cursorAutoHideMs;
    expect(normalizeSettingsProfile(legacy)).toEqual(validProfile());
  });

  it("migrates a v3 profile with the default viewer appearance settings", () => {
    const legacy = validProfile() as unknown as Record<string, unknown>;
    legacy.profileVersion = 3;
    delete legacy.viewerBackground;
    delete legacy.viewerPageMargin;
    delete legacy.viewerSpreadGap;
    delete legacy.cursorAutoHideMs;
    expect(normalizeSettingsProfile(legacy)).toEqual(validProfile());
  });

  it("migrates a v4 profile with the P1-A viewer and shell defaults", () => {
    const legacy = validProfile() as unknown as Record<string, unknown>;
    legacy.profileVersion = 4;
    for (const field of [
      "zoomRetention", "viewerGridEnabled", "viewerGridSize", "viewerGridColor",
      "panFactor", "wheelDeadZone", "addressBarVisible", "statusBarVisible", "alwaysOnTop",
    ]) delete legacy[field];
    expect(normalizeSettingsProfile(legacy)).toEqual(validProfile());
  });

  it("migrates a v5 profile with the P1-B navigation defaults", () => {
    const legacy = validProfile() as unknown as Record<string, unknown>;
    legacy.profileVersion = 5;
    delete legacy.navigationSelectionPolicy;
    delete legacy.thumbnailGenerationScope;
    delete legacy.startupLocation;
    expect(normalizeSettingsProfile(legacy)).toEqual(validProfile());
  });

  it("migrates a v6 profile with the P1-C catalog and restore defaults", () => {
    const legacy = validProfile() as unknown as Record<string, unknown>;
    legacy.profileVersion = 6;
    delete legacy.showHiddenFiles;
    delete legacy.catalogPalette;
    delete legacy.restoreLastViewer;
    expect(normalizeSettingsProfile(legacy)).toEqual(validProfile());
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
    delete legacy.wheelScrollFactor;
    delete legacy.smoothScroll;
    expect(normalizeSettingsProfile(legacy)).toEqual(validProfile());
  });

  it("REQ-LEY-P2-007 accepts scroll detail settings and rejects malformed values", () => {
    expect(normalizeSettingsProfile({
      ...validProfile(),
      scrollStepPercent: 75,
      wheelScrollFactor: 1.4,
      smoothScroll: false,
    })).toEqual(expect.objectContaining({
      scrollStepPercent: 75,
      wheelScrollFactor: 1.4,
      smoothScroll: false,
    }));
    for (const [field, value] of [
      ["scrollStepPercent", 9], ["scrollStepPercent", 101],
      ["scrollStepPercent", 50.5], ["wheelScrollFactor", 0.49],
      ["wheelScrollFactor", 2.01], ["smoothScroll", "true"],
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
    ["layoutMode", "grid"],
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
    ["catalogPalette", "custom"],
  ])("rejects an invalid P1-C profile field %s=%s", (field, value) => {
    expect(normalizeSettingsProfile(withField(field, value))).toBeNull();
  });

  it.each([
    "sortDescending",
    "loupeEnabled",
    "treeVisible",
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
    delete candidate.layoutMode;
    expect(normalizeSettingsProfile(candidate)).toBeNull();
  });

  it("normalizes valid shortcuts but rejects missing, invalid, and conflicting bindings", () => {
    const alias = validProfile();
    alias.shortcuts.nextPage = "ctrl+pgdn";
    expect(normalizeSettingsProfile(alias)?.shortcuts.nextPage).toBe("Ctrl+PageDown");

    const missing = validProfile();
    delete (missing.shortcuts as Partial<typeof missing.shortcuts>).zoomOut;
    expect(normalizeSettingsProfile(missing)).toBeNull();

    const invalid = validProfile();
    invalid.shortcuts.zoomOut = "Ctrl+";
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
    legacy.shortcuts = Object.fromEntries(
      LEGACY_SHORTCUT_COMMANDS.map((command) => [
        command,
        command === "nextPage" ? "N" : DEFAULT_SHORTCUTS[command],
      ]),
    );
    legacy.mouseGestures = {
      swipeLeft: "previousPage",
      swipeRight: "nextPage",
      doubleClick: "none",
    };
    const migrated = normalizeSettingsProfile(legacy);
    expect(migrated?.shortcuts.nextPage).toBe("N");
    expect(migrated?.shortcuts.toggleSearch).toBe("Ctrl+F");
    expect(migrated?.mouseGestures.wheelDown).toBe("nextPage");
    expect(migrated?.mouseGestures.doubleClick).toBe("toggleFullscreen");

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
