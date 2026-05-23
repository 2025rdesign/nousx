import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
    },
  });

  if (typeof window !== "undefined") {
    // Persist React Query cache to localStorage so chat history shows instantly.
    // Lazy import to avoid SSR bundle pulling in browser-only code at module scope.
    void (async () => {
      try {
        const [{ persistQueryClient }, { createSyncStoragePersister }] =
          await Promise.all([
            import("@tanstack/react-query-persist-client"),
            import("@tanstack/query-sync-storage-persister"),
          ]);
        const persister = createSyncStoragePersister({
          storage: window.localStorage,
          key: "auraia-query-cache",
          throttleTime: 1000,
        });
        persistQueryClient({
          queryClient: queryClient as unknown as Parameters<typeof persistQueryClient>[0]["queryClient"],
          persister,
          maxAge: 1000 * 60 * 60 * 24,
          buster: "v1",
        });
      } catch (err) {
        console.warn("[query-persist] falhou ao iniciar persistência:", err);
      }
    })();
  }

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadDelay: 50,
    defaultPreloadStaleTime: 0,
  });

  return router;
};

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
