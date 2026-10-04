import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultStrokeGestures } from "../input/stroke-gestures";
import { StrokeGestureSurface } from "./StrokeGestureSurface";

afterEach(cleanup);
const pointer = { pointerId: 1, pointerType: "mouse", button: 2, buttons: 2 };
function setup(enabled = true) {
  const action = vi.fn(), rightClick = vi.fn();
  render(<StrokeGestureSurface settings={{ ...defaultStrokeGestures(), enabled }} onAction={action}>
    <div data-testid="image" onPointerUp={(e) => { if (!e.defaultPrevented) rightClick(); }} />
  </StrokeGestureSurface>);
  const image = screen.getByTestId("image");
  fireEvent.pointerDown(image, { ...pointer, clientX: 100, clientY: 100 });
  return { action, rightClick, image };
}
describe("right-button stroke interaction", () => {
  it("previews and executes only the complete stroke on release, suppressing the right click", () => {
    const { action, rightClick, image } = setup();
    fireEvent.pointerMove(image, { ...pointer, clientX: 100, clientY: 150 });
    expect(action).not.toHaveBeenCalled();
    fireEvent.pointerMove(image, { ...pointer, clientX: 150, clientY: 150 });
    expect(screen.getByRole("status")).toHaveTextContent("ビューワを閉じる");
    fireEvent.pointerUp(image, { ...pointer, buttons: 0, clientX: 150, clientY: 150 });
    expect(action).toHaveBeenCalledExactlyOnceWith("closeViewer");
    expect(rightClick).not.toHaveBeenCalled();
  });
  it.each(["escape", "wheel", "cancel", "blur", "lost"])("does not execute after %s", (reason) => {
    const { image, action } = setup();
    fireEvent.pointerMove(image, { ...pointer, clientX: 50, clientY: 100 });
    if (reason === "escape") fireEvent.keyDown(window, { key: "Escape" });
    if (reason === "wheel") fireEvent.wheel(image, { deltaY: 100, buttons: 2 });
    if (reason === "cancel") fireEvent.pointerCancel(image, pointer);
    if (reason === "blur") fireEvent.blur(window);
    if (reason === "lost") fireEvent.lostPointerCapture(image, pointer);
    fireEvent.pointerUp(image, { ...pointer, buttons: 0, clientX: 50, clientY: 100 });
    expect(action).not.toHaveBeenCalled();
  });
  it("preserves stationary right clicks and the disabled setting", () => {
    const { image, action, rightClick } = setup(false);
    fireEvent.pointerUp(image, { ...pointer, buttons: 0, clientX: 100, clientY: 100 });
    expect(action).not.toHaveBeenCalled(); expect(rightClick).toHaveBeenCalledOnce();
  });
  it("suppresses unmatched gestures instead of falling back to right click", () => {
    const { image, action, rightClick } = setup();
    fireEvent.pointerMove(image, { ...pointer, clientX: 50, clientY: 100 });
    fireEvent.pointerUp(image, { ...pointer, buttons: 0, clientX: 50, clientY: 50 });
    expect(action).not.toHaveBeenCalled(); expect(rightClick).not.toHaveBeenCalled();
  });
});
