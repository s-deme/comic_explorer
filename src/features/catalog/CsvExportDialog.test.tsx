import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  deleteCsvExportPreset,
  exportCatalogCsv,
  listCsvExportPresets,
  saveCsvExportPreset,
  type CsvExportPreset,
} from "../library/client";
import { CsvExportDialog } from "./CsvExportDialog";

vi.mock("../library/client", () => ({
  listCsvExportPresets: vi.fn(),
  saveCsvExportPreset: vi.fn(),
  deleteCsvExportPreset: vi.fn(),
  exportCatalogCsv: vi.fn(),
}));

const listMock = vi.mocked(listCsvExportPresets);
const saveMock = vi.mocked(saveCsvExportPreset);
const deleteMock = vi.mocked(deleteCsvExportPreset);
const exportMock = vi.mocked(exportCatalogCsv);

const preset: CsvExportPreset = {
  name: "詳細",
  config: {
    columns: ["namePart2", "relativePath", "size"],
    includeHeader: false,
    sizeUnit: "kib" as const,
    splitDelimiter: "_",
  },
  updatedAtMs: 1,
};

describe("REQ-LEY-P3-020 CSV export dialog", () => {
  beforeEach(() => {
    listMock.mockReset();
    saveMock.mockReset();
    deleteMock.mockReset();
    exportMock.mockReset();
    listMock.mockResolvedValue({
      status: "ok", requestId: "list" as never, generation: 3 as never, data: [preset],
    });
    saveMock.mockResolvedValue({
      status: "ok", requestId: "save" as never, generation: 3 as never, data: preset,
    });
    deleteMock.mockResolvedValue({
      status: "ok", requestId: "delete" as never, generation: 3 as never, data: undefined,
    });
    exportMock.mockResolvedValue({
      status: "ok",
      requestId: "export" as never,
      generation: 3 as never,
      data: { fileName: "chapter.csv", bytes: [0xef, 0xbb, 0xbf, 49], rowCount: 1 },
    });
    vi.stubGlobal("confirm", vi.fn(() => true));
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:csv") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("loads an ordered Rust preset and delegates recursive generation and download", async () => {
    const onClose = vi.fn();
    const onNotice = vi.fn();
    render(
      <CsvExportDialog
        generation={3}
        currentPath="Series/Chapter"
        selectedPaths={["Series/Chapter/01.jpg"]}
        onClose={onClose}
        onNotice={onNotice}
      />,
    );
    const dialog = screen.getByRole("dialog", { name: "CSV出力設定" });
    await waitFor(() => expect(listMock).toHaveBeenCalledWith(3));
    fireEvent.change(within(dialog).getByLabelText("CSV preset"), { target: { value: "詳細" } });
    fireEvent.click(within(dialog).getByLabelText("現在のfolder以下"));
    fireEvent.click(within(dialog).getByRole("button", { name: "CSVを出力" }));

    await waitFor(() => expect(exportMock).toHaveBeenCalledWith({
      config: {
        columns: ["namePart2", "relativePath", "size"],
        includeHeader: false,
        sizeUnit: "kib",
        splitDelimiter: "_",
      },
      scope: "recursive",
      currentPath: "Series/Chapter",
      selectedPaths: ["Series/Chapter/01.jpg"],
    }, 3));
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:csv");
    expect(onNotice).toHaveBeenCalledWith("CSV 1件のダウンロードを開始しました。");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("requires explicit overwrite and delete confirmation for named presets", async () => {
    render(
      <CsvExportDialog generation={3} currentPath="" selectedPaths={[]} onClose={vi.fn()} onNotice={vi.fn()} />,
    );
    const dialog = screen.getByRole("dialog", { name: "CSV出力設定" });
    await screen.findByRole("option", { name: "詳細" });
    fireEvent.change(within(dialog).getByLabelText("CSV preset"), { target: { value: "詳細" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "保存" }));
    await waitFor(() => expect(saveMock).toHaveBeenCalledWith("詳細", expect.objectContaining({
      columns: ["namePart2", "relativePath", "size"],
    }), true, 3));
    expect(window.confirm).toHaveBeenCalledWith("CSV preset「詳細」を上書きしますか？");

    fireEvent.click(within(dialog).getByRole("button", { name: "削除" }));
    await waitFor(() => expect(deleteMock).toHaveBeenCalledWith("詳細", 3));
    expect(window.confirm).toHaveBeenCalledWith("CSV preset「詳細」を削除しますか？");
  });
});
