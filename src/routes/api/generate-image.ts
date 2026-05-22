import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const XAI_ENDPOINT = "https://api.x.ai/v1/images/generations";

export const Route = createFileRoute("/api/generate-image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return json({ error: "Não autorizado." }, 401);
        }
        const token = authHeader.slice("Bearer ".length);

        const SUPABASE_URL = process.env.SUPABASE_URL!;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: userData, error: userErr } = await supabase.auth.getUser(token);
        if (userErr || !userData.user) {
          return json({ error: "Sessão inválida." }, 401);
        }
        const userId = userData.user.id;

        // Check active subscription (fresh read, no caching)
        const nowIso = new Date().toISOString();
        const { data: subs, error: subErr } = await supabase
          .from("user_subscriptions")
          .select("id, plan_id, status, expires_at, created_at")
          .eq("user_id", userId)
          .eq("status", "active")
          .gt("expires_at", nowIso)
          .order("created_at", { ascending: false })
          .limit(1);

        console.log("[GENERATE-IMAGE] subscription check", {
          userId,
          now: nowIso,
          subErr: subErr?.message ?? null,
          subs,
        });

        const sub = subs?.[0] ?? null;
        const hasActive = !!sub;
        if (!hasActive) {
          console.log("[GENERATE-IMAGE] no active subscription for", userId);
          return json(
            {
              error: "subscription_required",
              message:
                "Geração de imagem no chat é exclusiva do plano Plus ou Ultra.",
            },
            402,
          );
        }

        let body: { prompt?: string };
        try {
          body = (await request.json()) as { prompt?: string };
        } catch {
          return json({ error: "Requisição inválida." }, 400);
        }
        const prompt = (body.prompt ?? "").trim();
        if (!prompt) return json({ error: "Prompt vazio." }, 400);
        if (prompt.length > 4000) return json({ error: "Prompt muito longo." }, 400);

        const apiKey = process.env.XAI_API_KEY;
        if (!apiKey) {
          console.error("[GENERATE-IMAGE] missing XAI_API_KEY");
          return json({ error: "Serviço indisponível no momento." }, 500);
        }

        try {
          console.log("[GENERATE-IMAGE] calling Grok xAI for prompt:", prompt.slice(0, 120));
          const res = await fetch(XAI_ENDPOINT, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "grok-2-image-1212",
              prompt,
              n: 1,
              response_format: "url",
            }),
          });
          if (!res.ok) {
            const txt = await res.text().catch(() => "");
            console.error("[GENERATE-IMAGE] upstream", res.status, txt.slice(0, 500));
            return json({ error: "Não foi possível gerar a imagem." }, 500);
          }
          const data = (await res.json()) as {
            data?: Array<{ url?: string; revised_prompt?: string }>;
          };
          const url = data.data?.[0]?.url;
          if (!url) return json({ error: "Resposta inválida." }, 500);
          console.log("[GENERATE-IMAGE] image generated:", url);
          return json({ url, revisedPrompt: data.data?.[0]?.revised_prompt ?? null }, 200);
        } catch (e) {
          console.error("[GENERATE-IMAGE] error", e);
          return json({ error: "Não foi possível gerar a imagem." }, 500);
        }
      },
    },
  },
});

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}