import { describe, expect, it } from "vitest";
import {
  createRandomSlideshowQueue,
  isSlideshowIntervalMs,
  isSlideshowOrder,
} from "./slideshow";

describe("REQ-LEY-P2-013 slideshow settings", () => {
  it("accepts only bounded whole-millisecond intervals and known orders", () => {
    expect(isSlideshowIntervalMs(500)).toBe(true);
    expect(isSlideshowIntervalMs(60_000)).toBe(true);
    expect(isSlideshowIntervalMs(499)).toBe(false);
    expect(isSlideshowIntervalMs(60_001)).toBe(false);
    expect(isSlideshowIntervalMs(500.5)).toBe(false);
    expect(isSlideshowOrder("forward")).toBe(true);
    expect(isSlideshowOrder("reverse")).toBe(true);
    expect(isSlideshowOrder("random")).toBe(true);
    expect(isSlideshowOrder("shuffleForever")).toBe(false);
  });

  it("creates one bounded random cycle without the current page or duplicates", () => {
    const samples = [0.9, 0.1, 0.6, 0.2];
    let sampleIndex = 0;
    const queue = createRandomSlideshowQueue(6, 2, () => samples[sampleIndex++]);

    expect(queue).toHaveLength(5);
    expect(queue).not.toContain(2);
    expect(new Set(queue).size).toBe(queue.length);
    expect([...queue].sort((left, right) => left - right)).toEqual([0, 1, 3, 4, 5]);
    expect(createRandomSlideshowQueue(1, 0, () => 0.5)).toEqual([]);
  });
});
