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
                kind: "folder",
              },
              {
                relativePath: "Other" as never,
                kind: "folder",
              },
            ]
          : path === "Other"
            ? [
                {
                  relativePath: "Other/Child" as never,
                  kind: "folder",
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
});
