import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ItemKindSelector } from "./ItemKindSelector";

describe("ItemKindSelector", () => {
  it("uses positive labels and prevents an empty result-kind selection", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ItemKindSelector includeFolders includeFiles onChange={onChange} />,
    );

    fireEvent.click(screen.getByLabelText("結果にフォルダーを含める"));
    expect(onChange).toHaveBeenCalledWith({ includeFolders: false, includeFiles: true });

    rerender(
      <ItemKindSelector includeFolders={false} includeFiles onChange={onChange} />,
    );
    expect(screen.getByLabelText("結果にファイルを含める")).toBeDisabled();
    expect(screen.getByLabelText("結果にフォルダーを含める")).not.toBeDisabled();
  });
});
