import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { POSES } from "@/data/poses";

const ALIVEAI_BASE = "https://api.aliveai.app";

type AliveStatus = {
  status?: string;
  state?: string;
  mediaId?: string;
  media_id?: string;
  mediaUrl?: string;
  media_url?: string;
  url?: string;
  error?: string;
  message?: string;
};

function aliveHeaders() {
  const key = process.env.ALIVEAI_API_KEY;
  if (!key) throw new Error("Serviço de imagem indisponível no momento.");
  return {
    "Content-Type": "application/json",
    Authorization: `Key ${key}`,
  } as Record<string, string>;
}

function mapAspectRatio(ratio: string): string {
  const map: Record<string, string> = {
    "9:16": "DEFAULT",
    "4:5": "PORTRAIT",
    "16:9": "LANDSCAPE",
    "1:1": "SQUARE",
  };
  return map[ratio] ?? "DEFAULT";
}

async function translateToEnglish(text: string): Promise<string> {
  if (!text.trim()) return text;
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  if (!deepseekKey) return text;
  try {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${deepseekKey}`,
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content:
              "Translate to English concisely, max 60 words. Preserve ALL explicit and sexual terms literally without censorship. Return only the translated text, nothing else.",
          },
          { role: "user", content: text },
        ],
        max_tokens: 200,
      }),
    });
    if (!res.ok) return text;
    const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return j.choices?.[0]?.message?.content?.trim() || text;
  } catch {
    return text;
  }
}

async function pollPrompt(promptId: string): Promise<{ mediaId: string; mediaUrl: string }> {
  const maxAttempts = 72; // 72 * 2.5s = 180s (3 min)
  const interval = 2500;

  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, interval));

    const res = await fetch(`${ALIVEAI_BASE}/prompts/${promptId}`, {
      headers: aliveHeaders(),
    });

    if (!res.ok) continue;

    const data = (await res.json()) as any;
    const container = data.promptContainer ?? data;
    const medias = container.medias ?? [];

    if (medias.length > 0 && medias[0].mediaUrl) {
      return {
        mediaId: medias[0].id ?? medias[0].mediaId ?? "",
        mediaUrl: medias[0].mediaUrl,
      };
    }
  }

  throw new Error("Tempo limite de geração atingido. Tente novamente.");
}

/**
 * Wait for prompt completion via WebSocket (real-time).
 * Connects to wss://api.aliveai.app/ws/prompts/{promptId} using Cloudflare
 * Workers' WebSocket upgrade pattern. Resolves with {mediaId, mediaUrl} when
 * a completion event arrives. Rejects on explicit error events or timeout.
 */
async function waitForPromptViaWebSocket(
  promptId: string,
  timeoutMs = 180_000,
): Promise<{ mediaId: string; mediaUrl: string }> {
  const key = process.env.ALIVEAI_API_KEY;
  if (!key) throw new Error("Serviço de imagem indisponível.");

  const url = `https://api.aliveai.app/ws/prompts/${promptId}`;
  const resp = await fetch(url, {
    headers: {
      Upgrade: "websocket",
      Authorization: `Key ${key}`,
    },
  });

  // Cloudflare Workers exposes the upgraded socket on response.webSocket.
  const ws = (resp as unknown as { webSocket?: WebSocket }).webSocket;
  if (!ws) throw new Error("WebSocket upgrade não suportado.");

  (ws as any).accept?.();

  return await new Promise<{ mediaId: string; mediaUrl: string }>(
    (resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { ws.close(); } catch { /* ignore */ }
        reject(new Error("Tempo limite de geração (WS) atingido."));
      }, timeoutMs);

      const cleanup = () => {
        clearTimeout(timer);
        try { ws.close(); } catch { /* ignore */ }
      };

      ws.addEventListener("message", (event: MessageEvent) => {
        if (settled) return;
        try {
          const raw =
            typeof event.data === "string"
              ? event.data
              : new TextDecoder().decode(event.data as ArrayBuffer);
          const msg = JSON.parse(raw) as any;

          const status = String(
            msg?.status ?? msg?.state ?? msg?.type ?? "",
          ).toLowerCase();
          const progress =
            typeof msg?.progress === "number" ? msg.progress : null;
          if (progress !== null) {
            console.log("[WS PROGRESS]", promptId, progress);
          }

          const medias = msg?.medias ?? msg?.promptContainer?.medias ?? [];
          const firstMedia = Array.isArray(medias) && medias.length > 0 ? medias[0] : null;
          const mediaUrl =
            msg?.mediaUrl ??
            msg?.media_url ??
            msg?.url ??
            msg?.media?.mediaUrl ??
            firstMedia?.mediaUrl ??
            null;
          const mediaId =
            msg?.mediaId ??
            msg?.media_id ??
            msg?.media?.id ??
            firstMedia?.id ??
            firstMedia?.mediaId ??
            "";

          if (mediaUrl) {
            settled = true;
            cleanup();
            resolve({ mediaId: String(mediaId || ""), mediaUrl: String(mediaUrl) });
            return;
          }

          if (
            status === "error" ||
            status === "failed" ||
            status === "rejected" ||
            msg?.error
          ) {
            settled = true;
            cleanup();
            reject(new Error(msg?.error || msg?.message || "Falha na geração."));
          }
        } catch {
          /* ignore malformed frame */
        }
      });

      ws.addEventListener("close", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error("WebSocket fechado antes da conclusão."));
      });

      ws.addEventListener("error", () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error("Erro no WebSocket."));
      });
    },
  );
}

