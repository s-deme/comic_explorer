import type { CatalogEntry } from "../../types/domain";
import type { ThumbnailGenerationScope } from "../settings/profile";

export type ThumbnailPriority = "visible" | "near" | "background";
const rank = { visible: 2, near: 1, background: 0 };

/** Bound native calls as well as pending UI work; automatic work stays a lazy cursor. */
export class ThumbnailQueue {
  private generation = 0;
  private active = new Set<string>();
  private pending = new Map<string, ThumbnailPriority>();
  private completed = new Set<string>();
  private automatic: readonly CatalogEntry[] = [];
  private index = 0;
  private limit = 0;
  private skip: (path: string) => boolean = () => false;

  constructor(private run: (path: string, generation: number, priority: ThumbnailPriority) => Promise<unknown>) {}

  reset(generation: number) {
    this.generation = generation;
    this.pending.clear();
    this.completed.clear();
    this.automatic = [];
    this.index = 0;
    this.limit = 0;
    this.skip = () => false;
  }

  configure(entries: readonly CatalogEntry[], scope: ThumbnailGenerationScope, skip: (path: string) => boolean) {
    this.automatic = entries;
    this.index = 0;
    this.limit = scope === "visible" ? 25 : scope === "near" ? 40 : entries.length;
    this.skip = skip;
    this.pump();
  }

  add(path: string, priority: ThumbnailPriority) {
    if (this.completed.has(path) || this.active.has(`${this.generation}\0${path}`) || this.skip(path)) return;
    const previous = this.pending.get(path);
    if (previous !== undefined && rank[previous] >= rank[priority]) return;
    if (previous === undefined && this.pending.size === 64) {
      const oldest = [...this.pending].reduce((left, right) => rank[left[1]] <= rank[right[1]] ? left : right);
      if (rank[oldest[1]] > rank[priority]) return;
      this.pending.delete(oldest[0]);
    }
    this.pending.set(path, priority);
    this.pump();
  }

  private next(): [string, ThumbnailPriority] | undefined {
    if (this.pending.size > 0) {
      const next = [...this.pending].reduce((left, right) => rank[left[1]] >= rank[right[1]] ? left : right);
      this.pending.delete(next[0]);
      return next;
    }
    while (this.index < Math.min(this.limit, this.automatic.length)) {
      const index = this.index++;
      const entry = this.automatic[index];
      if (entry.kind !== "archive" || this.completed.has(entry.relativePath)
        || this.active.has(`${this.generation}\0${entry.relativePath}`) || this.skip(entry.relativePath)) continue;
      return [entry.relativePath, index < 25 ? "visible" : index < 40 ? "near" : "background"];
    }
    return undefined;
  }

  private pump() {
    while (this.active.size < 2) {
      const next = this.next();
      if (!next) return;
      const [path, priority] = next;
      const generation = this.generation;
      const key = `${generation}\0${path}`;
      this.active.add(key);
      void Promise.resolve().then(() => this.run(path, generation, priority)).catch(() => undefined).finally(() => {
        this.active.delete(key);
        if (generation === this.generation) this.completed.add(path);
        this.pump();
      });
    }
  }
}
