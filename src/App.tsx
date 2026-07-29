import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { CatalogGrid } from "./features/catalog/CatalogGrid";
import {
  navigationReducer,
  parentPath,
} from "./features/navigation/navigation";
import {
  listFolder,
  openComic,
  registerLibraryRoot,
  restoreLibraryRoot,
  type ViewerSession,
} from "./features/library/client";
import { Viewer } from "./features/viewer/Viewer";
import type { CatalogEntry } from "./types/domain";

type LoadState =
  | { status: "idle" }
  | { status: "loading"; path: string }
  | { status: "error"; path: string; message: string }
  | { status: "ready" };

export function App() {
  const generation = useRef(0);
  const [rootInput, setRootInput] = useState("");
  const [libraryRoot, setLibraryRoot] = useState<string | null>(null);
  const [navigation, dispatch] = useReducer(navigationReducer, {
    current: "",
    back: [],
    forward: [],
  });
  const [addressInput, setAddressInput] = useState("");
  const [entries, setEntries] = useState<CatalogEntry[]>([]);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [sortDescending, setSortDescending] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [viewerSession, setViewerSession] = useState<ViewerSession | null>(null);

  useEffect(() => {
    generation.current += 1;
    const requestGeneration = generation.current;
    void restoreLibraryRoot(requestGeneration)
      .then(async (response) => {
        if (
          requestGeneration === generation.current &&
          response.status === "ok" &&
          response.data
        ) {
          setLibraryRoot(response.data.absolutePath);
          dispatch({ type: "reset", path: "" });
          await load("");
        }
      })
      .catch(() => undefined)
      .finally(() => setRestoring(false));
  }, []);

  const absoluteAddress = useMemo(() => {
    if (libraryRoot === null || navigation.current === "") {
      return libraryRoot ?? "";
    }
    return `${libraryRoot.replace(/[\\/]+$/, "")}\\${navigation.current.replaceAll("/", "\\")}`;
  }, [libraryRoot, navigation.current]);

  useEffect(() => setAddressInput(absoluteAddress), [absoluteAddress]);

  async function load(relativePath: string) {
    generation.current += 1;
    const requestGeneration = generation.current;
    setLoadState({ status: "loading", path: relativePath });
    setSelectedPath(null);
    try {
      const response = await listFolder(relativePath, requestGeneration);
      if (requestGeneration !== generation.current) return;
      if (response.status === "ok") {
        setEntries(
          sortDescending ? [...response.data].reverse() : response.data,
        );
        setLoadState({ status: "ready" });
      } else if (response.status === "error") {
        setLoadState({
          status: "error",
          path: relativePath,
          message: response.error.message,
        });
      }
    } catch (error) {
      if (requestGeneration === generation.current) {
        setLoadState({
          status: "error",
          path: relativePath,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  async function chooseRoot(event: React.FormEvent) {
    event.preventDefault();
    generation.current += 1;
    const response = await registerLibraryRoot(rootInput, generation.current);
    if (response.status === "ok") {
      setLibraryRoot(response.data.absolutePath);
      dispatch({ type: "reset", path: "" });
      await load("");
    } else if (response.status === "error") {
      setLoadState({ status: "error", path: rootInput, message: response.error.message });
    }
  }

  function navigate(path: string, history: "push" | "back" | "forward" = "push") {
    if (history === "push") dispatch({ type: "navigate", path });
    else dispatch({ type: history });
    void load(path);
  }

  if (libraryRoot === null) {
    return (
      <main className="setup-screen">
        <div className="setup-card">
          <h1>Comic Explorer</h1>
          <p>漫画を保存しているローカルフォルダを登録してください。</p>
          {restoring && <p role="status">保存した設定を確認しています。</p>}
          <form onSubmit={chooseRoot}>
            <label htmlFor="library-root">ライブラリルート</label>
            <div className="setup-row">
              <input
                id="library-root"
                value={rootInput}
                onChange={(event) => setRootInput(event.target.value)}
                placeholder="C:\Comics"
                required
              />
              <button type="submit">登録</button>
            </div>
          </form>
          {loadState.status === "error" && (
            <p role="alert">{loadState.message}</p>
          )}
        </div>
      </main>
    );
  }

  const selected = entries.find(
    (entry) => entry.relativePath === selectedPath,
  );
  const up = parentPath(navigation.current);

  if (viewerSession !== null) {
    return (
      <Viewer
        session={viewerSession}
        generation={generation.current}
        onClose={() => setViewerSession(null)}
        onNextItem={() => {
          const current = entries.findIndex(
            (entry) => entry.relativePath === viewerSession.itemKey,
          );
          const next = entries
            .slice(current + 1)
            .find(
              (entry) =>
                entry.kind === "comicFolder" || entry.kind === "archive",
            );
          if (next) {
            generation.current += 1;
            void openComic(next.relativePath, generation.current).then(
              (response) =>
                response.status === "ok" && setViewerSession(response.data),
            );
          }
        }}
      />
    );
  }

  return (
    <main className="app-shell">
      <nav className="menu-bar" aria-label="メニューバー">
        <button onClick={() => setLibraryRoot(null)}>ファイル</button>
        <button onClick={() => setSortDescending((value) => !value)}>表示</button>
        <button onClick={() => setHelpOpen(true)}>ヘルプ</button>
      </nav>
      <div className="toolbar" aria-label="ナビゲーション">
        <button
          disabled={navigation.back.length === 0}
          onClick={() => {
            const target = navigation.back.at(-1);
            if (target !== undefined) navigate(target, "back");
          }}
          title="戻る"
        >
          ←
        </button>
        <button
          disabled={navigation.forward.length === 0}
          onClick={() => {
            const target = navigation.forward[0];
            if (target !== undefined) navigate(target, "forward");
          }}
          title="進む"
        >
          →
        </button>
        <button
          disabled={up === null}
          onClick={() => up !== null && navigate(up)}
          title="上へ"
        >
          ↑
        </button>
        <label>
          並べ替え
          <select aria-label="並べ替え条件" defaultValue="name">
            <option value="name">名前</option>
            <option value="modified">更新日時</option>
            <option value="size">サイズ</option>
            <option value="kind">種類</option>
          </select>
        </label>
        <button
          onClick={() => {
            setSortDescending((value) => !value);
            setEntries((current) => [...current].reverse());
          }}
        >
          {sortDescending ? "降順 ▼" : "昇順 ▲"}
        </button>
      </div>
      <form
        className="address-bar"
        onSubmit={(event) => {
          event.preventDefault();
          const root = libraryRoot.replace(/[\\/]+$/, "");
          if (!addressInput.toLowerCase().startsWith(root.toLowerCase())) {
            setLoadState({
              status: "error",
              path: addressInput,
              message: "ライブラリルート外へは移動できません。",
            });
            return;
          }
          const relative = addressInput
            .slice(root.length)
            .replace(/^[\\/]+/, "")
            .replaceAll("\\", "/");
          navigate(relative);
        }}
      >
        <label htmlFor="address">アドレス</label>
        <input
          id="address"
          value={addressInput}
          onChange={(event) => setAddressInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setAddressInput(absoluteAddress);
          }}
        />
        <button type="submit">移動</button>
      </form>
      <div className="workspace">
        <aside className="folder-tree" aria-label="フォルダツリー">
          <button
            className="tree-node"
            aria-current={navigation.current === "" ? "page" : undefined}
            onClick={() => navigate("")}
          >
            ▾ {libraryRoot.split(/[\\/]/).at(-1)}
          </button>
          {navigation.current.split("/").filter(Boolean).map((segment, index, all) => (
            <button
              className="tree-node"
              style={{ paddingInlineStart: `${(index + 1) * 18 + 8}px` }}
              key={all.slice(0, index + 1).join("/")}
              aria-current={index === all.length - 1 ? "page" : undefined}
              onClick={() => navigate(all.slice(0, index + 1).join("/"))}
            >
              ▸ {segment}
            </button>
          ))}
        </aside>
        <section className="catalog-pane" aria-busy={loadState.status === "loading"}>
          {loadState.status === "loading" && (
            <p className="loading-state" role="status">
              読み込み中: {loadState.path || libraryRoot}
            </p>
          )}
          {loadState.status === "error" ? (
            <div className="error-panel" role="alert">
              <h2>読み込みに失敗しました</h2>
              <p>対象: {loadState.path}</p>
              <p>{loadState.message}</p>
              <button onClick={() => void load(navigation.current)}>再試行</button>
              {up !== null && <button onClick={() => navigate(up)}>親フォルダへ</button>}
            </div>
          ) : (
            <CatalogGrid
              entries={entries}
              selectedPath={selectedPath}
              onSelect={(entry) => setSelectedPath(entry.relativePath)}
              onNavigate={(entry) => navigate(entry.relativePath)}
              onRead={(entry) => {
                generation.current += 1;
                const requestGeneration = generation.current;
                setLoadState({ status: "loading", path: entry.relativePath });
                void openComic(entry.relativePath, requestGeneration).then(
                  (response) => {
                    if (response.status === "ok") {
                      setViewerSession(response.data);
                      setLoadState({ status: "ready" });
                    } else if (response.status === "error") {
                      setLoadState({
                        status: "error",
                        path: entry.relativePath,
                        message: response.error.message,
                      });
                    }
                  },
                );
              }}
            />
          )}
        </section>
      </div>
      <footer className="status-bar" aria-live="polite">
        <span>{entries.length}項目</span>
        <span>{selected ? `選択: ${selected.relativePath}` : "選択なし"}</span>
        <span>{loadState.status === "loading" ? "読み込み中" : "準備完了"}</span>
      </footer>
      {helpOpen && (
        <div className="dialog-backdrop">
          <div role="dialog" aria-modal="true" aria-labelledby="help-title" className="help-dialog">
            <h2 id="help-title">キー操作</h2>
            <p>Enter: フォルダを開く / Ctrl+Enter: 漫画として読む</p>
            <p>Esc: アドレス編集を戻す / 矢印: 項目を移動</p>
            <button autoFocus onClick={() => setHelpOpen(false)}>閉じる</button>
          </div>
        </div>
      )}
    </main>
  );
}
