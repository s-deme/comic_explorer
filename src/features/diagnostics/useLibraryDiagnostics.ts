import { useRef, useState } from "react";

import {
  cancelLibraryDiagnostics,
  diagnoseLibrary,
  type DiagnosticReport,
} from "../library/client";
import { presentError, presentUnexpectedError } from "../errors/presentation";

export interface LibraryDiagnosticsAdapter {
  diagnoseLibrary: typeof diagnoseLibrary;
  cancelLibraryDiagnostics: typeof cancelLibraryDiagnostics;
}

const nativeAdapter: LibraryDiagnosticsAdapter = {
  diagnoseLibrary,
  cancelLibraryDiagnostics,
};

/** Keeps stale native diagnostic responses from replacing the current report. */
export function useLibraryDiagnostics(adapter: LibraryDiagnosticsAdapter = nativeAdapter) {
  const generation = useRef(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function run(retry = false) {
    const requestGeneration = ++generation.current;
    const baseline = report?.snapshot ?? null;
    setOpen(true);
    setLoading(true);
    setNotice(null);
    try {
      const response = await adapter.diagnoseLibrary(baseline, requestGeneration, retry);
      if (requestGeneration !== generation.current) return;
      if (response.status === "ok") {
        setReport(response.data);
      } else if (response.status === "cancelled") {
        setNotice("ライブラリ診断をキャンセルしました。");
      } else {
        setNotice(presentError(response.error));
      }
    } catch {
      if (requestGeneration === generation.current) setNotice(presentUnexpectedError());
    } finally {
      if (requestGeneration === generation.current) setLoading(false);
    }
  }

  function cancel() {
    void adapter.cancelLibraryDiagnostics(generation.current).catch(() => undefined);
  }

  function reset() {
    setReport(null);
    setNotice(null);
  }

  function close() {
    setOpen(false);
    setNotice(null);
  }

  return {
    diagnosticsOpen: open,
    diagnosticsLoading: loading,
    diagnosticReport: report,
    diagnosticNotice: notice,
    runDiagnostics: run,
    cancelDiagnostics: cancel,
    resetDiagnostics: reset,
    closeDiagnostics: close,
  };
}