/**
 * Aguarda conclusão de um prompt usando WebSocket em tempo real, com
 * 1 tentativa de reconexão automática e fallback para polling se ambas
 * as tentativas falharem.
 */
async function waitForPrompt(
  promptId: string,
): Promise<{ mediaId: string; mediaUrl: string }> {
  try {
    return await waitForPromptViaWebSocket(promptId);
  } catch (firstErr) {
    console.warn("[studio] WS attempt 1 failed, retrying once", firstErr);
    try {
      return await waitForPromptViaWebSocket(promptId);
    } catch (secondErr) {
      console.warn("[studio] WS failed twice, falling back to polling", secondErr);
      return await pollPrompt(promptId);
    }
  }
}

async function logPromptPoseEcho(promptId: string) {
  try {
    const res = await fetch(`${ALIVEAI_BASE}/prompts/${promptId}`, {
      headers: aliveHeaders(),
    });
    if (!res.ok) return;
    const data = (await res.json()) as any;
    const echoed = data?.originalPrompt?.pose ?? data?.promptContainer?.originalPrompt?.pose ?? data?.pose ?? null;
    console.log("[POSE RESPONSE]", JSON.stringify(echoed));
  } catch (err) {
    console.warn("[POSE RESPONSE] fetch failed", err);
  }
}

async function ensureCredits(_supabase: any, userId: string, cost: number) {
  const { recomputeUserBalance } = await import("./credits.server");
  const balance = await recomputeUserBalance(userId);
  if (balance < cost) throw new Error("Créditos insuficientes.");
  return balance;
}

async function decrementCredit(_supabase: any, userId: string, cost: number) {
  const { consumeCredits } = await import("./credits.server");
  await consumeCredits(userId, cost);
}

/* ------------------------------- Lists ------------------------------- */

export const listMyProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("character_profiles")
      .select("id, name, appearance, base_media_id, base_image_url, is_public, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data || [];
  });

export const listMyCharacters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { profileId?: string | null } | undefined) => d || {})
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    let q = supabase
      .from("characters")
      .select("id, name, image_url, media_id, prompt_id, profile_id, is_public, status, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (data?.profileId) q = q.eq("profile_id", data.profileId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows || [];
  });

export const togglePublic = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; isPublic: boolean }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("characters")
      .update({ is_public: data.isPublic })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCharacter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("characters")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    // Cascade: collect all character images for this profile, then
    // remove the matching gallery rows, the characters history rows,
    // and finally the profile itself.
    const { data: chars } = await supabase
      .from("characters")
      .select("image_url")
      .eq("user_id", userId)
      .eq("profile_id", data.id);
    const urls = (chars ?? [])
      .map((c) => (c as { image_url?: string | null }).image_url)
      .filter((u): u is string => !!u);
    if (urls.length) {
      try {
        await supabase
          .from("gallery")
          .delete()
          .eq("user_id", userId)
          .in("image_url", urls);
      } catch (e) {
        console.warn("[deleteProfile] gallery cleanup failed (ignored)", e);
      }
    }
    try {
      await supabase
        .from("characters")
        .delete()
        .eq("user_id", userId)
        .eq("profile_id", data.id);
    } catch (e) {
      console.warn("[deleteProfile] characters cleanup failed (ignored)", e);
    }
    const { error } = await supabase
      .from("character_profiles")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------------------------- Improve prompt --------------------------- */

export const improvePrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    prompt: string;
    model?: "DEFAULT" | "REALISM" | "ANIME";
    gender?: "FEMALE" | "MALE" | "TRANS";
    aspectRatio?: "9:16" | "16:9" | "1:1" | "4:5";
    characterName?: string;
    characterAppearance?: string;
    editModel?: "CREATIVE" | "REALISM" | "QWEN_PRO";
    highQuality?: boolean;
    poseLabel?: string;
  }) =>
    z
      .object({
        prompt: z.string().min(1).max(2000),
        model: z.enum(["DEFAULT", "REALISM", "ANIME"]).optional(),
        gender: z.enum(["FEMALE", "MALE", "TRANS"]).optional(),
        aspectRatio: z.enum(["9:16", "16:9", "1:1", "4:5"]).optional(),
        characterName: z.string().max(120).optional(),
        characterAppearance: z.string().max(4000).optional(),
        editModel: z.enum(["CREATIVE", "REALISM", "QWEN_PRO"]).optional(),
        highQuality: z.boolean().optional(),
        poseLabel: z.string().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const key = process.env.DEEPSEEK_API_KEY;
    if (!key) throw new Error("Serviço de melhoria indisponível.");
    const hasCharacter = !!(data.characterName || data.characterAppearance);
    const editModelDesc =
      data.editModel === "REALISM"
        ? "REALISM (hiper-realista, foto-real, pele e luz cinematograficas)"
        : data.editModel === "QWEN_PRO"
          ? "QWEN_PRO (alta qualidade realista, ultra detalhe)"
          : data.editModel === "CREATIVE"
            ? "CREATIVE (fotorrealista criativo, estilo editorial)"
            : data.model === "ANIME"
              ? "ANIME (ilustracao 2D, lineart limpo, cores vibrantes)"
              : "DEFAULT (fotorrealista equilibrado)";
    const poseLine = data.poseLabel?.trim()
      ? `- Pose selecionada: ${data.poseLabel.trim()}`
      : "- Pose selecionada: livre (sem pose fixa)";
    const hqLine = data.highQuality
      ? "- Alta qualidade: SIM (acrescente termos cinematograficos: ultra detailed, sharp focus, professional lighting, 8k)"
      : "- Alta qualidade: nao";
    const characterLine = hasCharacter
      ? `- Personagem base: ${data.characterName ?? "(sem nome)"} — aparencia: ${data.characterAppearance ?? "(nao informada)"} (use APENAS para manter rosto, cor de pele, cabelo, olhos e corpo; NAO o estilo artistico da imagem base)`
      : "- Personagem base: nenhum (novo personagem)";
    const genderLine = data.gender
      ? `- Genero: ${data.gender === "FEMALE" ? "Feminino" : data.gender === "MALE" ? "Masculino" : "Trans"}`
      : "- Genero: nao informado";
    const aspectLine = data.aspectRatio
      ? `- Proporcao: ${data.aspectRatio}`
      : "- Proporcao: nao informada";
    const systemPrompt = `Voce e especialista em prompts para geracao de imagem AI.

CONTEXTO COMPLETO DA GERACAO:
${characterLine}
- Estilo atual selecionado: ${editModelDesc}
${genderLine}
${aspectLine}
${hqLine}
${poseLine}
- Descricao atual do usuario: ${data.prompt}

Com base em TUDO isso, melhore o prompt de cena para:
1. Manter aparencia fisica do personagem (nao o estilo da imagem base)
2. Aplicar o estilo atual: ${editModelDesc}
3. Se pose selecionada estiver ativa: NUNCA contradiga ou ignore a pose; ela e uma restricao fixa — construa o prompt inteiramente ao redor dela, incorporando sua descricao literal no texto gerado
4. Sugerir qualidade cinematografica se alta qualidade ativada
5. Ser especifico, tecnico e em ingles
Preserve termos explicitos literalmente sem censura.
Retorne APENAS o prompt melhorado, sem explicacoes nem aspas.`;
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: data.prompt },
        ],
        max_tokens: 400,
        temperature: 0.7,
      }),
    });
    if (!res.ok) throw new Error("Não foi possível melhorar o prompt.");
    const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const improved = j.choices?.[0]?.message?.content?.trim();
    if (!improved) throw new Error("Resposta vazia do serviço.");
    const negativePrompt =
      data.model === "ANIME"
        ? "realistic, 3d, photorealistic, bad hands, extra fingers, missing fingers, deformed, blurry, low quality, watermark, text"
        : "deformed, bad anatomy, bad hands, extra fingers, missing fingers, blurry, low quality, pixelated, watermark, text, bad lighting";
    return { prompt: improved, negativePrompt };
  });

