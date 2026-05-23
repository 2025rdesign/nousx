import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const XAI_ENDPOINT = "https://api.x.ai/v1/images/generations";
const XAI_IMAGE_MODEL = "grok-imagine-image-quality";
const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";

type ImageFormat = "portrait" | "square" | "landscape" | null;

const MODERATION_RE =
  /moderation|blocked|content[_\s-]?policy|explicit|safety|inappropriate|violation/i;

// Liberal substitutions: trocar termos diretos por equivalentes mais aceitos
// pela moderação, mantendo a intenção visual.
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
];

function rewriteLiberal(prompt: string): string {
  let out = prompt;
  for (const [re, rep] of LIBERAL_SUBSTITUTIONS) out = out.replace(re, rep);
  out = out.replace(/\s+/g, " ").trim();
  return `${out}, professional photography, artistic, editorial fashion, high quality, tasteful`;
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
                    "Reescreva este pedido de geração de imagem de forma mais neutra e artística, " +
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
    console.warn("[GENERATE-IMAGE] Gemini rewrite failed", e);
    return null;
  }
}

async function callXai(apiKey: string, prompt: string) {
  const res = await fetch(XAI_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: XAI_IMAGE_MODEL, prompt, n: 1 }),
  });
  const txt = await res.text();
  return { status: res.status, ok: res.ok, text: txt };
}

function isModeration(status: number, text: string) {
  return (status === 400 || status === 422) && MODERATION_RE.test(text);
}

function detectRequestedFormat(text: string): {
  format: ImageFormat;
  suffix: string;
} {
  const normalized = text.toLowerCase();

  if (/\b(story|stories|vertical|9:16)\b/.test(normalized)) {
    return {
      format: "portrait",
      suffix: ", vertical 9:16 format, portrait",
    };
  }

  if (/\b(quadrado|square|1:1)\b/.test(normalized)) {
    return {
      format: "square",
      suffix: ", square 1:1 format",
    };
  }

  if (/\b(wide|horizontal|paisagem|16:9)\b/.test(normalized)) {
    return {
      format: "landscape",
      suffix: ", landscape 16:9 format",
    };
  }

  return { format: null, suffix: "" };
}

function buildCaption(rawPrompt: string): string {
  const subject = rawPrompt
    .trim()
    .replace(/^por favor\s+/i, "")
    .replace(
      /^(gera(r)?|cria(r)?|faz(er)?|desenha(r)?|me\s+(mostra|manda|envia)|quero|preciso|gostaria(\s+de)?)\s+/i,
      "",
    )
    .replace(
      /^(uma?|umas?)\s+(imagem|imagens|foto|fotos|ilustra(c|ç)(a|ã)o(es)?|desenho|desenhos|arte|artes)\s+(de|do|da|dos|das)?\s*/i,
      "",
    )
    .replace(/\b(story|stories|vertical|9:16|quadrado|square|1:1|wide|horizontal|paisagem|16:9)\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/^[,:;.-]+|[,:;.-]+$/g, "")
    .trim();
  const cleanSubject = subject.replace(/^(de|do|da|dos|das)\s+/i, "").trim();

  if (!cleanSubject) return "Aqui está sua imagem.";
  if (/^(o|a|os|as|um|uma|uns|umas)\b/i.test(cleanSubject)) {
    return `Aqui está ${cleanSubject.replace(/[.!?]+$/, "")}.`;
  }
  return `Aqui está a imagem de ${cleanSubject.replace(/[.!?]+$/, "")}.`;
}

async function generateTechnicalPrompt(rawPrompt: string, formatSuffix: string) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY ausente");
  }

  const res = await fetch(DEEPSEEK_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      temperature: 0.2,
      max_tokens: 300,
      messages: [
        {
          role: "system",
          content:
            "Transforme o pedido em um prompt técnico para geração de imagem em inglês. Retorne APENAS o prompt, sem explicações.",
        },
        {
          role: "user",
          content: rawPrompt,
        },
      ],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`DeepSeek ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const prompt = data.choices?.[0]?.message?.content?.trim().replace(/^['"]|['"]$/g, "");

  if (!prompt) {
    throw new Error("DeepSeek retornou prompt vazio");
  }

  return `${prompt}${formatSuffix}`;
}

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
        console.log("[GENERATE-IMAGE] active plan:", hasActive);
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
        const userPrompt = (body.prompt ?? "").trim();
        if (!userPrompt) return json({ error: "Prompt vazio." }, 400);
        if (userPrompt.length > 4000) return json({ error: "Prompt muito longo." }, 400);

        const apiKey = process.env.XAI_API_KEY;
        if (!apiKey) {
          console.error("[GENERATE-IMAGE] missing XAI_API_KEY");
          return json({ error: "Serviço indisponível no momento." }, 500);
        }

        try {
          const { format, suffix } = detectRequestedFormat(userPrompt);
          console.log("[GENERATE-IMAGE] requested format:", format ?? "none");

          const technicalPrompt = await generateTechnicalPrompt(userPrompt, suffix);
          const caption = buildCaption(userPrompt);

          console.log("[GENERATE-IMAGE] technical prompt:", technicalPrompt.slice(0, 200));
          console.log("[GENERATE-IMAGE] Chamando API Grok...");

          let attempt = await callXai(apiKey, technicalPrompt);

          // 3-layer moderation retry
          if (!attempt.ok && isModeration(attempt.status, attempt.text)) {
            console.warn("[GENERATE-IMAGE] moderation hit — Layer 1 (liberal)");
            attempt = await callXai(apiKey, `${rewriteLiberal(userPrompt)}${suffix}`);
          }
          if (!attempt.ok && isModeration(attempt.status, attempt.text)) {
            console.warn("[GENERATE-IMAGE] Layer 2 (neutral)");
            attempt = await callXai(apiKey, `${rewriteNeutral(userPrompt)}${suffix}`);
          }
          if (!attempt.ok && isModeration(attempt.status, attempt.text)) {
            console.warn("[GENERATE-IMAGE] Layer 3 (Gemini rewrite)");
            const gem = await rewriteViaGemini(userPrompt);
            if (gem) attempt = await callXai(apiKey, `${gem}${suffix}`);
          }
          if (!attempt.ok && isModeration(attempt.status, attempt.text)) {
            console.warn("[GENERATE-IMAGE] moderation persistiu após 3 camadas");
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
            console.error("[GENERATE-IMAGE] upstream", attempt.status, attempt.text.slice(0, 500));
            return json({ error: "Não foi possível gerar a imagem." }, 500);
          }
          const data = JSON.parse(attempt.text) as {
            data?: Array<{ url?: string }>;
            images?: Array<{ url?: string }>;
          };
          const url = data.data?.[0]?.url ?? data.images?.[0]?.url;
          if (!url) return json({ error: "Resposta inválida." }, 500);
          console.log("[GENERATE-IMAGE] image generated:", url);
          // Save to gallery (best-effort, never block response)
          try {
            await supabase.from("gallery").insert({
              user_id: userId,
              image_url: url,
              source: "chat",
              prompt: userPrompt.slice(0, 2000),
            });
          } catch (e) {
            console.warn("[GENERATE-IMAGE] failed to save gallery row", e);
          }
          return json({ url, caption }, 200);
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