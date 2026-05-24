import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  ensureVideoCreditsCharged,
  failVideoJob,
  finalizeVideoJob,
} from "@/lib/video-jobs.server";

const XAI_VIDEO_ENDPOINT = "https://api.x.ai/v1/videos/generations";
const XAI_VIDEO_MODEL = "grok-imagine-video";

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function isReachablePublicUrl(url: string) {
  return /^https?:\/\//i.test(url) && !/localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(url);
}

async function toXaiReachableImageUrl(imageUrl: string) {
  if (!isReachablePublicUrl(imageUrl)) {
    throw new Error("A imagem precisa ter uma URL pública e acessível pela internet.");
  }

  const storageMatch = imageUrl.match(/\/storage\/v1\/object\/(?:public|sign)\/([^/]+)\/(.+)$/i);
  if (!storageMatch) return imageUrl;

  const bucket = decodeURIComponent(storageMatch[1]);
  const path = decodeURIComponent(storageMatch[2].split("?")[0]);
  const { data, error } = await supabaseAdmin.storage.from(bucket).createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) {
    throw new Error(`Falha ao assinar URL da imagem: ${error?.message ?? "sem signedUrl"}`);
  }
  return data.signedUrl;
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

        try {
          const xaiImageUrl = await toXaiReachableImageUrl(imageUrl);
          const requestBody = {
            model: XAI_VIDEO_MODEL,
            prompt:
              "Animate this image with natural smooth motion, cinematic quality, subtle realistic movement",
            image: { url: xaiImageUrl, type: "image_url" },
            duration: 10,
            aspect_ratio: "16:9",
            resolution: "720p",
          };

          console.log("[ANIMATE] imageUrl:", imageUrl);
          console.log("[ANIMATE] xAI request body:", requestBody);

          const createRes = await fetch(XAI_VIDEO_ENDPOINT, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
          });
          const createText = await createRes.text();
          console.log("[ANIMATE] xAI response status:", createRes.status);
          console.log("[ANIMATE] xAI response body:", createText);
          if (!createRes.ok) {
            console.error("[ANIMATE-IMAGE] create failed", createRes.status, createText.slice(0, 500));
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

          const requestId = createData.id ?? createData.request_id ?? null;
          if (!requestId) {
            console.error("[ANIMATE-IMAGE] missing request_id", createData);
            return json({ error: "Não foi possível iniciar a animação." }, 500);
          }

          const { data: job, error: jobError } = await supabase
            .from("video_jobs")
            .insert({
              user_id: userId,
              conversation_id: body.conversationId ?? null,
              source_image_url: imageUrl,
              xai_request_id: requestId,
              status: "processing",
            })
            .select("id, user_id, conversation_id, source_image_url, xai_request_id, status, final_video_url, error_message, credits_charged, created_at, updated_at")
            .single();
          if (jobError || !job) {
            console.error("[ANIMATE-IMAGE] job create failed", jobError);
            return json({ error: "Não foi possível registrar a animação." }, 500);
          }

          try {
            await ensureVideoCreditsCharged(job);
          } catch (e) {
            console.warn("[ANIMATE-IMAGE] credits insufficient", e);
            await failVideoJob(job, "Créditos insuficientes.");
            return json({ error: "insufficient_credits", message: "Créditos insuficientes." }, 402);
          }

          queueMicrotask(() => {
            void finalizeVideoJob(job.id, apiKey).catch(async (error) => {
              console.error("[ANIMATE-IMAGE] background finalize failed", error);
              await failVideoJob(job, error instanceof Error ? error.message : "Não foi possível concluir a animação.");
            });
          });

          return json({ jobId: job.id, requestId, status: "processing" }, 202);
        } catch (e) {
          console.error("[ANIMATE-IMAGE] error", e);
          return json({ error: "Não foi possível animar a imagem." }, 500);
        }
      },
    },
  },
});