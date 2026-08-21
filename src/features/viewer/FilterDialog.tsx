import { useEffect, useState } from "react";

import { presentError } from "../errors/presentation";
import {
  activateViewerFilterSet,
  deleteViewerFilterSet,
  listViewerFilterSets,
  saveViewerFilterSet,
  type TonePoint,
  type ViewerFilter,
  type ViewerFilterCatalog,
  type ViewerFilterStep,
} from "../library/client";

const LABELS: Record<ViewerFilter["kind"], string> = {
  grayscale: "グレースケール", levels: "レベル補正", gamma: "ガンマ", contrast: "コントラスト",
  brightness: "明るさ", histogramEqualize: "ヒストグラム均等化", posterize: "ポスタリゼーション",
  invert: "色反転", toneCurve: "トーンカーブ", sharpen: "シャープ", unsharpMask: "アンシャープマスク",
  blur: "ぼかし", crop: "トリミング", margin: "余白追加",
};

export const FILTER_KINDS = Object.keys(LABELS) as ViewerFilter["kind"][];

export function defaultFilter(kind: ViewerFilter["kind"]): ViewerFilter {
  switch (kind) {
    case "grayscale": case "histogramEqualize": case "invert": return { kind };
    case "levels": return { kind, black: 0, white: 255, gamma: 1 };
    case "gamma": return { kind, value: 1 };
    case "contrast": case "brightness": return { kind, value: 0 };
    case "posterize": return { kind, levels: 8 };
    case "toneCurve": return { kind, points: [{ input: 0, output: 0 }, { input: 255, output: 255 }] };
    case "sharpen": return { kind, amount: 0.5 };
    case "unsharpMask": return { kind, radius: 2, amount: 0.5, threshold: 2 };
    case "blur": return { kind, radius: 2 };
    case "crop": return { kind, top: 0, right: 0, bottom: 0, left: 0 };
    case "margin": return { kind, top: 0, right: 0, bottom: 0, left: 0, color: "#ffffff" };
  }
}

interface Props { generation: number; onApplied: () => void; onClose: () => void; }

function responseNotice(response: { status: "cancelled" } | { status: "error"; error: Parameters<typeof presentError>[0] }): string {
  return response.status === "cancelled" ? "フィルター操作をキャンセルしました。" : presentError(response.error);
}

function number(value: string): number { return Number(value); }

function Edges({ filter, onChange, maximum, suffix }: { filter: Extract<ViewerFilter, { kind: "crop" | "margin" }>; onChange: (filter: ViewerFilter) => void; maximum: number; suffix: string }) {
  return <div className="filter-parameters filter-edges">{(["top", "right", "bottom", "left"] as const).map((edge) => <label key={edge}>{({ top: "上", right: "右", bottom: "下", left: "左" })[edge]}<input aria-label={`${LABELS[filter.kind]} ${edge}`} type="number" min={0} max={maximum} step={filter.kind === "crop" ? 0.5 : 1} value={filter[edge]} onChange={(event) => onChange({ ...filter, [edge]: number(event.target.value) })} />{suffix}</label>)}</div>;
}

