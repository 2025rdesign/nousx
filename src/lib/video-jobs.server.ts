import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { consumeCredits, recomputeUserBalance } from "@/lib/credits.server";

const XAI_VIDEO_STATUS = "https://api.x.ai/v1/videos";
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 6 * 60_000;
const VIDEO_COST = 10;
const READY_STATUSES = new Set(["done", "completed", "succeeded"]);
const FAILED_STATUSES = new Set(["failed", "error", "cancelled"]);

type VideoJobRow = {
  id: string;
  user_id: string;
  conversation_id: string | null;
  source_image_url: string;
  xai_request_id: string | null;
  status: string;
  final_video_url: string | null;
  provider: string;
  error_message: string | null;
  credits_charged: boolean;
  created_at: string;
  updated_at: string;
};

type PollResult = {
  ready: boolean;
  status: string;
  finalUrl: string | null;
  errorMessage?: string | null;
};

function getVideoUrl(data: {
  data?: Array<{ url?: string }>;
  videos?: Array<{ url?: string }>;
  url?: string;
}) {
  return data.data?.[0]?.url ?? data.videos?.[0]?.url ?? data.url ?? null;
}

export async function refundVideoCredits(userId: string, amount = VIDEO_COST) {
  await supabaseAdmin.from("credit_batches").insert({
    user_id: userId,
    pack_id: "refund",
    credits_total: amount,
    credits_remaining: amount,
    expires_at: null,
  });
  await recomputeUserBalance(userId);
}

export async function ensureVideoCreditsCharged(job: Pick<VideoJobRow, "id" | "user_id" | "credits_charged">) {
  if (job.credits_charged) return;
  await consumeCredits(job.user_id, VIDEO_COST);
  const { error } = await supabaseAdmin
    .from("video_jobs")
    .update({ credits_charged: true })
    .eq("id", job.id)
    .eq("credits_charged", false);
  if (error) throw new Error(error.message);
}

export async function failVideoJob(job: Pick<VideoJobRow, "id" | "user_id" | "credits_charged">, errorMessage: string) {
  if (job.credits_charged) {
    await refundVideoCredits(job.user_id);
  }
  await supabaseAdmin
    .from("video_jobs")
    .update({
      status: "failed",
      error_message: errorMessage,
      credits_charged: false,
    })
    .eq("id", job.id);
}

export async function downloadAndStoreVideo(videoUrl: string, userId: string): Promise<string> {
  const res = await fetch(videoUrl);
  if (!res.ok) throw new Error(`Falha ao baixar vídeo: ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const filename = `${userId}/${Date.now()}-${crypto.randomUUID()}.mp4`;
  const { error } = await supabaseAdmin.storage.from("chat-videos").upload(filename, buf, {
    contentType: "video/mp4",
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw new Error(`Falha ao salvar vídeo: ${error.message}`);
  const { data } = supabaseAdmin.storage.from("chat-videos").getPublicUrl(filename);
  return data.publicUrl;
}

export async function pollXaiVideoUntilReady(requestId: string, apiKey: string): Promise<PollResult> {
  const maxAttempts = Math.ceil(POLL_TIMEOUT_MS / POLL_INTERVAL_MS);
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (attempt > 1) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
    const pollRes = await fetch(`${XAI_VIDEO_STATUS}/${requestId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const pollText = await pollRes.text();
    console.log("[ANIMATE] poll status:", pollRes.status);
    console.log("[ANIMATE] poll body:", pollText);
    if (!pollRes.ok) {
      continue;
    }
    const pollData = JSON.parse(pollText) as {
      status?: string;
      error?: string;
      data?: Array<{ url?: string }>;
      videos?: Array<{ url?: string }>;
      url?: string;
    };
    const status = (pollData.status ?? "").toLowerCase();
    console.log("[VIDEO] status:", status, "attempt:", attempt);
    if (READY_STATUSES.has(status)) {
      return {
        ready: true,
        status,
        finalUrl: getVideoUrl(pollData),
      };
    }
    if (FAILED_STATUSES.has(status)) {
      return {
        ready: false,
        status,
        finalUrl: null,
        errorMessage: pollData.error ?? "A geração da animação falhou.",
      };
    }
  }
  return {
    ready: false,
    status: "timeout",
    finalUrl: null,
    errorMessage: "Tempo esgotado ao animar a imagem.",
  };
}

export async function finalizeVideoJob(jobId: string, apiKey: string) {
  const { data: job, error } = await supabaseAdmin
    .from("video_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle<VideoJobRow>();
  if (error) throw new Error(error.message);
  if (!job) throw new Error("Job não encontrado.");
  if (!job.xai_request_id) throw new Error("Job sem request_id.");
  if (job.status === "completed" && job.final_video_url) {
    return { status: "completed" as const, videoUrl: job.final_video_url, conversationId: job.conversation_id };
  }

  const result = await pollXaiVideoUntilReady(job.xai_request_id, apiKey);
  if (!result.ready || !result.finalUrl) {
    await failVideoJob(job, result.errorMessage ?? "Não foi possível concluir a animação.");
    return { status: "failed" as const, error: result.errorMessage ?? "Não foi possível concluir a animação." };
  }

  const permanentUrl = await downloadAndStoreVideo(result.finalUrl, job.user_id);
  const caption = "Aqui está sua animação! 🎬";

  await supabaseAdmin.from("gallery").insert({
    user_id: job.user_id,
    image_url: permanentUrl,
    source: "chat-video",
    prompt: "Animação de imagem (chat)",
  });

  if (job.conversation_id) {
    await supabaseAdmin.from("messages").insert({
      conversation_id: job.conversation_id,
      role: "assistant",
      content: caption,
      image_url: permanentUrl,
    });
    await supabaseAdmin
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", job.conversation_id);
  }

  await supabaseAdmin
    .from("video_jobs")
    .update({
      status: "completed",
      final_video_url: permanentUrl,
      error_message: null,
    })
    .eq("id", job.id);

  return {
    status: "completed" as const,
    videoUrl: permanentUrl,
    conversationId: job.conversation_id,
  };
}