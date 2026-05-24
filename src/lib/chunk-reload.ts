// Recover from stale dynamic chunks after a deploy. If a dynamic import fails
// (vendor chunk gone), reload once. Guarded by sessionStorage so a true
// network/code failure surfaces in the ErrorBoundary on the second pass
// instead of looping.

const KEY = "chunk-reload";

function isChunkError(message: unknown): boolean {
  if (typeof message !== "string") return false;
  return (
    message.includes("Loading chunk") ||
    message.includes("Failed to fetch dynamically imported module") ||
    message.includes("Importing a module script failed") ||
    message.includes("error loading dynamically imported module")
  );
}

function tryReloadOnce() {
  try {
    if (sessionStorage.getItem(KEY)) return;
    sessionStorage.setItem(KEY, "1");
    window.location.reload();
  } catch {
    window.location.reload();
  }
}

export function installChunkReloadHandler() {
  if (typeof window === "undefined") return;

  // Clear the guard once the new build successfully renders.
  window.setTimeout(() => {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }, 10_000);

  window.addEventListener("error", (event) => {
    const msg =
      (event as ErrorEvent).message ??
      ((event as ErrorEvent).error as Error | undefined)?.message;
    if (isChunkError(msg)) tryReloadOnce();
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason = (event as PromiseRejectionEvent).reason;
    const msg = reason instanceof Error ? reason.message : String(reason ?? "");
    if (isChunkError(msg)) tryReloadOnce();
  });
}