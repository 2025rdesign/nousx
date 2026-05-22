import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const Route = createFileRoute("/api/voice-session")({
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
        if (userErr || !userData.user) return json({ error: "Sessão inválida." }, 401);
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
        const sub = subs?.[0];
        if (!sub || sub.plan_id !== "ultra") {
          return json({ error: "ultra_required" }, 403);
        }

        const apiKey = process.env.XAI_API_KEY;
        if (!apiKey) return json({ error: "Modo de voz indisponível." }, 500);

        try {
          const upstream = await fetch("https://api.x.ai/v1/realtime/ephemeral-tokens", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ model: "grok-voice-latest", ttl: 600 }),
          });
          if (!upstream.ok) {
            const errText = await upstream.text().catch(() => "");
            console.error("[VOICE] xAI token error", upstream.status, errText);
            return json({ error: "Falha ao iniciar modo de voz." }, 502);
          }
          const data = (await upstream.json()) as {
            token?: string;
            client_secret?: { value?: string; expires_at?: number };
            expires_at?: number;
          };
          const ephemeral =
            data.token ?? data.client_secret?.value ?? null;
          if (!ephemeral) {
            console.error("[VOICE] sem token na resposta xAI", data);
            return json({ error: "Token inválido." }, 502);
          }
          return json({
            token: ephemeral,
            model: "grok-voice-latest",
            expiresAt: data.expires_at ?? data.client_secret?.expires_at ?? null,
          });
        } catch (err) {
          console.error("[VOICE] exception", err);
          return json({ error: "Falha ao iniciar modo de voz." }, 502);
        }
      },
    },
  },
});