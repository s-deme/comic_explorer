import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  launchExternalApp,
  listExternalAppHistory,
  listExternalApps,
  previewExternalAppLaunch,
  registerExternalApp,
} from "../library/client";
import { ExternalAppDialog } from "./ExternalAppDialog";

vi.mock("../library/client", () => ({
  deleteExternalApp: vi.fn(),
  launchExternalApp: vi.fn(),
  listExternalAppHistory: vi.fn(),
  listExternalApps: vi.fn(),
  previewExternalAppLaunch: vi.fn(),
  registerExternalApp: vi.fn(),
  updateExternalApp: vi.fn(),
}));

const app = { id: 7, displayName: "Safe Viewer", executableName: "viewer.exe",
  fixedArgs: ["--read-only"], targetMode: "allSelected" as const };

describe("ExternalAppDialog", () => {
  beforeEach(() => {
    vi.mocked(listExternalApps).mockResolvedValue({ status: "ok", requestId: "r" as never,
      generation: 4 as never, data: [app] });
    vi.mocked(listExternalAppHistory).mockResolvedValue({ status: "ok", requestId: "h" as never,
      generation: 4 as never, data: [{ appId: 7, displayName: "Safe Viewer", targetMode: "allSelected",
        targetCount: 2, launchedAtMs: 1 }] });
  });
  afterEach(() => { cleanup(); vi.clearAllMocks(); });

  it("REQ-LEY-P3-017 previews the exact selection and requires a second confirmation", async () => {
    vi.mocked(previewExternalAppLaunch).mockResolvedValue({ status: "ok", requestId: "p" as never,
      generation: 4 as never, data: { appId: 7, displayName: "Safe Viewer", executableName: "viewer.exe",
        targetMode: "allSelected", targetCount: 2, fixedArgCount: 1, previewKey: "key" } });
    vi.mocked(launchExternalApp).mockResolvedValue({ status: "ok", requestId: "l" as never,
      generation: 4 as never, data: { operation: "openWith", affected: 2 } });
    const onClose = vi.fn();
    const onNotice = vi.fn();
    render(<ExternalAppDialog generation={4} paths={["one.cbz", "two.pdf"]} onClose={onClose} onNotice={onNotice} />);
    fireEvent.click(await screen.findByRole("button", { name: "起動内容を確認" }));
    await screen.findByRole("alertdialog", { name: "外部アプリ起動の確認" });
    expect(previewExternalAppLaunch).toHaveBeenCalledWith(7, ["one.cbz", "two.pdf"], 4);
    expect(launchExternalApp).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "確認して起動" }));
    await waitFor(() => expect(launchExternalApp).toHaveBeenCalledWith(7, ["one.cbz", "two.pdf"], "key", 4));
    expect(onClose).toHaveBeenCalled();
  });

  it("REQ-LEY-P3-017 keeps fixed arguments as separate lines for native registration", async () => {
    vi.mocked(registerExternalApp).mockResolvedValue({ status: "ok", requestId: "a" as never,
      generation: 4 as never, data: app });
    render(<ExternalAppDialog generation={4} paths={["one.cbz"]} onClose={() => undefined} onNotice={() => undefined} />);
    fireEvent.change(screen.getByLabelText("表示名"), { target: { value: "Viewer" } });
    fireEvent.change(screen.getByLabelText("固定引数（1行に1引数）"), { target: { value: "--read-only\ntwo words" } });
    fireEvent.change(screen.getByLabelText("渡す対象"), { target: { value: "allSelected" } });
    fireEvent.click(screen.getByRole("button", { name: "実行ファイルを選んで登録" }));
    await waitFor(() => expect(registerExternalApp).toHaveBeenCalledWith(
      "Viewer", ["--read-only", "two words"], "allSelected", 4,
    ));
  });
});
