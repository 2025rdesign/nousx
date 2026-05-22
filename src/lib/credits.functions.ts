import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getCredits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // Sweep + recompute on read so the balance is always accurate.
    try {
      const { recomputeUserBalance } = await import("./credits.server");
      await recomputeUserBalance(userId);
    } catch {
      /* ignore — fallback to stored balance */
    }
    const { data, error } = await supabase
      .from("credits")
      .select("balance, total_purchased")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);

    const { data: batches } = await supabase
      .from("credit_batches")
      .select("pack_id, credits_remaining, expires_at, created_at")
      .eq("user_id", userId)
      .gt("credits_remaining", 0)
      .order("expires_at", { ascending: true, nullsFirst: false });

    // Soonest expiration that still has credits (NULL = non-expiring last).
    let nextExpiresAt: string | null = null;
    let nonExpiringRemaining = 0;
    for (const b of batches ?? []) {
      if (b.expires_at == null) {
        nonExpiringRemaining += b.credits_remaining ?? 0;
      } else if (!nextExpiresAt) {
        nextExpiresAt = b.expires_at as string;
      }
    }

    return {
      balance: data?.balance ?? 0,
      totalPurchased: data?.total_purchased ?? 0,
      nextExpiresAt,
      nonExpiringRemaining,
    };
  });