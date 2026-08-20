export const SLIDESHOW_ORDERS = ["forward", "reverse", "random"] as const;
export type SlideshowOrder = (typeof SLIDESHOW_ORDERS)[number];

export const DEFAULT_SLIDESHOW_INTERVAL_MS = 3_000;
export const MIN_SLIDESHOW_INTERVAL_MS = 500;
export const MAX_SLIDESHOW_INTERVAL_MS = 60_000;
export const DEFAULT_SLIDESHOW_ORDER: SlideshowOrder = "forward";

export function isSlideshowIntervalMs(value: unknown): value is number {
  return Number.isInteger(value)
    && Number(value) >= MIN_SLIDESHOW_INTERVAL_MS
    && Number(value) <= MAX_SLIDESHOW_INTERVAL_MS;
}

export function isSlideshowOrder(value: unknown): value is SlideshowOrder {
  return typeof value === "string"
    && SLIDESHOW_ORDERS.includes(value as SlideshowOrder);
}

export function createRandomSlideshowQueue(
  pageCount: number,
  currentIndex: number,
  random: () => number = Math.random,
): number[] {
  const queue = Array.from(
    { length: Math.max(0, pageCount) },
    (_, index) => index,
  ).filter((index) => index !== currentIndex);
  for (let index = queue.length - 1; index > 0; index -= 1) {
    const sample = random();
    const bounded = Number.isFinite(sample) ? Math.min(Math.max(sample, 0), 0.999999999) : 0;
    const swapIndex = Math.floor(bounded * (index + 1));
    [queue[index], queue[swapIndex]] = [queue[swapIndex], queue[index]];
  }
  return queue;
}
