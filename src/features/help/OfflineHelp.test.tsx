import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SHORTCUTS } from "../input/shortcuts";
import { OfflineHelp } from "./OfflineHelp";

describe("offline help", () => {
  afterEach(cleanup);

  it("REQ-LEY-P1-015 searches bundled topics and keeps current shortcuts", () => {
    render(<OfflineHelp shortcuts={{ ...DEFAULT_SHORTCUTS, nextPage: "N" }} onClose={vi.fn()} />);
    expect(screen.getByRole("region", { name: "プライバシーと安全" })).toHaveTextContent("外部通信を行わず");
    expect(screen.getByText("N")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox", { name: "ヘルプを検索" }), { target: { value: "ごみ箱" } });
    expect(screen.getByRole("region", { name: "ファイル操作" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "ビューワ" })).not.toBeInTheDocument();
  });

  it("closes with Escape without opening an external location", () => {
    const onClose = vi.fn();
    render(<OfflineHelp shortcuts={DEFAULT_SHORTCUTS} onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    expect(screen.queryByRole("link", { name: /https?:/ })).not.toBeInTheDocument();
  });
});
