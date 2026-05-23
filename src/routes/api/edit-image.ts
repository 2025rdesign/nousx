import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const XAI_ENDPOINT = "https://api.x.ai/v1/images/edits";
const XAI_IMAGE_MODEL = "grok-imagine-image-quality";

const MODERATION_RE =
  /moderation|blocked|content[_\s-]?policy|explicit|safety|inappropriate|violation/i;
const SENSITIVE_TERMS_RE =
  /\b(nude|naked|nudity|nsfw|sex|sexual|porn|pornograph\w*|erotic|fetish|kink|breast|nipple|genital|penis|vagina|butt|ass|topless|lingerie|underwear|bikini|gore|gory|blood|bloody|kill|killing|murder|weapon|gun|knife|drug|drugs|cocaine|heroin|violence|violent|hate|nazi)\w*/gi;

function sanitizePrompt(prompt: string): string {
  const cleaned = prompt.replace(SENSITIVE_TERMS_RE, "").replace(/\s+/g, " ").trim();
  const base = cleaned || "edit this image";
  return `${base}, tasteful, artistic, high quality photography`;
}

function isModeration(status: number, text: string) {
  return (status === 400 || status === 422) && MODERATION_RE.test(text);
}

async function callXaiEdit(apiKey: string, prompt: string, imageUrl: string) {
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
  const text = await res.text();
  return { status: res.status, ok: res.ok, text };
}

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

          let attempt = await callXaiEdit(apiKey, prompt, imageUrl);
          if (!attempt.ok && isModeration(attempt.status, attempt.text)) {
            console.warn("[EDIT-IMAGE] moderation hit, retrying sanitized");
            const retryPrompt = sanitizePrompt(prompt);
            attempt = await callXaiEdit(apiKey, retryPrompt, imageUrl);
            if (!attempt.ok && isModeration(attempt.status, attempt.text)) {
              console.warn("[EDIT-IMAGE] moderation persistiu após retry");
              return json(
                {
                  error: "content_moderation",
                  code: "moderation",
                  message: "Conteúdo bloqueado por moderação.",
                },
                422,
              );
            }
          }
          if (!attempt.ok) {
            console.error("[EDIT-IMAGE] upstream", attempt.status, attempt.text.slice(0, 500));
            return json({ error: "Não foi possível editar a imagem." }, 500);
          }

          const data = JSON.parse(attempt.text) as {
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
