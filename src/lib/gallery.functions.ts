import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PAGE_SIZE = 20;

const listSchema = z.object({
  filter: z.enum(["all", "chat", "studio", "audio"]).default("all"),
  page: z.number().int().min(0).default(0),
});

export type GalleryItem =
  | {
      kind: "image";
      id: string;
      image_url: string;
      source: "chat" | "studio";
      prompt: string | null;
      created_at: string;
    }
  | {
      kind: "audio";
      id: string;
      audio_url: string | null;
      text_content: string | null;
      duration_seconds: number | null;
      voice_id: string | null;
      created_at: string;
    };

export const listGallery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const from = data.page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    if (data.filter === "audio") {
      const { data: rows, error } = await supabase
        .from("audio_library")
        .select("id, audio_url, text_content, duration_seconds, voice_id, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(from, to);
      if (error) throw new Error(error.message);
      const items: GalleryItem[] = (rows ?? []).map((r) => ({
        kind: "audio" as const,
        id: r.id,
        audio_url: r.audio_url,
        text_content: r.text_content,
        duration_seconds: r.duration_seconds,
        voice_id: r.voice_id,
        created_at: r.created_at,
      }));
      return { items, hasMore: items.length === PAGE_SIZE };
    }

    let query = supabase
      .from("gallery")
      .select("id, image_url, source, prompt, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (data.filter === "chat") query = query.eq("source", "chat");
    if (data.filter === "studio") query = query.eq("source", "studio");

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    const items: GalleryItem[] = (rows ?? []).map((r) => ({
      kind: "image" as const,
      id: r.id,
      image_url: r.image_url,
      source: (r.source === "chat" ? "chat" : "studio") as "chat" | "studio",
      prompt: r.prompt,
      created_at: r.created_at,
    }));
    return { items, hasMore: items.length === PAGE_SIZE };
  });

export const deleteGalleryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ kind: z.enum(["image", "audio"]), id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const table = data.kind === "image" ? "gallery" : "audio_library";
    const { error } = await supabase
      .from(table)
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });