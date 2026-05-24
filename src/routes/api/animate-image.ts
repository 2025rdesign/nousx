import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { consumeCredits } from "@/lib/credits.server";

const XAI_VIDEO_ENDPOINT = "https://api.x.ai/v1/videos/generations";
const XAI_VIDEO_STATUS = "https://api.x.ai/v1/videos";
const XAI_VIDEO_MODEL = "grok-imagine-video";
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 5 * 60_000;
const VIDEO_COST = 10;

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function downloadAndStore(
  videoUrl: string,
  userId: string,
): Promise<string> {
  const res = await fetch(videoUrl);
  if (!res.ok) throw new Error(`Falha ao baixar vídeo: ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const filename = `${userId}/${Date.now()}-${crypto.randomUUID()}.mp4`;
  const { error } = await supabaseAdmin.storage
    .from("chat-videos")
    .upload(filename, buf, {
      contentType: "video/mp4",
      cacheControl: "31536000",
      upsert: false,
    });
  if (error) throw new Error(`Falha ao salvar vídeo: ${error.message}`);
  const { data: pub } = supabaseAdmin.storage
    .from("chat-videos")
    .getPublicUrl(filename);
  return pub.publicUrl;
}

export const Route = createFileRoute("/api/animate-image")({
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
        const supabase = createClient<Database>(
          SUPABASE_URL,
          SUPABASE_PUBLISHABLE_KEY,
          {
            global: { headers: { Authorization: `Bearer ${token}` } },
            auth: { persistSession: false, autoRefreshToken: false },
          },
        );
        const { data: userData, error: userErr } = await supabase.auth.getUser(
          token,
        );
        if (userErr || !userData.user) {
          return json({ error: "Sessão inválida." }, 401);
        }
        const userId = userData.user.id;

        // Ultra plan check
        const nowIso = new Date().toISOString();
        const { data: subs } = await supabase
          .from("user_subscriptions")
          .select("plan_id, status, expires_at")
          .eq("user_id", userId)
          .eq("status", "active")
          .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
          .order("created_at", { ascending: false })
          .limit(1);
        const sub = subs?.[0] ?? null;
        if (!sub || sub.plan_id !== "ultra") {
          return json(
            {
              error: "ultra_required",
              message: "Animação de imagens é exclusiva do plano Ultra.",
            },
            402,
          );
        }

        let body: { imageUrl?: string; conversationId?: string };
        try {
          body = (await request.json()) as {
            imageUrl?: string;
            conversationId?: string;
          };
        } catch {
          return json({ error: "Requisição inválida." }, 400);
        }
        const imageUrl = (body.imageUrl ?? "").trim();
        if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
          return json({ error: "Imagem inválida." }, 400);
        }

        const apiKey = process.env.XAI_API_KEY;
        if (!apiKey) {
          console.error("[ANIMATE-IMAGE] missing XAI_API_KEY");
          return json({ error: "Serviço indisponível no momento." }, 500);
        }

        // Deduct credits BEFORE calling — refund on failure below.
        try {
          await consumeCredits(userId, VIDEO_COST);
        } catch (e) {
          console.warn("[ANIMATE-IMAGE] credits insufficient", e);
          return json(
            { error: "insufficient_credits", message: "Créditos insuficientes." },
            402,
          );
        }

        const refund = async () => {
          try {
            await supabaseAdmin.from("credit_batches").insert({
              user_id: userId,
              pack_id: "refund",
              credits_total: VIDEO_COST,
              credits_remaining: VIDEO_COST,
              expires_at: null,
            });
            const { recomputeUserBalance } = await import(
              "@/lib/credits.server"
            );
            await recomputeUserBalance(userId);
          } catch (e) {
            console.error("[ANIMATE-IMAGE] refund failed", e);
          }
        };

        try {
          // 1) Create generation request
          const createRes = await fetch(XAI_VIDEO_ENDPOINT, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: XAI_VIDEO_MODEL,
              prompt:
                "Animate this image naturally and smoothly, subtle realistic motion, cinematic quality",
              image: { url: imageUrl, type: "image_url" },
              duration: 10,
              aspect_ratio: "9:16",
              resolution: "720p",
            }),
          });
          const createText = await createRes.text();
          if (!createRes.ok) {
            console.error(
              "[ANIMATE-IMAGE] create failed",
              createRes.status,
              createText.slice(0, 500),
            );
            await refund();
            return json({ error: "Não foi possível animar a imagem." }, 500);
          }
          const createData = JSON.parse(createText) as {
            id?: string;
            request_id?: string;
            status?: string;
            data?: Array<{ url?: string }>;
            videos?: Array<{ url?: string }>;
            url?: string;
          };

          // Sometimes APIs return the URL synchronously.
          let finalUrl =
            createData.data?.[0]?.url ??
            createData.videos?.[0]?.url ??
            createData.url ??
            null;

          const requestId = createData.id ?? createData.request_id ?? null;

          if (!finalUrl && requestId) {
            const started = Date.now();
            let attempt = 0;
            while (Date.now() - started < POLL_TIMEOUT_MS) {
              await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
              attempt += 1;
              const pollRes = await fetch(`${XAI_VIDEO_STATUS}/${requestId}`, {
                headers: { Authorization: `Bearer ${apiKey}` },
              });
              const pollText = await pollRes.text();
              if (!pollRes.ok) {
                console.warn(
                  "[ANIMATE-IMAGE] poll status",
                  pollRes.status,
                  pollText.slice(0, 300),
                );
                continue;
              }
              const pollData = JSON.parse(pollText) as {
                status?: string;
                data?: Array<{ url?: string }>;
                videos?: Array<{ url?: string }>;
                url?: string;
              };
              const status = pollData.status ?? "";
              console.log("[VIDEO] status:", status, "attempt:", attempt);
              if (
                status === "done" ||
                status === "completed" ||
                status === "succeeded"
              ) {
                finalUrl =
                  pollData.data?.[0]?.url ??
                  pollData.videos?.[0]?.url ??
                  pollData.url ??
                  null;
                break;
              }
              if (status === "failed" || status === "error") {
                console.error("[ANIMATE-IMAGE] xAI status failed", pollData);
                break;
              }
            }
          }

          if (!finalUrl) {
            console.error("[ANIMATE-IMAGE] no video url after polling");
            await refund();
            return json({ error: "Tempo esgotado ao animar a imagem." }, 500);
          }

          // 2) Download & re-upload to our storage for permanence
          const permanentUrl = await downloadAndStore(finalUrl, userId);

          // 3) Best-effort gallery save
          try {
            await supabase.from("gallery").insert({
              user_id: userId,
              image_url: permanentUrl,
              source: "chat-video",
              prompt: "Animação de imagem (chat)",
            });
          } catch (e) {
            console.warn("[ANIMATE-IMAGE] gallery save failed", e);
          }

          return json({ videoUrl: permanentUrl }, 200);
        } catch (e) {
          console.error("[ANIMATE-IMAGE] error", e);
          await refund();
          return json({ error: "Não foi possível animar a imagem." }, 500);
        }
      },
    },
  },
});