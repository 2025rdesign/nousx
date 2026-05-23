import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const XAI_ENDPOINT = "https://api.x.ai/v1/images/edits";
const XAI_IMAGE_MODEL = "grok-imagine-image-quality";

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export const Route = createFileRoute("/api/edit-image")({
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

        // Edition is Ultra-only
        const nowIso = new Date().toISOString();
        const { data: subs } = await supabase
          .from("user_subscriptions")
          .select("plan_id, status, expires_at, created_at")
          .eq("user_id", userId)
          .eq("status", "active")
          .gt("expires_at", nowIso)
          .order("created_at", { ascending: false })
          .limit(1);
        const sub = subs?.[0] ?? null;
        const hasUltra = !!sub && sub.plan_id === "ultra";
        if (!hasUltra) {
          return json(
            {
              error: "ultra_required",
              message: "Edição de imagem é exclusiva do plano Ultra.",
            },
            402,
          );
        }

        let body: { prompt?: string; imageUrl?: string };
        try {
          body = (await request.json()) as { prompt?: string; imageUrl?: string };
        } catch {
          return json({ error: "Requisição inválida." }, 400);
        }
        const prompt = (body.prompt ?? "").trim();
        const imageUrl = (body.imageUrl ?? "").trim();
        if (!prompt) return json({ error: "Prompt vazio." }, 400);
        if (prompt.length > 4000) return json({ error: "Prompt muito longo." }, 400);
        if (!imageUrl) return json({ error: "Imagem ausente." }, 400);

        const apiKey = process.env.XAI_API_KEY;
        if (!apiKey) {
          console.error("[EDIT-IMAGE] missing XAI_API_KEY");
          return json({ error: "Serviço indisponível no momento." }, 500);
        }

        try {
          console.log("[EDIT-IMAGE] chamando xAI", {
            promptPreview: prompt.slice(0, 120),
            imageKind: imageUrl.startsWith("data:") ? "dataurl" : "http",
          });

          const res = await fetch(XAI_ENDPOINT, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: XAI_IMAGE_MODEL,
              prompt,
              image: { url: imageUrl, type: "image_url" },
              n: 1,
            }),
          });

          if (!res.ok) {
            const txt = await res.text().catch(() => "");
            console.error("[EDIT-IMAGE] upstream", res.status, txt.slice(0, 500));
            if (res.status === 400 && /content moderation|rejected by content moderation/i.test(txt)) {
              return json(
                {
                  error:
                    "Edição bloqueada pelo provedor. Tente reformular com uma descrição menos explícita.",
                },
                422,
              );
            }
            return json({ error: "Não foi possível editar a imagem." }, 500);
          }

          const data = (await res.json()) as {
            data?: Array<{ url?: string }>;
            images?: Array<{ url?: string }>;
          };
          const url = data.data?.[0]?.url ?? data.images?.[0]?.url;
          if (!url) return json({ error: "Resposta inválida." }, 500);

          console.log("[EDIT-IMAGE] imagem editada:", url);

          try {
            await supabase.from("gallery").insert({
              user_id: userId,
              image_url: url,
              source: "chat-edit",
              prompt: prompt.slice(0, 2000),
            });
          } catch (e) {
            console.warn("[EDIT-IMAGE] falha ao salvar na galeria", e);
          }

          return json({ url, caption: "Aqui está sua imagem editada." }, 200);
        } catch (e) {
          console.error("[EDIT-IMAGE] erro", e);
          return json({ error: "Não foi possível editar a imagem." }, 500);
        }
      },
    },
  },
});
