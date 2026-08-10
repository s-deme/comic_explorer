import { expect, it } from "vitest";
import { archiveKindFromPath, itemKindLabel } from "./kind-label";

it("labels every supported archive with its actual format", () => {
  expect([
    ["archive.zip", "ZIP"],
    ["archive.cbz", "CBZ"],
    ["archive.epub", "EPUB"],
    ["archive.rar", "RAR"],
    ["archive.cbr", "CBR"],
    ["archive.7z", "7Z"],
    ["archive.cb7", "CB7"],
    ["archive.lzh", "LZH"],
  ].map(([path]) => itemKindLabel("archive", path, archiveKindFromPath(path)))).toEqual([
    "ZIP", "CBZ", "EPUB", "RAR", "CBR", "7Z", "CB7", "LZH",
  ]);
  expect(itemKindLabel("unsupported", "future.RAR")).toBe(".RAR");
});
