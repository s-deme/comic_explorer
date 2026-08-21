import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  executeBatchRename,
  getRenamePreferences,
  previewBatchRename,
  saveRenamePreferences,
} from "../library/client";
import { BatchRenameDialog, renameSelectionEnd } from "./BatchRenameDialog";

vi.mock("../library/client", () => ({
  executeBatchRename: vi.fn(), getRenamePreferences: vi.fn(),
  previewBatchRename: vi.fn(), saveRenamePreferences: vi.fn(),
}));

const preferences = { selectExtension: false, sequenceStart: 1, sequenceDigits: 3,
  separator: "_" as const, preserveExtension: true };

describe("BatchRenameDialog", () => {
  beforeEach(() => {
    vi.mocked(getRenamePreferences).mockResolvedValue({ status: "ok", requestId: "g" as never,
      generation: 9 as never, data: preferences });
    vi.mocked(saveRenamePreferences).mockResolvedValue({ status: "ok", requestId: "s" as never,
      generation: 9 as never, data: preferences });
    vi.mocked(previewBatchRename).mockResolvedValue({ status: "ok", requestId: "p" as never,
      generation: 9 as never, data: { unchanged: 0, previewKey: "opaque",
        items: [
          { sourceRelativePath: "one.jpg", targetRelativePath: "Page_001.jpg" },
          { sourceRelativePath: "two.png", targetRelativePath: "Page_002.png" },
        ] } });
    vi.mocked(executeBatchRename).mockResolvedValue({ status: "ok", requestId: "e" as never,
      generation: 9 as never, data: { operation: "rename", affected: 2 } });
  });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it("REQ-LEY-P3-018 selects only the basename unless extension selection is enabled", () => {
    expect(renameSelectionEnd("volume.cbz", false)).toBe(6);
    expect(renameSelectionEnd("volume.cbz", true)).toBe(10);
    expect(renameSelectionEnd("README", false)).toBe(6);
  });

  it("REQ-LEY-P3-018 saves settings, previews every item, then requires confirmation", async () => {
    const onComplete = vi.fn();
    render(<BatchRenameDialog generation={9} paths={["one.jpg", "two.png"]}
      onClose={() => undefined} onComplete={onComplete} />);
    fireEvent.click(screen.getByRole("button", { name: "変更後を確認" }));
    await screen.findByRole("alertdialog", { name: "名前変更の確認" });
    expect(saveRenamePreferences).toHaveBeenCalledWith(preferences, 9);
    expect(previewBatchRename).toHaveBeenCalledWith(["one.jpg", "two.png"], "Page", preferences, 9);
    expect(executeBatchRename).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "確認して実行" }));
    await waitFor(() => expect(executeBatchRename).toHaveBeenCalledWith(
      ["one.jpg", "two.png"], "Page", preferences, "opaque", 9,
    ));
    expect(onComplete).toHaveBeenCalledWith(["Page_001.jpg", "Page_002.png"], 2);
  });
});
