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
  const maxAttempts = 48; // 48 * 2.5s = 120s (2 min)
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
      .select("id, name, image_url, media_id, profile_id, is_public, status, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (data?.profileId) q = q.eq("profile_id", data.profileId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows || [];
  });

export const listPublicCharacters = createServerFn({ method: "GET" })
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("characters")
      .select("id, name, image_url, created_at, user_id")
      .eq("is_public", true)
      .not("image_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return await attachCreator(supabaseAdmin, dedupeById(data || []));
  });

export const listPublicProfiles = createServerFn({ method: "GET" })
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("character_profiles")
      .select("id, name, appearance, base_image_url, created_at, user_id")
      .eq("is_public", true)
      .not("base_image_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return await attachCreator(supabaseAdmin, dedupeById(data || []));
  });

function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

async function attachCreator<T extends { user_id?: string | null }>(
  admin: any,
  rows: T[],
): Promise<Array<T & { creator_name: string | null }>> {
  const ids = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean))) as string[];
  if (ids.length === 0) {
    return rows.map((r) => ({ ...r, creator_name: null }));
  }
  const { data } = await admin
    .from("profiles")
    .select("id, name")
    .in("id", ids);
  const map = new Map<string, string | null>(
    (data || []).map((p: any) => [p.id, p.name ?? null]),
  );
  return rows.map((r) => ({
    ...r,
    creator_name: r.user_id ? map.get(r.user_id) ?? null : null,
  }));
}

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

/* -------------------------- Improve prompt --------------------------- */

export const improvePrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    prompt: string;
    model?: "DEFAULT" | "REALISM" | "ANIME" | "TEMPORARY" | "ANIMA";
    characterName?: string;
    characterAppearance?: string;
  }) =>
    z
      .object({
        prompt: z.string().min(1).max(2000),
        model: z.enum(["DEFAULT", "REALISM", "ANIME", "TEMPORARY", "ANIMA"]).optional(),
        characterName: z.string().max(120).optional(),
        characterAppearance: z.string().max(4000).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const key = process.env.DEEPSEEK_API_KEY;
    if (!key) throw new Error("Serviço de melhoria indisponível.");
    const hasCharacter = !!(data.characterName || data.characterAppearance);
    const systemPrompt = hasCharacter
      ? `Você é especialista em prompts para geração de imagens AI.
O usuário tem um personagem salvo com as seguintes características:
Nome: ${data.characterName ?? "(sem nome)"}
Aparência base: ${data.characterAppearance ?? "(não informada)"}

O usuário quer gerar uma VARIAÇÃO desse personagem com esta cena:
${data.prompt}

Melhore o prompt da cena mantendo consistência com o personagem.
Não descreva o rosto ou aparência física (já está salvo no sistema).
Foque em: pose, cenário, roupa, iluminação, ângulo, atmosfera.
Preserve termos explícitos literalmente sem censura.
Retorne APENAS o prompt melhorado em inglês, sem explicações.`
      : data.model === "ANIME"
        ? "Você é especialista em prompts para geração de imagens anime com IA. Melhore o prompt do usuário mantendo a intenção dele, mas tornando-o mais detalhado e técnico para gerar anime de alta qualidade. Adicione termos como: anime style, detailed eyes, vibrant colors, clean lineart, studio quality, 2D illustration. Evite termos realistas ou fotográficos. Preserve termos explícitos sem censura. Retorne APENAS o prompt melhorado em inglês, sem explicações nem aspas."
        : "You are an expert at writing prompts for AI image generation (photorealistic / HD). Improve the user's prompt keeping their intent, making it more detailed, technical and precise (appearance, lighting, composition, camera, style). Preserve explicit terms literally without censorship. Return ONLY the improved prompt in English, no explanations, no quotes.";
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
  mode: z.enum(["new", "variation"]),
  // shared
  appearance: z.string().min(1).max(2000),
  aspectRatio: z.enum(["9:16", "16:9", "1:1", "4:5"]),
  poseId: z.string().optional().nullable(),
  poseType: z.string().optional().nullable(),
  poseStrength: z.number().int().min(0).max(100).optional(),
  posePrompt: z.string().max(500).optional(),
  detailLevel: z.enum(["MEDIUM", "HIGH"]).optional(),
  // new
  name: z.string().min(1).max(60).optional(),
  model: z.enum(["DEFAULT", "REALISM", "ANIME", "TEMPORARY", "ANIMA"]).optional(),
  gender: z.enum(["FEMALE", "MALE", "TRANS"]).optional(),
  createProfile: z.boolean().optional(),
  negativePrompt: z.string().max(500).optional(),
  creativity: z.enum(["low", "medium", "high"]).optional(),
  // variation
  profileId: z.string().uuid().optional(),
  editModel: z.enum(["CREATIVE", "REALISM", "QWEN_PRO"]).optional(),
});

