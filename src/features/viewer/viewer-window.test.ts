import { describe, expect, it } from "vitest";
import {
  parseViewerWindowHash,
  viewerWindowHash,
  type ViewerWindowLaunch,
} from "./viewer-window";

describe("Viewer window launch route", () => {
  const launch: ViewerWindowLaunch = {
    itemRelativePath: "series/volume 01.cbz",
    launchMode: "fullscreen",
    startAt: "first",
    requestedPageKey: "cover 01.png",
  };

  it("round-trips a relative item and page key through the viewer-only route", () => {
    expect(parseViewerWindowHash(viewerWindowHash(launch))).toEqual(launch);
  });

  it("rejects a normal application route and incomplete viewer route", () => {
    expect(parseViewerWindowHash("#catalog")).toBeNull();
    expect(parseViewerWindowHash("#viewer?path=series%2Fvolume.cbz")).toBeNull();
  });
});
