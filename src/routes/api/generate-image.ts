import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const XAI_ENDPOINT = "https://api.x.ai/v1/images/generations";
const XAI_IMAGE_MODEL = "grok-imagine-image-quality";
const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";

type ImageFormat = "portrait" | "square" | "landscape" | null;

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

  if (!subject) return "Aqui está sua imagem.";
  if (/^(o|a|os|as|um|uma|uns|umas)\b/i.test(subject)) {
    return `Aqui está ${subject.replace(/[.!?]+$/, "")}.`;
  }
  return `Aqui está a imagem de ${subject.replace(/[.!?]+$/, "")}.`;
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

          const res = await fetch(XAI_ENDPOINT, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: XAI_IMAGE_MODEL,
              prompt: technicalPrompt,
              n: 1,
            }),
          });
          if (!res.ok) {
            const txt = await res.text().catch(() => "");
            console.error("[GENERATE-IMAGE] upstream", res.status, txt.slice(0, 500));
            return json({ error: "Não foi possível gerar a imagem." }, 500);
          }
          const data = (await res.json()) as {
            data?: Array<{ url?: string }>;
            images?: Array<{ url?: string }>;
          };
          const url = data.data?.[0]?.url ?? data.images?.[0]?.url;
          if (!url) return json({ error: "Resposta inválida." }, 500);
          console.log("[GENERATE-IMAGE] image generated:", url);
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