import type { CatalogEntry } from "../../types/domain";
import { isReadableVolumeEntry, nextComicEntry } from "./sort";

export const END_OF_VOLUME_POLICIES = [
  "auto_next",
  "confirm_next",
  "return_library",
  "stop",
  "loop",
] as const;

export type EndOfVolumePolicy = (typeof END_OF_VOLUME_POLICIES)[number];

export const DEFAULT_END_OF_VOLUME_POLICY: EndOfVolumePolicy = "auto_next";

export const END_OF_VOLUME_POLICY_LABELS: Record<EndOfVolumePolicy, string> = {
  auto_next: "自動的に次の巻を開く",
  confirm_next: "確認してから次の巻を開く",
  return_library: "巻末でライブラリへ戻る",
  stop: "巻末で停止",
  loop: "先頭へループ",
};

export function normalizeEndOfVolumePolicy(
  value: string | null | undefined,
): EndOfVolumePolicy {
  return END_OF_VOLUME_POLICIES.includes(value as EndOfVolumePolicy)
    ? (value as EndOfVolumePolicy)
    : DEFAULT_END_OF_VOLUME_POLICY;
}

export type EndOfVolumeDecision =
  | { kind: "open"; entry: CatalogEntry; reason: "next" | "loop" }
  | { kind: "confirm"; entry: CatalogEntry }
  | { kind: "return_library" }
  | { kind: "stop"; reason: "policy" | "no_next" | "current_not_found" };

/** Resolve one end-of-volume action from the already sorted catalog snapshot. */
export function resolveEndOfVolume(
  sortedEntries: readonly CatalogEntry[],
  currentRelativePath: string,
  policy: EndOfVolumePolicy,
): EndOfVolumeDecision {
  const current = sortedEntries.some(
    (entry) => entry.relativePath === currentRelativePath,
  );
  if (!current) return { kind: "stop", reason: "current_not_found" };

  const next = nextComicEntry(sortedEntries, currentRelativePath);
  if (next) {
    if (policy === "confirm_next") return { kind: "confirm", entry: next };
    if (policy === "return_library") return { kind: "return_library" };
    if (policy === "stop") return { kind: "stop", reason: "policy" };
    return { kind: "open", entry: next, reason: "next" };
  }

  if (policy === "loop") {
    const first = sortedEntries.find(isReadableVolumeEntry);
    if (first) return { kind: "open", entry: first, reason: "loop" };
  }

  // A missing next item is a safe stop for every policy except loop.
  return { kind: "stop", reason: "no_next" };
}
