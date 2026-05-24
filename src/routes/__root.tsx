import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { FaviconTheme } from "@/components/theme-favicon";
import { AuthProvider } from "@/hooks/use-auth";
import { FloatingAudioPlayer } from "@/components/chat/audio-player";
import { SwRegister } from "@/components/sw-register";
import { AppErrorBoundary } from "@/components/error-boundary";
import { installChunkReloadHandler } from "@/lib/chunk-reload";
import { useEffect } from "react";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover",
      },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { title: "AuraIA" },
      {
        name: "description",
        content:
          "AuraIA é uma inteligência artificial sem censura e sem filtros. Converse livremente, gere imagens realistas e explore sem limites.",
      },
      {
        name: "keywords",
        content:
          "IA sem censura, inteligência artificial, chat IA, geração de imagem IA, AI sem filtro, chatbot livre",
      },
      { name: "author", content: "AuraIA" },
      { name: "theme-color", content: "#6C47FF" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "AuraIA" },
      { property: "og:title", content: "AuraIA — IA sem censura" },
      {
        property: "og:description",
        content:
          "Converse e crie sem limites com a AuraIA. Chat livre e geração de imagens sem censura.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://chataura.com.br" },
      {
        property: "og:image",
        content:
          "https://central.daev.ca/wp-content/uploads/2026/05/icone-logo-nousx-pwa-scaled.png",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "AuraIA — IA sem censura" },
      { name: "twitter:description", content: "Converse e crie sem limites com a AuraIA." },
      {
        name: "twitter:image",
        content:
          "https://central.daev.ca/wp-content/uploads/2026/05/icone-logo-nousx-pwa-scaled.png",
      },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "icon",
        href: "https://central.daev.ca/wp-content/uploads/2026/05/FAVICON-AURA.png",
      },
      {
        rel: "apple-touch-icon",
        href: "https://central.daev.ca/wp-content/uploads/2026/05/PWAAURA.png",
      },
      {
        rel: "preload",
        as: "image",
        href: "https://central.daev.ca/wp-content/uploads/2026/05/FAVICON-AURA.png",
      },
      {
        rel: "preload",
        as: "image",
        href: "https://central.daev.ca/wp-content/uploads/2026/05/FAVICON-AURA-SOMBRA.png",
      },
      {
        rel: "preload",
        as: "image",
        href: "https://central.daev.ca/wp-content/uploads/2026/05/AURA-IA-IMAGEM-DASH.png",
      },
      {
        rel: "preload",
        as: "image",
        href: "https://central.daev.ca/wp-content/uploads/2026/05/AURA-IA-IMAGEM-DASH-VARIANTE-MODO-CLARO.png",
      },
      { rel: "manifest", href: "/manifest.json" },
      { rel: "canonical", href: "https://chataura.com.br" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    installChunkReloadHandler();
  }, []);

  // Capture ?ref=CODE into localStorage so it can be attached on signup
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get("ref");
      if (ref && /^[A-Za-z0-9]{4,16}$/.test(ref)) {
        localStorage.setItem("auraia-ref-code", ref.toUpperCase());
      }
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <FaviconTheme />
          <AuthProvider>
            <VideoJobsWatcher />
            <Outlet />
            <Toaster position="top-center" richColors />
            <FloatingAudioPlayer />
            <SwRegister />
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}

function VideoJobsWatcher() {
  // Animation feature temporarily disabled — no polling, no toasts.
  return null;
}
