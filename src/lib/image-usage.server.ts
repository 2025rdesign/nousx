import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type PlanImageLimit = "plus" | "ultra";

const LIMITS: Record<PlanImageLimit, number> = {
  plus: 50,
  ultra: 120,
};

function nextMonthStart(from: Date = new Date()): Date {
  return new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1, 0, 0, 0, 0));
}

export type UsageCheckResult =
  | { ok: true; count: number; limit: number; resetAt: string }
  | { ok: false; code: "limit_reached"; count: number; limit: number; resetAt: string };

/**
 * Checks the user's monthly chat-image usage and atomically increments
 * it if they are under the limit. Returns ok:false with `resetAt` when
 * the limit is reached. Auto-resets on rollover.
 */
export async function checkAndIncrementImageUsage(
  userId: string,
  plan: PlanImageLimit,
): Promise<UsageCheckResult> {
  const limit = LIMITS[plan];
  const now = new Date();

  const { data: row } = await supabaseAdmin
    .from("image_usage")
    .select("count, reset_at")
    .eq("user_id", userId)
    .maybeSingle();

  let count = row?.count ?? 0;
  let resetAt = row?.reset_at ? new Date(row.reset_at) : nextMonthStart(now);

  if (!row || resetAt.getTime() <= now.getTime()) {
    count = 0;
    resetAt = nextMonthStart(now);
  }

  if (count >= limit) {
    return {
      ok: false,
      code: "limit_reached",
      count,
      limit,
      resetAt: resetAt.toISOString(),
    };
  }

  const nextCount = count + 1;
  await supabaseAdmin
    .from("image_usage")
    .upsert(
      {
        user_id: userId,
        count: nextCount,
        reset_at: resetAt.toISOString(),
        updated_at: now.toISOString(),
      },
      { onConflict: "user_id" },
    );

  return { ok: true, count: nextCount, limit, resetAt: resetAt.toISOString() };
}