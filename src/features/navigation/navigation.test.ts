// @vitest-environment node
import { describe, expect, it } from "vitest";
import { navigationReducer, parentPath } from "./navigation";

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
