import "@testing-library/jest-dom/vitest";
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { defaultStrokeGestures } from "../input/stroke-gestures";
import { StrokeGestureSettings } from "./StrokeGestureSettings";

afterEach(cleanup);
function Editor() {
  const [value, onChange] = useState(defaultStrokeGestures);
  return <StrokeGestureSettings value={value} onChange={onChange} />;
}
it("edits, prevents duplicates, adds, disables, deletes and resets bindings", () => {
  render(<Editor />);
  fireEvent.click(screen.getByRole("button", { name: "←を編集" }));
  fireEvent.change(screen.getByLabelText("軌跡に割り当てる操作"), { target: { value: "firstPage" } });
  fireEvent.click(screen.getByRole("button", { name: "割り当てを保存" }));
  expect(screen.getAllByText("先頭ページ")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "ジェスチャーを追加" }));
  fireEvent.click(screen.getByRole("button", { name: "←" }));
  expect(screen.getByRole("alert")).toHaveTextContent("登録済み");
  expect(screen.getByRole("button", { name: "割り当てを保存" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "↑" }));
  fireEvent.click(screen.getByRole("button", { name: "割り当てを保存" }));
  fireEvent.click(screen.getByLabelText("←↑を有効にする"));
  expect(screen.getByLabelText("←↑を有効にする")).not.toBeChecked();
  fireEvent.click(screen.getByRole("button", { name: "←↑を削除" }));
  expect(screen.queryByLabelText("←↑を有効にする")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "軌跡ジェスチャーを初期化" }));
  expect(screen.getAllByText("先頭ページ")).toHaveLength(1);
});
