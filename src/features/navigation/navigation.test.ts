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
});
