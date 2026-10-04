import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "../../types/domain";
import { ThumbnailQueue } from "./thumbnail-queue";

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

describe("ThumbnailQueue", () => {
  it("keeps 10000 automatic entries lazy, caps pending work at 64 and prioritizes scrolling", async () => {
    const calls: string[] = [];
    const releases: (() => void)[] = [];
    const queue = new ThumbnailQueue((path) => {
      calls.push(path);
      return new Promise<void>((resolve) => releases.push(resolve));
    });
    queue.reset(1);
    queue.configure(Array.from({ length: 10000 }, (_, index) => ({
      relativePath: `book-${index}.cbz`, kind: "archive",
    })) as CatalogEntry[], "all", () => false);
    await flush();
    expect(calls).toEqual(["book-0.cbz", "book-1.cbz"]);
    for (let index = 0; index < 100; index++) queue.add(`scrolled-${index}`, "visible");
    releases.shift()!();
    await flush();
    expect(calls.at(-1)).toBe("scrolled-36");
    queue.add("scrolled-99", "visible");
    for (let index = 0; index < 64; index++) { releases.shift()!(); await flush(); }
    expect(calls.filter((path) => path.startsWith("scrolled-"))).toHaveLength(64);
    expect(calls.at(-1)).toBe("book-2.cbz");
    queue.reset(2);
    releases.forEach((release) => release());
    await flush();
  });

  it("old completions cannot delete or complete new-generation requests, including rejected work", async () => {
    const calls: number[] = [];
    const releases: (() => void)[] = [];
    const queue = new ThumbnailQueue((_, generation) => {
      calls.push(generation);
      return new Promise<void>((resolve, reject) => releases.push(generation === 1 ? () => reject(new Error("cancelled")) : resolve));
    });
    queue.reset(1);
    queue.add("same-path", "background");
    await flush();
    queue.reset(2);
    queue.add("same-path", "visible");
    queue.add("same-path", "visible");
    await flush();
    expect(calls).toEqual([1, 2]);
    releases.shift()!();
    await flush();
    queue.add("same-path", "visible");
    expect(calls).toEqual([1, 2]);
    releases.shift()!();
    await flush();
    queue.add("same-path", "visible");
    await flush();
    expect(calls).toEqual([1, 2]);
  });
});
