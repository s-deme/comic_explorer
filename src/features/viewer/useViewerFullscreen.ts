import { useEffect, useRef, useState } from "react";
import type { FullscreenAdapter } from "./fullscreen";

export function useViewerFullscreen({
  fullscreenAdapter,
  initialFullscreen,
  preventDisplaySleepFullscreen,
  preserveWindowStateOnUnmount,
}: {
  fullscreenAdapter: FullscreenAdapter;
  initialFullscreen: boolean;
  preventDisplaySleepFullscreen: boolean;
  preserveWindowStateOnUnmount: boolean;
}) {
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState<string | null>(null);
  const initialFullscreenRequested = useRef(false);
  const displayAwakeHeldRef = useRef(false);
  const fullscreenRef = useRef(false);
  const fullscreenRequestRef = useRef(0);
  const lifecycleMountedRef = useRef(true);
  async function requestFullscreen(next: boolean): Promise<boolean> {
    fullscreenRequestRef.current += 1;
    setFullscreenError(null);
    try {
      if (next) {
        await fullscreenAdapter.enter();
        if (!lifecycleMountedRef.current) {
          if (!preserveWindowStateOnUnmount) await fullscreenAdapter.exit().catch(() => undefined);
          return false;
        }
        if (preventDisplaySleepFullscreen) {
          try {
            if (fullscreenAdapter.setDisplayAwake === undefined) {
              throw new Error("display awake control unavailable");
            }
            await fullscreenAdapter.setDisplayAwake(true);
            displayAwakeHeldRef.current = true;
            if (!lifecycleMountedRef.current) {
              await fullscreenAdapter.setDisplayAwake(false).catch(() => undefined);
              displayAwakeHeldRef.current = false;
              if (!preserveWindowStateOnUnmount) await fullscreenAdapter.exit().catch(() => undefined);
              return false;
            }
          } catch (error) {
            await fullscreenAdapter.exit().catch(() => undefined);
            throw error;
          }
        }
      } else {
        const hadDisplayRequest = displayAwakeHeldRef.current;
        if (hadDisplayRequest) {
          await fullscreenAdapter.setDisplayAwake?.(false);
          displayAwakeHeldRef.current = false;
        }
        try {
          await fullscreenAdapter.exit();
        } catch (error) {
          if (hadDisplayRequest) {
            await fullscreenAdapter.setDisplayAwake?.(true);
            displayAwakeHeldRef.current = true;
          }
          throw error;
        }
      }
      fullscreenRef.current = next;
      setFullscreen(next);
      return true;
    } catch {
      if (lifecycleMountedRef.current) {
        setFullscreenError("全画面表示を切り替えられません。もう一度お試しください。");
      }
      return false;
    }
  }
  useEffect(() => {
    let mounted = true;
    lifecycleMountedRef.current = true;
    const request = fullscreenRequestRef.current;
    void fullscreenAdapter
      .isFullscreen()
      .then((current) => {
        if (mounted && request === fullscreenRequestRef.current) {
          fullscreenRef.current = current;
          setFullscreen(current);
          if (current && preventDisplaySleepFullscreen) void requestFullscreen(true);
        }
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
      lifecycleMountedRef.current = false;
      void (async () => {
        if (displayAwakeHeldRef.current) {
          displayAwakeHeldRef.current = false;
          if (fullscreenAdapter.setDisplayAwake !== undefined) {
            await fullscreenAdapter.setDisplayAwake(false).catch(() => undefined);
          }
        }
        // A dedicated Viewer window outlives each book's React component.
        if (fullscreenRef.current && !preserveWindowStateOnUnmount) {
          fullscreenRef.current = false;
          await fullscreenAdapter.exit().catch(() => undefined);
        }
      })();
    };
  }, [fullscreenAdapter, preventDisplaySleepFullscreen, preserveWindowStateOnUnmount]);
  useEffect(() => {
    if (!initialFullscreen || initialFullscreenRequested.current) return;
    initialFullscreenRequested.current = true;
    void requestFullscreen(true);
  }, [initialFullscreen]);

  return { fullscreen, fullscreenError, requestFullscreen };
}
