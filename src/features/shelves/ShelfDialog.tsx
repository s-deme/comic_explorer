import { useEffect, useMemo, useRef, useState } from "react";

import { presentError } from "../errors/presentation";
import {
  addShelfItems,
  createShelf,
  createShelfFolder,
  deleteShelf,
  executeShelfNodeDelete,
  executeShelfCleanup,
  executeShelvesImport,
  exportShelvesText,
  listShelves,
  openShelfItem,
  previewShelfCleanup,
  previewShelfNodeDelete,
  previewShelvesImport,
  reorderShelfNodes,
  reorderShelves,
  saveStartupShelf,
  updateShelf,
  updateShelfNode,
  type CliLaunchPlan,
  type NamedShelf,
  type ShelfIcon,
  type ShelfImportPreview,
  type ShelfNode,
  type ShelfSnapshot,
} from "../library/client";

const ICONS: { value: ShelfIcon; label: string; glyph: string }[] = [
  { value: "books", label: "本", glyph: "▥" },
  { value: "folder", label: "フォルダー", glyph: "▱" },
  { value: "star", label: "星", glyph: "★" },
  { value: "archive", label: "書庫", glyph: "▤" },
  { value: "image", label: "画像", glyph: "▧" },
];

interface ShelfDialogProps {
  selectedPaths: string[];
  draggedPaths: string[];
  onOpenPlan: (plan: CliLaunchPlan) => Promise<void> | void;
  onClose: () => void;
}

interface FlatNode {
  node: ShelfNode;
  depth: number;
}

function iconGlyph(icon: ShelfIcon): string {
  return ICONS.find((candidate) => candidate.value === icon)?.glyph ?? "▥";
}

function flattenNodes(nodes: ShelfNode[], shelfId: number): FlatNode[] {
  const byParent = new Map<number | null, ShelfNode[]>();
  for (const node of nodes.filter((candidate) => candidate.shelfId === shelfId)) {
    const siblings = byParent.get(node.parentId) ?? [];
    siblings.push(node);
    byParent.set(node.parentId, siblings);
  }
  for (const siblings of byParent.values()) {
    siblings.sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id);
  }
  const result: FlatNode[] = [];
  const append = (parentId: number | null, depth: number) => {
    for (const node of byParent.get(parentId) ?? []) {
      result.push({ node, depth });
      if (node.nodeType === "folder") append(node.id, depth + 1);
    }
  };
  append(null, 0);
  return result;
}

function responseNotice(response: {
  status: "error";
  error: Parameters<typeof presentError>[0];
} | { status: "cancelled" }): string {
  return response.status === "error"
    ? presentError(response.error)
    : "本棚操作をキャンセルしました。";
}

