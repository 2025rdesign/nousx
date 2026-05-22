import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const MAX_CHARS = 4000;

export const Route = createFileRoute("/api/tts")({
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

        const nowIso = new Date().toISOString();
        const { data: subs } = await supabase
          .from("user_subscriptions")
          .select("id, plan_id, status, expires_at, created_at")
          .eq("user_id", userId)
          .eq("status", "active")
          .gt("expires_at", nowIso)
          .order("created_at", { ascending: false })
          .limit(1);
        if (!subs?.[0]) {
          return json({ error: "subscription_required" }, 403);
        }

        let body: { text?: string };
        try {
          body = await request.json();
        } catch {
          return json({ error: "JSON inválido." }, 400);
        }
        const raw = (body.text ?? "").toString().trim();
        if (!raw) return json({ error: "Texto vazio." }, 400);

        const truncated = raw.length > MAX_CHARS;
        const text = truncated ? raw.slice(0, MAX_CHARS) : raw;

        const apiKey = process.env.XAI_API_KEY;
        if (!apiKey) return json({ error: "TTS indisponível." }, 500);

        const upstream = await fetch("https://api.x.ai/v1/tts", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            text,
            voice_id: "ara",
            language: "pt-BR",
          }),
        });

        if (!upstream.ok) {
          const errText = await upstream.text().catch(() => "");
          console.error("[TTS] xAI error", upstream.status, errText);
          return json({ error: "Falha ao gerar áudio." }, 502);
        }

        const buf = await upstream.arrayBuffer();

        // Save to library (best-effort)
        try {
          const fileName = `${userId}/${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 8)}.mp3`;
          const { error: upErr } = await supabase.storage
            .from("audio-library")
            .upload(fileName, buf, {
              contentType: "audio/mpeg",
              upsert: false,
            });
          if (upErr) {
            console.warn("[TTS] storage upload failed", upErr.message);
          } else {
            const { data: pub } = supabase.storage
              .from("audio-library")
              .getPublicUrl(fileName);
            const wordCount = text.split(/\s+/).filter(Boolean).length;
            const estDuration = Math.max(1, Math.round(wordCount / 2.5));
            await supabase.from("audio_library").insert({
              user_id: userId,
              audio_url: pub.publicUrl,
              text_content: text,
              duration_seconds: estDuration,
              voice_id: "ara",
            });
          }
        } catch (saveErr) {
          console.warn("[TTS] save library failed", saveErr);
        }

        return new Response(buf, {
          status: 200,
          headers: {
            "Content-Type": "audio/mpeg",
            "Cache-Control": "no-store",
            "X-Truncated": truncated ? "1" : "0",
          },
        });
      },
    },
  },
});