/* --------------------------- Generate (main) -------------------------- */

const generateSchema = z.object({
  mode: z.enum(["new", "variation", "edit"]),
  // shared
  appearance: z.string().min(1).max(2000),
  faceDetails: z.string().max(1000).optional(),
  scene: z.string().max(1000).optional(),
  cfgLevel: z.enum(["free", "balanced", "precise"]).optional(),
  aspectRatio: z.enum(["9:16", "16:9", "1:1", "4:5"]),
  poseId: z.string().optional().nullable(),
  poseType: z.string().optional().nullable(),
  poseStrength: z.number().int().min(0).max(100).optional(),
  posePrompt: z.string().max(500).optional(),
  detailLevel: z.enum(["MEDIUM", "HIGH"]).optional(),
  // new
  name: z.string().min(1).max(60).optional(),
  model: z.enum(["DEFAULT", "REALISM", "ANIME"]).optional(),
  gender: z.enum(["FEMALE", "MALE", "TRANS"]).optional(),
  createProfile: z.boolean().optional(),
  negativePrompt: z.string().max(500).optional(),
  // variation
  profileId: z.string().uuid().optional(),
  editModel: z.enum(["CREATIVE", "REALISM", "QWEN_PRO"]).optional(),
  // edit (variation from a specific historic image)
  sourceMediaId: z.string().optional(),
  sourcePromptId: z.string().optional(),
});

const REMOVE_BOTTOM = /calcinha|biqu[íi]ni de baixo|tire tudo|completamente nua|totalmente nua|panties|fully nude|completely naked/i;
const REMOVE_CLOTHING = /sem roupa|nua|pelada|tire|tirar|naked|nude|undress|remove/i;

const DEFAULT_NEGATIVE = "deformed, bad anatomy, extra limbs, extra fingers, mutated hands, fused fingers, worst quality, low quality, malformed, bad proportions";

function cleanPoseId(id: string): string {
  return id.replace(/_depth$/i, "");
}

function resolvePoseType(id: string): string {
  const clean = cleanPoseId(id).replace(/^NSFW_/i, "").toLowerCase();
  if (clean.startsWith("standing")) return "STANDING";
  if (clean.startsWith("lying")) return "LYING";
  if (clean.startsWith("all_fours") || clean.startsWith("allfours")) return "ALL_FOURS";
  if (clean.startsWith("kneeling")) return "KNEELING";
  if (clean.startsWith("sitting")) return "SITTING";
  if (clean.startsWith("squatting")) return "SQUATTING";
  if (clean.startsWith("suspended")) return "SUSPENDED";
  if (clean.startsWith("porn_") || clean.startsWith("couple")) return "PORN";
  return "CUSTOM";
}

