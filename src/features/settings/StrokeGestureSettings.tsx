import { useEffect, useRef, useState } from "react";
import { defaultStrokeGestures, STROKE_ACTION_LABELS, strokeArrows, traceStroke, validStrokePattern, type StrokeAction, type StrokeGestures, type StrokeTrace } from "../input/stroke-gestures";

export function StrokeGestureSettings({ value, onChange }: { value: StrokeGestures; onChange: (value: StrokeGestures) => void }) {
  const [editing, setEditing] = useState<number | null>(null);
  const [pattern, setPattern] = useState("");
  const [action, setAction] = useState<StrokeAction>("nextPage");
  const [notice, setNotice] = useState("");
  const editor = useRef<HTMLFieldSetElement>(null);
  useEffect(() => { if (editing !== null) editor.current?.focus(); }, [editing]);
  const trace = useRef<(StrokeTrace & { pointerId: number }) | null>(null);
  const duplicate = value.bindings.some((b, index) => index !== editing && b.pattern === pattern);
  return <div className="stroke-settings">
    <h5 className="settings-subheading">右ボタンで描くジェスチャー</h5>
    <p>上下左右を順に描き、右ボタンを離すと実行します。最大8方向。読み方向を変えても割り当ては変わりません。</p>
    <div className="stroke-options">
      <label><input type="checkbox" checked={value.enabled} onChange={(e) => onChange({ ...value, enabled: e.target.checked })} />有効にする</label>
      <label><input type="checkbox" checked={value.showTrail} onChange={(e) => onChange({ ...value, showTrail: e.target.checked })} />軌跡を表示</label>
      <label>認識距離 <input aria-label="ジェスチャー認識距離" type="range" min={8} max={96} step={1} value={value.threshold} onChange={(e) => onChange({ ...value, threshold: Number(e.target.value) })} /> {value.threshold}px</label>
    </div>
    <ul className="stroke-bindings">
      {value.bindings.map((b, index) => <li key={b.pattern}>
        <label><input aria-label={`${strokeArrows(b.pattern)}を有効にする`} type="checkbox" checked={b.enabled} onChange={(e) => onChange({ ...value, bindings: value.bindings.map((row, i) => i === index ? { ...row, enabled: e.target.checked } : row) })} /><span>{strokeArrows(b.pattern)}</span></label>
        <span>{STROKE_ACTION_LABELS[b.action]}</span>
        <button type="button" aria-label={`${strokeArrows(b.pattern)}を編集`} onClick={() => { setEditing(index); setPattern(b.pattern); setAction(b.action); setNotice(""); }}>編集</button>
        <button type="button" aria-label={`${strokeArrows(b.pattern)}を削除`} onClick={() => { onChange({ ...value, bindings: value.bindings.filter((_, i) => i !== index) }); setEditing(null); }}>削除</button>
      </li>)}
    </ul>
    <div className="stroke-options">
      <button type="button" disabled={value.bindings.length >= 64} onClick={() => { setEditing(value.bindings.length); setPattern(""); setAction("nextPage"); setNotice(""); }}>ジェスチャーを追加</button>
      <button type="button" onClick={() => { onChange(defaultStrokeGestures()); setEditing(null); setNotice("初期割り当てに戻しました。設定の適用で保存します。"); }}>軌跡ジェスチャーを初期化</button>
    </div>
    {editing !== null && <fieldset ref={editor} tabIndex={-1}>
      <legend>{editing < value.bindings.length ? "割り当てを編集" : "割り当てを追加"}</legend>
      <p>軌跡：<output aria-label="編集中の軌跡">{strokeArrows(pattern) || "未入力"}</output></p>
      <div className="stroke-options">
        {["U", "D", "L", "R"].map((d) => <button type="button" key={d} disabled={pattern.length >= 8 || pattern.endsWith(d)} onClick={() => setPattern(pattern + d)}>{strokeArrows(d)}</button>)}
        <button type="button" onClick={() => setPattern(pattern.slice(0, -1))}>1方向戻す</button>
        <button type="button" onClick={() => setPattern("")}>軌跡を消去</button>
      </div>
      <label>実行する操作 <select aria-label="軌跡に割り当てる操作" value={action} onChange={(e) => setAction(e.target.value as StrokeAction)}>
        {Object.entries(STROKE_ACTION_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      {duplicate && <p role="alert">この軌跡は登録済みです。別の軌跡を指定してください。</p>}
      <div className="stroke-options">
        <button type="button" disabled={!validStrokePattern(pattern) || duplicate} onClick={() => {
          const bindings = [...value.bindings]; bindings[editing] = { pattern, action, enabled: bindings[editing]?.enabled ?? true };
          onChange({ ...value, bindings }); setEditing(null);
        }}>割り当てを保存</button>
        <button type="button" onClick={() => setEditing(null)}>編集を取消</button>
      </div>
    </fieldset>}
    <div className="stroke-test-area" role="group" aria-label="ジェスチャー試し描き" tabIndex={0}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        if (e.button !== 2 || e.pointerType !== "mouse") return;
        trace.current = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, pattern: "", overflow: false };
        e.currentTarget.focus();
        e.currentTarget.setPointerCapture?.(e.pointerId); setNotice("記録中…"); e.preventDefault();
      }}
      onPointerMove={(e) => { if (trace.current?.pointerId === e.pointerId) {
        Object.assign(trace.current, traceStroke(trace.current, e.clientX, e.clientY, value.threshold));
        setNotice(strokeArrows(trace.current.pattern));
      } }}
      onPointerUp={(e) => {
        const t = trace.current;
        if (!t || t.pointerId !== e.pointerId || e.button !== 2) return;
        Object.assign(t, traceStroke(t, e.clientX, e.clientY, value.threshold)); trace.current = null;
        if (t.overflow || !t.pattern) { setNotice("1〜8方向の軌跡を描いてください。"); return; }
        if (editing !== null) setPattern(t.pattern);
        const found = value.bindings.find((b) => b.enabled && b.pattern === t.pattern);
        setNotice(`${strokeArrows(t.pattern)}：${found ? STROKE_ACTION_LABELS[found.action] : "割り当てなし"}（操作は実行しません）`);
      }}
      onPointerCancel={() => { trace.current = null; setNotice("記録を取り消しました。"); }}
      onLostPointerCapture={() => { trace.current = null; }}
      onBlur={() => { trace.current = null; }}
      onKeyDown={(e) => { if (e.key === "Escape") { trace.current = null; setNotice("記録を取り消しました。"); e.stopPropagation(); } }}
    >右ボタンで試し描きできます。編集中は描いた軌跡を入力します。</div>
    <p role="status">{notice}</p>
  </div>;
}
