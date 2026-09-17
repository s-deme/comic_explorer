import { useRef, useState } from "react";
import { listReadingHistory, clearReadingHistory, type ReadingHistoryEntry } from "../library/client";
import { presentError, presentUnexpectedError } from "../errors/presentation";

interface ReadingHistoryActions {
  onHistoryChange: (entries: ReadingHistoryEntry[]) => void;
  onOpenRecent: (itemIdentity: string) => Promise<void>;
}

export function useReadingHistory({ onHistoryChange, onOpenRecent }: ReadingHistoryActions) {
  const historyGeneration = useRef(0);
  const [readingHistory, setReadingHistory] = useState<ReadingHistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyNotice, setHistoryNotice] = useState<string | null>(null);

  async function refreshHistory(openMostRecent = false) {
    const requestGeneration = ++historyGeneration.current;
    setHistoryLoading(true);
    setHistoryNotice(null);
    try {
      const response = await listReadingHistory(requestGeneration);
      if (requestGeneration !== historyGeneration.current) return;
      if (response.status === "ok") {
        setReadingHistory(response.data);
        onHistoryChange(response.data);
        if (openMostRecent && response.data.length > 0) {
          await onOpenRecent(response.data[0].itemIdentity);
        }
      } else if (response.status === "error") {
        setHistoryNotice(presentError(response.error));
      }
    } catch {
      if (requestGeneration === historyGeneration.current) {
        setHistoryNotice(presentUnexpectedError());
      }
    } finally {
      if (requestGeneration === historyGeneration.current) {
        setHistoryLoading(false);
      }
    }
  }

  async function clearRecentHistory() {
    const requestGeneration = ++historyGeneration.current;
    setHistoryLoading(true);
    setHistoryNotice(null);
    try {
      const response = await clearReadingHistory(requestGeneration);
      if (requestGeneration !== historyGeneration.current) return;
      if (response.status === "ok") {
        setReadingHistory([]);
        onHistoryChange([]);
      } else if (response.status === "error") {
        setHistoryNotice(presentError(response.error));
      }
    } catch {
      if (requestGeneration === historyGeneration.current) setHistoryNotice(presentUnexpectedError());
    } finally {
      if (requestGeneration === historyGeneration.current) setHistoryLoading(false);
    }
  }

  return {
    readingHistory, historyOpen, setHistoryOpen, historyLoading, historyNotice,
    refreshHistory, clearRecentHistory,
  };
}
