import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cancelOfflineMediaRegistration,
  deleteOfflineMedia,
  getOfflineMedia,
  getOfflineMediaThumbnail,
  listOfflineMedia,
  openOfflineMediaEntry,
  registerOfflineMedia,
  setOfflineMediaIcon,
  type OfflineMediaCatalog,
  type OfflineMediaDetail,
} from "../library/client";
import { MediaCatalogDialog } from "./MediaCatalogDialog";

vi.mock("../library/client", () => ({
  cancelOfflineMediaRegistration: vi.fn(), deleteOfflineMedia: vi.fn(),
  getOfflineMedia: vi.fn(), getOfflineMediaThumbnail: vi.fn(), listOfflineMedia: vi.fn(),
  openOfflineMediaEntry: vi.fn(), registerOfflineMedia: vi.fn(), setOfflineMediaIcon: vi.fn(),
}));

const catalog: OfflineMediaCatalog = { media: [{
  id: 7, identity: "NTFS:0000002A", name: "資料DVD", sourceSubpath: "Books",
  volumeLabel: "ARCHIVE", icon: "disc", filesystem: "NTFS", volumeSerial: 42,
  scannedAtMs: 30, entryCount: 2, thumbnailCount: 1, available: false, connectedRoot: null,
}] };
const detail: OfflineMediaDetail = { media: catalog.media[0], entries: [
  { relativePath: "Series", parentPath: "", name: "Series", kind: "folder", sizeBytes: 0, modifiedMs: 1, sortOrder: 0 },
  { relativePath: "Series/one.cbz", parentPath: "Series", name: "one.cbz", kind: "archive", sizeBytes: 10, modifiedMs: 2, sortOrder: 0 },
] };

function ok<T>(data: T) { return { status: "ok", requestId: "test", generation: 1, data } as never; }

describe("MediaCatalogDialog", () => {
  beforeEach(() => {
    vi.mocked(listOfflineMedia).mockResolvedValue(ok(catalog));
    vi.mocked(getOfflineMedia).mockResolvedValue(ok(detail));
    vi.mocked(getOfflineMediaThumbnail).mockResolvedValue(ok(null));
    vi.mocked(registerOfflineMedia).mockResolvedValue(ok(catalog));
    vi.mocked(cancelOfflineMediaRegistration).mockResolvedValue(ok(true));
    vi.mocked(setOfflineMediaIcon).mockResolvedValue(ok(catalog));
    vi.mocked(deleteOfflineMedia).mockResolvedValue(ok({ media: [] }));
    vi.mocked(openOfflineMediaEntry).mockResolvedValue(ok({ libraryRoot: "D:\\Books", itemRelativePath: "Series/one.cbz", itemKind: "archive", mode: "normal" }));
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("REQ-LEY-P5-001 lists the saved tree while offline and keeps open disabled", async () => {
    render(<MediaCatalogDialog defaultName="Current" onOpenPlan={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /資料DVD/ }));
    expect(await screen.findByRole("button", { name: /Series\/one\.cbz/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Series\/one\.cbz/ }));
    expect(screen.getByRole("button", { name: "接続媒体から開く" })).toBeDisabled();
    expect(screen.getByText(/^オフライン・2件・表紙1件$/)).toBeInTheDocument();
  });

  it("REQ-LEY-P5-001 registers only through Rust IPC and changes a built-in icon", async () => {
    render(<MediaCatalogDialog defaultName="Current" onOpenPlan={vi.fn()} onClose={vi.fn()} />);
    await screen.findByText(/資料DVD/);
    fireEvent.change(screen.getByLabelText("媒体名"), { target: { value: "保管ディスク" } });
    fireEvent.change(screen.getByLabelText("媒体icon"), { target: { value: "archive" } });
    fireEvent.click(screen.getByRole("button", { name: "現在のlibraryを登録" }));
    await waitFor(() => expect(registerOfflineMedia).toHaveBeenCalledWith("保管ディスク", "archive", expect.any(Number)));
    expect(await screen.findByText("媒体snapshotを原子的に保存しました。")).toBeInTheDocument();
  });

  it("REQ-LEY-P5-001 sends cancellation with the active scan generation", async () => {
    let resolveRegistration!: (value: never) => void;
    vi.mocked(registerOfflineMedia).mockImplementation(() => new Promise((resolve) => { resolveRegistration = resolve; }));
    render(<MediaCatalogDialog defaultName="Current" onOpenPlan={vi.fn()} onClose={vi.fn()} />);
    await screen.findByText(/資料DVD/);
    fireEvent.click(screen.getByRole("button", { name: "現在のlibraryを登録" }));
    fireEvent.click(screen.getByRole("button", { name: "登録をキャンセル" }));
    await waitFor(() => expect(cancelOfflineMediaRegistration).toHaveBeenCalledWith(expect.any(Number)));
    const registeredGeneration = vi.mocked(registerOfflineMedia).mock.calls[0][2];
    expect(cancelOfflineMediaRegistration).toHaveBeenCalledWith(registeredGeneration);
    resolveRegistration(ok(catalog));
  });
});
