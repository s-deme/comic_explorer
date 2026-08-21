import { nativeDropTargetAt } from "./native-file-drop";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/webview", () => ({ getCurrentWebview: vi.fn() }));

describe("native file-drop target resolver", () => {
  it("REQ-LEY-P3-010 converts physical coordinates and selects the closest explicit target", () => {
    const target = document.createElement("button");
    target.dataset.nativeDropPath = "Series/Volume";
    const child = document.createElement("span");
    target.append(child);
    const elementFromPoint = vi.fn(() => child);

    expect(nativeDropTargetAt(
      { x: 300, y: 180 },
      { elementFromPoint } as Pick<Document, "elementFromPoint">,
      1.5,
    )).toEqual({ relativePath: "Series/Volume" });
    expect(elementFromPoint).toHaveBeenCalledWith(200, 120);
  });

  it("REQ-LEY-P3-010 accepts the library root target and rejects implicit areas", () => {
    const root = document.createElement("div");
    root.dataset.nativeDropPath = "";
    expect(nativeDropTargetAt(
      { x: 1, y: 2 },
      { elementFromPoint: () => root } as Pick<Document, "elementFromPoint">,
      1,
    )).toEqual({ relativePath: "" });
    expect(nativeDropTargetAt(
      { x: 1, y: 2 },
      { elementFromPoint: () => document.createElement("div") } as Pick<Document, "elementFromPoint">,
      1,
    )).toBeNull();
    expect(nativeDropTargetAt(
      { x: 1, y: 2 },
      { elementFromPoint: () => root } as Pick<Document, "elementFromPoint">,
      0,
    )).toBeNull();
  });
});
