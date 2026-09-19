import { useRef, useState } from "react";
import * as client from "../library/client";
import { presentError, presentUnexpectedError } from "../errors/presentation";
import type { ItemMetadata } from "../library/client";

type Api = Pick<typeof client, "getItemMetadata" | "saveItemMemo" | "setItemRating">;

export function useItemMetadata(api: Api = client) {
  const metadataGeneration = useRef(0);
  const ratingSaveGeneration = useRef(0);
  const ratingSaveInFlight = useRef(false);
  const [itemMetadata, setItemMetadata] = useState<ItemMetadata | null>(null);
  const [memoDraft, setMemoDraft] = useState("");
  const [memoSaveState, setMemoSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [ratingSaveState, setRatingSaveState] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [metadataNotice, setMetadataNotice] = useState<string | null>(null);

  async function loadItemMetadata(itemIdentity: string) {
    const requestGeneration = ++metadataGeneration.current;
    ratingSaveGeneration.current += 1;
    ratingSaveInFlight.current = false;
    setItemMetadata(null);
    setMemoDraft("");
    setMemoSaveState("idle");
    setRatingSaveState("idle");
    setMetadataLoading(true);
    setMetadataNotice(null);
    try {
      const response = await api.getItemMetadata(itemIdentity, requestGeneration);
      if (requestGeneration !== metadataGeneration.current) return;
      if (response.status === "ok") {
        setItemMetadata(response.data);
        setMemoDraft(response.data.memo ?? "");
      } else if (response.status === "error") {
        setMetadataNotice(presentError(response.error));
      }
    } catch {
      if (requestGeneration === metadataGeneration.current) {
        setMetadataNotice(presentUnexpectedError());
      }
    } finally {
      if (requestGeneration === metadataGeneration.current) {
        setMetadataLoading(false);
      }
    }
  }

  async function persistMemo(body: string) {
    if (itemMetadata === null) return;
    const requestGeneration = metadataGeneration.current;
    setMetadataLoading(true);
    setMetadataNotice(null);
    setMemoSaveState("saving");
    try {
      const response = await api.saveItemMemo(
        itemMetadata.itemIdentity,
        body,
        requestGeneration,
      );
      if (requestGeneration !== metadataGeneration.current) return;
      if (response.status === "ok") {
        setItemMetadata(response.data);
        setMemoDraft(response.data.memo ?? "");
        setMemoSaveState("saved");
      } else if (response.status === "error") {
        setMetadataNotice(presentError(response.error));
        setMemoSaveState("error");
      }
    } catch {
      if (requestGeneration === metadataGeneration.current) {
        setMetadataNotice(presentUnexpectedError());
        setMemoSaveState("error");
      }
    } finally {
      if (requestGeneration === metadataGeneration.current) {
        setMetadataLoading(false);
      }
    }
  }

  async function persistRating(rating: number | null) {
    if (itemMetadata === null || ratingSaveInFlight.current) return;
    const metadataRequestGeneration = metadataGeneration.current;
    const requestGeneration = ++ratingSaveGeneration.current;
    ratingSaveInFlight.current = true;
    setMetadataLoading(true);
    setMetadataNotice(null);
    setRatingSaveState("saving");
    try {
      const response = await api.setItemRating(
        itemMetadata.itemIdentity,
        rating,
        metadataRequestGeneration,
      );
      if (
        metadataRequestGeneration !== metadataGeneration.current ||
        requestGeneration !== ratingSaveGeneration.current
      ) {
        return;
      }
      if (response.status === "ok") {
        setItemMetadata(response.data);
        setRatingSaveState("saved");
      } else if (response.status === "error") {
        setMetadataNotice(presentError(response.error));
        setRatingSaveState("error");
      } else {
        setRatingSaveState("idle");
      }
    } catch {
      if (
        metadataRequestGeneration === metadataGeneration.current &&
        requestGeneration === ratingSaveGeneration.current
      ) {
        setMetadataNotice(presentUnexpectedError());
        setRatingSaveState("error");
      }
    } finally {
      if (
        metadataRequestGeneration === metadataGeneration.current &&
        requestGeneration === ratingSaveGeneration.current
      ) {
        ratingSaveInFlight.current = false;
        setMetadataLoading(false);
      }
    }
  }

  function resetItemMetadata() {
    metadataGeneration.current += 1;
    ratingSaveGeneration.current += 1;
    ratingSaveInFlight.current = false;
    setItemMetadata(null);
    setMemoDraft("");
    setMemoSaveState("idle");
    setRatingSaveState("idle");
    setMetadataNotice(null);
  }

  return {
    itemMetadata, memoDraft, setMemoDraft, memoSaveState,
    setMemoSaveState, ratingSaveState, metadataLoading, metadataNotice,
    loadItemMetadata, persistMemo, persistRating, resetItemMetadata,
  };
}