function FilterEditor({ step, onChange }: { step: ViewerFilterStep; onChange: (step: ViewerFilterStep) => void }) {
  const filter = step.filter;
  const update = (next: ViewerFilter) => onChange({ ...step, filter: next });
  let controls = null;
  switch (filter.kind) {
    case "levels": controls = <div className="filter-parameters"><label>黒点<input aria-label="レベル 黒点" type="number" min={0} max={254} value={filter.black} onChange={(event) => update({ ...filter, black: number(event.target.value) })} /></label><label>白点<input aria-label="レベル 白点" type="number" min={1} max={255} value={filter.white} onChange={(event) => update({ ...filter, white: number(event.target.value) })} /></label><label>gamma<input aria-label="レベル gamma" type="number" min={0.1} max={5} step={0.05} value={filter.gamma} onChange={(event) => update({ ...filter, gamma: number(event.target.value) })} /></label></div>; break;
    case "gamma": controls = <label>値<input aria-label="ガンマ値" type="number" min={0.1} max={5} step={0.05} value={filter.value} onChange={(event) => update({ ...filter, value: number(event.target.value) })} /></label>; break;
    case "contrast": case "brightness": controls = <label>値<input aria-label={`${LABELS[filter.kind]}値`} type="number" min={-100} max={100} value={filter.value} onChange={(event) => update({ ...filter, value: number(event.target.value) })} /></label>; break;
    case "posterize": controls = <label>階調<input aria-label="ポスタリゼーション階調" type="number" min={2} max={32} value={filter.levels} onChange={(event) => update({ ...filter, levels: number(event.target.value) })} /></label>; break;
    case "toneCurve": controls = <label>制御点（入力:出力、comma区切り）<input aria-label="トーンカーブ制御点" value={filter.points.map((point) => `${point.input}:${point.output}`).join(",")} onChange={(event) => { const points = event.target.value.split(",").map((pair) => pair.split(":").map(Number)).filter((pair) => pair.length === 2).map(([input, output]) => ({ input, output } as TonePoint)); update({ ...filter, points }); }} /></label>; break;
    case "sharpen": controls = <label>強度<input aria-label="シャープ強度" type="number" min={0.1} max={3} step={0.1} value={filter.amount} onChange={(event) => update({ ...filter, amount: number(event.target.value) })} /></label>; break;
    case "unsharpMask": controls = <div className="filter-parameters"><label>半径<input aria-label="アンシャープ半径" type="number" min={1} max={8} value={filter.radius} onChange={(event) => update({ ...filter, radius: number(event.target.value) })} /></label><label>量<input aria-label="アンシャープ量" type="number" min={0.1} max={3} step={0.1} value={filter.amount} onChange={(event) => update({ ...filter, amount: number(event.target.value) })} /></label><label>しきい値<input aria-label="アンシャープしきい値" type="number" min={0} max={255} value={filter.threshold} onChange={(event) => update({ ...filter, threshold: number(event.target.value) })} /></label></div>; break;
    case "blur": controls = <label>半径<input aria-label="ぼかし半径" type="number" min={1} max={8} value={filter.radius} onChange={(event) => update({ ...filter, radius: number(event.target.value) })} /></label>; break;
    case "crop": controls = <Edges filter={filter} onChange={update} maximum={45} suffix="%" />; break;
    case "margin": controls = <><Edges filter={filter} onChange={update} maximum={512} suffix="px" /><label>色<input aria-label="余白色" type="color" value={filter.color} onChange={(event) => update({ ...filter, color: event.target.value })} /></label></>; break;
  }
  return <>{controls}</>;
}