export function ShelfDialog({ selectedPaths, draggedPaths, onOpenPlan, onClose }: ShelfDialogProps) {
  const generation = useRef(0);
  const [snapshot, setSnapshot] = useState<ShelfSnapshot>({ shelves: [], nodes: [], startupShelfId: null });
  const [selectedShelfId, setSelectedShelfId] = useState<number | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [iconDraft, setIconDraft] = useState<ShelfIcon>("books");
  const [folderDraft, setFolderDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [textDocument, setTextDocument] = useState("");
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [importPreview, setImportPreview] = useState<ShelfImportPreview | null>(null);

  const selectedShelf = snapshot.shelves.find((shelf) => shelf.id === selectedShelfId) ?? null;
  const selectedNode = snapshot.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const flatNodes = useMemo(
    () => selectedShelfId === null ? [] : flattenNodes(snapshot.nodes, selectedShelfId),
    [selectedShelfId, snapshot.nodes],
  );
  const folderNodes = flatNodes.filter(({ node }) => node.nodeType === "folder");
  const registrationParent = selectedNode?.nodeType === "folder" ? selectedNode.id : null;

  function acceptSnapshot(next: ShelfSnapshot) {
    setSnapshot(next);
    setSelectedShelfId((current) => next.shelves.some((shelf) => shelf.id === current)
      ? current
      : next.startupShelfId ?? next.shelves[0]?.id ?? null);
    setSelectedNodeId((current) => next.nodes.some((node) => node.id === current) ? current : null);
  }

  async function runSnapshot(
    operation: (requestGeneration: number) => Promise<Awaited<ReturnType<typeof listShelves>>>,
    success: string,
  ) {
    const requestGeneration = ++generation.current;
    setBusy(true);
    try {
      const response = await operation(requestGeneration);
      if (requestGeneration !== generation.current) return;
      if (response.status === "ok") {
        acceptSnapshot(response.data);
        setNotice(success);
      } else {
        setNotice(responseNotice(response));
      }
    } catch {
      if (requestGeneration === generation.current) setNotice("本棚を更新できませんでした。");
    } finally {
      if (requestGeneration === generation.current) setBusy(false);
    }
  }

  useEffect(() => {
    const requestGeneration = ++generation.current;
    setBusy(true);
    void listShelves(requestGeneration).then((response) => {
      if (requestGeneration !== generation.current) return;
      if (response.status === "ok") {
        acceptSnapshot(response.data);
        if (response.data.startupShelfId !== null) setNotice("起動時に指定された本棚を開きました。");
      } else {
        setNotice(responseNotice(response));
      }
    }).catch(() => {
      if (requestGeneration === generation.current) setNotice("本棚を読み込めませんでした。");
    }).finally(() => {
      if (requestGeneration === generation.current) setBusy(false);
    });
    return () => { generation.current += 1; };
  }, []);

  useEffect(() => {
    if (selectedShelf === null) return;
    setNameDraft(selectedShelf.name);
    setIconDraft(selectedShelf.icon);
    setSelectedNodeId(null);
  }, [selectedShelfId]);

  async function register(paths: string[], source: "selection" | "drop") {
    if (selectedShelfId === null || paths.length === 0) {
      setNotice("登録先の本棚と項目を選択してください。");
      return;
    }
    await runSnapshot(
      (requestGeneration) => addShelfItems(
        selectedShelfId,
        registrationParent,
        paths,
        requestGeneration,
      ),
      source === "drop" ? `${paths.length}件をドロップ登録しました。` : `${paths.length}件を登録しました。`,
    );
  }

  function siblingOrder(node: ShelfNode): number[] {
    return snapshot.nodes
      .filter((candidate) => candidate.shelfId === node.shelfId && candidate.parentId === node.parentId)
      .sort((left, right) => left.sortOrder - right.sortOrder || left.id - right.id)
      .map((candidate) => candidate.id);
  }

  async function moveNode(offset: -1 | 1) {
    if (selectedNode === null) return;
    const order = siblingOrder(selectedNode);
    const index = order.indexOf(selectedNode.id);
    const next = index + offset;
    if (index < 0 || next < 0 || next >= order.length) return;
    [order[index], order[next]] = [order[next], order[index]];
    await runSnapshot(
      (requestGeneration) => reorderShelfNodes(
        selectedNode.shelfId,
        selectedNode.parentId,
        order,
        requestGeneration,
      ),
      "本棚項目の順序を変更しました。",
    );
  }

  async function moveShelf(offset: -1 | 1) {
    if (selectedShelfId === null) return;
    const order = snapshot.shelves.map((shelf) => shelf.id);
    const index = order.indexOf(selectedShelfId);
    const next = index + offset;
    if (index < 0 || next < 0 || next >= order.length) return;
    [order[index], order[next]] = [order[next], order[index]];
    await runSnapshot(
      (requestGeneration) => reorderShelves(order, requestGeneration),
      "本棚の順序を変更しました。",
    );
  }

  async function exportText() {
    const requestGeneration = ++generation.current;
    setBusy(true);
    try {
      const response = await exportShelvesText(selectedShelfId, requestGeneration);
      if (requestGeneration !== generation.current) return;
      if (response.status !== "ok") {
        setNotice(responseNotice(response));
        return;
      }
      setTextDocument(new TextDecoder().decode(new Uint8Array(response.data.bytes)));
      setImportPreview(null);
      setNotice(`${response.data.shelfCount}本棚・${response.data.nodeCount}項目をテキストへ出力しました。`);
    } catch {
      setNotice("本棚テキストを出力できませんでした。");
    } finally {
      if (requestGeneration === generation.current) setBusy(false);
    }
  }

  function downloadText() {
    const blob = new Blob([textDocument], { type: "application/x-ndjson;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "comic-explorer-shelves-v1.jsonl";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function previewImport() {
    const bytes = [...new TextEncoder().encode(textDocument)];
    const requestGeneration = ++generation.current;
    setBusy(true);
    try {
      const response = await previewShelvesImport(bytes, replaceExisting, requestGeneration);
      if (requestGeneration !== generation.current) return;
      if (response.status === "ok") {
        setImportPreview(response.data);
        setNotice(`import予定: ${response.data.shelfCount}本棚・${response.data.nodeCount}項目`);
      } else {
        setImportPreview(null);
        setNotice(responseNotice(response));
      }
    } catch {
      setImportPreview(null);
      setNotice("本棚テキストを検査できませんでした。");
    } finally {
      if (requestGeneration === generation.current) setBusy(false);
    }
  }

  async function executeImport() {
    if (importPreview === null || !window.confirm("表示した内容を本棚へ取り込みますか？")) return;
    const bytes = [...new TextEncoder().encode(textDocument)];
    await runSnapshot(
      (requestGeneration) => executeShelvesImport(
        bytes,
        replaceExisting,
        importPreview.previewKey,
        requestGeneration,
      ),
      "本棚テキストを取り込みました。",
    );
    setImportPreview(null);
  }

  return (
    <aside className="bookshelf-dialog" role="dialog" aria-modal="false" aria-label="本棚" aria-busy={busy}>
      <header className="quick-access-heading">
        <h2>本棚</h2>
        <button type="button" onClick={onClose}>閉じる</button>
      </header>
      {notice !== null && <p role="status">{notice}</p>}
      <div className="bookshelf-layout">
        <section aria-label="名前付き本棚">
          <h3>名前付き本棚</h3>
          <label>
            本棚名
            <input value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} />
          </label>
          <label>
            アイコン
            <select value={iconDraft} onChange={(event) => setIconDraft(event.target.value as ShelfIcon)}>
              {ICONS.map((icon) => <option key={icon.value} value={icon.value}>{icon.glyph} {icon.label}</option>)}
            </select>
          </label>
          <div className="bookshelf-actions">
            <button type="button" disabled={busy} onClick={() => void runSnapshot(
              (requestGeneration) => createShelf(nameDraft, iconDraft, requestGeneration),
              "名前付き本棚を作成しました。",
            )}>新規作成</button>
            <button type="button" disabled={busy || selectedShelf === null} onClick={() => {
              if (selectedShelf === null) return;
              void runSnapshot(
                (requestGeneration) => updateShelf(selectedShelf.id, nameDraft, iconDraft, requestGeneration),
                "本棚名とアイコンを更新しました。",
              );
            }}>更新</button>
            <button type="button" disabled={busy || selectedShelf === null} onClick={() => {
              if (selectedShelf === null || !window.confirm(`本棚「${selectedShelf.name}」と仮想階層を除去しますか？`)) return;
              void runSnapshot(
                (requestGeneration) => deleteShelf(selectedShelf.id, requestGeneration),
                "本棚を除去しました。実ファイルは変更していません。",
              );
            }}>除去</button>
          </div>
          <div className="bookshelf-order-actions">
            <button type="button" disabled={busy || selectedShelf === null} onClick={() => void moveShelf(-1)}>本棚を上へ</button>
            <button type="button" disabled={busy || selectedShelf === null} onClick={() => void moveShelf(1)}>本棚を下へ</button>
          </div>
          <ul aria-label="本棚一覧">
            {snapshot.shelves.map((shelf) => (
              <li key={shelf.id}>
                <button
                  type="button"
                  aria-pressed={selectedShelfId === shelf.id}
                  onClick={() => setSelectedShelfId(shelf.id)}
                >{iconGlyph(shelf.icon)} {shelf.name}</button>
              </li>
            ))}
          </ul>
          <label>
            起動時に開く本棚
            <select
              value={snapshot.startupShelfId ?? ""}
              disabled={busy}
              onChange={(event) => void runSnapshot(
                (requestGeneration) => saveStartupShelf(
                  event.target.value === "" ? null : Number(event.target.value),
                  requestGeneration,
                ),
                "起動時本棚を更新しました。",
              )}
            >
              <option value="">指定なし</option>
              {snapshot.shelves.map((shelf) => <option key={shelf.id} value={shelf.id}>{shelf.name}</option>)}
            </select>
          </label>
        </section>

        <section
          aria-label="本棚の仮想階層"
          className="bookshelf-tree"
          onDragOver={(event) => {
            if (draggedPaths.length === 0) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (draggedPaths.length > 0) void register(draggedPaths, "drop");
          }}
        >
          <h3>{selectedShelf?.name ?? "仮想階層"}</h3>
          <div className="bookshelf-actions">
            <button type="button" disabled={busy || selectedShelf === null || selectedPaths.length === 0} onClick={() => void register(selectedPaths, "selection")}>選択を登録</button>
            <input aria-label="新しい仮想フォルダー名" value={folderDraft} onChange={(event) => setFolderDraft(event.target.value)} />
            <button type="button" disabled={busy || selectedShelf === null} onClick={() => {
              if (selectedShelf === null) return;
              void runSnapshot(
                (requestGeneration) => createShelfFolder(
                  selectedShelf.id,
                  registrationParent,
                  folderDraft,
                  "folder",
                  requestGeneration,
                ),
                "仮想フォルダーを作成しました。",
              );
            }}>仮想フォルダー作成</button>
          </div>
          {draggedPaths.length > 0 && <p className="bookshelf-drop-target">ここへドロップして本棚へ登録</p>}
          <ul role="tree" aria-label="本棚ツリー">
            {flatNodes.map(({ node, depth }) => (
              <li key={node.id} role="treeitem" aria-level={depth + 1} aria-selected={selectedNodeId === node.id}>
                <button
                  type="button"
                  style={{ paddingInlineStart: `${depth * 16 + 4}px` }}
                  onClick={() => setSelectedNodeId(node.id)}
                  onDoubleClick={() => {
                    if (node.nodeType !== "item") return;
                    const requestGeneration = ++generation.current;
                    void openShelfItem(node.id, requestGeneration).then((response) => {
                      if (requestGeneration !== generation.current) return;
                      if (response.status === "ok") void onOpenPlan(response.data);
                      else setNotice(responseNotice(response));
                    });
                  }}
                >{iconGlyph(node.icon)} {node.name}</button>
              </li>
            ))}
          </ul>
          {selectedNode !== null && (
            <fieldset>
              <legend>選択項目</legend>
              <label>
                名前
                <input value={selectedNode.name} onChange={(event) => {
                  const value = event.target.value;
                  setSnapshot((current) => ({
                    ...current,
                    nodes: current.nodes.map((node) => node.id === selectedNode.id ? { ...node, name: value } : node),
                  }));
                }} />
              </label>
              <label>
                親フォルダー
                <select value={selectedNode.parentId ?? ""} onChange={(event) => {
                  const parentId = event.target.value === "" ? null : Number(event.target.value);
                  setSnapshot((current) => ({
                    ...current,
                    nodes: current.nodes.map((node) => node.id === selectedNode.id ? { ...node, parentId } : node),
                  }));
                }}>
                  <option value="">本棚直下</option>
                  {folderNodes.filter(({ node }) => node.id !== selectedNode.id).map(({ node }) => (
                    <option key={node.id} value={node.id}>{node.name}</option>
                  ))}
                </select>
              </label>
              <label>
                アイコン
                <select value={selectedNode.icon} onChange={(event) => {
                  const icon = event.target.value as ShelfIcon;
                  setSnapshot((current) => ({
                    ...current,
                    nodes: current.nodes.map((node) => node.id === selectedNode.id ? { ...node, icon } : node),
                  }));
                }}>
                  {ICONS.map((icon) => <option key={icon.value} value={icon.value}>{icon.label}</option>)}
                </select>
              </label>
              <div className="bookshelf-actions">
                <button type="button" disabled={busy} onClick={() => void runSnapshot(
                  (requestGeneration) => updateShelfNode(
                    selectedNode.id,
                    selectedNode.parentId,
                    selectedNode.name,
                    selectedNode.icon,
                    requestGeneration,
                  ),
                  "仮想階層を更新しました。",
                )}>変更を保存</button>
                <button type="button" disabled={busy} onClick={() => void moveNode(-1)}>上へ</button>
                <button type="button" disabled={busy} onClick={() => void moveNode(1)}>下へ</button>
                {selectedNode.nodeType === "item" && <button type="button" disabled={busy} onClick={() => {
                  const requestGeneration = ++generation.current;
                  void openShelfItem(selectedNode.id, requestGeneration).then((response) => {
                    if (requestGeneration !== generation.current) return;
                    if (response.status === "ok") void onOpenPlan(response.data);
                    else setNotice(responseNotice(response));
                  });
                }}>開く</button>}
                <button type="button" disabled={busy} onClick={async () => {
                  const requestGeneration = ++generation.current;
                  const response = await previewShelfNodeDelete(selectedNode.id, requestGeneration);
                  if (requestGeneration !== generation.current) return;
                  if (response.status !== "ok") {
                    setNotice(responseNotice(response));
                    return;
                  }
                  if (!window.confirm(`選択項目と子孫${response.data.totalNodeCount}件を本棚から除去しますか？実ファイルは変更しません。`)) return;
                  await runSnapshot(
                    (nextGeneration) => executeShelfNodeDelete(
                      selectedNode.id,
                      response.data.previewKey,
                      nextGeneration,
                    ),
                    "本棚から除去しました。実ファイルは変更していません。",
                  );
                }}>除去</button>
              </div>
            </fieldset>
          )}
          <button type="button" disabled={busy || selectedShelf === null} onClick={async () => {
            if (selectedShelf === null) return;
            const requestGeneration = ++generation.current;
            setBusy(true);
            try {
              const response = await previewShelfCleanup(selectedShelf.id, requestGeneration);
              if (requestGeneration !== generation.current) return;
              if (response.status !== "ok") {
                setNotice(responseNotice(response));
              } else if (response.data.missingNodeIds.length === 0) {
                setNotice(response.data.unavailableNodeIds.length === 0
                  ? "消失した登録はありません。"
                  : `一時的に確認できない登録が${response.data.unavailableNodeIds.length}件あります。自動除去しません。`);
              } else if (window.confirm(`見つからない登録${response.data.missingNodeIds.length}件を本棚から除去しますか？一時的に確認できない${response.data.unavailableNodeIds.length}件は残します。`)) {
                await runSnapshot(
                  (nextGeneration) => executeShelfCleanup(
                    selectedShelf.id,
                    response.data.missingNodeIds,
                    nextGeneration,
                  ),
                  "消失した登録を整理しました。",
                );
              }
            } finally {
              if (requestGeneration === generation.current) setBusy(false);
            }
          }}>消失登録を検査</button>
        </section>

        <section aria-label="本棚テキスト入出力" className="bookshelf-transfer">
          <h3>テキスト入出力</h3>
          <textarea
            aria-label="本棚JSON Lines"
            rows={10}
            value={textDocument}
            onChange={(event) => {
              setTextDocument(event.target.value);
              setImportPreview(null);
            }}
          />
          <label>
            <input type="checkbox" checked={replaceExisting} onChange={(event) => {
              setReplaceExisting(event.target.checked);
              setImportPreview(null);
            }} />
            同名本棚を明示的に置換
          </label>
          <div className="bookshelf-actions">
            <button type="button" disabled={busy || selectedShelf === null} onClick={() => void exportText()}>選択本棚を出力</button>
            <button type="button" disabled={textDocument.length === 0} onClick={downloadText}>ファイルへ保存</button>
            <button type="button" disabled={busy || textDocument.length === 0} onClick={() => void previewImport()}>importを検査</button>
            <button type="button" disabled={busy || importPreview === null} onClick={() => void executeImport()}>確認済みimportを実行</button>
          </div>
          {importPreview !== null && (
            <p>
              {importPreview.shelfCount}本棚・{importPreview.nodeCount}項目。
              同名: {importPreview.conflictingNames.join("、") || "なし"}
            </p>
          )}
        </section>
      </div>
    </aside>
  );
}
