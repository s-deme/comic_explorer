import { useEffect, useRef, useState, type ReactNode, type PointerEvent } from "react";
import { STROKE_ACTION_LABELS, strokeArrows, traceStroke, type StrokeAction, type StrokeGestures, type StrokeTrace } from "../input/stroke-gestures";

export function StrokeGestureSurface({ settings, suspended = false, onAction, children }: {
  suspended?: boolean; settings: StrokeGestures; onAction: (action: StrokeAction) => void; children: ReactNode;
}) {
  const active = useRef<(StrokeTrace & { pointerId: number; canceled: boolean }) | null>(null);
  const [preview, setPreview] = useState("");
  const [points, setPoints] = useState<string[]>([]);
  const clear = () => { active.current = null; setPreview(""); setPoints([]); };
  useEffect(() => {
    const cancel = () => clear();
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !active.current) return;
      active.current.canceled = true;
      setPreview(""); setPoints([]);
      event.preventDefault(); event.stopImmediatePropagation();
    };
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", escape, true);
    return () => { window.removeEventListener("blur", cancel); window.removeEventListener("keydown", escape, true); };
  }, []);
  useEffect(clear, [settings, suspended]);
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const current = active.current;
    if (!current || current.pointerId !== event.pointerId || current.canceled) return;
    if (!(event.buttons & 2) || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) {
      current.canceled = true; setPreview(""); setPoints([]); return;
    }
    Object.assign(current, traceStroke(current, event.clientX, event.clientY, settings.threshold));
    setPreview(current.pattern);
    if (settings.showTrail) setPoints((old) => [...old.slice(-255), `${event.clientX},${event.clientY}`]);
  };
  const binding = settings.bindings.find((b) => b.enabled && b.pattern === preview);
  return <div className="viewer-gesture-surface"
    onContextMenu={(event) => event.preventDefault()}
    onPointerDownCapture={(event) => {
      if (event.button !== 2 || event.pointerType !== "mouse" || !settings.enabled || suspended
        || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      active.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, pattern: "", overflow: false, canceled: false };
      setPoints([`${event.clientX},${event.clientY}`]);
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }}
    onPointerMoveCapture={move}
    onWheelCapture={() => { if (active.current) { active.current.canceled = true; setPreview(""); setPoints([]); } }}
    onPointerUpCapture={(event) => {
      const current = active.current;
      if (!current || current.pointerId !== event.pointerId || event.button !== 2) return;
      // Include the final segment even when the host coalesces pointermove events.
      Object.assign(current, traceStroke(current, event.clientX, event.clientY, settings.threshold));
      if (current.pattern || current.canceled) event.preventDefault();
      const match = settings.bindings.find((b) => b.enabled && b.pattern === current.pattern);
      clear();
      if (!current.canceled && !current.overflow && match && event.pointerType === "mouse"
        && !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey) onAction(match.action);
    }}
    onPointerCancelCapture={clear}
    onLostPointerCapture={clear}
  >
    {children}
    {preview && <div className="viewer-gesture-feedback" role="status">
      {strokeArrows(preview)}：{binding ? STROKE_ACTION_LABELS[binding.action] : "割り当てなし"}（Escで取消）
    </div>}
    {settings.showTrail && preview && <svg className="viewer-gesture-trail" aria-hidden="true">
      <polyline points={points.join(" ")} />
    </svg>}
  </div>;
}