export function FilterDialog({ generation, onApplied, onClose }: Props) {
  const [catalog, setCatalog] = useState<ViewerFilterCatalog>({ sets: [], maximumSets: 32, maximumSteps: 16 });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [name, setName] = useState("新しいフィルター");
  const [chain, setChain] = useState<ViewerFilterStep[]>([{ enabled: true, filter: defaultFilter("grayscale") }]);
  const [addKind, setAddKind] = useState<ViewerFilter["kind"]>("grayscale");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setBusy(true); void listViewerFilterSets(generation).then((response) => { if (response.status === "ok") setCatalog(response.data); else setNotice(responseNotice(response)); }).catch(() => setNotice("フィルターセットを読み込めませんでした。")).finally(() => setBusy(false)); }, [generation]);
  function accept(next: ViewerFilterCatalog) { setCatalog(next); onApplied(); }
  function selectSet(id: number) { const set = catalog.sets.find((candidate) => candidate.id === id); if (!set) return; setSelectedId(id); setName(set.name); setChain(structuredClone(set.chain)); }
  async function run(operation: Promise<Awaited<ReturnType<typeof listViewerFilterSets>>>, success: string) { setBusy(true); try { const response = await operation; if (response.status === "ok") { accept(response.data); setNotice(success); } else setNotice(responseNotice(response)); } catch { setNotice("フィルター操作を完了できませんでした。"); } finally { setBusy(false); } }

  return <div className="dialog-backdrop"><section role="dialog" aria-modal="true" aria-label="画像フィルター" className="filter-dialog">
    <header className="quick-access-heading"><div><h2>画像フィルター</h2><p>Rustで表示byteだけを変換します。原本とthumbnailは変更しません。</p></div><button type="button" onClick={onClose}>閉じる</button></header>
    {notice !== null && <p role="status">{notice}</p>}
    <div className="filter-layout"><nav aria-label="フィルターセット"><button type="button" disabled={busy} onClick={() => { setSelectedId(null); setName("新しいフィルター"); setChain([{ enabled: true, filter: defaultFilter("grayscale") }]); }}>新規セット</button><button type="button" disabled={busy || !catalog.sets.some((set) => set.active)} onClick={() => void run(activateViewerFilterSet(null, generation), "フィルターを無効にしました。現在ページを再読込します。")}>フィルターなし</button><ul>{catalog.sets.map((set) => <li key={set.id} aria-current={set.id === selectedId}><button type="button" onClick={() => selectSet(set.id)}>{set.active ? "● " : "○ "}{set.name}<small>{set.chain.length} step</small></button></li>)}</ul></nav>
      <section className="filter-chain"><div className="filter-set-actions"><label>セット名<input aria-label="フィルターセット名" maxLength={64} value={name} onChange={(event) => setName(event.target.value)} /></label><button type="button" disabled={busy || chain.length === 0} onClick={() => void run(saveViewerFilterSet(name, chain, selectedId !== null, generation), "フィルターセットをRust SQLiteへ保存しました。")}>保存</button><button type="button" disabled={busy || selectedId === null} onClick={() => selectedId !== null && void run(activateViewerFilterSet(selectedId, generation), "選択セットを有効にし、現在ページを再読込します。")}>有効にする</button><button type="button" disabled={busy || selectedId === null} onClick={() => { if (selectedId !== null && window.confirm("このフィルターセットを削除しますか？")) void run(deleteViewerFilterSet(selectedId, generation), "フィルターセットを削除しました。"); }}>削除</button></div>
        <div className="filter-add"><select aria-label="追加するフィルター" value={addKind} onChange={(event) => setAddKind(event.target.value as ViewerFilter["kind"])}>{FILTER_KINDS.map((kind) => <option key={kind} value={kind}>{LABELS[kind]}</option>)}</select><button type="button" disabled={chain.length >= catalog.maximumSteps} onClick={() => setChain((current) => [...current, { enabled: true, filter: defaultFilter(addKind) }])}>追加</button><span>{chain.length} / {catalog.maximumSteps} step</span></div>
        <ol aria-label="順序付きフィルターチェーン">{chain.map((step, index) => <li key={index}><header><label><input aria-label={`${index + 1}: ${LABELS[step.filter.kind]}を有効`} type="checkbox" checked={step.enabled} onChange={(event) => setChain((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, enabled: event.target.checked } : item))} />{index + 1}. {LABELS[step.filter.kind]}</label><button type="button" aria-label={`${index + 1}を上へ`} disabled={index === 0} onClick={() => setChain((current) => { const next = [...current]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; return next; })}>↑</button><button type="button" aria-label={`${index + 1}を下へ`} disabled={index === chain.length - 1} onClick={() => setChain((current) => { const next = [...current]; [next[index], next[index + 1]] = [next[index + 1], next[index]]; return next; })}>↓</button><button type="button" aria-label={`${index + 1}を削除`} onClick={() => setChain((current) => current.filter((_, itemIndex) => itemIndex !== index))}>削除</button></header><FilterEditor step={step} onChange={(next) => setChain((current) => current.map((item, itemIndex) => itemIndex === index ? next : item))} /></li>)}</ol>
      </section></div>
  </section></div>;
}
