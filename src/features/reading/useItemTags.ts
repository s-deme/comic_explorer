import { useEffect, useRef, useState } from "react";
import * as client from "../library/client";
import { presentError, presentUnexpectedError } from "../errors/presentation";
import type { ItemTags, TagEntry } from "../library/client";
import type { ApiResponse } from "../../types/api";

type Api = Pick<typeof client, "assignTag" | "getItemTags" | "listTags" | "queryTags" | "removeTag" | "renameTag">;

export function useItemTags(selectedPath: string | null, api: Api = client) {
  const tagGeneration = useRef(0);
  const itemTagGeneration = useRef(0);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [tagQuery, setTagQuery] = useState("");
  const [tagResults, setTagResults] = useState<TagEntry[]>([]);
  const [selectedTags, setSelectedTags] = useState<TagEntry[]>([]);
  const [tagNameDraft, setTagNameDraft] = useState("");
  const [tagRenameDrafts, setTagRenameDrafts] = useState<Record<string, string>>({});
  const [tagNotice, setTagNotice] = useState<string | null>(null);

  async function refreshItemTags(itemIdentity: string) {
    const requestGeneration = ++itemTagGeneration.current;
    setTagNotice(null);
    try {
      const response = await api.getItemTags(itemIdentity, requestGeneration);
      if (requestGeneration !== itemTagGeneration.current) return;
      if (response.status === "ok") {
        setSelectedTags(response.data.tags);
      } else if (response.status === "error") {
        setTagNotice(presentError(response.error));
      }
    } catch {
      if (requestGeneration === itemTagGeneration.current) {
        setTagNotice(presentUnexpectedError());
      }
    }
  }

  async function refreshTags(query = tagQuery) {
    const requestGeneration = ++tagGeneration.current;
    setTagsLoading(true);
    setTagNotice(null);
    try {
      const response =
        query.trim() === ""
          ? await api.listTags(requestGeneration)
          : await api.queryTags(query, requestGeneration);
      if (requestGeneration !== tagGeneration.current) return;
      if (response.status === "ok") {
        setTagResults(response.data);
        setTagRenameDrafts((current) => {
          const next = { ...current };
          for (const tag of response.data) {
            if (next[tag.tagId] === undefined) next[tag.tagId] = tag.name;
          }
          return next;
        });
      } else if (response.status === "error") {
        setTagNotice(presentError(response.error));
      }
    } catch {
      if (requestGeneration === tagGeneration.current) {
        setTagNotice(presentUnexpectedError());
      }
    } finally {
      if (requestGeneration === tagGeneration.current) {
        setTagsLoading(false);
      }
    }
  }

  function openTagsPanel() {
    setTagsOpen(true);
    setTagNotice(null);
    void refreshTags("");
    if (selectedPath !== null) void refreshItemTags(selectedPath);
  }

  function closeTagsPanel() {
    setTagsOpen(false);
    setTagNotice(null);
  }

  async function updateSelectedTags(
    operation: (path: string, generation: number) => Promise<ApiResponse<ItemTags>>,
    clearNameDraft = false,
  ) {
    if (selectedPath === null) return;
    const requestGeneration = ++itemTagGeneration.current;
    setTagsLoading(true);
    setTagNotice(null);
    try {
      const response = await operation(selectedPath, requestGeneration);
      if (requestGeneration !== itemTagGeneration.current) return;
      if (response.status === "ok") {
        setSelectedTags(response.data.tags);
        if (clearNameDraft) setTagNameDraft("");
        await refreshTags(tagQuery);
      } else if (response.status === "error") {
        setTagNotice(presentError(response.error));
      }
    } catch {
      if (requestGeneration === itemTagGeneration.current) {
        setTagNotice(presentUnexpectedError());
      }
    } finally {
      if (requestGeneration === itemTagGeneration.current) {
        setTagsLoading(false);
      }
    }
  }

  function assignTagToSelected() {
    return updateSelectedTags((path, generation) => api.assignTag(path, tagNameDraft, generation), true);
  }

  function removeTagFromSelected(tag: TagEntry) {
    return updateSelectedTags((path, generation) => api.removeTag(path, tag.tagId, generation));
  }

  async function renameTagEntry(tag: TagEntry) {
    const newName = tagRenameDrafts[tag.tagId] ?? tag.name;
    const requestGeneration = ++tagGeneration.current;
    setTagsLoading(true);
    setTagNotice(null);
    try {
      const response = await api.renameTag(tag.tagId, newName, requestGeneration);
      if (requestGeneration !== tagGeneration.current) return;
      if (response.status === "ok") {
        setTagRenameDrafts((current) => ({
          ...current,
          [response.data.tagId]: response.data.name,
        }));
        await refreshTags(tagQuery);
        if (selectedPath !== null) await refreshItemTags(selectedPath);
      } else if (response.status === "error") {
        setTagNotice(presentError(response.error));
      }
    } catch {
      if (requestGeneration === tagGeneration.current) {
        setTagNotice(presentUnexpectedError());
      }
    } finally {
      if (requestGeneration === tagGeneration.current) {
        setTagsLoading(false);
      }
    }
  }

  useEffect(() => {
    if (!tagsOpen) return;
    if (selectedPath === null) {
      setSelectedTags([]);
      return;
    }
    void refreshItemTags(selectedPath);
  }, [selectedPath, tagsOpen]);

  return {
    tagsOpen, tagsLoading, tagQuery, setTagQuery,
    tagResults, selectedTags, tagNameDraft, setTagNameDraft,
    tagRenameDrafts, setTagRenameDrafts, tagNotice, refreshTags,
    openTagsPanel, closeTagsPanel, assignTagToSelected, removeTagFromSelected,
    renameTagEntry,
  };
}
