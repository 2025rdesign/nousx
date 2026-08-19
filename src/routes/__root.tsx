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
      { name: "apple-mobile-web-app-title", content: "Aura Chat" },
      { title: "Aura Chat — IA Sem Censura e 100% Grátis" },
      {
        name: "description",
        content:
          "Aura Chat é a inteligência artificial sem censura, sem filtros e 100% grátis. Converse sem limites, gere imagens e explore sem julgamentos.",
      },
      {
        name: "keywords",
        content:
          "aura chat, aura ia, chat ia gratis, inteligencia artificial sem censura, ia sem filtro, chat ia brasileiro, gerar imagem ia, ia adulto, ia sem restricao, chataura",
      },
      { name: "author", content: "Aura Chat" },
      { name: "theme-color", content: "#6C47FF" },
      { name: "google-site-verification", content: "ADICIONAR_CODIGO_GSC_AQUI" },
      { property: "og:title", content: "Aura Chat — IA Sem Censura e 100% Grátis" },
      {
        property: "og:description",
        content:
          "Converse sem limites com a IA mais livre do Brasil. Sem censura, sem filtros, 100% grátis para começar.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://chataura.com.br" },
      { property: "og:site_name", content: "Aura Chat" },
      { property: "og:locale", content: "pt_BR" },
      {
        property: "og:image",
        content:
          "https://central.daev.ca/wp-content/uploads/2026/05/AURA-IA-IMAGEM-DASH.png",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Aura Chat — IA Sem Censura e 100% Grátis" },
      {
        name: "twitter:description",
        content: "Converse sem limites com a IA mais livre do Brasil.",
      },
      {
        name: "twitter:image",
        content:
          "https://central.daev.ca/wp-content/uploads/2026/05/AURA-IA-IMAGEM-DASH.png",
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
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "Aura Chat",
          alternateName: ["AuraIA", "Aura IA", "Chat Aura"],
          url: "https://chataura.com.br",
          description:
            "Inteligência artificial sem censura e 100% grátis. Converse, gere imagens e explore sem limites.",
          applicationCategory: "AIApplication",
          operatingSystem: "Web, iOS, Android",
          offers: [
            {
              "@type": "Offer",
              name: "Plano Gratuito",
              price: "0",
              priceCurrency: "BRL",
            },
            {
              "@type": "Offer",
              name: "Plano Plus",
              price: "29.90",
              priceCurrency: "BRL",
              billingIncrement: "P1M",
            },
            {
              "@type": "Offer",
              name: "Plano Ultra",
              price: "57.90",
              priceCurrency: "BRL",
              billingIncrement: "P1M",
            },
          ],
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
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

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

  void queryClient;
  return <Outlet />;
}

function MaintenanceScreen() {
  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background:
          "radial-gradient(circle at 30% 20%, #2a1a4a 0%, #0a0a1f 60%, #050510 100%)",
        color: "#F0F0FF",
        fontFamily:
          "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        textAlign: "center",
      }}
    >
      <div style={{ maxWidth: 520 }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>🛠️</div>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 800,
            marginBottom: 12,
            lineHeight: 1.2,
          }}
        >
          Site em atualização
        </h1>
        <p
          style={{
            fontSize: 16,
            lineHeight: 1.6,
            color: "#A8A8C0",
            marginBottom: 28,
          }}
        >
          Estamos passando por uma atualização importante. Enquanto isso, use
          nossa IA gratuita, sem filtros e sem cadastro:
        </p>
        <a
          href="https://zedoblack.com.br"
          rel="noopener noreferrer"
          style={{
            display: "inline-block",
            background: "linear-gradient(135deg, #6C47FF 0%, #B845FF 100%)",
            color: "#fff",
            padding: "16px 32px",
            borderRadius: 12,
            fontSize: 17,
            fontWeight: 700,
            textDecoration: "none",
            boxShadow: "0 8px 24px rgba(108, 71, 255, 0.4)",
          }}
        >
          Acessar IA grátis sem filtro →
        </a>
        <p
          style={{
            marginTop: 24,
            fontSize: 13,
            color: "#7878A0",
            wordBreak: "break-all",
          }}
        >
          zedoblack.com.br
        </p>
      </div>
    </div>
  );
}

function VideoJobsWatcher() {
  // Animation feature temporarily disabled — no polling, no toasts.
  return null;
}