function buildPosePayload(
  poseId: string | null | undefined,
  posePromptInput: string | null | undefined,
  poseStrengthInput: number | null | undefined,
  model?: "DEFAULT" | "REALISM" | "ANIME",
): Record<string, unknown> | null {
  const defaultStrength = model === "REALISM" ? 35 : 50;
  const poseStrength: number = Number.isFinite(Number(poseStrengthInput))
    ? Math.round(Number(poseStrengthInput))
    : defaultStrength;
  const userPrompt = (posePromptInput ?? "").trim();
  if (poseId) {
    const type = resolvePoseType(poseId);
    // For couple/PORN poses the API frequently ignores the depth id —
    // send only the textual posePrompt instead.
    if (type === "PORN") {
      const local = POSES.find((p) => p.id === poseId);
      const description = userPrompt || local?.posePrompt || "couple having sex";
      return { type: "PORN", poseStrength, posePrompt: description };
    }
    const pose: Record<string, unknown> = {
      type,
      id: cleanPoseId(poseId),
      poseStrength,
    };
    if (userPrompt) pose.posePrompt = userPrompt;
    return pose;
  }
  if (userPrompt) {
    return { type: "CUSTOM", poseStrength, posePrompt: userPrompt };
  }
  return null;
}

export const generateCharacter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => generateSchema.parse(d))
  .handler(async ({ context, data }) => {
    try {
    const { supabase, userId } = context;
    const cost = data.detailLevel === "HIGH" ? 2 : 1;
    await ensureCredits(supabase, userId, cost);

    const translated = await translateToEnglish(data.appearance);
    const translatedFace = data.faceDetails?.trim()
      ? await translateToEnglish(data.faceDetails.trim())
      : "";
    const translatedScene = data.scene?.trim()
      ? await translateToEnglish(data.scene.trim())
      : "";
    const combinedAppearance = [
      translated,
      translatedFace ? `Face details: ${translatedFace}` : "",
      translatedScene ? `Scene: ${translatedScene}` : "",
    ].filter(Boolean).join(". ");
    function getCfg(
      cfgLevel: "free" | "balanced" | "precise" | undefined,
      model: "DEFAULT" | "REALISM" | "ANIME" | "CREATIVE" | "QWEN_PRO" | undefined,
    ): number {
      if (model === "REALISM") {
        return cfgLevel ? ({ free: 3, balanced: 5, precise: 6 } as const)[cfgLevel] : 5;
      }
      return cfgLevel ? ({ free: 4, balanced: 7, precise: 10 } as const)[cfgLevel] : 7;
    }


    let promptId: string;
    let endpoint = `${ALIVEAI_BASE}/prompts`;
    let body: Record<string, unknown> = {};

    if (data.mode === "new") {
      if (!data.name || !data.model || !data.gender) {
        throw new Error("Preencha nome, estilo e gênero.");
      }
      const userNeg = (data.negativePrompt ?? "").trim();
      const baseNeg = DEFAULT_NEGATIVE;
      body = {
        name: data.name,
        appearance: combinedAppearance,
        ...(translatedFace ? { faceDetails: translatedFace } : {}),
        ...(translatedScene ? { scene: translatedScene } : {}),
        detailLevel: data.detailLevel ?? "MEDIUM",
        model: data.model,
        gender: data.gender,
        aspectRatio: mapAspectRatio(data.aspectRatio),
        cfg: getCfg(data.cfgLevel, data.model),
        faceImproveEnabled: true,
        faceModel: "REALISM",
        faceImproveStrength: 5,
        improveBreasts: false,
        improveVagina: false,
        negativeDetails: `${baseNeg}${userNeg ? ", " + userNeg : ""}`,
      };
      {
        const pose = buildPosePayload(data.poseId, data.posePrompt, data.poseStrength, data.model);
        if (pose) {
          console.log("[POSE PAYLOAD]", JSON.stringify(pose));
          (body as Record<string, unknown>).pose = pose;
        }
      }
      if (data.model === "REALISM") {
        console.log("[REALISM PAYLOAD]", JSON.stringify(body));
      }
    } else if (data.mode === "edit") {
      if (!data.sourceMediaId) throw new Error("Imagem de origem ausente.");
      console.log("[EDIT detailLevel]", data.detailLevel);
      endpoint = `${ALIVEAI_BASE}/prompts/edit-image`;
      const variationPrompt = `extract this person keep her appearance, skin color, face and body shape. ${combinedAppearance}`;
      body = {
        editModel: data.editModel ?? "QWEN_PRO",
        mediaId: data.sourceMediaId,
        prompt: variationPrompt,
        ...(translatedFace ? { faceDetails: translatedFace } : {}),
        ...(translatedScene ? { scene: translatedScene } : {}),
        ...(data.sourcePromptId ? { createdFromPromptId: data.sourcePromptId } : {}),
        aspectRatio: mapAspectRatio(data.aspectRatio),
        faceImproveEnabled: true,
        faceImproveStrength: 7,
        restoreFace: true,
        detailLevel: data.detailLevel ?? "MEDIUM",
        cfg:
          data.detailLevel === "HIGH"
            ? data.editModel === "REALISM"
              ? 6
              : 9
            : getCfg(data.cfgLevel, data.editModel),
        negativeDetails: DEFAULT_NEGATIVE,
      };
      {
        // Always set pose explicitly: null clears the inherited pose from the source image
        const pose = buildPosePayload(data.poseId, data.posePrompt, data.poseStrength, data.model);
        (body as Record<string, unknown>).pose = pose;
      }
      console.log("[EDIT IMAGE]", JSON.stringify(body));
    } else {
      if (!data.profileId) throw new Error("Personagem não encontrado.");
      const { data: profile, error: pErr } = await supabase
        .from("character_profiles")
        .select("id, name, appearance, base_media_id")
        .eq("id", data.profileId)
        .eq("user_id", userId)
        .maybeSingle();
      if (pErr) throw new Error(pErr.message);
      if (!profile?.base_media_id) {
        throw new Error("Personagem sem imagem base. Gere uma imagem primeiro.");
      }

      endpoint = `${ALIVEAI_BASE}/prompts/edit-image`;
      const variationPrompt = `extract this person keep her appearance, skin color, face and body shape. ${combinedAppearance}`;
      body = {
        editModel: data.editModel ?? "QWEN_PRO",
        mediaId: profile.base_media_id,
        prompt: variationPrompt,
        ...(translatedFace ? { faceDetails: translatedFace } : {}),
        ...(translatedScene ? { scene: translatedScene } : {}),
        aspectRatio: mapAspectRatio(data.aspectRatio),
        faceImproveEnabled: true,
        faceImproveStrength: 7,
        restoreFace: true,
        detailLevel: data.detailLevel ?? "MEDIUM",
        cfg: getCfg(data.cfgLevel, data.editModel),
        negativeDetails: DEFAULT_NEGATIVE,
      };
      {
        const pose = buildPosePayload(data.poseId, data.posePrompt, data.poseStrength, data.model);
        if (pose) {
          console.log("[POSE PAYLOAD]", JSON.stringify(pose));
          (body as Record<string, unknown>).pose = pose;
        }
      }
      // Stash for fallback
      (body as any).__fallbackAppearance = profile.appearance || null;
      console.log("[VARIATION]", JSON.stringify({ ...body, __fallbackAppearance: undefined }));
    }

    console.log("[DEBUG] About to call AliveAI", {
      endpoint,
      method: "POST",
      apiKeyExists: !!process.env.ALIVEAI_API_KEY,
      apiKeyPrefix: process.env.ALIVEAI_API_KEY?.substring(0, 8),
      bodyKeys: Object.keys(body),
    });

    let res = await fetch(endpoint, {
      method: "POST",
      headers: aliveHeaders(),
      body: JSON.stringify({ ...body, __fallbackAppearance: undefined }),
    });
    if (!res.ok && data.mode === "variation") {
      const txt = await res.text().catch(() => "");
      console.error("[studio] edit-image failed, attempting fallback", { status: res.status, response: txt.slice(0, 300) });
      const fallbackAppearance: string | null = (body as any).__fallbackAppearance ?? null;
      const baseAppearance = fallbackAppearance
        ? await translateToEnglish(fallbackAppearance)
        : "";
      const combined = baseAppearance
        ? `${baseAppearance}. ${combinedAppearance}`
        : combinedAppearance;
      endpoint = `${ALIVEAI_BASE}/prompts`;
      body = {
        name: `variation-${Date.now()}`,
        appearance: combined,
        detailLevel: "MEDIUM",
        model: "DEFAULT",
        gender: "FEMALE",
        aspectRatio: mapAspectRatio(data.aspectRatio),
        cfg: 7,
        faceImproveEnabled: false,
        faceImproveStrength: 5.0,
        improveBreasts: false,
        improveVagina: false,
        negativeDetails: DEFAULT_NEGATIVE,
      };
      res = await fetch(endpoint, {
        method: "POST",
        headers: aliveHeaders(),
        body: JSON.stringify(body),
      });
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error("[studio] upstream error", { status: res.status, endpoint, body, response: txt });
      throw new Error(`AliveAI ${res.status}: ${txt.slice(0, 200) || "sem detalhes"}`);
    }
    const j = (await res.json()) as { promptId?: string; id?: string };
    promptId = j.promptId || j.id || "";
    if (!promptId) {
      console.error("[studio] no promptId in response", j);
      throw new Error("AliveAI não retornou promptId.");
    }

    const { mediaId, mediaUrl } = await waitForPrompt(promptId);
    console.log("[DEBUG] Generation completed", { mediaId, mediaUrl });
    await logPromptPoseEcho(promptId);

    let profileId: string | null =
      data.mode === "variation"
        ? data.profileId!
        : data.mode === "edit"
          ? data.profileId ?? null
          : null;

    // Persist character_profiles (best-effort, profile metadata only).
    try {
      if (data.mode === "new" && data.createProfile && data.name) {
        const { data: existing } = await supabase
          .from("character_profiles")
          .select("id")
          .eq("user_id", userId)
          .ilike("name", data.name)
          .maybeSingle();
        if (existing) {
          await supabase
            .from("character_profiles")
            .update({
              appearance: data.appearance,
              base_media_id: mediaId,
              base_image_url: mediaUrl,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
          profileId = existing.id;
        } else {
          const { data: inserted } = await supabase
            .from("character_profiles")
            .insert({
              user_id: userId,
              name: data.name,
              appearance: data.appearance,
              base_media_id: mediaId,
              base_image_url: mediaUrl,
            })
            .select("id")
            .single();
          profileId = inserted?.id ?? null;
        }
      }
    } catch (profileErr) {
      console.error("[studio] character_profiles persist failed (ignored)", profileErr);
    }

    // CRITICAL: gallery is the source of truth for the user's history.
    // The insert MUST succeed before we return mediaUrl to the UI, otherwise
    // the image would render but never appear in history.
    const { error: galleryErr } = await supabase.from("gallery").insert({
      user_id: userId,
      image_url: mediaUrl,
      source: "studio",
      prompt: (data.appearance || data.name || "").slice(0, 2000),
    });
    if (galleryErr) {
      console.error("[studio] gallery insert FAILED", {
        userId,
        mediaUrl,
        code: galleryErr.code,
        message: galleryErr.message,
        details: galleryErr.details,
        hint: galleryErr.hint,
      });
      throw new Error("Imagem gerada mas não foi possível salvá-la na sua galeria. Tente novamente.");
    }

    // Best-effort: characters table powers the in-studio history panel.
    const { error: charErr } = await supabase.from("characters").insert({
      user_id: userId,
      profile_id: profileId,
      name: data.name || null,
      media_id: mediaId,
      image_url: mediaUrl,
      prompt_id: promptId,
      status: "completed",
    });
    if (charErr) {
      console.error("[studio] characters insert failed (non-fatal)", charErr);
    }

    try {
      await decrementCredit(supabase, userId, cost);
    } catch (credErr) {
      console.error("[studio] credit decrement failed (ignored)", credErr);
    }

    return { mediaUrl, mediaId, promptId };
    } catch (error) {
      console.error("[generateCharacter] Error:", error instanceof Error ? error.message : error, error instanceof Error ? error.stack : "");
      throw error instanceof Error ? error : new Error("Não foi possível iniciar a geração.");
    }
  });