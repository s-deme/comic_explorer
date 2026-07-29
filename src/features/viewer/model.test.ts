import { describe, expect, it } from "vitest";
import { viewerReducer, visibleIndices, type ViewerState } from "./model";

const initial: ViewerState = {
  index: 0,
  mode: "spread",
  direction: "rightToLeft",
  history: [],
};

describe("viewer page model", () => {
  it("keeps the leading page when mode or direction changes", () => {
    let state = viewerReducer(initial, { type: "mode", mode: "single" });
    state = viewerReducer(state, { type: "toggleDirection" });
    expect(state.index).toBe(0);
    expect(state.direction).toBe("leftToRight");
  });

  it("shows landscape and final odd pages alone", () => {
    expect(visibleIndices(initial, 5, new Set([0]))).toEqual([0]);
    expect(
      visibleIndices({ ...initial, index: 4 }, 5, new Set()),
    ).toEqual([4]);
  });

  it("uses display-unit history so previous is reversible", () => {
    let state = viewerReducer(initial, {
      type: "next",
      pageCount: 5,
      landscape: new Set(),
    });
    expect(state.index).toBe(2);
    state = viewerReducer(state, {
      type: "next",
      pageCount: 5,
      landscape: new Set([2]),
    });
    expect(state.index).toBe(3);
    state = viewerReducer(state, { type: "previous" });
    expect(state.index).toBe(2);
    state = viewerReducer(state, { type: "previous" });
    expect(state.index).toBe(0);
  });
});
