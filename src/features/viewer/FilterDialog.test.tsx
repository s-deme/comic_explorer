import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  activateViewerFilterSet,
  deleteViewerFilterSet,
  listViewerFilterSets,
  saveViewerFilterSet,
  type ViewerFilterCatalog,
} from "../library/client";
import { FILTER_KINDS, FilterDialog } from "./FilterDialog";

vi.mock("../library/client", () => ({
  activateViewerFilterSet: vi.fn(), deleteViewerFilterSet: vi.fn(),
  listViewerFilterSets: vi.fn(), saveViewerFilterSet: vi.fn(),
}));

const catalog: ViewerFilterCatalog = {
  sets: [{ id: 4, name: "Scan", active: true, updatedAtMs: 1, chain: [
    { enabled: true, filter: { kind: "brightness", value: 10 } },
    { enabled: true, filter: { kind: "invert" } },
  ] }],
  maximumSets: 32,
  maximumSteps: 16,
};
function ok<T>(data: T) { return { status: "ok", requestId: "test", generation: 7, data } as never; }

describe("FilterDialog", () => {
  beforeEach(() => {
    vi.mocked(listViewerFilterSets).mockResolvedValue(ok(catalog));
    vi.mocked(saveViewerFilterSet).mockResolvedValue(ok(catalog));
    vi.mocked(activateViewerFilterSet).mockResolvedValue(ok(catalog));
    vi.mocked(deleteViewerFilterSet).mockResolvedValue(ok({ ...catalog, sets: [] }));
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("REQ-LEY-P5-002 edits enabled state and chain order before Rust persistence", async () => {
    const onApplied = vi.fn();
    render(<FilterDialog generation={7} onApplied={onApplied} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /● Scan/ }));
    fireEvent.click(screen.getByRole("button", { name: "2を上へ" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /2: 明るさを有効/ }));
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(saveViewerFilterSet).toHaveBeenCalledWith("Scan", [
      { enabled: true, filter: { kind: "invert" } },
      { enabled: false, filter: { kind: "brightness", value: 10 } },
    ], true, 7));
    expect(onApplied).toHaveBeenCalled();
  });

  it("REQ-LEY-P5-002 exposes all fourteen Rust filter kinds and the sixteen-step bound", async () => {
    render(<FilterDialog generation={8} onApplied={vi.fn()} onClose={vi.fn()} />);
    await screen.findByRole("button", { name: /● Scan/ });
    const selector = screen.getByLabelText("追加するフィルター");
    for (const kind of FILTER_KINDS.filter((kind) => kind !== "grayscale")) {
      fireEvent.change(selector, { target: { value: kind } });
      fireEvent.click(screen.getByRole("button", { name: "追加" }));
    }
    expect(screen.getByText("14 / 16 手順")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(saveViewerFilterSet).toHaveBeenCalled());
    const chain = vi.mocked(saveViewerFilterSet).mock.calls[0][1];
    expect(chain.map((step) => step.filter.kind)).toEqual(FILTER_KINDS);
  });

  it("separates the selected set actions from the ordered processing steps", async () => {
    render(<FilterDialog generation={8} onApplied={vi.fn()} onClose={vi.fn()} />);

    expect(await screen.findByText("フィルターセット")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "処理手順" })).toBeInTheDocument();
    expect(screen.getByText("表示だけを調整")).toBeInTheDocument();
    expect(screen.getByText("1 / 16 手順")).toBeInTheDocument();
  });

  it("REQ-LEY-P5-002 activates, disables, and confirms deletion through Rust IPC", async () => {
    render(<FilterDialog generation={9} onApplied={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /● Scan/ }));
    fireEvent.click(screen.getByRole("button", { name: "有効にする" }));
    await waitFor(() => expect(activateViewerFilterSet).toHaveBeenCalledWith(4, 9));
    fireEvent.click(screen.getByRole("button", { name: "フィルターなし" }));
    await waitFor(() => expect(activateViewerFilterSet).toHaveBeenCalledWith(null, 9));
    fireEvent.click(screen.getByRole("button", { name: "削除" }));
    expect(window.confirm).toHaveBeenCalled();
    await waitFor(() => expect(deleteViewerFilterSet).toHaveBeenCalledWith(4, 9));
  });
});
