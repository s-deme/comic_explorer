// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  navigationReducer,
  normalizeWindowsDisplayPath,
  parseWindowsDriveAddress,
  parentPath,
  relativeAddressWithinRoot,
} from "./navigation";

describe("navigation state", () => {
  it("keeps back and forward history coherent", () => {
    let state = { current: "", back: [] as string[], forward: [] as string[] };
    state = navigationReducer(state, { type: "navigate", path: "Author" });
    state = navigationReducer(state, { type: "navigate", path: "Author/Series" });
    state = navigationReducer(state, { type: "back" });
    expect(state).toEqual({
      current: "Author",
      back: [""],
      forward: ["Author/Series"],
    });
    state = navigationReducer(state, { type: "forward" });
    expect(state.current).toBe("Author/Series");
  });

  it("never resolves a parent above the relative root", () => {
    expect(parentPath("Author/Series")).toBe("Author");
    expect(parentPath("Author")).toBe("");
    expect(parentPath("")).toBeNull();
  });

  it("accepts a quoted Windows Explorer path inside the library root", () => {
    expect(relativeAddressWithinRoot(
      '"E:\\F\\comic\\dl_comp\\[内藤騎之介×剣康之] 異世界のんびり農家 1-13"',
      "E:\\F\\comic\\dl_comp",
    )).toBe("[内藤騎之介×剣康之] 異世界のんびり農家 1-13");
    expect(relativeAddressWithinRoot(' "C:/Comics/Series" ', "c:\\comics\\"))
      .toBe("Series");
  });

  it("requires a path-segment boundary and refuses traversal outside the root", () => {
    expect(relativeAddressWithinRoot("C:\\Comics2\\Series", "C:\\Comics")).toBeNull();
    expect(relativeAddressWithinRoot("C:\\Comics\\..\\Outside", "C:\\Comics"))
      .toBeNull();
  });

  it("keeps Windows extended-length syntax internal", () => {
    expect(normalizeWindowsDisplayPath(String.raw`\\?\E:\bit\dl_comp`))
      .toBe(String.raw`E:\bit\dl_comp`);
    expect(normalizeWindowsDisplayPath(String.raw`\\?\UNC\server\share\comic`))
      .toBe(String.raw`\\server\share\comic`);
  });

  it("parses an Explorer-style absolute address into a drive and relative path", () => {
    expect(parseWindowsDriveAddress(' "e:/F/comic/dl_comp" ')).toEqual({
      driveRoot: "E:\\",
      relativePath: "F/comic/dl_comp",
    });
    expect(parseWindowsDriveAddress("E:\\comic\\..\\outside")).toBeNull();
    expect(parseWindowsDriveAddress("comic\\folder")).toBeNull();
  });

  it("jumps to an arbitrary back entry while preserving traversed entries as forward history", () => {
    const state = navigationReducer(
      { current: "C", back: ["", "A", "B"], forward: ["D"] },
      { type: "jumpBack", index: 1 },
    );

    expect(state).toEqual({
      current: "A",
      back: [""],
      forward: ["B", "C", "D"],
    });
  });

  it("jumps to an arbitrary forward entry while preserving traversed entries as back history", () => {
    const state = navigationReducer(
      { current: "A", back: [""], forward: ["B", "C", "D"] },
      { type: "jumpForward", index: 1 },
    );

    expect(state).toEqual({
      current: "C",
      back: ["", "A", "B"],
      forward: ["D"],
    });
  });

  it("uses stack indices for duplicate paths and ignores invalid jump indices", () => {
    const duplicate = { current: "C", back: ["A", "B", "A"], forward: [] as string[] };
    expect(navigationReducer(duplicate, { type: "jumpBack", index: 0 })).toEqual({
      current: "A",
      back: [],
      forward: ["B", "A", "C"],
    });
    expect(navigationReducer(duplicate, { type: "jumpBack", index: 99 })).toBe(duplicate);
    expect(navigationReducer(duplicate, { type: "jumpBack", index: 1.5 })).toBe(duplicate);
  });
});
