import { describe, expect, it } from "vitest";
import { defaultStrokeGestures, parseStrokeGestures, traceStroke } from "./stroke-gestures";
import { createDefaultSettingsProfile, normalizeSettingsProfile } from "../settings/profile";

describe("stroke gestures", () => {
  it("recognizes corners, ignores jitter and repeated directions, and rejects overflow", () => {
    let t = { x: 100, y: 100, pattern: "", overflow: false };
    expect(traceStroke(t, 102, 103, 24)).toBe(t);
    t = traceStroke(t, 100, 150, 24);
    t = traceStroke(t, 100, 200, 24);
    t = traceStroke(t, 150, 200, 24);
    expect(t.pattern).toBe("DR");
    for (let i = 0; i < 10; i++) t = traceStroke(t, t.x + (i % 2 ? -50 : 50), t.y, 24);
    expect(t.overflow).toBe(true);
  });
  it("migrates old profiles, round-trips custom bindings, and rejects invalid imports", () => {
    const profile = createDefaultSettingsProfile();
    const { strokeGestures: _, ...legacy } = profile;
    expect(normalizeSettingsProfile(legacy)?.strokeGestures).toEqual(defaultStrokeGestures());
    profile.strokeGestures.bindings = [{ pattern: "UDLR", action: "nextItem", enabled: false }];
    profile.strokeGestures.enabled = false;
    expect(normalizeSettingsProfile(JSON.parse(JSON.stringify(profile)))?.strokeGestures).toEqual(profile.strokeGestures);
    profile.strokeGestures.bindings.push({ ...profile.strokeGestures.bindings[0] });
    expect(normalizeSettingsProfile(profile)).toBeNull();
    expect(parseStrokeGestures({ ...defaultStrokeGestures(), threshold: 0 })).toBeNull();
    expect(parseStrokeGestures({ ...defaultStrokeGestures(), bindings: [{ pattern: "L", action: "deleteFile", enabled: true }] })).toBeNull();
  });
});
