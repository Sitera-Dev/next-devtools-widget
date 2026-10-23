import type { DevToolsEntry } from "../shared/types";

export const SSR_SCRIPT_ID = "__next_devtools_ssr__";

export function drainSsrTraces(emit: (entry: DevToolsEntry) => void): void {
  if (typeof document === "undefined") return;

  const el = document.getElementById(SSR_SCRIPT_ID);
  if (!el || !el.textContent) return;

  try {
    const traces = JSON.parse(el.textContent);
    if (Array.isArray(traces)) {
      for (const entry of traces) {
        if (entry && typeof entry === "object" && entry.id && entry.category) {
          emit(entry);
        }
      }
    }
  } catch {
    // Malformed JSON, ignore
  } finally {
    el.remove();
  }
}

/**
 * Attaches a MutationObserver to watch for any dynamically streamed SSR scripts
 * (e.g. from Suspense boundaries or streaming RSC chunks).
 */
export function setupSsrObserver(emit: (entry: DevToolsEntry) => void): () => void {
  if (typeof document === "undefined") {
    return () => {};
  }

  drainSsrTraces(emit);

  if (typeof MutationObserver === "undefined") {
    return () => {};
  }

  const observer = new MutationObserver(() => {
    if (document.getElementById(SSR_SCRIPT_ID)) {
      drainSsrTraces(emit);
    }
  });

  try {
    const target = document.documentElement || document.body;
    if (target) {
      observer.observe(target, {
        childList: true,
        subtree: true,
      });
    }
  } catch {
    // ignore
  }

  return () => {
    observer.disconnect();
  };
}
