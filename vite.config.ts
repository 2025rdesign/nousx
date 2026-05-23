// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Substitui o token __CACHE_VERSION__ (ou um build-<ts> anterior) em
// public/sw.js por um carimbo único a cada build/dev start. Garante que os
// bytes do Service Worker mudem em todo deploy, disparando o fluxo de
// atualização do navegador.
function swCacheVersionPlugin(): Plugin {
  const apply = () => {
    try {
      const swPath = path.resolve("public/sw.js");
      if (!fs.existsSync(swPath)) return;
      const content = fs.readFileSync(swPath, "utf8");
      const stamp = `build-${Date.now()}`;
      const next = content.replace(
        /(const\s+CACHE_VERSION\s*=\s*['"])[^'"]*(['"])/,
        `$1${stamp}$2`,
      );
      if (next !== content) fs.writeFileSync(swPath, next);
    } catch {
      /* no-op */
    }
  };
  return {
    name: "sw-cache-version",
    buildStart() {
      apply();
    },
    configureServer() {
      apply();
    },
  };
}

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    plugins: [swCacheVersionPlugin()],
  },
});
