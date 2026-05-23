import { useEffect, useState } from "react";

function isPreviewContext() {
  if (typeof window === "undefined") return true;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  const host = window.location.hostname;
  return (
    host.includes("lovable.app") ||
    host.includes("lovableproject.com") ||
    host.includes("id-preview--") ||
    host === "localhost" ||
    host === "127.0.0.1"
  );
}

export function SwRegister() {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // Em preview/iframe: desregistrar qualquer SW existente e não registrar nada.
    if (isPreviewContext()) {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => r.unregister());
      }).catch(() => {});
      return;
    }

    let intervalId: ReturnType<typeof setInterval> | undefined;

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        intervalId = setInterval(() => {
          registration.update().catch(() => {});
        }, 60_000);

        const trackWorker = (worker: ServiceWorker | null) => {
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (
              worker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              setUpdateReady(true);
            }
          });
        };

        if (registration.waiting && navigator.serviceWorker.controller) {
          setUpdateReady(true);
        }

        registration.addEventListener("updatefound", () => {
          trackWorker(registration.installing);
        });
      })
      .catch(() => {});

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, []);

  if (!updateReady) return null;

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 40,
        background: "#6C47FF",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        fontSize: 14,
        fontWeight: 500,
        zIndex: 9999,
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
      }}
    >
      <span>Nova versão disponível!</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          background: "#fff",
          color: "#6C47FF",
          border: "none",
          borderRadius: 6,
          padding: "4px 12px",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Atualizar agora
      </button>
    </div>
  );
}