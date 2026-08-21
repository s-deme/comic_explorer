import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listTreeChildren, listWindowsDrives } from "../library/client";
import { FolderTree } from "./FolderTree";

vi.mock("../library/client", () => ({ listTreeChildren: vi.fn(), listWindowsDrives: vi.fn() }));
const listMock = vi.mocked(listTreeChildren);
const driveMock = vi.mocked(listWindowsDrives);

describe("FolderTree", () => {
  afterEach(cleanup);

  beforeEach(() => {
    listMock.mockReset();
    driveMock.mockReset();
    driveMock.mockResolvedValue({
      status: "ok",
      requestId: "drives" as never,
      generation: 1 as never,
      data: [
        { absolutePath: "C:\\", name: "ローカル ディスク (C:)" },
        { absolutePath: "E:\\", name: "ボリューム (E:)" },
      ],
    });
    listMock.mockImplementation(async (path) => ({
      status: "ok",
      requestId: `tree-${path}` as never,
      generation: 1 as never,
      data:
        path === ""
          ? [
              {
                relativePath: "Selected" as never,
                hasChildren: false,
              },
              {
                relativePath: "Other" as never,
                hasChildren: true,
              },
            ]
          : path === "Other"
            ? [
                {
                  relativePath: "Other/Child" as never,
                  hasChildren: false,
                },
              ]
            : [],
    }));
  });

  it("expands an unselected branch and navigates to its child", async () => {
    const onNavigate = vi.fn();
    render(
      <FolderTree
        libraryRoot="C:\\"
        currentPath="Selected"
        onNavigate={onNavigate}
        onSelectDrive={() => undefined}
      />,
    );

    const expander = await screen.findByRole("button", {
      name: "Otherを展開する",
    });
    fireEvent.click(expander);

    const child = await screen.findByRole("treeitem", { name: "Child" });
    fireEvent.click(child);
    expect(onNavigate).toHaveBeenCalledWith("Other/Child");
  });

  it("shows the current absolute folder at the top", async () => {
    render(
      <FolderTree
        libraryRoot="C:\\"
        currentPath="Selected/Chapter"
        onNavigate={() => undefined}
        onSelectDrive={() => undefined}
      />,
    );

    expect(screen.getByText("現在のフォルダー")).toBeInTheDocument();
    expect(screen.getByText("C:\\Selected\\Chapter")).toHaveAttribute(
      "title",
      "C:\\Selected\\Chapter",
    );
  });

  it("keeps a user-expanded branch open across navigation and temporary hiding", async () => {
    const { rerender } = render(
      <FolderTree
        libraryRoot="C:\\"
        currentPath="Selected"
        onNavigate={() => undefined}
        onSelectDrive={() => undefined}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Otherを展開する" }));
    expect(await screen.findByRole("treeitem", { name: "Child" })).toBeInTheDocument();

    rerender(
      <FolderTree
        libraryRoot="C:\\"
        currentPath=""
        hidden
        onNavigate={() => undefined}
        onSelectDrive={() => undefined}
      />,
    );
    expect(screen.queryByRole("complementary", { name: "フォルダツリー" }))
      .not.toBeInTheDocument();

    rerender(
      <FolderTree
        libraryRoot="C:\\"
        currentPath=""
        onNavigate={() => undefined}
        onSelectDrive={() => undefined}
      />,
    );
    expect(screen.getByRole("treeitem", { name: "Child" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Otherを折りたたむ" }))
      .toHaveAttribute("aria-expanded", "true");
  });

  it("REQ-LEY-P3-006 disables leaf expansion and auto-collapses a different branch", async () => {
    const { rerender } = render(
      <FolderTree
        libraryRoot="C:\\"
        currentPath="Selected"
        autoCollapse
        onNavigate={() => undefined}
        onSelectDrive={() => undefined}
      />,
    );
    expect(await screen.findByRole("button", { name: "Selectedを展開する" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Otherを展開する" }));
    expect(await screen.findByRole("treeitem", { name: "Child" })).toBeInTheDocument();

    rerender(
      <FolderTree
        libraryRoot="C:\\"
        currentPath="Selected/Chapter"
        autoCollapse
        onNavigate={() => undefined}
        onSelectDrive={() => undefined}
      />,
    );
    await waitFor(() => expect(screen.queryByRole("treeitem", { name: "Child" }))
      .not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Otherを展開する" }))
      .toHaveAttribute("aria-expanded", "false");
  });

  it("collapses every drive and folder only through the explicit action", async () => {
    render(
      <FolderTree
        libraryRoot="C:\\"
        currentPath="Selected"
        onNavigate={() => undefined}
        onSelectDrive={() => undefined}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Otherを展開する" }));
    expect(await screen.findByRole("treeitem", { name: "Child" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "ツリーをすべて閉じる" }));

    expect(screen.queryByRole("treeitem", { name: "Child" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /ローカル ディスク.*を展開する/ }))
      .toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("treeitem", { name: "PC" })).toBeInTheDocument();
  });

  it("keeps loaded branches open when switching away from and back to a drive", async () => {
    const onSelectDrive = vi.fn();
    const { rerender } = render(
      <FolderTree
        libraryRoot="C:\\"
        currentPath="Selected"
        onNavigate={() => undefined}
        onSelectDrive={onSelectDrive}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Otherを展開する" }));
    expect(await screen.findByRole("treeitem", { name: "Child" })).toBeInTheDocument();
    const childLoads = () => listMock.mock.calls.filter(([path]) => path === "Other").length;
    expect(childLoads()).toBe(1);

    rerender(
      <FolderTree
        libraryRoot="E:\\"
        currentPath=""
        onNavigate={() => undefined}
        onSelectDrive={onSelectDrive}
      />,
    );
    expect(await screen.findByText("E:\\")).toBeInTheDocument();
    expect(screen.getByRole("treeitem", { name: "Child" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("treeitem", { name: "Child" }));
    expect(onSelectDrive).toHaveBeenCalledWith("C:\\", "Other/Child");

    rerender(
      <FolderTree
        libraryRoot="C:\\"
        currentPath="Selected"
        onNavigate={() => undefined}
        onSelectDrive={onSelectDrive}
      />,
    );
    expect(screen.getByRole("treeitem", { name: "Child" })).toBeInTheDocument();
    expect(childLoads()).toBe(1);
  });

  it("keeps a branch-local error without removing other nodes", async () => {
    listMock.mockImplementation(async (path) =>
      path === "Other"
        ? {
            status: "error",
            requestId: "tree-error" as never,
            generation: 1 as never,
            error: {
              code: "ACCESS_DENIED",
              message: "アクセスできません。",
              retryable: true,
            },
          }
        : {
            status: "ok",
            requestId: "tree-root" as never,
            generation: 1 as never,
            data: [
              { relativePath: "Other" as never, kind: "folder" },
              { relativePath: "Available" as never, kind: "folder" },
            ],
          },
    );
    render(
      <FolderTree
        libraryRoot="C:\\"
        currentPath=""
        onNavigate={() => undefined}
        onSelectDrive={() => undefined}
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Otherを展開する" }),
    );

    await waitFor(() =>
      expect(
        screen.getByTitle(
          "アクセスできません。権限または他のアプリによる使用状況を確認してください。",
        ),
      ).toBeInTheDocument(),
    );
    expect(screen.getByRole("treeitem", { name: "Available" })).toBeInTheDocument();
  });

  it("re-enumerates visible branches after a file operation", async () => {
    let rootFolders = [
      { relativePath: "Selected" as never, kind: "folder" as const },
      { relativePath: "Removed" as never, kind: "folder" as const },
    ];
    listMock.mockImplementation(async (path) => ({
      status: "ok",
      requestId: `tree-${path}` as never,
      generation: 1 as never,
      data: path === "" ? rootFolders : [],
    }));
    const { rerender } = render(
      <FolderTree
        libraryRoot="C:\\"
        currentPath="Selected"
        refreshToken={0}
        onNavigate={() => undefined}
        onSelectDrive={() => undefined}
      />,
    );
    expect(await screen.findByRole("treeitem", { name: "Removed" })).toBeInTheDocument();

    rootFolders = [{ relativePath: "Selected" as never, kind: "folder" as const }];
    rerender(
      <FolderTree
        libraryRoot="C:\\"
        currentPath="Selected"
        refreshToken={1}
        onNavigate={() => undefined}
        onSelectDrive={() => undefined}
      />,
    );

    await waitFor(() => expect(screen.queryByRole("treeitem", { name: "Removed" }))
      .not.toBeInTheDocument());
    expect(listMock.mock.calls.filter(([path]) => path === "").length).toBeGreaterThanOrEqual(2);
  });

  it("shows PC drives and switches drives from the sidebar", async () => {
    const onSelectDrive = vi.fn();
    render(
      <FolderTree
        libraryRoot={null}
        currentPath=""
        onNavigate={() => undefined}
        onSelectDrive={onSelectDrive}
      />,
    );

    expect(await screen.findByRole("treeitem", { name: /ローカル ディスク \(C:\)/ }))
      .toBeInTheDocument();
    fireEvent.click(screen.getByRole("treeitem", { name: /ボリューム \(E:\)/ }));
    expect(onSelectDrive).toHaveBeenCalledWith("E:\\");
  });

  it("uses compact virtual rows and one expander-width indentation step", async () => {
    render(
      <FolderTree
        libraryRoot={null}
        currentPath=""
        onNavigate={() => undefined}
        onSelectDrive={() => undefined}
      />,
    );

    await screen.findByRole("treeitem", { name: /ローカル ディスク \(C:\)/ });
    const rows = document.querySelectorAll(".tree-row");
    expect(rows[0]).toHaveStyle({
      transform: "translateY(0px)",
      paddingInlineStart: "0px",
    });
    expect(rows[1]).toHaveStyle({
      transform: "translateY(24px)",
      paddingInlineStart: "16px",
    });
  });

  it("opens file operations from right click and keyboard on folder nodes", async () => {
    const onFileAction = vi.fn();
    const onRefreshFileClipboard = vi.fn();
    render(
      <FolderTree
        libraryRoot="C:\\"
        currentPath="Selected"
        clipboard={{ available: true, cut: false, items: 2 }}
        onNavigate={() => undefined}
        onSelectDrive={() => undefined}
        onFileAction={onFileAction}
        onRefreshFileClipboard={onRefreshFileClipboard}
      />,
    );

    const folder = await screen.findByRole("treeitem", { name: "Other" });
    fireEvent.contextMenu(folder, { clientX: 80, clientY: 60 });
    const menu = screen.getByRole("menu", { name: "フォルダツリーの操作" });
    expect(onRefreshFileClipboard).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("menuitem", { name: /切り取り.*Ctrl\+X/ })).toBeEnabled();
    expect(screen.getByRole("menuitem", { name: /コピー.*Ctrl\+C/ })).toBeEnabled();
    expect(screen.getByRole("menuitem", { name: /貼り付け（2件）.*Ctrl\+V/ })).toBeEnabled();
    expect(screen.getByRole("menuitem", { name: /削除.*Del/ })).toBeEnabled();
    fireEvent.click(screen.getByRole("menuitem", { name: /コピー.*Ctrl\+C/ }));
    expect(onFileAction).toHaveBeenCalledWith("copy", {
      driveRoot: "C:\\",
      relativePath: "Other",
      kind: "folder",
      name: "Other",
    });

    fireEvent.keyDown(folder, { key: "F10", shiftKey: true });
    expect(screen.getByRole("menu", { name: "フォルダツリーの操作" })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole("menu", { name: "フォルダツリーの操作" }), {
      key: "Escape",
    });
    fireEvent.keyDown(folder, { key: "x", ctrlKey: true });
    fireEvent.keyDown(folder, { key: "c", ctrlKey: true });
    fireEvent.keyDown(folder, { key: "v", ctrlKey: true });
    fireEvent.keyDown(folder, { key: "Delete" });
    expect(onFileAction.mock.calls.slice(-4).map(([action]) => action))
      .toEqual(["cut", "copy", "paste", "recycle"]);
  });

  it("accepts dragged catalog items on same-drive folders", async () => {
    const onMoveItems = vi.fn();
    const onFileDragStart = vi.fn();
    render(
      <FolderTree
        libraryRoot="C:\\"
        currentPath="Selected"
        onNavigate={() => undefined}
        onSelectDrive={() => undefined}
        canDropFiles
        onMoveItems={onMoveItems}
        onFileDragStart={onFileDragStart}
      />,
    );
    const source = await screen.findByRole("treeitem", { name: "Selected" });
    const folder = await screen.findByRole("treeitem", { name: "Other" });
    const dataTransfer = {
      effectAllowed: "none",
      dropEffect: "none",
      setData: vi.fn(),
    };

    expect(source).toHaveAttribute("draggable", "true");
    fireEvent.dragStart(source, { dataTransfer });
    expect(onFileDragStart).toHaveBeenCalledWith(["Selected"]);
    expect(dataTransfer.setData).toHaveBeenCalledWith("text/plain", "Selected");
    fireEvent.dragEnter(folder, { dataTransfer });
    expect(folder).toHaveAttribute("data-file-drop-active", "true");
    fireEvent.dragOver(folder, { dataTransfer });
    fireEvent.drop(folder, { dataTransfer });

    expect(onMoveItems).toHaveBeenCalledWith({
      driveRoot: "C:\\",
      relativePath: "Other",
      kind: "folder",
      name: "Other",
    });
  });

  it("allows paste but not cut or copy on drive nodes", async () => {
    const onFileAction = vi.fn();
    render(
      <FolderTree
        libraryRoot="C:\\"
        currentPath=""
        clipboard={{ available: true, cut: true, items: 1 }}
        onNavigate={() => undefined}
        onSelectDrive={() => undefined}
        onFileAction={onFileAction}
      />,
    );

    const drive = await screen.findByRole("treeitem", { name: /ボリューム \(E:\)/ });
    fireEvent.contextMenu(drive);
    expect(screen.getByRole("menuitem", { name: /切り取り/ }))
      .toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("menuitem", { name: /コピー/ }))
      .toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("menuitem", { name: /削除/ }))
      .toHaveAttribute("aria-disabled", "true");
    fireEvent.click(screen.getByRole("menuitem", { name: /貼り付け（1件）/ }));
    expect(onFileAction).toHaveBeenCalledWith("paste", {
      driveRoot: "E:\\",
      relativePath: "",
      kind: "drive",
      name: "ボリューム (E:)",
    });
  });
});