const REMOVE_BOTTOM = /calcinha|biqu[íi]ni de baixo|tire tudo|completamente nua|totalmente nua|panties|fully nude|completely naked/i;
const REMOVE_CLOTHING = /sem roupa|nua|pelada|tire|tirar|naked|nude|undress|remove/i;

function cleanPoseId(id: string): string {
  return id.replace(/_depth$/i, "");
}

function resolvePoseType(id: string): string {
  const clean = cleanPoseId(id).replace(/^NSFW_/i, "").toLowerCase();
  if (clean.startsWith("standing")) return "STANDING";
  if (clean.startsWith("lying")) return "LYING";
  if (clean.startsWith("all_fours")) return "ALLFOURS";
  if (clean.startsWith("kneeling")) return "KNEELING";
  if (clean.startsWith("sitting")) return "SITTING";
  if (clean.startsWith("squatting")) return "SQUATTING";
  if (clean.startsWith("suspended")) return "SUSPENDED";
  if (clean.startsWith("porn_") || clean.startsWith("couple")) return "PORN";
  return "CUSTOM";
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

    let promptId: string;
    let endpoint = `${ALIVEAI_BASE}/prompts`;
    let body: Record<string, unknown> = {};

    if (data.mode === "new") {
      if (!data.name || !data.model || !data.gender) {
        throw new Error("Preencha nome, estilo e gênero.");
      }
      const cfgMap = { low: 4, medium: 7, high: 10 } as const;
      const userNeg = (data.negativePrompt ?? "").trim();
      const baseNeg = "deformed, bad anatomy, extra fingers, missing fingers, bad hands, blurry, low quality, watermark, text";
      body = {
        name: data.name,
        appearance: translated,
        detailLevel: data.detailLevel ?? "MEDIUM",
        model: data.model,
        gender: data.gender,
        aspectRatio: mapAspectRatio(data.aspectRatio),
        cfg: cfgMap[data.creativity ?? "medium"],
        faceImproveEnabled: true,
        faceModel: "REALISM",
        faceImproveStrength: 5,
        improveBreasts: false,
        improveVagina: false,
        negativeDetails: `${baseNeg}${userNeg ? ", " + userNeg : ""}`,
      };
      {
        const strength = Number.isFinite(Number(data.poseStrength))
          ? Math.round(Number(data.poseStrength))
          : 50;
        const userPrompt = (data.posePrompt ?? "").trim();
        let pose: Record<string, unknown> | null = null;
        if (data.poseId) {
          pose = {
            type: resolvePoseType(data.poseId),
            id: cleanPoseId(data.poseId),
            poseStrength: strength,
          };
          if (userPrompt) pose.posePrompt = userPrompt;
        } else if (userPrompt) {
          pose = { type: "CUSTOM", poseStrength: strength, posePrompt: userPrompt };
        }
        if (pose) {
          console.log("[POSE]", JSON.stringify(pose));
          (body as Record<string, unknown>).pose = pose;
        }
      }
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
      const variationPrompt = `extract this person keep her appearance, skin color, face and body shape. ${translated}`;
      body = {
        editModel: data.editModel ?? "CREATIVE",
        mediaId: profile.base_media_id,
        prompt: variationPrompt,
        aspectRatio: mapAspectRatio(data.aspectRatio),
        faceImproveEnabled: true,
        faceImproveStrength: 7,
        restoreFace: true,
        cfg: 5,
      };
      {
        const strength = Number.isFinite(Number(data.poseStrength))
          ? Math.round(Number(data.poseStrength))
          : 50;
        const userPrompt = (data.posePrompt ?? "").trim();
        let pose: Record<string, unknown> | null = null;
        if (data.poseId) {
          pose = {
            type: resolvePoseType(data.poseId),
            id: cleanPoseId(data.poseId),
            poseStrength: strength,
          };
          if (userPrompt) pose.posePrompt = userPrompt;
        } else if (userPrompt) {
          pose = { type: "CUSTOM", poseStrength: strength, posePrompt: userPrompt };
        }
        if (pose) {
          console.log("[POSE]", JSON.stringify(pose));
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
        ? `${baseAppearance}. ${translated}`
        : translated;
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
        negativeDetails: "deformed, bad anatomy, extra fingers, missing fingers, bad hands, blurry, low quality, watermark, text",
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

    const { mediaId, mediaUrl } = await pollPrompt(promptId);
    console.log("[DEBUG] Poll completed", { mediaId, mediaUrl });

    let profileId: string | null = data.mode === "variation" ? data.profileId! : null;

    // Persistência: não deve falhar a geração se houver erro.
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

      await supabase.from("characters").insert({
        user_id: userId,
        profile_id: profileId,
        name: data.name || null,
        media_id: mediaId,
        image_url: mediaUrl,
        prompt_id: promptId,
        status: "completed",
      });
    } catch (persistErr) {
      console.error("[studio] persistence failed (ignored)", persistErr);
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