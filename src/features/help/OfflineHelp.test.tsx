import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SHORTCUTS } from "../input/shortcuts";
import { OfflineHelp } from "./OfflineHelp";

describe("offline help", () => {
  afterEach(cleanup);

  it("REQ-LEY-P1-015 switches one bundled article at a time in the two-pane help", () => {
    render(<OfflineHelp shortcuts={DEFAULT_SHORTCUTS} onClose={vi.fn()} />);

    expect(screen.getByRole("dialog", { name: "Comic Explorer ヘルプ" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "ヘルプの章" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "はじめに" })).toHaveTextContent("3ステップで読み始める");
    expect(screen.queryByRole("article", { name: "作品を開く" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /データとプライバシー/ }));
    expect(screen.getByRole("article", { name: "データとプライバシー" })).toHaveTextContent("外部通信は必要なく");
    expect(screen.queryByRole("article", { name: "はじめに" })).not.toBeInTheDocument();
  });

  it("searches bundled topics, descriptions, and current shortcut bindings", () => {
    render(<OfflineHelp shortcuts={{ ...DEFAULT_SHORTCUTS, nextPage: ["N", "PageDown"] }} onClose={vi.fn()} />);
    const search = screen.getByRole("searchbox", { name: "ヘルプを検索" });

    fireEvent.change(search, { target: { value: "ごみ箱" } });
    const results = screen.getByRole("region", { name: "ヘルプの検索結果" });
    expect(within(results).getByRole("button", { name: /ファイルを整理する/ })).toBeInTheDocument();
    expect(within(results).queryByRole("button", { name: /漫画を読む/ })).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: "N" } });
    expect(screen.getByRole("region", { name: "一致したキー操作" })).toHaveTextContent("次ページ");
    expect(screen.getByText("N", { selector: "kbd" })).toBeInTheDocument();
    expect(screen.getByText("PageDown", { selector: "kbd" })).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "存在しない説明" } });
    expect(screen.getByRole("status")).toHaveTextContent("一致する説明はありません");
    fireEvent.click(screen.getByRole("button", { name: "検索をクリア" }));
    expect(search).toHaveValue("");
  });

  it("keeps shortcuts read-only and closes without opening an external location", () => {
    const onClose = vi.fn();
    render(<OfflineHelp shortcuts={DEFAULT_SHORTCUTS} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /キー操作/ }));
    expect(screen.getByRole("article", { name: "現在のショートカット" })).toHaveTextContent("この画面から変更はできません");
    expect(screen.queryByRole("button", { name: "ショートカット設定を開く" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
