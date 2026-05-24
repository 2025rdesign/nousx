import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Called right after signup with the referral code captured from the URL.
 * Links the new user to their referrer (idempotent — only sets if not yet set).
 */
export const attachReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        code: z
          .string()
          .min(4)
          .max(16)
          .regex(/^[A-Za-z0-9]+$/),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const code = data.code.toUpperCase();

    // Find referrer
    const { data: referrer } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("referral_code", code)
      .maybeSingle();
    if (!referrer) return { ok: false, reason: "invalid_code" as const };
    if (referrer.id === userId)
      return { ok: false, reason: "self_referral" as const };

    // Check current profile state
    const { data: me } = await supabaseAdmin
      .from("profiles")
      .select("id, referred_by")
      .eq("id", userId)
      .maybeSingle();
    if (!me) return { ok: false, reason: "no_profile" as const };
    if (me.referred_by) return { ok: false, reason: "already_referred" as const };

    // Don't allow if a referral row already exists for this user
    const { data: existing } = await supabaseAdmin
      .from("referrals")
      .select("id")
      .eq("referred_id", userId)
      .maybeSingle();
    if (existing) return { ok: false, reason: "already_referred" as const };

    await supabaseAdmin
      .from("profiles")
      .update({ referred_by: referrer.id })
      .eq("id", userId);

    await supabaseAdmin.from("referrals").insert({
      referrer_id: referrer.id,
      referred_id: userId,
      referral_code: code,
    });

    return { ok: true as const };
  });

export const getMyReferralInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    const { data: profile } = await supabase
      .from("profiles")
      .select("referral_code")
      .eq("id", userId)
      .maybeSingle();

    const { data: refs } = await supabase
      .from("referrals")
      .select("credits_awarded, first_purchase_rewarded")
      .eq("referrer_id", userId);

    const totalReferred = refs?.length ?? 0;
    const creditsEarned = (refs ?? []).reduce(
      (a, r) => a + (r.credits_awarded ?? 0),
      0,
    );

    return {
      code: profile?.referral_code ?? null,
      totalReferred,
      creditsEarned,
    };
  });