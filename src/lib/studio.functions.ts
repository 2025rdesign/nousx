import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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

async function translateToEnglish(text: string): Promise<string> {
  if (!text.trim()) return text;
  const lovableKey = process.env.LOVABLE_API_KEY;
  if (!lovableKey) return text;
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${lovableKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content:
              "Translate the user's text to natural English. Preserve adult/explicit terms verbatim. Output only the translation, no quotes, no preface.",
          },
          { role: "user", content: text },
        ],
      }),
    });
    if (!res.ok) return text;
    const j = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return j.choices?.[0]?.message?.content?.trim() || text;
  } catch {
    return text;
  }
}

async function pollPrompt(promptId: string, timeoutMs = 120_000): Promise<{ mediaId: string; mediaUrl: string }> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, 2500));
    try {
      const res = await fetch(`${ALIVEAI_BASE}/prompts/${promptId}`, {
        headers: aliveHeaders(),
      });
      if (!res.ok) continue;
      const j = (await res.json()) as AliveStatus;
      const status = (j.status || j.state || "").toLowerCase();
      const mediaId = j.mediaId || j.media_id;
      const mediaUrl = j.mediaUrl || j.media_url || j.url;
      if ((status === "completed" || status === "done" || status === "success") && mediaId && mediaUrl) {
        return { mediaId, mediaUrl };
      }
      if (status === "failed" || status === "error") {
        throw new Error(j.error || j.message || "Não foi possível gerar a imagem.");
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes("Não foi possível")) throw err;
    }
  }
  throw new Error("A geração demorou demais. Tente novamente.");
}

async function ensureCredits(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("credits")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.balance <= 0) throw new Error("Créditos insuficientes.");
  return data.balance as number;
}

async function decrementCredit(supabase: any, userId: string, current: number) {
  const { error } = await supabase
    .from("credits")
    .update({ balance: current - 1, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
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
      .select("id, name, image_url, created_at")
      .eq("is_public", true)
      .not("image_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data || [];
  });

export const listPublicProfiles = createServerFn({ method: "GET" })
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("character_profiles")
      .select("id, name, appearance, base_image_url, created_at")
      .eq("is_public", true)
      .not("base_image_url", "is", null)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data || [];
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

/* ------------------------------- Poses ------------------------------- */

export const listPoses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    try {
      const res = await fetch(`${ALIVEAI_BASE}/poses`, { headers: aliveHeaders() });
      if (!res.ok) return [];
      const j = await res.json();
      const list = Array.isArray(j) ? j : j.poses || j.data || [];
      return list.map((p: any) => ({
        id: p.id || p.poseId || p._id,
        name: p.name || p.title || "Pose",
        thumbnail: p.thumbnail || p.image || p.url || p.preview,
      }));
    } catch {
      return [];
    }
  });

/* --------------------------- Generate (main) -------------------------- */

const generateSchema = z.object({
  mode: z.enum(["new", "variation"]),
  // shared
  appearance: z.string().min(1).max(2000),
  aspectRatio: z.enum(["9:16", "16:9", "1:1", "4:5"]),
  poseId: z.string().optional().nullable(),
  // new
  name: z.string().min(1).max(60).optional(),
  model: z.enum(["DEFAULT", "REALISM", "ANIME"]).optional(),
  gender: z.enum(["FEMALE", "MALE", "TRANS"]).optional(),
  createProfile: z.boolean().optional(),
  blockExplicitContent: z.boolean().optional(),
  // variation
  profileId: z.string().uuid().optional(),
});

const REMOVE_BOTTOM = /calcinha|biqu[íi]ni de baixo|tire tudo|completamente nua|totalmente nua|panties|fully nude|completely naked/i;
const REMOVE_CLOTHING = /sem roupa|nua|pelada|tire|tirar|naked|nude|undress|remove/i;

export const generateCharacter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => generateSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const balance = await ensureCredits(supabase, userId);

    const translated = await translateToEnglish(data.appearance);

    let promptId: string;
    let endpoint = `${ALIVEAI_BASE}/prompts/generate-character`;
    let body: Record<string, unknown> = {};

    if (data.mode === "new") {
      if (!data.name || !data.model || !data.gender) {
        throw new Error("Preencha nome, estilo e gênero.");
      }
      body = {
        model: data.model,
        gender: data.gender,
        prompt: translated,
        aspectRatio: data.aspectRatio,
        poseId: data.poseId || undefined,
        blockExplicitContent: false,
        improveBreasts: false,
        improveVagina: false,
      };
    } else {
      if (!data.profileId) throw new Error("Personagem não encontrado.");
      const { data: profile, error: pErr } = await supabase
        .from("character_profiles")
        .select("id, name, base_media_id")
        .eq("id", data.profileId)
        .eq("user_id", userId)
        .maybeSingle();
      if (pErr) throw new Error(pErr.message);
      if (!profile?.base_media_id) {
        throw new Error("Personagem sem imagem base. Gere uma imagem primeiro.");
      }

      if (REMOVE_BOTTOM.test(data.appearance)) {
        endpoint = `${ALIVEAI_BASE}/prompts/edit-vagina`;
        body = { mediaId: profile.base_media_id, prompt: translated, cfg: 5 };
      } else if (REMOVE_CLOTHING.test(data.appearance)) {
        endpoint = `${ALIVEAI_BASE}/prompts/edit-image`;
        body = {
          mediaId: profile.base_media_id,
          editModel: "CREATIVE",
          prompt: `${translated}, same person, same face, same hair`,
          cfg: 5,
          faceImproveEnabled: true,
          faceImproveStrength: 5.0,
        };
      } else {
        endpoint = `${ALIVEAI_BASE}/prompts/edit-image`;
        body = {
          mediaId: profile.base_media_id,
          editModel: "CREATIVE",
          prompt: `extract this person keep her appearance and body shape. ${translated}`,
          cfg: 5,
          faceImproveEnabled: true,
          faceImproveStrength: 5.0,
        };
      }
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers: aliveHeaders(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error("[studio] upstream error", res.status, txt);
      throw new Error("Não foi possível iniciar a geração. Tente novamente.");
    }
    const j = (await res.json()) as { promptId?: string; id?: string };
    promptId = j.promptId || j.id || "";
    if (!promptId) throw new Error("Não foi possível iniciar a geração.");

    const { mediaId, mediaUrl } = await pollPrompt(promptId);

    let profileId: string | null = data.mode === "variation" ? data.profileId! : null;

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
        const { data: inserted, error: insErr } = await supabase
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
        if (insErr) throw new Error(insErr.message);
        profileId = inserted.id;
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

    await decrementCredit(supabase, userId, balance);

    return { mediaUrl, mediaId, promptId };
  });