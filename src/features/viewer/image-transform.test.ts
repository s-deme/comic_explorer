import { describe, expect, it } from "vitest";
import {
  applyViewerImageTransform,
  IDENTITY_IMAGE_TRANSFORM,
  imageTransformCss,
  isIdentityImageTransform,
  transformedImageSize,
} from "./image-transform";

describe("Viewer image transforms", () => {
  it("REQ-LEY-P2-016 composes quarter turns and resets without mutating the input", () => {
    const first = applyViewerImageTransform(IDENTITY_IMAGE_TRANSFORM, "rotateClockwise");
    const second = applyViewerImageTransform(first, "rotateClockwise");
    const fourth = applyViewerImageTransform(
      applyViewerImageTransform(second, "rotateClockwise"),
      "rotateClockwise",
    );
    expect(first.quarterTurns).toBe(1);
    expect(second.quarterTurns).toBe(2);
    expect(isIdentityImageTransform(fourth)).toBe(true);
    expect(applyViewerImageTransform(first, "reset")).toEqual(IDENTITY_IMAGE_TRANSFORM);
    expect(IDENTITY_IMAGE_TRANSFORM.quarterTurns).toBe(0);
  });

  it("REQ-LEY-P2-016 toggles screen-axis flips and produces a bounded CSS transform", () => {
    const horizontal = applyViewerImageTransform(IDENTITY_IMAGE_TRANSFORM, "flipHorizontal");
    const both = applyViewerImageTransform(horizontal, "flipVertical");
    expect(imageTransformCss(both)).toBe("scaleX(-1) scaleY(-1) rotate(0deg)");
    expect(applyViewerImageTransform(horizontal, "flipHorizontal"))
      .toEqual(IDENTITY_IMAGE_TRANSFORM);
  });

  it("REQ-LEY-P2-016 swaps dimensions only for 90 and 270 degree turns", () => {
    const source = { width: 800, height: 1_200 };
    const turns = [0, 1, 2, 3].map((quarterTurns) => transformedImageSize(
      source,
      { ...IDENTITY_IMAGE_TRANSFORM, quarterTurns: quarterTurns as 0 | 1 | 2 | 3 },
    ));
    expect(turns).toEqual([
      { width: 800, height: 1_200 },
      { width: 1_200, height: 800 },
      { width: 800, height: 1_200 },
      { width: 1_200, height: 800 },
    ]);
  });
});
