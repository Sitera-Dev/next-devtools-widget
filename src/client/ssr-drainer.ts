import type { DevToolsEntry } from "../shared/types";

export const SSR_SCRIPT_ID = "__next_devtools_ssr__";

export function drainSsrTraces(emit: (entry: DevToolsEntry) => void): void {
  if (typeof document === "undefined") return;

  const elements: { textContent: string | null; remove: () => void }[] = [];

  if (typeof document.querySelectorAll === "function") {
    document
      .querySelectorAll(`#${SSR_SCRIPT_ID}, [data-next-devtools-ssr]`)
      .forEach((el) => elements.push(el as any));
  } else if (typeof document.getElementById === "function") {
    const el = document.getElementById(SSR_SCRIPT_ID);
    if (el) elements.push(el as any);
  }

  if (elements.length === 0) return;

  elements.forEach((el) => {
    try {
      const content = el.textContent;
      if (content) {
        const traces = JSON.parse(content);
        if (Array.isArray(traces)) {
          for (const entry of traces) {
            if (entry && typeof entry === "object" && entry.id && entry.category) {
              emit(entry);
            }
          }
        }
      }
    } catch {
      // Malformed JSON, ignore
    } finally {
      el.remove();
    }
  });
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

  const hasScript = () => {
    if (typeof document.querySelector === "function") {
      return !!document.querySelector(`#${SSR_SCRIPT_ID}, [data-next-devtools-ssr]`);
    }
    if (typeof document.getElementById === "function") {
      return !!document.getElementById(SSR_SCRIPT_ID);
    }
    return false;
  };

  const observer = new MutationObserver(() => {
    if (hasScript()) {
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
