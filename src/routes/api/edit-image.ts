import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { checkAndIncrementImageUsage } from "@/lib/image-usage.server";

const XAI_ENDPOINT = "https://api.x.ai/v1/images/edits";
const XAI_IMAGE_MODEL = "grok-imagine-image-quality";

const MODERATION_RE =
  /moderation|blocked|content[_\s-]?policy|explicit|safety|inappropriate|violation/i;

const LIBERAL_SUBSTITUTIONS: Array<[RegExp, string]> = [
  [/\bcalcinhas?\b/gi, "lingerie bottom, intimate apparel"],
  [/\bcuecas?\b/gi, "men's underwear, intimate apparel"],
  [/\bsuti[ãa]s?\b/gi, "lingerie top, intimate apparel"],
  [/\bbiqu[íi]nis?\b/gi, "bikini, swimwear, beach fashion"],
  [/\bmai[ôo]s?\b/gi, "swimsuit, swimwear, beach fashion"],
  [/\blingeries?\b/gi, "lingerie, intimate apparel, editorial fashion"],
  [/\b(pelad[ao]s?|nu[ao]s?|nud[ao]s?)\b/gi, "artistic nude, fine art photography"],
  [/\bsensuais?\b/gi, "alluring, elegant"],
  [/\bsensual(?:mente)?\b/gi, "alluring, elegant"],
  [/\bsexy\b/gi, "alluring, elegant"],
  [/\bgostos[ao]s?\b/gi, "attractive, elegant"],
  [/\bs[ée]xi\b/gi, "alluring, elegant"],
  [/\bvestido\s+sensual\b/gi, "elegant form-fitting dress, editorial"],
  [/\bmais\s+curt[ao]\b/gi, "mini dress, short hemline"],
  [/\bapertad[ao]s?\b/gi, "bodycon, fitted silhouette"],
  [/\bdecotad[ao]s?\b/gi, "low neckline, décolleté"],
  [/\btransparentes?\b/gi, "sheer fabric, artistic"],
  [/\bsem\s+suti[ãa]\b/gi, "braless, natural, artistic"],
  [/\bcurvas?\b/gi, "elegant silhouette"],
  [/\bbund[ao]s?\b/gi, "elegant figure"],
  [/\bseios?\b/gi, "elegant figure"],
];

function rewriteLiberal(prompt: string): string {
  let out = prompt;
  for (const [re, rep] of LIBERAL_SUBSTITUTIONS) out = out.replace(re, rep);
  out = out.replace(/\s+/g, " ").trim();
  return `Editorial fashion photography, professional studio lighting, ${out}, tasteful, Vogue editorial, 8k, high fashion`;
}

function rewriteNeutral(prompt: string): string {
  return `${prompt.trim()}, artistic photography, professional lighting, high quality`;
}

async function rewriteViaGemini(prompt: string): Promise<string | null> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text:
                    "Reescreva este pedido de edição de imagem de forma mais neutra e artística, " +
                    "mantendo a intenção visual mas usando linguagem de fotografia profissional. " +
                    "Responda APENAS com o prompt reescrito em inglês, sem explicações.\n\nPedido: " +
                    prompt,
                },
              ],
            },
          ],
          generationConfig: { temperature: 0.4, maxOutputTokens: 300 },
        }),
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const out = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!out) return null;
    return `${out.replace(/^['"]|['"]$/g, "")}, professional photography, high quality`;
  } catch (e) {
    console.warn("[EDIT-IMAGE] Gemini rewrite failed", e);
    return null;
  }
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

        // Monthly image-usage gate (shared with generation; silent).
        const usage = await checkAndIncrementImageUsage(userId, "ultra");
        if (!usage.ok) {
          console.log("[EDIT-IMAGE] monthly limit reached", {
            userId,
            count: usage.count,
            limit: usage.limit,
            resetAt: usage.resetAt,
          });
          return json(
            {
              error: "limit_reached",
              code: "limit_reached",
              plan: "ultra",
              resetAt: usage.resetAt,
            },
            429,
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
            console.warn("[EDIT-IMAGE] moderation — Layer 1 (liberal)");
            attempt = await callXaiEdit(apiKey, rewriteLiberal(prompt), imageUrl);
          }
          if (!attempt.ok && isModeration(attempt.status, attempt.text)) {
            console.warn("[EDIT-IMAGE] Layer 2 (neutral)");
            attempt = await callXaiEdit(apiKey, rewriteNeutral(prompt), imageUrl);
          }
          if (!attempt.ok && isModeration(attempt.status, attempt.text)) {
            console.warn("[EDIT-IMAGE] Layer 3 (Gemini)");
            const gem = await rewriteViaGemini(prompt);
            if (gem) attempt = await callXaiEdit(apiKey, gem, imageUrl);
          }
          if (!attempt.ok && isModeration(attempt.status, attempt.text)) {
            console.warn("[EDIT-IMAGE] moderation persistiu após 3 camadas");
            return json(
              {
                error: "content_moderation",
                code: "moderation",
                message: "Conteúdo bloqueado por moderação.",
              },
              422,
            );
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
